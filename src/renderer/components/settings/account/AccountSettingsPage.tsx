import { Cloud, ExternalLink, KeyRound, LogOut, PlugZap, RefreshCw, Save, ShieldCheck, Sparkles, UserRound, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
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
import { redeemKindLabel, redeemValueLabel, redeemedPlanLabel } from "@/components/settings/account/cloudAccountUtils";
import { ActionButton, CloudAuthStep, Field, MiniMetric } from "@/components/settings/shared/SettingsControls";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import { cx } from "@/lib/cn";
import { profileDisplayName, USER_AVATAR_OPTIONS, UserAvatar } from "@/lib/user-profile";
import { BREVYN_CLOUD_DEVELOPMENT_BASE_URL } from "../../../../types/cloud-config";
import type { CloudAccountStatus, CloudAuthMode, CloudRedeemCodeResult, ModelProviderConfig, UserProfileSettings } from "../../../../types/domain";

export type CloudBusyAction = "" | "status" | "login" | "register" | "refresh" | "redeem" | "logout" | `sync:${number}` | `activate:${number}`;

export interface CloudAccountForm {
  baseUrl: string;
  email: string;
  password: string;
  displayName: string;
}

interface AccountSettingsPageProps {
  profile: UserProfileSettings;
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
  onProfileChange: (profile: UserProfileSettings) => void;
}

export function AccountSettingsPage({
  profile,
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
  onProfileChange,
}: AccountSettingsPageProps) {
  const [profileDraft, setProfileDraft] = useState<UserProfileSettings>(profile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatusLine, setProfileStatusLine] = useState("");
  const authenticated = cloudStatus?.authenticated === true;
  const isBusy = Boolean(busyAction);
  const groups = cloudStatus?.groups ?? [];
  const entitlements = cloudStatus?.entitlements ?? null;
  const balanceGroups = entitlements?.balanceGroups ?? [];
  const subscriptionGroups = entitlements?.subscriptionGroups ?? [];
  const capabilityBalanceGroups = balanceGroups.filter((group) => isCloudCapabilityGroup(group, groupModels[group.externalGroupId], providers, cloudStatus?.providerRefs ?? []));
  const capabilitySubscriptionGroups = subscriptionGroups.filter((group) => isCloudCapabilityGroup(group, groupModels[group.externalGroupId], providers, cloudStatus?.providerRefs ?? []));
  const conversationBalanceGroups = balanceGroups.filter((group) => !isCloudCapabilityGroup(group, groupModels[group.externalGroupId], providers, cloudStatus?.providerRefs ?? []));
  const conversationSubscriptionGroups = subscriptionGroups.filter((group) => !isCloudCapabilityGroup(group, groupModels[group.externalGroupId], providers, cloudStatus?.providerRefs ?? []));
  const fallbackCapabilityGroups = !entitlements ? groups.filter((group) => isCloudCapabilityGroup(group, groupModels[group.externalGroupId], providers, cloudStatus?.providerRefs ?? [])) : [];
  const fallbackConversationGroups = !entitlements ? groups.filter((group) => !isCloudCapabilityGroup(group, groupModels[group.externalGroupId], providers, cloudStatus?.providerRefs ?? [])) : [];
  const capabilityGroupCount = capabilityBalanceGroups.length + capabilitySubscriptionGroups.length + fallbackCapabilityGroups.length;
  const currentGroupId = cloudStatus?.currentGroup?.externalGroupId || cloudStatus?.gateway?.defaultGroupId || 0;
  const walletRemaining = entitlements?.wallet.remaining ?? cloudStatus?.wallet?.balance ?? 0;
  const walletStatus = entitlements?.wallet.status || "";
  const statusMessage = statusLine || cloudStatus?.lastError || "";
  const profileDirty = profileDraft.displayName.trim() !== profile.displayName || profileDraft.avatarId !== profile.avatarId;
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

  useEffect(() => {
    setProfileDraft(profile);
    setProfileStatusLine("");
  }, [profile]);

  async function saveProfile() {
    const displayName = profileDraft.displayName.trim();
    if (!displayName) {
      setProfileStatusLine("昵称不能为空。");
      return;
    }
    setProfileSaving(true);
    try {
      const nextProfile = await window.brevyn.app.updateProfile({
        displayName,
        avatarId: profileDraft.avatarId,
      });
      onProfileChange(nextProfile);
      setProfileStatusLine("个人信息已保存。");
    } catch (error) {
      setProfileStatusLine(errorMessage(error, "保存个人信息失败。"));
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <section className="rounded-lg border bg-background/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <UserAvatar profile={profileDraft} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserRound className="h-4 w-4" />
                个人信息
              </div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                用于首页侧边栏展示；Cloud 登录账号保持独立。
              </div>
            </div>
          </div>
          <ActionButton
            icon={<Save className={cx("h-3.5 w-3.5", profileSaving && "animate-pulse")} />}
            label={profileSaving ? "保存中" : "保存"}
            onClick={() => void saveProfile()}
            primary
            disabled={profileSaving || !profileDirty}
          />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,260px)_1fr]">
          <Field
            label="显示名称"
            value={profileDraft.displayName}
            onChange={(displayName) => setProfileDraft((current) => ({ ...current, displayName }))}
            placeholder={profileDisplayName(profile)}
          />
          <div className="min-w-0">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">头像</div>
            <div className="flex flex-wrap gap-2">
              {USER_AVATAR_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cx(
                    "flex h-11 w-11 items-center justify-center rounded-xl border bg-card transition",
                    profileDraft.avatarId === option.id
                      ? "border-foreground/30 bg-emerald-50/70 text-foreground shadow-sm ring-1 ring-emerald-200"
                      : "text-muted-foreground hover:border-foreground/20 hover:bg-accent/70 hover:text-foreground",
                  )}
                  onClick={() => setProfileDraft((current) => ({ ...current, avatarId: option.id }))}
                  aria-pressed={profileDraft.avatarId === option.id}
                  aria-label={`选择${option.label}头像`}
                  title={option.label}
                >
                  <UserAvatar avatarId={option.id} size="sm" />
                </button>
              ))}
            </div>
          </div>
        </div>
        {profileStatusLine && (
          <div className={cx("mt-3 text-[11px] font-medium", profileStatusLine.includes("失败") || profileStatusLine.includes("不能为空") ? "text-destructive" : "text-emerald-700")}>
            {profileStatusLine}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-background/70 p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Cloud className="h-4 w-4" />
              Brevyn Cloud 账号
              <span className={cx(
                "rounded px-1.5 py-0.5 text-[9px] font-medium",
                cloudStatus?.environment === "development"
                  ? "bg-amber-50 text-amber-700"
                  : cloudStatus?.environment === "production"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-muted text-muted-foreground",
              )}>
                {cloudEnvironmentLabel}
              </span>
            </div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
              登录后自动准备官方模型配置；套餐切换会同步到当前对话可用的模型服务。
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
            <div className="rounded-xl border bg-card/90 p-3 shadow-sm ring-1 ring-border/45">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border bg-background/80 p-1">
                  <button
                    type="button"
                    className={cx("h-8 rounded-md px-4 text-xs font-medium transition", cloudMode === "login" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                    onClick={() => onModeChange("login")}
                    disabled={isBusy}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    className={cx("h-8 rounded-md px-4 text-xs font-medium transition", cloudMode === "register" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                    onClick={() => onModeChange("register")}
                    disabled={isBusy}
                  >
                    注册
                  </button>
                </div>
                <span className="hidden rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                  {cloudMode === "register" ? "新账号" : "已有账号"}
                </span>
              </div>

              <div className="space-y-2.5">
                {cloudBaseUrlEditable ? (
                  <Field label="Cloud 地址" value={cloudForm.baseUrl} onChange={(value) => onFormChange({ ...cloudForm, baseUrl: value })} placeholder={cloudStatus?.defaultBaseUrl || BREVYN_CLOUD_DEVELOPMENT_BASE_URL} />
                ) : (
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-background/72 px-2.5 py-2">
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
                <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/75 px-3 py-2 text-[11px] leading-5 text-amber-900">
                  {statusMessage}
                </div>
              )}
              <button
                type="button"
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={onSubmitAuth}
                disabled={isBusy || !cloudForm.email.trim() || !cloudForm.password.trim()}
              >
                <ShieldCheck className={cx("h-3.5 w-3.5", authBusy && "animate-pulse")} />
                {authBusy ? "正在同步" : authActionLabel}
              </button>
            </div>

            <div className="rounded-xl border bg-card/80 p-3 shadow-sm ring-1 ring-border/45">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="mt-3 text-xs font-semibold text-foreground">登录后自动准备官方服务</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Brevyn 会把 Cloud 账号、套餐和模型配置同步到本地，不需要手动复制 API Key。
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
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-muted-foreground">当前账号</div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground" title={cloudStatus.user?.email || ""}>{cloudStatus.user?.email || "-"}</div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground" title={cloudStatus.user?.displayName || ""}>{cloudStatus.user?.displayName || "已登录"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" />
                      账户积分
                    </div>
                    <div className="mt-1 truncate text-base font-semibold text-foreground">{formatCloudPoints(walletRemaining)}</div>
                  </div>
                  {entitlements?.stale && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">旧数据</span>}
                </div>
                {walletStatus && <div className="mt-2 text-[10px] text-muted-foreground">{cloudEntitlementStatusLabel(walletStatus)}</div>}
              </div>
            </div>

            <form
              className="rounded-lg border bg-card p-3"
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
                    <span className={cx("rounded px-2 py-1 text-[10px] font-medium", redeemResult.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                      {redeemResult.status === "ok" ? "已兑换" : redeemResult.status}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border bg-background/80 px-2">
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
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-45"
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
            </form>

	            <div className="space-y-4">
	              <div className="flex items-center justify-between gap-3">
	                <div className="min-w-0">
	                  <div className="text-xs font-semibold text-foreground">套餐</div>
	                  <div className="mt-1 text-[11px] text-muted-foreground">选择当前要使用的官方模型套餐。</div>
	                </div>
	              </div>

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
            "mt-4 min-h-9 rounded-md bg-muted/55 px-2 py-2 text-[11px] leading-5 text-muted-foreground transition-opacity",
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

