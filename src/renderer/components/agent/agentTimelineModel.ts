import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAskUserRequest, AgentExitPlanRequest, AgentPermissionMode, BrevynAgentTimelineRecord } from "@/types/domain";

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: unknown;
  isError: boolean;
}

export interface WebCitationLink {
  title: string;
  url: string;
}

export interface AgentTodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface RunSummary {
  runId: string;
  label: string;
  running: boolean;
  status: "running" | "completed" | "stopped" | "failed" | "interrupted";
  permissionMode?: AgentPermissionMode;
  detail?: string;
}

export interface ContextUsage {
  inputTokens: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  contextWindow?: number;
}

export type ProcessEvent =
  | { kind: "thinking"; id: string; text: string; sourceIndex?: number }
  | { kind: "narration"; id: string; text: string; sourceIndex?: number }
  | { kind: "tool_use"; id: string; tool: ToolUseBlock; result?: ToolResultBlock; approvalDecision?: "allow" | "deny"; sourceIndex?: number };

export type AgentTimelineRecord =
  | BrevynAgentTimelineRecord
  | { kind: "stream"; id: string; text: string }
  | { kind: "thinking_stream"; id: string; text: string }
  | { kind: "process_placeholder"; id: string }
  | { kind: "compact_placeholder"; id: string };

export interface TimelineRenderMeta {
  byIndex: Map<number, {
    attachProcess?: boolean;
    processHeader?: boolean;
    processNarration?: boolean;
    processEvents?: ProcessEvent[];
    processUserIndex?: number;
    assistantCopyContent?: string;
  }>;
  hasLiveAssistantText: boolean;
}

export interface AssistantTurnGroup {
  type: "assistant-turn";
  assistantMessages: SDKMessage[];
  turnRecords: Array<{ record: AgentTimelineRecord; index: number }>;
  model?: string;
  createdAt?: number;
}

export type AgentMessageGroup =
  | { type: "user"; record: SDKMessage; index: number }
  | { type: "system"; record: SDKMessage; index: number }
  | { type: "runtime"; record: Extract<BrevynAgentTimelineRecord, { kind: "runtime" }>; index: number }
  | AssistantTurnGroup;

const PROMPT_TOO_LONG_PATTERNS = [
  "prompt is too long",
  "prompt_too_long",
  "input is too long",
  "context_length_exceeded",
  "maximum context length",
  "token limit",
  "exceeds the model",
] as const;

export function groupIntoTurns(records: AgentTimelineRecord[], sessionModelId?: string): AgentMessageGroup[] {
  const groups: AgentMessageGroup[] = [];
  let currentTurn: AssistantTurnGroup | null = null;

  const flushTurn = (): void => {
    if (currentTurn && currentTurn.assistantMessages.length > 0) {
      groups.push(currentTurn);
    }
    currentTurn = null;
  };

  records.forEach((record, index) => {
    if (isRuntimeRecord(record)) {
      if (currentTurn) currentTurn.turnRecords.push({ record, index });
      else groups.push({ type: "runtime", record, index });
      return;
    }

    if (isStreamRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) {
      if (!currentTurn) {
        currentTurn = {
          type: "assistant-turn",
          assistantMessages: [],
          turnRecords: [],
          model: sessionModelId || "",
        };
      }
      if (currentTurn) currentTurn.turnRecords.push({ record, index });
      return;
    }

    const message = record as SDKMessage;
    if (message.type === "user") {
      if (isUserInputMessage(message)) {
        flushTurn();
        groups.push({ type: "user", record: message, index });
      } else if (currentTurn) {
        currentTurn.turnRecords.push({ record: message, index });
      }
      return;
    }

    if (message.type === "assistant") {
      if ((message as { isReplay?: unknown }).isReplay === true) return;
      if (!currentTurn) {
        currentTurn = {
          type: "assistant-turn",
          assistantMessages: [message],
          turnRecords: [{ record: message, index }],
          model: stringValue(recordObject(messageContentEnvelope(message)).model ?? (message as { _channelModelId?: unknown })._channelModelId, sessionModelId || ""),
          createdAt: recordCreatedAtMs(message),
        };
      } else {
        currentTurn.assistantMessages.push(message);
        currentTurn.turnRecords.push({ record: message, index });
      }
      return;
    }

    if (message.type === "system") {
      const subtype = stringValue((message as { subtype?: unknown }).subtype, "");
      if (subtype === "compact_boundary" || subtype === "compacting") {
        flushTurn();
        groups.push({ type: "system", record: message, index });
      } else if (currentTurn) {
        currentTurn.turnRecords.push({ record: message, index });
      }
      return;
    }

    if ((message as { type?: unknown }).type === "prompt_suggestion") return;
    if (currentTurn) currentTurn.turnRecords.push({ record: message, index });
  });

  flushTurn();
  return mergeAdjacentSameModelTurns(groups);
}

export function buildTimelineRenderMeta(records: AgentTimelineRecord[]): TimelineRenderMeta {
  const byIndex = new Map<number, TimelineRenderMeta["byIndex"] extends Map<number, infer Value> ? Value : never>();
  const groups = groupIntoTurns(records);
  let hasLiveAssistantText = false;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const userGroup = groups[groupIndex];
    if (userGroup?.type !== "user" || isCompactCommandMessage(userGroup.record)) continue;

    const bounds = turnBoundsForUserIndex(records, userGroup.index);
    const startIndex = userGroup.index + 1;
    const endIndex = bounds.resultIndex ?? nextUserInputIndex(records, userGroup.index) ?? records.length;
    const assistantTurn = groups
      .slice(groupIndex + 1)
      .find((group) => group.type === "assistant-turn" || group.type === "user");
    const turnItems = assistantTurn?.type === "assistant-turn"
      ? assistantTurn.turnRecords
      : records.slice(startIndex, endIndex).map((record, offset) => ({ record, index: startIndex + offset }));
    if (turnItems.length === 0) continue;

    const hasResultBoundary = bounds.resultIndex !== undefined;
    const narrationByIndex = new Map<number, boolean>();
    const finalOutputByIndex = new Map<number, boolean>();
    const lastTextAssistantIndex = hasResultBoundary ? lastTextAssistantItemIndex(turnItems) : -1;

    let hasFutureToolUse = false;
    for (let itemIndex = turnItems.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = turnItems[itemIndex];
      if (!item) continue;
      const { record, index } = item;
      const assistant = !record || isRuntimeRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)
        ? null
        : record as SDKMessage;
      const blocks = assistant && !isStreamRecord(record) && assistant.type === "assistant" ? assistantBlocks(assistant) : [];
      const hasToolUse = blocks.some((block) => block.type === "tool_use" && block.name !== "TodoWrite" && !isHostedToolUse(block));
      const hasText = isStreamRecord(record)
        ? record.text.trim().length > 0
        : Boolean(assistant && assistant.type === "assistant" && assistantText(assistant).trim());
      const narration = Boolean(hasText && (!hasResultBoundary || index !== lastTextAssistantIndex || hasToolUse || hasFutureToolUse));
      narrationByIndex.set(index, narration);
      finalOutputByIndex.set(index, hasResultBoundary && isFinalAssistantOutputRecord(records[index], narration));
      if (hasToolUse) hasFutureToolUse = true;
    }

    const finalOutputIndexes = [...finalOutputByIndex.entries()].flatMap(([index, isFinal]) => isFinal ? [index] : []);
    if (groupIndex === latestUserGroupIndex(groups) && finalOutputIndexes.length > 0) {
      hasLiveAssistantText = true;
    }
    const processEvents = processEventsFromItems(turnItems, narrationByIndex);
    const processEventsByIndex = processEventsBySourceIndex(processEvents);
    const placeholderIndex = turnItems.find((item) => isProcessPlaceholderRecord(item.record))?.index;
    const firstProcessIndex = firstProcessItemIndex(turnItems, narrationByIndex);
    const firstProcessEventIndex = [...processEventsByIndex.keys()].sort((left, right) => left - right)[0];
    const anchorIndex = firstProcessEventIndex
      ?? firstProcessIndex
      ?? placeholderIndex
      ?? finalOutputIndexes[0]
      ?? bounds.resultIndex;

    for (const { index } of turnItems) {
      if (narrationByIndex.get(index)) {
        byIndex.set(index, { ...byIndex.get(index), processNarration: true });
      }
    }

    for (const index of finalOutputIndexes) {
      byIndex.set(index, {
        ...byIndex.get(index),
        assistantCopyContent: assistantCopyContentForTurnItems(turnItems, index, narrationByIndex, hasResultBoundary),
      });
    }

    if (anchorIndex !== undefined && (processEvents.length > 0 || isProcessPlaceholderRecord(records[anchorIndex]) || bounds.resultIndex === anchorIndex)) {
      byIndex.set(anchorIndex, {
        ...byIndex.get(anchorIndex),
        attachProcess: true,
        processHeader: true,
        processEvents: processEventsByIndex.get(anchorIndex) || [],
        processUserIndex: userGroup.index,
      });
    }
    for (const [index, events] of processEventsByIndex) {
      if (index === anchorIndex) continue;
      byIndex.set(index, {
        ...byIndex.get(index),
        attachProcess: true,
        processHeader: false,
        processEvents: events,
        processUserIndex: userGroup.index,
      });
    }
  }

  return { byIndex, hasLiveAssistantText };
}

function latestUserGroupIndex(groups: AgentMessageGroup[]): number {
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (groups[index]?.type === "user") return index;
  }
  return -1;
}

function firstProcessItemIndex(
  items: Array<{ record: AgentTimelineRecord; index: number }>,
  narrationByIndex: Map<number, boolean>,
): number | undefined {
  for (const { record, index } of items) {
    if (!record || isRuntimeRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if (isThinkingStreamRecord(record) && record.text.trim()) return index;
    if (narrationByIndex.get(index)) return index;
    if ((record as SDKMessage).type !== "assistant") continue;
    const message = record as SDKMessage;
    if (thinkingTextForMessage(message)) return index;
    if (assistantBlocks(message).some((block) => block.type === "tool_use" && block.name !== "TodoWrite")) return index;
  }
  return undefined;
}

function processEventsFromItems(
  items: Array<{ record: AgentTimelineRecord; index: number }>,
  narrationByIndex: Map<number, boolean>,
): ProcessEvent[] {
  const events: ProcessEvent[] = [];
  const lastTextEventByKind = new Map<"thinking" | "narration", string>();
  const toolById = new Map<string, Extract<ProcessEvent, { kind: "tool_use" }>>();
  const approvalByToolUseId = approvalDecisionByToolUseId(items);
  const webCitationLinks = webCitationLinksFromItems(items);
  let thinkingIndex = 0;

  for (const { record, index } of items) {
    if (!record || isRuntimeRecord(record)) continue;
    if (isThinkingStreamRecord(record)) {
      const text = record.text.trim();
      if (text) {
        thinkingIndex += pushUniqueTextProcessEvent(events, lastTextEventByKind, {
          kind: "thinking",
          id: `thinking-stream-${record.id}-${thinkingIndex}`,
          text,
          sourceIndex: index,
        });
      }
      continue;
    }
    if ((record as SDKMessage).type === "assistant") {
      const message = record as SDKMessage;
      const blocks = assistantBlocks(message);
      const thinkingText = thinkingTextForMessage(message);
      if (thinkingText) {
        thinkingIndex += pushUniqueTextProcessEvent(events, lastTextEventByKind, {
          kind: "thinking",
          id: `thinking-${index}-${thinkingIndex}`,
          text: thinkingText,
          sourceIndex: index,
        });
      }
      if (narrationByIndex.get(index)) {
        const narrationText = assistantText(message).trim();
        if (narrationText) {
          thinkingIndex += pushUniqueTextProcessEvent(events, lastTextEventByKind, {
            kind: "narration",
            id: `narration-${index}-${thinkingIndex}`,
            text: narrationText,
            sourceIndex: index,
          });
        }
      }
      for (const block of blocks) {
        if (block.type !== "tool_use" || block.name === "TodoWrite") continue;
        const syntheticResult = hostedToolResult(block, webCitationLinks);
        const event: Extract<ProcessEvent, { kind: "tool_use" }> = {
          kind: "tool_use",
          id: `tool-use-${block.id}`,
          tool: block,
          result: syntheticResult,
          approvalDecision: approvalByToolUseId.get(block.id),
          sourceIndex: index,
        };
        toolById.set(block.id, event);
        events.push(event);
      }
      continue;
    }
    if ((record as SDKMessage).type === "user") {
      for (const result of toolResultBlocks(record as SDKMessage)) {
        const event = toolById.get(result.toolUseId);
        if (event) event.result = result;
      }
    }
  }

  return events;
}

function processEventsBySourceIndex(events: ProcessEvent[]): Map<number, ProcessEvent[]> {
  const byIndex = new Map<number, ProcessEvent[]>();
  let activeToolIndex: number | undefined;
  for (const event of events) {
    if (typeof event.sourceIndex !== "number") continue;
    if (event.kind !== "tool_use") {
      activeToolIndex = undefined;
      const list = byIndex.get(event.sourceIndex) || [];
      list.push(event);
      byIndex.set(event.sourceIndex, list);
      continue;
    }
    activeToolIndex ??= event.sourceIndex;
    const list = byIndex.get(activeToolIndex) || [];
    list.push(event);
    byIndex.set(activeToolIndex, list);
  }
  return byIndex;
}

function pushUniqueTextProcessEvent(
  events: ProcessEvent[],
  lastByKind: Map<"thinking" | "narration", string>,
  event: Extract<ProcessEvent, { kind: "thinking" | "narration" }>,
): 0 | 1 {
  const key = normalizeProcessText(event.text);
  if (!key) return 0;
  if (lastByKind.get(event.kind) === key) return 0;
  lastByKind.set(event.kind, key);
  events.push(event);
  return 1;
}

function normalizeProcessText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function approvalDecisionByToolUseId(
  items: Array<{ record: AgentTimelineRecord; index: number }>,
): Map<string, "allow" | "deny"> {
  const requestToolUseIds = new Map<string, string>();
  const decisions = new Map<string, "allow" | "deny">();
  for (const { record } of items) {
    if (!isRuntimeRecord(record)) continue;
    if (record.event.type === "approval_requested") {
      requestToolUseIds.set(record.event.request.requestId, record.event.request.toolUseId);
    } else if (record.event.type === "approval_resolved") {
      decisions.set(record.event.requestId, record.event.decision);
    }
  }

  const approvalByToolUseId = new Map<string, "allow" | "deny">();
  for (const [requestId, decision] of decisions) {
    const toolUseId = requestToolUseIds.get(requestId);
    if (toolUseId) approvalByToolUseId.set(toolUseId, decision);
  }
  return approvalByToolUseId;
}

function hostedToolResult(block: ToolUseBlock, links: WebCitationLink[] = []): ToolResultBlock | undefined {
  const input = recordObject(block.input);
  if (input.hosted !== true) return undefined;
  return {
    type: "tool_result",
    toolUseId: block.id,
    content: {
      status: stringValue(input.status, "completed"),
      providerStatus: stringValue(input.providerStatus, ""),
      query: webSearchQueryFromInput(input),
      hosted: true,
      links,
    },
    isError: false,
  };
}

function isHostedToolUse(block: ToolUseBlock): boolean {
  return recordObject(block.input).hosted === true;
}

function lastTextAssistantItemIndex(items: Array<{ record: AgentTimelineRecord; index: number }>): number {
  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const item = items[itemIndex];
    if (!item) continue;
    const { record, index } = item;
    if (!record || isRuntimeRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if (isStreamRecord(record)) {
      if (record.text.trim()) return index;
      continue;
    }
    if ((record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim()) return index;
  }
  return -1;
}

function isFinalAssistantOutputRecord(record: AgentTimelineRecord | undefined, processNarration: boolean): boolean {
  if (!record || isRuntimeRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
  if (isStreamRecord(record)) return record.text.trim().length > 0;
  return (record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim().length > 0 && !processNarration;
}

function assistantCopyContentForTurnItems(
  items: Array<{ record: AgentTimelineRecord; index: number }>,
  finalIndex: number,
  narrationByIndex: Map<number, boolean>,
  hasResultBoundary: boolean,
): string | undefined {
  if (!hasResultBoundary) return undefined;
  const finalItemPosition = items.findIndex((item) => item.index === finalIndex);
  if (finalItemPosition < 0) return undefined;
  const finalItem = items[finalItemPosition];
  if (!finalItem || !isFinalAssistantOutputRecord(finalItem.record, Boolean(narrationByIndex.get(finalIndex)))) return undefined;
  for (let itemIndex = finalItemPosition + 1; itemIndex < items.length; itemIndex += 1) {
    const { record, index } = items[itemIndex] ?? {};
    if (!record || isRuntimeRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if (isStreamRecord(record) && record.text.trim()) return undefined;
    if ((record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim() && !narrationByIndex.get(index)) return undefined;
  }
  const parts: string[] = [];
  for (const { record: candidate, index: candidateIndex } of items) {
    if (!candidate || isRuntimeRecord(candidate) || isThinkingStreamRecord(candidate) || isProcessPlaceholderRecord(candidate) || isCompactPlaceholderRecord(candidate)) continue;
    if (isStreamRecord(candidate) && candidate.text.trim()) {
      parts.push(candidate.text.trim());
      continue;
    }
    if ((candidate as SDKMessage).type === "assistant") {
      if (narrationByIndex.get(candidateIndex)) continue;
      const text = assistantText(candidate as SDKMessage).trim();
      if (text) parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function latestTurnBounds(records: AgentTimelineRecord[]): { user: SDKMessage; userIndex: number; result?: SDKMessage; resultIndex?: number } | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamRecord(record) || isThinkingStreamRecord(record)) continue;
    if ((record as SDKMessage).type !== "user" || toolResultBlocks(record as SDKMessage).length > 0) continue;
    const resultIndex = records.findIndex((candidate, candidateIndex) => (
      candidateIndex > index
        && !isRuntimeRecord(candidate)
        && !isStreamRecord(candidate)
        && !isThinkingStreamRecord(candidate)
        && (candidate as SDKMessage).type === "result"
    ));
    const result = resultIndex >= 0 ? records[resultIndex] as SDKMessage : undefined;
    return { user: record as SDKMessage, userIndex: index, result, resultIndex: resultIndex >= 0 ? resultIndex : undefined };
  }
  return null;
}

function turnBoundsForUserIndex(records: AgentTimelineRecord[], userIndex: number): { result?: SDKMessage; resultIndex?: number } {
  const nextUserIndex = nextUserInputIndex(records, userIndex);
  const searchEnd = nextUserIndex ?? records.length;
  for (let index = userIndex + 1; index < searchEnd; index += 1) {
    const candidate = records[index];
    if (!candidate || isRuntimeRecord(candidate) || isStreamRecord(candidate) || isThinkingStreamRecord(candidate)) continue;
    if ((candidate as SDKMessage).type === "result") {
      return { result: candidate as SDKMessage, resultIndex: index };
    }
  }
  return {};
}

function nextUserInputIndex(records: AgentTimelineRecord[], afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < records.length; index += 1) {
    const candidate = records[index];
    if (!candidate || isRuntimeRecord(candidate) || isStreamRecord(candidate) || isThinkingStreamRecord(candidate)) continue;
    if ((candidate as SDKMessage).type === "user" && isUserInputMessage(candidate as SDKMessage)) return index;
  }
  return undefined;
}

function isUserInputMessage(message: SDKMessage): boolean {
  if ((message as { parent_tool_use_id?: unknown }).parent_tool_use_id) return false;
  if ((message as { isSynthetic?: unknown }).isSynthetic === true) return false;
  if (toolResultBlocks(message).length > 0) return false;
  return userText(message).trim().length > 0;
}

function mergeAdjacentSameModelTurns(groups: AgentMessageGroup[]): AgentMessageGroup[] {
  if (groups.length <= 1) return groups;
  const result: AgentMessageGroup[] = [];

  for (const group of groups) {
    if (group.type !== "assistant-turn") {
      result.push(group);
      continue;
    }

    let mergeTargetIndex = -1;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const previous = result[index];
      if (!previous) break;
      if (previous.type === "user") break;
      if (previous.type === "system") {
        const subtype = stringValue((previous.record as { subtype?: unknown }).subtype, "");
        if (subtype === "compact_boundary") break;
      }
      if (previous.type === "assistant-turn") {
        if (previous.model === group.model) mergeTargetIndex = index;
        break;
      }
    }

    if (mergeTargetIndex >= 0) {
      const target = result[mergeTargetIndex] as AssistantTurnGroup;
      target.assistantMessages.push(...group.assistantMessages);
      target.turnRecords.push(...group.turnRecords);
    } else {
      result.push(group);
    }
  }

  return result;
}

export function assistantText(record: SDKMessage): string {
  return assistantBlocks(record).flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
}

export function agentErrorMessage(record: SDKMessage): string {
  const error = recordObject((record as { error?: unknown }).error);
  return stringValue(error.message, "");
}

export function isPromptTooLongMessage(record: SDKMessage): boolean {
  const errorCode = stringValue((record as { _errorCode?: unknown })._errorCode, "");
  const errorType = stringValue(recordObject((record as { error?: unknown }).error).errorType, "");
  if (errorCode === "prompt_too_long" || errorType === "prompt_too_long") return true;
  const text = `${assistantText(record)} ${agentErrorMessage(record)}`.toLowerCase();
  return PROMPT_TOO_LONG_PATTERNS.some((pattern) => text.includes(pattern));
}

export function thinkingTextForMessage(record: SDKMessage): string {
  const content = messageContent(record);
  if (!Array.isArray(content)) return "";
  return content.flatMap((block) => {
    const item = recordObject(block);
    if (item.type !== "thinking") return [];
    return stringValue(item.thinking ?? item.text ?? item.content, "");
  }).join("\n").trim();
}

export function isBoundaryRecord(record: BrevynAgentTimelineRecord): boolean {
  if (isRuntimeRecord(record)) return true;
  const type = (record as SDKMessage).type;
  return type === "user" || type === "result" || type === "system";
}

export function assistantBlocks(record: SDKMessage): Array<{ type: "text"; text: string; citations?: unknown[] } | ToolUseBlock> {
  const content = messageContent(record);
  if (!Array.isArray(content)) return [];
  const blocks: Array<{ type: "text"; text: string; citations?: unknown[] } | ToolUseBlock> = [];
  for (const block of content) {
    const item = recordObject(block);
    if (item.type === "text" && typeof item.text === "string") {
      const citations = Array.isArray(item.citations) ? item.citations : Array.isArray(item.annotations) ? item.annotations : undefined;
      blocks.push(citations ? { type: "text", text: item.text, citations } : { type: "text", text: item.text });
      continue;
    }
    if (item.type === "tool_use") {
      blocks.push({
        type: "tool_use",
        id: stringValue(item.id, "tool"),
        name: stringValue(item.name, "tool"),
        input: item.input,
      });
      continue;
    }
    if (item.type === "server_tool_use") {
      blocks.push({
        type: "tool_use",
        id: stringValue(item.id, "server-tool"),
        name: stringValue(item.name, "ServerTool"),
        input: { ...recordObject(item.input), hosted: true },
      });
    }
  }
  return blocks;
}

function webCitationLinksFromItems(items: Array<{ record: AgentTimelineRecord; index: number }>): WebCitationLink[] {
  const byUrl = new Map<string, WebCitationLink>();
  for (const { record } of items) {
    if (!record || isRuntimeRecord(record) || isStreamRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if ((record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type !== "text" || !Array.isArray(block.citations)) continue;
      for (const citation of block.citations) {
        const link = webCitationLinkFromCitation(citation);
        if (!link || byUrl.has(link.url)) continue;
        byUrl.set(link.url, link);
      }
    }
  }
  return [...byUrl.values()];
}

function webCitationLinkFromCitation(citation: unknown): WebCitationLink | undefined {
  const object = recordObject(citation);
  const citationType = stringValue(object.type, "");
  if (citationType && citationType !== "web_search_result_location" && citationType !== "url_citation") return undefined;
  const url = stringValue(object.url, "");
  if (!url) return undefined;
  return {
    title: stringValue(object.title, url),
    url,
  };
}

export function toolResultBlocks(record: SDKMessage): ToolResultBlock[] {
  const content = messageContent(record);
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const item = recordObject(block);
    if (item.type !== "tool_result") return [];
    return [{
      type: "tool_result" as const,
      toolUseId: stringValue(item.tool_use_id, "tool"),
      content: item.content ?? item,
      isError: item.is_error === true,
    }];
  });
}

export function userText(record: SDKMessage): string {
  const content = messageContent(record);
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((block) => {
    const item = recordObject(block);
    return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
  }).join("\n");
}

export function isCompactCommandMessage(record: SDKMessage): boolean {
  return record.type === "user" && userText(record).trim() === "/compact";
}

export function messageContent(record: SDKMessage): unknown {
  return messageContentEnvelope(record).content;
}

export function messageContentEnvelope(record: SDKMessage): Record<string, unknown> {
  return recordObject((record as { message?: unknown }).message);
}

export function recordCreatedAtMs(record: unknown): number | undefined {
  const createdAt = (record as { _createdAt?: unknown })._createdAt;
  if (typeof createdAt === "number") return createdAt;
  const timestamp = (record as { timestamp?: unknown }).timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function runtimeIdentityPayload(event: object): string {
  const payload = recordObject(event);
  const runId = stringValue(payload.runId, "");
  const requestId = stringValue(payload.requestId, "");
  const detail = stringValue(payload.reason ?? payload.error, "");
  const createdAt = stringValue(payload.createdAt, "");
  return [runId, requestId, detail, createdAt].filter(Boolean).join(":");
}

function stableRecordSignature(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (!json) return "";
    return hashString(json);
  } catch {
    return hashString(String(value));
  }
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatToolResultContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.flatMap((item) => {
      const data = recordObject(item);
      if (typeof data.text === "string") return [data.text];
      if (typeof data.content === "string") return [data.content];
      return [formatUnknown(item)];
    });
    return parts.join("\n");
  }
  const data = recordObject(value);
  if (typeof data.stdout === "string" || typeof data.stderr === "string") {
    return [data.stdout, data.stderr].filter((part) => typeof part === "string" && part.trim()).join("\n");
  }
  if (typeof data.text === "string") return data.text;
  if (typeof data.content === "string") return data.content;
  return formatUnknown(value);
}

export function toolResultSummary(tool: ToolResultBlock): string {
  if (tool.isError) return `失败 · ${shortErrorSummary(formatToolResultContent(tool.content))}`;
  const content = formatToolResultContent(tool.content);
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  return lines.length > 1 ? `${lines.length} lines` : "成功";
}

function shortErrorSummary(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "未知错误";
  const quoted = text.match(/(?:Error|error):\s*([^".。]+)|([^".。]+(?:not found|does not exist|permission denied|denied|failed)[^".。]*)/i);
  const summary = (quoted?.[1] || quoted?.[2] || text).trim();
  return summary.length > 42 ? `${summary.slice(0, 39)}...` : summary;
}

export function toolTitle(toolName: string, input: unknown): string {
  const data = recordObject(input);
  const diff = toolDiffStats(toolName, input);
  const diffSuffix = diff ? formatDiffStats(diff) : "";
  if (toolName === "Read") return `Read · ${stringValue(data.file_path ?? data.path, "file")}`;
  if (toolName === "Edit" || toolName === "MultiEdit") return `${toolName} · ${stringValue(data.file_path ?? data.path, "file")}${diffSuffix ? ` ${diffSuffix}` : ""}`;
  if (toolName === "Write") return `Write · ${stringValue(data.file_path ?? data.path, "file")}${diffSuffix ? ` ${diffSuffix}` : ""}`;
  if (toolName === "Bash") return `Bash · ${singleLine(stringValue(data.command, "command"))}`;
  if (toolName === "Grep") return `Grep · ${singleLine(stringValue(data.pattern, "pattern"))}`;
  if (toolName === "Glob") return `Glob · ${singleLine(stringValue(data.pattern, "pattern"))}`;
  if (toolName === "WebFetch") return `WebFetch · ${stringValue(data.url, "URL")}`;
  const webSearchQuery = webSearchQueryFromInput(data);
  if (toolName === "WebSearch") return data.hosted === true
    ? `WebSearch · hosted${webSearchQuery ? ` · ${singleLine(webSearchQuery)}` : ""}`
    : `WebSearch · ${singleLine(webSearchQuery || "query")}`;
  if (toolName === "TodoWrite") return "Update todo list";
  if (toolName === "mcp__brevyn__load_skill") return `加载技能 · ${skillNameFromId(stringValue(data.skillId, "skill"))}`;
  if (toolName === "mcp__brevyn__read_skill_resource") return `读取技能资源 · ${singleLine(stringValue(data.relativePath, "resource"))}`;
  if (toolName === "mcp__brevyn__rag_search") return `检索课程材料 · ${singleLine(stringValue(data.query, "query"))}`;
  if (toolName.startsWith("mcp__brevyn__")) return `Brevyn · ${toolName.replace("mcp__brevyn__", "")}`;
  return `Tool · ${toolName}`;
}

function webSearchQueryFromInput(input: Record<string, unknown>): string {
  const direct = stringValue(input.query, "");
  if (direct) return direct;
  const queries = Array.isArray(input.queries) ? input.queries : [];
  for (const query of queries) {
    if (typeof query === "string" && query.trim()) return query.trim();
    const object = recordObject(query);
    const value = stringValue(object.query ?? object.search_query ?? object.text, "");
    if (value) return value;
  }
  return "";
}

function skillNameFromId(skillId: string): string {
  return skillId.replace(/^file:/, "").split(/[-_]/g).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || skillId;
}

export interface ToolDiffStats {
  additions: number;
  deletions: number;
}

export function toolDiffStats(toolName: string, input: unknown): ToolDiffStats | null {
  const data = recordObject(input);
  if (toolName === "Write") {
    const content = data.content;
    if (typeof content !== "string") return null;
    return { additions: countLines(content), deletions: 0 };
  }
  if (toolName === "Edit") {
    const oldString = data.old_string;
    const newString = data.new_string;
    if (typeof oldString !== "string" || typeof newString !== "string") return null;
    return { additions: countLines(newString), deletions: countLines(oldString) };
  }
  if (toolName === "MultiEdit") {
    const edits = Array.isArray(data.edits) ? data.edits : [];
    let additions = 0;
    let deletions = 0;
    for (const edit of edits) {
      const item = recordObject(edit);
      if (typeof item.new_string === "string") additions += countLines(item.new_string);
      if (typeof item.old_string === "string") deletions += countLines(item.old_string);
    }
    return additions > 0 || deletions > 0 ? { additions, deletions } : null;
  }
  return null;
}

export function formatDiffStats(diff: ToolDiffStats): string {
  const parts: string[] = [];
  if (diff.additions > 0) parts.push(`+${diff.additions}`);
  if (diff.deletions > 0) parts.push(`-${diff.deletions}`);
  return parts.join(" ");
}

function countLines(value: string): number {
  if (!value) return 0;
  return value.split("\n").length;
}

export function exitPlanSummary(request: AgentExitPlanRequest): string {
  if (request.allowedPrompts.length === 0) return "退出计划模式继续执行";
  return request.allowedPrompts
    .map((prompt) => `${prompt.tool}: ${prompt.prompt}`)
    .join(", ");
}

export function singleLine(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

export function truncatePreview(value: string): string {
  const maxLength = 6000;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n... truncated for display`;
}

export function normalizeTimelineRecords(
  records: BrevynAgentTimelineRecord[],
  liveRecords: BrevynAgentTimelineRecord[],
  running: boolean,
  compactInFlight = false,
): AgentTimelineRecord[] {
  const normalized: AgentTimelineRecord[] = [];
  const sourceRecords = [...records, ...liveRecords];
  let streamText = "";
  let streamId = "stream";
  let thinkingText = "";
  let thinkingId = "thinking-stream";
  let streamOwnerActive = false;
  const seenRecords = new Set<string>();

  for (const record of sourceRecords) {
    const identity = timelineRecordIdentity(record);
    if (identity) {
      if (seenRecords.has(identity)) continue;
      seenRecords.add(identity);
    }
    if (isHiddenSystemRecord(record)) continue;
    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "prompt_suggestion") continue;
    const startsUserTurn = isTimelineUserInputRecord(record);
    const startsRuntimeRun = isRuntimeRecord(record) && record.event.type === "run_started";
    if ((startsUserTurn || startsRuntimeRun) && streamText) {
      streamText = "";
      streamId = "stream";
    }
    if ((startsUserTurn || startsRuntimeRun) && thinkingText) {
      thinkingText = "";
      thinkingId = "thinking-stream";
    }

    const thinkingDelta = streamThinkingDelta(record);
    if (thinkingDelta) {
      if (streamOwnerActive) thinkingText += thinkingDelta;
      if (thinkingId === "thinking-stream") thinkingId = stringValue((record as { uuid?: unknown }).uuid, thinkingId);
      continue;
    }
    const delta = streamTextDelta(record);
    if (delta) {
      if (streamOwnerActive) streamText += delta;
      if (streamId === "stream") streamId = stringValue((record as { uuid?: unknown }).uuid, streamId);
      continue;
    }
    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "stream_event") continue;

    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "assistant" && thinkingText.trim()) {
      normalized.push({ kind: "thinking_stream", id: thinkingId, text: thinkingText });
      thinkingText = "";
      thinkingId = "thinking-stream";
    }
    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim()) {
      const message = record as SDKMessage;
      const fullText = assistantText(message);
      if (running && streamText && textMatchesStream(fullText, streamText)) {
        if (assistantBlocks(message).some((block) => block.type === "tool_use")) {
          streamText = "";
        } else {
          normalized.push({ kind: "stream", id: streamId, text: streamText });
          streamText = "";
          continue;
        }
      }
      streamText = "";
    }
    if (streamText && isBoundaryRecord(record)) {
      normalized.push({ kind: "stream", id: streamId, text: streamText });
      streamText = "";
    }
    if (thinkingText && isBoundaryRecord(record)) {
      normalized.push({ kind: "thinking_stream", id: thinkingId, text: thinkingText });
      thinkingText = "";
      thinkingId = "thinking-stream";
    }
    normalized.push(record);
    if (startsRuntimeRun) streamOwnerActive = false;
    if (startsUserTurn) streamOwnerActive = true;
    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "result") streamOwnerActive = false;
  }

  if (streamOwnerActive && streamText.trim()) {
    normalized.push({ kind: "stream", id: streamId, text: streamText });
  }
  if (streamOwnerActive && thinkingText.trim()) {
    normalized.push({ kind: "thinking_stream", id: thinkingId, text: thinkingText });
  }
  if ((compactInFlight || running) && shouldShowCompactPlaceholder(normalized)) {
    normalized.push({ kind: "compact_placeholder", id: "active-compact-placeholder" });
  } else if (compactInFlight && shouldShowOptimisticCompactPlaceholder(normalized)) {
    normalized.push({ kind: "compact_placeholder", id: "active-compact-placeholder" });
  }
  if (running && shouldShowProcessPlaceholder(normalized)) {
    normalized.push({ kind: "process_placeholder", id: "active-process-placeholder" });
  }
  return normalized;
}

export function recordKey(record: AgentTimelineRecord, index: number): string {
  return timelineRecordIdentity(record) || `${String((record as { type?: unknown }).type || "record")}-${index}`;
}

export function timelineRecordIdentity(record: AgentTimelineRecord): string {
  if (isStreamRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) {
    return `${record.kind}:${record.id}`;
  }
  if (isRuntimeRecord(record)) {
    return `runtime:${record.event.type}:${runtimeIdentityPayload(record.event)}:${stableRecordSignature(record.event)}`;
  }
  const maybeUuid = (record as { uuid?: unknown }).uuid;
  if (typeof maybeUuid === "string" && maybeUuid.trim()) return `uuid:${maybeUuid.trim()}`;
  const message = record as SDKMessage;
  return `${message.type}:${recordCreatedAtMs(message) ?? ""}:${stableRecordSignature(message)}`;
}

export function isRuntimeRecord(record: unknown): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

export function isStreamRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "stream" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "stream");
}

export function isThinkingStreamRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "thinking_stream" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "thinking_stream");
}

export function isProcessPlaceholderRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "process_placeholder" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "process_placeholder");
}

export function isCompactPlaceholderRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "compact_placeholder" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "compact_placeholder");
}

function shouldShowOptimisticCompactPlaceholder(records: AgentTimelineRecord[]): boolean {
  return !records.some((record) => isCompactPlaceholderRecord(record) || isCompactSystemRecord(record));
}

function shouldShowCompactPlaceholder(records: AgentTimelineRecord[]): boolean {
  const bounds = latestTurnBounds(records);
  if (!bounds || bounds.result || !isCompactCommandMessage(bounds.user)) return false;
  return !records.slice(bounds.userIndex + 1).some((record) => {
    if (isRuntimeRecord(record) || isStreamRecord(record) || isThinkingStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
    if ((record as SDKMessage).type !== "system") return false;
    const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
    return subtype === "compacting" || subtype === "compact_boundary";
  });
}

function isCompactSystemRecord(record: AgentTimelineRecord): boolean {
  if (isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
  if ((record as SDKMessage).type !== "system") return false;
  const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
  return subtype === "compacting" || subtype === "compact_boundary";
}

function shouldShowProcessPlaceholder(records: AgentTimelineRecord[]): boolean {
  const bounds = latestTurnBounds(records);
  if (!bounds || bounds.result) return false;
  if (isCompactCommandMessage(bounds.user)) return false;
  const afterUser = records.slice(bounds.userIndex + 1);
  return !afterUser.some((record) => {
    if (isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
    return (record as SDKMessage).type === "assistant";
  });
}

function isHiddenSystemRecord(record: BrevynAgentTimelineRecord): boolean {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "system") return false;
  const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
  return subtype !== "compacting" && subtype !== "compact_boundary";
}

function streamTextDelta(record: BrevynAgentTimelineRecord): string {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return "";
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_delta") return "";
  const delta = recordObject(event.delta);
  return delta.type === "text_delta" && typeof delta.text === "string" ? delta.text : "";
}

function streamThinkingDelta(record: BrevynAgentTimelineRecord): string {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return "";
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_delta") return "";
  const delta = recordObject(event.delta);
  if (delta.type === "thinking_delta" && typeof delta.thinking === "string") return delta.thinking;
  return "";
}

function isTimelineUserInputRecord(record: BrevynAgentTimelineRecord): boolean {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "user") return false;
  const message = record as SDKMessage;
  return toolResultBlocks(message).length === 0 && userText(message).trim().length > 0;
}

function textMatchesStream(fullText: string, streamText: string): boolean {
  const full = fullText.trim();
  const streamed = streamText.trim();
  if (!full || !streamed) return false;
  return full === streamed || full.startsWith(streamed) || streamed.startsWith(full);
}

export function approvalResolutionMap(records: BrevynAgentTimelineRecord[]): Map<string, "allow" | "deny"> {
  const map = new Map<string, "allow" | "deny">();
  for (const record of records) {
    if (isRuntimeRecord(record) && record.event.type === "approval_resolved") {
      map.set(record.event.requestId, record.event.decision);
    }
  }
  return map;
}

export function approvalDecision(record: AgentTimelineRecord, decisions: Map<string, "allow" | "deny">): "allow" | "deny" | undefined {
  if (!isRuntimeRecord(record) || record.event.type !== "approval_requested") return undefined;
  return decisions.get(record.event.request.requestId);
}

export function questionResolutionMap(records: BrevynAgentTimelineRecord[]): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const record of records) {
    if (isRuntimeRecord(record) && record.event.type === "ask_user_resolved") {
      map.set(record.event.requestId, record.event.answers);
    }
  }
  return map;
}

export function questionAnswers(record: AgentTimelineRecord, answers: Map<string, Record<string, string>>): Record<string, string> | undefined {
  if (!isRuntimeRecord(record) || record.event.type !== "ask_user_requested") return undefined;
  return answers.get(record.event.request.requestId);
}

export function exitPlanResolutionMap(records: BrevynAgentTimelineRecord[]): Map<string, "approve" | "deny"> {
  const map = new Map<string, "approve" | "deny">();
  for (const record of records) {
    if (isRuntimeRecord(record) && record.event.type === "exit_plan_resolved") {
      map.set(record.event.requestId, record.event.decision);
    }
  }
  return map;
}

export function exitPlanDecision(record: AgentTimelineRecord, decisions: Map<string, "approve" | "deny">): "approve" | "deny" | undefined {
  if (!isRuntimeRecord(record) || record.event.type !== "exit_plan_requested") return undefined;
  return decisions.get(record.event.request.requestId);
}

export function defaultQuestionAnswers(request: AgentAskUserRequest): Record<string, string> {
  const result: Record<string, string> = {};
  request.questions.forEach((question, index) => {
    const firstOption = question.options[0]?.label;
    result[answerKey(question.question, index)] = firstOption || "";
  });
  return result;
}

export function answerKey(question: string, index: number): string {
  return question.trim() || `question_${index + 1}`;
}

export function nextQuestionAnswer(current: string, option: string, multiSelect: boolean): string {
  if (!multiSelect) return option;
  const selected = current.split(",").map((item) => item.trim()).filter(Boolean);
  const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
  return next.join(", ");
}
