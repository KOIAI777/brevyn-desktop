import { Cloud, Database, ExternalLink, Eye, KeyRound, LogOut, PlugZap, RefreshCw, ScanText, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { useMemo, useRef, type ReactNode } from "react";
import {
  BalanceEntitlementCard,
  CapabilityEntitlementCard,
  EmptyPlanCard,
  FallbackGroupCard,
  PlanSection,
  SubscriptionEntitlementCard,
  SubscriptionPlanNotice,
} from "@/components/settings/account/CloudPlanCards";
import {
  cloudEntitlementStatusLabel,
  formatCloudPoints,
  isCloudCapabilityGroup,
  type CloudGroupModelCatalogState,
} from "@/components/settings/account/cloudPlanUtils";
import { redeemKindLabel, redeemStatusLabel, redeemValueLabel, redeemedPlanLabel } from "@/components/settings/account/cloudAccountUtils";
import { ActionButton, CloudAuthStep, Field, MiniMetric } from "@/components/settings/shared/SettingsControls";
import { cx } from "@/lib/cn";
import { BREVYN_CLOUD_DEVELOPMENT_BASE_URL } from "../../../../types/cloud-config";
import type { CloudAccountStatus, CloudAuthMode, CloudGatewayEntitlementGroup, CloudGatewayGroup, CloudRedeemCodeResult, ModelProviderConfig } from "../../../../types/domain";

export type CloudBusyAction = "" | "status" | "login" | "register" | "refresh" | "redeem" | "logout" | `sync:${number}` | `activate:${number}`;

export interface CloudAccountForm {
  baseUrl: string;
  email: string;
  password: string;
  displayName: string;
}

interface AccountSettingsPageProps {
  cloudStatus: CloudAccountStatus | null;
  cloudMode: CloudAuthMode;
  cloudForm: CloudAccountForm;
  busyAction: CloudBusyAction;
  statusLine: string;
  redeemCode: string;
  redeemResult: CloudRedeemCodeResult | null;
  groupModels: Record<number, CloudGroupModelCatalogState>;
  providers: ModelProviderConfig[];
  onModeChange: (mode: CloudAuthMode) => void;
  onFormChange: (form: CloudAccountForm) => void;
  onRedeemCodeChange: (code: string) => void;
  onSubmitAuth: () => void;
  onRefresh: () => void;
  onActivateGroup: (externalGroupId: number) => void;
  onRedeem: () => void;
  onOpenShop: () => void;
  onLogout: () => void;
}

export function AccountSettingsPage({
  cloudStatus,
  cloudMode,
  cloudForm,
  busyAction,
  statusLine,
  redeemCode,
  redeemResult,
  groupModels,
  providers,
  onModeChange,
  onFormChange,
  onRedeemCodeChange,
  onSubmitAuth,
  onRefresh,
  onActivateGroup,
  onRedeem,
  onOpenShop,
  onLogout,
}: AccountSettingsPageProps) {
  const groupClassificationCacheRef = useRef<Record<number, "conversation" | "capability">>({});
  const authenticated = cloudStatus?.authenticated === true;
  const isBusy = Boolean(busyAction);
  const groups = cloudStatus?.groups ?? [];
  const entitlements = cloudStatus?.entitlements ?? null;
  const balanceGroups = entitlements?.balanceGroups ?? [];
  const subscriptionGroups = entitlements?.subscriptionGroups ?? [];
  const providerRefs = cloudStatus?.providerRefs ?? [];
  const classifiedGroups = useMemo(() => {
    const cache = groupClassificationCacheRef.current;
    const classifyGroup = (group: CloudGatewayEntitlementGroup | CloudGatewayGroup): "conversation" | "capability" | "pending" => {
      const groupId = group.externalGroupId;
      const catalog = groupModels[groupId];
      const cached = cache[groupId];
      const stableHintIsCapability = isCloudCapabilityGroup(group, undefined, providers, providerRefs);
      const catalogPending = !catalog || catalog.status === "loading";

      if (catalogPending) {
        if (cached) return cached;
        if (stableHintIsCapability) {
          cache[groupId] = "capability";
          return "capability";
        }
        return Number(group.modelCount || 0) > 0 ? "pending" : "conversation";
      }

      const bucket = isCloudCapabilityGroup(group, catalog, providers, providerRefs) ? "capability" : "conversation";
      cache[groupId] = bucket;
      return bucket;
    };

    return {
      capabilityBalanceGroups: balanceGroups.filter((group) => classifyGroup(group) === "capability"),
      capabilitySubscriptionGroups: subscriptionGroups.filter((group) => classifyGroup(group) === "capability"),
      conversationBalanceGroups: balanceGroups.filter((group) => classifyGroup(group) === "conversation"),
      conversationSubscriptionGroups: subscriptionGroups.filter((group) => classifyGroup(group) === "conversation"),
      fallbackCapabilityGroups: entitlements ? [] : groups.filter((group) => classifyGroup(group) === "capability"),
      fallbackConversationGroups: entitlements ? [] : groups.filter((group) => classifyGroup(group) === "conversation"),
      pendingGroups: [
        ...balanceGroups.filter((group) => classifyGroup(group) === "pending"),
        ...subscriptionGroups.filter((group) => classifyGroup(group) === "pending"),
        ...(entitlements ? [] : groups.filter((group) => classifyGroup(group) === "pending")),
      ],
    };
  }, [balanceGroups, entitlements, groupModels, groups, providerRefs, providers, subscriptionGroups]);
  const {
    capabilityBalanceGroups,
    capabilitySubscriptionGroups,
    conversationBalanceGroups,
    conversationSubscriptionGroups,
    fallbackCapabilityGroups,
    fallbackConversationGroups,
    pendingGroups,
  } = classifiedGroups;
  const capabilityGroupCount = capabilityBalanceGroups.length + capabilitySubscriptionGroups.length + fallbackCapabilityGroups.length;
  const currentGroupId = cloudStatus?.currentGroup?.externalGroupId || cloudStatus?.gateway?.defaultGroupId || 0;
  const walletRemaining = entitlements?.wallet.remaining ?? cloudStatus?.wallet?.balance ?? 0;
  const walletStatus = entitlements?.wallet.status || "";
  const currentPlanName = cloudStatus?.currentGroup?.name || "尚未选择";
  const officialProviderKinds = providers.filter((provider) => provider.id.startsWith("provider-brevyn-cloud-official-") && provider.enabled).reduce((kinds, provider) => {
    if (provider.purpose === "embedding") kinds.add("embedding");
    if (provider.purpose === "vision") kinds.add("vision");
    if (provider.purpose === "ocr") kinds.add("ocr");
    return kinds;
  }, new Set<string>());
  const statusMessage = statusLine || cloudStatus?.lastError || "";
  const statusIsError = /失败|不存在|已被|过期|无法|失效|错误|异常|不足|unavailable|failed|error/i.test(statusMessage);
  const cloudBaseUrlEditable = cloudStatus?.baseUrlEditable === true;
  const cloudEnvironmentLabel = cloudStatus?.environment === "development"
    ? "开发模式"
    : cloudStatus?.environment === "production"
      ? "生产模式"
      : "加载中";
  const cloudBaseUrlLabel = cloudStatus ? cloudStatus.baseUrl || cloudStatus.defaultBaseUrl : "正在读取 Cloud 配置";
  const authBusy = busyAction === "login" || busyAction === "register";
  const authActionLabel = cloudMode === "register" ? "创建账号并同步" : "登录并同步官方模型";
  const authHelperText = cloudMode === "register"
    ? "密码至少 8 位。注册成功后会自动同步账号套餐和官方模型。"
    : "登录后会同步账号、余额、套餐和可用官方模型。";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <section className="overflow-hidden rounded-[var(--radius-panel)] bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.55)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/45 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Cloud className="h-3.5 w-3.5" />
              Brevyn Cloud
            </div>
            <div className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
              账号与官方权限
              <span className={cx(
                "rounded-[var(--radius-pill)] px-2 py-0.5 text-[9px] font-medium",
                cloudStatus?.environment === "development"
                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70"
                  : cloudStatus?.environment === "production"
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70"
                    : "bg-muted text-muted-foreground ring-1 ring-black/[0.035]",
              )}>
                {cloudEnvironmentLabel}
              </span>
            </div>
            <div className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
              管理 Cloud 登录状态、余额套餐和官方能力分组。本地会按当前权限同步模型配置。
            </div>
          </div>
          {authenticated && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <ActionButton
                icon={<RefreshCw className={cx("h-3.5 w-3.5", busyAction === "refresh" && "animate-spin")} />}
                label="刷新账号"
                onClick={onRefresh}
                disabled={isBusy}
              />
              <ActionButton
                icon={<LogOut className="h-3.5 w-3.5" />}
                label="退出"
                onClick={onLogout}
                disabled={isBusy}
              />
            </div>
          )}
        </div>

        {!authenticated ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="rounded-[var(--radius-card)] bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-[var(--radius-control)] bg-background p-1 shadow-inner ring-1 ring-black/[0.04]">
                  <button
                    type="button"
                    className={cx("h-8 rounded-[var(--radius-badge)] px-4 text-xs font-semibold transition active:scale-[0.98]", cloudMode === "login" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}
                    onClick={() => onModeChange("login")}
                    disabled={isBusy}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    className={cx("h-8 rounded-[var(--radius-badge)] px-4 text-xs font-semibold transition active:scale-[0.98]", cloudMode === "register" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}
                    onClick={() => onModeChange("register")}
                    disabled={isBusy}
                  >
                    注册
                  </button>
                </div>
                <span className="hidden rounded-[var(--radius-pill)] bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                  {cloudMode === "register" ? "新账号" : "已有账号"}
                </span>
              </div>

              <div className="space-y-2.5">
                {cloudBaseUrlEditable ? (
                  <Field label="Cloud 地址" value={cloudForm.baseUrl} onChange={(value) => onFormChange({ ...cloudForm, baseUrl: value })} placeholder={cloudStatus?.defaultBaseUrl || BREVYN_CLOUD_DEVELOPMENT_BASE_URL} />
                ) : (
                  <div className="brevyn-control-surface flex min-w-0 items-center gap-2 px-3 py-2.5">
                    <Cloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">官方 Cloud</div>
                      <div className="truncate text-xs font-medium text-foreground" title={cloudBaseUrlLabel}>{cloudBaseUrlLabel}</div>
                    </div>
                  </div>
                )}
                <Field label="邮箱" value={cloudForm.email} onChange={(value) => onFormChange({ ...cloudForm, email: value })} placeholder="you@example.com" />
                {cloudMode === "register" && (
                  <Field label="昵称" value={cloudForm.displayName} onChange={(value) => onFormChange({ ...cloudForm, displayName: value })} placeholder="Brevyn 用户" />
                )}
                <Field label="密码" value={cloudForm.password} onChange={(value) => onFormChange({ ...cloudForm, password: value })} type="password" placeholder={cloudMode === "register" ? "至少 8 位" : "Cloud 密码"} />
              </div>

              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">{authHelperText}</div>
              {statusMessage && (
                <div className="mt-3 rounded-[var(--radius-control)] bg-amber-50/90 px-3 py-2 text-[11px] leading-5 text-amber-900 shadow-sm ring-1 ring-amber-200/60">
                  {statusMessage}
                </div>
              )}
              <button
                type="button"
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={onSubmitAuth}
                disabled={isBusy || !cloudForm.email.trim() || !cloudForm.password.trim()}
              >
                <ShieldCheck className={cx("h-3.5 w-3.5", authBusy && "animate-pulse")} />
                {authBusy ? "正在同步" : authActionLabel}
              </button>
            </div>

            <div className="rounded-[var(--radius-card)] bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="mt-3 text-xs font-semibold text-foreground">同步范围</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                登录后会校验账号、读取权益，并生成本地可用的官方模型配置。
              </div>
              <div className="mt-3 space-y-2">
                <CloudAuthStep icon={<UserRound className="h-3.5 w-3.5" />} label="验证账号" />
                <CloudAuthStep icon={<Wallet className="h-3.5 w-3.5" />} label="同步余额和套餐" />
                <CloudAuthStep icon={<PlugZap className="h-3.5 w-3.5" />} label="准备官方模型" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_0.85fr]">
              <div className="rounded-[var(--radius-card)] bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-muted text-muted-foreground">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Signed in</div>
                      <div className="mt-1 truncate text-base font-semibold text-foreground" title={cloudStatus.user?.email || ""}>{cloudStatus.user?.email || "-"}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground" title={cloudStatus.user?.displayName || ""}>{cloudStatus.user?.displayName || "已登录"}</div>
                    </div>
                  </div>
                  {entitlements?.stale && <span className="shrink-0 rounded-[var(--radius-pill)] bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">旧数据</span>}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <AccountMetric icon={<Wallet className="h-3.5 w-3.5" />} label="账户余额" value={formatCloudPoints(walletRemaining)} detail={walletStatus ? cloudEntitlementStatusLabel(walletStatus) : "实时余额"} />
                  <AccountMetric icon={<Cloud className="h-3.5 w-3.5" />} label="当前套餐" value={currentPlanName} detail={`${conversationBalanceGroups.length + conversationSubscriptionGroups.length + fallbackConversationGroups.length} 个对话分组`} />
                  <AccountMetric icon={<PlugZap className="h-3.5 w-3.5" />} label="官方能力" value={capabilityGroupCount > 0 ? `${capabilityGroupCount} 组` : "待同步"} detail={officialProviderKinds.size > 0 ? `${officialProviderKinds.size} 项已准备` : "Embedding / OCR / Vision"} />
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
                <div className="text-xs font-semibold text-foreground">官方能力状态</div>
                <div className="mt-1 text-[11px] leading-5 text-muted-foreground">Embedding、OCR、Vision 会跟随 Cloud 分组自动同步。</div>
                <div className="mt-3 grid gap-2">
                  <CapabilityMiniState icon={<Database className="h-3.5 w-3.5" />} label="Embedding" active={officialProviderKinds.has("embedding")} />
                  <CapabilityMiniState icon={<ScanText className="h-3.5 w-3.5" />} label="OCR" active={officialProviderKinds.has("ocr")} />
                  <CapabilityMiniState icon={<Eye className="h-3.5 w-3.5" />} label="Vision" active={officialProviderKinds.has("vision")} />
                </div>
              </div>
            </div>

            <form
              className="rounded-[var(--radius-card)] bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]"
              onSubmit={(event) => {
                event.preventDefault();
                onRedeem();
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    兑换卡密
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    兑换后会自动更新余额或套餐。
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <ActionButton
                    icon={<ExternalLink className="h-3.5 w-3.5" />}
                    label="购买套餐"
                    onClick={onOpenShop}
                  />
                  {redeemResult ? (
                    <span className={cx("rounded-[var(--radius-badge)] px-2 py-1 text-[10px] font-medium", redeemResult.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                      {redeemStatusLabel(redeemResult.status)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="brevyn-control-surface flex h-10 min-w-0 items-center gap-2 px-3">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-xs font-medium tracking-[0.04em] text-foreground outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/55 disabled:cursor-not-allowed disabled:text-muted-foreground"
                    value={redeemCode}
                    disabled={isBusy}
                    onChange={(event) => onRedeemCodeChange(event.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-4 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isBusy || !redeemCode.trim()}
                >
                  <RefreshCw className={cx("h-3.5 w-3.5", busyAction === "redeem" && "animate-spin")} />
                  {busyAction === "redeem" ? "兑换中" : "立即兑换"}
                </button>
              </div>

              {redeemResult ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <MiniMetric label="商品" value={redeemResult.result.redemption.productName || redeemKindLabel(redeemResult.result.redemption.kind)} />
                  <MiniMetric label="到账" value={redeemValueLabel(redeemResult)} />
                  <MiniMetric label="套餐" value={redeemedPlanLabel(redeemResult, groups)} />
                </div>
              ) : null}
              {statusMessage ? (
                <div
                  className={cx(
                    "mt-3 rounded-[var(--radius-control)] px-3 py-2 text-[11px] leading-5 shadow-sm ring-1",
                    statusIsError
                      ? "bg-red-50/90 text-red-800 ring-red-200/70"
                      : "bg-emerald-50/90 text-emerald-800 ring-emerald-200/70",
                  )}
                >
                  {statusMessage}
                </div>
              ) : null}
            </form>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">权益分组</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    对话套餐控制聊天额度，官方能力用于 Embedding / OCR / Vision。{pendingGroups.length > 0 ? "正在同步分组能力，布局会保持稳定。" : ""}
                  </div>
                </div>
              </div>

	              {pendingGroups.length > 0 && (
	                <PlanSection title="同步中" detail={`${pendingGroups.length} 个分组正在识别能力`}>
	                  <div className="grid gap-2 lg:grid-cols-2">
	                    {pendingGroups.map((group) => (
	                      <SyncingPlanCard key={group.externalGroupId} group={group} />
	                    ))}
	                  </div>
	                </PlanSection>
	              )}

	              <PlanSection title="余额套餐" detail={`${conversationBalanceGroups.length} 个对话分组`}>
	                <div className="grid gap-2 lg:grid-cols-2">
	                  {conversationBalanceGroups.map((group) => (
	                    <BalanceEntitlementCard
	                      key={group.externalGroupId}
	                      group={group}
	                      currentGroupId={currentGroupId}
	                      busyAction={busyAction}
	                      isBusy={isBusy}
	                      modelCatalog={groupModels[group.externalGroupId]}
	                      onActivateGroup={onActivateGroup}
	                    />
	                  ))}
	                  {conversationBalanceGroups.length === 0 && <EmptyPlanCard label="暂无余额对话套餐。" />}
	                </div>
	              </PlanSection>

	              <PlanSection title="订阅套餐" detail={`${conversationSubscriptionGroups.length} 个对话分组`}>
	                <SubscriptionPlanNotice />
	                <div className="grid gap-2 lg:grid-cols-2">
	                  {conversationSubscriptionGroups.map((group) => (
	                    <SubscriptionEntitlementCard
	                      key={group.externalGroupId}
	                      group={group}
	                      currentGroupId={currentGroupId}
	                      busyAction={busyAction}
	                      isBusy={isBusy}
	                      modelCatalog={groupModels[group.externalGroupId]}
	                      onActivateGroup={onActivateGroup}
	                    />
	                  ))}
	                  {conversationSubscriptionGroups.length === 0 && <EmptyPlanCard label="暂无订阅对话套餐。" />}
	                </div>
	              </PlanSection>

	              {capabilityGroupCount > 0 && (
	                <PlanSection title="官方能力" detail={`${capabilityGroupCount} 个能力分组`}>
	                  <div className="grid gap-2 lg:grid-cols-2">
	                    {capabilityBalanceGroups.map((group) => (
	                      <CapabilityEntitlementCard
	                        key={`balance-${group.externalGroupId}`}
	                        group={group}
	                        busyAction={busyAction}
	                        isBusy={isBusy}
	                        modelCatalog={groupModels[group.externalGroupId]}
	                        providers={providers}
	                        providerRefs={cloudStatus?.providerRefs ?? []}
	                        onActivateGroup={onActivateGroup}
	                      />
	                    ))}
	                    {capabilitySubscriptionGroups.map((group) => (
	                      <CapabilityEntitlementCard
	                        key={`subscription-${group.externalGroupId}`}
	                        group={group}
	                        busyAction={busyAction}
	                        isBusy={isBusy}
	                        modelCatalog={groupModels[group.externalGroupId]}
	                        providers={providers}
	                        providerRefs={cloudStatus?.providerRefs ?? []}
	                        onActivateGroup={onActivateGroup}
	                      />
	                    ))}
	                    {fallbackCapabilityGroups.map((group) => (
	                      <CapabilityEntitlementCard
	                        key={`local-${group.externalGroupId}`}
	                        group={group}
	                        busyAction={busyAction}
	                        isBusy={isBusy}
	                        modelCatalog={groupModels[group.externalGroupId]}
	                        providers={providers}
	                        providerRefs={cloudStatus?.providerRefs ?? []}
	                        onActivateGroup={onActivateGroup}
	                      />
	                    ))}
	                  </div>
	                </PlanSection>
	              )}

	              {!entitlements && fallbackConversationGroups.length > 0 && (
	                <PlanSection title="本地分组" detail="等待实时余额">
	                  <div className="grid gap-2 lg:grid-cols-2">
	                    {fallbackConversationGroups.map((group) => (
	                      <FallbackGroupCard
	                        key={group.externalGroupId}
	                        group={group}
	                        currentGroupId={currentGroupId}
	                        busyAction={busyAction}
	                        isBusy={isBusy}
	                        modelCatalog={groupModels[group.externalGroupId]}
	                        onActivateGroup={onActivateGroup}
	                      />
	                    ))}
	                  </div>
	                </PlanSection>
	              )}
	            </div>
          </div>
        )}

        <div
          className={cx(
            "mt-4 min-h-9 rounded-[var(--radius-control)] bg-card px-3 py-2 text-[11px] leading-5 text-muted-foreground shadow-inner transition-opacity ring-1 ring-black/[0.035]",
            statusMessage ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-live="polite"
          aria-hidden={!statusMessage}
        >
          {statusMessage}
        </div>
      </section>
    </div>
  );
}

function AccountMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="brevyn-control-surface min-w-0 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={detail}>{detail}</div>
    </div>
  );
}

function CapabilityMiniState({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <div className="brevyn-card-surface flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)]", active ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
          {icon}
        </span>
        <span className="truncate text-xs font-semibold text-foreground">{label}</span>
      </div>
      <span className={cx("shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-semibold", active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
        {active ? "已准备" : "待同步"}
      </span>
    </div>
  );
}

function SyncingPlanCard({ group }: { group: CloudGatewayEntitlementGroup | CloudGatewayGroup }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-card p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.48)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{group.name}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            正在识别分组能力 · {group.modelCount || 0} 个模型
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm ring-1 ring-black/[0.035]">
          <RefreshCw className="h-3 w-3 animate-spin" />
          同步中
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="h-2 rounded-[var(--radius-pill)] bg-muted" />
        <div className="h-2 w-2/3 rounded-[var(--radius-pill)] bg-muted/70" />
      </div>
    </div>
  );
}
