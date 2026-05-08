import {
  ArrowLeft,
  Bot,
  Check,
  Circle,
  Database,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Copy,
  GitBranch,
  KeyRound,
  Layers3,
  PlugZap,
  Plus,
  RefreshCw,
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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Course,
  GitStatus,
  ModelProviderConfig,
  ProviderAuthMode,
  ProviderDraftInput,
  ProviderKind,
  ProviderModel,
  ProviderProtocol,
  ProviderPurpose,
  SemesterWorkspace,
  SkillItem,
} from "@/types/domain";
import { cx } from "@/lib/cn";

type SettingsPage = "providers" | "skills";

const agentProtocols: Array<{ value: ProviderProtocol; label: string }> = [
  { value: "anthropic_messages", label: "Anthropic Messages" },
];

const embeddingProtocols: Array<{ value: ProviderProtocol; label: string }> = [
  { value: "openai_compatible", label: "OpenAI-compatible" },
];

const authModes: Array<{ value: ProviderAuthMode; label: string }> = [
  { value: "api_key", label: "API key" },
  { value: "auth_token", label: "Auth token" },
  { value: "bearer", label: "Bearer token" },
];

const agentKinds: Array<{ value: ProviderKind; label: string }> = [
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Custom" },
];

const embeddingKinds: Array<{ value: ProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "dashscope", label: "DashScope" },
  { value: "siliconflow", label: "SiliconFlow" },
  { value: "voyage", label: "Voyage" },
  { value: "custom", label: "Custom" },
];

const emptyDraft: ProviderDraftInput = {
  purpose: "agent",
  name: "",
  kind: "anthropic",
  protocol: "anthropic_messages",
  authMode: "api_key",
  baseUrl: "",
  apiKey: "",
  models: [],
  selectedModel: "",
  enabled: false,
};

const emptyEmbeddingDraft: ProviderDraftInput = {
  purpose: "embedding",
  name: "",
  kind: "custom",
  protocol: "openai_compatible",
  authMode: "bearer",
  baseUrl: "",
  apiKey: "",
  models: [],
  selectedModel: "",
  enabled: false,
};

export function SettingsDialog({
  course,
  semester,
  skills,
  gitStatus,
  onSkillsChange,
  onClose,
}: {
  course?: Course;
  semester?: SemesterWorkspace | null;
  skills: SkillItem[];
  gitStatus: GitStatus | null;
  onSkillsChange: (skills: SkillItem[]) => void;
  onClose: () => void;
}) {
  const [activePage, setActivePage] = useState<SettingsPage>("providers");
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
  const [busy, setBusy] = useState(false);
  const [localSkills, setLocalSkills] = useState(skills);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillStatusLine, setSkillStatusLine] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);

  const enabledSkills = localSkills.filter((skill) => skill.enabled).length;
  const chatProviders = providers.filter((provider) => provider.purpose === "agent");
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const enabledProviders = chatProviders.filter((provider) => provider.enabled).length;
  const activeEmbeddingProvider = useMemo(
    () => embeddingProviders.find((provider) => provider.id === selectedEmbeddingProviderId) || embeddingProviders.find((provider) => provider.enabled) || embeddingProviders[0],
    [embeddingProviders, selectedEmbeddingProviderId],
  );

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    setLocalSkills(skills);
  }, [skills]);

  useEffect(() => {
    void window.uclaw.skills.list().then(setLocalSkills);
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
    const result = await window.uclaw.providers.list();
    setProviders(result);
    closeProviderEditor();
    closeEmbeddingEditor();
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
    setDraft({ ...emptyDraft, name: nextProviderDraftName(providers) });
    setModels([]);
    setStatusLine("");
  }

  function newEmbeddingProvider() {
    closeProviderEditor();
    setCreatingEmbeddingProvider(true);
    setSelectedEmbeddingProviderId("");
    setEmbeddingDraft({ ...emptyEmbeddingDraft, name: nextProviderDraftName(providers) });
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

  async function saveProvider() {
    setBusy(true);
    try {
      const saved = await window.uclaw.providers.save({ ...draft, purpose: "agent", protocol: "anthropic_messages" });
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeProviderEditor();
      setStatusLine(`Saved "${saved.name}".`);
    } catch (error) {
      setStatusLine(`Failed to save provider profile: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateProvider(provider: ModelProviderConfig) {
    setBusy(true);
    try {
      const duplicateName = provider.name.endsWith(" Copy") ? `${provider.name} 2` : `${provider.name} Copy`;
      const saved = await window.uclaw.providers.save({
        ...toProviderDraft(provider),
        id: undefined,
        name: duplicateName,
        apiKey: "",
      });
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeProviderEditor();
      setStatusLine(`Duplicated "${saved.name}".`);
    } catch (error) {
      setStatusLine(`Failed to duplicate provider profile: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProvider(provider: ModelProviderConfig) {
    const ok = window.confirm(`Delete provider profile "${provider.name}"?`);
    if (!ok) return;
    setBusy(true);
    try {
      await window.uclaw.providers.delete(provider.id);
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeProviderEditor();
      setStatusLine(`Deleted provider profile "${provider.name}".`);
    } catch (error) {
      setStatusLine(`Failed to delete provider profile: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEmbeddingProvider() {
    setBusy(true);
    try {
      const saved = await window.uclaw.providers.save({ ...embeddingDraft, purpose: "embedding", protocol: "openai_compatible" });
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeEmbeddingEditor();
      setEmbeddingStatusLine(`Saved embedding provider "${saved.name}".`);
    } catch (error) {
      setEmbeddingStatusLine(`Failed to save embedding provider: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateEmbeddingProvider(provider: ModelProviderConfig) {
    setBusy(true);
    try {
      const duplicateName = provider.name.endsWith(" Copy") ? `${provider.name} 2` : `${provider.name} Copy`;
      const saved = await window.uclaw.providers.save({
        ...toProviderDraft(provider),
        id: undefined,
        name: duplicateName,
        apiKey: "",
      });
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeEmbeddingEditor();
      setEmbeddingStatusLine(`Duplicated embedding provider "${saved.name}".`);
    } catch (error) {
      setEmbeddingStatusLine(`Failed to duplicate embedding provider: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmbeddingProvider(provider: ModelProviderConfig) {
    const ok = window.confirm(`Delete embedding provider profile "${provider.name}"?`);
    if (!ok) return;
    setBusy(true);
    try {
      await window.uclaw.providers.delete(provider.id);
      const next = await window.uclaw.providers.list();
      setProviders(next);
      closeEmbeddingEditor();
      setEmbeddingStatusLine(`Deleted embedding provider profile "${provider.name}".`);
    } catch (error) {
      setEmbeddingStatusLine(`Failed to delete embedding provider: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleProvider(provider: ModelProviderConfig) {
    try {
      const saved = await window.uclaw.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const next = await window.uclaw.providers.list();
      setProviders(next);
      if (provider.id === selectedProviderId) selectProvider(saved);
    } catch (error) {
      setStatusLine(errorMessage(error));
    }
  }

  async function toggleEmbeddingProvider(provider: ModelProviderConfig) {
    try {
      const saved = await window.uclaw.providers.save(toProviderDraft(provider, { enabled: !provider.enabled }));
      const next = await window.uclaw.providers.list();
      setProviders(next);
      if (provider.id === selectedEmbeddingProviderId) selectEmbeddingProvider(saved);
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
    }
  }

  async function fetchModels() {
    if (!selectedProviderId) {
      setStatusLine("Save provider before fetching models.");
      return;
    }
    setBusy(true);
    try {
      setModels(await window.uclaw.providers.models(selectedProviderId));
      setStatusLine("Fetched available models.");
    } finally {
      setBusy(false);
    }
  }

  async function fetchEmbeddingModels() {
    if (!selectedEmbeddingProviderId) {
      setEmbeddingStatusLine("Save embedding provider before fetching models.");
      return;
    }
    setBusy(true);
    try {
      setEmbeddingModels(await window.uclaw.providers.models(selectedEmbeddingProviderId));
      setEmbeddingStatusLine("Fetched embedding models.");
    } finally {
      setBusy(false);
    }
  }

  async function testProvider() {
    if (!selectedProviderId) {
      setStatusLine("Save provider before testing connection.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.uclaw.providers.test(selectedProviderId);
      setStatusLine(`${result.ok ? "Connected" : "Failed"} · ${result.latencyMs}ms · ${result.message}`);
    } catch (error) {
      setStatusLine(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function testEmbeddingProvider() {
    if (!selectedEmbeddingProviderId) {
      setEmbeddingStatusLine("Save embedding provider before testing connection.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.uclaw.providers.test(selectedEmbeddingProviderId);
      setEmbeddingStatusLine(`${result.ok ? "Connected" : "Failed"} · ${result.latencyMs}ms · ${result.message}`);
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSkill(skill: SkillItem) {
    const updated = await window.uclaw.skills.update({ id: skill.id, enabled: !skill.enabled });
    const next = localSkills.map((item) => (item.id === updated.id ? updated : item));
    setLocalSkills(next);
    onSkillsChange(next);
  }

  async function saveSkillContent() {
    if (!selectedSkillId) return;
    setSkillBusy(true);
    try {
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
      <div className="flex h-[82vh] w-[min(1180px,calc(100vw-48px))] flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4" />
              Settings
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{course?.name || "UCLAW"} · {semester?.term || "no semester selected"} · providers, embeddings, skills</div>
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
                title="Provider"
                detail={`${enabledProviders} enabled · ${activeEmbeddingProvider?.selectedModel || "embedding TBD"}`}
                onClick={() => setActivePage("providers")}
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
                busy={busy}
                onSelectProvider={selectProvider}
                onSelectEmbeddingProvider={selectEmbeddingProvider}
                onNewProvider={newProvider}
                onNewEmbeddingProvider={newEmbeddingProvider}
                onCloseProviderEditor={closeProviderEditor}
                onCloseEmbeddingEditor={closeEmbeddingEditor}
                onToggleProvider={toggleProvider}
                onToggleEmbeddingProvider={toggleEmbeddingProvider}
                onDuplicateProvider={(provider) => void duplicateProvider(provider)}
                onDeleteProvider={(provider) => void deleteProvider(provider)}
                onDuplicateEmbeddingProvider={(provider) => void duplicateEmbeddingProvider(provider)}
                onDeleteEmbeddingProvider={(provider) => void deleteEmbeddingProvider(provider)}
                onDraftChange={setDraft}
                onEmbeddingDraftChange={setEmbeddingDraft}
                onFetchModels={fetchModels}
                onFetchEmbeddingModels={fetchEmbeddingModels}
                onTestProvider={testProvider}
                onTestEmbeddingProvider={testEmbeddingProvider}
                onSaveProvider={saveProvider}
                onSaveEmbeddingProvider={saveEmbeddingProvider}
              />
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
  busy,
  onSelectProvider,
  onSelectEmbeddingProvider,
  onNewProvider,
  onNewEmbeddingProvider,
  onCloseProviderEditor,
  onCloseEmbeddingEditor,
  onToggleProvider,
  onToggleEmbeddingProvider,
  onDuplicateProvider,
  onDeleteProvider,
  onDuplicateEmbeddingProvider,
  onDeleteEmbeddingProvider,
  onDraftChange,
  onEmbeddingDraftChange,
  onFetchModels,
  onFetchEmbeddingModels,
  onTestProvider,
  onTestEmbeddingProvider,
  onSaveProvider,
  onSaveEmbeddingProvider,
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
  busy: boolean;
  onSelectProvider: (provider: ModelProviderConfig) => void;
  onSelectEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onNewProvider: () => void;
  onNewEmbeddingProvider: () => void;
  onCloseProviderEditor: () => void;
  onCloseEmbeddingEditor: () => void;
  onToggleProvider: (provider: ModelProviderConfig) => void;
  onToggleEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDuplicateProvider: (provider: ModelProviderConfig) => void;
  onDeleteProvider: (provider: ModelProviderConfig) => void;
  onDuplicateEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDeleteEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDraftChange: (draft: ProviderDraftInput) => void;
  onEmbeddingDraftChange: (draft: ProviderDraftInput) => void;
  onFetchModels: () => void;
  onFetchEmbeddingModels: () => void;
  onTestProvider: () => void;
  onTestEmbeddingProvider: () => void;
  onSaveProvider: () => void;
  onSaveEmbeddingProvider: () => void;
}) {
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedEmbeddingProvider = providers.find((provider) => provider.id === selectedEmbeddingProviderId);
  const chatProviders = providers.filter((provider) => provider.purpose === "agent");
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const providerEditorOpen = creatingProvider || Boolean(selectedProvider);
  const embeddingEditorOpen = creatingEmbeddingProvider || Boolean(selectedEmbeddingProvider);
  const runtimeBanner = null;

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
              {selectedProvider && <ActionButton icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate" onClick={() => onDuplicateProvider(selectedProvider)} />}
              {selectedProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={() => onDeleteProvider(selectedProvider)} />}
              <TogglePill enabled={Boolean(draft.enabled)} onClick={() => onDraftChange({ ...draft, enabled: !draft.enabled })} />
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
            <ProtocolField purpose="agent" value={draft.protocol} onChange={(value) => onDraftChange({ ...draft, protocol: value })} />
            <KindField purpose="agent" value={draft.kind} onChange={(value) => onDraftChange({ ...draft, kind: value })} />
            <AuthModeField label="Auth mode" value={draft.authMode} onChange={(value) => onDraftChange({ ...draft, authMode: value })} />
            <Field label="Base URL" value={draft.baseUrl} onChange={(value) => onDraftChange({ ...draft, baseUrl: value })} />
            <Field
              label="API Key"
              value={draft.apiKey}
              onChange={(value) => onDraftChange({ ...draft, apiKey: value })}
              type="password"
              placeholder={selectedProvider?.apiKeyMasked ? `Stored ${selectedProvider.apiKeyMasked}; leave blank to keep` : "Paste API key"}
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
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", busy && "animate-spin")} />} label="Get models" onClick={onFetchModels} />
            <ActionButton icon={<PlugZap className="h-3.5 w-3.5" />} label="Test" onClick={onTestProvider} />
            <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={onSaveProvider} primary />
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
              {selectedEmbeddingProvider && <ActionButton icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate" onClick={() => onDuplicateEmbeddingProvider(selectedEmbeddingProvider)} />}
              {selectedEmbeddingProvider && <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={() => onDeleteEmbeddingProvider(selectedEmbeddingProvider)} />}
              <TogglePill enabled={Boolean(embeddingDraft.enabled)} labelOn="Embedding on" labelOff="Embedding off" onClick={() => onEmbeddingDraftChange({ ...embeddingDraft, enabled: !embeddingDraft.enabled })} />
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
            <ProtocolField purpose="embedding" value={embeddingDraft.protocol} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, protocol: value })} />
            <KindField purpose="embedding" value={embeddingDraft.kind} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, kind: value })} />
            <AuthModeField label="Auth mode" value={embeddingDraft.authMode} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, authMode: value })} />
            <Field label="Base URL" value={embeddingDraft.baseUrl} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, baseUrl: value })} />
            <Field
              label="API Key"
              value={embeddingDraft.apiKey}
              onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, apiKey: value })}
              type="password"
              placeholder={selectedEmbeddingProvider?.apiKeyMasked ? `Stored ${selectedEmbeddingProvider.apiKeyMasked}; leave blank to keep` : "Paste API key"}
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
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", busy && "animate-spin")} />} label="Get models" onClick={onFetchEmbeddingModels} />
            <ActionButton icon={<PlugZap className="h-3.5 w-3.5" />} label="Test" onClick={onTestEmbeddingProvider} />
            <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="Save embedding" onClick={onSaveEmbeddingProvider} primary />
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
            <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="New provider" onClick={onNewProvider} />
          </div>

          <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1 uclaw-scrollbar">
            {chatProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={false}
                statusLabel={provider.enabled ? "Enabled" : "Disabled"}
                statusOn={provider.enabled}
                onSelect={() => onSelectProvider(provider)}
                onToggle={() => onToggleProvider(provider)}
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
            <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="New embedding" onClick={onNewEmbeddingProvider} />
          </div>

          <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1 uclaw-scrollbar">
            {embeddingProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={false}
                statusLabel={provider.enabled ? "Embedding" : "Off"}
                statusOn={Boolean(provider.enabled)}
                onSelect={() => onSelectEmbeddingProvider(provider)}
                onToggle={() => onToggleEmbeddingProvider(provider)}
              />
            ))}
            {embeddingProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">No embedding providers yet. Create one to add it to this list.</div>}
          </div>
          {embeddingStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
        </section>
      </div>
    </div>
  );
}

function nextProviderDraftName(providers: ModelProviderConfig[]): string {
  const used = new Set(
    providers
      .map((provider) => provider.name.trim())
      .filter((name) => /^\d+$/.test(name)),
  );
  let index = 1;
  while (used.has(String(index))) index += 1;
  return String(index);
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
              <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={onSaveSkill} primary />
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
  onToggle,
}: {
  provider: ModelProviderConfig;
  active: boolean;
  statusLabel: string;
  statusOn: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={cx("flex items-center gap-2 rounded-lg border p-2 transition", active ? "bg-muted text-foreground ring-1 ring-border/70" : "bg-card text-muted-foreground hover:text-foreground")}>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="block truncate text-xs font-semibold">{provider.name}</span>
        <span className="mt-0.5 block truncate text-[10px]">
          {protocolLabel(provider.protocol)} · {provider.baseUrl || "URL not set"}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap gap-1">
          {provider.selectedModel && <span className="max-w-[180px] truncate rounded bg-background/80 px-1.5 py-0.5 text-[9px]">{provider.selectedModel}</span>}
        </span>
      </button>
      <button
        type="button"
        className={cx("inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-medium", statusOn ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground")}
        onClick={onToggle}
      >
        {statusOn ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
        {statusLabel}
      </button>
    </div>
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

function ProtocolField({ purpose, value, onChange }: { purpose: ProviderPurpose; value: ProviderProtocol; onChange: (value: ProviderProtocol) => void }) {
  const options = purpose === "agent" ? agentProtocols : embeddingProtocols;
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>Protocol</span>
      <select className="h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none" value={value} onChange={(event) => onChange(event.target.value as ProviderProtocol)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function KindField({ purpose, value, onChange }: { purpose: ProviderPurpose; value: ProviderKind; onChange: (value: ProviderKind) => void }) {
  const options = purpose === "agent" ? agentKinds : embeddingKinds;
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>Kind</span>
      <select className="h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none" value={value} onChange={(event) => onChange(event.target.value as ProviderKind)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthModeField({ label, value, onChange }: { label: string; value: ProviderAuthMode; onChange: (value: ProviderAuthMode) => void }) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <select className="h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none" value={value} onChange={(event) => onChange(event.target.value as ProviderAuthMode)}>
        {authModes.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TogglePill({ enabled, onClick, labelOn = "Enabled", labelOff = "Disabled" }: { enabled: boolean; onClick: () => void; labelOn?: string; labelOff?: string }) {
  return (
    <button
      type="button"
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium", enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
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

function ActionButton({ icon, label, onClick, primary }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium", primary ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")} onClick={onClick}>
      {icon}
      {label}
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
    name: provider.name,
    kind: provider.kind,
    protocol: provider.protocol,
    authMode: provider.authMode,
    baseUrl: provider.baseUrl,
    apiKey: "",
    models: provider.models.map((model) => ({ ...model })),
    selectedModel: provider.selectedModel,
    enabled: provider.enabled,
    ...overrides,
  };
}

function protocolLabel(protocol: ProviderProtocol): string {
  return [...agentProtocols, ...embeddingProtocols].find((item) => item.value === protocol)?.label || protocol;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.trim() || "Operation failed.";
}
