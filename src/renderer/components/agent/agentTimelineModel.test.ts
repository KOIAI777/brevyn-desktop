import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { assistantText, groupIntoTurns, latestTurnBounds, normalizeTimelineRecords, recordKey, streamTextDelta, timelineRecordIdentity, type AgentTimelineRecord } from "./agentTimelineModel";
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

function systemCompact(subtype: "compacting" | "compact_boundary", uuid: string): SDKMessage {
  return {
    type: "system",
    subtype,
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
  } as unknown as SDKMessage;
}

function systemPermissionDenied(uuid: string): SDKMessage {
  return {
    type: "system",
    subtype: "permission_denied",
    tool_name: "Bash",
    tool_use_id: "tool_denied",
    message: "Permission denied.",
    decision_reason: "The command looked risky.",
    session_id: "session_fixture",
    uuid,
    _createdAt: 3,
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
    stoppedByUser: false,
    processSummary: null,
    processEvents: [],
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
const consecutiveToolTurn = consecutiveToolGroups[1]?.type === "assistant-turn" ? consecutiveToolGroups[1] : undefined;
assert.deepEqual(consecutiveToolItems.map((item) => item.displayKind), ["tool-use", "tool-use", "tool-use", "assistant-final"]);
assert.deepEqual(consecutiveToolTurn?.entries.map((entry) => entry.type), ["tool-group", "item"]);
assert.equal(consecutiveToolTurn?.entries[0]?.key, "tool-tool_consecutive_pwd");
assert.equal(consecutiveToolTurn?.entries[0]?.type === "tool-group" ? consecutiveToolTurn.entries[0].summary.parts.join(" ") : "", "已探索 2 个文件 已运行 1 条命令");
assert.deepEqual(
  consecutiveToolItems.slice(0, 3).map((item) => item.processEvents[0]?.kind === "tool_use" ? item.processEvents[0].tool.name : ""),
  ["Bash", "Glob", "Read"],
);
assert.equal(consecutiveToolItems[3]?.assistantContent, "I inspected the workspace.");

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
  timelineRecordIdentity({ kind: "runtime", event: { type: "run_started", threadId: "thread_fixture", runId: "run_fixture", permissionMode: "auto", createdAt: "2026-05-16T00:00:00.000Z" } } as AgentTimelineRecord),
  timelineRecordIdentity({ kind: "runtime", event: { type: "run_started", threadId: "thread_fixture", runId: "run_fixture", permissionMode: "auto", createdAt: "2026-05-16T00:00:00.000Z" } } as AgentTimelineRecord),
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

const mismatchedStreamIndexRecords: AgentTimelineRecord[] = [
  userText("Stream text, then finalize with shifted block index.", "user_shifted_stream"),
  streamEvent({ type: "text_delta", text: "Hello " }, "stream_shifted_1", 0),
  streamEvent({ type: "text_delta", text: "world" }, "stream_shifted_2", 0),
  assistant([
    { type: "thinking", thinking: "Preparing." },
    { type: "text", text: "Hello world" },
  ], "assistant_shifted_stream_final"),
];
const mismatchedStreamIndexGroups = buildTimelineViewGroups(mismatchedStreamIndexRecords, mismatchedStreamIndexRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const mismatchedStreamIndexItems = mismatchedStreamIndexGroups[1]?.type === "assistant-turn" ? mismatchedStreamIndexGroups[1].items : [];
assert.deepEqual(mismatchedStreamIndexItems.map((item) => item.displayKind), ["thinking", "assistant-final"]);
assert.equal(mismatchedStreamIndexItems[1]?.assistantContent, "Hello world");

const duplicateFinalRecords: AgentTimelineRecord[] = [
  userText("Avoid duplicate final text.", "user_duplicate_final"),
  assistant([{ type: "text", text: "好的，我来一步步完成这个任务。" }], "assistant_duplicate_final_live"),
  assistant([{ type: "text", text: "好的，我来一步步完成这个任务。" }], "assistant_duplicate_final_persisted"),
  streamEvent({ type: "text_delta", text: "好的，我来一步步完成这个任务。" }, "stream_duplicate_after_final", 0),
];
const duplicateFinalGroups = buildTimelineViewGroups(duplicateFinalRecords, duplicateFinalRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const duplicateFinalItems = duplicateFinalGroups[1]?.type === "assistant-turn" ? duplicateFinalGroups[1].items : [];
assert.deepEqual(duplicateFinalItems.map((item) => item.displayKind), ["assistant-final"]);
assert.equal(duplicateFinalItems[0]?.assistantContent, "好的，我来一步步完成这个任务。");

const runningStreamFinalGroups = buildTimelineViewGroups(liveMergeRecords, liveMergeRecords.map(viewItem), { activeModelId: "deepseek-v4-pro", effectiveRunning: true });
const runningStreamFinalItems = runningStreamFinalGroups[1]?.type === "assistant-turn" ? runningStreamFinalGroups[1].items : [];
assert.deepEqual(runningStreamFinalItems.map((item) => item.displayKind), ["assistant-final"]);
assert.equal(runningStreamFinalItems[0]?.assistantContent, "Hello world");

const runningMismatchedFinalRecords: AgentTimelineRecord[] = [
  userText("Stream, then final arrives early.", "user_running_mismatch"),
  streamEvent({ type: "text_delta", text: "中文流式段落。" }, "stream_running_mismatch", 2),
  assistant([
    { type: "text", text: "English final text should not render while running." },
    { type: "tool_use", id: "tool_running_mismatch", name: "Read", input: { file_path: "a.md" } },
    { type: "text", text: "中文流式段落。" },
  ], "assistant_running_mismatch"),
];
const runningMismatchedGroups = buildTimelineViewGroups(runningMismatchedFinalRecords, runningMismatchedFinalRecords.map(viewItem), { activeModelId: "deepseek-v4-pro", effectiveRunning: true });
const runningMismatchedItems = runningMismatchedGroups[1]?.type === "assistant-turn" ? runningMismatchedGroups[1].items : [];
assert.deepEqual(runningMismatchedItems.map((item) => item.displayKind), ["assistant-final", "tool-use", "assistant-final"]);
assert.equal(runningMismatchedItems[2]?.assistantContent, "中文流式段落。");

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

const shiftedToolIndexRecords = normalizeTimelineRecords(
  [
    userText("Read two files.", "user_shifted_tool_index"),
    assistant([
      { type: "text", text: "I will read both files." },
      { type: "tool_use", id: "tool_shifted_read_a", name: "Read", input: { file_path: "tool-group-a.md" } },
      { type: "tool_use", id: "tool_shifted_read_b", name: "Read", input: { file_path: "tool-group-b.md" } },
    ], "assistant_shifted_tool_index"),
    toolResult("tool_shifted_read_a", "a", "tool_shifted_read_a_result"),
    toolResult("tool_shifted_read_b", "b", "tool_shifted_read_b_result"),
  ],
  [
    streamToolStart(0, { type: "tool_use", id: "tool_shifted_read_a", name: "Read", input: {} }, "stream_shifted_tool_a"),
    streamToolInput(0, "{\"file_path\":\"tool-group-a.md\"}", "stream_shifted_tool_a_input"),
    streamToolStart(1, { type: "tool_use", id: "tool_shifted_read_b", name: "Read", input: {} }, "stream_shifted_tool_b"),
    streamToolInput(1, "{\"file_path\":\"tool-group-b.md\"}", "stream_shifted_tool_b_input"),
  ],
  true,
);
const shiftedToolIndexGroups = buildTimelineViewGroups(shiftedToolIndexRecords, shiftedToolIndexRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const shiftedToolIndexItems = shiftedToolIndexGroups[1]?.type === "assistant-turn" ? shiftedToolIndexGroups[1].items : [];
assert.deepEqual(shiftedToolIndexItems.map((item) => item.displayKind), ["assistant-final", "tool-use", "tool-use"]);
assert.deepEqual(
  shiftedToolIndexItems.filter((item) => item.displayKind === "tool-use").map((item) => item.processEvents[0]?.kind === "tool_use" ? item.processEvents[0].tool.id : ""),
  ["tool_shifted_read_a", "tool_shifted_read_b"],
);

const outOfOrderRecords: AgentTimelineRecord[] = [
  assistant([{ type: "text", text: "This arrived before the user in live replay." }], "assistant_out_of_order"),
  userText("Keep the user as the turn boundary.", "user_out_of_order"),
];
const outOfOrderGroups = buildTimelineViewGroups(outOfOrderRecords, outOfOrderRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
assert.deepEqual(outOfOrderGroups.map((group) => group.type), ["user", "assistant-turn"]);
assert.equal(outOfOrderGroups[0]?.type === "user" ? outOfOrderGroups[0].item.record : null, outOfOrderRecords[1]);
assert.equal(outOfOrderGroups[1]?.type === "assistant-turn" ? outOfOrderGroups[1].items[0]?.record : null, outOfOrderRecords[0]);

const outOfOrderStreamRecords: AgentTimelineRecord[] = [
  streamEvent({ type: "text_delta", text: "Streaming before user replay settled." }, "stream_out_of_order"),
  userText("The stream still belongs below me.", "user_stream_out_of_order"),
];
const outOfOrderStreamGroups = buildTimelineViewGroups(outOfOrderStreamRecords, outOfOrderStreamRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
assert.deepEqual(outOfOrderStreamGroups.map((group) => group.type), ["user", "assistant-turn"]);
assert.equal(outOfOrderStreamGroups[0]?.type === "user" ? outOfOrderStreamGroups[0].item.record : null, outOfOrderStreamRecords[1]);
assert.equal(outOfOrderStreamGroups[1]?.type === "assistant-turn" ? outOfOrderStreamGroups[1].items[0]?.record : null, outOfOrderStreamRecords[0]);
assert.equal(outOfOrderStreamGroups[1]?.type === "assistant-turn" ? outOfOrderStreamGroups[1].items[0]?.assistantContent : "", "Streaming before user replay settled.");

const compactingBoundaryRecords: AgentTimelineRecord[] = [
  userText("Compact and continue.", "user_compacting_boundary"),
  assistant([{ type: "text", text: "Before compact." }], "assistant_before_compacting"),
  systemCompact("compacting", "system_compacting_boundary"),
  assistant([{ type: "text", text: "After compact." }], "assistant_after_compacting"),
];
const compactingBoundaryGroups = groupIntoTurns(compactingBoundaryRecords, "deepseek-v4-pro");
assert.deepEqual(compactingBoundaryGroups.map((group) => group.type), ["user", "assistant-turn", "system", "assistant-turn"]);
assert.deepEqual(
  compactingBoundaryGroups
    .filter((group) => group.type === "assistant-turn")
    .map((group) => group.assistantMessages.map((message) => assistantText(message)).join(" ")),
  ["Before compact.", "After compact."],
);

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
const thinkingOnlyTurn = thinkingOnlyStreamGroups[1]?.type === "assistant-turn" ? thinkingOnlyStreamGroups[1] : undefined;
assert.equal(thinkingOnlyTurn?.processItem?.displayKind, "process");
assert.deepEqual(thinkingOnlyTurn?.items.map((item) => item.displayKind), ["thinking"]);
assert.equal(thinkingOnlyTurn?.items[0]?.assistantContent, "I should inspect the request first.");

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
assert.equal(liveToolGroups[1]?.type === "assistant-turn" ? liveToolGroups[1].processItem?.displayKind : undefined, "process");
assert.deepEqual(liveToolItems.map((item) => item.displayKind), ["tool-use"]);
const liveToolEvent = liveToolItems[0]?.processEvents[0];
assert.equal(liveToolEvent?.kind, "tool_use");
assert.equal(liveToolEvent?.kind === "tool_use" ? liveToolEvent.tool.name : "", "Bash");
assert.equal(liveToolEvent?.kind === "tool_use" ? (liveToolEvent.tool.input as { command?: string }).command : "", "pwd");

const livePartialInputGroups = buildTimelineViewGroups(
  [
    userText("Read a file.", "user_live_partial_input"),
    streamToolStart(0, { type: "tool_use", id: "tool_live_partial_read", name: "Read", input: {} }, "stream_tool_partial_start"),
    streamToolInput(0, "{\"file_path\":\"notes", "stream_tool_partial_input"),
  ],
  [
    userText("Read a file.", "user_live_partial_input"),
    streamToolStart(0, { type: "tool_use", id: "tool_live_partial_read", name: "Read", input: {} }, "stream_tool_partial_start"),
    streamToolInput(0, "{\"file_path\":\"notes", "stream_tool_partial_input"),
  ].map(viewItem),
  { activeModelId: "deepseek-v4-pro", effectiveRunning: true },
);
const livePartialTurn = livePartialInputGroups[1]?.type === "assistant-turn" ? livePartialInputGroups[1] : undefined;
assert.equal(livePartialTurn?.entries[0]?.type === "item" ? livePartialTurn.entries[0].item.processEvents[0]?.kind === "tool_use" ? (livePartialTurn.entries[0].item.processEvents[0].tool.input as { file_path?: string }).file_path : "" : "", "notes");

const runningToolGroupTitleGroups = buildTimelineViewGroups(
  [
    userText("Read then edit.", "user_running_tool_group_title"),
    streamToolStart(0, { type: "tool_use", id: "tool_title_read", name: "Read", input: {} }, "stream_title_read_start"),
    streamToolInput(0, "{\"file_path\":\"old.md\"}", "stream_title_read_input"),
    streamToolStart(1, { type: "tool_use", id: "tool_title_edit", name: "Edit", input: {} }, "stream_title_edit_start"),
    streamToolInput(1, "{\"file_path\":\"draft.md\"}", "stream_title_edit_input"),
  ],
  [
    userText("Read then edit.", "user_running_tool_group_title"),
    streamToolStart(0, { type: "tool_use", id: "tool_title_read", name: "Read", input: {} }, "stream_title_read_start"),
    streamToolInput(0, "{\"file_path\":\"old.md\"}", "stream_title_read_input"),
    streamToolStart(1, { type: "tool_use", id: "tool_title_edit", name: "Edit", input: {} }, "stream_title_edit_start"),
    streamToolInput(1, "{\"file_path\":\"draft.md\"}", "stream_title_edit_input"),
  ].map(viewItem),
  { activeModelId: "deepseek-v4-pro", effectiveRunning: true },
);
const runningToolGroupTitleTurn = runningToolGroupTitleGroups[1]?.type === "assistant-turn" ? runningToolGroupTitleGroups[1] : undefined;
assert.equal(runningToolGroupTitleTurn?.entries[0]?.type === "tool-group" ? runningToolGroupTitleTurn.entries[0].summary.parts.join(" ") : "", "正在编辑 draft.md");

const streamToolWithResultOnlyRecords: AgentTimelineRecord[] = [
  userText("Read, then answer.", "user_stream_tool_result_only"),
  streamToolStart(0, { type: "tool_use", id: "tool_stream_read", name: "Read", input: {} }, "stream_tool_result_only_start"),
  streamToolInput(0, "{\"file_path\":\"notes.md\"}", "stream_tool_result_only_input"),
  toolResult("tool_stream_read", "note contents", "tool_stream_read_result"),
  assistant([{ type: "text", text: "I read the file." }], "assistant_stream_tool_result_only_final"),
  result("result_stream_tool_result_only"),
];
const streamToolWithResultOnlyGroups = buildTimelineViewGroups(streamToolWithResultOnlyRecords, streamToolWithResultOnlyRecords.map(viewItem), { activeModelId: "deepseek-v4-pro" });
const streamToolWithResultOnlyItems = streamToolWithResultOnlyGroups[1]?.type === "assistant-turn" ? streamToolWithResultOnlyGroups[1].items : [];
assert.deepEqual(streamToolWithResultOnlyItems.map((item) => item.displayKind), ["tool-use", "assistant-final"]);
const streamToolWithResultOnlyEvent = streamToolWithResultOnlyItems[0]?.processEvents[0];
assert.equal(streamToolWithResultOnlyEvent?.kind, "tool_use");
assert.equal(streamToolWithResultOnlyEvent?.kind === "tool_use" ? streamToolWithResultOnlyEvent.result?.content : "", "note contents");
assert.equal(streamToolWithResultOnlyItems[0]?.assistantStreaming, false);

const interleavedThinkingToolRecords: AgentTimelineRecord[] = [
  userText("Think, use a tool, then think again.", "user_interleaved_thinking"),
  streamEvent({ type: "thinking_delta", thinking: "First thought. " }, "thinking_interleaved_1", 0),
  streamEvent({ type: "thinking_delta", thinking: "Still first." }, "thinking_interleaved_2", 0),
  streamToolStart(1, { type: "tool_use", id: "tool_interleaved_pwd", name: "Bash", input: {} }, "tool_interleaved_start"),
  streamToolInput(1, "{\"command\":\"pwd\"}", "tool_interleaved_input"),
  streamEvent({ type: "thinking_delta", thinking: "Second thought after the tool." }, "thinking_interleaved_3", 2),
];
const interleavedThinkingGroups = buildTimelineViewGroups(
  interleavedThinkingToolRecords,
  interleavedThinkingToolRecords.map(viewItem),
  { activeModelId: "deepseek-v4-pro", effectiveRunning: true, runSummary: { runId: "run_interleaved", label: "已处理 1s", running: true, status: "running" } },
);
const interleavedThinkingItems = interleavedThinkingGroups[1]?.type === "assistant-turn" ? interleavedThinkingGroups[1].items : [];
assert.deepEqual(interleavedThinkingItems.map((item) => item.displayKind), ["thinking", "tool-use", "thinking"]);
assert.equal(interleavedThinkingItems[0]?.assistantContent, "First thought. Still first.");
assert.equal(interleavedThinkingItems[2]?.assistantContent, "Second thought after the tool.");

const promptSuggestion = {
  type: "prompt_suggestion",
  suggestion: "Do something else",
  uuid: "prompt_suggestion_1",
} as unknown as SDKMessage;
const promptSuggestionRecords = normalizeTimelineRecords([userText("Hi.", "user_prompt_suggestion")], [promptSuggestion], false);
assert.equal(promptSuggestionRecords.some((record) => (record as SDKMessage).type === "prompt_suggestion"), false);

const permissionDeniedRecords = normalizeTimelineRecords(
  [userText("Run a risky command.", "user_permission_denied"), systemPermissionDenied("permission_denied_1")],
  [],
  false,
);
assert.equal(permissionDeniedRecords.some((record) => (record as SDKMessage & { subtype?: unknown }).subtype === "permission_denied"), true);
const permissionDeniedGroups = groupIntoTurns(permissionDeniedRecords);
assert.equal(permissionDeniedGroups.some((group) => group.type === "system"), true);

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
assert.equal(coalescedStream.length, 2);
assert.equal(streamTextDelta(coalescedStream[0]!), "Hello ");
assert.equal(streamTextDelta(coalescedStream[1]!), "world");

clearAllAgentLiveRecords();
assert.equal(appendAgentLiveMessage("thread_stream_block_index", streamEvent({ type: "text_delta", text: "First block" }, "stream_block_0", 0)), true);
assert.equal(appendAgentLiveMessage("thread_stream_block_index", streamEvent({ type: "text_delta", text: "Second block" }, "stream_block_1", 1)), true);
flushAgentLiveRecords("thread_stream_block_index");
assert.equal(getAgentLiveRecords("thread_stream_block_index").length, 2);

clearAllAgentLiveRecords();
assert.equal(appendAgentLiveMessage("thread_live", userText("Keep optimistic user visible.", "live_user_before_run_started")), true);
flushAgentLiveRecords("thread_live");
appendAgentRuntimeEvent({ type: "run_started", threadId: "thread_live", runId: "run_live", permissionMode: "auto", createdAt: "2026-05-16T00:00:00.000Z" });
assert.equal(getAgentLiveRunning("thread_live"), true);
assert.equal((getAgentLiveRecords("thread_live")[0] as SDKMessage | undefined)?.uuid, "live_user_before_run_started");
appendAgentRuntimeEvent({ type: "run_completed", threadId: "thread_live", runId: "run_live", resultSubtype: "success", createdAt: "2026-05-16T00:00:01.000Z" });
assert.equal(getAgentLiveRunning("thread_live"), false);

console.log("agentTimelineModel fixture tests passed");
