import {
  ArrowLeft,
  Archive,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  Cloud,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Info,
  KeyRound,
  Languages,
  Layers3,
  LogOut,
  MessageSquare,
  Minus,
  PlugZap,
  Plus,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  ToggleLeft,
  ToggleRight,
  Upload,
  Trash2,
  UserRound,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { UpdateStatusCard } from "@/components/settings/update/UpdateStatusCard";
import { VersionHistory } from "@/components/settings/update/VersionHistory";
import { getProviderKindLogo, getProviderProfileLogo, resolveModelProviderLogo } from "@/lib/model-provider-logo";
import { profileDisplayName, USER_AVATAR_OPTIONS, UserAvatar } from "@/lib/user-profile";
import { withInferredContextWindow } from "../../../shared/model-context-window";
import {
  AGENT_PROVIDER_PRESETS,
  type CloudAccountStatus,
  type CloudAuthMode,
  type CloudBalanceGroupEntitlement,
  type CloudGatewayEntitlementGroup,
  type CloudGatewayGroup,
  type CloudProviderModel,
  type CloudQuotaWindow,
  type CloudRedeemCodeResult,
  type CloudSubscriptionGroupEntitlement,
  DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT,
  EMBEDDING_PROVIDER_PRESETS,
  PROVIDER_PRESETS,
  VISION_PROVIDER_PRESETS,
  type AgentProviderKind,
  type AgentGatewayStatus,
  type EmbeddingProviderKind,
  type VisionProviderKind,
  type Course,
  type BrevynTask,
  type GitStatus,
  type ModelProviderConfig,
  type ProviderDraftInput,
  type ProviderKind,
  type ProviderModel,
  type ProviderPurpose,
  type ProviderSaveResult,
  type RecognizedAcademicCalendar,
  type RecognizedCourseTimetable,
  type SemesterWorkspace,
  type SkillItem,
  type Thread,
  type UserProfileSettings,
  type UpdaterStatus,
} from "../../../types/domain";
import { BREVYN_CLOUD_DEVELOPMENT_BASE_URL, BREVYN_CLOUD_SHOP_URL } from "../../../types/cloud-config";
import { cx } from "@/lib/cn";

type SettingsPage = "account" | "general" | "providers" | "archive" | "skills" | "about";
type VisionTestKind = "calendar" | "timetable";
type VisionTestResult = RecognizedAcademicCalendar | RecognizedCourseTimetable;
type ProviderBusyAction =
  | "agent-save"
  | "agent-delete"
  | "agent-toggle"
  | "agent-official-toggle"
  | "agent-fetch"
  | "agent-test"
  | "embedding-save"
  | "embedding-delete"
  | "embedding-toggle"
  | "embedding-fetch"
  | "embedding-test"
  | "vision-save"
  | "vision-delete"
  | "vision-toggle"
  | "vision-fetch"
  | "vision-test";
type CloudBusyAction = "" | "status" | "login" | "register" | "refresh" | "redeem" | "logout" | `sync:${number}` | `activate:${number}`;
interface CloudAccountForm {
  baseUrl: string;
  email: string;
  password: string;
  displayName: string;
}
interface CloudGroupModelCatalogState {
  status: "loading" | "ready" | "error";
  models: CloudProviderModel[];
  total: number;
  error?: string;
}

const agentProviderKinds = Object.keys(AGENT_PROVIDER_PRESETS) as AgentProviderKind[];
const embeddingProviderKinds = Object.keys(EMBEDDING_PROVIDER_PRESETS) as EmbeddingProviderKind[];
const visionProviderKinds = Object.keys(VISION_PROVIDER_PRESETS) as VisionProviderKind[];

const SEMESTER_HOME_COURSE_ID = "semester-home";
const PROVIDER_PROFILE_ROW_HEIGHT_CLASS = "h-[72px]";
const PROVIDER_PROFILE_LIST_HEIGHT_CLASS = "max-h-[312px]";
const OFFICIAL_PROVIDER_ID_PREFIX = "provider-brevyn-cloud-official-";
const CLOUD_ENTITLEMENTS_POLL_MS = 40_000;
const CLOUD_ENTITLEMENTS_FOCUS_REFRESH_MS = 60_000;

const emptyDraft: ProviderDraftInput = {
  purpose: "agent",
  providerKind: "anthropic",
  name: "",
  protocol: "anthropic_messages",
  authMode: AGENT_PROVIDER_PRESETS.anthropic.authMode,
  baseUrl: AGENT_PROVIDER_PRESETS.anthropic.baseUrl,
  apiKey: "",
  clearApiKey: false,
  models: [],
  selectedModel: "",
  enabled: false,
  autoCompactThresholdPercent: DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT,
};

const emptyEmbeddingDraft: ProviderDraftInput = {
  purpose: "embedding",
  providerKind: "openai",
  name: "",
  protocol: "openai_compatible",
  authMode: EMBEDDING_PROVIDER_PRESETS.openai.authMode,
  baseUrl: EMBEDDING_PROVIDER_PRESETS.openai.baseUrl,
  apiKey: "",
  clearApiKey: false,
  models: [],
  selectedModel: "",
  enabled: false,
};

const emptyVisionDraft: ProviderDraftInput = {
  purpose: "vision",
  providerKind: "vision-bailian-openai",
  name: "",
  protocol: "openai_compatible",
  authMode: VISION_PROVIDER_PRESETS["vision-bailian-openai"].authMode,
  baseUrl: VISION_PROVIDER_PRESETS["vision-bailian-openai"].baseUrl,
  apiKey: "",
  clearApiKey: false,
  models: [],
  selectedModel: "",
  enabled: false,
};

export function SettingsDialog({
  initialPage = "providers",
  course,
  semester,
  profile,
  skills,
  gitStatus,
  onProfileChange,
  onSkillsChange,
  onWorkspaceChanged,
  onAgentProviderChanged,
  onClose,
}: {
  initialPage?: SettingsPage;
  course?: Course;
  semester?: SemesterWorkspace | null;
  profile: UserProfileSettings;
  skills: SkillItem[];
  gitStatus: GitStatus | null;
  onProfileChange: (profile: UserProfileSettings) => void;
  onSkillsChange: (skills: SkillItem[]) => void;
  onWorkspaceChanged?: () => Promise<void> | void;
  onAgentProviderChanged?: (providerSelection: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [activePage, setActivePage] = useState<SettingsPage>(initialPage);
  const [providers, setProviders] = useState<ModelProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedEmbeddingProviderId, setSelectedEmbeddingProviderId] = useState("");
  const [selectedVisionProviderId, setSelectedVisionProviderId] = useState("");
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [creatingEmbeddingProvider, setCreatingEmbeddingProvider] = useState(false);
  const [creatingVisionProvider, setCreatingVisionProvider] = useState(false);
  const [draft, setDraft] = useState<ProviderDraftInput>(emptyDraft);
  const [embeddingDraft, setEmbeddingDraft] = useState<ProviderDraftInput>(emptyEmbeddingDraft);
  const [visionDraft, setVisionDraft] = useState<ProviderDraftInput>(emptyVisionDraft);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [visionModels, setVisionModels] = useState<ProviderModel[]>([]);
  const [statusLine, setStatusLine] = useState("");
  const [embeddingStatusLine, setEmbeddingStatusLine] = useState("");
  const [visionStatusLine, setVisionStatusLine] = useState("");
  const [embeddingReindexNotice, setEmbeddingReindexNotice] = useState("");
  const [embeddingLockedByIndexing, setEmbeddingLockedByIndexing] = useState(false);
  const [reindexingActiveSemester, setReindexingActiveSemester] = useState(false);
  const [providerToast, setProviderToast] = useState<{ id: number; message: string } | null>(null);
  const [providerBusyActions, setProviderBusyActions] = useState<Partial<Record<ProviderBusyAction, boolean>>>({});
  const [agentGatewayStatus, setAgentGatewayStatus] = useState<AgentGatewayStatus | null>(null);
  const [agentGatewayBusy, setAgentGatewayBusy] = useState(false);
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
  const { confirm: confirmProviderAction, confirmDialog: providerConfirmDialog } = useConfirmDialog();
  const { confirm: confirmCloudRedeem, confirmDialog: cloudRedeemConfirmDialog } = useConfirmDialog();
  const providerApiKeyLoadRequestRef = useRef(0);
  const embeddingApiKeyLoadRequestRef = useRef(0);
  const visionApiKeyLoadRequestRef = useRef(0);
  const cloudModelCatalogRequestsRef = useRef<Set<number>>(new Set());
  const cloudEntitlementsLastRefreshRef = useRef(0);
  const cloudEntitlementsRefreshInFlightRef = useRef(false);
  const agentModelsFetchRequestRef = useRef(0);
  const embeddingModelsFetchRequestRef = useRef(0);
  const visionModelsFetchRequestRef = useRef(0);
  const draftRef = useRef(draft);
  const embeddingDraftRef = useRef(embeddingDraft);
  const visionDraftRef = useRef(visionDraft);

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
    void loadProviders();
    void loadEmbeddingMutable();
    void loadAgentGatewayStatus();
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
    const unsubscribe = window.brevyn.files.onChanged(() => {
      void loadEmbeddingMutable();
    });
    const timer = window.setInterval(() => {
      void loadEmbeddingMutable();
    }, embeddingLockedByIndexing ? 1600 : 5000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [embeddingLockedByIndexing]);

  useEffect(() => {
    setLocalSkills(skills);
  }, [skills]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    embeddingDraftRef.current = embeddingDraft;
  }, [embeddingDraft]);

  useEffect(() => {
    visionDraftRef.current = visionDraft;
  }, [visionDraft]);

  useEffect(() => {
    if (!providerToast) return;
    const timeout = window.setTimeout(() => setProviderToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [providerToast]);

  useEffect(() => {
    if (!selectedProviderId || creatingProvider) return;
    const provider = providers.find((item) => item.id === selectedProviderId);
    if (!provider) return;
    const requestId = ++providerApiKeyLoadRequestRef.current;
    void window.brevyn.providers
      .decryptApiKey(provider.id)
      .then((apiKey) => {
        if (providerApiKeyLoadRequestRef.current !== requestId) return;
        setDraft((current) => {
          if (current.id !== provider.id) return current;
          if (current.apiKey.trim()) return current;
          return { ...current, apiKey };
        });
      })
      .catch((error) => {
        if (providerApiKeyLoadRequestRef.current !== requestId) return;
        console.warn("[providers] Failed to load provider API key", error);
      });
    return () => {
      providerApiKeyLoadRequestRef.current += 1;
    };
  }, [creatingProvider, providers, selectedProviderId]);

  useEffect(() => {
    if (!selectedEmbeddingProviderId || creatingEmbeddingProvider) return;
    const provider = providers.find((item) => item.id === selectedEmbeddingProviderId);
    if (!provider) return;
    const requestId = ++embeddingApiKeyLoadRequestRef.current;
    void window.brevyn.providers
      .decryptApiKey(provider.id)
      .then((apiKey) => {
        if (embeddingApiKeyLoadRequestRef.current !== requestId) return;
        setEmbeddingDraft((current) => {
          if (current.id !== provider.id) return current;
          if (current.apiKey.trim()) return current;
          return { ...current, apiKey };
        });
      })
      .catch((error) => {
        if (embeddingApiKeyLoadRequestRef.current !== requestId) return;
        console.warn("[providers] Failed to load embedding provider API key", error);
      });
    return () => {
      embeddingApiKeyLoadRequestRef.current += 1;
    };
  }, [creatingEmbeddingProvider, providers, selectedEmbeddingProviderId]);

  useEffect(() => {
    if (!selectedVisionProviderId || creatingVisionProvider) return;
    const provider = providers.find((item) => item.id === selectedVisionProviderId);
    if (!provider) return;
    const requestId = ++visionApiKeyLoadRequestRef.current;
    void window.brevyn.providers
      .decryptApiKey(provider.id)
      .then((apiKey) => {
        if (visionApiKeyLoadRequestRef.current !== requestId) return;
        setVisionDraft((current) => {
          if (current.id !== provider.id) return current;
          if (current.apiKey.trim()) return current;
          return { ...current, apiKey };
        });
      })
      .catch((error) => {
        if (visionApiKeyLoadRequestRef.current !== requestId) return;
        console.warn("[providers] Failed to load vision provider API key", error);
      });
    return () => {
      visionApiKeyLoadRequestRef.current += 1;
    };
  }, [creatingVisionProvider, providers, selectedVisionProviderId]);

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

  async function loadProviders() {
    try {
      const result = await window.brevyn.providers.list();
      setProviders(result);
      closeProviderEditor();
      closeEmbeddingEditor();
      closeVisionEditor();
      setStatusLine("");
      setEmbeddingStatusLine("");
      setVisionStatusLine("");
    } catch (error) {
      setProviders([]);
      const message = errorMessage(error, "加载服务商失败。");
      setStatusLine(message);
      setEmbeddingStatusLine(message);
      setVisionStatusLine(message);
    }
  }

  async function loadEmbeddingMutable() {
    try {
      setEmbeddingLockedByIndexing(!(await window.brevyn.providers.embeddingMutable()));
    } catch (error) {
      console.warn("[providers] Failed to load embedding mutability", error);
      setEmbeddingLockedByIndexing(false);
    }
  }

  async function loadAgentGatewayStatus() {
    try {
      setAgentGatewayStatus(await window.brevyn.agentGateway.status());
    } catch (error) {
      console.warn("[agent-gateway] Failed to load status", error);
    }
  }

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
      setCloudStatusLine(`兑换失败：${errorMessage(error)}`);
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

  async function setOpenAiResponsesGatewayEnabled(enabled: boolean) {
    setAgentGatewayBusy(true);
    try {
      const status = await window.brevyn.agentGateway.setEnabled(enabled);
      setAgentGatewayStatus(status);
      showProviderToast(enabled ? "OpenAI Responses Gateway 已启用。" : "OpenAI Responses Gateway 已关闭。");
    } catch (error) {
      setAgentGatewayStatus((current) => ({
        enabled,
        state: "failed",
        activeRuns: current?.activeRuns ?? 0,
        url: current?.url,
        error: errorMessage(error),
      }));
    } finally {
      setAgentGatewayBusy(false);
    }
  }

  function selectProvider(provider: ModelProviderConfig) {
    agentModelsFetchRequestRef.current += 1;
    setProviderBusy("agent-fetch", false);
    closeEmbeddingEditor();
    closeVisionEditor();
    setCreatingProvider(false);
    setSelectedProviderId(provider.id);
    setDraft(toProviderDraft(provider));
    setModels([]);
    setStatusLine("");
  }

  function selectEmbeddingProvider(provider: ModelProviderConfig) {
    embeddingModelsFetchRequestRef.current += 1;
    setProviderBusy("embedding-fetch", false);
    closeProviderEditor();
    closeVisionEditor();
    setCreatingEmbeddingProvider(false);
    setSelectedEmbeddingProviderId(provider.id);
    setEmbeddingDraft(toProviderDraft(provider));
    setEmbeddingStatusLine("");
  }

  function selectVisionProvider(provider: ModelProviderConfig) {
    visionModelsFetchRequestRef.current += 1;
    setProviderBusy("vision-fetch", false);
    closeProviderEditor();
    closeEmbeddingEditor();
    setCreatingVisionProvider(false);
    setSelectedVisionProviderId(provider.id);
    setVisionDraft(toProviderDraft(provider));
    setVisionModels([]);
    setVisionStatusLine("");
  }

  function newProvider() {
    agentModelsFetchRequestRef.current += 1;
    setProviderBusy("agent-fetch", false);
    closeEmbeddingEditor();
    closeVisionEditor();
    setCreatingProvider(true);
    setSelectedProviderId("");
    setDraft({ ...emptyDraft, name: nextProviderDraftName(providers, "agent"), enabled: true });
    setModels([]);
    setStatusLine("");
  }

  function newEmbeddingProvider() {
    if (embeddingLockedByIndexing) {
      setEmbeddingStatusLine("当前有向量索引任务正在进行。请等待完成或取消后，再新建 Embedding 配置。");
      return;
    }
    embeddingModelsFetchRequestRef.current += 1;
    setProviderBusy("embedding-fetch", false);
    closeProviderEditor();
    closeVisionEditor();
    setCreatingEmbeddingProvider(true);
    setSelectedEmbeddingProviderId("");
    setEmbeddingDraft({ ...emptyEmbeddingDraft, name: nextProviderDraftName(providers, "embedding"), enabled: true });
    setEmbeddingStatusLine("");
  }

  function newVisionProvider() {
    visionModelsFetchRequestRef.current += 1;
    setProviderBusy("vision-fetch", false);
    closeProviderEditor();
    closeEmbeddingEditor();
    setCreatingVisionProvider(true);
    setSelectedVisionProviderId("");
    setVisionDraft({ ...emptyVisionDraft, name: nextProviderDraftName(providers, "vision"), enabled: true });
    setVisionModels([]);
    setVisionStatusLine("");
  }

  function closeProviderEditor() {
    agentModelsFetchRequestRef.current += 1;
    setProviderBusy("agent-fetch", false);
    setCreatingProvider(false);
    setSelectedProviderId("");
    setDraft({ ...emptyDraft });
    setModels([]);
  }

  function closeEmbeddingEditor() {
    embeddingModelsFetchRequestRef.current += 1;
    setProviderBusy("embedding-fetch", false);
    setCreatingEmbeddingProvider(false);
    setSelectedEmbeddingProviderId("");
    setEmbeddingDraft({ ...emptyEmbeddingDraft });
  }

  function closeVisionEditor() {
    visionModelsFetchRequestRef.current += 1;
    setProviderBusy("vision-fetch", false);
    setCreatingVisionProvider(false);
    setSelectedVisionProviderId("");
    setVisionDraft({ ...emptyVisionDraft });
    setVisionModels([]);
  }

  function setProviderBusy(action: ProviderBusyAction, busy: boolean) {
    setProviderBusyActions((current) => {
      if (busy) return { ...current, [action]: true };
      const { [action]: _finished, ...rest } = current;
      return rest;
    });
  }

  function showProviderToast(message: string) {
    setProviderToast({ id: Date.now(), message });
  }

  async function handleEmbeddingIndexNotice(result: ProviderSaveResult, savedMessage: string) {
    showProviderToast(savedMessage);
    if (!result.embeddingIndexMayBeStale) {
      setEmbeddingReindexNotice("");
      setEmbeddingStatusLine("");
      return;
    }
    setEmbeddingStatusLine("");
    setEmbeddingReindexNotice("向量服务商、URL 或模型已变更。现有 RAG 索引可能仍使用旧配置生成。");
  }

  async function reindexActiveSemester() {
    setReindexingActiveSemester(true);
    try {
      const result = await window.brevyn.files.indexActiveSemester();
      const queued = result.jobs.filter((job) => job.status === "queued" || job.status === "indexing").length;
      const failed = result.failures.length;
      if (failed > 0) {
        const summary = result.failures.slice(0, 2).map((failure) => `${failure.courseName}: ${failure.message}`).join("; ");
        const suffix = result.failures.length > 2 ? `；另有 ${result.failures.length - 2} 个失败` : "";
        setEmbeddingReindexNotice(`部分工作区无法加入队列：${summary}${suffix}。请修复后重试。`);
        setEmbeddingStatusLine(`已为 ${queued} 个活跃工作区加入重建索引队列；${failed} 个失败。`);
      } else {
        setEmbeddingReindexNotice("");
        setEmbeddingStatusLine(`已为 ${queued} 个活跃工作区加入重建索引队列。`);
      }
    } catch (error) {
      setEmbeddingReindexNotice("无法开始重建索引。请修复问题后重试。");
      setEmbeddingStatusLine(`重建索引失败：${errorMessage(error)}`);
    } finally {
      setReindexingActiveSemester(false);
    }
  }

  async function saveProvider() {
    setProviderBusy("agent-save", true);
    try {
      const result = await window.brevyn.providers.save({ ...draft, purpose: "agent", protocol: AGENT_PROVIDER_PRESETS[draft.providerKind as AgentProviderKind]?.protocol || draft.protocol });
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
      setProviders(next);
      setCreatingProvider(false);
      setSelectedProviderId(saved.id);
      setDraft((current) => ({
        ...current,
        id: saved.id,
        purpose: saved.purpose,
        providerKind: saved.providerKind,
        name: saved.name,
        protocol: saved.protocol,
        authMode: saved.authMode,
        baseUrl: saved.baseUrl,
        models: saved.models.map((model) => ({ ...model })),
        selectedModel: saved.selectedModel,
        enabled: saved.enabled,
      }));
      setStatusLine("");
      showProviderToast("聊天服务商已保存。");
    } catch (error) {
      setStatusLine(`保存模型服务商配置失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("agent-save", false);
    }
  }

  async function deleteProvider(provider: ModelProviderConfig) {
    const ok = await confirmProviderAction({
      title: `删除模型服务商配置“${provider.name}”？`,
      message: "这会删除已保存的配置和本地元数据。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setProviderBusy("agent-delete", true);
    try {
      await window.brevyn.providers.delete(provider.id);
      const next = await window.brevyn.providers.list();
      setProviders(next);
      closeProviderEditor();
      setStatusLine(`已删除模型服务商配置“${provider.name}”。`);
    } catch (error) {
      setStatusLine(`删除模型服务商配置失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("agent-delete", false);
    }
  }

  async function saveEmbeddingProvider() {
    if (embeddingLockedByIndexing) {
      setEmbeddingStatusLine("当前有向量索引任务正在进行。请等待完成或取消后，再保存 Embedding 配置。");
      return;
    }
    setProviderBusy("embedding-save", true);
    try {
      const result = await window.brevyn.providers.save({ ...embeddingDraft, purpose: "embedding", protocol: "openai_compatible" });
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
      await loadEmbeddingMutable();
      setProviders(next);
      setCreatingEmbeddingProvider(false);
      setSelectedEmbeddingProviderId(saved.id);
      setEmbeddingDraft((current) => ({
        ...current,
        id: saved.id,
        purpose: saved.purpose,
        providerKind: saved.providerKind,
        name: saved.name,
        protocol: saved.protocol,
        authMode: saved.authMode,
        baseUrl: saved.baseUrl,
        models: saved.models.map((model) => ({ ...model })),
        selectedModel: saved.selectedModel,
        enabled: saved.enabled,
      }));
      await handleEmbeddingIndexNotice(result, "向量服务商已保存。");
    } catch (error) {
      setEmbeddingStatusLine(`保存向量服务商失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("embedding-save", false);
    }
  }

  async function deleteEmbeddingProvider(provider: ModelProviderConfig) {
    if (embeddingLockedByIndexing) {
      setEmbeddingStatusLine("当前有向量索引任务正在进行。请等待完成或取消后，再删除 Embedding 配置。");
      return;
    }
    const ok = await confirmProviderAction({
      title: `删除向量服务商配置“${provider.name}”？`,
      message: "这会删除已保存的配置和本地元数据。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setProviderBusy("embedding-delete", true);
    try {
      await window.brevyn.providers.delete(provider.id);
      const next = await window.brevyn.providers.list();
      setProviders(next);
      closeEmbeddingEditor();
      setEmbeddingStatusLine(`已删除向量服务商配置“${provider.name}”。`);
    } catch (error) {
      setEmbeddingStatusLine(`删除向量服务商失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("embedding-delete", false);
    }
  }

  async function toggleProvider(provider: ModelProviderConfig) {
    setProviderBusy("agent-toggle", true);
    try {
      const result = await window.brevyn.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
      setProviders(next);
      if (provider.id === selectedProviderId) selectProvider(saved);
    } catch (error) {
      setStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("agent-toggle", false);
    }
  }

  async function toggleOfficialProviders() {
    const officialProviders = providers.filter(isOfficialAgentProvider);
    const enabledOfficialProvider = officialProviders.find((provider) => provider.enabled);
    const nextEnabled = !enabledOfficialProvider;
    const targetProvider = enabledOfficialProvider || officialProviders[0];
    if (!targetProvider) {
      setStatusLine("还没有官方模型配置。请先在账号页登录 Cloud 并同步分组。");
      return;
    }

    setProviderBusy("agent-official-toggle", true);
    try {
      for (const provider of officialProviders) {
        const shouldEnable = nextEnabled && provider.id === targetProvider.id;
        if (provider.enabled === shouldEnable) continue;
        await window.brevyn.providers.save(toProviderDraft(provider, { enabled: shouldEnable }));
      }

      const next = await window.brevyn.providers.list();
      setProviders(next);
      const savedTarget = next.find((provider) => provider.id === targetProvider.id);
      if (savedTarget && selectedProviderId === savedTarget.id) selectProvider(savedTarget);
      if (nextEnabled && savedTarget?.selectedModel) {
        await onAgentProviderChanged?.(agentProviderSelectionValue(savedTarget.id, savedTarget.selectedModel));
      }
      setStatusLine(nextEnabled ? `官方模型配置已启用：${providerDisplayName(targetProvider)}。` : "官方模型配置已关闭。");
    } catch (error) {
      setStatusLine(`更新官方模型配置失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("agent-official-toggle", false);
    }
  }

  async function toggleEmbeddingProvider(provider: ModelProviderConfig) {
    if (embeddingLockedByIndexing) {
      setEmbeddingStatusLine("当前有向量索引任务正在进行。请等待完成或取消后，再启用或关闭 Embedding 配置。");
      return;
    }
    setProviderBusy("embedding-toggle", true);
    try {
      const result = await window.brevyn.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
      setProviders(next);
      if (provider.id === selectedEmbeddingProviderId) selectEmbeddingProvider(saved);
      await handleEmbeddingIndexNotice(result, `已更新向量服务商“${saved.name}”。`);
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("embedding-toggle", false);
    }
  }

  async function toggleVisionProvider(provider: ModelProviderConfig) {
    setProviderBusy("vision-toggle", true);
    try {
      const result = await window.brevyn.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
      setProviders(next);
      if (provider.id === selectedVisionProviderId) selectVisionProvider(saved);
      setVisionStatusLine(`已更新视觉服务商“${saved.name}”。`);
    } catch (error) {
      setVisionStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("vision-toggle", false);
    }
  }

  async function fetchModels() {
    if (!draft.baseUrl.trim() || !draft.apiKey.trim()) {
      setStatusLine("获取模型前需要填写 Base URL 和 API Key。");
      return;
    }
    const requestId = ++agentModelsFetchRequestRef.current;
    const target = providerDraftFetchTarget(draft);
    setProviderBusy("agent-fetch", true);
    try {
      const fetchedModels = await window.brevyn.providers.models(draft);
      if (agentModelsFetchRequestRef.current !== requestId || !isSameProviderDraftFetchTarget(draftRef.current, target)) return;
      setModels(fetchedModels);
      setDraft((current) => mergeFetchedDraftModels(current, fetchedModels));
      setStatusLine("已获取可用模型。");
    } catch (error) {
      if (agentModelsFetchRequestRef.current !== requestId || !isSameProviderDraftFetchTarget(draftRef.current, target)) return;
      setStatusLine(`获取聊天模型失败：${providerFetchErrorMessage(error)}`);
    } finally {
      if (agentModelsFetchRequestRef.current === requestId) setProviderBusy("agent-fetch", false);
    }
  }

  async function fetchEmbeddingModels() {
    if (!embeddingDraft.baseUrl.trim() || !embeddingDraft.apiKey.trim()) {
      setEmbeddingStatusLine("获取模型前需要填写 Base URL 和 API Key。");
      return;
    }
    const requestId = ++embeddingModelsFetchRequestRef.current;
    const target = providerDraftFetchTarget(embeddingDraft);
    setProviderBusy("embedding-fetch", true);
    try {
      const fetchedModels = await window.brevyn.providers.models(embeddingDraft);
      if (embeddingModelsFetchRequestRef.current !== requestId || !isSameProviderDraftFetchTarget(embeddingDraftRef.current, target)) return;
      setEmbeddingDraft((current) => ({
        ...current,
        models: fetchedModels,
        selectedModel: selectedEnabledModel(current.selectedModel, fetchedModels),
      }));
      setEmbeddingStatusLine("已获取向量模型。");
    } catch (error) {
      if (embeddingModelsFetchRequestRef.current !== requestId || !isSameProviderDraftFetchTarget(embeddingDraftRef.current, target)) return;
      setEmbeddingStatusLine(`获取向量模型失败：${errorMessage(error)}`);
    } finally {
      if (embeddingModelsFetchRequestRef.current === requestId) setProviderBusy("embedding-fetch", false);
    }
  }

  async function fetchVisionModels() {
    if (!visionDraft.baseUrl.trim() || !visionDraft.apiKey.trim()) {
      setVisionStatusLine("获取模型前需要填写 Base URL 和 API Key。");
      return;
    }
    const requestId = ++visionModelsFetchRequestRef.current;
    const target = providerDraftFetchTarget(visionDraft);
    setProviderBusy("vision-fetch", true);
    try {
      const fetchedModels = await window.brevyn.providers.models(visionDraft);
      if (visionModelsFetchRequestRef.current !== requestId || !isSameProviderDraftFetchTarget(visionDraftRef.current, target)) return;
      setVisionModels(fetchedModels);
      setVisionDraft((current) => mergeFetchedDraftModels(current, fetchedModels));
      setVisionStatusLine("已获取视觉模型。");
    } catch (error) {
      if (visionModelsFetchRequestRef.current !== requestId || !isSameProviderDraftFetchTarget(visionDraftRef.current, target)) return;
      setVisionModels([]);
      setVisionStatusLine(`获取视觉模型失败：${providerFetchErrorMessage(error)}`);
    } finally {
      if (visionModelsFetchRequestRef.current === requestId) setProviderBusy("vision-fetch", false);
    }
  }

  async function testProvider() {
    setProviderBusy("agent-test", true);
    try {
      const result = await window.brevyn.providers.test(draft);
      setStatusLine(result.ok ? `已连接 · ${result.latencyMs}ms · ${result.message}` : `失败 · ${result.message}`);
    } catch (error) {
      setStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("agent-test", false);
    }
  }

  async function testEmbeddingProvider() {
    setProviderBusy("embedding-test", true);
    try {
      const result = await window.brevyn.providers.test(embeddingDraft);
      setEmbeddingStatusLine(result.ok ? `已连接 · ${result.latencyMs}ms · ${result.message}` : `失败 · ${result.message}`);
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("embedding-test", false);
    }
  }

  async function testVisionProvider() {
    setProviderBusy("vision-test", true);
    try {
      const result = await window.brevyn.providers.test(visionDraft);
      setVisionStatusLine(result.ok ? `已连接 · ${result.latencyMs}ms · ${result.message}` : `失败 · ${result.message}`);
    } catch (error) {
      setVisionStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("vision-test", false);
    }
  }

  async function saveVisionProvider() {
    setProviderBusy("vision-save", true);
    try {
      const result = await window.brevyn.providers.save({ ...visionDraft, purpose: "vision" });
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
      setProviders(next);
      setCreatingVisionProvider(false);
      setSelectedVisionProviderId(saved.id);
      setVisionDraft((current) => ({
        ...current,
        id: saved.id,
        purpose: saved.purpose,
        providerKind: saved.providerKind,
        name: saved.name,
        protocol: saved.protocol,
        authMode: saved.authMode,
        baseUrl: saved.baseUrl,
        models: saved.models.map((model) => ({ ...model })),
        selectedModel: saved.selectedModel,
        enabled: saved.enabled,
      }));
      setVisionStatusLine("");
      showProviderToast("视觉服务商已保存。");
    } catch (error) {
      setVisionStatusLine(`保存视觉服务商失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("vision-save", false);
    }
  }

  async function deleteVisionProvider(provider: ModelProviderConfig) {
    const ok = await confirmProviderAction({
      title: `删除视觉服务商配置“${provider.name}”？`,
      message: "这会删除已保存的配置和本地元数据。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setProviderBusy("vision-delete", true);
    try {
      await window.brevyn.providers.delete(provider.id);
      const next = await window.brevyn.providers.list();
      setProviders(next);
      closeVisionEditor();
      setVisionStatusLine(`已删除视觉服务商配置“${provider.name}”。`);
    } catch (error) {
      setVisionStatusLine(`删除视觉服务商失败：${errorMessage(error)}`);
    } finally {
      setProviderBusy("vision-delete", false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-6">
      {providerConfirmDialog}
      {cloudRedeemConfirmDialog}
      {providerToast && (
        <div className="pointer-events-none absolute top-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg ring-1 ring-border/60">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          {providerToast.message}
        </div>
      )}
      <div className="flex h-[82vh] w-[min(1180px,calc(100vw-48px))] flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4" />
              设置
            </div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="关闭设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
          <aside className="border-r bg-background/45 p-3">
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

          <main className={cx("min-h-0 p-4", activePage === "skills" ? "overflow-hidden" : "overflow-y-auto overscroll-contain [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {activePage === "account" ? (
              <AccountSettingsPage
                profile={profile}
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
                onProfileChange={onProfileChange}
              />
            ) : activePage === "general" ? (
              <GeneralSettingsPage />
            ) : activePage === "providers" ? (
              <ProviderSettingsPage
                providers={providers}
                selectedProviderId={selectedProviderId}
                selectedEmbeddingProviderId={selectedEmbeddingProviderId}
                selectedVisionProviderId={selectedVisionProviderId}
                creatingProvider={creatingProvider}
                creatingEmbeddingProvider={creatingEmbeddingProvider}
                creatingVisionProvider={creatingVisionProvider}
                draft={draft}
                embeddingDraft={embeddingDraft}
                visionDraft={visionDraft}
                models={models}
                visionModels={visionModels}
                statusLine={statusLine}
                embeddingStatusLine={embeddingStatusLine}
                visionStatusLine={visionStatusLine}
                embeddingReindexNotice={embeddingReindexNotice}
                embeddingLockedByIndexing={embeddingLockedByIndexing}
                reindexingActiveSemester={reindexingActiveSemester}
                busyActions={providerBusyActions}
                agentGatewayStatus={agentGatewayStatus}
                agentGatewayBusy={agentGatewayBusy}
                onSelectProvider={selectProvider}
                onSelectEmbeddingProvider={selectEmbeddingProvider}
                onSelectVisionProvider={selectVisionProvider}
                onNewProvider={newProvider}
                onNewEmbeddingProvider={newEmbeddingProvider}
                onNewVisionProvider={newVisionProvider}
                onCloseProviderEditor={closeProviderEditor}
                onCloseEmbeddingEditor={closeEmbeddingEditor}
                onCloseVisionEditor={closeVisionEditor}
                onToggleProvider={toggleProvider}
                onToggleOfficialProviders={toggleOfficialProviders}
                onToggleEmbeddingProvider={toggleEmbeddingProvider}
                onToggleVisionProvider={toggleVisionProvider}
                onDeleteProvider={(provider) => void deleteProvider(provider)}
                onDeleteEmbeddingProvider={(provider) => void deleteEmbeddingProvider(provider)}
                onDeleteVisionProvider={(provider) => void deleteVisionProvider(provider)}
                onDraftChange={setDraft}
                onEmbeddingDraftChange={setEmbeddingDraft}
                onVisionDraftChange={setVisionDraft}
                onFetchModels={fetchModels}
                onFetchEmbeddingModels={fetchEmbeddingModels}
                onFetchVisionModels={fetchVisionModels}
                onTestProvider={testProvider}
                onTestEmbeddingProvider={testEmbeddingProvider}
                onTestVisionProvider={testVisionProvider}
                onSaveProvider={saveProvider}
                onSaveEmbeddingProvider={saveEmbeddingProvider}
                onSaveVisionProvider={saveVisionProvider}
                onReindexActiveSemester={() => void reindexActiveSemester()}
                onDismissEmbeddingReindexNotice={() => setEmbeddingReindexNotice("")}
                onToggleOpenAiResponsesGateway={(enabled) => void setOpenAiResponsesGatewayEnabled(enabled)}
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

function AccountSettingsPage({
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
}: {
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
}) {
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

function PlanSection({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-foreground">{title}</div>
        <div className="shrink-0 text-[10px] text-muted-foreground">{detail}</div>
      </div>
      {children}
    </div>
  );
}

function SubscriptionPlanNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-2 text-[11px] leading-5 text-amber-900">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
      <div className="min-w-0">
        <span className="font-semibold">注意：</span>
        订阅套餐不是一次性积分；日、周、月额度会按对应周期刷新。重复购买同一订阅只延长到期时间，不会叠加当前周期额度。
      </div>
    </div>
  );
}

function BalanceEntitlementCard({
  group,
  currentGroupId,
  busyAction,
  isBusy,
  modelCatalog,
  onActivateGroup,
}: {
  group: CloudBalanceGroupEntitlement;
  currentGroupId: number;
  busyAction: CloudBusyAction;
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

function SubscriptionEntitlementCard({
  group,
  currentGroupId,
  busyAction,
  isBusy,
  modelCatalog,
  onActivateGroup,
}: {
  group: CloudSubscriptionGroupEntitlement;
  currentGroupId: number;
  busyAction: CloudBusyAction;
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

function FallbackGroupCard({
  group,
  currentGroupId,
  busyAction,
  isBusy,
  modelCatalog,
  onActivateGroup,
}: {
  group: CloudGatewayGroup;
  currentGroupId: number;
  busyAction: CloudBusyAction;
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

function CapabilityEntitlementCard({
  group,
  busyAction,
  isBusy,
  modelCatalog,
  providers,
  providerRefs,
  onActivateGroup,
}: {
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup;
  busyAction: CloudBusyAction;
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
                {kind === "embedding" ? <Database className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {kind === "embedding" ? "Embedding" : "Vision"}
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

function EmptyPlanCard({ label }: { label: string }) {
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
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <span className={cx("shrink-0", tone === "warning" ? "text-amber-700" : "text-muted-foreground")}>{percentLabel || formatPercent(clamped)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cx("h-full rounded-full", tone === "warning" ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="mt-1 truncate text-[10px] text-muted-foreground" title={value}>{value}</div>
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

function GeneralSettingsPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background/70 p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Languages className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">通用设置</div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">先放全局偏好入口，后面语言、外观和行为设置都可以收在这里。</div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <ReadOnlyField label="语言" value="中文" />
          <ReadOnlyField label="状态" value="占位，暂不切换界面语言" />
        </div>
      </section>
    </div>
  );
}

function ProviderSettingsPage({
  providers,
  selectedProviderId,
  selectedEmbeddingProviderId,
  selectedVisionProviderId,
  creatingProvider,
  creatingEmbeddingProvider,
  creatingVisionProvider,
  draft,
  embeddingDraft,
  visionDraft,
  models,
  visionModels,
  statusLine,
  embeddingStatusLine,
  visionStatusLine,
  embeddingReindexNotice,
  embeddingLockedByIndexing,
  reindexingActiveSemester,
  busyActions,
  agentGatewayStatus,
  agentGatewayBusy,
  onSelectProvider,
  onSelectEmbeddingProvider,
  onSelectVisionProvider,
  onNewProvider,
  onNewEmbeddingProvider,
  onNewVisionProvider,
  onCloseProviderEditor,
  onCloseEmbeddingEditor,
  onCloseVisionEditor,
  onToggleProvider,
  onToggleOfficialProviders,
  onToggleEmbeddingProvider,
  onToggleVisionProvider,
  onDeleteProvider,
  onDeleteEmbeddingProvider,
  onDeleteVisionProvider,
  onDraftChange,
  onEmbeddingDraftChange,
  onVisionDraftChange,
  onFetchModels,
  onFetchEmbeddingModels,
  onFetchVisionModels,
  onTestProvider,
  onTestEmbeddingProvider,
  onTestVisionProvider,
  onSaveProvider,
  onSaveEmbeddingProvider,
  onSaveVisionProvider,
  onReindexActiveSemester,
  onDismissEmbeddingReindexNotice,
  onToggleOpenAiResponsesGateway,
}: {
  providers: ModelProviderConfig[];
  selectedProviderId: string;
  selectedEmbeddingProviderId: string;
  selectedVisionProviderId: string;
  creatingProvider: boolean;
  creatingEmbeddingProvider: boolean;
  creatingVisionProvider: boolean;
  draft: ProviderDraftInput;
  embeddingDraft: ProviderDraftInput;
  visionDraft: ProviderDraftInput;
  models: ProviderModel[];
  visionModels: ProviderModel[];
  statusLine: string;
  embeddingStatusLine: string;
  visionStatusLine: string;
  embeddingReindexNotice: string;
  embeddingLockedByIndexing: boolean;
  reindexingActiveSemester: boolean;
  busyActions: Partial<Record<ProviderBusyAction, boolean>>;
  agentGatewayStatus: AgentGatewayStatus | null;
  agentGatewayBusy: boolean;
  onSelectProvider: (provider: ModelProviderConfig) => void;
  onSelectEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onSelectVisionProvider: (provider: ModelProviderConfig) => void;
  onNewProvider: () => void;
  onNewEmbeddingProvider: () => void;
  onNewVisionProvider: () => void;
  onCloseProviderEditor: () => void;
  onCloseEmbeddingEditor: () => void;
  onCloseVisionEditor: () => void;
  onToggleProvider: (provider: ModelProviderConfig) => void;
  onToggleOfficialProviders: () => void;
  onToggleEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onToggleVisionProvider: (provider: ModelProviderConfig) => void;
  onDeleteProvider: (provider: ModelProviderConfig) => void;
  onDeleteEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDeleteVisionProvider: (provider: ModelProviderConfig) => void;
  onDraftChange: (draft: ProviderDraftInput) => void;
  onEmbeddingDraftChange: (draft: ProviderDraftInput) => void;
  onVisionDraftChange: (draft: ProviderDraftInput) => void;
  onFetchModels: () => void;
  onFetchEmbeddingModels: () => void;
  onFetchVisionModels: () => void;
  onTestProvider: () => void;
  onTestEmbeddingProvider: () => void;
  onTestVisionProvider: () => void;
  onSaveProvider: () => void;
  onSaveEmbeddingProvider: () => void;
  onSaveVisionProvider: () => void;
  onReindexActiveSemester: () => void;
  onDismissEmbeddingReindexNotice: () => void;
  onToggleOpenAiResponsesGateway: (enabled: boolean) => void;
}) {
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedEmbeddingProvider = providers.find((provider) => provider.id === selectedEmbeddingProviderId);
  const selectedVisionProvider = providers.find((provider) => provider.id === selectedVisionProviderId);
  const officialAgentProviders = providers.filter(isOfficialAgentProvider);
  const enabledOfficialProvider = officialAgentProviders.find((provider) => provider.enabled);
  const userAgentProviders = providers.filter((provider) => provider.purpose === "agent" && !isOfficialAgentProvider(provider));
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const visionProviders = providers.filter((provider) => provider.purpose === "vision");
  const providerEditorOpen = creatingProvider || Boolean(selectedProvider);
  const embeddingEditorOpen = creatingEmbeddingProvider || Boolean(selectedEmbeddingProvider);
  const visionEditorOpen = creatingVisionProvider || Boolean(selectedVisionProvider);
  const runtimeBanner = null;
  const isBusy = (action: ProviderBusyAction) => Boolean(busyActions[action]);
  const isPurposeBlockingBusy = (purpose: ProviderPurpose) => {
    const prefix = purpose === "agent" ? "agent" : purpose === "vision" ? "vision" : "embedding";
    return Object.entries(busyActions).some(([action, busy]) => Boolean(busy) && action.startsWith(`${prefix}-`) && action !== `${prefix}-toggle`);
  };
  const agentBusy = isPurposeBlockingBusy("agent");
  const embeddingBusy = isPurposeBlockingBusy("embedding") || embeddingLockedByIndexing;
  const visionBusy = isPurposeBlockingBusy("vision");
  const agentToggleBusy = isBusy("agent-toggle");
  const officialToggleBusy = isBusy("agent-official-toggle");
  const embeddingToggleBusy = isBusy("embedding-toggle");
  const visionToggleBusy = isBusy("vision-toggle");
  const [visionTestBusy, setVisionTestBusy] = useState<VisionTestKind | null>(null);
  const [visionTestResult, setVisionTestResult] = useState<VisionTestResult | null>(null);
  const [visionTestError, setVisionTestError] = useState("");
  const [manualAgentModel, setManualAgentModel] = useState("");
  const [manualVisionModel, setManualVisionModel] = useState("");

  function addManualAgentModel() {
    const modelId = manualAgentModel.trim();
    if (!modelId) return;
    onDraftChange(addDraftModel(draft, modelId));
    setManualAgentModel("");
  }

  function addManualVisionModel() {
    const modelId = manualVisionModel.trim();
    if (!modelId) return;
    onVisionDraftChange(addDraftModel(visionDraft, modelId));
    setManualVisionModel("");
  }

  async function runVisionTest(kind: VisionTestKind) {
    setVisionTestBusy(kind);
    setVisionTestError("");
    setVisionTestResult(null);
    try {
      const sourcePath = await window.brevyn.vision.pickImage();
      if (!sourcePath) return;
      const result = kind === "calendar"
        ? await window.brevyn.vision.recognizeAcademicCalendar({ sourcePath, apply: false })
        : await window.brevyn.vision.recognizeCourseTimetable({ sourcePath, apply: false });
      setVisionTestResult(result);
    } catch (error) {
      setVisionTestError(errorMessage(error, "视觉识别失败。"));
    } finally {
      setVisionTestBusy(null);
    }
  }

  if (selectedProvider && isOfficialAgentProvider(selectedProvider) && !creatingProvider) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseProviderEditor}
                disabled={agentBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4" />
                官方模型配置
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground" title={officialProviderGroupLabel(selectedProvider)}>
                {officialProviderGroupLabel(selectedProvider)}
              </div>
            </div>
            <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10px] font-medium", draft.enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
              {draft.enabled ? "已启用" : "已关闭"}
            </span>
          </div>

          <OfficialModelList
            providerKind={draft.providerKind}
            baseUrl={draft.baseUrl}
            models={draft.models ?? []}
          />

          {statusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{statusLine}</div>}
        </section>
      </div>
    );
  }

  if (selectedEmbeddingProvider && isOfficialProvider(selectedEmbeddingProvider) && !creatingEmbeddingProvider) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseEmbeddingEditor}
                disabled={embeddingBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4" />
                官方向量配置
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground" title={officialProviderGroupLabel(selectedEmbeddingProvider)}>
                {officialProviderGroupLabel(selectedEmbeddingProvider)}
              </div>
            </div>
            <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10px] font-medium", embeddingDraft.enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
              {embeddingDraft.enabled ? "已启用" : "已关闭"}
            </span>
          </div>

          {(embeddingDraft.models?.length ?? 0) > 0 && (
            <ModelPicker
              providerKind={embeddingDraft.providerKind}
              baseUrl={embeddingDraft.baseUrl}
              selectedModel={embeddingDraft.selectedModel}
              models={embeddingDraft.models ?? []}
              onPick={(model) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: model.id })}
              disabled={embeddingLockedByIndexing}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("embedding-save") && "animate-pulse")} />} label="保存模型选择" onClick={onSaveEmbeddingProvider} primary disabled={embeddingBusy} />
          </div>
          {embeddingStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
        </section>
      </div>
    );
  }

  if (selectedVisionProvider && isOfficialProvider(selectedVisionProvider) && !creatingVisionProvider) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseVisionEditor}
                disabled={visionBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4" />
                官方识别配置
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground" title={officialProviderGroupLabel(selectedVisionProvider)}>
                {officialProviderGroupLabel(selectedVisionProvider)}
              </div>
            </div>
            <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10px] font-medium", visionDraft.enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
              {visionDraft.enabled ? "已启用" : "已关闭"}
            </span>
          </div>

          {(visionDraft.models?.length ?? 0) > 0 && (
            <ModelPicker
              providerKind={visionDraft.providerKind}
              baseUrl={visionDraft.baseUrl}
              selectedModel={visionDraft.selectedModel}
              models={visionDraft.models ?? []}
              onPick={(model) => onVisionDraftChange({ ...visionDraft, selectedModel: model.id })}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("vision-save") && "animate-pulse")} />} label="保存模型选择" onClick={onSaveVisionProvider} primary disabled={visionBusy} />
          </div>
          {visionStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{visionStatusLine}</div>}
        </section>
      </div>
    );
  }

  if (providerEditorOpen) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseProviderEditor}
                disabled={agentBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PlugZap className="h-4 w-4" />
                {creatingProvider ? "新建 Agent 配置" : `编辑 Agent 配置 · ${selectedProvider?.name || "未命名"}`}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">用于聊天、多模态识别和工具调用回复。</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="删除" onClick={() => onDeleteProvider(selectedProvider)} disabled={agentBusy} />}
            </div>
          </div>

          {creatingProvider && (
            <div className="mb-4 rounded-md border border-dashed bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
              这个 Agent 配置还没有保存。填写完成后保存，它会加入 Agent 列表。
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="配置名称" value={draft.name} onChange={(value) => onDraftChange({ ...draft, name: value })} />
            <ReadOnlyField label="用途" value="聊天" />
            <ProviderKindField purpose="agent" value={draft.providerKind as AgentProviderKind} onChange={(value) => onDraftChange(applyProviderPreset(draft, value))} />
            <ReadOnlyField label="适配器" value={adapterLabel(draft.providerKind)} />
            <Field label="Base URL" value={draft.baseUrl} onChange={(value) => onDraftChange({ ...draft, baseUrl: value })} />
            <Field
              label="API Key"
              value={draft.apiKey}
              onChange={(value) => onDraftChange({ ...draft, apiKey: value, clearApiKey: false })}
              type="password"
              placeholder={selectedProviderId ? "留空则不更新" : "输入 API Key"}
              icon={<KeyRound className="h-3 w-3" />}
            />
            <ReadOnlyField label="默认模型" value={draft.selectedModel || "请在下方选择已启用模型"} />
            <Field
              label="自动压缩阈值 (%)"
              value={String(draft.autoCompactThresholdPercent ?? DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT)}
              onChange={(value) => {
                if (!value.trim()) {
                  onDraftChange({ ...draft, autoCompactThresholdPercent: undefined });
                  return;
                }
                const numeric = Number(value);
                if (Number.isFinite(numeric)) onDraftChange({ ...draft, autoCompactThresholdPercent: numeric });
              }}
              type="number"
              placeholder={String(DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT)}
            />
          </div>
          <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
            每个模型上下文窗口不同，这里只设置百分比；默认按 Proma/SDK 经验在 77.5% 左右触发自动压缩。
          </div>

          <div className="mt-3 rounded-md border bg-card p-2">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">手动添加模型</div>
            <div className="flex gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/55"
                value={manualAgentModel}
                placeholder="e.g. qwen-plus, claude-sonnet-4-6"
                onChange={(event) => setManualAgentModel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualAgentModel();
                  }
                }}
              />
              <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="添加" onClick={addManualAgentModel} disabled={!manualAgentModel.trim()} />
            </div>
            <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
              部分 Anthropic 兼容服务商，包括 DashScope app endpoint，不提供模型列表接口。
            </div>
          </div>

          {(draft.models?.length ?? 0) > 0 && (
            <AgentModelManager
              providerKind={draft.providerKind}
              baseUrl={draft.baseUrl}
              models={draft.models ?? []}
              selectedModel={draft.selectedModel}
              onToggle={(model) => onDraftChange(toggleDraftModel(draft, model.id))}
              onMakeDefault={(model) => onDraftChange({ ...draft, selectedModel: model.id })}
              onUpdateModel={(model) => onDraftChange(updateDraftModel(draft, model))}
              onRemoveModel={(model) => onDraftChange(removeDraftModel(draft, model.id))}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", isBusy("agent-fetch") && "animate-spin")} />} label="获取模型" onClick={onFetchModels} disabled={agentBusy} />
            <ActionButton icon={<PlugZap className={cx("h-3.5 w-3.5", isBusy("agent-test") && "animate-pulse")} />} label="测试" onClick={onTestProvider} disabled={agentBusy} />
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("agent-save") && "animate-pulse")} />} label="保存" onClick={onSaveProvider} primary disabled={agentBusy} />
          </div>
          {statusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{statusLine}</div>}
        </section>
      </div>
    );
  }

  if (embeddingEditorOpen) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseEmbeddingEditor}
                disabled={embeddingBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4" />
                {creatingEmbeddingProvider ? "新建 Embedding 配置" : `编辑 Embedding 配置 · ${selectedEmbeddingProvider?.name || "未命名"}`}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">用于 RAG 搜索、课程文件索引和上下文召回。</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedEmbeddingProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="删除" onClick={() => onDeleteEmbeddingProvider(selectedEmbeddingProvider)} disabled={embeddingBusy} />}
            </div>
          </div>

          {creatingEmbeddingProvider && (
            <div className="mb-4 rounded-md border border-dashed bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
              这个 Embedding 配置还没有保存。保存后会加入 Embedding 列表。
            </div>
          )}
          {embeddingLockedByIndexing && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              当前有向量索引任务正在进行。完成或取消后，才可以切换、保存、删除 Embedding 配置，避免同一批课程资料混用不同向量模型。
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="配置名称" value={embeddingDraft.name} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, name: value })} disabled={embeddingLockedByIndexing} />
            <ReadOnlyField label="用途" value="向量" />
            <ProviderKindField purpose="embedding" value={embeddingDraft.providerKind as EmbeddingProviderKind} onChange={(value) => onEmbeddingDraftChange(applyProviderPreset(embeddingDraft, value))} disabled={embeddingLockedByIndexing} />
            <ReadOnlyField label="适配器" value={adapterLabel(embeddingDraft.providerKind)} />
            <Field label="Base URL" value={embeddingDraft.baseUrl} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, baseUrl: value })} disabled={embeddingLockedByIndexing} />
            <Field
              label="API Key"
              value={embeddingDraft.apiKey}
              onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, apiKey: value, clearApiKey: false })}
              type="password"
              placeholder={selectedEmbeddingProviderId ? "留空则不更新" : "输入 API Key"}
              icon={<KeyRound className="h-3 w-3" />}
              disabled={embeddingLockedByIndexing}
            />
            <Field label="模型" value={embeddingDraft.selectedModel} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: value })} disabled={embeddingLockedByIndexing} />
          </div>

          {(embeddingDraft.models?.length ?? 0) > 0 && (
            <ModelPicker
              providerKind={embeddingDraft.providerKind}
              baseUrl={embeddingDraft.baseUrl}
              selectedModel={embeddingDraft.selectedModel}
              models={embeddingDraft.models ?? []}
              onPick={(model) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: model.id })}
              disabled={embeddingLockedByIndexing}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", isBusy("embedding-fetch") && "animate-spin")} />} label="获取模型" onClick={onFetchEmbeddingModels} disabled={embeddingBusy} />
            <ActionButton icon={<PlugZap className={cx("h-3.5 w-3.5", isBusy("embedding-test") && "animate-pulse")} />} label="测试" onClick={onTestEmbeddingProvider} disabled={embeddingBusy} />
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("embedding-save") && "animate-pulse")} />} label="保存向量配置" onClick={onSaveEmbeddingProvider} primary disabled={embeddingBusy} />
          </div>
          {embeddingStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
        </section>
      </div>
    );
  }

  if (visionEditorOpen) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseVisionEditor}
                disabled={visionBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4" />
                {creatingVisionProvider ? "新建 Vision 配置" : `编辑 Vision 配置 · ${selectedVisionProvider?.name || "未命名"}`}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">用于校历和课程表图片识别。</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedVisionProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="删除" onClick={() => onDeleteVisionProvider(selectedVisionProvider)} disabled={visionBusy} />}
            </div>
          </div>

          {creatingVisionProvider && (
            <div className="mb-4 rounded-md border border-dashed bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
              这个 Vision 配置还没有保存。保存后会加入 Vision 列表。
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="配置名称" value={visionDraft.name} onChange={(value) => onVisionDraftChange({ ...visionDraft, name: value })} />
            <ReadOnlyField label="用途" value="视觉" />
            <ProviderKindField purpose="vision" value={visionDraft.providerKind as VisionProviderKind} onChange={(value) => onVisionDraftChange(applyProviderPreset(visionDraft, value))} />
            <ReadOnlyField label="适配器" value={adapterLabel(visionDraft.providerKind)} />
            <Field label="Base URL" value={visionDraft.baseUrl} onChange={(value) => onVisionDraftChange({ ...visionDraft, baseUrl: value })} />
            <Field
              label="API Key"
              value={visionDraft.apiKey}
              onChange={(value) => onVisionDraftChange({ ...visionDraft, apiKey: value, clearApiKey: false })}
              type="password"
              placeholder={selectedVisionProviderId ? "留空则不更新" : "输入 API Key"}
              icon={<KeyRound className="h-3 w-3" />}
            />
            <ReadOnlyField label="默认模型" value={visionDraft.selectedModel || "请在下方选择已启用模型"} />
          </div>

          <div className="mt-3 rounded-md border bg-card p-2">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">手动添加模型</div>
            <div className="flex gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/55"
                value={manualVisionModel}
                placeholder="e.g. qwen-vl-plus, gpt-4.1-mini"
                onChange={(event) => setManualVisionModel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualVisionModel();
                  }
                }}
              />
              <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="添加" onClick={addManualVisionModel} disabled={!manualVisionModel.trim()} />
            </div>
            <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
              如果服务商不提供模型列表接口，可以手动添加视觉模型 ID。
            </div>
          </div>

          {(visionDraft.models?.length ?? 0) > 0 && (
            <AgentModelManager
              title="视觉模型"
              providerKind={visionDraft.providerKind}
              baseUrl={visionDraft.baseUrl}
              availableEmptyLabel="已获取的视觉模型都已启用。"
              enabledEmptyLabel="至少启用一个模型用于识别。"
              models={visionDraft.models ?? []}
              selectedModel={visionDraft.selectedModel}
              onToggle={(model) => onVisionDraftChange(toggleDraftModel(visionDraft, model.id))}
              onMakeDefault={(model) => onVisionDraftChange({ ...visionDraft, selectedModel: model.id })}
              onUpdateModel={(model) => onVisionDraftChange(updateDraftModel(visionDraft, model))}
              onRemoveModel={(model) => onVisionDraftChange(removeDraftModel(visionDraft, model.id))}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", isBusy("vision-fetch") && "animate-spin")} />} label="获取模型" onClick={onFetchVisionModels} disabled={visionBusy} />
            <ActionButton icon={<PlugZap className={cx("h-3.5 w-3.5", isBusy("vision-test") && "animate-pulse")} />} label="测试" onClick={onTestVisionProvider} disabled={visionBusy} />
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("vision-save") && "animate-pulse")} />} label="保存视觉配置" onClick={onSaveVisionProvider} primary disabled={visionBusy} />
          </div>
          {visionStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{visionStatusLine}</div>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runtimeBanner}
      <div className="grid gap-4">
        <OfficialProviderPanel
          providers={officialAgentProviders}
          activeProvider={enabledOfficialProvider}
          busy={agentBusy || officialToggleBusy}
          onToggle={onToggleOfficialProviders}
          onEdit={(provider) => onSelectProvider(provider)}
        />

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <PlugZap className="h-3.5 w-3.5" />
                Agent
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">用户自定义模型配置。</div>
            </div>
            <IconActionButton icon={<Plus className="h-3.5 w-3.5" />} label="新建 Agent" onClick={onNewProvider} disabled={agentBusy} />
          </div>

          <div className={cx(PROVIDER_PROFILE_LIST_HEIGHT_CLASS, "space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {userAgentProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.enabled}
                statusLabel={provider.enabled ? "已启用" : "已关闭"}
                statusOn={provider.enabled}
                onSelect={() => onSelectProvider(provider)}
                onEdit={() => onSelectProvider(provider)}
                onDelete={() => onDeleteProvider(provider)}
                onToggle={() => onToggleProvider(provider)}
                toggleDisabled={agentBusy || agentToggleBusy}
              />
            ))}
            {userAgentProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">暂无自定义 Agent 配置。</div>}
          </div>
          <AgentGatewayAdvancedPanel
            status={agentGatewayStatus}
            busy={agentGatewayBusy}
            onToggle={onToggleOpenAiResponsesGateway}
          />
          {statusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{statusLine}</div>}
        </section>

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Database className="h-3.5 w-3.5" />
                Embedding
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">这里只显示已保存的配置。</div>
            </div>
            <IconActionButton icon={<Plus className="h-3.5 w-3.5" />} label="新建 Embedding" onClick={onNewEmbeddingProvider} disabled={embeddingBusy} />
          </div>
          {embeddingLockedByIndexing && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              向量索引任务进行中，Embedding 配置已临时锁定。
            </div>
          )}

          <div className={cx(PROVIDER_PROFILE_LIST_HEIGHT_CLASS, "space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {embeddingProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.enabled}
                statusLabel={provider.enabled ? "已启用" : "已关闭"}
                statusOn={Boolean(provider.enabled)}
                onSelect={() => onSelectEmbeddingProvider(provider)}
                onEdit={() => onSelectEmbeddingProvider(provider)}
                onDelete={() => onDeleteEmbeddingProvider(provider)}
                onToggle={() => onToggleEmbeddingProvider(provider)}
                toggleDisabled={embeddingBusy || embeddingToggleBusy}
              />
            ))}
            {embeddingProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">暂无 Embedding 配置。新建后会显示在这里。</div>}
          </div>
          {embeddingReindexNotice && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              <div className="flex gap-2">
                <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">向量索引可能已过期</div>
                  <div>{embeddingReindexNotice}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 text-[10px] font-medium text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={reindexingActiveSemester}
                      onClick={onReindexActiveSemester}
                    >
                      {reindexingActiveSemester ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {reindexingActiveSemester ? "正在重建..." : "重建当前学期索引"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-md px-2 text-[10px] font-medium text-amber-900 transition hover:bg-amber-100"
                      onClick={onDismissEmbeddingReindexNotice}
                    >
                      稍后
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {embeddingStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
        </section>

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Eye className="h-3.5 w-3.5" />
                Vision
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">这里只显示已保存的配置。</div>
            </div>
            <IconActionButton icon={<Plus className="h-3.5 w-3.5" />} label="新建 Vision" onClick={onNewVisionProvider} disabled={visionBusy} />
          </div>

          <div className={cx(PROVIDER_PROFILE_LIST_HEIGHT_CLASS, "space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {visionProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.enabled}
                statusLabel={provider.enabled ? "已启用" : "已关闭"}
                statusOn={Boolean(provider.enabled)}
                onSelect={() => onSelectVisionProvider(provider)}
                onEdit={() => onSelectVisionProvider(provider)}
                onDelete={() => onDeleteVisionProvider(provider)}
                onToggle={() => onToggleVisionProvider(provider)}
                toggleDisabled={visionBusy || visionToggleBusy}
              />
            ))}
            {visionProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">暂无 Vision 配置。新建后可用于校历和课程表识别。</div>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              icon={visionTestBusy === "calendar" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
              label="测试校历"
              onClick={() => void runVisionTest("calendar")}
              disabled={Boolean(visionTestBusy) || !hasRunnableVisionProvider(visionProviders)}
            />
            <ActionButton
              icon={visionTestBusy === "timetable" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
              label="测试课表"
              onClick={() => void runVisionTest("timetable")}
              disabled={Boolean(visionTestBusy) || !hasRunnableVisionProvider(visionProviders)}
            />
          </div>
          {visionTestError && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] leading-5 text-rose-900">{visionTestError}</div>}
          {visionTestResult && <VisionTestResultPanel result={visionTestResult} />}
          {visionStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{visionStatusLine}</div>}
        </section>
      </div>
    </div>
  );
}

function OfficialProviderPanel({
  providers,
  activeProvider,
  busy,
  onToggle,
  onEdit,
}: {
  providers: ModelProviderConfig[];
  activeProvider?: ModelProviderConfig;
  busy: boolean;
  onToggle: () => void;
  onEdit: (provider: ModelProviderConfig) => void;
}) {
  const primaryProvider = activeProvider || providers[0];
  const enabled = Boolean(activeProvider);
  const modelCount = primaryProvider?.models?.length ?? 0;
  const statusLabel = enabled ? "官方模型已启用" : "官方模型已关闭";
  const groups = providers.map((provider) => ({
    provider,
    label: officialProviderGroupLabel(provider),
  }));

  return (
    <section className="overflow-hidden rounded-lg border border-emerald-200/75 bg-[linear-gradient(135deg,rgba(236,253,245,0.92),rgba(255,255,255,0.78)_54%,rgba(240,253,244,0.78))] p-3 shadow-sm shadow-emerald-950/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white/80 text-emerald-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
              Brevyn 官方模型
              <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-medium", enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
                {enabled ? "已启用" : "已关闭"}
              </span>
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground" title={primaryProvider ? `${officialProviderGroupLabel(primaryProvider)} · ${modelCount} 个模型` : "未同步 Cloud 官方模型"}>
              {primaryProvider ? `${officialProviderGroupLabel(primaryProvider)} · ${modelCount} 个模型` : "未同步 Cloud 官方模型"}
            </div>
          </div>
        </div>
        <ProviderSwitch enabled={enabled} label={statusLabel} onClick={onToggle} disabled={busy || providers.length === 0} />
      </div>

      {primaryProvider ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/80 bg-white/65 p-2">
          <img src={getProviderProfileLogo(primaryProvider)} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-border/45 bg-background object-contain p-1 shadow-sm" />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(primaryProvider)} disabled={busy}>
            <span className="block truncate text-xs font-semibold text-foreground" title={providerDisplayName(primaryProvider)}>{providerDisplayName(primaryProvider)}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {modelCount} 个模型
            </span>
          </button>
          <IconActionButton icon={<Eye className="h-3.5 w-3.5" />} label="查看官方模型" onClick={() => onEdit(primaryProvider)} disabled={busy} />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-emerald-200/80 bg-white/55 px-3 py-6 text-center text-xs text-muted-foreground">
          账号同步后会在这里显示官方模型配置。
        </div>
      )}

      {groups.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {groups.map(({ provider, label }) => (
            <button
              key={provider.id}
              type="button"
              className={cx(
                "inline-flex max-w-[190px] items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-60",
                provider.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-white/80 bg-white/55 text-muted-foreground hover:bg-white/80 hover:text-foreground",
              )}
              title={`${label} · ${(provider.models ?? []).length} 个模型`}
              disabled={busy}
              onClick={() => onEdit(provider)}
            >
              {provider.enabled ? <Check className="h-3 w-3 shrink-0" /> : <Circle className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function OfficialModelList({
  providerKind,
  baseUrl,
  models,
}: {
  providerKind: ProviderKind;
  baseUrl: string;
  models: ProviderModel[];
}) {
  const visibleModels = models;
  return (
    <div className="rounded-lg border bg-card/80 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">模型列表</div>
        <div className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{visibleModels.length} 个</div>
      </div>
      <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1 brevyn-scrollbar">
        {visibleModels.map((model) => (
          <div
            key={model.id}
            className="flex w-full min-w-0 items-center gap-2 rounded-md border border-border/55 bg-background px-2 py-2 text-left text-muted-foreground"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/45 bg-background p-1 shadow-sm">
              <img src={resolveModelProviderLogo({ modelId: model.id, baseUrl, providerKind })} alt="" className="h-5 w-5 object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground" title={model.name || model.id}>{model.name || model.id}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground" title={model.id}>{model.id}</span>
            </span>
          </div>
        ))}
        {visibleModels.length === 0 && (
          <div className="rounded-md border border-dashed px-3 py-10 text-center text-xs text-muted-foreground">
            还没有同步到模型。
          </div>
        )}
      </div>
    </div>
  );
}

function AgentGatewayAdvancedPanel({
  status,
  busy,
  onToggle,
}: {
  status: AgentGatewayStatus | null;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const enabled = Boolean(status?.enabled);
  const label = agentGatewayStatusLabel(status);
  const detail = status?.state === "running" && status.url
    ? `${status.url}${status.activeRuns > 0 ? ` · ${status.activeRuns} 个运行中` : ""}`
    : status?.state === "failed"
      ? status.error || "启动失败"
      : "关闭时仍会在 OpenAI Responses Agent 运行时按需启动。";
  return (
    <div className="mt-3 rounded-lg border bg-card/70 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
            OpenAI Responses Gateway
            <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-medium", status?.state === "failed" ? "bg-rose-100 text-rose-800" : "bg-muted text-muted-foreground")}>
              {label}
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {detail}
          </div>
        </div>
        <button
          type="button"
          className={cx(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
            enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={() => onToggle(!enabled)}
          disabled={busy || status?.state === "starting" || status?.state === "stopping"}
        >
          {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {busy || status?.state === "starting" || status?.state === "stopping" ? "处理中" : enabled ? "开启" : "关闭"}
        </button>
      </div>
    </div>
  );
}

function agentGatewayStatusLabel(status: AgentGatewayStatus | null): string {
  if (!status) return "加载中";
  if (!status.enabled && status.state === "disabled") return "按需模式";
  if (status.state === "running") return "运行中";
  if (status.state === "starting") return "启动中";
  if (status.state === "stopping") return "停止中";
  if (status.state === "failed") return "启动失败";
  return status.enabled ? "已启用" : "按需模式";
}

function nextProviderDraftName(providers: ModelProviderConfig[], purpose: ProviderPurpose): string {
  const prefix = purpose === "agent" ? "Agent" : purpose === "vision" ? "Vision" : "Embedding";
  const used = new Set(
    providers
      .filter((provider) => provider.purpose === purpose)
      .map((provider) => provider.name.trim().replace(/\s+/g, " ").toLowerCase()),
  );
  let index = 1;
  while (used.has(`${prefix} ${index}`.toLowerCase())) index += 1;
  return `${prefix} ${index}`;
}

function VisionTestResultPanel({ result }: { result: VisionTestResult }) {
  const summary = result.kind === "academic_calendar"
    ? `${result.events.length} 个校历事件${result.semester?.term ? ` · ${result.semester.term}` : ""}`
    : `${result.courses.length} 门课程${result.semesterLabel ? ` · ${result.semesterLabel}` : ""}`;
  const warnings = result.warnings.length;
  return (
    <div className="mt-3 overflow-hidden rounded-lg border bg-card/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Eye className="h-3.5 w-3.5" />
            视觉测试结果
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={result.sourcePath}>
            {summary}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-1">{result.modelId}</span>
          {warnings > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">{warnings} 条提醒</span>}
        </div>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-5 text-muted-foreground brevyn-scrollbar">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function visionModelOptions(providers: ModelProviderConfig[]) {
  return providers.filter((provider) => provider.enabled).flatMap((provider) =>
    provider.models
      .filter((model) => model.enabled !== false)
      .map((model) => ({
        value: visionOptionValue(provider.id, model.id),
        label: model.name || model.id,
        detail: `${provider.name} · ${providerKindLabel(provider.providerKind)}`,
        icon: <Eye className="h-3.5 w-3.5" />,
      })),
  );
}

function visionOptionValue(providerId: string, modelId: string): string {
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function parseVisionOptionValue(value: string): [string, string] {
  const [providerId, modelId] = value.split("::");
  if (!providerId || !modelId) return ["", ""];
  return [decodeURIComponent(providerId), decodeURIComponent(modelId)];
}

interface ArchiveSemesterGroup {
  semester: SemesterWorkspace;
  courses: Course[];
  archivedCourses: Course[];
  archivedTasks: BrevynTask[];
  archivedThreads: Thread[];
}

interface ArchiveCourseEntry {
  courseId: string;
  course?: Course;
  tasks: BrevynTask[];
  threads: Thread[];
}

interface ArchiveDisplayGroup extends ArchiveSemesterGroup {
  semesterVisible: boolean;
  homeThreads: Thread[];
  courseEntries: ArchiveCourseEntry[];
}

type ArchiveFilter = "all" | "semesters" | "courses" | "tasks" | "sessions";
type ArchiveSelectionKind = "semester" | "course" | "task" | "thread";
type ArchiveSelectionKey = `${ArchiveSelectionKind}:${string}`;

interface ArchiveSelectionTarget {
  key: ArchiveSelectionKey;
  kind: ArchiveSelectionKind;
  id: string;
  label: string;
  semesterId: string;
  courseId?: string;
}

const ARCHIVE_PAGE_SIZE = 5;
const archiveFilters: Array<{ value: ArchiveFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "semesters", label: "学期" },
  { value: "courses", label: "课程" },
  { value: "tasks", label: "任务" },
  { value: "sessions", label: "会话" },
];

function ArchiveSettingsPage({ onWorkspaceChanged }: { onWorkspaceChanged?: () => Promise<void> | void }) {
  const [groups, setGroups] = useState<ArchiveSemesterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const [page, setPage] = useState(1);
  const [openSemesters, setOpenSemesters] = useState<Record<string, boolean>>({});
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<ArchiveSelectionKey>>(() => new Set());
  const { confirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    void loadArchive();
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedKeys(new Set());
  }, [filter, groups.length, query]);

  async function loadArchive() {
    setLoading(true);
    setError("");
    try {
      const [activeSemesters, archivedSemesters] = await Promise.all([
        window.brevyn.semester.list(),
        window.brevyn.semester.listArchived(),
      ]);
      const semesters = [...activeSemesters, ...archivedSemesters].sort(compareSemestersForArchive);
      const nextGroups = await Promise.all(
        semesters.map(async (item) => {
          const [courses, archivedCourses, archivedTasks, archivedThreads] = await Promise.all([
            window.brevyn.courses.listForArchive({ semesterId: item.id }),
            window.brevyn.courses.listArchived({ semesterId: item.id }),
            window.brevyn.tasks.listArchived({ semesterId: item.id }),
            window.brevyn.threads.listArchived({ semesterId: item.id }),
          ]);
          return { semester: item, courses, archivedCourses, archivedTasks, archivedThreads };
        }),
      );
      setGroups(nextGroups.filter((group) => group.semester.archivedAt || group.archivedCourses.length > 0 || group.archivedTasks.length > 0 || group.archivedThreads.length > 0));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  async function afterMutation() {
    await loadArchive();
    await onWorkspaceChanged?.();
  }

  async function restoreSemester(semester: SemesterWorkspace) {
    setBusyKey(`semester:restore:${semester.id}`);
    setError("");
    try {
      await window.brevyn.semester.restore(semester.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "恢复学期失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteSemester(semester: SemesterWorkspace) {
    const ok = await confirm({
      title: `永久删除“${semester.term}”？`,
      message: "这会删除所有课程、文件、会话和索引数据。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setBusyKey(`semester:delete:${semester.id}`);
    setError("");
    try {
      await window.brevyn.semester.delete(semester.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "删除学期失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function restoreCourse(course: Course, semesterArchived: boolean) {
    if (semesterArchived) {
      setError("请先恢复父级学期，再恢复这门课程。");
      return;
    }
    setBusyKey(`course:restore:${course.id}`);
    setError("");
    try {
      await window.brevyn.courses.restore(course.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "恢复课程失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteCourse(course: Course) {
    const ok = await confirm({
      title: `永久删除“${course.name}”？`,
      message: "这会删除所有文件、会话和索引数据。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setBusyKey(`course:delete:${course.id}`);
    setError("");
    try {
      await window.brevyn.courses.delete(course.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "删除课程失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function restoreTask(task: BrevynTask, blocked: boolean) {
    if (blocked) {
      setError("请先恢复父级学期或课程，再恢复这个任务。");
      return;
    }
    setBusyKey(`task:restore:${task.id}`);
    setError("");
    try {
      await window.brevyn.tasks.restore(task.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "恢复任务失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteTask(task: BrevynTask) {
    const ok = await confirm({
      title: `永久删除“${task.title}”？`,
      message: "这会删除该任务的文件夹、会话、文件记录、时间表关联和 RAG 索引。删除后无法恢复。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setBusyKey(`task:delete:${task.id}`);
    setError("");
    try {
      await window.brevyn.tasks.delete(task.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "删除任务失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function restoreThread(thread: Thread, blocked: boolean) {
    if (blocked) {
      setError("请先恢复父级学期或课程，再恢复这个会话。");
      return;
    }
    setBusyKey(`thread:restore:${thread.id}`);
    setError("");
    try {
      await window.brevyn.threads.restore(thread.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "恢复会话失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteThread(thread: Thread) {
    const ok = await confirm({
      title: `删除已归档会话“${thread.title}”？`,
      message: "这会永久删除该归档会话。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setBusyKey(`thread:delete:${thread.id}`);
    setError("");
    try {
      await window.brevyn.threads.delete(thread.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "删除会话失败。"));
    } finally {
      setBusyKey("");
    }
  }

  async function bulkDeleteSelected(targets: ArchiveSelectionTarget[]) {
    const selectedTargets = compactArchiveSelection(targets.filter((target) => selectedKeys.has(target.key)));
    if (selectedTargets.length === 0) return;
    const ok = await confirm({
      title: `批量删除 ${selectedTargets.length} 项归档内容？`,
      message: "这会永久删除所选学期、课程或会话，删除后无法恢复。",
      confirmLabel: "批量删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!ok) return;
    setBusyKey("archive:bulk-delete");
    setError("");
    try {
      for (const target of selectedTargets) {
        if (target.kind === "semester") {
          await window.brevyn.semester.delete(target.id);
        } else if (target.kind === "course") {
          await window.brevyn.courses.delete(target.id);
        } else if (target.kind === "task") {
          await window.brevyn.tasks.delete(target.id);
        } else {
          await window.brevyn.threads.delete(target.id);
        }
      }
      setSelectedKeys(new Set());
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "批量删除失败。"));
    } finally {
      setBusyKey("");
    }
  }

  const archivedSemesterCount = groups.filter((group) => group.semester.archivedAt).length;
  const archivedCourseCount = groups.reduce((count, group) => count + group.archivedCourses.length, 0);
  const archivedTaskCount = groups.reduce((count, group) => count + group.archivedTasks.length, 0);
  const archivedThreadCount = groups.reduce((count, group) => count + group.archivedThreads.length, 0);
  const filteredGroups = useMemo(() => filterArchiveGroups(groups, query, filter), [filter, groups, query]);
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / ARCHIVE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * ARCHIVE_PAGE_SIZE;
  const visibleGroups = filteredGroups.slice(pageStart, pageStart + ARCHIVE_PAGE_SIZE);
  const visibleStart = filteredGroups.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = Math.min(filteredGroups.length, pageStart + ARCHIVE_PAGE_SIZE);
  const allSelectableTargets = useMemo(() => archiveSelectionTargets(filteredGroups), [filteredGroups]);
  const visibleSelectableTargets = useMemo(() => archiveSelectionTargets(visibleGroups), [visibleGroups]);
  const selectedTargets = useMemo(() => allSelectableTargets.filter((target) => selectedKeys.has(target.key)), [allSelectableTargets, selectedKeys]);
  const deleteTargetCount = useMemo(() => compactArchiveSelection(selectedTargets).length, [selectedTargets]);
  const selectedCount = selectedTargets.length;
  const visibleSelectedCount = visibleSelectableTargets.filter((target) => selectedKeys.has(target.key)).length;
  const allVisibleSelected = visibleSelectableTargets.length > 0 && visibleSelectedCount === visibleSelectableTargets.length;

  function toggleSemesterOpen(semesterId: string) {
    setOpenSemesters((current) => ({ ...current, [semesterId]: current[semesterId] === false }));
  }

  function toggleCourseOpen(courseKey: string) {
    setOpenCourses((current) => ({ ...current, [courseKey]: current[courseKey] === false }));
  }

  function toggleSelection(key: ArchiveSelectionKey, selected?: boolean) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const shouldSelect = selected ?? !next.has(key);
      if (shouldSelect) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const target of visibleSelectableTargets) next.delete(target.key);
      } else {
        for (const target of visibleSelectableTargets) next.add(target.key);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <section className="rounded-lg border bg-background/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="h-4 w-4" />
              归档中心
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              恢复已归档的学期、课程、任务和会话。永久删除只对已归档内容开放。
            </div>
          </div>
          <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", loading && "animate-spin")} />} label="刷新" onClick={() => void loadArchive()} disabled={loading} />
        </div>
        <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground md:grid-cols-4">
          <ArchiveMetric label="学期" value={archivedSemesterCount} />
          <ArchiveMetric label="课程" value={archivedCourseCount} />
          <ArchiveMetric label="任务" value={archivedTaskCount} />
          <ArchiveMetric label="会话" value={archivedThreadCount} />
        </div>
        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border bg-card pl-8 pr-3 text-xs text-foreground outline-none transition focus:ring-2 focus:ring-ring/20"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选已归档的学期、课程、任务或会话"
            />
          </label>
          <div className="flex shrink-0 flex-wrap gap-1">
            {archiveFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cx(
                  "h-8 rounded-md border px-2.5 text-[11px] font-medium transition",
                  filter === item.value ? "border-foreground/25 bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">{error}</div>}
      </section>

      {loading ? (
        <div className="rounded-lg border border-dashed bg-background/55 px-4 py-10 text-center text-xs text-muted-foreground">正在加载归档内容...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background/55 px-4 py-10 text-center text-xs text-muted-foreground">暂无已归档的学期、课程、任务或会话。</div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background/55 px-4 py-10 text-center text-xs text-muted-foreground">没有符合筛选条件的归档内容。</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>显示 {visibleStart}-{visibleEnd} / 共 {filteredGroups.length}</span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[10px] font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={visibleSelectableTargets.length === 0 || busyKey === "archive:bulk-delete"}
                onClick={toggleVisibleSelection}
              >
                {allVisibleSelected ? "取消当前页" : "选择当前页"}
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[10px] font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={selectedCount === 0 || busyKey === "archive:bulk-delete"}
                onClick={() => setSelectedKeys(new Set())}
              >
                清空选择
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[10px] font-medium text-muted-foreground transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={selectedCount === 0 || busyKey === "archive:bulk-delete"}
                onClick={() => void bulkDeleteSelected(allSelectableTargets)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {busyKey === "archive:bulk-delete" ? "删除中..." : `批量删除${deleteTargetCount ? ` ${deleteTargetCount}` : ""}`}
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[10px] font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                上一页
              </button>
              <span className="rounded-md bg-muted px-2 py-1 text-[10px]">{safePage}/{totalPages}</span>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[10px] font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={safePage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                下一页
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {visibleGroups.map((group) => {
            const semesterArchived = Boolean(group.semester.archivedAt);
            const homeThreads = group.homeThreads;
            const courseEntries = group.courseEntries;
            const semesterOpen = openSemesters[group.semester.id] !== false;
            const semesterKey = archiveSelectionKey("semester", group.semester.id);
            return (
              <section key={group.semester.id} className="overflow-hidden rounded-lg border bg-background/70">
                <div className={cx("flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3", semesterArchived ? "bg-muted/45" : "bg-card/70")}>
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {semesterArchived && group.semesterVisible && (
                      <ArchiveCheckbox
                        checked={selectedKeys.has(semesterKey)}
                        label={`选择学期 ${group.semester.term}`}
                        onChange={(checked) => toggleSelection(semesterKey, checked)}
                      />
                    )}
                    <button
                      type="button"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      title={semesterOpen ? "折叠学期" : "展开学期"}
                      onClick={() => toggleSemesterOpen(group.semester.id)}
                    >
                      <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-150", !semesterOpen && "-rotate-90")} />
                    </button>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="min-w-0 max-w-full break-words text-sm font-semibold leading-5" title={group.semester.term}>{group.semester.term}</span>
                        <span className={cx("rounded px-1.5 py-0.5 text-[9px] uppercase", semesterArchived ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
                          {semesterArchived ? "已归档学期" : "活跃学期"}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {group.semester.semesterNo} · {group.archivedCourses.length} 门已归档课程 · {group.archivedTasks.length} 个已归档任务 · {group.archivedThreads.length} 个已归档会话
                      </div>
                    </div>
                  </div>
                  {semesterArchived && group.semesterVisible && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <ArchiveActionButton
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        label="恢复学期"
                        busy={busyKey === `semester:restore:${group.semester.id}`}
                        onClick={() => void restoreSemester(group.semester)}
                      />
                      <ArchiveActionButton
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        label="删除"
                        danger
                        busy={busyKey === `semester:delete:${group.semester.id}`}
                        onClick={() => void deleteSemester(group.semester)}
                      />
                    </div>
                  )}
                </div>

                <div className={cx("grid transition-[grid-template-rows] duration-200 ease-out", semesterOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="min-h-0 overflow-hidden">
                <div className="space-y-3 p-4">
                  {semesterArchived && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                      该学期已归档。请先恢复学期，再恢复其下课程或会话。
                    </div>
                  )}

                  {homeThreads.length > 0 && (
                    <section className="rounded-lg border bg-background/65 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <MessageSquare className="h-3.5 w-3.5" />
                          主页会话
                        </div>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{homeThreads.length}</span>
                      </div>
                      <div className="space-y-2">
                        {homeThreads.map((thread) => (
                          <ArchivedThreadRow
                            key={thread.id}
                            thread={thread}
                            restoreBlocked={semesterArchived}
                            busyKey={busyKey}
                            selected={selectedKeys.has(archiveSelectionKey("thread", thread.id))}
                            onSelect={(checked) => toggleSelection(archiveSelectionKey("thread", thread.id), checked)}
                            onRestore={() => void restoreThread(thread, semesterArchived)}
                            onDelete={() => void deleteThread(thread)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {courseEntries.length > 0 && (
                    <ArchivePanel icon={<BookOpen className="h-3.5 w-3.5" />} title="课程" count={courseEntries.length}>
                      <div className="space-y-2">
                        {courseEntries.map((entry) => {
                          const courseArchived = Boolean(entry.course?.archivedAt);
                          const restoreBlocked = semesterArchived || courseArchived;
                          const archivedTaskIds = new Set(entry.tasks.map((task) => task.id));
                          const courseOpenKey = `${group.semester.id}:${entry.courseId}`;
                          const courseOpen = openCourses[courseOpenKey] !== false;
                          const courseKey = archiveSelectionKey("course", entry.courseId);
                          return (
                            <div key={entry.courseId} className="rounded-lg border bg-card p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                  {entry.course && courseArchived && (
                                    <ArchiveCheckbox
                                      checked={selectedKeys.has(courseKey)}
                                      label={`选择课程 ${entry.course.name}`}
                                      onChange={(checked) => toggleSelection(courseKey, checked)}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                    title={courseOpen ? "折叠课程" : "展开课程"}
                                    onClick={() => toggleCourseOpen(courseOpenKey)}
                                  >
                                    <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-150", !courseOpen && "-rotate-90")} />
                                  </button>
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <span className="min-w-0 max-w-full break-words text-xs font-semibold leading-5" title={entry.course?.name || entry.courseId}>{entry.course?.name || `课程 ${shortId(entry.courseId)}`}</span>
                                      {entry.course?.code && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{entry.course.code}</span>}
                                      {courseArchived ? (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">已归档课程</span>
                                      ) : entry.course ? (
                                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] uppercase text-emerald-700">活跃课程</span>
                                      ) : null}
                                    </div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                      {entry.tasks.length} 个已归档任务 · {entry.threads.length} 个已归档会话 · {entry.course ? entry.course.instructor || "无教师信息" : "课程元数据未加载"}
                                    </div>
                                  </div>
                                </div>
                                {entry.course && courseArchived && (
                                  <div className="flex shrink-0 flex-wrap gap-2">
                                    <ArchiveActionButton
                                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                                      label="恢复课程"
                                      disabled={semesterArchived}
                                      busy={busyKey === `course:restore:${entry.course.id}`}
                                      onClick={() => void restoreCourse(entry.course as Course, semesterArchived)}
                                    />
                                    <ArchiveActionButton
                                      icon={<Trash2 className="h-3.5 w-3.5" />}
                                      label="删除"
                                      danger
                                      busy={busyKey === `course:delete:${entry.course.id}`}
                                      onClick={() => void deleteCourse(entry.course as Course)}
                                    />
                                  </div>
                                )}
                              </div>

                              {(entry.tasks.length > 0 || entry.threads.length > 0) && (
                                <div className={cx("grid transition-[grid-template-rows] duration-200 ease-out", courseOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                                  <div className="min-h-0 overflow-hidden">
                                    <div className="mt-3 space-y-2">
                                      {entry.tasks.map((task) => (
                                        <ArchivedTaskRow
                                          key={task.id}
                                          task={task}
                                          restoreBlocked={restoreBlocked}
                                          busyKey={busyKey}
                                          selected={selectedKeys.has(archiveSelectionKey("task", task.id))}
                                          onSelect={(checked) => toggleSelection(archiveSelectionKey("task", task.id), checked)}
                                          onRestore={() => void restoreTask(task, restoreBlocked)}
                                          onDelete={() => void deleteTask(task)}
                                        />
                                      ))}
                                      {entry.threads.map((thread) => {
                                        const threadRestoreBlocked = restoreBlocked || Boolean(thread.taskId && archivedTaskIds.has(thread.taskId));
                                        return (
                                          <ArchivedThreadRow
                                            key={thread.id}
                                            thread={thread}
                                            restoreBlocked={threadRestoreBlocked}
                                            busyKey={busyKey}
                                            selected={selectedKeys.has(archiveSelectionKey("thread", thread.id))}
                                            onSelect={(checked) => toggleSelection(archiveSelectionKey("thread", thread.id), checked)}
                                            onRestore={() => void restoreThread(thread, threadRestoreBlocked)}
                                            onDelete={() => void deleteThread(thread)}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ArchivePanel>
                  )}
                </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function filterArchiveGroups(groups: ArchiveSemesterGroup[], query: string, filter: ArchiveFilter): ArchiveDisplayGroup[] {
  const normalizedQuery = normalizeArchiveQuery(query);
  const hasQuery = normalizedQuery.length > 0;

  return groups
    .map((group) => {
      const semesterArchived = Boolean(group.semester.archivedAt);
      const semesterMatches = semesterArchived && archiveTextMatches(
        [group.semester.term, group.semester.semesterNo, group.semester.id],
        normalizedQuery,
      );
      const semesterVisible = (filter === "all" || filter === "semesters") && semesterArchived && (!hasQuery || semesterMatches);
      const includeSessions = filter === "all" || filter === "sessions";
      const includeTasks = filter === "all" || filter === "tasks";
      const includeCourses = filter === "all" || filter === "courses" || filter === "tasks" || filter === "sessions";
      const homeThreads = includeSessions
        ? group.archivedThreads
          .filter((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID)
          .filter((thread) => !hasQuery || archiveThreadMatches(thread, normalizedQuery))
        : [];
      const courseEntries = includeCourses
        ? archiveCourseEntries(group)
          .map((entry) => filterArchiveCourseEntry(entry, normalizedQuery, filter, hasQuery, includeTasks, includeSessions))
          .filter((entry): entry is ArchiveCourseEntry => Boolean(entry))
        : [];

      return {
        ...group,
        semesterVisible,
        homeThreads,
        courseEntries,
      };
    })
    .filter((group) => group.semesterVisible || group.homeThreads.length > 0 || group.courseEntries.length > 0);
}

function filterArchiveCourseEntry(entry: ArchiveCourseEntry, query: string, filter: ArchiveFilter, hasQuery: boolean, includeTasks: boolean, includeSessions: boolean): ArchiveCourseEntry | null {
  const courseMatches = archiveTextMatches(
    [entry.course?.name, entry.course?.code, entry.course?.instructor, entry.courseId],
    query,
  );
  const matchingTasks = includeTasks ? entry.tasks.filter((task) => archiveTaskMatches(task, query)) : [];
  const matchingThreads = entry.threads.filter((thread) => archiveThreadMatches(thread, query));

  const scopedEntry = {
    ...entry,
    tasks: includeTasks ? entry.tasks : [],
    threads: includeSessions ? entry.threads : [],
  };

  if (filter === "tasks") {
    if (!hasQuery) return entry.tasks.length ? { ...entry, tasks: entry.tasks, threads: [] } : null;
    return matchingTasks.length ? { ...entry, tasks: matchingTasks, threads: [] } : null;
  }

  if (filter === "sessions") {
    if (!hasQuery) return entry.threads.length ? { ...entry, tasks: [], threads: entry.threads } : null;
    return matchingThreads.length ? { ...entry, tasks: [], threads: matchingThreads } : null;
  }

  if (filter === "courses") {
    return !hasQuery || courseMatches ? { ...entry, tasks: [], threads: [] } : null;
  }

  if (!hasQuery) return scopedEntry;
  if (courseMatches) return scopedEntry;
  if (matchingTasks.length || matchingThreads.length) return { ...entry, tasks: matchingTasks, threads: matchingThreads };
  return null;
}

function archiveTaskMatches(task: BrevynTask, query: string): boolean {
  return archiveTextMatches([task.title, task.taskType, task.status, task.dueAt, task.id, task.courseId], query);
}

function archiveThreadMatches(thread: Thread, query: string): boolean {
  return archiveTextMatches([thread.title, thread.taskId, thread.id, thread.threadType], query);
}

function archiveTextMatches(values: Array<string | number | undefined>, query: string): boolean {
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function normalizeArchiveQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function ArchiveMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <span className="font-medium text-foreground">{value}</span>
      <span> {label.toLowerCase()}</span>
    </div>
  );
}

function ArchivePanel({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-background/65 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          {icon}
          {title}
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
  );
}

function ArchivedThreadRow({
  thread,
  restoreBlocked,
  busyKey,
  selected,
  onSelect,
  onRestore,
  onDelete,
}: {
  thread: Thread;
  restoreBlocked: boolean;
  busyKey: string;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/80 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <ArchiveCheckbox checked={selected} label={`选择会话 ${thread.title}`} onChange={onSelect} />
        <div className="min-w-0">
          <div className="break-words text-xs font-medium leading-5" title={thread.title}>{thread.title}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {thread.threadType === "semester_home" ? "主页会话" : `任务会话 · ${shortId(thread.taskId || thread.id)}`} · 归档于 {formatArchiveDate(thread.archivedAt)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <ArchiveActionButton
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label="恢复"
          disabled={restoreBlocked}
          busy={busyKey === `thread:restore:${thread.id}`}
          onClick={onRestore}
        />
        <ArchiveActionButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="删除"
          danger
          busy={busyKey === `thread:delete:${thread.id}`}
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

function ArchivedTaskRow({
  task,
  restoreBlocked,
  busyKey,
  selected,
  onSelect,
  onRestore,
  onDelete,
}: {
  task: BrevynTask;
  restoreBlocked: boolean;
  busyKey: string;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/80 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <ArchiveCheckbox checked={selected} label={`选择任务 ${task.title}`} onChange={onSelect} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="break-words text-xs font-medium leading-5" title={task.title}>{task.title}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{task.taskType}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{displayArchivedTaskStatus(task.status)}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            任务 · {shortId(task.id)} · 归档于 {formatArchiveDate(task.archivedAt)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <ArchiveActionButton
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label="恢复"
          disabled={restoreBlocked}
          busy={busyKey === `task:restore:${task.id}`}
          onClick={onRestore}
        />
        <ArchiveActionButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="删除"
          danger
          busy={busyKey === `task:delete:${task.id}`}
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

function ArchiveCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      className={cx(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
        checked ? "border-foreground/30 bg-foreground text-background shadow-sm" : "border-border bg-background text-transparent hover:border-foreground/30 hover:bg-accent",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

function ArchiveActionButton({
  icon,
  label,
  onClick,
  disabled,
  busy,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        danger ? "bg-card text-muted-foreground hover:bg-red-50 hover:text-red-700" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {icon}
      {busy ? "处理中..." : label}
    </button>
  );
}

function archiveCourseEntries(group: ArchiveSemesterGroup): ArchiveCourseEntry[] {
  const entries = new Map<string, ArchiveCourseEntry>();
  const coursesById = new Map(group.courses.map((course) => [course.id, course]));
  for (const course of group.archivedCourses) {
    entries.set(course.id, { courseId: course.id, course, tasks: [], threads: [] });
  }
  for (const task of group.archivedTasks) {
    const existing = entries.get(task.courseId) || { courseId: task.courseId, course: coursesById.get(task.courseId), tasks: [], threads: [] };
    existing.tasks.push(task);
    entries.set(task.courseId, existing);
  }
  for (const thread of group.archivedThreads) {
    if (thread.courseId === SEMESTER_HOME_COURSE_ID) continue;
    const existing = entries.get(thread.courseId) || { courseId: thread.courseId, course: coursesById.get(thread.courseId), tasks: [], threads: [] };
    existing.threads.push(thread);
    entries.set(thread.courseId, existing);
  }
  return Array.from(entries.values()).sort((a, b) => (a.course?.name || a.courseId).localeCompare(b.course?.name || b.courseId));
}

function archiveSelectionKey(kind: ArchiveSelectionKind, id: string): ArchiveSelectionKey {
  return `${kind}:${id}`;
}

function archiveSelectionTargets(groups: ArchiveDisplayGroup[]): ArchiveSelectionTarget[] {
  return groups.flatMap((group) => {
    const targets: ArchiveSelectionTarget[] = [];
    if (group.semesterVisible && group.semester.archivedAt) {
      targets.push({
        key: archiveSelectionKey("semester", group.semester.id),
        kind: "semester",
        id: group.semester.id,
        label: group.semester.term,
        semesterId: group.semester.id,
      });
    }
    for (const thread of group.homeThreads) {
      targets.push({
        key: archiveSelectionKey("thread", thread.id),
        kind: "thread",
        id: thread.id,
        label: thread.title,
        semesterId: group.semester.id,
        courseId: SEMESTER_HOME_COURSE_ID,
      });
    }
    for (const entry of group.courseEntries) {
      if (entry.course?.archivedAt) {
        targets.push({
          key: archiveSelectionKey("course", entry.course.id),
          kind: "course",
          id: entry.course.id,
          label: entry.course.name,
          semesterId: group.semester.id,
          courseId: entry.course.id,
        });
      }
      for (const thread of entry.threads) {
        targets.push({
          key: archiveSelectionKey("thread", thread.id),
          kind: "thread",
          id: thread.id,
          label: thread.title,
          semesterId: group.semester.id,
          courseId: entry.courseId,
        });
      }
      for (const task of entry.tasks) {
        targets.push({
          key: archiveSelectionKey("task", task.id),
          kind: "task",
          id: task.id,
          label: task.title,
          semesterId: group.semester.id,
          courseId: task.courseId,
        });
      }
    }
    return targets;
  });
}

function compactArchiveSelection(targets: ArchiveSelectionTarget[]): ArchiveSelectionTarget[] {
  const selectedSemesterIds = new Set(targets.filter((target) => target.kind === "semester").map((target) => target.semesterId));
  const selectedCourseIds = new Set(targets.filter((target) => target.kind === "course").map((target) => target.courseId).filter(Boolean));
  return targets.filter((target) => {
    if (target.kind === "semester") return true;
    if (selectedSemesterIds.has(target.semesterId)) return false;
    if ((target.kind === "task" || target.kind === "thread") && target.courseId && selectedCourseIds.has(target.courseId)) return false;
    return true;
  });
}

function compareSemestersForArchive(a: SemesterWorkspace, b: SemesterWorkspace): number {
  const aTime = Date.parse(a.archivedAt || a.startsAt || a.recognizedAt || "");
  const bTime = Date.parse(b.archivedAt || b.startsAt || b.recognizedAt || "");
  return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
}

function formatArchiveDate(value?: string): string {
  if (!value) return "未知";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
}

function displayArchivedTaskStatus(status: BrevynTask["status"]): string {
  if (status === "in_progress") return "进行中";
  if (status === "due_soon") return "即将截止";
  if (status === "done") return "已完成";
  return "未开始";
}

function shortId(value: string): string {
  return value.replace(/^(course|task|thread|semester)-/, "").slice(0, 8) || value;
}

function SkillSettingsPage({
  skills,
  enabledSkills,
  gitStatus,
  selectedSkillId,
  skillContent,
  skillBusy,
  skillStatusLine,
  onSelectSkill,
  onSkillContentChange,
  onSaveSkill,
  onImportSkill,
  onOpenSkillFolder,
  onToggleSkill,
}: {
  skills: SkillItem[];
  enabledSkills: number;
  gitStatus: GitStatus | null;
  selectedSkillId: string;
  skillContent: string;
  skillBusy: boolean;
  skillStatusLine: string;
  onSelectSkill: (skillId: string) => void;
  onSkillContentChange: (content: string) => void;
  onSaveSkill: () => void;
  onImportSkill: () => void;
  onOpenSkillFolder: (skillId: string) => void;
  onToggleSkill: (skill: SkillItem) => void;
}) {
  const groupedSkills = useMemo(() => {
    return groupSkillsForSettings(skills);
  }, [skills]);
  const [expandedSkillGroups, setExpandedSkillGroups] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(groupedSkills.filter((group) => group.skills.length > 0).map((group) => [group.id, true]))
  ));
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId);
  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/20">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-3 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" />
            Skill 配置
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{enabledSkills} 个启用</span>
            <ActionButton icon={<Upload className="h-3.5 w-3.5" />} label="导入" onClick={onImportSkill} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] brevyn-scrollbar-thin">
          {groupedSkills.map((group) => (
            <SkillListGroup
              key={group.id}
              title={group.title}
              description={group.description}
              count={group.skills.length}
              skills={group.skills}
              emptyText={group.emptyText}
              expanded={expandedSkillGroups[group.id] ?? group.skills.length > 0}
              onToggleExpanded={() => setExpandedSkillGroups((current) => ({ ...current, [group.id]: !(current[group.id] ?? group.skills.length > 0) }))}
              selectedSkillId={selectedSkillId}
              onSelectSkill={onSelectSkill}
              onToggleSkill={onToggleSkill}
            />
          ))}
        </div>
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b bg-card p-3">
            <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
              <FileText className="h-3.5 w-3.5" />
              <span className="min-w-0 truncate" title={selectedSkill?.name || "技能内容"}>{selectedSkill?.name || "技能内容"}</span>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                label="打开"
                onClick={() => selectedSkill && onOpenSkillFolder(selectedSkill.id)}
              />
              <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="保存" onClick={onSaveSkill} primary disabled={!selectedSkill || skillBusy || !skillContent.trim()} />
            </div>
          </div>
          </div>

          {selectedSkill ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [backface-visibility:hidden] [contain:layout_paint] [scrollbar-gutter:stable] brevyn-scrollbar">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.version}</span>
                {selectedSkill.category && <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.category}</span>}
                {!!selectedSkill.resources?.length && <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.resources.length} 个资源</span>}
                {selectedSkill.sourcePath && <span className="min-w-0 max-w-full break-all rounded bg-muted px-1.5 py-0.5" title={selectedSkill.sourcePath}>{selectedSkill.sourcePath}</span>}
              </div>
              <div className="grid gap-2 rounded-lg border bg-background p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                <SkillMetaRow label="触发词" values={selectedSkill.triggers} />
                <SkillMetaRow label="标签" values={selectedSkill.tags} />
                <SkillMetaRow label="范围" values={selectedSkill.scopes} />
                <SkillMetaRow label="允许工具" values={selectedSkill.allowedTools} />
              </div>
              {!!selectedSkill.resources?.length && (
                <div className="rounded-lg border bg-background p-2">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
                    <Layers3 className="h-3.5 w-3.5" />
                    Skill 资源
                  </div>
                  <div className="max-h-40 space-y-1 overflow-auto pr-1 brevyn-scrollbar">
                    {selectedSkill.resources.slice(0, 24).map((resource) => (
                      <div key={resource.relativePath} className="flex items-center gap-2 rounded bg-muted/45 px-2 py-1 text-[11px] text-muted-foreground">
                        <span className="shrink-0 rounded bg-background px-1 py-0.5 text-[10px]">{resource.kind}</span>
                        <span className="min-w-0 flex-1 truncate">{resource.relativePath}</span>
                        <span className="shrink-0">{resource.sizeLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <textarea
                className="h-[360px] min-h-[280px] w-full resize-none rounded-lg border bg-background px-3 py-3 font-mono text-[12px] leading-5 text-foreground outline-none [scrollbar-gutter:stable] brevyn-scrollbar"
                value={skillContent}
                onChange={(event) => onSkillContentChange(event.target.value)}
                spellCheck={false}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                    <Layers3 className="h-3.5 w-3.5" />
                    Skill 运行时
                  </div>
                  <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
                    <MetricRow label="路由" value="已启用 Skill" />
                    <MetricRow label="范围" value="全局" />
                    <MetricRow label="上下文" value="感知上下文窗口" />
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                    <GitBranch className="h-3.5 w-3.5" />
                    Git / 编辑工具
                  </div>
                  <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
                    <div className="rounded-md bg-muted/50 px-2 py-2">
                      <span className="font-medium text-foreground">{gitStatus?.branch || "本地/mock"}</span>
                      <span> · </span>
                      <span>{gitStatus?.summary || "Git 服务占位实现已就绪。"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <ToolChip icon={<Wrench className="h-3 w-3" />} label="编辑文件" />
                      <ToolChip icon={<TerminalSquare className="h-3 w-3" />} label="运行命令" />
                      <ToolChip icon={<GitBranch className="h-3 w-3" />} label="git diff" />
                      <ToolChip icon={<Sparkles className="h-3 w-3" />} label="技能路由" />
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          ) : (
            <div className="m-3 rounded-md border border-dashed px-3 py-8 text-center text-[12px] text-muted-foreground">
              选择一个 Skill 查看或编辑它的 `SKILL.md`。
            </div>
          )}

          {skillStatusLine && <div className="mx-3 mb-3 mt-3 shrink-0 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{skillStatusLine}</div>}
          {skillBusy && !skillStatusLine && <div className="mx-3 mb-3 mt-3 shrink-0 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">正在处理 Skill 文件...</div>}
        </section>
      </aside>
    </div>
  );
}

function SkillListGroup({
  title,
  description,
  count,
  skills,
  emptyText,
  expanded,
  onToggleExpanded,
  selectedSkillId,
  onSelectSkill,
  onToggleSkill,
}: {
  title: string;
  description?: string;
  count: number;
  skills: SkillItem[];
  emptyText?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  selectedSkillId: string;
  onSelectSkill: (skillId: string) => void;
  onToggleSkill: (skill: SkillItem) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 border-b border-border/55 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/45"
        onClick={onToggleExpanded}
      >
        <ChevronRight className={cx("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>{title}</span>
            <span className="tabular-nums">{count}</span>
          </span>
          {description && <span className="mt-1 block truncate text-[10px] leading-4 text-muted-foreground/75">{description}</span>}
        </span>
      </button>
      {expanded && (
        <div>
          {skills.length === 0 ? (
            <div className="px-3 py-4 text-[11px] leading-5 text-muted-foreground">{emptyText || "暂无"}</div>
          ) : (
            skills.map((skill) => (
              <SkillListItem
                key={skill.id}
                skill={skill}
                selected={skill.id === selectedSkillId}
                onSelect={() => onSelectSkill(skill.id)}
                onToggle={() => onToggleSkill(skill)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SkillSettingsGroup {
  id: SkillSettingsCategoryId | "featured";
  title: string;
  description?: string;
  emptyText?: string;
  skills: SkillItem[];
}

type SkillSettingsCategoryId =
  | "assignment"
  | "course"
  | "writing"
  | "documents"
  | "research"
  | "other";

const skillSettingsCategories: Array<{
  id: SkillSettingsCategoryId;
  title: string;
  description: string;
  emptyText: string;
}> = [
  {
    id: "assignment",
    title: "作业技能",
    description: "拆要求、对 rubric、找证据、做提交清单。",
    emptyText: "还没有安装作业类技能。后续 assignment-brief、rubric-checker 会显示在这里。",
  },
  {
    id: "course",
    title: "课程学习",
    description: "课件精读、周复习、考试复习、课堂材料整理。",
    emptyText: "还没有安装课程学习类技能。",
  },
  {
    id: "writing",
    title: "学术写作",
    description: "Essay、report、引用格式、结构和语言修改。",
    emptyText: "还没有安装学术写作类技能。",
  },
  {
    id: "documents",
    title: "展示与文档",
    description: "PDF、Word、PPT、表格等基础文件能力。",
    emptyText: "还没有安装文件处理类技能。",
  },
  {
    id: "research",
    title: "研究进阶",
    description: "文献综述、论文精读、Nature 风格、审稿回复等。",
    emptyText: "还没有安装研究进阶类技能。",
  },
  {
    id: "other",
    title: "我的技能",
    description: "用户导入或暂未归类的技能。",
    emptyText: "暂无其他技能。",
  },
];

function groupSkillsForSettings(skills: SkillItem[]): SkillSettingsGroup[] {
  const byName = (a: SkillItem, b: SkillItem) => a.name.localeCompare(b.name);
  const enabled = skills.filter((skill) => skill.enabled);
  const buckets = new Map<SkillSettingsCategoryId, SkillItem[]>(skillSettingsCategories.map((category) => [category.id, []]));

  for (const skill of enabled) {
    const category = skillSettingsCategoryForSkill(skill);
    buckets.get(category)?.push(skill);
  }

  const featured = enabled
    .filter((skill) => {
      const category = skillSettingsCategoryForSkill(skill);
      return category === "assignment" || category === "course" || category === "writing";
    })
    .sort(byName)
    .slice(0, 6);

  return [
    {
      id: "featured",
      title: "推荐",
      description: "优先展示适合大学作业和课程学习的技能。",
      emptyText: "当前还没有作业/课程/写作类技能。先从“展示与文档”使用基础文件能力。",
      skills: featured,
    },
    ...skillSettingsCategories.map((category) => ({
      ...category,
      skills: (buckets.get(category.id) || []).sort(byName),
    })),
  ];
}

function skillSettingsCategoryForSkill(skill: SkillItem): SkillSettingsCategoryId {
  const category = normalizedSkillText(skill.category);
  const haystack = normalizedSkillText([
    skill.slug,
    skill.id,
    skill.name,
    skill.description,
    skill.category,
    ...(skill.tags || []),
    ...(skill.triggers || []),
  ].filter(Boolean).join(" "));

  if (matchesAny(category, ["assignment", "homework", "作业", "rubric"])) return "assignment";
  if (matchesAny(category, ["course", "study", "lecture", "exam", "课程", "学习", "复习"])) return "course";
  if (matchesAny(category, ["writing", "essay", "academic writing", "写作", "论文"])) return "writing";
  if (matchesAny(category, ["document", "presentation", "spreadsheet", "file", "文档", "展示"])) return "documents";
  if (matchesAny(category, ["research", "paper", "literature", "nature", "研究", "文献"])) return "research";

  if (matchesAny(haystack, ["assignment", "homework", "rubric", "submission", "brief", "作业", "评分", "提交"])) return "assignment";
  if (matchesAny(haystack, ["week-review", "lecture", "course", "exam", "study", "课件", "课程", "复习", "考试"])) return "course";
  if (matchesAny(haystack, ["essay", "report", "apa", "mla", "citation", "write", "writing", "polish", "humanizer", "写作", "引用", "润色"])) return "writing";
  if (matchesAny(haystack, ["pdf", "docx", "pptx", "xlsx", "slides", "deck", "presentation", "spreadsheet", "word", "powerpoint", "文档", "幻灯片", "表格"])) return "documents";
  if (matchesAny(haystack, ["research", "paper", "literature", "reviewer", "response", "nature", "journal", "pubmed", "arxiv", "研究", "文献", "期刊", "审稿"])) return "research";
  return "other";
}

function normalizedSkillText(value?: string): string {
  return (value || "").toLowerCase();
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function SkillListItem({ skill, selected, onSelect, onToggle }: { skill: SkillItem; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cx(
        "group flex h-11 w-full cursor-pointer items-center gap-2 border-b border-border/45 px-3 text-left transition-colors",
        selected ? "bg-accent text-accent-foreground" : "bg-transparent hover:bg-muted/45",
        !skill.enabled && "opacity-55",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      title={`${skill.name}\n${skill.description}`}
    >
      <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", selected ? "bg-background/70 text-foreground" : "bg-background text-muted-foreground")}>
        <BookOpen className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 leading-none">
        <div className="truncate text-sm font-medium" title={skill.name}>{skill.name}</div>
        <div className={cx("mt-1 truncate text-[10px]", selected ? "text-accent-foreground/65" : "text-muted-foreground")}>
          {skill.category || skill.version || skill.id}
        </div>
      </div>
      <SkillSwitch enabled={skill.enabled} onClick={onToggle} />
    </div>
  );
}

function SkillSwitch({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  const label = enabled ? "停用 Skill" : "启用 Skill";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200",
        enabled ? "border-emerald-500 bg-emerald-500" : "border-border bg-muted hover:bg-muted/80",
      )}
    >
      <span
        className={cx(
          "pointer-events-none h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200",
          enabled ? "translate-x-[21px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SettingsNavButton({ active, icon, title, detail, onClick }: { active: boolean; icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx("flex w-full min-w-0 items-start gap-2 rounded-lg border px-3 py-3 text-left transition", active ? "border-border bg-card text-foreground shadow-sm ring-1 ring-border/60" : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground")}
      onClick={onClick}
    >
      <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", active ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-[11px]">{detail}</span>
      </span>
    </button>
  );
}

function AboutUpdateSettingsPage() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<Awaited<ReturnType<typeof window.brevyn.updater.getReleaseByTag>>>(null);

  useEffect(() => {
    let cancelled = false;
    void window.brevyn.updater
      .getStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({
            status: "error",
            currentVersion: "0.0.0",
            supported: false,
            error: errorMessage(error, "加载更新状态失败。"),
          });
        }
      });
    const unsubscribe = window.brevyn.updater.onStatusChanged((next) => {
      setStatus(next);
      if (next.status !== "checking") setChecking(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status?.status !== "available" || !status.version) {
      setReleaseNotes(null);
      return;
    }
    let cancelled = false;
    void window.brevyn.updater
      .getReleaseByTag(status.version)
      .then((release) => {
        if (!cancelled) setReleaseNotes(release);
      })
      .catch(() => {
        if (!cancelled) setReleaseNotes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function checkForUpdates() {
    setChecking(true);
    try {
      await window.brevyn.updater.checkForUpdates();
    } catch (error) {
      setStatus({
        status: "error",
        currentVersion: status?.currentVersion || "0.0.0",
        supported: Boolean(status?.supported),
        error: errorMessage(error, "检查更新失败。"),
      });
      setChecking(false);
    }
  }

  async function quitAndInstall() {
    await window.brevyn.updater.quitAndInstall();
  }

  async function dismissDownloadedUpdate() {
    const next = await window.brevyn.updater.dismissDownloaded();
    setStatus(next);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <UpdateStatusCard
        status={status}
        checking={checking}
        release={releaseNotes}
        onCheck={() => void checkForUpdates()}
        onDismissDownloaded={() => void dismissDownloadedUpdate()}
        onQuitAndInstall={() => void quitAndInstall()}
      />
      <VersionHistory />
    </div>
  );
}

function ProviderProfileRow({
  provider,
  active,
  statusLabel,
  statusOn,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  toggleDisabled,
}: {
  provider: ModelProviderConfig;
  active: boolean;
  statusLabel: string;
  statusOn: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  toggleDisabled?: boolean;
}) {
  const actionsDisabled = Boolean(toggleDisabled);
  const enabledModels = provider.models.filter((model) => model.enabled !== false);
  const displayName = providerDisplayName(provider);
  const logo = getProviderProfileLogo(provider);
  const official = isOfficialProvider(provider);
  return (
    <div className={cx("group flex items-center gap-2 rounded-lg border p-2 transition-colors", PROVIDER_PROFILE_ROW_HEIGHT_CLASS, active ? "bg-muted text-foreground ring-1 ring-border/70" : "bg-card text-muted-foreground hover:text-foreground")}>
      <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-border/45 bg-background object-contain p-1 shadow-sm" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="block truncate text-xs font-semibold" title={provider.name}>{displayName}</span>
        <span className="mt-0.5 block truncate text-[10px]">
          {providerKindLabel(provider.providerKind)} · {provider.baseUrl || "未设置 URL"}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap gap-1">
          {provider.selectedModel && <span className="max-w-[150px] truncate rounded bg-background/80 px-1.5 py-0.5 text-[9px]">{provider.selectedModel}</span>}
          {enabledModels.length > 1 && <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px]">+{enabledModels.length - 1}</span>}
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex w-[72px] shrink-0 items-center justify-end gap-1">
          <IconActionButton icon={official ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />} label={`${official ? "查看" : "编辑"} ${displayName}`} onClick={onEdit} disabled={actionsDisabled} />
          {!official && <IconActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label={`删除 ${displayName}`} onClick={onDelete} disabled={actionsDisabled} danger />}
        </div>
        <ProviderSwitch enabled={statusOn} label={statusLabel} onClick={onToggle} disabled={toggleDisabled} />
      </div>
    </div>
  );
}

function ProviderSwitch({ enabled, label, onClick, disabled }: { enabled: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed",
        enabled ? "border-emerald-500 bg-emerald-500" : "border-border bg-muted hover:bg-muted/80",
      )}
    >
      <span
        className={cx(
          "pointer-events-none h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200",
          enabled ? "translate-x-[21px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  icon,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && passwordVisible ? "text" : type;

  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center gap-1 rounded-md border bg-card px-2">
        {icon}
        <input
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/55 disabled:cursor-not-allowed disabled:text-muted-foreground"
          type={inputType}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => setPasswordVisible((visible) => !visible)}
            disabled={disabled}
            aria-label={passwordVisible ? `隐藏${label}` : `显示${label}`}
            title={passwordVisible ? `隐藏${label}` : `显示${label}`}
          >
            {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center rounded-md border bg-muted/35 px-2 text-xs text-foreground">{value}</div>
    </label>
  );
}

function CloudAuthStep({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/65 px-2.5 py-2 text-[11px] text-muted-foreground">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="font-medium text-foreground/80">{label}</span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium text-foreground" title={value}>{value}</div>
    </div>
  );
}

function ProviderKindField({
  purpose,
  value,
  onChange,
  disabled,
}: {
  purpose: ProviderPurpose;
  value: ProviderKind;
  onChange: (value: ProviderKind) => void;
  disabled?: boolean;
}) {
  const options = purpose === "agent" ? agentProviderKinds : purpose === "vision" ? visionProviderKinds : embeddingProviderKinds;
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>服务商</span>
      <DropdownSelect
        value={value}
        options={options.map((kind) => ({
          value: kind,
          label: providerKindLabel(kind),
          icon: <ProviderLogo src={getProviderKindLogo(kind)} />,
        }))}
        placeholder="选择服务商"
        ariaLabel="选择服务商类型"
        onChange={(next) => onChange(next as ProviderKind)}
        disabled={disabled}
        renderValue={(option) => (
          option ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          ) : "选择服务商"
        )}
      />
    </label>
  );
}

function ProviderLogo({ src }: { src: string }) {
  return <img src={src} alt="" className="h-4 w-4 shrink-0 rounded-[0.28rem] object-contain" />;
}

function TogglePill({ enabled, onClick, labelOn = "已启用", labelOff = "已停用", disabled }: { enabled: boolean; onClick: () => void; labelOn?: string; labelOff?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-45", enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
      {enabled ? labelOn : labelOff}
    </button>
  );
}

function ModelPicker({
  providerKind,
  baseUrl,
  models,
  selectedModel,
  onPick,
  disabled,
}: {
  providerKind: ProviderKind;
  baseUrl: string;
  models: ProviderModel[];
  selectedModel: string;
  onPick: (model: ProviderModel) => void;
  disabled?: boolean;
}) {
  if (models.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border bg-card p-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span>模型</span>
        <span>{models.length}</span>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1 brevyn-scrollbar">
        {models.map((model) => {
          const selected = model.id === selectedModel;
          return (
            <button
              key={model.id}
              type="button"
              className={cx(
                "flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left text-[11px] transition-colors",
                disabled
                  ? "cursor-not-allowed border-border/45 bg-muted/35 text-muted-foreground/70"
                  : selected
                    ? "border-emerald-300 bg-emerald-50/80 text-foreground shadow-sm ring-1 ring-emerald-100"
                    : "border-border/55 bg-background text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50/35 hover:text-foreground",
              )}
              disabled={disabled}
              onClick={() => onPick(model)}
            >
              <span className={cx("relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", selected ? "border-emerald-200 bg-white" : "border-border/55 bg-background")}>
                <img src={resolveModelProviderLogo({ modelId: model.id, baseUrl, providerKind })} alt="" className="h-4.5 w-4.5 object-contain" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{model.name}</span>
                <span className={cx("block truncate text-[10px]", selected ? "text-emerald-900/70" : "text-muted-foreground")}>{model.id}</span>
                {model.contextWindowTokens && (
                  <span className={cx("mt-0.5 block text-[10px]", selected ? "text-emerald-900/65" : "text-muted-foreground")}>
                    {formatContextWindow(model.contextWindowTokens)} 上下文
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgentModelManager({
  title = "聊天模型",
  providerKind,
  baseUrl,
  availableEmptyLabel = "已获取的模型都已启用。",
  enabledEmptyLabel = "至少启用一个模型用于聊天。",
  models,
  selectedModel,
  onToggle,
  onMakeDefault,
  onUpdateModel,
  onRemoveModel,
}: {
  title?: string;
  providerKind: ProviderKind;
  baseUrl: string;
  availableEmptyLabel?: string;
  enabledEmptyLabel?: string;
  models: ProviderModel[];
  selectedModel: string;
  onToggle: (model: ProviderModel) => void;
  onMakeDefault: (model: ProviderModel) => void;
  onUpdateModel?: (model: ProviderModel) => void;
  onRemoveModel?: (model: ProviderModel) => void;
}) {
  const availableModels = models.filter((model) => model.enabled === false);
  const enabledModels = models.filter((model) => model.enabled !== false);
  return (
    <div className="mt-3 rounded-md border bg-card p-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span>{title}</span>
        <span>{enabledModels.length}/{models.length} 已启用</span>
      </div>
      <div className="grid min-h-0 gap-2 md:grid-cols-2">
        <ModelColumn title="可用" emptyLabel={availableEmptyLabel} empty={availableModels.length === 0}>
          {availableModels.map((model) => (
            <ModelTransferRow
              key={model.id}
              model={model}
              providerKind={providerKind}
              baseUrl={baseUrl}
              icon={<Plus className="h-3.5 w-3.5" />}
              label="启用模型"
              onClick={() => onToggle(model)}
              onUpdateModel={onUpdateModel}
              onRemoveModel={onRemoveModel}
            />
          ))}
        </ModelColumn>
        <ModelColumn title="已启用" emptyLabel={enabledEmptyLabel} empty={enabledModels.length === 0}>
          {enabledModels.map((model) => {
            const selected = model.id === selectedModel;
            return (
              <ModelTransferRow
                key={model.id}
                model={model}
                providerKind={providerKind}
                baseUrl={baseUrl}
                selected={selected}
                icon={<Minus className="h-3.5 w-3.5" />}
                label="停用模型"
                onClick={() => onToggle(model)}
                onMakeDefault={() => onMakeDefault(model)}
                onUpdateModel={onUpdateModel}
                onRemoveModel={onRemoveModel}
              />
            );
          })}
        </ModelColumn>
      </div>
    </div>
  );
}

function ModelColumn({ title, emptyLabel, empty, children }: { title: string; emptyLabel: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border bg-background/70">
      <div className="border-b px-2 py-1.5 text-[10px] font-medium text-muted-foreground">{title}</div>
      <div className="max-h-64 space-y-1 overflow-y-auto p-1.5 brevyn-scrollbar">
        {empty ? <div className="rounded-md border border-dashed px-2 py-6 text-center text-[11px] text-muted-foreground">{emptyLabel}</div> : children}
      </div>
    </div>
  );
}

function ModelTransferRow({
  model,
  providerKind,
  baseUrl,
  selected,
  icon,
  label,
  onClick,
  onMakeDefault,
  onUpdateModel,
  onRemoveModel,
}: {
  model: ProviderModel;
  providerKind: ProviderKind;
  baseUrl: string;
  selected?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  onMakeDefault?: () => void;
  onUpdateModel?: (model: ProviderModel) => void;
  onRemoveModel?: (model: ProviderModel) => void;
}) {
  const contextWindowValue = model.contextWindowTokens ? model.contextWindowTokens.toLocaleString() : "";
  const logo = resolveModelProviderLogo({ modelId: model.id, baseUrl, providerKind });
  return (
    <div className={cx("grid min-w-0 grid-cols-[auto_minmax(0,1fr)_7.5rem_auto_auto] items-center gap-2 rounded-md border px-2 py-2 text-[11px] transition-colors", selected ? "border-emerald-300 bg-emerald-50/70 text-foreground ring-1 ring-emerald-100" : "border-border/55 bg-card text-muted-foreground")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/45 bg-background p-1 shadow-sm">
        <img src={logo} alt="" className="h-5 w-5 object-contain" />
      </span>
      <button type="button" className="min-w-0 text-left" onClick={onMakeDefault} disabled={!onMakeDefault} title={model.id}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{model.name}</span>
          {selected && <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-1.5 py-0.5 text-[9px] text-emerald-800">默认</span>}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{model.id}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {model.contextWindowTokens ? `${formatContextWindow(model.contextWindowTokens)} · ${contextWindowSourceLabel(model.contextWindowSource)}` : "上下文窗口未设置"}
        </span>
      </button>
      <label className="min-w-0 text-[10px] text-muted-foreground">
        <span className="sr-only">上下文窗口 token</span>
        <input
          className="h-7 w-full rounded-md border bg-background px-2 text-right text-[11px] text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-foreground/35"
          inputMode="numeric"
          value={contextWindowValue}
          placeholder="窗口"
          title="上下文窗口 token"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            const next = contextWindowFromInput(event.target.value);
            onUpdateModel?.({
              ...model,
              contextWindowTokens: next,
              contextWindowSource: next ? "user" : undefined,
            });
          }}
        />
      </label>
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
        onClick={(event) => {
          event.stopPropagation();
          onRemoveModel?.(model);
        }}
        disabled={!onRemoveModel}
        aria-label="删除模型"
        title="删除模型"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
        onClick={onClick}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  primary,
  disabled,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45",
        primary ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function IconActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-45",
        danger ? "hover:border-red-200 hover:bg-red-50 hover:text-red-700" : "hover:bg-accent hover:text-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function SkillMetaRow({ label, values }: { label: string; values?: string[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</div>
      {values?.length ? (
        <div className="flex flex-wrap gap-1">
          {values.slice(0, 6).map((value) => (
            <span key={value} className="max-w-full truncate rounded-full border bg-background/70 px-1.5 py-0.5 text-[10px] leading-none">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/60">暂无</div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2 py-2">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function ToolChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function toProviderDraft(provider: ModelProviderConfig, overrides: Partial<ProviderDraftInput> = {}): ProviderDraftInput {
  return {
    id: provider.id,
    purpose: provider.purpose,
    providerKind: provider.providerKind,
    name: provider.name,
    protocol: provider.protocol,
    authMode: provider.authMode,
    baseUrl: provider.baseUrl,
    apiKey: "",
    clearApiKey: false,
    models: provider.models.map((model) => ({ ...model })),
    selectedModel: provider.selectedModel,
    enabled: provider.enabled,
    autoCompactThresholdPercent: provider.autoCompactThresholdPercent ?? DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT,
    ...overrides,
  };
}

type ProviderDraftFetchTarget = Pick<ProviderDraftInput, "id" | "purpose" | "providerKind" | "protocol" | "authMode" | "baseUrl" | "apiKey">;

function providerDraftFetchTarget(draft: ProviderDraftInput): ProviderDraftFetchTarget {
  return {
    id: draft.id,
    purpose: draft.purpose,
    providerKind: draft.providerKind,
    protocol: draft.protocol,
    authMode: draft.authMode,
    baseUrl: normalizeProviderDraftBaseUrl(draft.baseUrl),
    apiKey: draft.apiKey,
  };
}

function isSameProviderDraftFetchTarget(draft: ProviderDraftInput, target: ProviderDraftFetchTarget): boolean {
  const current = providerDraftFetchTarget(draft);
  return current.id === target.id
    && current.purpose === target.purpose
    && current.providerKind === target.providerKind
    && current.protocol === target.protocol
    && current.authMode === target.authMode
    && current.baseUrl === target.baseUrl
    && current.apiKey === target.apiKey;
}

function normalizeProviderDraftBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function selectedEnabledModel(selectedModel: string, models: ProviderModel[]): string {
  if (selectedModel && models.some((model) => model.id === selectedModel && model.enabled !== false)) return selectedModel;
  return models.find((model) => model.enabled !== false)?.id || "";
}

function toggleDraftModel(draft: ProviderDraftInput, modelId: string): ProviderDraftInput {
  const models = (draft.models || []).map((model) => (
    model.id === modelId ? { ...model, enabled: model.enabled === false } : model
  ));
  const selectedModel = selectedEnabledModel(draft.selectedModel === modelId ? "" : draft.selectedModel, models);
  return { ...draft, models, selectedModel };
}

function updateDraftModel(draft: ProviderDraftInput, nextModel: ProviderModel): ProviderDraftInput {
  const models = (draft.models || []).map((model) => (
    model.id === nextModel.id ? { ...nextModel } : model
  ));
  return { ...draft, models };
}

function removeDraftModel(draft: ProviderDraftInput, modelId: string): ProviderDraftInput {
  const models = (draft.models || []).filter((model) => model.id !== modelId);
  return {
    ...draft,
    models,
    selectedModel: selectedEnabledModel(draft.selectedModel === modelId ? "" : draft.selectedModel, models),
  };
}

function addDraftModel(draft: ProviderDraftInput, modelId: string): ProviderDraftInput {
  const normalizedId = modelId.trim();
  if (!normalizedId) return draft;
  const existing = draft.models || [];
  const models = existing.some((model) => model.id === normalizedId)
    ? existing.map((model) => (model.id === normalizedId ? { ...model, enabled: true } : model))
    : [...existing, withInferredContextWindow({ id: normalizedId, name: normalizedId, enabled: true })];
  return {
    ...draft,
    models,
    selectedModel: selectedEnabledModel(draft.selectedModel, models) || normalizedId,
  };
}

function mergeFetchedDraftModels(draft: ProviderDraftInput, fetchedModels: ProviderModel[]): ProviderDraftInput {
  const merged = new Map<string, ProviderModel>();
  for (const fetched of fetchedModels) {
    const model = withInferredContextWindow({ ...fetched });
    merged.set(model.id, model);
  }

  for (const existingModel of draft.models || []) {
    const existing = withInferredContextWindow({ ...existingModel });
    const fetched = merged.get(existing.id);
    if (!fetched) {
      merged.set(existing.id, existing);
      continue;
    }
    const userContextWindow = existing.contextWindowSource === "user" && existing.contextWindowTokens;
    merged.set(existing.id, {
      ...fetched,
      enabled: existing.enabled,
      supportsVision: fetched.supportsVision || existing.supportsVision,
      contextWindowTokens: userContextWindow ? existing.contextWindowTokens : fetched.contextWindowTokens ?? existing.contextWindowTokens,
      contextWindowSource: userContextWindow ? "user" : fetched.contextWindowSource ?? existing.contextWindowSource,
    });
  }

  const models = [...merged.values()];
  return {
    ...draft,
    models,
    selectedModel: selectedEnabledModel(draft.selectedModel, models),
  };
}

function applyProviderPreset(draft: ProviderDraftInput, providerKind: ProviderKind): ProviderDraftInput {
  const preset = PROVIDER_PRESETS[providerKind];
  const models = preset.purpose === "agent" || preset.purpose === "vision" ? [] : presetModels(providerKind);
  return {
    ...draft,
    purpose: preset.purpose,
    providerKind,
    protocol: preset.protocol,
    authMode: preset.authMode,
    baseUrl: preset.baseUrl,
    models,
    selectedModel: "",
    autoCompactThresholdPercent: preset.purpose === "agent"
      ? draft.autoCompactThresholdPercent ?? DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT
      : undefined,
  };
}

function presetModels(providerKind: ProviderKind): ProviderModel[] {
  const preset = PROVIDER_PRESETS[providerKind];
  if (!("models" in preset)) return [];
  return preset.models.map((model) => withInferredContextWindow({ ...model }));
}

function contextWindowFromInput(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const numeric = Number.parseInt(digits, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return tokens.toLocaleString();
}

function contextWindowSourceLabel(source: ProviderModel["contextWindowSource"]): string {
  if (source === "user") return "手动";
  if (source === "provider") return "服务商";
  if (source === "inferred") return "估算";
  return "配置";
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function providerKindLabel(providerKind: ProviderKind): string {
  return PROVIDER_PRESETS[providerKind]?.label || providerKind;
}

function isOfficialAgentProvider(provider: ModelProviderConfig): boolean {
  return provider.purpose === "agent" && isOfficialProvider(provider);
}

function isOfficialProvider(provider: ModelProviderConfig): boolean {
  return provider.id.startsWith(OFFICIAL_PROVIDER_ID_PREFIX);
}

function officialProviderGroupLabel(provider: ModelProviderConfig): string {
  const displayName = providerDisplayName(provider);
  const parts = displayName.split("·").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(" · ");
  const suffix = provider.id.slice(OFFICIAL_PROVIDER_ID_PREFIX.length);
  if (!suffix || suffix === "default") return "官方分组";
  const groupId = suffix.replace(/^(embedding|vision)-/, "");
  return groupId === "default" ? "官方分组" : `分组 #${groupId}`;
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
        <div className="rounded-md border border-amber-200/80 bg-amber-50/75 px-2.5 py-2 text-[11px] leading-5 text-amber-900">
          订阅套餐的日、周、月额度按对应周期刷新；重复购买同一订阅只延长到期时间，不会叠加当前周期额度。
        </div>
      )}
      {result.status === "gateway_failed" && (
        <div className="rounded-md border border-amber-200/80 bg-amber-50/75 px-2.5 py-2 text-[11px] leading-5 text-amber-900">
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
  return "已兑换";
}

function agentProviderSelectionValue(providerId: string, modelId: string): string {
  if (!providerId || !modelId) return "";
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function redeemKindLabel(kind: string): string {
  if (kind === "subscription") return "套餐";
  if (kind === "balance") return "积分";
  return kind || "兑换";
}

function redeemValueLabel(result: CloudRedeemCodeResult): string {
  const redemption = result.result.redemption;
  if (redemption.kind === "subscription") return `${redemption.validityDays || 0} 天`;
  return formatCloudPoints(redemption.value);
}

function redeemedPlanLabel(result: CloudRedeemCodeResult, groups: CloudGatewayGroup[]): string {
  const externalGroupId = result.result.redemption.externalGroupId;
  if (!externalGroupId) return "默认套餐";
  return groups.find((group) => group.externalGroupId === externalGroupId)?.name || "已兑换套餐";
}

type CapabilityKind = "embedding" | "vision";

function isBalanceEntitlementGroup(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): group is CloudBalanceGroupEntitlement {
  return "billingKind" in group && group.billingKind === "balance";
}

function isSubscriptionEntitlementGroup(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): group is CloudSubscriptionGroupEntitlement {
  return "billingKind" in group && group.billingKind === "subscription";
}

function capabilityGroupBillingLabel(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): string {
  if (isBalanceEntitlementGroup(group)) return "余额能力";
  if (isSubscriptionEntitlementGroup(group)) return "订阅能力";
  return planTypeLabel(group);
}

function isCloudCapabilityGroup(
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup,
  catalog: CloudGroupModelCatalogState | undefined,
  providers: ModelProviderConfig[],
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>,
): boolean {
  return isCapabilityGroup(group, catalog, providers, providerRefs) || hasCapabilityGroupTextHint(group);
}

function isCapabilityGroup(
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup,
  catalog: CloudGroupModelCatalogState | undefined,
  providers: ModelProviderConfig[],
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>,
): boolean {
  return groupCapabilityKinds(group, catalog, providers, providerRefs).length > 0;
}

function groupCapabilityKinds(
  group: CloudGatewayEntitlementGroup | CloudGatewayGroup,
  catalog: CloudGroupModelCatalogState | undefined,
  providers: ModelProviderConfig[],
  providerRefs: NonNullable<CloudAccountStatus["providerRefs"]>,
): CapabilityKind[] {
  const kinds = new Set<CapabilityKind>();
  const groupId = group.externalGroupId;
  for (const ref of providerRefs) {
    if (ref.externalGroupId !== groupId) continue;
    if (ref.purpose === "embedding" || ref.purpose === "vision") kinds.add(ref.purpose);
  }
  for (const provider of providers) {
    if (!isOfficialProvider(provider) || officialProviderExternalGroupId(provider) !== groupId) continue;
    if (provider.purpose === "embedding" || provider.purpose === "vision") kinds.add(provider.purpose);
  }
  const models = catalog?.models ?? [];
  if (models.some(isEmbeddingCloudModel)) kinds.add("embedding");
  const text = `${group.name} ${"description" in group ? group.description ?? "" : ""}`.toLowerCase();
  const namedVisionGroup = /vision|视觉|识别|ocr|image|图片/.test(text);
  if (models.some((model) => model.supportsVision || hasCloudModelCapability(model, "vision_input")) && (namedVisionGroup || kinds.has("embedding"))) {
    kinds.add("vision");
  }
  if (/embedding|embed|向量|知识库|rag/.test(text)) kinds.add("embedding");
  if (namedVisionGroup) kinds.add("vision");
  return [...kinds].sort((a, b) => (a === "embedding" ? -1 : 1) - (b === "embedding" ? -1 : 1));
}

function hasCapabilityGroupTextHint(group: CloudGatewayEntitlementGroup | CloudGatewayGroup): boolean {
  const text = `${group.name} ${"description" in group ? group.description ?? "" : ""} ${group.platform || ""} ${group.source || ""}`.toLowerCase();
  return /能力|capability|embedding|embed|向量|知识库|rag|vision|视觉|识别|ocr|image|图片/.test(text);
}

function activeCapabilityKinds(groupId: number, providers: ModelProviderConfig[], kinds: CapabilityKind[]): CapabilityKind[] {
  return kinds.filter((kind) =>
    providers.some((provider) =>
      provider.enabled &&
      provider.purpose === kind &&
      isOfficialProvider(provider) &&
      officialProviderExternalGroupId(provider) === groupId,
    ),
  );
}

function officialProviderExternalGroupId(provider: ModelProviderConfig): number {
  const suffix = provider.id.slice(OFFICIAL_PROVIDER_ID_PREFIX.length);
  const parts = suffix.split("-");
  const raw = parts[0] === "embedding" || parts[0] === "vision" ? parts.slice(1).join("-") : suffix;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isEmbeddingCloudModel(model: CloudProviderModel): boolean {
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

function planTypeLabel(group: CloudGatewayGroup): string {
  if (group.subscriptionType === "subscription") return "订阅套餐";
  if (group.subscriptionType === "standard") return "余额套餐";
  return group.subscriptionType || "套餐";
}

function cloudEntitlementUsable(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "" || normalized === "active";
}

function cloudEntitlementStatusLabel(status: string): string {
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

function planCardClass(current: boolean, usable: boolean): string {
  return cx(
    "rounded-lg border bg-card p-3 transition-colors",
    current && "border-emerald-200 bg-emerald-50/35 shadow-sm shadow-emerald-950/[0.03] ring-1 ring-emerald-100",
    !usable && "opacity-80",
  );
}

function formatMultiplier(value?: number | null): string {
  const multiplier = Number(value ?? 1);
  return `${Number.isFinite(multiplier) && multiplier > 0 ? multiplier.toFixed(multiplier % 1 === 0 ? 0 : 2) : "1"}x`;
}

function quotaRemainingPercent(window: CloudQuotaWindow): number {
  const limit = Number(window.limit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return clampPercent((Number(window.remaining || 0) / limit) * 100);
}

function balanceEntitlementLimit(group: CloudBalanceGroupEntitlement): number {
  const remaining = Math.max(0, Number(group.remaining || 0));
  const limit = Number(group.limit);
  if (!Number.isFinite(limit) || limit <= 0) return remaining;
  return Math.max(limit, remaining);
}

function balanceRemainingPercent(remaining: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return clampPercent((Math.max(0, Number(remaining || 0)) / limit) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  return `${Math.round(clampPercent(value))}%`;
}

function formatCompactPoints(value?: number | null): string {
  const amount = safeAmount(value);
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} 积分`;
}

function formatCloudPoints(value?: number | null): string {
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

function formatCloudDate(value?: string | null): string {
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

function cloudModelDisplayName(model: CloudProviderModel): string {
  return model.displayName || model.name || model.id;
}

function providerDisplayName(provider: ModelProviderConfig): string {
  const trimmed = provider.name.trim();
  const defaultMatch = /^(Agent|Embedding|Vision)\s+(\d+)$/i.exec(trimmed);
  if (!defaultMatch) return trimmed || "未命名服务商";
  const index = defaultMatch[2];
  if (provider.purpose === "embedding") return `Embedding ${index}`;
  if (provider.purpose === "vision") return `Vision ${index}`;
  return `Agent ${index}`;
}

function adapterLabel(providerKind: ProviderKind): string {
  const preset = PROVIDER_PRESETS[providerKind];
  if (preset.adapterKind === "anthropic") return "Anthropic Messages";
  if (preset.adapterKind === "openai_chat_completions") return "OpenAI Chat Completions";
  if (preset.adapterKind === "openai_responses") return "OpenAI Responses";
  return "OpenAI-compatible Embeddings";
}

function hasRunnableVisionProvider(providers: ModelProviderConfig[]): boolean {
  return providers.some((provider) =>
    provider.enabled &&
    Boolean(provider.selectedModel) &&
    provider.models.some((model) => model.id === provider.selectedModel && model.enabled !== false),
  );
}

function errorMessage(error: unknown, fallback = "操作失败。"): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.trim() || fallback;
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

function providerFetchErrorMessage(error: unknown): string {
  return errorMessage(error)
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
    .replace(/^Failed to fetch agent models:\s*/i, "")
    .replace(/^Failed to fetch embedding models:\s*/i, "");
}
