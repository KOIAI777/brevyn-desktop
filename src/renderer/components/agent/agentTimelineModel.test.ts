import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { latestTurnBounds, normalizeTimelineRecords, recordKey, streamTextDelta, timelineRecordIdentity, type AgentTimelineRecord } from "./agentTimelineModel";
import { buildTimelineViewGroups, type AgentTimelineViewItem } from "./useAgentTimelineState";
import { appendAgentLiveMessage, appendAgentRuntimeEvent, clearAllAgentLiveRecords, flushAgentLiveRecords, getAgentLiveRecords, getAgentLiveRunning } from "@/lib/agent-live-store";

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

function streamEvent(delta: unknown, uuid: string, index?: number): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      ...(index === undefined ? {} : { index }),
      delta,
    },
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
  } as unknown as SDKMessage;
}

function streamToolStart(index: number, block: unknown, uuid: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      index,
      content_block: block,
    },
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
  } as unknown as SDKMessage;
}

function streamToolInput(index: number, partialJson: string, uuid: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partialJson },
    },
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
  } as unknown as SDKMessage;
}

function viewItem(record: AgentTimelineRecord, index: number): AgentTimelineViewItem {
  const type = (record as { type?: unknown }).type;
  return {
    record,
    displayKind: type === "user" ? "user-message" : type === "assistant" ? "assistant-final" : "hidden",
    assistantContent: type === "assistant" ? "Assistant text" : undefined,
    processHeader: false,
    stoppedByUser: false,
    processSummary: null,
    processEvents: [],
    changedFiles: [],
    processExpanded: false,
    processLockedOpen: false,
    processCollapsible: false,
    processKey: `record-${index}`,
    defaultCollapsed: true,
  };
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

const sdkOrderGroups = buildTimelineViewGroups(records, records.map(viewItem), { activeModelId: "deepseek-v4-pro" });
assert.deepEqual(sdkOrderGroups.map((group) => group.type), ["user", "assistant-turn"]);
const sdkOrderItems = sdkOrderGroups[1]?.type === "assistant-turn" ? sdkOrderGroups[1].items : [];
assert.deepEqual(
  sdkOrderItems.map((item) => item.displayKind),
  ["thinking", "assistant-final", "tool-use", "thinking", "tool-use", "assistant-final"],
);
assert.match(sdkOrderItems[0]?.assistantContent || "", /inspect the current directory/);
assert.match(sdkOrderItems[1]?.assistantContent || "", /workspace structure/);
const pwdTool = sdkOrderItems[2]?.processEvents[0];
assert.equal(pwdTool?.kind, "tool_use");
assert.equal(pwdTool?.kind === "tool_use" ? pwdTool.tool.name : "", "Bash");
assert.equal(pwdTool?.kind === "tool_use" ? pwdTool.result?.content : "", "/Users/koi/.brevyn-dev/semesters/semester-fixture");
const globTool = sdkOrderItems[4]?.processEvents[0];
assert.equal(globTool?.kind, "tool_use");
assert.equal(globTool?.kind === "tool_use" ? globTool.tool.name : "", "Glob");
assert.equal(globTool?.kind === "tool_use" ? globTool.result?.content : "", "threads/thread-fixture.jsonl");
assert.equal(sdkOrderItems[5]?.assistantContent, "The workspace contains a threads folder with one JSONL timeline file.");

const hostedSearchRecords: AgentTimelineRecord[] = [
  userText("Search today's AI news.", "user_search"),
  streamEvent({ type: "thinking_delta", thinking: "I should search the web first." }, "thinking_search"),
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

const hostedSearchGroups = buildTimelineViewGroups(hostedSearchRecords, hostedSearchRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const hostedSearchItems = hostedSearchGroups[1]?.type === "assistant-turn" ? hostedSearchGroups[1].items : [];
assert.deepEqual(hostedSearchItems.map((item) => item.displayKind), ["thinking", "tool-use", "assistant-final"]);
assert.match(hostedSearchItems[0]?.assistantContent || "", /search the web/);
const hostedSearchTool = hostedSearchItems[1]?.processEvents?.find((event) => event.kind === "tool_use");
assert.equal(hostedSearchTool?.kind, "tool_use");
assert.equal(hostedSearchTool?.kind === "tool_use" ? hostedSearchTool.tool.name : "", "WebSearch");
assert.equal(hostedSearchTool?.kind === "tool_use" ? hostedSearchTool.result?.isError : true, false);
assert.deepEqual(hostedSearchTool?.kind === "tool_use" ? (hostedSearchTool.result?.content as { links?: unknown[] }).links : [], [{
  title: "OpenAI News",
  url: "https://openai.com/news",
}]);
assert.equal(hostedSearchItems[2]?.assistantContent, "Here are the latest AI stories.");

const consecutiveToolRecords: AgentTimelineRecord[] = [
  userText("Inspect with several tools.", "user_consecutive_tools"),
  assistant([
    { type: "tool_use", id: "tool_consecutive_pwd", name: "Bash", input: { command: "pwd" } },
    { type: "tool_use", id: "tool_consecutive_glob", name: "Glob", input: { pattern: "**/*" } },
    { type: "tool_use", id: "tool_consecutive_read", name: "Read", input: { file_path: "README.md" } },
    { type: "text", text: "I inspected the workspace." },
  ], "assistant_consecutive_tools"),
  toolResult("tool_consecutive_pwd", "/tmp/workspace", "tool_consecutive_pwd_result"),
  toolResult("tool_consecutive_glob", "README.md", "tool_consecutive_glob_result"),
  toolResult("tool_consecutive_read", "# README", "tool_consecutive_read_result"),
  result("result_consecutive_tools"),
];
const consecutiveToolGroups = buildTimelineViewGroups(consecutiveToolRecords, consecutiveToolRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const consecutiveToolItems = consecutiveToolGroups[1]?.type === "assistant-turn" ? consecutiveToolGroups[1].items : [];
assert.deepEqual(consecutiveToolItems.map((item) => item.displayKind), ["tool-group", "assistant-final"]);
assert.equal(consecutiveToolItems[0]?.processEvents.length, 3);
assert.deepEqual(consecutiveToolItems[0]?.processEvents.map((event) => event.kind === "tool_use" ? event.tool.name : ""), ["Bash", "Glob", "Read"]);
assert.equal(consecutiveToolItems[1]?.assistantContent, "I inspected the workspace.");

const fragmentedThinkingRecords: AgentTimelineRecord[] = [
  userText("Inspect workspace.", "user_fragmented_thinking"),
  streamEvent({ type: "thinking_delta", thinking: "I " }, "thinking_fragment_1"),
  streamEvent({ type: "thinking_delta", thinking: "should " }, "thinking_fragment_2"),
  streamEvent({ type: "thinking_delta", thinking: "inspect " }, "thinking_fragment_3"),
  streamEvent({ type: "thinking_delta", thinking: "the " }, "thinking_fragment_4"),
  streamEvent({ type: "thinking_delta", thinking: "workspace." }, "thinking_fragment_5"),
  assistant([{ type: "text", text: "Workspace inspected." }], "assistant_fragmented_thinking"),
  result("result_fragmented_thinking"),
];
const fragmentedThinkingGroups = buildTimelineViewGroups(fragmentedThinkingRecords, fragmentedThinkingRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const fragmentedThinkingItems = fragmentedThinkingGroups[1]?.type === "assistant-turn" ? fragmentedThinkingGroups[1].items : [];
assert.deepEqual(fragmentedThinkingItems.map((item) => item.displayKind), ["thinking", "assistant-final"]);
assert.equal(fragmentedThinkingItems[0]?.assistantContent, "I should inspect the workspace.");

assert.equal(recordKey(records[0]!, 0), recordKey(records[0]!, 99));
assert.equal(
  timelineRecordIdentity({ kind: "runtime", event: { type: "run_started", threadId: "thread_fixture", runId: "run_fixture", permissionMode: "review", createdAt: "2026-05-16T00:00:00.000Z" } } as AgentTimelineRecord),
  timelineRecordIdentity({ kind: "runtime", event: { type: "run_started", threadId: "thread_fixture", runId: "run_fixture", permissionMode: "review", createdAt: "2026-05-16T00:00:00.000Z" } } as AgentTimelineRecord),
);

const duplicateThinkingRecords: AgentTimelineRecord[] = [
  userText("Think, then answer.", "user_duplicate_thinking"),
  streamEvent({ type: "thinking_delta", thinking: "I should inspect the request first." }, "live_duplicate_thinking"),
  assistant([
    { type: "thinking", thinking: "I should inspect the request first." },
    { type: "text", text: "Done." },
  ], "assistant_duplicate_thinking"),
  result("result_duplicate_thinking"),
];
const duplicateThinkingGroups = buildTimelineViewGroups(duplicateThinkingRecords, duplicateThinkingRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const duplicateThinkingItems = duplicateThinkingGroups[1]?.type === "assistant-turn" ? duplicateThinkingGroups[1].items : [];
assert.deepEqual(duplicateThinkingItems.map((item) => item.displayKind), ["thinking", "assistant-final"]);
assert.equal(duplicateThinkingItems[0]?.assistantContent, "I should inspect the request first.");

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
assert.equal(liveMergeRecords.filter((record) => (record as SDKMessage).type === "stream_event").length, 2);

const streamFinalGroups = buildTimelineViewGroups(liveMergeRecords, liveMergeRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const streamFinalItems = streamFinalGroups[1]?.type === "assistant-turn" ? streamFinalGroups[1].items : [];
assert.deepEqual(streamFinalItems.map((item) => item.displayKind), ["assistant-final"]);
assert.equal(streamFinalItems[0]?.assistantContent, "Hello world");
assert.equal((streamFinalItems[0]?.record as SDKMessage | undefined)?.type, "assistant");

const streamBeforeToolRecords = normalizeTimelineRecords(
  [
    userText("Narrate, run a tool, then conclude.", "user_stream_tool_order"),
    assistant([
      { type: "text", text: "I will inspect the workspace first." },
      { type: "tool_use", id: "tool_stream_order_pwd", name: "Bash", input: { command: "pwd" } },
      { type: "text", text: "The workspace path is available now." },
    ], "assistant_stream_tool_order"),
    toolResult("tool_stream_order_pwd", "/tmp/workspace", "tool_stream_order_pwd_result"),
  ],
  [
    streamEvent({ type: "text_delta", text: "I will inspect the workspace first." }, "stream_tool_order_text", 0),
    streamToolStart(1, { type: "tool_use", id: "tool_stream_order_pwd", name: "Bash", input: {} }, "stream_tool_order_start"),
  ],
  true,
);
const streamBeforeToolGroups = buildTimelineViewGroups(streamBeforeToolRecords, streamBeforeToolRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const streamBeforeToolItems = streamBeforeToolGroups[1]?.type === "assistant-turn" ? streamBeforeToolGroups[1].items : [];
assert.deepEqual(streamBeforeToolItems.map((item) => item.displayKind), ["assistant-final", "tool-use", "assistant-final"]);
assert.equal(streamBeforeToolItems[1]?.processEvents[0]?.kind === "tool_use" ? streamBeforeToolItems[1]?.processEvents[0]?.tool.name : "", "Bash");
assert.equal(streamBeforeToolItems[2]?.assistantContent, "The workspace path is available now.");

const outOfOrderRecords: AgentTimelineRecord[] = [
  assistant([{ type: "text", text: "This arrived before the user in live replay." }], "assistant_out_of_order"),
  userText("Keep the user as the turn boundary.", "user_out_of_order"),
];
const outOfOrderGroups = buildTimelineViewGroups(outOfOrderRecords, outOfOrderRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
assert.deepEqual(outOfOrderGroups.map((group) => group.type), ["assistant-turn", "user"]);
assert.equal(outOfOrderGroups[0]?.type === "assistant-turn" ? outOfOrderGroups[0].items[0]?.record : null, outOfOrderRecords[0]);
assert.equal(outOfOrderGroups[1]?.type === "user" ? outOfOrderGroups[1].item.record : null, outOfOrderRecords[1]);

const outOfOrderStreamRecords: AgentTimelineRecord[] = [
  streamEvent({ type: "text_delta", text: "Streaming before user replay settled." }, "stream_out_of_order"),
  userText("The stream still belongs below me.", "user_stream_out_of_order"),
];
const outOfOrderStreamGroups = buildTimelineViewGroups(outOfOrderStreamRecords, outOfOrderStreamRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
assert.deepEqual(outOfOrderStreamGroups.map((group) => group.type), ["assistant-turn", "user"]);
assert.equal(outOfOrderStreamGroups[0]?.type === "assistant-turn" ? outOfOrderStreamGroups[0].items[0]?.record : null, outOfOrderStreamRecords[0]);
assert.equal(outOfOrderStreamGroups[0]?.type === "assistant-turn" ? outOfOrderStreamGroups[0].items[0]?.streamContent : "", "Streaming before user replay settled.");

const thinkingOnlyStreamRecords: AgentTimelineRecord[] = [
  userText("Think first.", "user_thinking_stream_only"),
  streamEvent({ type: "thinking_delta", thinking: "I should inspect the request first." }, "thinking_stream_only"),
];
const thinkingOnlyStreamGroups = buildTimelineViewGroups(
  thinkingOnlyStreamRecords,
  thinkingOnlyStreamRecords.map(viewItem),
  { activeModelId: "deepseek-v4-pro", effectiveRunning: true, runSummary: { runId: "run_stream", label: "Thinking", running: true, status: "running" }, forceProcessOpen: true },
);
assert.deepEqual(thinkingOnlyStreamGroups.map((group) => group.type), ["user", "assistant-turn"]);
const thinkingOnlyItem = thinkingOnlyStreamGroups[1]?.type === "assistant-turn" ? thinkingOnlyStreamGroups[1].items[0] : undefined;
assert.equal(thinkingOnlyItem?.displayKind, "process");
assert.equal(thinkingOnlyItem?.processHeader, true);
const thinkingOnlyContentItem = thinkingOnlyStreamGroups[1]?.type === "assistant-turn" ? thinkingOnlyStreamGroups[1].items[1] : undefined;
assert.equal(thinkingOnlyContentItem?.displayKind, "thinking");
assert.equal(thinkingOnlyContentItem?.assistantContent, "I should inspect the request first.");

const liveToolRecords: AgentTimelineRecord[] = [
  userText("Run pwd.", "user_live_tool"),
  streamToolStart(0, { type: "tool_use", id: "tool_live_pwd", name: "Bash", input: {} }, "stream_tool_start"),
  streamToolInput(0, "{\"command\":\"pwd\"}", "stream_tool_input"),
];
const liveToolGroups = buildTimelineViewGroups(
  liveToolRecords,
  liveToolRecords.map(viewItem),
  { activeModelId: "deepseek-v4-pro", effectiveRunning: true, runSummary: { runId: "run_live_tool", label: "已处理 1s", running: true, status: "running" } },
);
const liveToolItems = liveToolGroups[1]?.type === "assistant-turn" ? liveToolGroups[1].items : [];
assert.deepEqual(liveToolItems.map((item) => item.displayKind), ["process", "tool-use"]);
const liveToolEvent = liveToolItems[1]?.processEvents[0];
assert.equal(liveToolEvent?.kind, "tool_use");
assert.equal(liveToolEvent?.kind === "tool_use" ? liveToolEvent.tool.name : "", "Bash");
assert.equal(liveToolEvent?.kind === "tool_use" ? (liveToolEvent.tool.input as { command?: string }).command : "", "pwd");
assert.equal(liveToolItems[0]?.processHeader, true);

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
flushAgentLiveRecords("thread_live");
const liveAssistant = getAgentLiveRecords("thread_live")[0] as SDKMessage & { _createdAt?: unknown; _channelModelId?: unknown };
assert.equal(liveAssistant.type, "assistant");
assert.equal(typeof liveAssistant._createdAt, "number");
assert.equal(liveAssistant._channelModelId, "deepseek-v4-pro");

clearAllAgentLiveRecords();
assert.equal(appendAgentLiveMessage("thread_stream_coalesce", streamEvent({ type: "text_delta", text: "Hello " }, "stream_coalesce_1")), true);
assert.equal(appendAgentLiveMessage("thread_stream_coalesce", streamEvent({ type: "text_delta", text: "world" }, "stream_coalesce_2")), true);
flushAgentLiveRecords("thread_stream_coalesce");
const coalescedStream = getAgentLiveRecords("thread_stream_coalesce");
assert.equal(coalescedStream.length, 1);
assert.equal(streamTextDelta(coalescedStream[0]!), "Hello world");

appendAgentRuntimeEvent({ type: "run_started", threadId: "thread_live", runId: "run_live", permissionMode: "review", createdAt: "2026-05-16T00:00:00.000Z" });
assert.equal(getAgentLiveRunning("thread_live"), true);
appendAgentRuntimeEvent({ type: "run_completed", threadId: "thread_live", runId: "run_live", resultSubtype: "success", createdAt: "2026-05-16T00:00:01.000Z" });
assert.equal(getAgentLiveRunning("thread_live"), false);

console.log("agentTimelineModel fixture tests passed");
