import type { AgentProviderKind, ModelProviderConfig, ProviderModel } from "../../types/domain";
import type { AgentProviderAdapter, ProviderHttpRequest } from "./types";
import { normalizeBaseUrl } from "./url-utils";

export class OpenAIResponsesAgentAdapter implements AgentProviderAdapter {
  constructor(readonly providerKind: AgentProviderKind = "openai-responses-agent") {}

  buildModelListRequest(provider: ModelProviderConfig, apiKey: string): ProviderHttpRequest {
    return {
      url: `${apiBaseUrl(provider)}/models`,
      init: {
        method: "GET",
        headers: headers(apiKey),
      },
    };
  }

  buildConnectionTestRequest(provider: ModelProviderConfig, apiKey: string): ProviderHttpRequest {
    return {
      url: `${apiBaseUrl(provider)}/responses`,
      init: {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          model: provider.selectedModel || "gpt-5.5",
          input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
          max_output_tokens: 1,
          stream: false,
        }),
      },
    };
  }

  buildSdkEnv(): Record<string, string> {
    throw new Error("OpenAI Responses agent providers must be accessed through the local Anthropic gateway.");
  }

  parseModelList(payload: unknown): ProviderModel[] {
    const data = payload && typeof payload === "object" ? (payload as { data?: Array<{ id?: string; name?: string }> }).data : undefined;
    return (data || [])
      .flatMap((item) => {
        const id = (item.id || "").trim();
        if (!id) return [];
        return [{ id, name: item.name || id, enabled: false }];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

function apiBaseUrl(provider: ModelProviderConfig): string {
  return (normalizeBaseUrl(provider.baseUrl) || "https://api.openai.com/v1")
    .replace(/\/responses$/, "")
    .replace(/\/chat\/completions$/, "")
    .replace(/\/models$/, "");
}

function headers(apiKey: string): Record<string, string> {
  return {
    "authorization": `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

