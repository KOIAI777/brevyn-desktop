import {
  ArrowLeft,
  Archive,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  Database,
  Eye,
  ExternalLink,
  Info,
  KeyRound,
  Languages,
  LogOut,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AboutUpdateSettingsPage } from "@/components/settings/about/AboutUpdateSettingsPage";
import { ArchiveSettingsPage } from "@/components/settings/archive/ArchiveSettingsPage";
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
  cloudModelDisplayName,
  formatCloudPoints,
  isCloudCapabilityGroup,
  officialProviderExternalGroupId,
  type CloudGroupModelCatalogState,
} from "@/components/settings/account/cloudPlanUtils";
import { GeneralSettingsPage } from "@/components/settings/general/GeneralSettingsPage";
import {
  PROVIDER_PROFILE_LIST_HEIGHT_CLASS,
  isOfficialProvider,
  officialProviderGroupLabel,
  providerDisplayName,
  providerKindLabel,
} from "@/components/settings/providers/providerUtils";
import {
  ModelPicker,
  ProviderProfileRow,
} from "@/components/settings/providers/ProviderControls";
import { AgentProviderEditor, EmbeddingProviderEditor, VisionProviderEditor } from "@/components/settings/providers/ProviderEditors";
import { AgentGatewayAdvancedPanel, OfficialModelList, OfficialProviderPanel, VisionTestResultPanel } from "@/components/settings/providers/ProviderPanels";
import { SkillSettingsPage } from "@/components/settings/skills/SkillSettingsPage";
import {
  ActionButton,
  CloudAuthStep,
  Field,
  IconActionButton,
  MiniMetric,
  ReadOnlyField,
} from "@/components/settings/shared/SettingsControls";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import { profileDisplayName, USER_AVATAR_OPTIONS, UserAvatar } from "@/lib/user-profile";
import { withInferredContextWindow } from "../../../shared/model-context-window";
import {
  AGENT_PROVIDER_PRESETS,
  type CloudAccountStatus,
  type CloudAuthMode,
  type CloudGatewayGroup,
  type CloudProviderModel,
  type CloudRedeemCodeResult,
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
      <AgentProviderEditor
        runtimeBanner={runtimeBanner}
        creatingProvider={creatingProvider}
        selectedProvider={selectedProvider}
        selectedProviderId={selectedProviderId}
        draft={draft}
        manualAgentModel={manualAgentModel}
        statusLine={statusLine}
        agentBusy={agentBusy}
        isBusy={isBusy}
        adapterLabel={adapterLabel}
        onClose={onCloseProviderEditor}
        onDeleteProvider={onDeleteProvider}
        onDraftChange={onDraftChange}
        onProviderKindChange={(value) => onDraftChange(applyProviderPreset(draft, value))}
        onManualAgentModelChange={setManualAgentModel}
        onAddManualAgentModel={addManualAgentModel}
        onToggleModel={(model) => onDraftChange(toggleDraftModel(draft, model.id))}
        onMakeDefaultModel={(model) => onDraftChange({ ...draft, selectedModel: model.id })}
        onUpdateModel={(model) => onDraftChange(updateDraftModel(draft, model))}
        onRemoveModel={(model) => onDraftChange(removeDraftModel(draft, model.id))}
        onFetchModels={onFetchModels}
        onTestProvider={onTestProvider}
        onSaveProvider={onSaveProvider}
      />
    );
  }

  if (embeddingEditorOpen) {
    return (
      <EmbeddingProviderEditor
        runtimeBanner={runtimeBanner}
        creatingEmbeddingProvider={creatingEmbeddingProvider}
        selectedEmbeddingProvider={selectedEmbeddingProvider}
        selectedEmbeddingProviderId={selectedEmbeddingProviderId}
        embeddingDraft={embeddingDraft}
        embeddingLockedByIndexing={embeddingLockedByIndexing}
        embeddingStatusLine={embeddingStatusLine}
        embeddingBusy={embeddingBusy}
        isBusy={isBusy}
        adapterLabel={adapterLabel}
        onClose={onCloseEmbeddingEditor}
        onDeleteEmbeddingProvider={onDeleteEmbeddingProvider}
        onEmbeddingDraftChange={onEmbeddingDraftChange}
        onProviderKindChange={(value) => onEmbeddingDraftChange(applyProviderPreset(embeddingDraft, value))}
        onFetchEmbeddingModels={onFetchEmbeddingModels}
        onTestEmbeddingProvider={onTestEmbeddingProvider}
        onSaveEmbeddingProvider={onSaveEmbeddingProvider}
      />
    );
  }

  if (visionEditorOpen) {
    return (
      <VisionProviderEditor
        runtimeBanner={runtimeBanner}
        creatingVisionProvider={creatingVisionProvider}
        selectedVisionProvider={selectedVisionProvider}
        selectedVisionProviderId={selectedVisionProviderId}
        visionDraft={visionDraft}
        manualVisionModel={manualVisionModel}
        visionStatusLine={visionStatusLine}
        visionBusy={visionBusy}
        isBusy={isBusy}
        adapterLabel={adapterLabel}
        onClose={onCloseVisionEditor}
        onDeleteVisionProvider={onDeleteVisionProvider}
        onVisionDraftChange={onVisionDraftChange}
        onProviderKindChange={(value) => onVisionDraftChange(applyProviderPreset(visionDraft, value))}
        onManualVisionModelChange={setManualVisionModel}
        onAddManualVisionModel={addManualVisionModel}
        onToggleModel={(model) => onVisionDraftChange(toggleDraftModel(visionDraft, model.id))}
        onMakeDefaultModel={(model) => onVisionDraftChange({ ...visionDraft, selectedModel: model.id })}
        onUpdateModel={(model) => onVisionDraftChange(updateDraftModel(visionDraft, model))}
        onRemoveModel={(model) => onVisionDraftChange(removeDraftModel(visionDraft, model.id))}
        onFetchVisionModels={onFetchVisionModels}
        onTestVisionProvider={onTestVisionProvider}
        onSaveVisionProvider={onSaveVisionProvider}
      />
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

function isOfficialAgentProvider(provider: ModelProviderConfig): boolean {
  return provider.purpose === "agent" && isOfficialProvider(provider);
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
