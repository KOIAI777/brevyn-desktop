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
  Database,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GitBranch,
  Info,
  KeyRound,
  Languages,
  Layers3,
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
  Sparkles,
  TerminalSquare,
  ToggleLeft,
  ToggleRight,
  Upload,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { UpdateStatusCard } from "@/components/settings/update/UpdateStatusCard";
import { VersionHistory } from "@/components/settings/update/VersionHistory";
import { getModelLogoById, getProviderBaseUrlLogo, getProviderKindLogo, getProviderProfileLogo } from "@/lib/model-provider-logo";
import { withInferredContextWindow } from "../../../shared/model-context-window";
import {
  AGENT_PROVIDER_PRESETS,
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
  type UpdaterStatus,
} from "../../../types/domain";
import { cx } from "@/lib/cn";

type SettingsPage = "general" | "providers" | "archive" | "skills" | "about";
type VisionTestKind = "calendar" | "timetable";
type VisionTestResult = RecognizedAcademicCalendar | RecognizedCourseTimetable;
type ProviderBusyAction =
  | "agent-save"
  | "agent-delete"
  | "agent-toggle"
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

const agentProviderKinds = Object.keys(AGENT_PROVIDER_PRESETS) as AgentProviderKind[];
const embeddingProviderKinds = Object.keys(EMBEDDING_PROVIDER_PRESETS) as EmbeddingProviderKind[];
const visionProviderKinds = Object.keys(VISION_PROVIDER_PRESETS) as VisionProviderKind[];

const SEMESTER_HOME_COURSE_ID = "semester-home";
const PROVIDER_PROFILE_ROW_HEIGHT_CLASS = "h-[72px]";
const PROVIDER_PROFILE_LIST_HEIGHT_CLASS = "max-h-[312px]";

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
  skills,
  gitStatus,
  onSkillsChange,
  onWorkspaceChanged,
  onClose,
}: {
  initialPage?: SettingsPage;
  course?: Course;
  semester?: SemesterWorkspace | null;
  skills: SkillItem[];
  gitStatus: GitStatus | null;
  onSkillsChange: (skills: SkillItem[]) => void;
  onWorkspaceChanged?: () => Promise<void> | void;
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
  const [reindexingActiveSemester, setReindexingActiveSemester] = useState(false);
  const [providerToast, setProviderToast] = useState<{ id: number; message: string } | null>(null);
  const [providerBusyActions, setProviderBusyActions] = useState<Partial<Record<ProviderBusyAction, boolean>>>({});
  const [agentGatewayStatus, setAgentGatewayStatus] = useState<AgentGatewayStatus | null>(null);
  const [agentGatewayBusy, setAgentGatewayBusy] = useState(false);
  const [localSkills, setLocalSkills] = useState(skills);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillStatusLine, setSkillStatusLine] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);
  const { confirm: confirmProviderAction, confirmDialog: providerConfirmDialog } = useConfirmDialog();
  const providerApiKeyLoadRequestRef = useRef(0);
  const embeddingApiKeyLoadRequestRef = useRef(0);
  const visionApiKeyLoadRequestRef = useRef(0);
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

  useEffect(() => {
    void loadProviders();
    void loadAgentGatewayStatus();
  }, []);

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

  async function loadAgentGatewayStatus() {
    try {
      setAgentGatewayStatus(await window.brevyn.agentGateway.status());
    } catch (error) {
      console.warn("[agent-gateway] Failed to load status", error);
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
    setProviderBusy("embedding-save", true);
    try {
      const result = await window.brevyn.providers.save({ ...embeddingDraft, purpose: "embedding", protocol: "openai_compatible" });
      const saved = result.provider;
      const next = await window.brevyn.providers.list();
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

  async function toggleEmbeddingProvider(provider: ModelProviderConfig) {
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
            {activePage === "general" ? (
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
  const chatProviders = providers.filter((provider) => provider.purpose === "agent");
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
  const embeddingBusy = isPurposeBlockingBusy("embedding");
  const visionBusy = isPurposeBlockingBusy("vision");
  const agentToggleBusy = isBusy("agent-toggle");
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

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="配置名称" value={embeddingDraft.name} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, name: value })} />
            <ReadOnlyField label="用途" value="向量" />
            <ProviderKindField purpose="embedding" value={embeddingDraft.providerKind as EmbeddingProviderKind} onChange={(value) => onEmbeddingDraftChange(applyProviderPreset(embeddingDraft, value))} />
            <ReadOnlyField label="适配器" value={adapterLabel(embeddingDraft.providerKind)} />
            <Field label="Base URL" value={embeddingDraft.baseUrl} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, baseUrl: value })} />
            <Field
              label="API Key"
              value={embeddingDraft.apiKey}
              onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, apiKey: value, clearApiKey: false })}
              type="password"
              placeholder={selectedEmbeddingProviderId ? "留空则不更新" : "输入 API Key"}
              icon={<KeyRound className="h-3 w-3" />}
            />
            <Field label="模型" value={embeddingDraft.selectedModel} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: value })} />
          </div>

          {(embeddingDraft.models?.length ?? 0) > 0 && (
            <ModelPicker
              providerKind={embeddingDraft.providerKind}
              baseUrl={embeddingDraft.baseUrl}
              selectedModel={embeddingDraft.selectedModel}
              models={embeddingDraft.models ?? []}
              onPick={(model) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: model.id })}
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
        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <PlugZap className="h-3.5 w-3.5" />
                Agent
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">这里只显示已保存的配置。</div>
            </div>
            <IconActionButton icon={<Plus className="h-3.5 w-3.5" />} label="新建 Agent" onClick={onNewProvider} disabled={agentBusy} />
          </div>

          <div className={cx(PROVIDER_PROFILE_LIST_HEIGHT_CLASS, "space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {chatProviders.map((provider) => (
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
            {chatProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">暂无 Agent 配置。新建后会显示在这里。</div>}
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
                                      {entry.threads.map((thread) => (
                                        <ArchivedThreadRow
                                          key={thread.id}
                                          thread={thread}
                                          restoreBlocked={restoreBlocked}
                                          busyKey={busyKey}
                                          selected={selectedKeys.has(archiveSelectionKey("thread", thread.id))}
                                          onSelect={(checked) => toggleSelection(archiveSelectionKey("thread", thread.id), checked)}
                                          onRestore={() => void restoreThread(thread, restoreBlocked)}
                                          onDelete={() => void deleteThread(thread)}
                                        />
                                      ))}
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
    const byName = (a: SkillItem, b: SkillItem) => a.name.localeCompare(b.name);
    return {
      enabled: skills.filter((skill) => skill.enabled).sort(byName),
      disabled: skills.filter((skill) => !skill.enabled).sort(byName),
    };
  }, [skills]);
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
          <SkillListGroup
            title="已启用"
            count={groupedSkills.enabled.length}
            skills={groupedSkills.enabled}
            selectedSkillId={selectedSkillId}
            onSelectSkill={onSelectSkill}
            onToggleSkill={onToggleSkill}
          />
          <SkillListGroup
            title="已停用"
            count={groupedSkills.disabled.length}
            skills={groupedSkills.disabled}
            selectedSkillId={selectedSkillId}
            onSelectSkill={onSelectSkill}
            onToggleSkill={onToggleSkill}
          />
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
  count,
  skills,
  selectedSkillId,
  onSelectSkill,
  onToggleSkill,
}: {
  title: string;
  count: number;
  skills: SkillItem[];
  selectedSkillId: string;
  onSelectSkill: (skillId: string) => void;
  onToggleSkill: (skill: SkillItem) => void;
}) {
  return (
    <div>
      <div className="flex h-8 items-center justify-between border-b border-border/55 bg-muted/35 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span>{title}</span>
        <span className="tabular-nums">{count}</span>
      </div>
      {skills.length === 0 ? (
        <div className="px-3 py-5 text-center text-[11px] text-muted-foreground">暂无</div>
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
  );
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
          <IconActionButton icon={<Pencil className="h-3.5 w-3.5" />} label={`编辑 ${displayName}`} onClick={onEdit} disabled={actionsDisabled} />
          <IconActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label={`删除 ${displayName}`} onClick={onDelete} disabled={actionsDisabled} danger />
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  icon?: ReactNode;
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
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/55"
          type={inputType}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? "隐藏 API Key" : "显示 API Key"}
            title={passwordVisible ? "隐藏 API Key" : "显示 API Key"}
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

function ProviderKindField({
  purpose,
  value,
  onChange,
}: {
  purpose: ProviderPurpose;
  value: ProviderKind;
  onChange: (value: ProviderKind) => void;
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
}: {
  providerKind: ProviderKind;
  baseUrl: string;
  models: ProviderModel[];
  selectedModel: string;
  onPick: (model: ProviderModel) => void;
}) {
  if (models.length === 0) return null;
  const fallbackLogo = getProviderBaseUrlLogo(baseUrl, providerKind);
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
                selected
                  ? "border-foreground/25 bg-foreground text-background shadow-sm"
                  : "border-border/55 bg-background text-muted-foreground hover:border-border/80 hover:text-foreground",
              )}
              onClick={() => onPick(model)}
            >
              <span className={cx("relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", selected ? "border-background/20 bg-background/16" : "border-border/55 bg-background")}>
                <img src={getModelLogoById(model.id) || fallbackLogo} alt="" className="h-4.5 w-4.5 object-contain" />
                {selected && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-foreground shadow-sm">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate font-medium", selected ? "text-background" : "text-foreground")}>{model.name}</span>
                <span className={cx("block truncate text-[10px]", selected ? "text-background/72" : "text-muted-foreground")}>{model.id}</span>
                {model.contextWindowTokens && (
                  <span className={cx("mt-0.5 block text-[10px]", selected ? "text-background/70" : "text-muted-foreground")}>
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
  const logo = getModelLogoById(model.id) || getProviderBaseUrlLogo(baseUrl, providerKind);
  return (
    <div className={cx("grid min-w-0 grid-cols-[auto_minmax(0,1fr)_7.5rem_auto_auto] items-center gap-2 rounded-md border px-2 py-2 text-[11px] transition-colors", selected ? "border-foreground/25 bg-muted text-foreground" : "border-border/55 bg-card text-muted-foreground")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/45 bg-background p-1 shadow-sm">
        <img src={logo} alt="" className="h-5 w-5 object-contain" />
      </span>
      <button type="button" className="min-w-0 text-left" onClick={onMakeDefault} disabled={!onMakeDefault} title={model.id}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{model.name}</span>
          {selected && <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[9px] text-background">默认</span>}
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

function ActionButton({ icon, label, onClick, primary, disabled }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45", primary ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
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

function providerFetchErrorMessage(error: unknown): string {
  return errorMessage(error)
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
    .replace(/^Failed to fetch agent models:\s*/i, "")
    .replace(/^Failed to fetch embedding models:\s*/i, "");
}
