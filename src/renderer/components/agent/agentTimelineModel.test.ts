import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildTimelineRenderMeta, latestTurnBounds, type AgentTimelineRecord } from "./agentTimelineModel";

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
assert.equal(firstNarration?.attachProcess, undefined);

const finalMeta = meta.byIndex.get(5);
assert.equal(finalMeta?.attachProcess, true);
assert.equal(finalMeta?.processHeader, true);
assert.equal(finalMeta?.assistantCopyContent, "The workspace contains a threads folder with one JSONL timeline file.");
assert.equal(finalMeta?.processEvents?.length, 5);
assert.deepEqual(
  finalMeta?.processEvents?.map((event) => event.kind),
  ["thinking", "narration", "tool_use", "thinking", "tool_use"],
);

const [firstThinking, narration, pwdTool, secondThinking, globTool] = finalMeta?.processEvents || [];
assert.equal(firstThinking?.kind, "thinking");
assert.match(firstThinking?.kind === "thinking" ? firstThinking.text : "", /inspect/);
assert.equal(narration?.kind, "narration");
assert.match(narration?.kind === "narration" ? narration.text : "", /workspace structure/);
assert.equal(pwdTool?.kind, "tool_use");
assert.equal(pwdTool?.kind === "tool_use" ? pwdTool.tool.name : "", "Bash");
assert.equal(pwdTool?.kind === "tool_use" ? pwdTool.result?.content : "", "/Users/koi/.brevyn-dev/semesters/semester-fixture");
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
const hostedSearchFinal = hostedSearchMeta.byIndex.get(2);
const hostedSearchTool = hostedSearchFinal?.processEvents?.find((event) => event.kind === "tool_use");
assert.equal(hostedSearchFinal?.attachProcess, true);
assert.equal(hostedSearchFinal?.processEvents?.[0]?.kind, "thinking");
assert.match(hostedSearchFinal?.processEvents?.[0]?.kind === "thinking" ? hostedSearchFinal.processEvents[0].text : "", /search the web/);
assert.equal(hostedSearchTool?.kind, "tool_use");
assert.equal(hostedSearchTool?.kind === "tool_use" ? hostedSearchTool.tool.name : "", "WebSearch");
assert.equal(hostedSearchTool?.kind === "tool_use" ? hostedSearchTool.result?.isError : true, false);
assert.deepEqual(hostedSearchTool?.kind === "tool_use" ? (hostedSearchTool.result?.content as { links?: unknown[] }).links : [], [{
  title: "OpenAI News",
  url: "https://openai.com/news",
}]);
assert.equal(hostedSearchFinal?.assistantCopyContent, "Here are the latest AI stories.");

console.log("agentTimelineModel fixture tests passed");
