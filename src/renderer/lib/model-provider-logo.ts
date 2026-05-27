import type { ModelProviderConfig, ProviderKind } from "@/types/domain";
import defaultLogo from "@/assets/brevyn-app-icon.png";
import alibabaCloudLogo from "@/assets/models/alibabacloud.svg";
import anthropicLogo from "@/assets/models/anthropic.svg";
import byteDanceLogo from "@/assets/models/bytedance.svg";
import deepSeekLogo from "@/assets/models/deepseek.svg";
import googleLogo from "@/assets/models/google.svg";
import googleCloudLogo from "@/assets/models/googlecloud.svg";
import googleGeminiLogo from "@/assets/models/googlegemini.svg";
import miniMaxLogo from "@/assets/models/minimax.svg";
import moonshotLogo from "@/assets/models/moonshotai.svg";
import openAiLogo from "@/assets/models/openai.svg";
import qwenLogo from "@/assets/models/qwen.svg";

type ProviderLike = Pick<ModelProviderConfig, "providerKind" | "baseUrl" | "selectedModel">;

interface ResolveModelProviderLogoInput {
  modelId?: string;
  providerKind?: ProviderKind;
  baseUrl?: string;
}

const MODEL_LOGO_RULES: Array<[RegExp, string]> = [
  [/gpt-?5|gpt-?4|gpt-?3(?:\.5)?|gpt|o1|o3|o4|codex|openai/i, openAiLogo],
  [/claude|anthropic/i, anthropicLogo],
  [/deepseek/i, deepSeekLogo],
  [/qwen|qwq|qvq|wan-|dashscope|aliyun|alibaba/i, qwenLogo],
  [/kimi|moonshot/i, moonshotLogo],
  [/gemini|gemma|google/i, googleGeminiLogo],
  [/doubao|bytedance|byte[-_ ]?dance|volc|seed/i, byteDanceLogo],
  [/minimax/i, miniMaxLogo],
  [/embedding/i, openAiLogo],
];

const BASE_URL_LOGO_RULES: Array<[RegExp, string]> = [
  [/dashscope|aliyuncs|alibaba|bailian/i, qwenLogo],
  [/moonshot|kimi/i, moonshotLogo],
  [/deepseek/i, deepSeekLogo],
  [/anthropic/i, anthropicLogo],
  [/openai/i, openAiLogo],
  [/googleapis|generativelanguage|google/i, googleGeminiLogo],
  [/volces|volcengine|bytedance|doubao/i, byteDanceLogo],
  [/minimax/i, miniMaxLogo],
];

const PROVIDER_KIND_LOGOS: Partial<Record<ProviderKind, string>> = {
  anthropic: anthropicLogo,
  deepseek: deepSeekLogo,
  "bailian-anthropic": qwenLogo,
  "kimi-api": moonshotLogo,
  "kimi-coding": moonshotLogo,
  "custom-anthropic": anthropicLogo,
  "openai-responses-agent": openAiLogo,
  openai: openAiLogo,
  qwen: qwenLogo,
  doubao: byteDanceLogo,
  minimax: miniMaxLogo,
  "custom-openai": openAiLogo,
  "vision-bailian-openai": qwenLogo,
  "vision-custom-openai": openAiLogo,
  "vision-custom-anthropic": anthropicLogo,
  "vision-openai-responses": openAiLogo,
  "vision-custom-openai-responses": openAiLogo,
};

export function getModelLogo(modelId: string, providerKind?: ProviderKind): string {
  return resolveModelProviderLogo({ modelId, providerKind });
}

export function getModelLogoById(modelId: string): string | undefined {
  return logoFromRules(modelId, MODEL_LOGO_RULES);
}

export function getProviderKindLogo(providerKind: ProviderKind): string {
  return PROVIDER_KIND_LOGOS[providerKind] || defaultLogo;
}

export function getProviderProfileLogo(provider: ProviderLike): string {
  return resolveModelProviderLogo({
    modelId: provider.selectedModel,
    baseUrl: provider.baseUrl,
    providerKind: provider.providerKind,
  });
}

export function getProviderBaseUrlLogo(baseUrl: string, providerKind?: ProviderKind): string {
  return logoFromRules(baseUrl, BASE_URL_LOGO_RULES) || (providerKind ? getProviderKindLogo(providerKind) : defaultLogo);
}

export function resolveModelProviderLogo({
  modelId,
  baseUrl,
  providerKind,
}: ResolveModelProviderLogoInput): string {
  return logoFromRules(modelId, MODEL_LOGO_RULES)
    || logoFromRules(baseUrl, BASE_URL_LOGO_RULES)
    || (providerKind ? getProviderKindLogo(providerKind) : defaultLogo);
}

function logoFromRules(value: string | undefined, rules: Array<[RegExp, string]>): string | undefined {
  if (!value) return undefined;
  return rules.find(([rule]) => rule.test(value))?.[1];
}

export {
  defaultLogo,
  alibabaCloudLogo,
  anthropicLogo,
  byteDanceLogo,
  deepSeekLogo,
  googleLogo,
  googleCloudLogo,
  googleGeminiLogo,
  miniMaxLogo,
  moonshotLogo,
  openAiLogo,
  qwenLogo,
};
