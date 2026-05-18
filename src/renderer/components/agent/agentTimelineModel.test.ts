import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildTimelineRenderMeta, latestTurnBounds, normalizeTimelineRecords, recordKey, timelineRecordIdentity, type AgentTimelineRecord } from "./agentTimelineModel";
import { appendAgentLiveMessage, appendAgentRuntimeEvent, clearAllAgentLiveRecords, getAgentLiveRecords, getAgentLiveRunning } from "@/lib/agent-live-store";

(globalThis as unknown as { window: { requestAnimationFrame: (callback: () => void) => number; cancelAnimationFrame: (id: number) => void } }).window = {
  requestAnimationFrame(callback: () => void) {
    callback();
    return 1;
  },
  cancelAnimationFrame() {
    return undefined;
  },
};

function userText(content: string, uuid: string): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content,
    },
    parent_tool_use_id: null,
    session_id: "session_fixture",
    uuid,
    _createdAt: 1,
  } as unknown as SDKMessage;
}

function assistant(content: unknown[], uuid: string): SDKMessage {
  return {
    type: "assistant",
    message: {
      id: uuid,
      type: "message",
      role: "assistant",
      model: "deepseek-v4-pro",
      content,
    },
    parent_tool_use_id: null,
    session_id: "session_fixture",
    uuid,
    _createdAt: 2,
  } as unknown as SDKMessage;
}

function toolResult(toolUseId: string, content: string, uuid: string): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        content,
        is_error: false,
      }],
    },
    parent_tool_use_id: null,
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
  } as unknown as SDKMessage;
}

function result(uuid: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1000,
    num_turns: 1,
    result: "Workspace summary",
    session_id: "session_fixture",
    uuid,
    _createdAt: 4,
  } as unknown as SDKMessage;
}

function streamEvent(delta: unknown, uuid: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta,
    },
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
  } as unknown as SDKMessage;
}

const records: AgentTimelineRecord[] = [
  userText("Inspect the workspace and summarize it.", "user_1"),
  assistant([
    { type: "thinking", thinking: "I should inspect the current directory first." },
    { type: "text", text: "I will check the workspace structure first." },
    { type: "tool_use", id: "tool_pwd", name: "Bash", input: { command: "pwd" } },
  ], "assistant_1"),
  toolResult("tool_pwd", "/Users/koi/.brevyn-dev/semesters/semester-fixture", "tool_result_1"),
  assistant([
    { type: "thinking", thinking: "Now I should list the files." },
    { type: "tool_use", id: "tool_glob", name: "Glob", input: { pattern: "**/*" } },
  ], "assistant_2"),
  toolResult("tool_glob", "threads/thread-fixture.jsonl", "tool_result_2"),
  assistant([
    { type: "text", text: "The workspace contains a threads folder with one JSONL timeline file." },
  ], "assistant_final"),
  result("result_1"),
];

const bounds = latestTurnBounds(records);
assert.equal(bounds?.userIndex, 0);
assert.equal(bounds?.resultIndex, 6);

const meta = buildTimelineRenderMeta(records);
assert.equal(meta.hasLiveAssistantText, true);

const firstNarration = meta.byIndex.get(1);
assert.equal(firstNarration?.processNarration, true);
assert.equal(firstNarration?.attachProcess, true);
assert.equal(firstNarration?.processHeader, true);

const finalMeta = meta.byIndex.get(5);
assert.equal(finalMeta?.assistantCopyContent, "The workspace contains a threads folder with one JSONL timeline file.");
assert.equal(firstNarration?.processEvents?.length, 3);
assert.deepEqual(
  firstNarration?.processEvents?.map((event) => event.kind),
  ["thinking", "narration", "tool_use"],
);

const [firstThinking, narration, pwdTool] = firstNarration?.processEvents || [];
assert.equal(firstThinking?.kind, "thinking");
assert.match(firstThinking?.kind === "thinking" ? firstThinking.text : "", /inspect/);
assert.equal(narration?.kind, "narration");
assert.match(narration?.kind === "narration" ? narration.text : "", /workspace structure/);
assert.equal(pwdTool?.kind, "tool_use");
assert.equal(pwdTool?.kind === "tool_use" ? pwdTool.tool.name : "", "Bash");
assert.equal(pwdTool?.kind === "tool_use" ? pwdTool.result?.content : "", "/Users/koi/.brevyn-dev/semesters/semester-fixture");
const secondProcess = meta.byIndex.get(3);
assert.equal(secondProcess?.attachProcess, true);
assert.equal(secondProcess?.processHeader, false);
assert.deepEqual(
  secondProcess?.processEvents?.map((event) => event.kind),
  ["thinking", "tool_use"],
);
const [secondThinking, globTool] = secondProcess?.processEvents || [];
assert.equal(secondThinking?.kind, "thinking");
assert.equal(globTool?.kind, "tool_use");
assert.equal(globTool?.kind === "tool_use" ? globTool.tool.name : "", "Glob");
assert.equal(globTool?.kind === "tool_use" ? globTool.result?.content : "", "threads/thread-fixture.jsonl");

const hostedSearchRecords: AgentTimelineRecord[] = [
  userText("Search today's AI news.", "user_search"),
  { kind: "thinking_stream", id: "thinking_search", text: "I should search the web first." },
  assistant([
    {
      type: "server_tool_use",
      id: "web_search_1",
      name: "WebSearch",
      input: { hosted: true, status: "completed", query: "AI news today" },
    },
    {
      type: "text",
      text: "Here are the latest AI stories.",
      citations: [{
        type: "web_search_result_location",
        url: "https://openai.com/news",
        title: "OpenAI News",
      }],
    },
  ], "assistant_search"),
  result("result_search"),
];

const hostedSearchMeta = buildTimelineRenderMeta(hostedSearchRecords);
const hostedSearchProcess = hostedSearchMeta.byIndex.get(1);
const hostedSearchFinal = hostedSearchMeta.byIndex.get(2);
const hostedSearchTool = hostedSearchFinal?.processEvents?.find((event) => event.kind === "tool_use");
assert.equal(hostedSearchProcess?.attachProcess, true);
assert.equal(hostedSearchProcess?.processHeader, true);
assert.equal(hostedSearchProcess?.processEvents?.[0]?.kind, "thinking");
assert.match(hostedSearchProcess?.processEvents?.[0]?.kind === "thinking" ? hostedSearchProcess.processEvents[0].text : "", /search the web/);
assert.equal(hostedSearchFinal?.attachProcess, true);
assert.equal(hostedSearchFinal?.processHeader, false);
assert.equal(hostedSearchTool?.kind, "tool_use");
assert.equal(hostedSearchTool?.kind === "tool_use" ? hostedSearchTool.tool.name : "", "WebSearch");
assert.equal(hostedSearchTool?.kind === "tool_use" ? hostedSearchTool.result?.isError : true, false);
assert.deepEqual(hostedSearchTool?.kind === "tool_use" ? (hostedSearchTool.result?.content as { links?: unknown[] }).links : [], [{
  title: "OpenAI News",
  url: "https://openai.com/news",
}]);
assert.equal(hostedSearchFinal?.assistantCopyContent, "Here are the latest AI stories.");

assert.equal(recordKey(records[0]!, 0), recordKey(records[0]!, 99));
assert.equal(
  timelineRecordIdentity({ kind: "runtime", event: { type: "run_started", threadId: "thread_fixture", runId: "run_fixture", permissionMode: "review", createdAt: "2026-05-16T00:00:00.000Z" } } as AgentTimelineRecord),
  timelineRecordIdentity({ kind: "runtime", event: { type: "run_started", threadId: "thread_fixture", runId: "run_fixture", permissionMode: "review", createdAt: "2026-05-16T00:00:00.000Z" } } as AgentTimelineRecord),
);

const duplicateThinkingRecords: AgentTimelineRecord[] = [
  userText("Think, then answer.", "user_duplicate_thinking"),
  { kind: "thinking_stream", id: "live_duplicate_thinking", text: "I should inspect the request first." },
  assistant([
    { type: "thinking", thinking: "I should inspect the request first." },
    { type: "text", text: "Done." },
  ], "assistant_duplicate_thinking"),
  result("result_duplicate_thinking"),
];
const duplicateThinkingMeta = buildTimelineRenderMeta(duplicateThinkingRecords);
const duplicateThinkingEvents = duplicateThinkingMeta.byIndex.get(1)?.processEvents || [];
assert.deepEqual(duplicateThinkingEvents.map((event) => event.kind), ["thinking"]);
assert.equal(duplicateThinkingEvents[0]?.kind === "thinking" ? duplicateThinkingEvents[0].text : "", "I should inspect the request first.");

const liveMergeRecords = normalizeTimelineRecords(
  [
    userText("Stream an answer.", "user_stream"),
    assistant([{ type: "text", text: "Hello world" }], "assistant_stream_final"),
  ],
  [
    userText("Stream an answer.", "user_stream"),
    streamEvent({ type: "text_delta", text: "Hello " }, "stream_1"),
    streamEvent({ type: "text_delta", text: "world" }, "stream_2"),
    assistant([{ type: "text", text: "Hello world" }], "assistant_stream_final"),
  ],
  true,
);
assert.equal(liveMergeRecords.filter((record) => (record as SDKMessage).type === "user").length, 1);
assert.equal(liveMergeRecords.filter((record) => (record as SDKMessage).type === "assistant").length, 1);
assert.equal(liveMergeRecords.some((record) => {
  const item = record as { kind?: string; text?: string };
  return item.kind === "stream" && item.text === "Hello world";
}), true);

const promptSuggestion = {
  type: "prompt_suggestion",
  suggestion: "Do something else",
  uuid: "prompt_suggestion_1",
} as unknown as SDKMessage;
const promptSuggestionRecords = normalizeTimelineRecords([userText("Hi.", "user_prompt_suggestion")], [promptSuggestion], false);
assert.equal(promptSuggestionRecords.some((record) => (record as SDKMessage).type === "prompt_suggestion"), false);

clearAllAgentLiveRecords();
assert.equal(appendAgentLiveMessage("thread_live", promptSuggestion), false);
assert.equal(getAgentLiveRecords("thread_live").length, 0);
assert.equal(appendAgentLiveMessage("thread_live", assistant([{ type: "text", text: "Live text" }], "assistant_live"), { modelId: "deepseek-v4-pro" }), true);
const liveAssistant = getAgentLiveRecords("thread_live")[0] as SDKMessage & { _createdAt?: unknown; _channelModelId?: unknown };
assert.equal(liveAssistant.type, "assistant");
assert.equal(typeof liveAssistant._createdAt, "number");
assert.equal(liveAssistant._channelModelId, "deepseek-v4-pro");

appendAgentRuntimeEvent({ type: "run_started", threadId: "thread_live", runId: "run_live", permissionMode: "review", createdAt: "2026-05-16T00:00:00.000Z" });
assert.equal(getAgentLiveRunning("thread_live"), true);
appendAgentRuntimeEvent({ type: "run_completed", threadId: "thread_live", runId: "run_live", resultSubtype: "success", createdAt: "2026-05-16T00:00:01.000Z" });
assert.equal(getAgentLiveRunning("thread_live"), false);

console.log("agentTimelineModel fixture tests passed");
