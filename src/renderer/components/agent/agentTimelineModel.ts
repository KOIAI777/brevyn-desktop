import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAskUserRequest, AgentExitPlanRequest, AgentPermissionMode, BrevynAgentTimelineRecord } from "@/types/domain";
import { recordCreatedAtMs, timelineRecordIdentity, timelineRecordRenderKey } from "@/lib/agent-timeline-identity";
export { timelineRecordIdentity } from "@/lib/agent-timeline-identity";

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
  { kind: "tool_use"; id: string; tool: ToolUseBlock; result?: ToolResultBlock; approvalDecision?: "allow" | "deny"; sourceIndex?: number };

export type AgentTimelineRecord = BrevynAgentTimelineRecord;

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
  let leadingTurn: AssistantTurnGroup | null = null;
  let seenUserInput = false;

  const flushTurn = (): void => {
    if (currentTurn && currentTurn.turnRecords.length > 0) {
      groups.push(currentTurn);
    }
    currentTurn = null;
  };

  records.forEach((record, index) => {
    if (isRuntimeRecord(record)) {
      if (currentTurn) currentTurn.turnRecords.push({ record, index });
      else if (!seenUserInput) {
        leadingTurn = leadingTurn ?? emptyAssistantTurn(sessionModelId);
        leadingTurn.turnRecords.push({ record, index });
      } else groups.push({ type: "runtime", record, index });
      return;
    }

    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "stream_event") {
      if (!currentTurn) {
        currentTurn = !seenUserInput ? leadingTurn ?? emptyAssistantTurn(sessionModelId) : emptyAssistantTurn(sessionModelId);
        if (!seenUserInput) leadingTurn = currentTurn;
      }
      if (currentTurn) currentTurn.turnRecords.push({ record, index });
      return;
    }

    const message = record as SDKMessage;
    if (message.type === "user") {
      if (isUserInputMessage(message)) {
        if (seenUserInput) flushTurn();
        else currentTurn = null;
        groups.push({ type: "user", record: message, index });
        seenUserInput = true;
        if (leadingTurn && leadingTurn.turnRecords.length > 0) {
          currentTurn = leadingTurn;
          leadingTurn = null;
        }
      } else if (currentTurn) {
        currentTurn.turnRecords.push({ record: message, index });
      }
      return;
    }

    if (message.type === "assistant") {
      if ((message as { isReplay?: unknown }).isReplay === true) return;
      if (!currentTurn) {
        currentTurn = !seenUserInput ? leadingTurn ?? emptyAssistantTurn(sessionModelId) : emptyAssistantTurn(sessionModelId);
        if (!seenUserInput) leadingTurn = currentTurn;
        currentTurn.model = currentTurn.model || stringValue(recordObject(messageContentEnvelope(message)).model ?? (message as { _channelModelId?: unknown })._channelModelId, sessionModelId || "");
        currentTurn.createdAt = currentTurn.createdAt ?? recordCreatedAtMs(message);
        currentTurn.assistantMessages.push(message);
        currentTurn.turnRecords.push({ record: message, index });
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
  return groups;
}

function emptyAssistantTurn(sessionModelId?: string): AssistantTurnGroup {
  return {
    type: "assistant-turn",
    assistantMessages: [],
    turnRecords: [],
    model: sessionModelId || "",
  };
}

export function latestTurnBounds(records: AgentTimelineRecord[]): { user: SDKMessage; userIndex: number; result?: SDKMessage; resultIndex?: number } | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamEventRecord(record)) continue;
    if ((record as SDKMessage).type !== "user" || toolResultBlocks(record as SDKMessage).length > 0) continue;
    const resultIndex = records.findIndex((candidate, candidateIndex) => (
      candidateIndex > index
        && !isRuntimeRecord(candidate)
        && !isStreamEventRecord(candidate)
        && (candidate as SDKMessage).type === "result"
    ));
    const result = resultIndex >= 0 ? records[resultIndex] as SDKMessage : undefined;
    return { user: record as SDKMessage, userIndex: index, result, resultIndex: resultIndex >= 0 ? resultIndex : undefined };
  }
  return null;
}

function nextUserInputIndex(records: AgentTimelineRecord[], afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < records.length; index += 1) {
    const candidate = records[index];
    if (!candidate || isRuntimeRecord(candidate) || isStreamEventRecord(candidate)) continue;
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
    if (!record || isRuntimeRecord(record) || isStreamEventRecord(record)) continue;
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
  if (typeof value === "string") return cleanToolResultContent(value);
  if (Array.isArray(value)) {
    const parts = value.flatMap((item) => {
      const data = recordObject(item);
      if (typeof data.text === "string") return [data.text];
      if (typeof data.content === "string") return [data.content];
      return [formatUnknown(item)];
    });
    return cleanToolResultContent(parts.join("\n"));
  }
  const data = recordObject(value);
  if (typeof data.stdout === "string" || typeof data.stderr === "string") {
    return cleanToolResultContent([data.stdout, data.stderr].filter((part) => typeof part === "string" && part.trim()).join("\n"));
  }
  if (typeof data.text === "string") return cleanToolResultContent(data.text);
  if (typeof data.content === "string") return cleanToolResultContent(data.content);
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
  return (quoted?.[1] || quoted?.[2] || text).trim();
}

function cleanToolResultContent(value: string): string {
  return value
    .replace(/<tool_use_error>/gi, "")
    .replace(/<\/tool_use_error>/gi, "")
    .trim();
}

export function toolTitle(toolName: string, input: unknown): string {
  const data = recordObject(input);
  const diff = toolDiffStats(toolName, input);
  const diffSuffix = diff ? formatDiffStats(diff) : "";
  if (toolName === "Read") return `Read · ${stringValue(data.file_path ?? data.path, "file")}`;
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") return `编辑 · ${stringValue(data.file_path ?? data.path, "file")}${diffSuffix ? ` ${diffSuffix}` : ""}`;
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
  _running: boolean,
  _compactInFlight = false,
): AgentTimelineRecord[] {
  const normalized: AgentTimelineRecord[] = [];
  const liveIdentities = new Set(liveRecords.map((record) => timelineRecordIdentity(record)).filter(Boolean));
  const sourceRecords = [
    ...records.filter((record) => {
      const identity = timelineRecordIdentity(record);
      return !identity || !liveIdentities.has(identity);
    }),
    ...liveRecords,
  ];
  const seenRecords = new Set<string>();

  for (const record of sourceRecords) {
    const identity = timelineRecordIdentity(record);
    if (identity) {
      if (seenRecords.has(identity)) continue;
      seenRecords.add(identity);
    }
    if (isHiddenSystemRecord(record)) continue;
    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "prompt_suggestion") continue;
    normalized.push(record);
  }

  return normalized;
}

export function recordKey(record: AgentTimelineRecord, _index?: number): string {
  return timelineRecordRenderKey(record, String((record as { type?: unknown }).type || "record"));
}

export function isRuntimeRecord(record: unknown): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

function isHiddenSystemRecord(record: BrevynAgentTimelineRecord): boolean {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "system") return false;
  const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
  return subtype !== "compacting" && subtype !== "compact_boundary";
}

export function streamTextDelta(record: BrevynAgentTimelineRecord): string {
  return streamTextDeltaBlock(record)?.text || "";
}

export function streamTextDeltaBlock(record: BrevynAgentTimelineRecord): { index: number; text: string } | null {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return null;
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_delta") return null;
  const delta = recordObject(event.delta);
  return delta.type === "text_delta" && typeof delta.text === "string"
    ? { index: streamEventIndex(event), text: delta.text }
    : null;
}

export function streamThinkingDelta(record: BrevynAgentTimelineRecord): string {
  return streamThinkingDeltaBlock(record)?.text || "";
}

export function streamThinkingDeltaBlock(record: BrevynAgentTimelineRecord): { index: number; text: string } | null {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return null;
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_delta") return null;
  const delta = recordObject(event.delta);
  return delta.type === "thinking_delta" && typeof delta.thinking === "string"
    ? { index: streamEventIndex(event), text: delta.thinking }
    : null;
}

export function streamToolUseStart(record: BrevynAgentTimelineRecord): { index: number; tool: ToolUseBlock } | null {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return null;
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_start") return null;
  const block = recordObject(event.content_block);
  const type = stringValue(block.type, "");
  if (type !== "tool_use" && type !== "server_tool_use") return null;
  const id = stringValue(block.id, `stream-tool-${streamEventIndex(event)}`);
  const name = type === "server_tool_use" ? "WebSearch" : stringValue(block.name, "Tool");
  return {
    index: streamEventIndex(event),
    tool: {
      type: "tool_use",
      id,
      name,
      input: recordObject(block.input),
    },
  };
}

export function streamToolInputDelta(record: BrevynAgentTimelineRecord): { index: number; partialJson: string } | null {
  if (isRuntimeRecord(record) || (record as SDKMessage).type !== "stream_event") return null;
  const event = recordObject((record as { event?: unknown }).event);
  if (event.type !== "content_block_delta") return null;
  const delta = recordObject(event.delta);
  if (delta.type !== "input_json_delta") return null;
  const partialJson = stringValue(delta.partial_json, "");
  return partialJson ? { index: streamEventIndex(event), partialJson } : null;
}

function streamEventIndex(event: Record<string, unknown>): number {
  const index = Number(event.index);
  return Number.isFinite(index) ? index : 0;
}

export function isStreamEventRecord(record: unknown): record is SDKMessage {
  return Boolean(record && !isRuntimeRecord(record) && (record as { type?: unknown }).type === "stream_event");
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
