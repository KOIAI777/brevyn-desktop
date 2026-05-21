import type { BrevynUsageContextWindowSource, ModelProviderConfig, ProviderModel } from "../types/domain";

export interface ResolvedContextWindow {
  contextWindow?: number;
  contextWindowSource: BrevynUsageContextWindowSource;
}

export function resolveModelContextWindow(input: {
  modelId?: string;
  provider?: Pick<ModelProviderConfig, "models" | "selectedModel">;
  model?: ProviderModel;
}): ResolvedContextWindow {
  const modelId = normalizeModelId(input.modelId || input.model?.id || input.provider?.selectedModel || "");
  const configuredModel = input.model || modelFromProvider(input.provider, modelId);
  const configuredWindow = positiveInteger(configuredModel?.contextWindowTokens);
  if (configuredWindow) {
    return {
      contextWindow: configuredWindow,
      contextWindowSource: configuredModel?.contextWindowSource || "model_config",
    };
  }

  const inferred = inferContextWindowTokens(modelId);
  if (inferred) {
    return {
      contextWindow: inferred,
      contextWindowSource: "inferred",
    };
  }

  return { contextWindowSource: "unknown" };
}

export function withInferredContextWindow(model: ProviderModel): ProviderModel {
  if (positiveInteger(model.contextWindowTokens)) return { ...model };
  const inferred = inferContextWindowTokens(model.id || model.name);
  return inferred
    ? { ...model, contextWindowTokens: inferred, contextWindowSource: "inferred" }
    : { ...model };
}

export function inferContextWindowTokens(modelId: string): number | undefined {
  const normalized = normalizeModelId(modelId);
  if (!normalized) return undefined;

  if (normalized.includes("deepseek-v4")) return 1_000_000;
  if (
    normalized.includes("claude-sonnet-4")
    || normalized.includes("claude-opus-4-6")
    || normalized.includes("claude-opus-4-7")
  ) return 1_000_000;
  if (normalized.includes("claude") || normalized.includes("haiku")) return 200_000;

  if (normalized.includes("gpt-5.4")) return 1_000_000;
  if (normalized.includes("gpt-5.5")) return 258_000;
  if (
    normalized.includes("gpt-5")
    || normalized.includes("gpt-4.1")
    || normalized.includes("gpt-4o")
    || normalized.includes("o3")
    || normalized.includes("o4")
  ) return 200_000;

  if (normalized.includes("kimi")) return 200_000;
  return undefined;
}

function modelFromProvider(
  provider: Pick<ModelProviderConfig, "models" | "selectedModel"> | undefined,
  modelId: string,
): ProviderModel | undefined {
  if (!provider) return undefined;
  const selected = modelId || provider.selectedModel;
  return provider.models.find((model) => model.id === selected);
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase();
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
