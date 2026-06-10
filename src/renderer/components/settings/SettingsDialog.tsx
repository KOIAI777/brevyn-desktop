import {
  Archive,
  CalendarDays,
  Check,
  Info,
  Languages,
  PlugZap,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AboutUpdateSettingsPage } from "@/components/settings/about/AboutUpdateSettingsPage";
import { ArchiveSettingsPage } from "@/components/settings/archive/ArchiveSettingsPage";
import { AccountSettingsPage, type CloudAccountForm, type CloudBusyAction } from "@/components/settings/account/AccountSettingsPage";
import { redeemKindLabel, redeemStatusLabel, redeemValueLabel, redeemedPlanLabel } from "@/components/settings/account/cloudAccountUtils";
import {
  cloudModelDisplayName,
  formatCloudPoints,
  type CloudGroupModelCatalogState,
} from "@/components/settings/account/cloudPlanUtils";
import { GeneralSettingsPage } from "@/components/settings/general/GeneralSettingsPage";
import { ProviderSettingsPage } from "@/components/settings/providers/ProviderSettingsPage";
import { useProviderSettingsState } from "@/components/settings/providers/useProviderSettingsState";
import { SemesterSettingsPage } from "@/components/settings/semesters/SemesterSettingsPage";
import { SkillSettingsPage } from "@/components/settings/skills/SkillSettingsPage";
import { MiniMetric } from "@/components/settings/shared/SettingsControls";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import {
  type CloudAccountStatus,
  type CloudAuthMode,
  type CloudGatewayGroup,
  type CloudProviderModel,
  type CloudRedeemCodeResult,
  type Course,
  type AppThemeState,
  type GitStatus,
  type ModelProviderConfig,
  type ProviderModel,
  type SemesterWorkspace,
  type SkillItem,
  type UserProfileSettings,
} from "../../../types/domain";
import { BREVYN_CLOUD_DEVELOPMENT_BASE_URL, BREVYN_CLOUD_SHOP_URL } from "../../../types/cloud-config";
import { cx } from "@/lib/cn";

type SettingsPage = "account" | "general" | "providers" | "semesters" | "archive" | "skills" | "about";

const CLOUD_ENTITLEMENTS_POLL_MS = 40_000;
const CLOUD_ENTITLEMENTS_FOCUS_REFRESH_MS = 60_000;

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
  const [activePage, setActivePage] = useState<SettingsPage>(initialPage);
  const {
    providers,
    providerToast,
    providerConfirmDialog,
    providerPageProps,
    loadProviders,
    showProviderToast,
  } = useProviderSettingsState({ onAgentProviderChanged });
  const [cloudStatus, setCloudStatus] = useState<CloudAccountStatus | null>(null);
  const [cloudMode, setCloudMode] = useState<CloudAuthMode>("login");
  const [cloudBusyAction, setCloudBusyAction] = useState<CloudBusyAction>("status");
  const [cloudStatusLine, setCloudStatusLine] = useState("");
  const [cloudRedeemCode, setCloudRedeemCode] = useState("");
  const [cloudRedeemResult, setCloudRedeemResult] = useState<CloudRedeemCodeResult | null>(null);
  const [cloudGroupModels, setCloudGroupModels] = useState<Record<number, CloudGroupModelCatalogState>>({});
  const [cloudForm, setCloudForm] = useState<CloudAccountForm>({
    baseUrl: BREVYN_CLOUD_DEVELOPMENT_BASE_URL,
    email: "",
    password: "",
    displayName: "",
  });
  const [localSkills, setLocalSkills] = useState(skills);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillStatusLine, setSkillStatusLine] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);
  const { confirm: confirmCloudRedeem, confirmDialog: cloudRedeemConfirmDialog } = useConfirmDialog();
  const cloudModelCatalogRequestsRef = useRef<Set<number>>(new Set());
  const cloudEntitlementsLastRefreshRef = useRef(0);
  const cloudEntitlementsRefreshInFlightRef = useRef(false);

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
  const cloudNavDetail = cloudStatus?.authenticated
    ? cloudStatus.user?.email || "已登录"
    : "登录后自动配置官方模型";
  const cloudPlanGroupIds = useMemo(() => {
    const ids = new Set<number>();
    const addId = (value?: number | null) => {
      const id = Number(value || 0);
      if (Number.isFinite(id) && id > 0) ids.add(Math.floor(id));
    };
    for (const group of cloudStatus?.entitlements?.balanceGroups ?? []) addId(group.externalGroupId);
    for (const group of cloudStatus?.entitlements?.subscriptionGroups ?? []) addId(group.externalGroupId);
    for (const group of cloudStatus?.groups ?? []) addId(group.externalGroupId);
    return [...ids].sort((a, b) => a - b);
  }, [cloudStatus?.entitlements, cloudStatus?.groups]);
  const cloudPlanGroupIdsKey = cloudPlanGroupIds.join(",");

  useEffect(() => {
    void loadCloudStatus();
  }, []);

  useEffect(() => {
    if (!cloudStatus?.authenticated) {
      cloudModelCatalogRequestsRef.current.clear();
      setCloudGroupModels({});
      return;
    }
    if (activePage !== "account") return;
    for (const externalGroupId of cloudPlanGroupIds) {
      if (cloudModelCatalogRequestsRef.current.has(externalGroupId)) continue;
      cloudModelCatalogRequestsRef.current.add(externalGroupId);
      setCloudGroupModels((current) => ({
        ...current,
        [externalGroupId]: current[externalGroupId] ?? { status: "loading", models: [], total: 0 },
      }));
      void loadCloudGroupModels(externalGroupId);
    }
  }, [activePage, cloudStatus?.authenticated, cloudPlanGroupIdsKey]);

  useEffect(() => {
    if (!cloudStatus?.authenticated || activePage !== "account") return;
    void refreshCloudEntitlements({ reason: "account_page_open", quiet: true });
    const timer = window.setInterval(() => {
      void refreshCloudEntitlements({ reason: "account_page_poll", quiet: true });
    }, CLOUD_ENTITLEMENTS_POLL_MS);
    const refreshOnFocus = () => {
      if (Date.now() - cloudEntitlementsLastRefreshRef.current < CLOUD_ENTITLEMENTS_FOCUS_REFRESH_MS) return;
      void refreshCloudEntitlements({ reason: "window_focus", quiet: true });
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [activePage, cloudStatus?.authenticated]);

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

  async function loadCloudStatus() {
    setCloudBusyAction((current) => current || "status");
    try {
      const status = await window.brevyn.cloud.status();
      setCloudStatus(status);
      setCloudForm((current) => ({
        ...current,
        baseUrl: status.baseUrl || current.baseUrl,
        email: current.email || status.user?.email || "",
      }));
      setCloudStatusLine(status.lastError || "");
    } catch (error) {
      setCloudStatusLine(`加载账号状态失败：${errorMessage(error)}`);
    } finally {
      setCloudBusyAction((current) => (current === "status" ? "" : current));
    }
  }

  async function loadCloudGroupModels(externalGroupId: number) {
    try {
      const result = await window.brevyn.cloud.modelsCatalog({ externalGroupId });
      const models = (result.items ?? []).filter((model) => model.enabled !== false);
      setCloudGroupModels((current) => ({
        ...current,
        [externalGroupId]: {
          status: "ready",
          models,
          total: Number.isFinite(result.total) ? result.total : models.length,
        },
      }));
    } catch (error) {
      setCloudGroupModels((current) => ({
        ...current,
        [externalGroupId]: {
          status: "error",
          models: current[externalGroupId]?.models ?? [],
          total: current[externalGroupId]?.total ?? 0,
          error: errorMessage(error),
        },
      }));
    }
  }

  async function submitCloudAuth(mode: CloudAuthMode) {
    setCloudBusyAction(mode);
    setCloudStatusLine("");
    try {
      const baseUrl = cloudStatus?.baseUrlEditable === false
        ? cloudStatus.defaultBaseUrl || cloudStatus.baseUrl
        : cloudForm.baseUrl;
      const input = {
        baseUrl,
        email: cloudForm.email,
        password: cloudForm.password,
        displayName: cloudForm.displayName,
      };
      const result = mode === "register"
        ? await window.brevyn.cloud.register(input)
        : await window.brevyn.cloud.login(input);
      setCloudStatus(result.cloud);
      setCloudForm((current) => ({ ...current, password: "" }));
      setCloudRedeemResult(null);
      setCloudStatusLine(cloudSyncResultLine(result.status, result.detail, result.provider?.name));
      await loadProviders();
    } catch (error) {
      setCloudStatusLine(cloudAuthErrorMessage(error, mode));
    } finally {
      setCloudBusyAction("");
    }
  }

  async function refreshCloudAccount() {
    setCloudBusyAction("refresh");
    setCloudStatusLine("");
    try {
      const status = await window.brevyn.cloud.refresh({ forceEntitlements: true, reason: "manual" });
      setCloudStatus(status);
      cloudEntitlementsLastRefreshRef.current = Date.now();
      setCloudRedeemResult(null);
      await loadProviders();
      setCloudStatusLine(cloudRefreshStatusLine(status, "账号、余额和套餐信息已刷新。"));
    } catch (error) {
      setCloudStatusLine(`刷新账号失败：${errorMessage(error)}`);
    } finally {
      setCloudBusyAction("");
    }
  }

  async function refreshCloudEntitlements(options: { force?: boolean; reason?: string; quiet?: boolean } = {}) {
    if (!cloudStatus?.authenticated || cloudEntitlementsRefreshInFlightRef.current) return;
    cloudEntitlementsRefreshInFlightRef.current = true;
    try {
      const status = await window.brevyn.cloud.refreshEntitlements({
        forceEntitlements: options.force,
        reason: options.reason,
      });
      setCloudStatus(status);
      cloudEntitlementsLastRefreshRef.current = Date.now();
      if (!options.quiet) setCloudStatusLine(cloudRefreshStatusLine(status, "余额和套餐用量已刷新。"));
    } catch (error) {
      if (!options.quiet) setCloudStatusLine(`刷新余额失败：${errorMessage(error)}`);
    } finally {
      cloudEntitlementsRefreshInFlightRef.current = false;
    }
  }

  async function syncCloudOfficialProvider(externalGroupId?: number) {
    const action: CloudBusyAction = externalGroupId ? `sync:${externalGroupId}` : "refresh";
    setCloudBusyAction(action);
    setCloudStatusLine("");
    try {
      const result = await window.brevyn.cloud.syncOfficialProvider(externalGroupId ? { externalGroupId } : undefined);
      setCloudStatus(result.cloud);
      setCloudRedeemResult(null);
      setCloudStatusLine(cloudSyncResultLine(result.status, result.detail, result.provider?.name));
      if (result.status === "synced") {
        await loadProviders();
        showProviderToast(result.provider ? `已同步 ${result.provider.name}。` : "官方模型配置已同步。");
      }
    } catch (error) {
      setCloudStatusLine(`同步官方配置失败：${errorMessage(error)}`);
    } finally {
      setCloudBusyAction("");
    }
  }

  async function activateCloudOfficialProvider(externalGroupId: number) {
    const action: CloudBusyAction = `activate:${externalGroupId}`;
    setCloudBusyAction(action);
    try {
      const result = await window.brevyn.cloud.activateOfficialProvider({ externalGroupId });
      setCloudStatus(result.cloud);
      setCloudStatusLine(cloudActivateResultLine(result.provider?.name, result.detail));
      if (result.status === "synced") {
        const activatedProviders = result.providers?.length ? result.providers : result.provider ? [result.provider] : [];
        for (const provider of activatedProviders) {
          cacheCloudGroupModelsFromProvider(externalGroupId, provider);
        }
        void refreshActivatedOfficialProviders(activatedProviders);
      }
    } catch (error) {
      setCloudStatusLine(`切换官方分组失败：${errorMessage(error)}`);
    } finally {
      setCloudBusyAction("");
    }
  }

  async function refreshActivatedOfficialProviders(providers: ModelProviderConfig[]) {
    try {
      await loadProviders();
      const agentProvider = providers.find((provider) => provider.purpose === "agent");
      if (agentProvider) {
        await onAgentProviderChanged?.(agentProviderSelectionValue(agentProvider.id, agentProvider.selectedModel));
        showProviderToast(`当前官方分组已切换到 ${agentProvider.name}。`);
        return;
      }
      showProviderToast(providers.length > 0 ? `已同步 ${providers.length} 个官方能力配置。` : "官方配置已刷新。");
    } catch (error) {
      setCloudStatusLine(`套餐已切换，本地模型刷新失败：${errorMessage(error)}`);
    }
  }

  function cacheCloudGroupModelsFromProvider(externalGroupId: number, provider: ModelProviderConfig) {
    const models = provider.models
      .filter((model) => model.enabled !== false)
      .map((model): CloudProviderModel => ({
        id: model.id,
        name: model.name || model.id,
        displayName: model.name || model.id,
        providerFamily: provider.purpose,
        externalGroupId,
        groupName: provider.name,
        billingMode: "",
        capabilities: officialProviderModelCapabilities(provider, model),
        supportsVision: provider.purpose === "vision" || model.supportsVision === true,
        supportsStreaming: true,
        enabled: model.enabled !== false,
      }));
    setCloudGroupModels((current) => ({
      ...current,
      [externalGroupId]: {
        status: "ready",
        models: mergeCloudGroupModels(current[externalGroupId]?.models ?? [], models),
        total: mergeCloudGroupModels(current[externalGroupId]?.models ?? [], models).length,
      },
    }));
  }

  function officialProviderModelCapabilities(provider: ModelProviderConfig, model: ProviderModel): string[] {
    const capabilities = new Set<string>();
    if (provider.purpose === "embedding") capabilities.add("embedding");
    if (provider.purpose === "vision" || model.supportsVision) capabilities.add("vision_input");
    if (provider.purpose === "ocr") capabilities.add("ocr");
    return [...capabilities];
  }

  function mergeCloudGroupModels(existing: CloudProviderModel[], incoming: CloudProviderModel[]): CloudProviderModel[] {
    const byId = new Map<string, CloudProviderModel>();
    for (const model of [...existing, ...incoming]) {
      const key = model.id.toLowerCase();
      const previous = byId.get(key);
      if (!previous) {
        byId.set(key, { ...model, capabilities: [...(model.capabilities ?? [])] });
        continue;
      }
      byId.set(key, {
        ...previous,
        ...model,
        capabilities: [...new Set([...(previous.capabilities ?? []), ...(model.capabilities ?? [])])],
        supportsVision: previous.supportsVision || model.supportsVision,
        enabled: previous.enabled !== false || model.enabled !== false,
      });
    }
    return [...byId.values()].sort((a, b) => cloudModelDisplayName(a).localeCompare(cloudModelDisplayName(b)));
  }

  async function redeemCloudCode() {
    const code = cloudRedeemCode.trim();
    if (!code) {
      setCloudStatusLine("请输入兑换码。");
      return;
    }
    setCloudBusyAction("redeem");
    setCloudStatusLine("");
    setCloudRedeemResult(null);
    try {
      const result = await window.brevyn.cloud.redeemCode({ code });
      setCloudStatus(result.cloud);
      setCloudRedeemResult(result);
      setCloudRedeemCode("");
      setCloudStatusLine(cloudRedeemResultLine(result));
      if (result.providerSyncStatus === "synced") {
        await loadProviders();
        const agentProvider = (result.providers ?? []).find((provider) => provider.purpose === "agent") || (result.provider?.purpose === "agent" ? result.provider : undefined);
        if (agentProvider) await onAgentProviderChanged?.(agentProviderSelectionValue(agentProvider.id, agentProvider.selectedModel));
        showProviderToast(result.provider ? `已同步 ${result.provider.name}。` : "兑换分组已同步到本地 Provider。");
      }
      void confirmCloudRedeem({
        title: redeemConfirmationTitle(result),
        message: <RedeemConfirmationMessage result={result} groups={result.cloud.groups ?? cloudStatus?.groups ?? []} />,
        confirmLabel: "知道了",
        cancelLabel: "关闭",
      });
    } catch (error) {
      setCloudStatusLine(cloudRedeemErrorMessage(error));
    } finally {
      setCloudBusyAction("");
    }
  }

  async function openCloudShop() {
    setCloudStatusLine("");
    try {
      await window.brevyn.app.openExternal(cloudStatus?.shopUrl || BREVYN_CLOUD_SHOP_URL);
      setCloudStatusLine("已在外部浏览器打开购买页面。");
    } catch (error) {
      setCloudStatusLine(`打开购买页面失败：${errorMessage(error)}`);
    }
  }

  async function logoutCloudAccount() {
    setCloudBusyAction("logout");
    setCloudStatusLine("");
    try {
      const status = await window.brevyn.cloud.logout();
      setCloudStatus(status);
      setCloudForm((current) => ({ ...current, password: "" }));
      setCloudRedeemCode("");
      setCloudRedeemResult(null);
      setCloudStatusLine("已退出 Cloud，并清理本地官方模型配置。");
      await loadProviders();
    } catch (error) {
      setCloudStatusLine(`退出失败：${errorMessage(error)}`);
    } finally {
      setCloudBusyAction("");
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/32 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {providerConfirmDialog}
      {cloudRedeemConfirmDialog}
      {providerToast && (
        <div className="pointer-events-none absolute top-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-pill)] bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg ring-1 ring-black/[0.06]">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          {providerToast.message}
        </div>
      )}
      <div className="brevyn-window-surface brevyn-dialog-window flex flex-col overflow-hidden">
        <div className="drag-region flex items-center justify-between bg-[hsl(var(--surface-chrome))] px-4 py-3 shadow-[inset_0_-1px_0_hsl(var(--border)/0.62)]">
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
          <aside className="bg-[hsl(var(--surface-chrome))] p-3 shadow-[inset_-1px_0_0_hsl(var(--border)/0.62)]">
            <div className="space-y-1.5">
              <SettingsNavButton
                active={activePage === "account"}
                icon={<UserRound className="h-4 w-4" />}
                title="账号"
                detail={cloudNavDetail}
                onClick={() => setActivePage("account")}
              />
              <SettingsNavButton
                active={activePage === "general"}
                icon={<Languages className="h-4 w-4" />}
                title="通用"
                detail="语言 · 外观占位"
                onClick={() => setActivePage("general")}
              />
              <SettingsNavButton
                active={activePage === "providers"}
                icon={<PlugZap className="h-4 w-4" />}
                title="模型配置"
                detail={`${enabledProviders} 个启用 · ${embeddingProviderDetail} · ${visionProviderDetail}`}
                onClick={() => setActivePage("providers")}
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
                active={activePage === "about"}
                icon={<Info className="h-4 w-4" />}
                title="关于 / 更新"
                detail="版本 · 更新"
                onClick={() => setActivePage("about")}
              />
            </div>
          </aside>

          <main className={cx("min-h-0 bg-[hsl(var(--surface-panel))] p-4", activePage === "skills" ? "overflow-hidden" : "overflow-y-auto overscroll-contain [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {activePage === "account" ? (
              <AccountSettingsPage
                cloudStatus={cloudStatus}
                cloudMode={cloudMode}
                cloudForm={cloudForm}
                busyAction={cloudBusyAction}
                statusLine={cloudStatusLine}
                redeemCode={cloudRedeemCode}
                redeemResult={cloudRedeemResult}
                groupModels={cloudGroupModels}
                providers={providers}
                onModeChange={setCloudMode}
                onFormChange={setCloudForm}
                onRedeemCodeChange={setCloudRedeemCode}
                onSubmitAuth={() => void submitCloudAuth(cloudMode)}
                onRefresh={() => void refreshCloudAccount()}
                onActivateGroup={(externalGroupId) => void activateCloudOfficialProvider(externalGroupId)}
                onRedeem={() => void redeemCloudCode()}
                onOpenShop={() => void openCloudShop()}
                onLogout={() => void logoutCloudAccount()}
              />
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
      className={cx("flex w-full min-w-0 items-start gap-2 rounded-[var(--radius-card)] px-3 py-3 text-left transition active:scale-[0.99]", active ? "bg-card text-foreground shadow-sm ring-1 ring-black/[0.05]" : "text-muted-foreground hover:bg-card hover:text-foreground")}
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

function cloudSyncResultLine(status: "synced" | "provisioning", detail?: string, providerName?: string): string {
  if (status === "synced") return providerName ? `官方模型配置已同步：${providerName}。` : "官方模型配置已同步。";
  return detail || "Cloud 正在后台准备官方模型配置，稍后可刷新或重新同步。";
}

function cloudActivateResultLine(providerName?: string, detail?: string): string {
  if (providerName) return `当前套餐已切换：${providerName}。`;
  return detail || "当前套餐已切换。";
}

function cloudRefreshStatusLine(status: CloudAccountStatus, fallback: string): string {
  if (status.lastError) return status.lastError;
  if (status.entitlements?.refreshLimited) {
    const seconds = status.entitlements.nextRefreshAfterSeconds || 15;
    return `账号已刷新，余额刚同步过，${seconds} 秒后可再次强制刷新。`;
  }
  if (status.entitlements?.stale) return "账号已刷新，余额暂时显示上次同步结果。";
  return fallback;
}

function cloudRedeemResultLine(result: CloudRedeemCodeResult): string {
  const redemption = result.result.redemption;
  const base = redemption.kind === "subscription"
    ? `订阅已兑换：${redemption.productName || "套餐"}，有效期 ${redemption.validityDays || 0} 天。`
    : `积分已到账：${formatCloudPoints(redemption.value)}。`;
  if (result.status === "gateway_failed") {
    return `${base}${result.error?.message || redemption.errorMessage || "网关同步失败，后台会保留记录。"}`
  }
  if (result.providerSyncStatus === "failed") return `${base}本地官方配置同步失败：${result.providerSyncDetail || "请稍后刷新。"}`
  if (result.providerSyncStatus === "provisioning") return `${base}${result.providerSyncDetail || "官方配置正在后台准备。"}`
  if (result.providerSyncStatus === "synced") return `${base}对应套餐已同步到本地官方配置。`;
  return base;
}

function redeemConfirmationTitle(result: CloudRedeemCodeResult): string {
  const kind = result.result.redemption.kind;
  if (kind === "subscription") return result.status === "gateway_failed" ? "订阅已记录，等待同步" : "订阅套餐已兑换";
  if (kind === "balance") return "积分已到账";
  return "兑换已完成";
}

function RedeemConfirmationMessage({ result, groups }: { result: CloudRedeemCodeResult; groups: CloudGatewayGroup[] }) {
  const redemption = result.result.redemption;
  const isSubscription = redemption.kind === "subscription";
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <MiniMetric label="商品" value={redemption.productName || redeemKindLabel(redemption.kind)} />
        <MiniMetric label="到账" value={redeemValueLabel(result)} />
        <MiniMetric label="套餐" value={redeemedPlanLabel(result, groups)} />
        <MiniMetric label="状态" value={redeemConfirmationStatusLabel(result)} />
      </div>
      {isSubscription && (
        <div className="rounded-[var(--radius-control)] bg-amber-50/75 px-2.5 py-2 text-[11px] leading-5 text-amber-900 shadow-sm ring-1 ring-amber-200/70">
          订阅套餐的日、周、月额度按对应周期刷新；重复购买同一订阅只延长到期时间，不会叠加当前周期额度。
        </div>
      )}
      {result.status === "gateway_failed" && (
        <div className="rounded-[var(--radius-control)] bg-amber-50/75 px-2.5 py-2 text-[11px] leading-5 text-amber-900 shadow-sm ring-1 ring-amber-200/70">
          兑换已记录，但网关同步暂未完成。稍后刷新账号信息，或在后台重试这条兑换记录。
        </div>
      )}
    </div>
  );
}

function redeemConfirmationStatusLabel(result: CloudRedeemCodeResult): string {
  if (result.status === "gateway_failed") return "待同步";
  if (result.providerSyncStatus === "synced") return "已同步";
  if (result.providerSyncStatus === "provisioning") return "准备中";
  if (result.providerSyncStatus === "failed") return "本地同步失败";
  return redeemStatusLabel(result.status);
}

function agentProviderSelectionValue(providerId: string, modelId: string): string {
  if (!providerId || !modelId) return "";
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function cloudAuthErrorMessage(error: unknown, mode: CloudAuthMode): string {
  const action = mode === "register" ? "注册" : "登录";
  const raw = errorMessage(error, `${action}失败。`);
  const normalized = normalizeRemoteErrorMessage(raw);
  const code = cloudAuthErrorCode(error, normalized);
  const mapped = cloudAuthCodeMessage(code, mode);
  if (mapped) return mapped;
  if (/failed to fetch|networkerror|network error|fetch failed/i.test(normalized)) {
    return `无法连接 Brevyn Cloud，请检查网络或 Cloud 地址后重试。`;
  }
  if (/safeStorage|系统安全存储不可用/i.test(normalized)) {
    return "系统安全存储不可用，无法保存 Cloud 登录态。请检查 macOS 钥匙串状态后重试。";
  }
  if (/^\d{3}\s+/.test(normalized)) {
    return `${action}失败，Cloud 服务暂时不可用，请稍后再试。`;
  }
  return `${action}失败：${normalized || "请稍后再试。"}`;
}

function cloudRedeemErrorMessage(error: unknown): string {
  const raw = errorMessage(error, "兑换失败。");
  const normalized = normalizeRemoteErrorMessage(raw);
  const code = cloudAuthErrorCode(error, normalized);
  const mapped = cloudRedeemCodeMessage(code);
  if (mapped) return mapped;
  if (/failed to fetch|networkerror|network error|fetch failed/i.test(normalized)) {
    return "无法连接 Brevyn Cloud，请检查网络或 Cloud 地址后重试。";
  }
  if (/^\d{3}\s+/.test(normalized)) {
    return "兑换失败，Cloud 服务暂时不可用，请稍后再试。";
  }
  return `兑换失败：${normalized || "请稍后再试。"}`;
}

function cloudRedeemCodeMessage(code: string): string {
  switch (code) {
    case "code_required":
      return "请输入兑换码。";
    case "redeem_rate_limited":
      return "兑换太频繁，请稍后再试。";
    case "redeem_code_not_found":
      return "兑换码不存在，请检查后重新输入。";
    case "redeem_code_used":
      return "兑换码已被使用。";
    case "redeem_code_expired":
      return "兑换码已过期。";
    case "redeem_code_invalid_state":
      return "兑换码配置异常，请联系客服处理。";
    case "redeem_failed":
      return "兑换失败，请稍后再试。";
    case "redeem_gateway_sync_failed":
      return "兑换已记录，但套餐或积分同步暂未完成，请稍后刷新。";
    case "unauthorized":
    case "invalid_refresh_token":
      return "登录状态已失效，请重新登录。";
    case "invalid_request":
      return "请求格式不正确，请重新输入兑换码。";
    case "rate_limit_unavailable":
      return "Cloud 风控服务暂时不可用，请稍后再试。";
    case "cloud_network_error":
      return "无法连接 Brevyn Cloud，网络连接中断，请稍后重试。";
    default:
      return "";
  }
}

function cloudAuthCodeMessage(code: string, mode: CloudAuthMode): string {
  const isRegister = mode === "register";
  switch (code) {
    case "invalid_request":
      return "请求格式不正确，请检查邮箱和密码后重试。";
    case "invalid_email":
      return "邮箱格式不正确，请输入有效邮箱地址。";
    case "password_too_short":
      return "密码至少需要 8 位。";
    case "email_already_registered":
      return "这个邮箱已经注册，可以直接切换到登录。";
    case "invalid_credentials":
      return "邮箱或密码不正确，请重新检查。";
    case "login_rate_limited":
      return "登录尝试次数太多，请稍后再试。";
    case "register_rate_limited":
      return "注册尝试次数太多，请稍后再试。";
    case "rate_limit_unavailable":
      return "Cloud 风控服务暂时不可用，请稍后再试。";
    case "password_hash_failed":
    case "register_failed":
      return "注册暂时失败，请稍后再试。";
    case "token_create_failed":
      return `${isRegister ? "注册" : "登录"}成功但登录态创建失败，请稍后重试。`;
    case "unauthorized":
    case "invalid_refresh_token":
      return "登录状态已失效，请重新登录。";
    default:
      return "";
  }
}

function cloudAuthErrorCode(error: unknown, normalizedMessage: string): string {
  const named = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name || "") : "";
  const candidates = [
    named,
    normalizedMessage,
    normalizedMessage.split(":")[0],
  ];
  for (const candidate of candidates) {
    const code = candidate.trim();
    if (/^[a-z][a-z0-9_]*$/.test(code)) return code;
  }
  const embedded = normalizedMessage.match(/\b[a-z][a-z0-9_]*(?:_[a-z0-9]+)+\b/);
  return embedded?.[0] || "";
}

function normalizeRemoteErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}
