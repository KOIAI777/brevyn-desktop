type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface AnthropicMessagesRequest {
  model?: string;
  system?: string | Array<{ type?: string; text?: string }>;
  messages?: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export interface AnthropicMessage {
  role?: "user" | "assistant" | string;
  content?: string | AnthropicContentBlock[];
  [key: string]: unknown;
}

export type AnthropicContentBlock =
  | { type: "text"; text?: string; [key: string]: unknown }
  | { type: "image"; source?: { media_type?: string; data?: string }; [key: string]: unknown }
  | { type: "tool_use"; id?: string; name?: string; input?: unknown; [key: string]: unknown }
  | { type: "tool_result"; tool_use_id?: string; content?: unknown; [key: string]: unknown }
  | { type: "thinking"; thinking?: string; [key: string]: unknown }
  | { type?: string; [key: string]: unknown };

export interface AnthropicTool {
  name?: string;
  description?: string;
  input_schema?: unknown;
  type?: string;
  [key: string]: unknown;
}

export interface AnthropicMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicResponseContentBlock[];
  model: string;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | null;
  stop_sequence: null;
  usage: AnthropicUsage;
}

export type AnthropicResponseContentBlock =
  | { type: "text"; text: string; citations?: Record<string, unknown>[] }
  | { type: "thinking"; thinking: string }
  | { type: "server_tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface OpenAiResponsesRequest {
  model?: string;
  instructions?: string;
  input?: unknown[];
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export function anthropicToOpenAiResponses(body: AnthropicMessagesRequest): OpenAiResponsesRequest {
  const result: OpenAiResponsesRequest = {};

  if (typeof body.model === "string" && body.model.trim()) result.model = body.model;

  const instructions = normalizeSystemInstructions(body.system);
  if (instructions) result.instructions = instructions;

  if (Array.isArray(body.messages)) result.input = convertMessagesToResponsesInput(body.messages);
  if (typeof body.max_tokens === "number") result.max_output_tokens = body.max_tokens;
  if (typeof body.temperature === "number") result.temperature = body.temperature;
  if (typeof body.top_p === "number") result.top_p = body.top_p;
  if (typeof body.stream === "boolean") result.stream = body.stream;

  if (Array.isArray(body.tools)) {
    const tools = body.tools
      .filter((tool) => tool.type !== "BatchTool")
      .flatMap(mapAnthropicToolToResponsesTools);
    if (tools.length > 0) result.tools = tools;
  }

  const toolChoice = mapToolChoiceToResponses(body.tool_choice);
  if (toolChoice !== undefined) result.tool_choice = toolChoice;

  return result;
}

function mapAnthropicToolToResponsesTools(tool: AnthropicTool): unknown[] {
  const name = typeof tool.name === "string" ? tool.name : "";
  if (!name) return [];

  if (isWebSearchToolName(name)) {
    return [{ type: "web_search" }];
  }

  return [{
    type: "function",
    name,
    description: tool.description,
    parameters: cleanJsonSchema(tool.input_schema || {}),
  }];
}

export function openAiResponsesToAnthropic(body: unknown): AnthropicMessagesResponse {
  const object = recordOf(body);
  if (stringOf(object.status) === "failed") {
    throw new Error(responseErrorMessage(object));
  }
  const output = arrayOf(object.output);
  if (!output) throw new Error("OpenAI Responses payload is missing output[]");

  const content: AnthropicResponseContentBlock[] = [];
  let hasToolUse = false;

  for (const item of output) {
    const itemObject = recordOf(item);
    const itemType = stringOf(itemObject.type);

    if (itemType === "message") {
      for (const block of arrayOf(itemObject.content) || []) {
        const blockObject = recordOf(block);
        const blockType = stringOf(blockObject.type);
        if (blockType === "output_text") {
          const text = stringOf(blockObject.text);
          if (text) {
            const citations = annotationsToAnthropicCitations(arrayOf(blockObject.annotations) || []);
            content.push(citations.length > 0 ? { type: "text", text, citations } : { type: "text", text });
          }
        } else if (blockType === "refusal") {
          const refusal = stringOf(blockObject.refusal) || stringOf(blockObject.text);
          if (refusal) content.push({ type: "text", text: refusal });
        }
      }
      continue;
    }

    if (itemType === "function_call") {
      const id = stringOf(itemObject.call_id) || stringOf(itemObject.id);
      const name = stringOf(itemObject.name);
      const input = sanitizeAnthropicToolUseInput(name, parseJsonObjectString(stringOf(itemObject.arguments)));
      content.push({ type: "tool_use", id, name, input });
      hasToolUse = true;
      continue;
    }

    if (itemType === "web_search_call") {
      content.push({
        type: "server_tool_use",
        id: stringOf(itemObject.id),
        name: "WebSearch",
        input: hostedWebSearchInput(itemObject),
      });
      continue;
    }

    if (itemType === "reasoning") {
      const thinking = extractReasoningSummary(itemObject);
      if (thinking) content.push({ type: "thinking", thinking });
    }
  }

  return {
    id: stringOf(object.id),
    type: "message",
    role: "assistant",
    content,
    model: stringOf(object.model),
    stop_reason: mapResponsesStopReason(stringOf(object.status), hasToolUse, stringOf(recordOf(object.incomplete_details).reason)),
    stop_sequence: null,
    usage: buildAnthropicUsageFromResponses(object.usage),
  };
}

export function buildAnthropicUsageFromResponses(usage: unknown): AnthropicUsage {
  const object = recordOf(usage);
  const totalInputTokens = numberOf(object.input_tokens) ?? numberOf(object.prompt_tokens) ?? 0;
  const inputDetails = recordOf(object.input_tokens_details);
  const promptDetails = recordOf(object.prompt_tokens_details);
  const cachedFromDetails = numberOf(inputDetails.cached_tokens) ?? numberOf(promptDetails.cached_tokens);
  const result: AnthropicUsage = {
    input_tokens: cachedFromDetails !== undefined ? Math.max(0, totalInputTokens - cachedFromDetails) : totalInputTokens,
    output_tokens: numberOf(object.output_tokens) ?? numberOf(object.completion_tokens) ?? 0,
  };

  if (cachedFromDetails !== undefined) result.cache_read_input_tokens = cachedFromDetails;

  const cacheRead = numberOf(object.cache_read_input_tokens);
  if (cacheRead !== undefined) result.cache_read_input_tokens = cacheRead;

  const cacheCreation = numberOf(object.cache_creation_input_tokens);
  if (cacheCreation !== undefined) result.cache_creation_input_tokens = cacheCreation;

  return result;
}

export function mapResponsesStopReason(
  status: string,
  hasToolUse: boolean,
  incompleteReason?: string,
): AnthropicMessagesResponse["stop_reason"] {
  if (status === "completed" && hasToolUse) return "tool_use";
  if (status === "completed") return "end_turn";
  if (status === "incomplete" && (!incompleteReason || incompleteReason === "max_output_tokens" || incompleteReason === "max_tokens")) {
    return "max_tokens";
  }
  if (status === "incomplete") return "end_turn";
  return "end_turn";
}

export function sanitizeAnthropicToolUseInput(name: string, input: unknown): unknown {
  if (name !== "Read") return input;
  const object = recordOf(input);
  if (object.pages === "") {
    const next = { ...object };
    delete next.pages;
    return next;
  }
  return input;
}

function normalizeSystemInstructions(system: AnthropicMessagesRequest["system"]): string {
  if (typeof system === "string") return stripLeadingAnthropicBillingHeader(system).trim();
  if (!Array.isArray(system)) return "";
  return system
    .flatMap((part) => typeof part.text === "string" ? [stripLeadingAnthropicBillingHeader(part.text).trim()] : [])
    .filter(Boolean)
    .join("\n\n");
}

function convertMessagesToResponsesInput(messages: AnthropicMessage[]): unknown[] {
  const input: unknown[] = [];
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "user";
    const content = message.content;

    if (typeof content === "string") {
      input.push({
        role,
        content: [{ type: role === "assistant" ? "output_text" : "input_text", text: content }],
      });
      continue;
    }

    if (!Array.isArray(content)) {
      input.push({ role });
      continue;
    }

    let messageContent: unknown[] = [];
    const flushMessageContent = () => {
      if (messageContent.length === 0) return;
      input.push({ role, content: messageContent });
      messageContent = [];
    };

    for (const block of content) {
      if (block.type === "text") {
        const text = typeof block.text === "string" ? block.text : "";
        if (text) messageContent.push({ type: role === "assistant" ? "output_text" : "input_text", text });
        continue;
      }

      if (block.type === "image") {
        const source = recordOf(block.source);
        const mediaType = stringOf(source.media_type) || "image/png";
        const data = stringOf(source.data);
        if (data) messageContent.push({ type: "input_image", image_url: `data:${mediaType};base64,${data}` });
        continue;
      }

      if (block.type === "tool_use") {
        flushMessageContent();
        input.push({
          type: "function_call",
          call_id: block.id || "",
          name: block.name || "",
          arguments: stableJsonStringify(block.input ?? {}),
        });
        continue;
      }

      if (block.type === "tool_result") {
        flushMessageContent();
        input.push({
          type: "function_call_output",
          call_id: block.tool_use_id || "",
          output: typeof block.content === "string" ? block.content : stableJsonStringify(block.content ?? ""),
        });
      }
    }

    flushMessageContent();
  }
  return input;
}

function mapToolChoiceToResponses(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  const object = recordOf(toolChoice);
  const type = stringOf(object.type);
  if (type === "any") return "required";
  if (type === "auto") return "auto";
  if (type === "none") return "none";
  if (type === "tool") {
    const name = stringOf(object.name);
    return isWebSearchToolName(name) ? { type: "web_search" } : { type: "function", name };
  }
  return toolChoice;
}

function isWebSearchToolName(name: string): boolean {
  return name === "WebSearch" || name === "web_search";
}

function extractReasoningSummary(item: Record<string, unknown>): string {
  const summary = arrayOf(item.summary);
  if (summary) {
    return summary
      .flatMap((part) => {
        const object = recordOf(part);
        return stringOf(object.type) === "summary_text" ? [stringOf(object.text)] : [];
      })
      .join("");
  }
  return stringOf(item.text) || stringOf(item.reasoning);
}

function annotationsToAnthropicCitations(annotations: unknown[]): Record<string, unknown>[] {
  return annotations.flatMap((item) => {
    const annotation = recordOf(item);
    if (stringOf(annotation.type) !== "url_citation") return [];
    const url = stringOf(annotation.url);
    if (!url) return [];
    const title = stringOf(annotation.title) || url;
    const citedText = stringOf(annotation.cited_text) || stringOf(annotation.text);
    return [{
      type: "web_search_result_location",
      url,
      title,
      ...(citedText ? { cited_text: citedText } : {}),
      start_index: numberOf(annotation.start_index),
      end_index: numberOf(annotation.end_index),
    }];
  });
}

function hostedWebSearchInput(item: Record<string, unknown>): Record<string, unknown> {
  const action = recordOf(item.action);
  const queries = webSearchQueries(item);
  const query = stringOf(item.query)
    || stringOf(action.query)
    || stringOf(item.search_query)
    || stringOf(action.search_query)
    || queries[0]
    || "";
  return {
    hosted: true,
    status: stringOf(item.status) || "completed",
    providerStatus: stringOf(item.status),
    ...(query ? { query } : {}),
    ...(queries.length > 0 ? { queries } : {}),
  };
}

function webSearchQueries(item: Record<string, unknown>): string[] {
  const action = recordOf(item.action);
  const sources = [
    item.queries,
    action.queries,
    item.search_queries,
    action.search_queries,
  ];
  return sources.flatMap((source) => {
    const values = arrayOf(source);
    if (!values) return [];
    return values.flatMap((value) => {
      if (typeof value === "string") return value.trim() ? [value.trim()] : [];
      const object = recordOf(value);
      const query = stringOf(object.query) || stringOf(object.search_query) || stringOf(object.text);
      return query.trim() ? [query.trim()] : [];
    });
  });
}

function responseErrorMessage(object: Record<string, unknown>): string {
  const error = recordOf(object.error);
  return stringOf(error.message) || stringOf(error.code) || stringOf(object.status_details) || "OpenAI Responses request failed.";
}

function parseJsonObjectString(value: string): unknown {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value as JsonValue));
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortJsonValue);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}

function cleanJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(cleanJsonSchema);
  const object = schema as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => key !== "cache_control")
      .map(([key, value]) => [key, cleanJsonSchema(value)]),
  );
}

function stripLeadingAnthropicBillingHeader(value: string): string {
  return value.replace(/^x-anthropic-billing-header:[^\n\r]*(?:\r?\n){1,2}/, "");
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOf(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
