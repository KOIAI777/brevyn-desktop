import assert from "node:assert/strict";
import type { ModelProviderConfig } from "../../types/domain";
import { OpenAIResponsesAgentAdapter } from "./openai-responses-agent-adapter";

const adapter = new OpenAIResponsesAgentAdapter();

function provider(baseUrl: string): ModelProviderConfig {
  return {
    id: "provider_test",
    purpose: "agent",
    providerKind: "openai-responses-agent",
    adapterKind: "openai_responses",
    name: "OpenAI Responses Test",
    protocol: "openai_responses",
    baseUrl,
    apiKeyMasked: "",
    authMode: "bearer",
    models: [],
    selectedModel: "gpt-test",
    enabled: true,
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  };
}

assert.equal(
  adapter.buildModelListRequest(provider("https://api-cn.wenrugouai.cn"), "sk-test").url,
  "https://api-cn.wenrugouai.cn/v1/models",
);
assert.equal(
  adapter.buildModelListRequest(provider("https://api-cn.wenrugouai.cn/v1"), "sk-test").url,
  "https://api-cn.wenrugouai.cn/v1/models",
);
assert.equal(
  adapter.buildConnectionTestRequest(provider("https://api-cn.wenrugouai.cn/v1/responses"), "sk-test").url,
  "https://api-cn.wenrugouai.cn/v1/responses",
);

console.log("openai-responses-agent-adapter tests passed");
