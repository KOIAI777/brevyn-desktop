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
  | { kind: "thinking"; id: string; text: string }
  | { kind: "narration"; id: string; text: string }
  | { kind: "tool_use"; id: string; tool: ToolUseBlock; result?: ToolResultBlock; approvalDecision?: "allow" | "deny" };

export type AgentTimelineRecord =
  | BrevynAgentTimelineRecord
  | { kind: "stream"; id: string; text: string }
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

    if (isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) {
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
      const assistant = !record || isRuntimeRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)
        ? null
        : record as SDKMessage;
      const blocks = assistant && !isStreamRecord(record) && assistant.type === "assistant" ? assistantBlocks(assistant) : [];
      const hasToolUse = blocks.some((block) => block.type === "tool_use" && block.name !== "TodoWrite");
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
    const placeholderIndex = turnItems.find((item) => isProcessPlaceholderRecord(item.record))?.index;
    const firstProcessIndex = firstProcessItemIndex(turnItems, narrationByIndex);
    const anchorIndex = finalOutputIndexes[0]
      ?? placeholderIndex
      ?? firstProcessIndex
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
        processEvents,
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
  const toolById = new Map<string, Extract<ProcessEvent, { kind: "tool_use" }>>();
  const approvalByToolUseId = approvalDecisionByToolUseId(items);
  let thinkingIndex = 0;

  for (const { record, index } of items) {
    if (!record || isRuntimeRecord(record)) continue;
    if ((record as SDKMessage).type === "assistant") {
      const message = record as SDKMessage;
      const blocks = assistantBlocks(message);
      const thinkingText = thinkingTextForMessage(message);
      if (thinkingText) {
        events.push({ kind: "thinking", id: `thinking-${index}-${thinkingIndex}`, text: thinkingText });
        thinkingIndex += 1;
      }
      if (narrationByIndex.get(index)) {
        const narrationText = assistantText(message).trim();
        if (narrationText) {
          events.push({ kind: "narration", id: `narration-${index}-${thinkingIndex}`, text: narrationText });
          thinkingIndex += 1;
        }
      }
      for (const block of blocks) {
        if (block.type !== "tool_use" || block.name === "TodoWrite") continue;
        const event: Extract<ProcessEvent, { kind: "tool_use" }> = {
          kind: "tool_use",
          id: `tool-use-${block.id}`,
          tool: block,
          approvalDecision: approvalByToolUseId.get(block.id),
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
  if (!record || isRuntimeRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) return false;
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
    if (!record || isRuntimeRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if (isStreamRecord(record) && record.text.trim()) return undefined;
    if ((record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim() && !narrationByIndex.get(index)) return undefined;
  }
  const parts: string[] = [];
  for (const { record: candidate, index: candidateIndex } of items) {
    if (!candidate || isRuntimeRecord(candidate) || isProcessPlaceholderRecord(candidate) || isCompactPlaceholderRecord(candidate)) continue;
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
    if (!record || isRuntimeRecord(record) || isStreamRecord(record)) continue;
    if ((record as SDKMessage).type !== "user" || toolResultBlocks(record as SDKMessage).length > 0) continue;
    const resultIndex = records.findIndex((candidate, candidateIndex) => (
      candidateIndex > index
        && !isRuntimeRecord(candidate)
        && !isStreamRecord(candidate)
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
    if (!candidate || isRuntimeRecord(candidate) || isStreamRecord(candidate)) continue;
    if ((candidate as SDKMessage).type === "result") {
      return { result: candidate as SDKMessage, resultIndex: index };
    }
  }
  return {};
}

function nextUserInputIndex(records: AgentTimelineRecord[], afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < records.length; index += 1) {
    const candidate = records[index];
    if (!candidate || isRuntimeRecord(candidate) || isStreamRecord(candidate)) continue;
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

export function assistantBlocks(record: SDKMessage): Array<{ type: "text"; text: string } | ToolUseBlock> {
  const content = messageContent(record);
  if (!Array.isArray(content)) return [];
  const blocks: Array<{ type: "text"; text: string } | ToolUseBlock> = [];
  for (const block of content) {
    const item = recordObject(block);
    if (item.type === "text" && typeof item.text === "string") {
      blocks.push({ type: "text", text: item.text });
      continue;
    }
    if (item.type === "tool_use") {
      blocks.push({
        type: "tool_use",
        id: stringValue(item.id, "tool"),
        name: stringValue(item.name, "tool"),
        input: item.input,
      });
    }
  }
  return blocks;
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
  if (toolName === "WebSearch") return `WebSearch · ${singleLine(stringValue(data.query, "query"))}`;
  if (toolName === "TodoWrite") return "Update todo list";
  if (toolName === "mcp__brevyn__rag_search") return `检索课程材料 · ${singleLine(stringValue(data.query, "query"))}`;
  if (toolName.startsWith("mcp__brevyn__")) return `Brevyn · ${toolName.replace("mcp__brevyn__", "")}`;
  return `Tool · ${toolName}`;
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

export function recordKey(record: AgentTimelineRecord, index: number): string {
  if (isStreamRecord(record)) return `${record.id}-${index}`;
  if (isProcessPlaceholderRecord(record)) return `${record.id}-${index}`;
  if (isCompactPlaceholderRecord(record)) return `${record.id}-${index}`;
  if (isRuntimeRecord(record)) return `${record.event.type}-${record.event.createdAt}-${index}`;
  const maybeUuid = (record as { uuid?: unknown }).uuid;
  return typeof maybeUuid === "string" ? `${maybeUuid}-${index}` : `${String((record as { type?: unknown }).type || "record")}-${index}`;
}

export function isRuntimeRecord(record: unknown): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

export function isStreamRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "stream" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "stream");
}

export function isProcessPlaceholderRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "process_placeholder" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "process_placeholder");
}

export function isCompactPlaceholderRecord(record: unknown): record is Extract<AgentTimelineRecord, { kind: "compact_placeholder" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "compact_placeholder");
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
