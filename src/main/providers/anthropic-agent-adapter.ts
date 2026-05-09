import type { AgentProviderKind, ModelProviderConfig, ProviderModel } from "../../types/domain";
import type { AgentProviderAdapter, ProviderHttpRequest } from "./types";
import { normalizeAnthropicBaseUrlForSdk, normalizeAnthropicProviderBaseUrl } from "./url-utils";

const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com";

export class AnthropicAgentAdapter implements AgentProviderAdapter {
  constructor(readonly providerKind: AgentProviderKind = "anthropic") {}

  buildModelListRequest(provider: ModelProviderConfig, apiKey: string): ProviderHttpRequest {
    return {
      url: `${this.apiBaseUrl(provider)}/models`,
      init: {
        method: "GET",
        headers: this.headers(apiKey, false),
      },
    };
  }

  buildConnectionTestRequest(provider: ModelProviderConfig, apiKey: string): ProviderHttpRequest {
    return {
      url: `${this.apiBaseUrl(provider)}/messages`,
      init: {
        method: "POST",
        headers: this.headers(apiKey, true),
        body: JSON.stringify({
          model: provider.selectedModel || defaultTestModel(this.providerKind),
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      },
    };
  }

  buildSdkEnv(provider: ModelProviderConfig, apiKey: string): Record<string, string> {
    const env: Record<string, string> = {};
    if (this.providerKind === "kimi-coding") {
      env.ANTHROPIC_AUTH_TOKEN = apiKey;
      env.ANTHROPIC_CUSTOM_HEADERS = "User-Agent: KimiCLI/1.3";
    } else {
      env.ANTHROPIC_API_KEY = apiKey;
    }
    if (provider.baseUrl && provider.baseUrl !== DEFAULT_ANTHROPIC_URL) {
      env.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForSdk(provider.baseUrl);
    }
    return env;
  }

  parseModelList(payload: unknown): ProviderModel[] {
    const data = payload && typeof payload === "object" ? (payload as { data?: Array<{ id?: string; display_name?: string; name?: string }> }).data : undefined;
    return (data || [])
      .flatMap((item) => providerModelFromId(item.id || "", item.display_name || item.name));
  }

  private apiBaseUrl(provider: ModelProviderConfig): string {
    return normalizeAnthropicProviderBaseUrl(this.providerKind, provider.baseUrl);
  }

  private headers(apiKey: string, withContentType: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
    };
    if (withContentType) headers["content-type"] = "application/json";
    if (this.providerKind === "kimi-coding") {
      headers.Authorization = `Bearer ${apiKey}`;
      headers["User-Agent"] = "KimiCLI/1.3";
      return headers;
    }
    headers["x-api-key"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }
}

function defaultTestModel(providerKind: AgentProviderKind): string {
  if (providerKind === "deepseek") return "deepseek-v4-pro";
  if (providerKind === "kimi-api") return "kimi-k2.6";
  if (providerKind === "kimi-coding") return "kimi-for-coding";
  return "claude-sonnet-4-6";
}

function providerModelFromId(id: string, displayName?: string): ProviderModel[] {
  const modelId = id.trim();
  if (!modelId) return [];
  return [{ id: modelId, name: displayName || modelId, enabled: true }];
}
