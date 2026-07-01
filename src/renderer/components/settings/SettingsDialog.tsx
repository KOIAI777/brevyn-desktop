import {
  Archive,
  CalendarDays,
  Check,
  CreditCard,
  Info,
  Languages,
  PlugZap,
  Server,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AboutUpdateSettingsPage } from "@/components/settings/about/AboutUpdateSettingsPage";
import { ArchiveSettingsPage } from "@/components/settings/archive/ArchiveSettingsPage";
import {
  AccountSettingsPage,
  type AccountAuthMode,
  type AccountBusyAction,
  type AccountForm,
  type AccountTwoFactorState,
} from "@/components/settings/account/AccountSettingsPage";
import { BillingRecordsSettingsPage } from "@/components/settings/billing/BillingRecordsSettingsPage";
import { GeneralSettingsPage } from "@/components/settings/general/GeneralSettingsPage";
import { McpSettingsPage } from "@/components/settings/mcp/McpSettingsPage";
import { ProviderSettingsPage } from "@/components/settings/providers/ProviderSettingsPage";
import { useProviderSettingsState } from "@/components/settings/providers/useProviderSettingsState";
import { SemesterSettingsPage } from "@/components/settings/semesters/SemesterSettingsPage";
import { SkillSettingsPage } from "@/components/settings/skills/SkillSettingsPage";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import { cx } from "@/lib/cn";
import {
  type AppThemeState,
  type Course,
  type GitStatus,
  type ModelProviderConfig,
  type SemesterWorkspace,
  type SkillItem,
  type Sub2AccountStatus,
  type Sub2OfficialProviderSyncResult,
  type Sub2RedeemCodeResult,
  type UserProfileSettings,
} from "../../../types/domain";

type SettingsPage = "account" | "billing" | "general" | "providers" | "semesters" | "archive" | "skills" | "mcp" | "about";

const ACCOUNT_STATUS_AUTO_DISMISS_MS = 4_000;
const DEFAULT_SUB2_BASE_URL = "https://api.brevyn.org";

export function SettingsDialog({
  initialPage = "providers",
  course,
  semester,
  profile,
  themeState,
  skills,
  gitStatus,
  onProfileChange,
  onThemeStateChange,
  onSkillsChange,
  onWorkspaceChanged,
  onSelectSemester,
  onAgentProviderChanged,
  onClose,
}: {
  initialPage?: SettingsPage;
  course?: Course;
  semester?: SemesterWorkspace | null;
  profile: UserProfileSettings;
  themeState: AppThemeState;
  skills: SkillItem[];
  gitStatus: GitStatus | null;
  onProfileChange: (profile: UserProfileSettings) => void;
  onThemeStateChange: (themeState: AppThemeState) => void;
  onSkillsChange: (skills: SkillItem[]) => void;
  onWorkspaceChanged?: () => Promise<void> | void;
  onSelectSemester?: (semesterId: string) => Promise<void> | void;
  onAgentProviderChanged?: (providerSelection: string) => Promise<void> | void;
  onClose: () => void;
}) {
  void course;
  const [activePage, setActivePage] = useState<SettingsPage>(initialPage);
  const {
    providers,
    providerToast,
    providerConfirmDialog,
    providerPageProps,
    loadProviders,
    showProviderToast,
  } = useProviderSettingsState({ onAgentProviderChanged });
  const [accountStatus, setAccountStatus] = useState<Sub2AccountStatus | null>(null);
  const [accountMode, setAccountMode] = useState<AccountAuthMode>("login");
  const [accountBusyAction, setAccountBusyAction] = useState<AccountBusyAction>("status");
  const [accountStatusLine, setAccountStatusLine] = useState("");
  const [accountRedeemCode, setAccountRedeemCode] = useState("");
  const [accountRedeemResult, setAccountRedeemResult] = useState<Sub2RedeemCodeResult | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    baseUrl: DEFAULT_SUB2_BASE_URL,
    email: "",
    password: "",
    displayName: "",
  });
  const [twoFactor, setTwoFactor] = useState<AccountTwoFactorState | null>(null);
  const [localSkills, setLocalSkills] = useState(skills);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillStatusLine, setSkillStatusLine] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);
  const accountStatusDismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActivePage(initialPage);
  }, [initialPage]);

  const enabledSkills = localSkills.filter((skill) => skill.enabled).length;
  const chatProviders = providers.filter((provider) => provider.purpose === "agent");
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const visionProviders = providers.filter((provider) => provider.purpose === "vision");
  const activeAgentProviders = chatProviders.filter((provider) => provider.enabled);
  const activeEmbeddingProviders = embeddingProviders.filter((provider) => provider.enabled);
  const activeVisionProviders = visionProviders.filter((provider) => provider.enabled);
  const enabledProviders = activeAgentProviders.length;
  const activeEmbeddingProvider = activeEmbeddingProviders.length === 1 ? activeEmbeddingProviders[0] : undefined;
  const embeddingProviderDetail = activeEmbeddingProviders.length > 1
    ? "多个 Embedding"
    : activeEmbeddingProvider?.selectedModel || "未配置向量模型";
  const visionProviderDetail = activeVisionProviders.length > 1
    ? "多个 Vision"
    : activeVisionProviders[0]?.selectedModel || "未配置视觉模型";
  const accountNavDetail = accountStatus?.authenticated
    ? accountStatus.user?.email || "已登录"
    : "登录官方账号";

  useEffect(() => {
    void loadAccountStatus();
  }, []);

  useEffect(() => {
    if (!accountStatus?.authenticated || activePage !== "account") return;
    void refreshAccount({ quiet: true });
  }, [activePage, accountStatus?.authenticated]);

  useEffect(() => {
    if (accountStatusDismissTimerRef.current !== null) {
      window.clearTimeout(accountStatusDismissTimerRef.current);
      accountStatusDismissTimerRef.current = null;
    }
    if (!accountStatusLine || statusLineIsError(accountStatusLine)) return;
    accountStatusDismissTimerRef.current = window.setTimeout(() => {
      setAccountStatusLine("");
      accountStatusDismissTimerRef.current = null;
    }, ACCOUNT_STATUS_AUTO_DISMISS_MS);
    return () => {
      if (accountStatusDismissTimerRef.current !== null) {
        window.clearTimeout(accountStatusDismissTimerRef.current);
        accountStatusDismissTimerRef.current = null;
      }
    };
  }, [accountStatusLine]);

  useEffect(() => {
    setLocalSkills(skills);
  }, [skills]);

  useEffect(() => {
    void window.brevyn.skills
      .list()
      .then(setLocalSkills)
      .catch((error) => setSkillStatusLine(`加载 Skill 失败：${errorMessage(error)}`));
  }, []);

  useEffect(() => {
    setSelectedSkillId((current) => (localSkills.some((skill) => skill.id === current) ? current : (localSkills[0]?.id ?? "")));
  }, [localSkills]);

  useEffect(() => {
    if (!selectedSkillId) {
      setSkillContent("");
      return;
    }
    let cancelled = false;
    setSkillBusy(true);
    void window.brevyn.skills
      .readContent(selectedSkillId)
      .then((content) => {
        if (cancelled) return;
        setSkillContent(content);
        setSkillStatusLine("");
      })
      .catch((error) => {
        if (cancelled) return;
        setSkillStatusLine(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setSkillBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSkillId]);

  async function loadAccountStatus() {
    setAccountBusyAction((current) => current || "status");
    try {
      const status = await window.brevyn.sub2.status();
      setAccountStatus(status);
      setAccountForm((current) => ({
        ...current,
        baseUrl: status.baseUrl || current.baseUrl,
        email: current.email || status.user?.email || "",
      }));
      setAccountStatusLine(status.authenticated ? status.lastError || "" : "");
    } catch (error) {
      setAccountStatusLine(`加载账号状态失败：${errorMessage(error)}`);
    } finally {
      setAccountBusyAction((current) => (current === "status" ? "" : current));
    }
  }

  async function submitAccountAuth(mode: AccountAuthMode) {
    setAccountBusyAction(mode);
    setAccountStatusLine("");
    try {
      const baseUrl = accountStatus?.baseUrlEditable === false
        ? accountStatus.defaultBaseUrl || accountStatus.baseUrl
        : accountForm.baseUrl;
      const input = {
        baseUrl,
        email: accountForm.email,
        password: accountForm.password,
        displayName: accountForm.displayName,
      };
      const result = mode === "register"
        ? await window.brevyn.sub2.register(input)
        : await window.brevyn.sub2.login(input);
      if (result.sub2.requires2FA && result.sub2.pending2FAToken) {
        setAccountStatus(result.sub2);
        setTwoFactor({
          tempToken: result.sub2.pending2FAToken,
          email: result.sub2.pending2FAEmail || accountForm.email,
          code: "",
        });
        setAccountStatusLine(result.detail || "请输入两步验证码。");
        return;
      }
      setTwoFactor(null);
      await applyAccountSyncResult(result);
      setAccountForm((current) => ({ ...current, password: "" }));
      setAccountRedeemResult(null);
    } catch (error) {
      setAccountStatusLine(accountAuthErrorMessage(error, mode));
    } finally {
      setAccountBusyAction("");
    }
  }

  async function submitAccount2FA() {
    if (!twoFactor) return;
    setAccountBusyAction("2fa");
    setAccountStatusLine("");
    try {
      const result = await window.brevyn.sub2.login2FA({
        tempToken: twoFactor.tempToken,
        code: twoFactor.code,
        baseUrl: accountForm.baseUrl,
      });
      setTwoFactor(null);
      await applyAccountSyncResult(result);
      setAccountForm((current) => ({ ...current, password: "" }));
    } catch (error) {
      setAccountStatusLine(`两步验证失败：${normalizeRemoteErrorMessage(errorMessage(error))}`);
    } finally {
      setAccountBusyAction("");
    }
  }

  async function refreshAccount(options: { quiet?: boolean } = {}) {
    setAccountBusyAction((current) => current || "refresh");
    if (!options.quiet) setAccountStatusLine("");
    try {
      const status = await window.brevyn.sub2.refresh({ force: true, reason: options.quiet ? "account_page_open" : "manual" });
      setAccountStatus(status);
      setAccountRedeemResult(null);
      await loadProviders();
      if (!options.quiet) setAccountStatusLine(status.lastError || "账号、分组和用量已刷新。");
    } catch (error) {
      if (!options.quiet) setAccountStatusLine(`刷新账号失败：${errorMessage(error)}`);
    } finally {
      setAccountBusyAction((current) => (current === "refresh" ? "" : current));
    }
  }

  async function applyAccountSyncResult(result: Sub2OfficialProviderSyncResult) {
    setAccountStatus(result.sub2);
    setAccountStatusLine(accountSyncResultLine(result.status, result.detail, result.provider?.name));
    const syncedProviders = accountSyncResultProviders(result);
    if (syncedProviders.length > 0) {
      await refreshActivatedOfficialProviders(syncedProviders);
    } else {
      await loadProviders();
    }
  }

  async function refreshActivatedOfficialProviders(providers: ModelProviderConfig[]) {
    try {
      await loadProviders();
      const agentProvider = providers.find((provider) => provider.purpose === "agent");
      if (agentProvider) {
        await onAgentProviderChanged?.(agentProviderSelectionValue(agentProvider.id, agentProvider.selectedModel));
        showProviderToast(`当前官方模型已切换到 ${agentProvider.name}。`);
        return;
      }
      showProviderToast(providers.length > 0 ? `已同步 ${providers.length} 个官方模型配置。` : "官方模型已刷新。");
    } catch (error) {
      setAccountStatusLine(`官方模型已切换，本地模型刷新失败：${errorMessage(error)}`);
    }
  }

  async function redeemAccountCode() {
    const code = accountRedeemCode.trim();
    if (!code) {
      setAccountStatusLine("请输入兑换码。");
      return;
    }
    setAccountBusyAction("redeem");
    setAccountStatusLine("");
    setAccountRedeemResult(null);
    try {
      const result = await window.brevyn.sub2.redeemCode({ code });
      setAccountStatus(result.sub2);
      setAccountRedeemResult(result);
      setAccountRedeemCode("");
      setAccountStatusLine(accountRedeemResultLine(result));
      const syncedProviders = redeemResultProviders(result);
      if (result.providerSyncStatus === "synced" || syncedProviders.length > 0) {
        await refreshActivatedOfficialProviders(syncedProviders);
      } else {
        await loadProviders();
      }
    } catch (error) {
      setAccountStatusLine(accountRedeemErrorMessage(error));
    } finally {
      setAccountBusyAction("");
    }
  }

  async function logoutAccount() {
    setAccountBusyAction("logout");
    setAccountStatusLine("");
    try {
      const status = await window.brevyn.sub2.logout();
      setAccountStatus(status);
      setAccountForm((current) => ({ ...current, password: "" }));
      setTwoFactor(null);
      setAccountRedeemCode("");
      setAccountRedeemResult(null);
      setAccountStatusLine("已退出官方账号，并清理本地官方模型配置。");
      await loadProviders();
    } catch (error) {
      setAccountStatusLine(`退出失败：${errorMessage(error)}`);
    } finally {
      setAccountBusyAction("");
    }
  }

  async function toggleSkill(skill: SkillItem) {
    setSkillBusy(true);
    try {
      const updated = await window.brevyn.skills.update({ id: skill.id, enabled: !skill.enabled });
      const next = localSkills.map((item) => (item.id === updated.id ? updated : item));
      setLocalSkills(next);
      onSkillsChange(next);
      setSkillStatusLine(`${updated.enabled ? "已启用" : "已停用"} ${updated.name}。`);
    } catch (error) {
      setSkillStatusLine(errorMessage(error, "更新 Skill 失败。"));
    } finally {
      setSkillBusy(false);
    }
  }

  async function saveSkillContent() {
    if (!selectedSkillId) return;
    setSkillBusy(true);
    try {
      if (!skillContent.trim()) {
        setSkillStatusLine("SKILL.md 不能为空。");
        return;
      }
      const updated = await window.brevyn.skills.writeContent({ id: selectedSkillId, content: skillContent });
      const next = localSkills.map((item) => (item.id === updated.id ? updated : item));
      setLocalSkills(next);
      onSkillsChange(next);
      setSkillStatusLine("已保存 SKILL.md。");
    } catch (error) {
      setSkillStatusLine(errorMessage(error));
    } finally {
      setSkillBusy(false);
    }
  }

  async function importSkillFolder() {
    setSkillBusy(true);
    try {
      const imported = await window.brevyn.skills.importFolder({});
      const next = await window.brevyn.skills.list();
      setLocalSkills(next);
      onSkillsChange(next);
      setSelectedSkillId(imported.id);
      setSkillStatusLine(`已导入 ${imported.name}。`);
    } catch (error) {
      setSkillStatusLine(errorMessage(error));
    } finally {
      setSkillBusy(false);
    }
  }

  async function openSkillFolder(skillId: string) {
    if (!skillId) return;
    try {
      await window.brevyn.skills.openFolder(skillId);
      setSkillStatusLine("已打开 Skill 文件夹。");
    } catch (error) {
      setSkillStatusLine(errorMessage(error));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/32 p-2 md:p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {providerConfirmDialog}
      {providerToast && (
        <div className="pointer-events-none absolute top-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-pill)] bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg ring-1 ring-black/[0.06]">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          {providerToast.message}
        </div>
      )}
      <div className="brevyn-window-surface brevyn-dialog-window flex flex-col overflow-hidden">
        <div className="drag-region flex items-center justify-between bg-[hsl(var(--surface-chrome))] px-4 py-2.5 shadow-[inset_0_-1px_0_hsl(var(--border)/0.62)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-card text-muted-foreground shadow-sm ring-1 ring-black/[0.045]">
                <Settings className="h-3.5 w-3.5" />
              </span>
              <span>设置</span>
            </div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-card text-muted-foreground shadow-sm ring-1 ring-black/[0.06] transition hover:bg-background hover:text-foreground active:scale-[0.98]"
            onClick={onClose}
            title="关闭设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
          <aside className="bg-[hsl(var(--surface-chrome))] p-2.5 shadow-[inset_-1px_0_0_hsl(var(--border)/0.62)]">
            <div className="space-y-1">
              <SettingsNavButton
                active={activePage === "account"}
                icon={<UserRound className="h-4 w-4" />}
                title="账号"
                detail={accountNavDetail}
                onClick={() => setActivePage("account")}
              />
              <SettingsNavButton
                active={activePage === "providers"}
                icon={<PlugZap className="h-4 w-4" />}
                title="模型配置"
                detail={`${enabledProviders} 个启用 · ${embeddingProviderDetail} · ${visionProviderDetail}`}
                onClick={() => setActivePage("providers")}
              />
              <SettingsNavButton
                active={activePage === "billing"}
                icon={<CreditCard className="h-4 w-4" />}
                title="使用记录"
                detail="充值 · 模型使用"
                onClick={() => setActivePage("billing")}
              />
              <SettingsNavButton
                active={activePage === "general"}
                icon={<Languages className="h-4 w-4" />}
                title="个性化"
                detail="主题 · 代码样式"
                onClick={() => setActivePage("general")}
              />
              <SettingsNavButton
                active={activePage === "semesters"}
                icon={<CalendarDays className="h-4 w-4" />}
                title="学期管理"
                detail={semester?.term || "创建 / 切换 / 归档"}
                onClick={() => setActivePage("semesters")}
              />
              <SettingsNavButton
                active={activePage === "archive"}
                icon={<Archive className="h-4 w-4" />}
                title="归档"
                detail="恢复 / 永久删除"
                onClick={() => setActivePage("archive")}
              />
              <SettingsNavButton
                active={activePage === "skills"}
                icon={<Sparkles className="h-4 w-4" />}
                title="技能"
                detail={`${enabledSkills}/${localSkills.length} 已启用`}
                onClick={() => setActivePage("skills")}
              />
              <SettingsNavButton
                active={activePage === "mcp"}
                icon={<Server className="h-4 w-4" />}
                title="MCP 工具"
                detail="内置课程工具"
                onClick={() => setActivePage("mcp")}
              />
              <SettingsNavButton
                active={activePage === "about"}
                icon={<Info className="h-4 w-4" />}
                title="关于 / 更新"
                detail="版本 · 更新"
                onClick={() => setActivePage("about")}
              />
            </div>
          </aside>

          <main className={cx("min-h-0 bg-[hsl(var(--surface-panel))] p-3", activePage === "skills" ? "overflow-hidden" : "overflow-y-auto overscroll-contain [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {activePage === "account" ? (
              <AccountSettingsPage
                accountStatus={accountStatus}
                authMode={accountMode}
                accountForm={accountForm}
                twoFactor={twoFactor}
                busyAction={accountBusyAction}
                statusLine={accountStatusLine}
                redeemCode={accountRedeemCode}
                redeemResult={accountRedeemResult}
                providers={providers}
                onModeChange={setAccountMode}
                onFormChange={setAccountForm}
                onTwoFactorChange={setTwoFactor}
                onRedeemCodeChange={setAccountRedeemCode}
                onSubmitAuth={() => void submitAccountAuth(accountMode)}
                onSubmit2FA={() => void submitAccount2FA()}
                onRefresh={() => void refreshAccount()}
                onRedeem={() => void redeemAccountCode()}
                onLogout={() => void logoutAccount()}
              />
            ) : activePage === "billing" ? (
              <BillingRecordsSettingsPage />
            ) : activePage === "general" ? (
              <GeneralSettingsPage profile={profile} themeState={themeState} onProfileChange={onProfileChange} onThemeStateChange={onThemeStateChange} />
            ) : activePage === "providers" ? (
              <ProviderSettingsPage {...providerPageProps} />
            ) : activePage === "semesters" ? (
              <SemesterSettingsPage
                currentSemester={semester}
                onSelectSemester={onSelectSemester}
                onWorkspaceChanged={onWorkspaceChanged}
              />
            ) : activePage === "archive" ? (
              <ArchiveSettingsPage onWorkspaceChanged={onWorkspaceChanged} />
            ) : activePage === "skills" ? (
              <SkillSettingsPage
                skills={localSkills}
                enabledSkills={enabledSkills}
                gitStatus={gitStatus}
                selectedSkillId={selectedSkillId}
                skillContent={skillContent}
                skillBusy={skillBusy}
                skillStatusLine={skillStatusLine}
                onSelectSkill={setSelectedSkillId}
                onSkillContentChange={setSkillContent}
                onSaveSkill={saveSkillContent}
                onImportSkill={importSkillFolder}
                onOpenSkillFolder={openSkillFolder}
                onToggleSkill={toggleSkill}
              />
            ) : activePage === "mcp" ? (
              <McpSettingsPage />
            ) : (
              <AboutUpdateSettingsPage />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function SettingsNavButton({ active, icon, title, detail, onClick }: { active: boolean; icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx("flex w-full min-w-0 items-start gap-2 rounded-[var(--radius-card)] px-3 py-2.5 text-left transition active:scale-[0.99]", active ? "bg-card text-foreground shadow-sm ring-1 ring-black/[0.05]" : "text-muted-foreground hover:bg-card hover:text-foreground")}
      onClick={onClick}
    >
      <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)]", active ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-[11px]">{detail}</span>
      </span>
    </button>
  );
}

function accountSyncResultLine(status: "synced" | "provisioning" | "locked", detail?: string, providerName?: string): string {
  if (status === "synced") return providerName ? `官方模型已同步：${providerName}。` : "官方模型已同步。";
  if (status === "locked") return detail || "兑换套餐后可同步官方模型。";
  return detail || "官方模型正在准备中，稍后可以刷新重试。";
}

function statusLineIsError(message: string): boolean {
  return /失败|不存在|已被|过期|无法|失效|错误|异常|不足|unavailable|failed|error/i.test(message);
}

function accountRedeemResultLine(result: Sub2RedeemCodeResult): string {
  const base = result.message || "兑换成功。";
  if (result.providerSyncStatus === "failed") return `${base} 本地官方模型同步失败：${result.providerSyncDetail || "请稍后刷新。"}`;
  if (result.providerSyncStatus === "provisioning") return `${base} ${result.providerSyncDetail || "官方模型正在准备中。"}`;
  if (result.providerSyncStatus === "synced") return `${base} 官方模型已自动同步。`;
  return base;
}

function agentProviderSelectionValue(providerId: string, modelId: string): string {
  if (!providerId || !modelId) return "";
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function redeemResultProviders(result: Sub2RedeemCodeResult): ModelProviderConfig[] {
  return dedupeModelProviders([...(result.providers ?? []), ...(result.provider ? [result.provider] : [])]);
}

function accountSyncResultProviders(result: Sub2OfficialProviderSyncResult): ModelProviderConfig[] {
  return dedupeModelProviders([...(result.providers ?? []), ...(result.provider ? [result.provider] : [])]);
}

function dedupeModelProviders(providers: ModelProviderConfig[]): ModelProviderConfig[] {
  const byId = new Map<string, ModelProviderConfig>();
  for (const provider of providers) {
    if (!provider?.id) continue;
    byId.set(provider.id, provider);
  }
  return [...byId.values()];
}

function accountAuthErrorMessage(error: unknown, mode: AccountAuthMode): string {
  const action = mode === "register" ? "注册" : "登录";
  const raw = errorMessage(error, `${action}失败。`);
  const normalized = normalizeRemoteErrorMessage(raw);
  if (/failed to fetch|networkerror|network error|fetch failed|sub2_network_error/i.test(normalized)) {
    return `无法连接 Brevyn 官方服务，请检查网络或服务地址后重试。`;
  }
  if (/safeStorage|系统安全存储不可用/i.test(normalized)) {
    return "系统安全存储不可用，无法保存官方账号登录态。请检查系统凭据存储状态后重试。";
  }
  if (/^\d{3}\s+/.test(normalized)) {
    return `${action}失败，官方服务暂时不可用，请稍后再试。`;
  }
  return `${action}失败：${normalized || "请稍后再试。"}`;
}

function accountRedeemErrorMessage(error: unknown): string {
  const raw = errorMessage(error, "兑换失败。");
  const normalized = normalizeRemoteErrorMessage(raw);
  if (/failed to fetch|networkerror|network error|fetch failed|sub2_network_error/i.test(normalized)) {
    return "无法连接 Brevyn 官方服务，请检查网络或服务地址后重试。";
  }
  if (/^\d{3}\s+/.test(normalized)) {
    return "兑换失败，官方服务暂时不可用，请稍后再试。";
  }
  return `兑换失败：${normalized || "请稍后再试。"}`;
}

function normalizeRemoteErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}
