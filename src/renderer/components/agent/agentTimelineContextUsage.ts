import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT,
  MAX_AUTO_COMPACT_THRESHOLD_PERCENT,
  MIN_AUTO_COMPACT_THRESHOLD_PERCENT,
  type BrevynAgentTimelineRecord,
  type ModelProviderConfig,
} from "../../../types/domain";
import {
  isRuntimeRecord,
  recordObject,
  stringValue,
  type ContextUsage,
} from "@/components/agent/agentTimelineModel";

export function autoCompactThresholdPercent(provider?: ModelProviderConfig): number {
  const value = provider?.autoCompactThresholdPercent;
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT;
  return clampNumber(value, MIN_AUTO_COMPACT_THRESHOLD_PERCENT, MAX_AUTO_COMPACT_THRESHOLD_PERCENT);
}

export function shouldAutoCompactContext(usage: ContextUsage | null, provider?: ModelProviderConfig): boolean {
  if (!usage?.contextWindow || usage.inputTokens <= 0) return false;
  return usage.inputTokens / usage.contextWindow >= autoCompactThresholdPercent(provider) / 100;
}

export function defaultContextUsage(model?: string): ContextUsage | null {
  const contextWindow = inferContextWindow(model || "");
  return contextWindow ? { inputTokens: 0, contextWindow } : null;
}

export function latestContextUsage(records: BrevynAgentTimelineRecord[]): ContextUsage | null {
  let latest: ContextUsage | null = null;
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    const message = record as SDKMessage;
    if (message.type === "assistant") {
      const rawMessage = recordObject((message as { message?: unknown }).message);
      const usage = recordObject(rawMessage.usage);
      const inputTokens = tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
      if (inputTokens > 0) {
        const previousContextWindow: number | undefined = latest ? latest.contextWindow : undefined;
        latest = {
          inputTokens,
          outputTokens: tokenNumber(usage.output_tokens) || undefined,
          cacheReadTokens: tokenNumber(usage.cache_read_input_tokens) || undefined,
          cacheCreationTokens: tokenNumber(usage.cache_creation_input_tokens) || undefined,
          contextWindow: previousContextWindow ?? inferContextWindow(stringValue(rawMessage.model ?? (message as { _channelModelId?: unknown })._channelModelId, "")),
        };
      }
      continue;
    }
    if (message.type === "result") {
      const usage = recordObject((message as { usage?: unknown }).usage);
      const primaryUsage = primaryModelUsageFromResult(message);
      const contextWindow = primaryUsage?.contextWindow;
      if (latest && contextWindow) {
        latest = { ...latest, contextWindow };
        continue;
      }
      const inputTokens = primaryUsage
        ? primaryUsage.inputTokens + (primaryUsage.cacheReadTokens || 0) + (primaryUsage.cacheCreationTokens || 0)
        : tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
      if (!latest && (inputTokens > 0 || contextWindow)) {
        latest = {
          inputTokens: inputTokens || 0,
          outputTokens: primaryUsage?.outputTokens || tokenNumber(usage.output_tokens) || undefined,
          cacheReadTokens: primaryUsage?.cacheReadTokens || tokenNumber(usage.cache_read_input_tokens) || undefined,
          cacheCreationTokens: primaryUsage?.cacheCreationTokens || tokenNumber(usage.cache_creation_input_tokens) || undefined,
          contextWindow,
        };
      }
    }
  }
  return latest && latest.inputTokens > 0 ? latest : null;
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

function primaryModelUsageFromResult(message: SDKMessage): ContextUsage | undefined {
  const modelUsage = recordObject((message as { modelUsage?: unknown }).modelUsage);
  let selected: ContextUsage | undefined;
  let selectedTokens = 0;
  for (const value of Object.values(modelUsage)) {
    const usage = recordObject(value);
    const inputTokens = tokenNumber(usage.inputTokens);
    const cacheReadTokens = tokenNumber(usage.cacheReadInputTokens);
    const cacheCreationTokens = tokenNumber(usage.cacheCreationInputTokens);
    const totalInputTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    if (totalInputTokens <= selectedTokens) continue;
    selectedTokens = totalInputTokens;
    selected = {
      inputTokens,
      outputTokens: tokenNumber(usage.outputTokens) || undefined,
      cacheReadTokens: cacheReadTokens || undefined,
      cacheCreationTokens: cacheCreationTokens || undefined,
      contextWindow: tokenNumber(usage.contextWindow) || undefined,
    };
  }
  return selected;
}

function inferContextWindow(model: string): number | undefined {
  const normalized = model.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("haiku")) return 200_000;
  if (normalized.includes("deepseek-v4")) return 1_000_000;
  if (normalized.includes("claude-sonnet-4") || normalized.includes("claude-opus-4-6") || normalized.includes("claude-opus-4-7")) return 1_000_000;
  return 200_000;
}

function tokenNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
