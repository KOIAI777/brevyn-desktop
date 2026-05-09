import type { AgentProviderKind } from "../../types/domain";

export function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || "").trim().replace(/\/+$/, "");
}

export function normalizeAnthropicBaseUrl(baseUrl?: string): string {
  let url = normalizeBaseUrl(baseUrl).replace(/\/messages$/, "");
  if (!url.match(/\/v\d+$/)) {
    try {
      const pathname = new URL(url).pathname;
      if (pathname === "/" || pathname === "") url = `${url}/v1`;
    } catch {
      url = `${url}/v1`;
    }
  }
  return url;
}

export function normalizeAnthropicBaseUrlForSdk(baseUrl?: string): string {
  return normalizeBaseUrl(baseUrl)
    .replace(/\/v\d+\/messages$/, "")
    .replace(/\/v\d+$/, "");
}

export function normalizeAnthropicProviderBaseUrl(providerKind: AgentProviderKind, baseUrl: string): string {
  if (providerKind === "deepseek" || providerKind === "kimi-api" || providerKind === "kimi-coding") {
    return normalizeBaseUrl(baseUrl);
  }
  return normalizeAnthropicBaseUrl(baseUrl);
}
