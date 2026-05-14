import assert from "node:assert/strict";
import {
  anthropicToOpenAiResponses,
  buildAnthropicUsageFromResponses,
  openAiResponsesToAnthropic,
} from "./openai-responses-anthropic-adapter";

const simple = anthropicToOpenAiResponses({
  model: "gpt-5.5",
  system: "You are helpful.",
  max_tokens: 1024,
  stream: true,
  messages: [{ role: "user", content: "Hello" }],
});

assert.equal(simple.model, "gpt-5.5");
assert.equal(simple.instructions, "You are helpful.");
assert.equal(simple.max_output_tokens, 1024);
assert.equal(simple.stream, true);
assert.deepEqual(simple.input, [{
  role: "user",
  content: [{ type: "input_text", text: "Hello" }],
}]);

const systemArray = anthropicToOpenAiResponses({
  system: [
    { type: "text", text: "x-anthropic-billing-header: cc_version=1;\n\nPart 1" },
    { type: "text", text: "Part 2" },
  ],
  messages: [{ role: "user", content: "Hi" }],
});

assert.equal(systemArray.instructions, "Part 1\n\nPart 2");

const withTools = anthropicToOpenAiResponses({
  model: "gpt-5.5",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Read this" },
        { type: "image", source: { media_type: "image/jpeg", data: "abc123" } },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I will read it." },
        { type: "tool_use", id: "tool_1", name: "Read", input: { offset: 0, file_path: "/tmp/a.md" } },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tool_1", content: { ok: true, lines: 3 } },
      ],
    },
  ],
  tools: [
    {
      name: "Read",
      description: "Read a file",
      input_schema: {
        type: "object",
        cache_control: { type: "ephemeral" },
        properties: { file_path: { type: "string" } },
      },
    },
    { type: "BatchTool", name: "BatchTool" },
  ],
  tool_choice: { type: "tool", name: "Read" },
});

assert.deepEqual(withTools.tools, [{
  type: "function",
  name: "Read",
  description: "Read a file",
  parameters: {
    type: "object",
    properties: { file_path: { type: "string" } },
  },
}]);
assert.deepEqual(withTools.tool_choice, { type: "function", name: "Read" });
assert.deepEqual(withTools.input, [
  {
    role: "user",
    content: [
      { type: "input_text", text: "Read this" },
      { type: "input_image", image_url: "data:image/jpeg;base64,abc123" },
    ],
  },
  {
    role: "assistant",
    content: [{ type: "output_text", text: "I will read it." }],
  },
  {
    type: "function_call",
    call_id: "tool_1",
    name: "Read",
    arguments: "{\"file_path\":\"/tmp/a.md\",\"offset\":0}",
  },
  {
    type: "function_call_output",
    call_id: "tool_1",
    output: "{\"lines\":3,\"ok\":true}",
  },
]);

const withHostedWebSearch = anthropicToOpenAiResponses({
  model: "gpt-5.5",
  messages: [{ role: "user", content: "Search today's news" }],
  tools: [
    {
      name: "WebSearch",
      description: "Search the web",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      name: "WebFetch",
      description: "Fetch a URL",
      input_schema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  ],
  tool_choice: { type: "tool", name: "WebSearch" },
});

assert.deepEqual(withHostedWebSearch.tools, [
  { type: "web_search" },
  {
    type: "function",
    name: "WebFetch",
    description: "Fetch a URL",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
]);
assert.deepEqual(withHostedWebSearch.tool_choice, { type: "web_search" });

const anthropic = openAiResponsesToAnthropic({
  id: "resp_1",
  model: "gpt-5.5",
  status: "completed",
  output: [
    {
      type: "reasoning",
      summary: [{ type: "summary_text", text: "I should use the tool." }],
    },
    {
      type: "message",
      content: [{ type: "output_text", text: "Let me read that." }],
    },
    {
      type: "function_call",
      call_id: "tool_1",
      name: "Read",
      arguments: "{\"file_path\":\"/tmp/a.md\",\"pages\":\"\"}",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    prompt_tokens_details: { cached_tokens: 4 },
  },
});

assert.deepEqual(anthropic, {
  id: "resp_1",
  type: "message",
  role: "assistant",
  model: "gpt-5.5",
  content: [
    { type: "thinking", thinking: "I should use the tool." },
    { type: "text", text: "Let me read that." },
    { type: "tool_use", id: "tool_1", name: "Read", input: { file_path: "/tmp/a.md" } },
  ],
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: {
    input_tokens: 6,
    output_tokens: 20,
    cache_read_input_tokens: 4,
  },
});

const citedAnthropic = openAiResponsesToAnthropic({
  id: "resp_cited",
  model: "gpt-5.5",
  status: "completed",
  output: [{
    type: "message",
    content: [{
      type: "output_text",
      text: "OpenAI announced news.",
      annotations: [{
        type: "url_citation",
        url: "https://openai.com/news",
        title: "OpenAI News",
        start_index: 0,
        end_index: 6,
      }],
    }],
  }],
});

assert.deepEqual(citedAnthropic.content, [{
  type: "text",
  text: "OpenAI announced news.",
  citations: [{
    type: "web_search_result_location",
    url: "https://openai.com/news",
    title: "OpenAI News",
    start_index: 0,
    end_index: 6,
  }],
}]);

const hostedSearchAnthropic = openAiResponsesToAnthropic({
  id: "resp_hosted_search",
  model: "gpt-5.5",
  status: "completed",
  output: [
    {
      type: "web_search_call",
      id: "ws_1",
      status: "completed",
      action: { queries: [{ query: "AI news today" }] },
    },
    {
      type: "message",
      content: [{ type: "output_text", text: "Found news." }],
    },
  ],
});

assert.deepEqual(hostedSearchAnthropic.content, [
  {
    type: "server_tool_use",
    id: "ws_1",
    name: "WebSearch",
    input: {
      hosted: true,
      status: "completed",
      providerStatus: "completed",
      query: "AI news today",
      queries: ["AI news today"],
    },
  },
  { type: "text", text: "Found news." },
]);
assert.equal(hostedSearchAnthropic.stop_reason, "end_turn");

assert.deepEqual(buildAnthropicUsageFromResponses({
  input_tokens: 11,
  output_tokens: 22,
  input_tokens_details: { cached_tokens: 5 },
  cache_creation_input_tokens: 6,
}), {
  input_tokens: 6,
  output_tokens: 22,
  cache_read_input_tokens: 5,
  cache_creation_input_tokens: 6,
});

assert.deepEqual(buildAnthropicUsageFromResponses({
  input_tokens: 11,
  output_tokens: 22,
  cache_read_input_tokens: 5,
}), {
  input_tokens: 11,
  output_tokens: 22,
  cache_read_input_tokens: 5,
});

const maxTokens = openAiResponsesToAnthropic({
  id: "resp_2",
  model: "gpt-5.5",
  status: "incomplete",
  incomplete_details: { reason: "max_output_tokens" },
  output: [{ type: "message", content: [{ type: "output_text", text: "Partial" }] }],
});

assert.equal(maxTokens.stop_reason, "max_tokens");

assert.throws(() => openAiResponsesToAnthropic({
  id: "resp_failed",
  model: "gpt-5.5",
  status: "failed",
  error: { code: "bad_request", message: "Hosted tool is unavailable" },
}), /Hosted tool is unavailable/);

console.log("openai-responses-anthropic-adapter tests passed");
