import type {
  CloudAccountStatus,
  CloudBalanceGroupEntitlement,
  CloudGatewayEntitlementGroup,
  CloudGatewayGroup,
  CloudProviderModel,
  CloudQuotaWindow,
  CloudSubscriptionGroupEntitlement,
  ModelProviderConfig,
} from "@/types/domain";
import { cx } from "@/lib/cn";

const OFFICIAL_PROVIDER_ID_PREFIX = "provider-brevyn-cloud-official-";
const CLOUD_CONVERSATION_PROVIDER_ID_PREFIX = "provider-brevyn-cloud-conversation-";

export interface CloudGroupModelCatalogState {
  status: "loading" | "ready" | "error";
  models: CloudProviderModel[];
  total: number;
  error?: string;
}

export type CapabilityKind = "embedding" | "vision" | "ocr";

export function isBalanceEntitlementGroup(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): group is CloudBalanceGroupEntitlement {
  return "billingKind" in group && group.billingKind === "balance";
}

export function isSubscriptionEntitlementGroup(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): group is CloudSubscriptionGroupEntitlement {
  return "billingKind" in group && group.billingKind === "subscription";
}

export function capabilityGroupBillingLabel(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): string {
  if (isBalanceEntitlementGroup(group)) return "余额能力";
  if (isSubscriptionEntitlementGroup(group)) return "订阅能力";
  return planTypeLabel(group);
}

export function isCloudCapabilityGroup(
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup,
  catalog: CloudGroupModelCatalogState | undefined,
  providers: ModelProviderConfig[],
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>,
): boolean {
  return isCapabilityGroup(group, catalog, providers, providerRefs);
}

export function isCapabilityGroup(
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup,
  catalog: CloudGroupModelCatalogState | undefined,
  providers: ModelProviderConfig[],
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>,
): boolean {
  return groupCapabilityKinds(group, catalog, providers, providerRefs).length > 0;
}

export function groupCapabilityKinds(
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup,
  catalog: CloudGroupModelCatalogState | undefined,
  providers: ModelProviderConfig[],
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>,
): CapabilityKind[] {
  const kinds = new Set<CapabilityKind>();
  const groupId = group.externalGroupId;
  for (const ref of providerRefs) {
    if (ref.externalGroupId !== groupId) continue;
    if (ref.purpose === "embedding" || ref.purpose === "vision" || ref.purpose === "ocr") kinds.add(ref.purpose);
  }
  for (const provider of providers) {
    if (!isOfficialProvider(provider) || officialProviderExternalGroupId(provider) !== groupId) continue;
    if (provider.purpose === "embedding" || provider.purpose === "vision" || provider.purpose === "ocr") kinds.add(provider.purpose);
  }
  const officialCapabilities = Array.isArray(group.officialCapabilities) ? group.officialCapabilities : [];
  for (const capability of officialCapabilities) {
    if (capability === "embedding" || capability === "vision" || capability === "ocr") kinds.add(capability);
  }
  return [...kinds].sort(capabilityKindSort);
}

export function activeCapabilityKinds(groupId: number, providers: ModelProviderConfig[], kinds: CapabilityKind[]): CapabilityKind[] {
  return kinds.filter((kind) =>
    providers.some((provider) =>
      provider.enabled &&
      provider.purpose === kind &&
      isOfficialProvider(provider) &&
      officialProviderExternalGroupId(provider) === groupId,
    ),
  );
}

export function officialProviderExternalGroupId(provider: ModelProviderConfig): number {
  const suffix = provider.id.slice(OFFICIAL_PROVIDER_ID_PREFIX.length);
  const parts = suffix.split("-");
  const raw = parts[0] === "embedding" || parts[0] === "vision" || parts[0] === "ocr" ? parts.slice(1).join("-") : suffix;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function capabilityKindSort(a: CapabilityKind, b: CapabilityKind): number {
  const order: Record<CapabilityKind, number> = { embedding: 0, vision: 1, ocr: 2 };
  return order[a] - order[b];
}

function isOfficialProvider(provider: ModelProviderConfig): boolean {
  return provider.id.startsWith(OFFICIAL_PROVIDER_ID_PREFIX) || provider.id.startsWith(CLOUD_CONVERSATION_PROVIDER_ID_PREFIX);
}

export function isEmbeddingCloudModel(model: CloudProviderModel): boolean {
  const id = `${model.id} ${model.name} ${model.displayName}`.toLowerCase();
  return hasCloudModelCapability(model, "embedding") ||
    id.includes("embedding") ||
    id.includes("embed") ||
    id.includes("bge") ||
    id.includes("gte") ||
    id.includes("e5") ||
    id.includes("jina") ||
    id.includes("voyage");
}

function hasCloudModelCapability(model: CloudProviderModel, capability: string): boolean {
  return (model.capabilities ?? []).some((item) => item.toLowerCase() === capability.toLowerCase());
}

export function planTypeLabel(group: CloudGatewayGroup): string {
  if (group.subscriptionType === "subscription") return "订阅套餐";
  if (group.subscriptionType === "standard") return "余额套餐";
  return group.subscriptionType || "套餐";
}

export function cloudEntitlementUsable(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "" || normalized === "active";
}

export function cloudEntitlementStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "":
    case "active":
      return "可用";
    case "insufficient_balance":
      return "余额不足";
    case "quota_exhausted":
      return "额度用尽";
    case "not_subscribed":
      return "未订阅";
    case "expired":
      return "已过期";
    case "inactive_group":
      return "分组停用";
    case "inactive_user":
      return "账号停用";
    case "gateway_unlinked":
      return "未联动";
    default:
      return status || "未知";
  }
}

export function planCardClass(current: boolean, usable: boolean): string {
  return cx(
    "rounded-[var(--radius-card)] bg-card p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.48)] transition",
    current && "bg-background shadow-[0_14px_34px_rgba(15,23,42,0.06),inset_0_0_0_1px_hsl(var(--foreground)/0.1)]",
    !usable && "opacity-80",
  );
}

export function formatMultiplier(value?: number | null): string {
  const multiplier = Number(value ?? 1);
  return `${Number.isFinite(multiplier) && multiplier > 0 ? multiplier.toFixed(multiplier % 1 === 0 ? 0 : 2) : "1"}x`;
}

export function quotaRemainingPercent(window: CloudQuotaWindow): number {
  const limit = Number(window.limit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return clampPercent((Number(window.remaining || 0) / limit) * 100);
}

export function balanceEntitlementLimit(group: CloudBalanceGroupEntitlement): number {
  const remaining = Math.max(0, Number(group.remaining || 0));
  const limit = Number(group.limit);
  if (!Number.isFinite(limit) || limit <= 0) return remaining;
  return Math.max(limit, remaining);
}

export function balanceRemainingPercent(remaining: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return clampPercent((Math.max(0, Number(remaining || 0)) / limit) * 100);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function formatPercent(value: number): string {
  return `${Math.round(clampPercent(value))}%`;
}

export function formatCompactPoints(value?: number | null): string {
  const amount = safeAmount(value);
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} 积分`;
}

export function formatCloudPoints(value?: number | null): string {
  const amount = safeAmount(value);
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} 积分`;
}

function safeAmount(value?: number | null): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatCloudDate(value?: string | null): string {
  if (!value) return "-";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function cloudModelDisplayName(model: CloudProviderModel): string {
  return model.displayName || model.name || model.id;
}
