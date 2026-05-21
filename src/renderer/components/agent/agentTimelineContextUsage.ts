import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT,
  MAX_AUTO_COMPACT_THRESHOLD_PERCENT,
  MIN_AUTO_COMPACT_THRESHOLD_PERCENT,
  type BrevynAgentTimelineRecord,
  type BrevynUsageMetadata,
  type ModelProviderConfig,
} from "../../../types/domain";
import {
  brevynUsageFromAnthropicUsage,
  brevynUsageFromModelUsage,
  mergeBrevynUsage,
  recordOf,
} from "../../../shared/agent-usage";
import { resolveModelContextWindow } from "../../../shared/model-context-window";
import {
  isRuntimeRecord,
  stringValue,
  type ContextUsage,
} from "@/components/agent/agentTimelineModel";

export interface ContextUsageOptions {
  activeProvider?: ModelProviderConfig;
  providers?: ModelProviderConfig[];
  activeModelId?: string;
}

export function autoCompactThresholdPercent(provider?: ModelProviderConfig): number {
  const value = provider?.autoCompactThresholdPercent;
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT;
  return clampNumber(value, MIN_AUTO_COMPACT_THRESHOLD_PERCENT, MAX_AUTO_COMPACT_THRESHOLD_PERCENT);
}

export function shouldAutoCompactContext(usage: ContextUsage | null, provider?: ModelProviderConfig): boolean {
  const contextInputTokens = usage?.contextInputTokens ?? usage?.inputTokens ?? 0;
  if (!usage?.contextWindow || contextInputTokens <= 0 || usage.contextWindowSource === "unknown") return false;
  return contextInputTokens / usage.contextWindow >= autoCompactThresholdPercent(provider) / 100;
}

export function defaultContextUsage(model?: string, provider?: ModelProviderConfig): ContextUsage | null {
  const resolved = resolveModelContextWindow({ modelId: model || provider?.selectedModel, provider });
  return resolved.contextWindow ? {
    inputTokens: 0,
    contextInputTokens: 0,
    contextWindow: resolved.contextWindow,
    contextWindowSource: resolved.contextWindowSource,
    modelId: model || provider?.selectedModel,
    providerId: provider?.id,
    source: "default",
  } : null;
}

export function latestContextUsage(records: BrevynAgentTimelineRecord[], options: ContextUsageOptions = {}): ContextUsage | null {
  let latest: ContextUsage | null = null;
  let stableContextInputTokens = 0;
  let stableUsageKey = "";
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    const message = record as SDKMessage;
    if (message.type === "system" && stringValue((message as { subtype?: unknown }).subtype, "") === "compact_boundary") {
      latest = null;
      stableContextInputTokens = 0;
      stableUsageKey = "";
      continue;
    }
    if (message.type === "assistant") {
      const usage = contextUsageFromAssistant(message, options);
      if (usage) {
        const stabilized = stabilizeContextInputTokens(usage, stableUsageKey, stableContextInputTokens);
        stableUsageKey = stabilized.key;
        stableContextInputTokens = stabilized.contextInputTokens;
        latest = stabilized.usage;
      }
      continue;
    }
    if (message.type === "result") {
      const usage = contextUsageFromResult(message, options);
      if (usage) {
        const stabilized = stabilizeContextInputTokens(usage, stableUsageKey, stableContextInputTokens);
        stableUsageKey = stabilized.key;
        stableContextInputTokens = stabilized.contextInputTokens;
        latest = stabilized.usage;
      }
    }
  }
  return latest && ((latest.contextInputTokens ?? latest.inputTokens) > 0 || latest.contextWindow) ? latest : null;
}

export function isCompactingContext(records: BrevynAgentTimelineRecord[]): boolean {
  let compacting = false;
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    if ((record as SDKMessage).type === "result") {
      compacting = false;
      continue;
    }
    if ((record as SDKMessage).type !== "system") continue;
    const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
    if (subtype === "compacting") compacting = true;
    if (subtype === "compact_boundary") compacting = false;
  }
  return compacting;
}

function contextUsageFromAssistant(message: SDKMessage, options: ContextUsageOptions): ContextUsage | null {
  const raw = recordOf(message);
  const rawMessage = recordOf(raw.message);
  const modelId = stringValue(rawMessage.model ?? raw._channelModelId, options.activeModelId || "");
  const provider = providerForMessage(raw, modelId, options);
  const providerProtocol = provider?.protocol === "openai_responses" ? "openai_responses" : "anthropic_messages";
  const explicitUsage = explicitBrevynUsage(raw);
  const usage = explicitUsage
    ? mergeBrevynUsage(explicitUsage, { providerProtocol, providerId: provider?.id || stringValue(raw._channelProviderId, ""), modelId, provider })
    : brevynUsageFromAnthropicUsage(rawMessage.usage, { providerProtocol, providerId: provider?.id || stringValue(raw._channelProviderId, ""), modelId, provider });
  return usage ? contextUsageFromBrevynUsage(usage, "assistant", provider) : null;
}

function contextUsageFromResult(message: SDKMessage, options: ContextUsageOptions): ContextUsage | null {
  const raw = recordOf(message);
  const modelId = stringValue(raw._channelModelId, options.activeModelId || "");
  const provider = providerForMessage(raw, modelId, options);
  const providerProtocol = provider?.protocol === "openai_responses" ? "openai_responses" : "anthropic_messages";
  const explicitUsage = explicitBrevynUsage(raw);
  const usage = explicitUsage
    ? mergeBrevynUsage(explicitUsage, { providerProtocol, providerId: provider?.id || stringValue(raw._channelProviderId, ""), modelId, provider })
    : brevynUsageFromModelUsage(raw.modelUsage, { providerProtocol, providerId: provider?.id || stringValue(raw._channelProviderId, ""), modelId, provider })
      || brevynUsageFromAnthropicUsage(raw.usage, { providerProtocol, providerId: provider?.id || stringValue(raw._channelProviderId, ""), modelId, provider });
  return usage ? contextUsageFromBrevynUsage(usage, "result", provider) : null;
}

function contextUsageFromBrevynUsage(usage: BrevynUsageMetadata, source: "assistant" | "result", provider?: ModelProviderConfig): ContextUsage {
  const resolvedWindow = usage.contextWindow
    ? { contextWindow: usage.contextWindow, contextWindowSource: usage.contextWindowSource || ("model_config" as const) }
    : resolveModelContextWindow({ modelId: usage.modelId, provider });
  const cacheReadTokens = positiveToken(usage.cacheReadTokens);
  const cacheCreationTokens = positiveToken(usage.cacheCreationTokens);
  const contextInputTokens = positiveToken(usage.contextInputTokens) || usage.inputTokens + cacheReadTokens + cacheCreationTokens;
  return {
    inputTokens: usage.inputTokens,
    contextInputTokens,
    outputTokens: positiveToken(usage.outputTokens) || undefined,
    cacheReadTokens: cacheReadTokens || undefined,
    cacheCreationTokens: cacheCreationTokens || undefined,
    reasoningTokens: positiveToken(usage.reasoningTokens) || undefined,
    totalTokens: positiveToken(usage.totalTokens) || undefined,
    contextWindow: resolvedWindow.contextWindow,
    contextWindowSource: resolvedWindow.contextWindowSource,
    modelId: usage.modelId,
    providerId: usage.providerId || provider?.id,
    source,
  };
}

function explicitBrevynUsage(raw: Record<string, unknown>): BrevynUsageMetadata | undefined {
  const usage = recordOf(raw._brevynUsage);
  return Object.keys(usage).length > 0 ? usage as unknown as BrevynUsageMetadata : undefined;
}

function providerForMessage(raw: Record<string, unknown>, modelId: string, options: ContextUsageOptions): ModelProviderConfig | undefined {
  const channelProviderId = stringValue(raw._channelProviderId, "");
  if (channelProviderId) {
    const provider = options.providers?.find((item) => item.id === channelProviderId);
    if (provider) return provider;
  }
  if (modelId) {
    const provider = options.providers?.find((item) => item.models.some((model) => model.id === modelId));
    if (provider) return provider;
  }
  return options.activeProvider;
}

function stabilizeContextInputTokens(
  usage: ContextUsage,
  previousKey: string,
  previousContextInputTokens: number,
): { usage: ContextUsage; key: string; contextInputTokens: number } {
  const key = contextUsageStabilityKey(usage);
  const currentContextInputTokens = positiveToken(usage.contextInputTokens) || usage.inputTokens;
  const contextInputTokens = key === previousKey
    ? Math.max(previousContextInputTokens, currentContextInputTokens)
    : currentContextInputTokens;
  return {
    key,
    contextInputTokens,
    usage: {
      ...usage,
      contextInputTokens,
    },
  };
}

function contextUsageStabilityKey(usage: ContextUsage): string {
  return [
    usage.providerId || "",
    usage.modelId || "",
    usage.contextWindow || "",
    usage.contextWindowSource || "",
  ].join("|");
}

function positiveToken(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
