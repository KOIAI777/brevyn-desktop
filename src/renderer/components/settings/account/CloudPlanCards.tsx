import { Check, Database, Eye, Loader2, ScanText } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CloudAccountStatus,
  CloudBalanceGroupEntitlement,
  CloudGatewayEntitlementGroup,
  CloudGatewayGroup,
  CloudQuotaWindow,
  CloudSubscriptionGroupEntitlement,
  ModelProviderConfig,
} from "@/types/domain";
import { cx } from "@/lib/cn";
import {
  activeCapabilityKinds,
  balanceEntitlementLimit,
  balanceRemainingPercent,
  capabilityGroupBillingLabel,
  clampPercent,
  cloudEntitlementStatusLabel,
  cloudEntitlementUsable,
  cloudModelDisplayName,
  formatCloudDate,
  formatCloudPoints,
  formatCompactPoints,
  formatMultiplier,
  formatPercent,
  groupCapabilityKinds,
  isBalanceEntitlementGroup,
  isEmbeddingCloudModel,
  isSubscriptionEntitlementGroup,
  planCardClass,
  planTypeLabel,
  quotaRemainingPercent,
  type CloudGroupModelCatalogState,
} from "./cloudPlanUtils";

export function PlanSection({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SubscriptionPlanNotice() {
  return (
    <div className="mb-2 rounded-md border border-amber-200/80 bg-amber-50/75 px-2.5 py-2 text-[11px] leading-5 text-amber-900">
      订阅套餐不是一次性积分；日、周、月额度会按对应周期刷新。重复购买同一订阅只延长到期时间，不会叠加当前周期额度。
    </div>
  );
}

export function BalanceEntitlementCard({
  group,
  currentGroupId,
  busyAction,
  isBusy,
  modelCatalog,
  onActivateGroup,
}: {
  group: CloudBalanceGroupEntitlement;
  currentGroupId: number;
  busyAction: string;
  isBusy: boolean;
  modelCatalog?: CloudGroupModelCatalogState;
  onActivateGroup: (externalGroupId: number) => void;
}) {
  const activating = busyAction === `activate:${group.externalGroupId}`;
  const current = group.isCurrent || group.externalGroupId === currentGroupId;
  const usable = cloudEntitlementUsable(group.status);
  const limit = balanceEntitlementLimit(group);
  const percent = balanceRemainingPercent(group.remaining, limit);
  const warning = !usable || percent <= 15;
  return (
    <div className={planCardClass(current, usable)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PlanTitle name={group.name} current={current} status={group.status} />
          <div className="mt-1 text-[10px] text-muted-foreground">
            余额套餐 · {formatMultiplier(group.rateMultiplier)}
          </div>
          <div className="mt-3 space-y-2">
            <PlanPointsBar
              label="余额额度"
              value={`${formatCompactPoints(group.remaining)} / ${formatCompactPoints(limit)}`}
              percent={percent}
              percentLabel={`剩余 ${formatPercent(percent)}`}
              tone={warning ? "warning" : "default"}
            />
          </div>
        </div>
        <PlanActivateButton
          current={current}
          activating={activating}
          disabled={isBusy || current || !usable}
          onClick={() => onActivateGroup(group.externalGroupId)}
        />
      </div>
      <PlanModelSummary catalog={modelCatalog} fallbackCount={group.modelCount || 0} />
    </div>
  );
}

export function SubscriptionEntitlementCard({
  group,
  currentGroupId,
  busyAction,
  isBusy,
  modelCatalog,
  onActivateGroup,
}: {
  group: CloudSubscriptionGroupEntitlement;
  currentGroupId: number;
  busyAction: string;
  isBusy: boolean;
  modelCatalog?: CloudGroupModelCatalogState;
  onActivateGroup: (externalGroupId: number) => void;
}) {
  const activating = busyAction === `activate:${group.externalGroupId}`;
  const current = group.isCurrent || group.externalGroupId === currentGroupId;
  const usable = cloudEntitlementUsable(group.status);
  const windows = [
    ["日", group.daily],
    ["周", group.weekly],
    ["月", group.monthly],
  ] as const;
  return (
    <div className={planCardClass(current, usable)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PlanTitle name={group.name} current={current} status={group.status} />
          <div className="mt-1 text-[10px] text-muted-foreground">
            订阅套餐 · {formatMultiplier(group.rateMultiplier)} · 到期 {formatCloudDate(group.expiresAt)}
          </div>
          <div className="mt-3 space-y-2">
            {group.unlimited ? (
              <PlanPointsBar label="订阅额度" value="不限额" percent={100} percentLabel="不限额" />
            ) : windows.some(([, window]) => Boolean(window)) ? (
              windows.map(([label, window]) => window ? (
                <QuotaProgressRow key={label} label={`${label}额度`} window={window} />
              ) : null)
            ) : (
              <PlanPointsBar label="剩余积分" value={formatCloudPoints(group.remaining)} percent={usable && group.remaining > 0 ? 100 : 0} percentLabel={cloudEntitlementStatusLabel(group.status)} tone={usable ? "default" : "warning"} />
            )}
          </div>
        </div>
        <PlanActivateButton
          current={current}
          activating={activating}
          disabled={isBusy || current || !usable}
          onClick={() => onActivateGroup(group.externalGroupId)}
        />
      </div>
      <PlanModelSummary catalog={modelCatalog} fallbackCount={group.modelCount || 0} />
    </div>
  );
}

export function FallbackGroupCard({
  group,
  currentGroupId,
  busyAction,
  isBusy,
  modelCatalog,
  onActivateGroup,
}: {
  group: CloudGatewayGroup;
  currentGroupId: number;
  busyAction: string;
  isBusy: boolean;
  modelCatalog?: CloudGroupModelCatalogState;
  onActivateGroup: (externalGroupId: number) => void;
}) {
  const activating = busyAction === `activate:${group.externalGroupId}`;
  const current = group.isCurrent || group.externalGroupId === currentGroupId;
  const usable = !group.status || group.status === "active";
  return (
    <div className={planCardClass(current, usable)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <PlanTitle name={group.name} current={current} status={group.status || "unknown"} />
          <div className="mt-1 text-[10px] text-muted-foreground">{planTypeLabel(group)} · {formatMultiplier(group.rateMultiplier)}</div>
        </div>
        <PlanActivateButton
          current={current}
          activating={activating}
          disabled={isBusy || current || !usable}
          onClick={() => onActivateGroup(group.externalGroupId)}
        />
      </div>
      <PlanModelSummary catalog={modelCatalog} fallbackCount={group.modelCount || 0} />
    </div>
  );
}

export function CapabilityEntitlementCard({
  group,
  busyAction,
  isBusy,
  modelCatalog,
  providers,
  providerRefs,
  onActivateGroup,
}: {
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup;
  busyAction: string;
  isBusy: boolean;
  modelCatalog?: CloudGroupModelCatalogState;
  providers: ModelProviderConfig[];
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>;
  onActivateGroup: (externalGroupId: number) => void;
}) {
  const activating = busyAction === `activate:${group.externalGroupId}`;
  const kinds = groupCapabilityKinds(group, modelCatalog, providers, providerRefs);
  const activeKinds = activeCapabilityKinds(group.externalGroupId, providers, kinds);
  const active = kinds.length > 0 && activeKinds.length === kinds.length;
  const partial = activeKinds.length > 0 && !active;
  const loadingCapabilities = kinds.length === 0 && modelCatalog?.status === "loading";
  const usable = cloudEntitlementUsable(group.status || "");
  return (
    <div className={planCardClass(false, usable)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PlanTitle name={group.name} current={false} status={group.status || ""} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>官方能力</span>
            <span>·</span>
            <span>{capabilityGroupBillingLabel(group)}</span>
            <span>·</span>
            <span>{formatMultiplier(group.rateMultiplier)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {kinds.map((kind) => (
              <span
                key={kind}
                className={cx(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  "border-emerald-200 bg-emerald-50 text-emerald-800",
                )}
              >
                {kind === "embedding" ? <Database className="h-3 w-3" /> : kind === "ocr" ? <ScanText className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {kind === "embedding" ? "Embedding" : kind === "ocr" ? "OCR" : "Vision"}
              </span>
            ))}
            {partial && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">部分启用</span>}
            {active && <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">已启用</span>}
            {loadingCapabilities && <span className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">正在识别能力</span>}
            {!loadingCapabilities && kinds.length === 0 && <span className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">能力待同步</span>}
          </div>
          <div className="mt-3 space-y-2">
            {isBalanceEntitlementGroup(group) ? (
              <PlanPointsBar
                label="能力额度"
                value={`${formatCompactPoints(group.remaining)} / ${formatCompactPoints(balanceEntitlementLimit(group))}`}
                percent={balanceRemainingPercent(group.remaining, balanceEntitlementLimit(group))}
                percentLabel={`剩余 ${formatPercent(balanceRemainingPercent(group.remaining, balanceEntitlementLimit(group)))}`}
                tone={!usable || balanceRemainingPercent(group.remaining, balanceEntitlementLimit(group)) <= 15 ? "warning" : "default"}
              />
            ) : isSubscriptionEntitlementGroup(group) ? (
              group.unlimited ? (
                <PlanPointsBar label="能力额度" value="不限额" percent={100} percentLabel="不限额" />
              ) : group.daily || group.weekly || group.monthly ? (
                <>
                  {group.daily ? <QuotaProgressRow label="日额度" window={group.daily} /> : null}
                  {group.weekly ? <QuotaProgressRow label="周额度" window={group.weekly} /> : null}
                  {group.monthly ? <QuotaProgressRow label="月额度" window={group.monthly} /> : null}
                </>
              ) : (
                <PlanPointsBar label="剩余积分" value={formatCloudPoints(group.remaining)} percent={usable && group.remaining > 0 ? 100 : 0} percentLabel={cloudEntitlementStatusLabel(group.status)} tone={usable ? "default" : "warning"} />
              )
            ) : null}
          </div>
        </div>
        <PlanCapabilityButton
          active={active}
          partial={partial}
          activating={activating}
          disabled={isBusy || active || !usable}
          onClick={() => onActivateGroup(group.externalGroupId)}
        />
      </div>
      <PlanModelSummary catalog={modelCatalog} fallbackCount={group.modelCount || 0} />
    </div>
  );
}

function PlanModelSummary({ catalog, fallbackCount }: { catalog?: CloudGroupModelCatalogState; fallbackCount: number }) {
  const models = catalog?.models ?? [];
  const visibleModels = models.slice(0, 5);
  const total = catalog?.total || models.length || fallbackCount;
  const loading = catalog?.status === "loading";
  const error = catalog?.status === "error";
  const title = models.length > 0
    ? models.map((model) => cloudModelDisplayName(model)).join(", ")
    : error && catalog?.error
      ? catalog.error
      : `${total || 0} 个模型`;

  return (
    <div className="mt-3 border-t border-border/55 pt-2" title={title}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
          <span className="font-medium text-foreground">可用模型</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            {loading && models.length === 0 ? "加载中" : `${total || 0} 个`}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {visibleModels.map((model) => {
            const embedding = isEmbeddingCloudModel(model);
            return (
              <span
                key={model.id}
                className={cx(
                  "max-w-[180px] truncate rounded-md border px-1.5 py-0.5 text-[10px] leading-5",
                  embedding
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : model.supportsVision ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border/55 bg-background/80 text-muted-foreground",
                )}
              >
                {cloudModelDisplayName(model)}
              </span>
            );
          })}
          {models.length > visibleModels.length && (
            <span className="rounded-md border border-border/55 bg-background/80 px-1.5 py-0.5 text-[10px] leading-5 text-muted-foreground">
              +{models.length - visibleModels.length}
            </span>
          )}
          {models.length === 0 && !loading && (
            <span className={cx("rounded-md border px-1.5 py-0.5 text-[10px] leading-5", error ? "border-amber-200 bg-amber-50 text-amber-800" : "border-border/55 bg-background/80 text-muted-foreground")}>
              {fallbackCount > 0 ? `${fallbackCount} 个模型` : "暂无模型"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyPlanCard({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-3 py-6 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

function PlanTitle({ name, current, status }: { name: string; current: boolean; status: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-xs font-semibold text-foreground" title={name}>{name}</span>
      {current && <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">当前</span>}
      {!cloudEntitlementUsable(status) && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">{cloudEntitlementStatusLabel(status)}</span>}
    </div>
  );
}

function PlanPointsBar({
  label,
  value,
  percent,
  percentLabel,
  tone = "default",
}: {
  label: string;
  value: string;
  percent: number;
  percentLabel?: string;
  tone?: "default" | "warning";
}) {
  const clamped = clampPercent(percent);
  return (
    <div className="rounded-md border bg-background/70 px-2 py-2">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cx("h-full rounded-full transition-all", tone === "warning" ? "bg-amber-500" : "bg-foreground")} style={{ width: `${clamped}%` }} />
      </div>
      {percentLabel && <div className="mt-1 text-[10px] text-muted-foreground">{percentLabel}</div>}
    </div>
  );
}

function QuotaProgressRow({ label, window }: { label: string; window: CloudQuotaWindow }) {
  const percent = quotaRemainingPercent(window);
  const warning = percent <= 15;
  return (
    <PlanPointsBar
      label={label}
      value={`${formatCompactPoints(window.remaining)} / ${formatCompactPoints(window.limit)}`}
      percent={percent}
      percentLabel={`剩余 ${formatPercent(percent)}`}
      tone={warning ? "warning" : "default"}
    />
  );
}

function PlanActivateButton({ current, activating, disabled, onClick }: { current: boolean; activating: boolean; disabled: boolean; onClick: () => void }) {
  const label = current ? "使用中" : activating ? "切换中" : "切换套餐";
  return (
    <div className="flex shrink-0 justify-end">
      <button
        type="button"
        className={cx(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs shadow-sm transition disabled:cursor-not-allowed",
          current
            ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-950/[0.08]"
            : "border-border/70 bg-background/85 text-muted-foreground shadow-black/[0.02] hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
          !current && disabled && "opacity-45",
        )}
        disabled={disabled}
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        <Check className={cx("h-3.5 w-3.5", activating && "animate-pulse")} />
      </button>
    </div>
  );
}

function PlanCapabilityButton({ active, partial, activating, disabled, onClick }: { active: boolean; partial: boolean; activating: boolean; disabled: boolean; onClick: () => void }) {
  const label = active ? "已启用" : activating ? "启用中" : partial ? "补全能力" : "启用能力";
  return (
    <div className="flex shrink-0 justify-end">
      <button
        type="button"
        className={cx(
          "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed",
          active
            ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-950/[0.08]"
            : partial
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400"
              : "border-border/70 bg-background/85 text-muted-foreground shadow-black/[0.02] hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
          !active && disabled && "opacity-45",
        )}
        disabled={disabled}
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        <Check className={cx("h-3.5 w-3.5", activating && "animate-pulse")} />
        <span>{label}</span>
      </button>
    </div>
  );
}
