import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  assistantBlocks,
  isRuntimeRecord,
  isStreamEventRecord,
  streamToolInputDelta,
  streamToolUseStart,
  toolResultBlocks,
  userText,
  type AgentTimelineRecord,
  type AgentTodoItem,
} from "@/components/agent/agentTimelineModel";
import { parsePartialToolInput } from "@/components/agent/agentTimelinePartialInput";
import { recordObject, stringValue } from "@/components/agent/tool-cards/toolModel";

export function latestTodoList(records: AgentTimelineRecord[]): AgentTodoItem[] {
  let latest: AgentTodoItem[] = [];
  let latestTodoUserInputIndex = -1;
  const latestUserInputIndex = lastUserInputIndex(records);
  const streamTodoInputByBlockIndex = new Map<number, string>();
  const streamTodoBlockIndexes = new Set<number>();
  for (const [index, record] of records.entries()) {
    if (isStreamEventRecord(record)) {
      const toolUse = streamToolUseStart(record);
      if (toolUse?.tool.name === "TodoWrite") {
        streamTodoBlockIndexes.add(toolUse.index);
        const todos = todosFromInput(toolUse.tool.input);
        if (todos.length > 0) {
          latest = todos;
          latestTodoUserInputIndex = ownerUserInputIndex(records, index);
        }
      }
      const inputDelta = streamToolInputDelta(record);
      if (inputDelta && streamTodoBlockIndexes.has(inputDelta.index)) {
        const previous = streamTodoInputByBlockIndex.get(inputDelta.index) || "";
        const nextInput = `${previous}${inputDelta.partialJson}`;
        streamTodoInputByBlockIndex.set(inputDelta.index, nextInput);
        const parsed = parsePartialToolInput(nextInput);
        const todos = todosFromInput(parsed);
        if (todos.length > 0) {
          latest = todos;
          latestTodoUserInputIndex = ownerUserInputIndex(records, index);
        }
      }
      continue;
    }
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type !== "tool_use" || block.name !== "TodoWrite") continue;
      const todos = todosFromInput(block.input);
      if (todos.length === 0) continue;
      latest = todos;
      latestTodoUserInputIndex = ownerUserInputIndex(records, index);
    }
  }
  if (latest.length === 0) return [];
  const completed = latest.every((todo) => todo.status === "completed");
  if (completed && latestUserInputIndex > latestTodoUserInputIndex) return [];
  return latest;
}

function todosFromInput(input: unknown): AgentTodoItem[] {
  const todos = recordObject(input).todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    const item = recordObject(todo);
    const content = stringValue(item.content, "");
    if (!content) return [];
    const rawStatus = stringValue(item.status, "pending");
    const status = rawStatus === "completed" || rawStatus === "in_progress" ? rawStatus : "pending";
    return [{ content, status }];
  });
}

function lastUserInputIndex(records: AgentTimelineRecord[]): number {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    if (toolResultBlocks(record as SDKMessage).length || !userText(record as SDKMessage).trim()) continue;
    return index;
  }
  return -1;
}

function ownerUserInputIndex(records: AgentTimelineRecord[], beforeIndex: number): number {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    if (toolResultBlocks(record as SDKMessage).length || !userText(record as SDKMessage).trim()) continue;
    return index;
  }
  return -1;
}
