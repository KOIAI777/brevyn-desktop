import { PROVIDER_PRESETS, type ModelProviderConfig, type ProviderKind, type ProviderModel } from "../../../../types/domain";

export const PROVIDER_PROFILE_ROW_HEIGHT_CLASS = "h-[72px]";
export const PROVIDER_PROFILE_LIST_HEIGHT_CLASS = "max-h-[312px]";
export const OFFICIAL_PROVIDER_ID_PREFIX = "provider-brevyn-cloud-official-";

export function contextWindowFromInput(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const numeric = Number.parseInt(digits, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return tokens.toLocaleString();
}

export function contextWindowSourceLabel(source: ProviderModel["contextWindowSource"]): string {
  if (source === "user") return "手动";
  if (source === "provider") return "服务商";
  if (source === "inferred") return "估算";
  return "配置";
}

export function providerKindLabel(providerKind: ProviderKind): string {
  return PROVIDER_PRESETS[providerKind]?.label || providerKind;
}

export function isOfficialProvider(provider: ModelProviderConfig): boolean {
  return provider.id.startsWith(OFFICIAL_PROVIDER_ID_PREFIX);
}

export function providerDisplayName(provider: ModelProviderConfig): string {
  const trimmed = provider.name.trim();
  const defaultMatch = /^(Agent|Embedding|Vision)\s+(\d+)$/i.exec(trimmed);
  if (!defaultMatch) return trimmed || "未命名服务商";
  const index = defaultMatch[2];
  if (provider.purpose === "embedding") return `Embedding ${index}`;
  if (provider.purpose === "vision") return `Vision ${index}`;
  return `Agent ${index}`;
}

export function officialProviderGroupLabel(provider: ModelProviderConfig): string {
  const displayName = providerDisplayName(provider);
  const parts = displayName.split("·").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(" · ");
  const suffix = provider.id.slice(OFFICIAL_PROVIDER_ID_PREFIX.length);
  if (!suffix || suffix === "default") return "官方分组";
  const groupId = suffix.replace(/^(embedding|vision)-/, "");
  return groupId === "default" ? "官方分组" : `分组 #${groupId}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
