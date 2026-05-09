import {
  ArrowLeft,
  Archive,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  Circle,
  Database,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GitBranch,
  KeyRound,
  Layers3,
  MessageSquare,
  PlugZap,
  Plus,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
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
import {
  AGENT_PROVIDER_PRESETS,
  EMBEDDING_PROVIDER_PRESETS,
  PROVIDER_PRESETS,
  type AgentProviderKind,
  type EmbeddingProviderKind,
  type Course,
  type GitStatus,
  type ModelProviderConfig,
  type ProviderDraftInput,
  type ProviderKind,
  type ProviderModel,
  type ProviderPurpose,
  type ProviderSaveResult,
  type SemesterWorkspace,
  type SkillItem,
  type Thread,
} from "../../../types/domain";
import { cx } from "@/lib/cn";

type SettingsPage = "providers" | "archive" | "skills";
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
  | "embedding-test";

const agentProviderKinds = Object.keys(AGENT_PROVIDER_PRESETS) as AgentProviderKind[];
const embeddingProviderKinds = Object.keys(EMBEDDING_PROVIDER_PRESETS) as EmbeddingProviderKind[];

const SEMESTER_HOME_COURSE_ID = "semester-home";

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
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [creatingEmbeddingProvider, setCreatingEmbeddingProvider] = useState(false);
  const [draft, setDraft] = useState<ProviderDraftInput>(emptyDraft);
  const [embeddingDraft, setEmbeddingDraft] = useState<ProviderDraftInput>(emptyEmbeddingDraft);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<ProviderModel[]>([]);
  const [statusLine, setStatusLine] = useState("");
  const [embeddingStatusLine, setEmbeddingStatusLine] = useState("");
  const [embeddingReindexNotice, setEmbeddingReindexNotice] = useState("");
  const [reindexingActiveSemester, setReindexingActiveSemester] = useState(false);
  const [providerToast, setProviderToast] = useState<{ id: number; message: string } | null>(null);
  const [providerBusyActions, setProviderBusyActions] = useState<Partial<Record<ProviderBusyAction, boolean>>>({});
  const [localSkills, setLocalSkills] = useState(skills);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillStatusLine, setSkillStatusLine] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);
  const providerApiKeyLoadRequestRef = useRef(0);
  const embeddingApiKeyLoadRequestRef = useRef(0);

  const enabledSkills = localSkills.filter((skill) => skill.enabled).length;
  const chatProviders = providers.filter((provider) => provider.purpose === "agent");
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const activeAgentProviders = chatProviders.filter((provider) => provider.enabled);
  const activeEmbeddingProviders = embeddingProviders.filter((provider) => provider.enabled);
  const enabledProviders = activeAgentProviders.length;
  const activeEmbeddingProvider = activeEmbeddingProviders.length === 1 ? activeEmbeddingProviders[0] : undefined;
  const embeddingProviderDetail = activeEmbeddingProviders.length > 1
    ? "multiple embedding providers"
    : activeEmbeddingProvider?.selectedModel || "embedding TBD";

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    setLocalSkills(skills);
  }, [skills]);

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
    void window.uclaw.providers
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
    void window.uclaw.providers
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
    void window.uclaw.skills
      .list()
      .then(setLocalSkills)
      .catch((error) => setSkillStatusLine(`Failed to load skills: ${errorMessage(error)}`));
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
    void window.uclaw.skills
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
      const result = await window.uclaw.providers.list();
      setProviders(result);
      closeProviderEditor();
      closeEmbeddingEditor();
      setStatusLine("");
      setEmbeddingStatusLine("");
    } catch (error) {
      setProviders([]);
      const message = errorMessage(error, "Failed to load providers.");
      setStatusLine(message);
      setEmbeddingStatusLine(message);
    }
  }

  function selectProvider(provider: ModelProviderConfig) {
    closeEmbeddingEditor();
    setCreatingProvider(false);
    setSelectedProviderId(provider.id);
    setDraft(toProviderDraft(provider));
    setModels([]);
    setStatusLine("");
  }

  function selectEmbeddingProvider(provider: ModelProviderConfig) {
    closeProviderEditor();
    setCreatingEmbeddingProvider(false);
    setSelectedEmbeddingProviderId(provider.id);
    setEmbeddingDraft(toProviderDraft(provider));
    setEmbeddingModels([]);
    setEmbeddingStatusLine("");
  }

  function newProvider() {
    closeEmbeddingEditor();
    setCreatingProvider(true);
    setSelectedProviderId("");
    setDraft({ ...emptyDraft, name: nextProviderDraftName(providers, "agent") });
    setModels([]);
    setStatusLine("");
  }

  function newEmbeddingProvider() {
    closeProviderEditor();
    setCreatingEmbeddingProvider(true);
    setSelectedEmbeddingProviderId("");
    setEmbeddingDraft({ ...emptyEmbeddingDraft, name: nextProviderDraftName(providers, "embedding") });
    setEmbeddingModels([]);
    setEmbeddingStatusLine("");
  }

  function closeProviderEditor() {
    setCreatingProvider(false);
    setSelectedProviderId("");
    setDraft({ ...emptyDraft });
    setModels([]);
  }

  function closeEmbeddingEditor() {
    setCreatingEmbeddingProvider(false);
    setSelectedEmbeddingProviderId("");
    setEmbeddingDraft({ ...emptyEmbeddingDraft });
    setEmbeddingModels([]);
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
    setEmbeddingReindexNotice("Embedding provider, URL, or model changed. Existing RAG indexes may have been built with the previous embedding configuration.");
  }

  async function reindexActiveSemester() {
    setReindexingActiveSemester(true);
    try {
      const result = await window.uclaw.files.indexActiveSemester();
      const queued = result.jobs.filter((job) => job.status === "queued" || job.status === "indexing").length;
      const failed = result.failures.length;
      if (failed > 0) {
        const summary = result.failures.slice(0, 2).map((failure) => `${failure.courseName}: ${failure.message}`).join("; ");
        const suffix = result.failures.length > 2 ? `; +${result.failures.length - 2} more` : "";
        setEmbeddingReindexNotice(`Some workspaces failed to queue. ${summary}${suffix}. Fix the issue if needed, then retry.`);
        setEmbeddingStatusLine(`Re-index queued for ${queued} active workspace${queued === 1 ? "" : "s"}; ${failed} failed.`);
      } else {
        setEmbeddingReindexNotice("");
        setEmbeddingStatusLine(`Re-index queued for ${queued} active workspace${queued === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setEmbeddingReindexNotice("Re-index could not start. Fix the issue, then retry.");
      setEmbeddingStatusLine(`Re-index failed: ${errorMessage(error)}`);
    } finally {
      setReindexingActiveSemester(false);
    }
  }

  async function saveProvider() {
    setProviderBusy("agent-save", true);
    try {
      const result = await window.uclaw.providers.save({ ...draft, purpose: "agent", protocol: "anthropic_messages" });
      const saved = result.provider;
      const next = await window.uclaw.providers.list();
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
      showProviderToast("Provider saved.");
    } catch (error) {
      setStatusLine(`Failed to save provider profile: ${errorMessage(error)}`);
    } finally {
      setProviderBusy("agent-save", false);
    }
  }

  async function deleteProvider(provider: ModelProviderConfig) {
    const ok = window.confirm(`Delete provider profile "${provider.name}"?`);
    if (!ok) return;
    setProviderBusy("agent-delete", true);
    try {
      await window.uclaw.providers.delete(provider.id);
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeProviderEditor();
      setStatusLine(`Deleted provider profile "${provider.name}".`);
    } catch (error) {
      setStatusLine(`Failed to delete provider profile: ${errorMessage(error)}`);
    } finally {
      setProviderBusy("agent-delete", false);
    }
  }

  async function saveEmbeddingProvider() {
    setProviderBusy("embedding-save", true);
    try {
      const result = await window.uclaw.providers.save({ ...embeddingDraft, purpose: "embedding", protocol: "openai_compatible" });
      const saved = result.provider;
      const next = await window.uclaw.providers.list();
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
      await handleEmbeddingIndexNotice(result, "Embedding provider saved.");
    } catch (error) {
      setEmbeddingStatusLine(`Failed to save embedding provider: ${errorMessage(error)}`);
    } finally {
      setProviderBusy("embedding-save", false);
    }
  }

  async function deleteEmbeddingProvider(provider: ModelProviderConfig) {
    const ok = window.confirm(`Delete embedding provider profile "${provider.name}"?`);
    if (!ok) return;
    setProviderBusy("embedding-delete", true);
    try {
      await window.uclaw.providers.delete(provider.id);
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeEmbeddingEditor();
      setEmbeddingStatusLine(`Deleted embedding provider profile "${provider.name}".`);
    } catch (error) {
      setEmbeddingStatusLine(`Failed to delete embedding provider: ${errorMessage(error)}`);
    } finally {
      setProviderBusy("embedding-delete", false);
    }
  }

  async function toggleProvider(provider: ModelProviderConfig) {
    setProviderBusy("agent-toggle", true);
    try {
      const result = await window.uclaw.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const saved = result.provider;
      const next = await window.uclaw.providers.list();
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
      const result = await window.uclaw.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const saved = result.provider;
      const next = await window.uclaw.providers.list();
      setProviders(next);
      if (provider.id === selectedEmbeddingProviderId) selectEmbeddingProvider(saved);
      await handleEmbeddingIndexNotice(result, `Updated embedding provider "${saved.name}".`);
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("embedding-toggle", false);
    }
  }

  async function fetchModels() {
    if (!selectedProviderId) {
      setStatusLine("Save provider before fetching models.");
      return;
    }
    setProviderBusy("agent-fetch", true);
    try {
      setModels(await window.uclaw.providers.models(selectedProviderId));
      setStatusLine("Fetched available models.");
    } catch (error) {
      setModels([]);
      setStatusLine(`Failed to fetch agent models: ${errorMessage(error)}`);
    } finally {
      setProviderBusy("agent-fetch", false);
    }
  }

  async function fetchEmbeddingModels() {
    if (!selectedEmbeddingProviderId) {
      setEmbeddingStatusLine("Save embedding provider before fetching models.");
      return;
    }
    setProviderBusy("embedding-fetch", true);
    try {
      setEmbeddingModels(await window.uclaw.providers.models(selectedEmbeddingProviderId));
      setEmbeddingStatusLine("Fetched embedding models.");
    } catch (error) {
      setEmbeddingModels([]);
      setEmbeddingStatusLine(`Failed to fetch embedding models: ${errorMessage(error)}`);
    } finally {
      setProviderBusy("embedding-fetch", false);
    }
  }

  async function testProvider() {
    if (!selectedProviderId) {
      setStatusLine("Save provider before testing connection.");
      return;
    }
    setProviderBusy("agent-test", true);
    try {
      const result = await window.uclaw.providers.test(selectedProviderId);
      setStatusLine(`${result.ok ? "Connected" : "Failed"} · ${result.latencyMs}ms · ${result.message}`);
    } catch (error) {
      setStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("agent-test", false);
    }
  }

  async function testEmbeddingProvider() {
    if (!selectedEmbeddingProviderId) {
      setEmbeddingStatusLine("Save embedding provider before testing connection.");
      return;
    }
    setProviderBusy("embedding-test", true);
    try {
      const result = await window.uclaw.providers.test(selectedEmbeddingProviderId);
      setEmbeddingStatusLine(`${result.ok ? "Connected" : "Failed"} · ${result.latencyMs}ms · ${result.message}`);
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
    } finally {
      setProviderBusy("embedding-test", false);
    }
  }

  async function toggleSkill(skill: SkillItem) {
    setSkillBusy(true);
    try {
      const updated = await window.uclaw.skills.update({ id: skill.id, enabled: !skill.enabled });
      const next = localSkills.map((item) => (item.id === updated.id ? updated : item));
      setLocalSkills(next);
      onSkillsChange(next);
      setSkillStatusLine(`${updated.enabled ? "Enabled" : "Disabled"} ${updated.name}.`);
    } catch (error) {
      setSkillStatusLine(errorMessage(error, "Failed to update skill."));
    } finally {
      setSkillBusy(false);
    }
  }

  async function saveSkillContent() {
    if (!selectedSkillId) return;
    setSkillBusy(true);
    try {
      if (!skillContent.trim()) {
        setSkillStatusLine("SKILL.md cannot be saved empty.");
        return;
      }
      const updated = await window.uclaw.skills.writeContent({ id: selectedSkillId, content: skillContent });
      const next = localSkills.map((item) => (item.id === updated.id ? updated : item));
      setLocalSkills(next);
      onSkillsChange(next);
      setSkillStatusLine("Saved SKILL.md.");
    } catch (error) {
      setSkillStatusLine(errorMessage(error));
    } finally {
      setSkillBusy(false);
    }
  }

  async function importSkillFolder() {
    setSkillBusy(true);
    try {
      const imported = await window.uclaw.skills.importFolder({});
      const next = await window.uclaw.skills.list();
      setLocalSkills(next);
      onSkillsChange(next);
      setSelectedSkillId(imported.id);
      setSkillStatusLine(`Imported ${imported.name}.`);
    } catch (error) {
      setSkillStatusLine(errorMessage(error));
    } finally {
      setSkillBusy(false);
    }
  }

  async function openSkillFolder(skillId: string) {
    if (!skillId) return;
    try {
      await window.uclaw.skills.openFolder(skillId);
      setSkillStatusLine("Opened skill folder.");
    } catch (error) {
      setSkillStatusLine(errorMessage(error));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-6 backdrop-blur-sm">
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
              Settings
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{course?.name || "UCLAW"} · {semester?.term || "no semester selected"} · model config, archive, skills</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
          <aside className="border-r bg-background/45 p-3">
            <div className="space-y-1.5">
              <SettingsNavButton
                active={activePage === "providers"}
                icon={<PlugZap className="h-4 w-4" />}
                title="模型配置"
                detail={`${enabledProviders} active · ${embeddingProviderDetail}`}
                onClick={() => setActivePage("providers")}
              />
              <SettingsNavButton
                active={activePage === "archive"}
                icon={<Archive className="h-4 w-4" />}
                title="Archive"
                detail="restore / permanent delete"
                onClick={() => setActivePage("archive")}
              />
              <SettingsNavButton
                active={activePage === "skills"}
                icon={<Sparkles className="h-4 w-4" />}
                title="Skill"
                detail={`${enabledSkills}/${localSkills.length} enabled`}
                onClick={() => setActivePage("skills")}
              />
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4 uclaw-scrollbar">
            {activePage === "providers" ? (
              <ProviderSettingsPage
                providers={providers}
                selectedProviderId={selectedProviderId}
                selectedEmbeddingProviderId={selectedEmbeddingProviderId}
                creatingProvider={creatingProvider}
                creatingEmbeddingProvider={creatingEmbeddingProvider}
                draft={draft}
                embeddingDraft={embeddingDraft}
                models={models}
                embeddingModels={embeddingModels}
                statusLine={statusLine}
                embeddingStatusLine={embeddingStatusLine}
                embeddingReindexNotice={embeddingReindexNotice}
                reindexingActiveSemester={reindexingActiveSemester}
                busyActions={providerBusyActions}
                onSelectProvider={selectProvider}
                onSelectEmbeddingProvider={selectEmbeddingProvider}
                onNewProvider={newProvider}
                onNewEmbeddingProvider={newEmbeddingProvider}
                onCloseProviderEditor={closeProviderEditor}
                onCloseEmbeddingEditor={closeEmbeddingEditor}
                onToggleProvider={toggleProvider}
                onToggleEmbeddingProvider={toggleEmbeddingProvider}
                onDeleteProvider={(provider) => void deleteProvider(provider)}
                onDeleteEmbeddingProvider={(provider) => void deleteEmbeddingProvider(provider)}
                onDraftChange={setDraft}
                onEmbeddingDraftChange={setEmbeddingDraft}
                onFetchModels={fetchModels}
                onFetchEmbeddingModels={fetchEmbeddingModels}
                onTestProvider={testProvider}
                onTestEmbeddingProvider={testEmbeddingProvider}
                onSaveProvider={saveProvider}
                onSaveEmbeddingProvider={saveEmbeddingProvider}
                onReindexActiveSemester={() => void reindexActiveSemester()}
                onDismissEmbeddingReindexNotice={() => setEmbeddingReindexNotice("")}
              />
            ) : activePage === "archive" ? (
              <ArchiveSettingsPage onWorkspaceChanged={onWorkspaceChanged} />
            ) : (
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
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ProviderSettingsPage({
  providers,
  selectedProviderId,
  selectedEmbeddingProviderId,
  creatingProvider,
  creatingEmbeddingProvider,
  draft,
  embeddingDraft,
  models,
  embeddingModels,
  statusLine,
  embeddingStatusLine,
  embeddingReindexNotice,
  reindexingActiveSemester,
  busyActions,
  onSelectProvider,
  onSelectEmbeddingProvider,
  onNewProvider,
  onNewEmbeddingProvider,
  onCloseProviderEditor,
  onCloseEmbeddingEditor,
  onToggleProvider,
  onToggleEmbeddingProvider,
  onDeleteProvider,
  onDeleteEmbeddingProvider,
  onDraftChange,
  onEmbeddingDraftChange,
  onFetchModels,
  onFetchEmbeddingModels,
  onTestProvider,
  onTestEmbeddingProvider,
  onSaveProvider,
  onSaveEmbeddingProvider,
  onReindexActiveSemester,
  onDismissEmbeddingReindexNotice,
}: {
  providers: ModelProviderConfig[];
  selectedProviderId: string;
  selectedEmbeddingProviderId: string;
  creatingProvider: boolean;
  creatingEmbeddingProvider: boolean;
  draft: ProviderDraftInput;
  embeddingDraft: ProviderDraftInput;
  models: ProviderModel[];
  embeddingModels: ProviderModel[];
  statusLine: string;
  embeddingStatusLine: string;
  embeddingReindexNotice: string;
  reindexingActiveSemester: boolean;
  busyActions: Partial<Record<ProviderBusyAction, boolean>>;
  onSelectProvider: (provider: ModelProviderConfig) => void;
  onSelectEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onNewProvider: () => void;
  onNewEmbeddingProvider: () => void;
  onCloseProviderEditor: () => void;
  onCloseEmbeddingEditor: () => void;
  onToggleProvider: (provider: ModelProviderConfig) => void;
  onToggleEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDeleteProvider: (provider: ModelProviderConfig) => void;
  onDeleteEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDraftChange: (draft: ProviderDraftInput) => void;
  onEmbeddingDraftChange: (draft: ProviderDraftInput) => void;
  onFetchModels: () => void;
  onFetchEmbeddingModels: () => void;
  onTestProvider: () => void;
  onTestEmbeddingProvider: () => void;
  onSaveProvider: () => void;
  onSaveEmbeddingProvider: () => void;
  onReindexActiveSemester: () => void;
  onDismissEmbeddingReindexNotice: () => void;
}) {
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedEmbeddingProvider = providers.find((provider) => provider.id === selectedEmbeddingProviderId);
  const chatProviders = providers.filter((provider) => provider.purpose === "agent");
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const providerEditorOpen = creatingProvider || Boolean(selectedProvider);
  const embeddingEditorOpen = creatingEmbeddingProvider || Boolean(selectedEmbeddingProvider);
  const runtimeBanner = null;
  const isBusy = (action: ProviderBusyAction) => Boolean(busyActions[action]);
  const isPurposeBlockingBusy = (purpose: ProviderPurpose) => {
    const prefix = purpose === "agent" ? "agent" : "embedding";
    return Object.entries(busyActions).some(([action, busy]) => Boolean(busy) && action.startsWith(`${prefix}-`) && action !== `${prefix}-toggle`);
  };
  const agentBusy = isPurposeBlockingBusy("agent");
  const embeddingBusy = isPurposeBlockingBusy("embedding");
  const agentToggleBusy = isBusy("agent-toggle");
  const embeddingToggleBusy = isBusy("embedding-toggle");

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
                Back to providers
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PlugZap className="h-4 w-4" />
                {creatingProvider ? "New Agent Provider" : `Edit Agent Provider · ${selectedProvider?.name || "Provider"}`}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Chat, multimodal recognition, and tool-call responses.</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={() => onDeleteProvider(selectedProvider)} disabled={agentBusy} />}
            </div>
          </div>

          {creatingProvider && (
            <div className="mb-4 rounded-md border border-dashed bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
              This provider is not saved yet. Fill it out, then save to add it to the Agent list.
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Profile name" value={draft.name} onChange={(value) => onDraftChange({ ...draft, name: value })} />
            <ReadOnlyField label="Purpose" value="Agent" />
            <ProviderKindField purpose="agent" value={draft.providerKind as AgentProviderKind} onChange={(value) => onDraftChange(applyProviderPreset(draft, value))} />
            <ReadOnlyField label="Adapter" value={adapterLabel(draft.providerKind)} />
            <Field label="Base URL" value={draft.baseUrl} onChange={(value) => onDraftChange({ ...draft, baseUrl: value })} />
            <Field
              label="API Key"
              value={draft.apiKey}
              onChange={(value) => onDraftChange({ ...draft, apiKey: value, clearApiKey: false })}
              type="password"
              placeholder={selectedProviderId ? "留空则不更新" : "输入 API Key"}
              icon={<KeyRound className="h-3 w-3" />}
            />
            <Field label="Model" value={draft.selectedModel} onChange={(value) => onDraftChange({ ...draft, selectedModel: value })} />
          </div>

          {models.length > 0 && (
            <ModelPicker
              purpose="agent"
              models={models}
              onPick={(model) => onDraftChange({ ...draft, selectedModel: model.id, models })}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", isBusy("agent-fetch") && "animate-spin")} />} label="Get models" onClick={onFetchModels} disabled={agentBusy} />
            <ActionButton icon={<PlugZap className={cx("h-3.5 w-3.5", isBusy("agent-test") && "animate-pulse")} />} label="Test" onClick={onTestProvider} disabled={agentBusy} />
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("agent-save") && "animate-pulse")} />} label="Save" onClick={onSaveProvider} primary disabled={agentBusy} />
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
                Back to providers
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4" />
                {creatingEmbeddingProvider ? "New Embedding Provider" : `Edit Embedding Provider · ${selectedEmbeddingProvider?.name || "Provider"}`}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">RAG search, course file indexing, and context retrieval.</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedEmbeddingProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={() => onDeleteEmbeddingProvider(selectedEmbeddingProvider)} disabled={embeddingBusy} />}
            </div>
          </div>

          {creatingEmbeddingProvider && (
            <div className="mb-4 rounded-md border border-dashed bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
              This embedding provider is not saved yet. Save it to add it to the Embedding list.
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Profile name" value={embeddingDraft.name} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, name: value })} />
            <ReadOnlyField label="Purpose" value="Embedding" />
            <ProviderKindField purpose="embedding" value={embeddingDraft.providerKind as EmbeddingProviderKind} onChange={(value) => onEmbeddingDraftChange(applyProviderPreset(embeddingDraft, value))} />
            <ReadOnlyField label="Adapter" value={adapterLabel(embeddingDraft.providerKind)} />
            <Field label="Base URL" value={embeddingDraft.baseUrl} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, baseUrl: value })} />
            <Field
              label="API Key"
              value={embeddingDraft.apiKey}
              onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, apiKey: value, clearApiKey: false })}
              type="password"
              placeholder={selectedEmbeddingProviderId ? "留空则不更新" : "输入 API Key"}
              icon={<KeyRound className="h-3 w-3" />}
            />
            <Field label="Model" value={embeddingDraft.selectedModel} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: value })} />
          </div>

          {embeddingModels.length > 0 && (
            <ModelPicker
              purpose="embedding"
              models={embeddingModels}
              onPick={(model) => onEmbeddingDraftChange({ ...embeddingDraft, selectedModel: model.id, models: embeddingModels })}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", isBusy("embedding-fetch") && "animate-spin")} />} label="Get models" onClick={onFetchEmbeddingModels} disabled={embeddingBusy} />
            <ActionButton icon={<PlugZap className={cx("h-3.5 w-3.5", isBusy("embedding-test") && "animate-pulse")} />} label="Test" onClick={onTestEmbeddingProvider} disabled={embeddingBusy} />
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("embedding-save") && "animate-pulse")} />} label="Save embedding" onClick={onSaveEmbeddingProvider} primary disabled={embeddingBusy} />
          </div>
          {embeddingStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
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
                Agent Provider
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Only saved providers are listed here.</div>
            </div>
            <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="New provider" onClick={onNewProvider} disabled={agentBusy} />
          </div>

          <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1 uclaw-scrollbar">
            {chatProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.enabled}
                statusLabel={provider.enabled ? "Active" : "Off"}
                statusOn={provider.enabled}
                onSelect={() => onSelectProvider(provider)}
                onEdit={() => onSelectProvider(provider)}
                onDelete={() => onDeleteProvider(provider)}
                onToggle={() => onToggleProvider(provider)}
                toggleDisabled={agentBusy || agentToggleBusy}
              />
            ))}
            {chatProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">No agent providers yet. Create one to add it to this list.</div>}
          </div>
          {statusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{statusLine}</div>}
        </section>

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Database className="h-3.5 w-3.5" />
                Embedding Provider
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Only saved providers are listed here.</div>
            </div>
            <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="New embedding" onClick={onNewEmbeddingProvider} disabled={embeddingBusy} />
          </div>

          <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1 uclaw-scrollbar">
            {embeddingProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.enabled}
                statusLabel={provider.enabled ? "Active" : "Off"}
                statusOn={Boolean(provider.enabled)}
                onSelect={() => onSelectEmbeddingProvider(provider)}
                onEdit={() => onSelectEmbeddingProvider(provider)}
                onDelete={() => onDeleteEmbeddingProvider(provider)}
                onToggle={() => onToggleEmbeddingProvider(provider)}
                toggleDisabled={embeddingBusy || embeddingToggleBusy}
              />
            ))}
            {embeddingProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">No embedding providers yet. Create one to add it to this list.</div>}
          </div>
          {embeddingReindexNotice && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              <div className="flex gap-2">
                <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Embedding index may be stale</div>
                  <div>{embeddingReindexNotice}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 text-[10px] font-medium text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={reindexingActiveSemester}
                      onClick={onReindexActiveSemester}
                    >
                      {reindexingActiveSemester ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {reindexingActiveSemester ? "Re-indexing..." : "Re-index current semester"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-md px-2 text-[10px] font-medium text-amber-900 transition hover:bg-amber-100"
                      onClick={onDismissEmbeddingReindexNotice}
                    >
                      Later
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {embeddingStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
        </section>
      </div>
    </div>
  );
}

function nextProviderDraftName(providers: ModelProviderConfig[], purpose: ProviderPurpose): string {
  const prefix = purpose === "agent" ? "Agent" : "Embedding";
  const used = new Set(
    providers
      .filter((provider) => provider.purpose === purpose)
      .map((provider) => provider.name.trim().replace(/\s+/g, " ").toLowerCase()),
  );
  let index = 1;
  while (used.has(`${prefix} ${index}`.toLowerCase())) index += 1;
  return `${prefix} ${index}`;
}

interface ArchiveSemesterGroup {
  semester: SemesterWorkspace;
  archivedCourses: Course[];
  archivedThreads: Thread[];
}

function ArchiveSettingsPage({ onWorkspaceChanged }: { onWorkspaceChanged?: () => Promise<void> | void }) {
  const [groups, setGroups] = useState<ArchiveSemesterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadArchive();
  }, []);

  async function loadArchive() {
    setLoading(true);
    setError("");
    try {
      const [activeSemesters, archivedSemesters] = await Promise.all([
        window.uclaw.semester.list(),
        window.uclaw.semester.listArchived(),
      ]);
      const semesters = [...activeSemesters, ...archivedSemesters].sort(compareSemestersForArchive);
      const nextGroups = await Promise.all(
        semesters.map(async (item) => {
          const [archivedCourses, archivedThreads] = await Promise.all([
            window.uclaw.courses.listArchived({ semesterId: item.id }),
            window.uclaw.threads.listArchived({ semesterId: item.id }),
          ]);
          return { semester: item, archivedCourses, archivedThreads };
        }),
      );
      setGroups(nextGroups.filter((group) => group.semester.archivedAt || group.archivedCourses.length > 0 || group.archivedThreads.length > 0));
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
      await window.uclaw.semester.restore(semester.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to restore semester."));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteSemester(semester: SemesterWorkspace) {
    const typed = window.prompt(`This permanently deletes "${semester.term}", all courses, files, sessions, and indexed data.\n\nType the semester term to confirm:`);
    if (typed !== semester.term) return;
    setBusyKey(`semester:delete:${semester.id}`);
    setError("");
    try {
      await window.uclaw.semester.delete(semester.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to delete semester."));
    } finally {
      setBusyKey("");
    }
  }

  async function restoreCourse(course: Course, semesterArchived: boolean) {
    if (semesterArchived) {
      setError("Restore the parent semester before restoring this course.");
      return;
    }
    setBusyKey(`course:restore:${course.id}`);
    setError("");
    try {
      await window.uclaw.courses.restore(course.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to restore course."));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteCourse(course: Course) {
    const typed = window.prompt(`This permanently deletes "${course.name}", all files, sessions, and indexed data.\n\nType the course name to confirm:`);
    if (typed !== course.name) return;
    setBusyKey(`course:delete:${course.id}`);
    setError("");
    try {
      await window.uclaw.courses.delete(course.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to delete course."));
    } finally {
      setBusyKey("");
    }
  }

  async function restoreThread(thread: Thread, blocked: boolean) {
    if (blocked) {
      setError("Restore the parent semester/course before restoring this session.");
      return;
    }
    setBusyKey(`thread:restore:${thread.id}`);
    setError("");
    try {
      await window.uclaw.threads.restore(thread.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to restore session."));
    } finally {
      setBusyKey("");
    }
  }

  async function deleteThread(thread: Thread) {
    const typed = window.prompt(`This permanently deletes the archived session "${thread.title}".\n\nType the session title to confirm:`);
    if (typed !== thread.title) return;
    setBusyKey(`thread:delete:${thread.id}`);
    setError("");
    try {
      await window.uclaw.threads.delete(thread.id);
      await afterMutation();
    } catch (reason) {
      setError(errorMessage(reason, "Failed to delete session."));
    } finally {
      setBusyKey("");
    }
  }

  const archivedSemesterCount = groups.filter((group) => group.semester.archivedAt).length;
  const archivedCourseCount = groups.reduce((count, group) => count + group.archivedCourses.length, 0);
  const archivedThreadCount = groups.reduce((count, group) => count + group.archivedThreads.length, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-background/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="h-4 w-4" />
              Archive Center
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Restore archived semesters, courses, and sessions. Permanent delete stays available only after archive.
            </div>
          </div>
          <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", loading && "animate-spin")} />} label="Refresh" onClick={() => void loadArchive()} disabled={loading} />
        </div>
        <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
          <ArchiveMetric label="Semesters" value={archivedSemesterCount} />
          <ArchiveMetric label="Courses" value={archivedCourseCount} />
          <ArchiveMetric label="Sessions" value={archivedThreadCount} />
        </div>
        {error && <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">{error}</div>}
      </section>

      {loading ? (
        <div className="rounded-lg border border-dashed bg-background/55 px-4 py-10 text-center text-xs text-muted-foreground">Loading archived items...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background/55 px-4 py-10 text-center text-xs text-muted-foreground">No archived semesters, courses, or sessions yet.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const semesterArchived = Boolean(group.semester.archivedAt);
            const homeThreads = group.archivedThreads.filter((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID);
            const courseEntries = archiveCourseEntries(group);
            return (
              <section key={group.semester.id} className="overflow-hidden rounded-lg border bg-background/70">
                <div className={cx("flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3", semesterArchived ? "bg-muted/45" : "bg-card/70")}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-sm font-semibold">{group.semester.term}</span>
                      <span className={cx("rounded px-1.5 py-0.5 text-[9px] uppercase", semesterArchived ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
                        {semesterArchived ? "Archived semester" : "Active semester"}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {group.semester.semesterNo} · {group.archivedCourses.length} archived courses · {group.archivedThreads.length} archived sessions
                    </div>
                  </div>
                  {semesterArchived && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <ArchiveActionButton
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        label="Restore semester"
                        busy={busyKey === `semester:restore:${group.semester.id}`}
                        onClick={() => void restoreSemester(group.semester)}
                      />
                      <ArchiveActionButton
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        label="Delete"
                        danger
                        busy={busyKey === `semester:delete:${group.semester.id}`}
                        onClick={() => void deleteSemester(group.semester)}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-4">
                  {semesterArchived && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                      This semester is archived. Restore it first before restoring child courses or sessions.
                    </div>
                  )}

                  {homeThreads.length > 0 && (
                    <ArchivePanel icon={<MessageSquare className="h-3.5 w-3.5" />} title="Home sessions" count={homeThreads.length}>
                      <div className="space-y-2">
                        {homeThreads.map((thread) => (
                          <ArchivedThreadRow
                            key={thread.id}
                            thread={thread}
                            restoreBlocked={semesterArchived}
                            busyKey={busyKey}
                            onRestore={() => void restoreThread(thread, semesterArchived)}
                            onDelete={() => void deleteThread(thread)}
                          />
                        ))}
                      </div>
                    </ArchivePanel>
                  )}

                  {courseEntries.length > 0 && (
                    <ArchivePanel icon={<BookOpen className="h-3.5 w-3.5" />} title="Courses" count={courseEntries.length}>
                      <div className="space-y-2">
                        {courseEntries.map((entry) => {
                          const courseArchived = Boolean(entry.course?.archivedAt);
                          const restoreBlocked = semesterArchived || courseArchived;
                          return (
                            <div key={entry.courseId} className="rounded-lg border bg-card p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className="truncate text-xs font-semibold">{entry.course?.name || `Course ${shortId(entry.courseId)}`}</span>
                                    {entry.course?.code && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{entry.course.code}</span>}
                                    {courseArchived && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">Archived course</span>}
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {entry.threads.length} archived sessions · {entry.course ? entry.course.instructor || "No instructor" : "Course metadata not loaded"}
                                  </div>
                                </div>
                                {entry.course && (
                                  <div className="flex shrink-0 flex-wrap gap-2">
                                    <ArchiveActionButton
                                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                                      label="Restore course"
                                      disabled={semesterArchived}
                                      busy={busyKey === `course:restore:${entry.course.id}`}
                                      onClick={() => void restoreCourse(entry.course as Course, semesterArchived)}
                                    />
                                    <ArchiveActionButton
                                      icon={<Trash2 className="h-3.5 w-3.5" />}
                                      label="Delete"
                                      danger
                                      busy={busyKey === `course:delete:${entry.course.id}`}
                                      onClick={() => void deleteCourse(entry.course as Course)}
                                    />
                                  </div>
                                )}
                              </div>

                              {entry.threads.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {entry.threads.map((thread) => (
                                    <ArchivedThreadRow
                                      key={thread.id}
                                      thread={thread}
                                      restoreBlocked={restoreBlocked}
                                      busyKey={busyKey}
                                      onRestore={() => void restoreThread(thread, restoreBlocked)}
                                      onDelete={() => void deleteThread(thread)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ArchivePanel>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
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
  onRestore,
  onDelete,
}: {
  thread: Thread;
  restoreBlocked: boolean;
  busyKey: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/80 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{thread.title}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {thread.threadType === "semester_home" ? "Home session" : `Task session · ${shortId(thread.taskId || thread.id)}`} · archived {formatArchiveDate(thread.archivedAt)}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <ArchiveActionButton
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label="Restore"
          disabled={restoreBlocked}
          busy={busyKey === `thread:restore:${thread.id}`}
          onClick={onRestore}
        />
        <ArchiveActionButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete"
          danger
          busy={busyKey === `thread:delete:${thread.id}`}
          onClick={onDelete}
        />
      </div>
    </div>
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
      {busy ? "Working..." : label}
    </button>
  );
}

function archiveCourseEntries(group: ArchiveSemesterGroup): Array<{ courseId: string; course?: Course; threads: Thread[] }> {
  const entries = new Map<string, { courseId: string; course?: Course; threads: Thread[] }>();
  for (const course of group.archivedCourses) {
    entries.set(course.id, { courseId: course.id, course, threads: [] });
  }
  for (const thread of group.archivedThreads) {
    if (thread.courseId === SEMESTER_HOME_COURSE_ID) continue;
    const existing = entries.get(thread.courseId) || { courseId: thread.courseId, threads: [] };
    existing.threads.push(thread);
    entries.set(thread.courseId, existing);
  }
  return Array.from(entries.values()).sort((a, b) => (a.course?.name || a.courseId).localeCompare(b.course?.name || b.courseId));
}

function compareSemestersForArchive(a: SemesterWorkspace, b: SemesterWorkspace): number {
  const aTime = Date.parse(a.archivedAt || a.startsAt || a.recognizedAt || "");
  const bTime = Date.parse(b.archivedAt || b.startsAt || b.recognizedAt || "");
  return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
}

function formatArchiveDate(value?: string): string {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId);
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-lg border bg-background/70 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            Skill Profiles
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{enabledSkills} enabled</span>
            <ActionButton icon={<Upload className="h-3.5 w-3.5" />} label="Import" onClick={onImportSkill} />
          </div>
        </div>

        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={cx(
                "flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-3 text-left transition",
                skill.id === selectedSkillId ? "border-foreground/30 ring-1 ring-foreground/15" : "hover:border-border/80",
              )}
              onClick={() => onSelectSkill(skill.id)}
            >
              <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", skill.enabled ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground")}>
                {skill.enabled ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-semibold">{skill.name}</div>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{skill.version}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{skill.description}</div>
                {skill.instructions && (
                  <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground/70">{skill.instructions}</div>
                )}
              </div>
              <TogglePill enabled={skill.enabled} onClick={() => onToggleSkill(skill)} />
            </div>
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
              <FileText className="h-3.5 w-3.5" />
              <span className="truncate">{selectedSkill?.name || "Skill content"}</span>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                label="Open"
                onClick={() => selectedSkill && onOpenSkillFolder(selectedSkill.id)}
              />
              <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={onSaveSkill} primary disabled={!selectedSkill || skillBusy || !skillContent.trim()} />
            </div>
          </div>

          {selectedSkill ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.version}</span>
                {selectedSkill.sourcePath && <span className="truncate rounded bg-muted px-1.5 py-0.5">{selectedSkill.sourcePath}</span>}
              </div>
              <textarea
                className="min-h-[320px] w-full rounded-lg border bg-background px-3 py-3 font-mono text-[12px] leading-5 text-foreground outline-none"
                value={skillContent}
                onChange={(event) => onSkillContentChange(event.target.value)}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-[12px] text-muted-foreground">
              Select a skill to inspect or edit its `SKILL.md`.
            </div>
          )}

          {skillStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{skillStatusLine}</div>}
          {skillBusy && !skillStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">Working with skill files...</div>}
        </section>

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Layers3 className="h-3.5 w-3.5" />
            Skill Runtime
          </div>
          <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
            <MetricRow label="Router" value="enabled skills" />
            <MetricRow label="Scope" value="global" />
            <MetricRow label="Context" value="window aware" />
          </div>
        </section>

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <GitBranch className="h-3.5 w-3.5" />
            Git / Edit Tools
          </div>
          <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
            <div className="rounded-md bg-muted/50 px-2 py-2">
              <span className="font-medium text-foreground">{gitStatus?.branch || "local/mock"}</span>
              <span> · </span>
              <span>{gitStatus?.summary || "GitService placeholder is ready."}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <ToolChip icon={<Wrench className="h-3 w-3" />} label="edit files" />
              <ToolChip icon={<TerminalSquare className="h-3 w-3" />} label="run commands" />
              <ToolChip icon={<GitBranch className="h-3 w-3" />} label="git diff" />
              <ToolChip icon={<Sparkles className="h-3 w-3" />} label="skill router" />
            </div>
          </div>
        </section>
      </aside>
    </div>
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
  return (
    <div className={cx("group flex items-center gap-2 rounded-lg border p-2 transition", active ? "bg-muted text-foreground ring-1 ring-border/70" : "bg-card text-muted-foreground hover:text-foreground")}>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="block truncate text-xs font-semibold">{provider.name}</span>
        <span className="mt-0.5 block truncate text-[10px]">
          {providerKindLabel(provider.providerKind)} · {provider.baseUrl || "URL not set"}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap gap-1">
          {provider.selectedModel && <span className="max-w-[180px] truncate rounded bg-background/80 px-1.5 py-0.5 text-[9px]">{provider.selectedModel}</span>}
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex max-w-0 items-center gap-1 overflow-hidden opacity-0 transition-all duration-150 group-hover:max-w-[72px] group-hover:opacity-100 group-focus-within:max-w-[72px] group-focus-within:opacity-100">
          <IconActionButton icon={<Pencil className="h-3.5 w-3.5" />} label={`Edit ${provider.name}`} onClick={onEdit} disabled={actionsDisabled} />
          <IconActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label={`Delete ${provider.name}`} onClick={onDelete} disabled={actionsDisabled} danger />
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
            aria-label={passwordVisible ? "Hide API key" : "Show API key"}
            title={passwordVisible ? "Hide API key" : "Show API key"}
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
  value: AgentProviderKind | EmbeddingProviderKind;
  onChange: (value: ProviderKind) => void;
}) {
  const options = purpose === "agent" ? agentProviderKinds : embeddingProviderKinds;
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>Provider</span>
      <select className="h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none" value={value} onChange={(event) => onChange(event.target.value as ProviderKind)}>
        {options.map((kind) => (
          <option key={kind} value={kind}>
            {providerKindLabel(kind)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TogglePill({ enabled, onClick, labelOn = "Enabled", labelOff = "Disabled", disabled }: { enabled: boolean; onClick: () => void; labelOn?: string; labelOff?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-45", enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
      disabled={disabled}
      onClick={onClick}
    >
      {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
      {enabled ? labelOn : labelOff}
    </button>
  );
}

function ModelPicker({ purpose, models, onPick }: { purpose: ProviderPurpose; models: ProviderModel[]; onPick: (model: ProviderModel) => void }) {
  if (models.length === 0) return null;
  return (
    <div className="mt-3 grid gap-2 rounded-md border bg-card p-2 md:grid-cols-2">
      {models.map((model) => (
        <button
          key={model.id}
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-2 text-left text-[11px] text-muted-foreground transition hover:border-border/80 hover:text-foreground"
          onClick={() => onPick(model)}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
            {purpose === "embedding" ? <Database className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">{model.name}</span>
            <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">{purpose}</span>
          </span>
        </button>
      ))}
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
    ...overrides,
  };
}

function applyProviderPreset(draft: ProviderDraftInput, providerKind: ProviderKind): ProviderDraftInput {
  const preset = PROVIDER_PRESETS[providerKind];
  const models = presetModels(providerKind);
  return {
    ...draft,
    purpose: preset.purpose,
    providerKind,
    protocol: preset.protocol,
    authMode: preset.authMode,
    baseUrl: preset.baseUrl,
    models,
    selectedModel: models[0]?.id || "",
  };
}

function presetModels(providerKind: ProviderKind): ProviderModel[] {
  const preset = PROVIDER_PRESETS[providerKind];
  if (!("models" in preset)) return [];
  return preset.models.map((model) => ({ ...model }));
}

function providerKindLabel(providerKind: ProviderKind): string {
  return PROVIDER_PRESETS[providerKind]?.label || providerKind;
}

function adapterLabel(providerKind: ProviderKind): string {
  const preset = PROVIDER_PRESETS[providerKind];
  return preset.adapterKind === "anthropic" ? "Anthropic Messages" : "OpenAI-compatible Embeddings";
}

function errorMessage(error: unknown, fallback = "Operation failed."): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.trim() || fallback;
}
