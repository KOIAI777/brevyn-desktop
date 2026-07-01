import { Check, KeyRound, Loader2, LogOut, PlugZap, RefreshCw, ServerCog, ShieldCheck, UserRound, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { AccountAuthStep, ActionButton, Field, MiniMetric } from "@/components/settings/shared/SettingsControls";
import { cx } from "@/lib/cn";
import type { ModelProviderConfig, Sub2AccountStatus, Sub2RedeemCodeResult } from "../../../../types/domain";

export type AccountAuthMode = "login" | "register";
export type AccountBusyAction = "" | "status" | "login" | "register" | "2fa" | "refresh" | "redeem" | "logout";

export interface AccountForm {
  baseUrl: string;
  email: string;
  password: string;
  displayName: string;
}

export interface AccountTwoFactorState {
  tempToken: string;
  email: string;
  code: string;
}

interface AccountSettingsPageProps {
  accountStatus: Sub2AccountStatus | null;
  authMode: AccountAuthMode;
  accountForm: AccountForm;
  twoFactor: AccountTwoFactorState | null;
  busyAction: AccountBusyAction;
  statusLine: string;
  redeemCode: string;
  redeemResult: Sub2RedeemCodeResult | null;
  providers: ModelProviderConfig[];
  onModeChange: (mode: AccountAuthMode) => void;
  onFormChange: (form: AccountForm) => void;
  onTwoFactorChange: (state: AccountTwoFactorState | null) => void;
  onRedeemCodeChange: (code: string) => void;
  onSubmitAuth: () => void;
  onSubmit2FA: () => void;
  onRefresh: () => void;
  onRedeem: () => void;
  onLogout: () => void;
}

export function AccountSettingsPage({
  accountStatus,
  authMode,
  accountForm,
  twoFactor,
  busyAction,
  statusLine,
  redeemCode,
  redeemResult,
  providers,
  onModeChange,
  onFormChange,
  onTwoFactorChange,
  onRedeemCodeChange,
  onSubmitAuth,
  onSubmit2FA,
  onRefresh,
  onRedeem,
  onLogout,
}: AccountSettingsPageProps) {
  const authenticated = accountStatus?.authenticated === true;
  const isBusy = Boolean(busyAction);
  const authBusy = busyAction === "login" || busyAction === "register";
  const statusMessage = statusLine || (authenticated ? accountStatus?.lastError || "" : "");
  const statusIsError = /失败|不存在|已被|过期|无法|失效|错误|异常|不足|unavailable|failed|error/i.test(statusMessage);
  const baseUrlEditable = accountStatus?.baseUrlEditable === true;
  const groups = accountStatus?.groups ?? [];
  const officialProviders = providers.filter((provider) => provider.id.startsWith("provider-sub2-official-"));
  const activeOfficialProvider = officialProviders.find((provider) => provider.enabled && provider.purpose === "agent");
  const activeOfficialProviderGroupId = activeOfficialProvider ? providerGroupId(activeOfficialProvider.id) : 0;
  const activeOfficialProviders = officialProviders.filter((provider) => provider.enabled);
  const providerRefs = accountStatus?.providerRefs ?? [];
  const usage = accountStatus?.usage ?? null;
  const authActionLabel = authMode === "register" ? "创建账号" : "登录";
  const authHelperText = authMode === "register"
    ? "注册后会同步官方账号状态；兑换或已有可用分组时，会生成本地官方模型配置。"
    : "登录后会同步账号、分组、API Key 和最近用量；本地只保存安全加密后的登录态和模型 Key。";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <section className="overflow-hidden rounded-[var(--radius-panel)] bg-card p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.55)]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border/45 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ServerCog className="h-3.5 w-3.5" />
              Brevyn Official
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">账号与官方模型</div>
            <div className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
              登录官方账号后，Brevyn 会从 sub2 同步可用分组，并在本地生成官方模型配置。
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
                    className={cx("h-8 rounded-[var(--radius-badge)] px-4 text-xs font-semibold transition active:scale-[0.98]", authMode === "login" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}
                    onClick={() => onModeChange("login")}
                    disabled={isBusy}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    className={cx("h-8 rounded-[var(--radius-badge)] px-4 text-xs font-semibold transition active:scale-[0.98]", authMode === "register" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}
                    onClick={() => onModeChange("register")}
                    disabled={isBusy}
                  >
                    注册
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {baseUrlEditable && (
                  <Field label="服务地址" value={accountForm.baseUrl} onChange={(value) => onFormChange({ ...accountForm, baseUrl: value })} placeholder={accountStatus?.defaultBaseUrl || "https://api.brevyn.org"} />
                )}
                <Field label="邮箱" value={accountForm.email} onChange={(value) => onFormChange({ ...accountForm, email: value })} placeholder="you@example.com" />
                {authMode === "register" && (
                  <Field label="昵称" value={accountForm.displayName} onChange={(value) => onFormChange({ ...accountForm, displayName: value })} placeholder="Brevyn 用户" />
                )}
                <Field label="密码" value={accountForm.password} onChange={(value) => onFormChange({ ...accountForm, password: value })} type="password" placeholder={authMode === "register" ? "至少 8 位" : "账号密码"} />
              </div>

              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">{authHelperText}</div>
              {statusMessage && !twoFactor && (
                <StatusMessage message={statusMessage} error={statusIsError} />
              )}
              <button
                type="button"
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={onSubmitAuth}
                disabled={isBusy || !accountForm.email.trim() || !accountForm.password.trim()}
              >
                <ShieldCheck className={cx("h-3.5 w-3.5", authBusy && "animate-pulse")} />
                {authBusy ? "正在同步" : authActionLabel}
              </button>

              {twoFactor && (
                <form
                  className="mt-3 rounded-[var(--radius-card)] bg-card p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit2FA();
                  }}
                >
                  <div className="text-xs font-semibold text-foreground">两步验证</div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {twoFactor.email ? `请输入 ${twoFactor.email} 的验证码。` : "请输入账号的两步验证码。"}
                  </div>
                  <div className="mt-2">
                    <Field label="验证码" value={twoFactor.code} onChange={(value) => onTwoFactorChange({ ...twoFactor, code: value })} placeholder="6 位验证码" />
                  </div>
                  <button
                    type="submit"
                    className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isBusy || !twoFactor.code.trim()}
                  >
                    <ShieldCheck className={cx("h-3.5 w-3.5", busyAction === "2fa" && "animate-pulse")} />
                    {busyAction === "2fa" ? "正在验证" : "完成登录"}
                  </button>
                </form>
              )}
            </div>

            <div className="rounded-[var(--radius-card)] bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="mt-3 text-xs font-semibold text-foreground">同步范围</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                官方账号只负责同步可用分组、创建专用 API Key，并把官方模型写入本地 provider。
              </div>
              <div className="mt-3 space-y-2">
                <AccountAuthStep icon={<UserRound className="h-3.5 w-3.5" />} label="验证账号" />
                <AccountAuthStep icon={<Wallet className="h-3.5 w-3.5" />} label="读取余额和用量" />
                <AccountAuthStep icon={<PlugZap className="h-3.5 w-3.5" />} label="生成官方模型" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.18fr)_0.82fr]">
              <div className="rounded-[var(--radius-card)] bg-background p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-muted text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Signed in</div>
                      <div className="mt-1 truncate text-base font-semibold text-foreground" title={accountStatus.user?.email || ""}>{accountStatus.user?.email || "-"}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground" title={accountStatus.user?.username || ""}>{accountStatus.user?.username || "已登录"}</div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-[var(--radius-pill)] bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
                    已连接
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <AccountMetric icon={<Wallet className="h-3.5 w-3.5" />} label="账户余额" value={formatUsd(accountStatus.user?.balance ?? 0)} detail={`${accountStatus.user?.concurrency ?? 0} 并发`} />
                  <AccountMetric icon={<ServerCog className="h-3.5 w-3.5" />} label="对话分组" value={activeOfficialProvider?.name || accountStatus.currentGroup?.name || "尚未选择"} detail={`${groups.length} 个可用分组`} />
                  <AccountMetric icon={<PlugZap className="h-3.5 w-3.5" />} label="官方模型" value={activeOfficialPurposeSummary(activeOfficialProviders) || "待同步"} detail={`${activeOfficialProviders.length}/${officialProviders.length} 个配置`} />
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] bg-background p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
                <div className="text-xs font-semibold text-foreground">最近用量</div>
                <div className="mt-1 text-[11px] leading-5 text-muted-foreground">来自 sub2 用户用量统计。</div>
                <div className="mt-2 grid gap-2">
                  <MiniMetric label="今日请求" value={formatInteger(usage?.todayRequests ?? 0)} />
                  <MiniMetric label="今日 Tokens" value={formatInteger(usage?.todayTokens ?? 0)} />
                  <MiniMetric label="今日扣费" value={formatUsd(usage?.todayActualCost ?? 0)} />
                </div>
              </div>
            </div>

            <form
              className="rounded-[var(--radius-card)] bg-background p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]"
              onSubmit={(event) => {
                event.preventDefault();
                onRedeem();
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    兑换码
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    兑换后会刷新余额、订阅和官方模型分组。
                  </div>
                </div>
                {redeemResult ? (
                  <span className="rounded-[var(--radius-badge)] bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200/70">
                    已兑换
                  </span>
                ) : null}
              </div>

              <div className="mt-2.5 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="brevyn-control-surface flex h-9 min-w-0 items-center gap-2 px-3">
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
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-4 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isBusy || !redeemCode.trim()}
                >
                  <RefreshCw className={cx("h-3.5 w-3.5", busyAction === "redeem" && "animate-spin")} />
                  {busyAction === "redeem" ? "兑换中" : "立即兑换"}
                </button>
              </div>

              {redeemResult ? (
                <div className="mt-2.5 grid gap-2 md:grid-cols-3">
                  <MiniMetric label="类型" value={redeemTypeLabel(redeemResult.type)} />
                  <MiniMetric label="到账" value={redeemValueLabel(redeemResult)} />
                  <MiniMetric label="模型同步" value={redeemResult.providerSyncStatus === "failed" ? "待重试" : redeemResult.providerSyncStatus === "provisioning" ? "准备中" : "已同步"} />
                </div>
              ) : null}
              {statusMessage ? <StatusMessage message={statusMessage} error={statusIsError} /> : null}
            </form>

            <section className="rounded-[var(--radius-card)] bg-background p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">官方模型分组</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">同步分组到对应用途；对话和官方能力可以来自不同分组。</div>
                </div>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {groups.map((group) => (
                  <OfficialGroupCard
                    key={group.id}
                    name={group.name}
                    platform={group.platform}
                    status={group.status}
                    subscriptionType={group.subscriptionType}
                    rateMultiplier={group.rateMultiplier}
                    current={group.id === activeOfficialProviderGroupId}
                    activeProviders={providersActiveForGroup(officialProviders, group.id)}
                    providerRefs={providerRefs.filter((ref) => ref.groupId === group.id)}
                    syncing={busyAction === "refresh" || busyAction === "login" || busyAction === "register" || busyAction === "2fa" || busyAction === "redeem"}
                  />
                ))}
                {groups.length === 0 && (
                  <div className="rounded-[var(--radius-card)] bg-card px-3 py-3 text-[11px] leading-5 text-muted-foreground ring-1 ring-border/55">
                    当前账号还没有可用分组。兑换套餐后刷新账号即可看到。
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {statusMessage && authenticated ? (
          <div className="mt-3 rounded-[var(--radius-control)] bg-card px-3 py-2 text-[11px] leading-5 text-muted-foreground shadow-inner ring-1 ring-black/[0.035]" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}
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

function OfficialGroupCard({
  name,
  platform,
  status,
  subscriptionType,
  rateMultiplier,
  current,
  activeProviders,
  providerRefs,
  syncing,
}: {
  name: string;
  platform: string;
  status: string;
  subscriptionType: string;
  rateMultiplier: number;
  current: boolean;
  activeProviders: ModelProviderConfig[];
  providerRefs: NonNullable<Sub2AccountStatus["providerRefs"]>;
  syncing: boolean;
}) {
  const active = activeProviders.length > 0;
  const synced = active || providerRefs.length > 0;
  const inactive = status === "inactive";
  const visiblePurposes = purposeSummary(activeProviders, providerRefs);
  const modelSummary = officialGroupModelSummary(activeProviders, providerRefs);
  const syncedAt = latestSyncedAt(providerRefs);
  return (
    <div className={cx(
      "rounded-[var(--radius-card)] bg-card p-3 shadow-sm ring-1 transition",
      active ? "ring-emerald-300/70" : "ring-border/55",
      inactive && "opacity-55",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-semibold text-foreground" title={name}>{name}</div>
            {active && (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{platform || "provider"}</span>
            <span>·</span>
            <span>{subscriptionType === "subscription" ? "订阅" : "余额"}</span>
            <span>·</span>
            <span>{formatMultiplier(rateMultiplier)}</span>
            <span>·</span>
            <span>{status || "active"}</span>
          </div>
          <div className="mt-2 truncate text-[11px] text-muted-foreground" title={modelSummary}>
            {modelSummary || (inactive ? "分组不可用" : "等待自动同步")}
          </div>
          {synced ? (
            <div className="mt-1 text-[10px] text-muted-foreground/80">
              {visiblePurposes || "官方模型"} · {groupModelCount(providerRefs, activeProviders)} 个模型{syncedAt ? ` · ${formatDate(syncedAt)}` : ""}
            </div>
          ) : null}
        </div>
        <span className={cx(
          "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[11px] font-semibold ring-1",
          active
            ? "bg-emerald-50 text-emerald-800 ring-emerald-200/70"
            : syncing && !inactive
              ? "bg-muted text-muted-foreground ring-border/55"
              : "bg-background text-muted-foreground ring-border/55",
        )}>
          {syncing && !active && !inactive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          {active ? (current ? "对话分组" : "已同步") : synced ? "已同步" : syncing && !inactive ? "同步中" : inactive ? "不可用" : "待同步"}
        </span>
      </div>
    </div>
  );
}

function StatusMessage({ message, error }: { message: string; error: boolean }) {
  return (
    <div
      className={cx(
        "mt-2.5 rounded-[var(--radius-control)] px-3 py-2 text-[11px] leading-5 shadow-sm ring-1",
        error
          ? "bg-red-50/90 text-red-800 ring-red-200/70"
          : "bg-emerald-50/90 text-emerald-800 ring-emerald-200/70",
      )}
    >
      {message}
    </div>
  );
}

function providersActiveForGroup(providers: ModelProviderConfig[], groupId: number): ModelProviderConfig[] {
  return providers.filter((provider) => provider.enabled && providerGroupId(provider.id) === groupId);
}

function activeOfficialPurposeSummary(providers: ModelProviderConfig[]): string {
  return purposeSummary(providers, []);
}

function purposeSummary(providers: ModelProviderConfig[], refs: NonNullable<Sub2AccountStatus["providerRefs"]>): string {
  const purposes = new Set([...providers.map((provider) => provider.purpose), ...refs.map((ref) => ref.purpose).filter(Boolean)]);
  return [...purposes]
    .sort((a, b) => purposeSortValue(a) - purposeSortValue(b))
    .map(purposeLabel)
    .join(" / ");
}

function officialGroupModelSummary(providers: ModelProviderConfig[], refs: NonNullable<Sub2AccountStatus["providerRefs"]>): string {
  const models = new Set<string>();
  for (const provider of providers) {
    if (provider.selectedModel) models.add(provider.selectedModel);
  }
  for (const ref of refs) {
    if (ref.selectedModel) models.add(ref.selectedModel);
  }
  return [...models].join(" / ");
}

function groupModelCount(refs: NonNullable<Sub2AccountStatus["providerRefs"]>, providers: ModelProviderConfig[]): number {
  if (refs.length > 0) return refs.reduce((total, ref) => total + Math.max(0, ref.modelCount || 0), 0);
  return providers.reduce((total, provider) => total + provider.models.filter((model) => model.enabled !== false).length, 0);
}

function latestSyncedAt(refs: NonNullable<Sub2AccountStatus["providerRefs"]>): string {
  let latest = "";
  for (const ref of refs) {
    if (!ref.syncedAt) continue;
    if (!latest || Date.parse(ref.syncedAt) > Date.parse(latest)) latest = ref.syncedAt;
  }
  return latest;
}

function purposeLabel(purpose: string | undefined): string {
  if (purpose === "agent") return "对话";
  if (purpose === "embedding") return "Embedding";
  if (purpose === "vision") return "Vision";
  if (purpose === "ocr") return "OCR";
  return "官方模型";
}

function purposeSortValue(purpose: string | undefined): number {
  if (purpose === "agent") return 0;
  if (purpose === "embedding") return 1;
  if (purpose === "vision") return 2;
  if (purpose === "ocr") return 3;
  return 4;
}

function providerGroupId(providerId: string): number {
  const prefix = "provider-sub2-official-";
  if (!providerId.startsWith(prefix)) return 0;
  const suffix = providerId.slice(prefix.length);
  const parts = suffix.split("-");
  const raw = parts.length > 1 ? parts.slice(1).join("-") : suffix;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function redeemTypeLabel(type?: string): string {
  if (type === "subscription") return "套餐";
  if (type === "balance") return "余额";
  if (type === "concurrency") return "并发";
  return type || "兑换";
}

function redeemValueLabel(result: Sub2RedeemCodeResult): string {
  if (result.type === "subscription") return `${result.value || 0} 天`;
  if (result.newBalance !== undefined) return formatUsd(result.newBalance);
  if (result.newConcurrency !== undefined) return `${formatInteger(result.newConcurrency)} 并发`;
  return formatUsd(result.value || 0);
}

function formatUsd(value: number): string {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(4).replace(/\.?0+$/, "")}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Number.isFinite(value) ? value : 0);
}

function formatMultiplier(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "倍率 -";
  return `${value.toFixed(2).replace(/\.?0+$/, "")}x`;
}

function formatDate(value: string): string {
  if (!value) return "刚刚同步";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "刚刚同步";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}
