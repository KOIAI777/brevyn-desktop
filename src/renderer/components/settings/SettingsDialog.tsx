import {
  Bot,
  CalendarDays,
  Check,
  Circle,
  Database,
  GitBranch,
  KeyRound,
  Layers3,
  PlugZap,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  TerminalSquare,
  ToggleLeft,
  ToggleRight,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AgentRuntimeStatus, Course, GitStatus, ModelProviderConfig, ProviderDraftInput, ProviderModel, ProviderProtocol, SemesterWorkspace, SkillItem } from "@/types/domain";
import { cx } from "@/lib/cn";

type SettingsPage = "providers" | "skills";

const protocols: Array<{ value: ProviderProtocol; label: string }> = [
  { value: "openai_responses", label: "OpenAI Responses" },
  { value: "anthropic_messages", label: "Anthropic Messages" },
  { value: "openai_compatible", label: "OpenAI-compatible" },
  { value: "custom_http", label: "Custom HTTP" },
];

const emptyDraft: ProviderDraftInput = {
  name: "Custom Provider",
  protocol: "openai_responses",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "",
  embeddingModel: "",
  multimodalModel: "",
  enabled: true,
  embeddingEnabled: false,
};

const emptyEmbeddingDraft: ProviderDraftInput = {
  name: "Embedding Provider",
  protocol: "openai_compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "",
  embeddingModel: "text-embedding-3-large",
  multimodalModel: "",
  enabled: false,
  embeddingEnabled: true,
};

export function SettingsDialog({
  course,
  semester,
  semesters,
  skills,
  gitStatus,
  agentRuntimeStatus,
  onSelectSemester,
  onSkillsChange,
  onAgentRuntimeStatusChange,
  onClose,
}: {
  course?: Course;
  semester?: SemesterWorkspace | null;
  semesters: SemesterWorkspace[];
  skills: SkillItem[];
  gitStatus: GitStatus | null;
  agentRuntimeStatus: AgentRuntimeStatus | null;
  onSelectSemester: (semesterId: string) => void;
  onSkillsChange: (skills: SkillItem[]) => void;
  onAgentRuntimeStatusChange: (status: AgentRuntimeStatus) => void;
  onClose: () => void;
}) {
  const [activePage, setActivePage] = useState<SettingsPage>("providers");
  const [providers, setProviders] = useState<ModelProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedEmbeddingProviderId, setSelectedEmbeddingProviderId] = useState("");
  const [draft, setDraft] = useState<ProviderDraftInput>(emptyDraft);
  const [embeddingDraft, setEmbeddingDraft] = useState<ProviderDraftInput>(emptyEmbeddingDraft);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<ProviderModel[]>([]);
  const [statusLine, setStatusLine] = useState("");
  const [embeddingStatusLine, setEmbeddingStatusLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [localSkills, setLocalSkills] = useState(skills);

  const enabledSkills = localSkills.filter((skill) => skill.enabled).length;
  const enabledProviders = providers.filter((provider) => provider.enabled).length;
  const activeEmbeddingProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedEmbeddingProviderId) || providers.find((provider) => provider.embeddingEnabled) || providers[0],
    [providers, selectedEmbeddingProviderId],
  );

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    setLocalSkills(skills);
  }, [skills]);

  async function loadProviders() {
    const result = await window.uclaw.providers.list();
    setProviders(result);
    const selected = result.find((provider) => provider.enabled) || result[0];
    const embeddingSelected = result.find((provider) => provider.embeddingEnabled) || result.find((provider) => provider.embeddingModel) || result[0];
    if (selected) selectProvider(selected);
    if (embeddingSelected) selectEmbeddingProvider(embeddingSelected);
  }

  function selectProvider(provider: ModelProviderConfig) {
    setSelectedProviderId(provider.id);
    setDraft(toProviderDraft(provider));
    setModels([]);
    setStatusLine("");
  }

  function selectEmbeddingProvider(provider: ModelProviderConfig) {
    setSelectedEmbeddingProviderId(provider.id);
    setEmbeddingDraft(toProviderDraft(provider, { embeddingEnabled: provider.embeddingEnabled ?? Boolean(provider.embeddingModel) }));
    setEmbeddingModels([]);
    setEmbeddingStatusLine("");
  }

  function newProvider() {
    setSelectedProviderId("");
    setDraft({ ...emptyDraft });
    setModels([]);
    setStatusLine("");
  }

  function newEmbeddingProvider() {
    setSelectedEmbeddingProviderId("");
    setEmbeddingDraft({ ...emptyEmbeddingDraft });
    setEmbeddingModels([]);
    setEmbeddingStatusLine("");
  }

  async function saveProvider() {
    setBusy(true);
    try {
      const saved = await window.uclaw.providers.save({ ...draft, embeddingEnabled: draft.embeddingEnabled ?? false });
      const next = await window.uclaw.providers.list();
      setProviders(next);
      selectProvider(saved);
      const runtime = await refreshRuntimeStatus();
      setStatusLine(`Saved provider profile. ${runtime.configured ? "Agent runtime is ready." : runtime.detail}`);
    } catch (error) {
      setStatusLine(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveEmbeddingProvider() {
    setBusy(true);
    try {
      const saved = await window.uclaw.providers.save({ ...embeddingDraft, embeddingEnabled: embeddingDraft.embeddingEnabled ?? true });
      const next = await window.uclaw.providers.list();
      setProviders(next);
      selectEmbeddingProvider(saved);
      setEmbeddingStatusLine("Saved embedding provider.");
    } catch (error) {
      setEmbeddingStatusLine(errorMessage(error));
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
      await refreshRuntimeStatus();
    } catch (error) {
      setStatusLine(errorMessage(error));
    }
  }

  async function toggleEmbeddingProvider(provider: ModelProviderConfig) {
    try {
      const saved = await window.uclaw.providers.save(toProviderDraft(provider, { embeddingEnabled: !(provider.embeddingEnabled ?? Boolean(provider.embeddingModel)) }));
      const next = await window.uclaw.providers.list();
      setProviders(next);
      if (provider.id === selectedEmbeddingProviderId) selectEmbeddingProvider(saved);
      await refreshRuntimeStatus();
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

  async function refreshRuntimeStatus(): Promise<AgentRuntimeStatus> {
    const runtime = await window.uclaw.agent.runtimeStatus();
    onAgentRuntimeStatusChange(runtime);
    return runtime;
  }

  async function toggleSkill(skill: SkillItem) {
    const updated = await window.uclaw.skills.update({ id: skill.id, enabled: !skill.enabled });
    const next = localSkills.map((item) => (item.id === updated.id ? updated : item));
    setLocalSkills(next);
    onSkillsChange(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4" />
              Settings
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{course?.name || "UCLAW"} · {semester?.term || "semester"} · providers, embeddings, skills</div>
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
            <section className="mb-3 rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <CalendarDays className="h-3.5 w-3.5" />
                Current Semester
              </div>
              <select
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none"
                value={semester?.id || ""}
                onChange={(event) => onSelectSemester(event.target.value)}
              >
                {semesters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.term}
                  </option>
                ))}
              </select>
              <div className="mt-2 truncate text-[11px] text-muted-foreground">{semester?.folderName || "folder pending"}</div>
            </section>
            <div className="space-y-1.5">
              <SettingsNavButton
                active={activePage === "providers"}
                icon={<PlugZap className="h-4 w-4" />}
                title="Provider"
                detail={`${enabledProviders} enabled · ${activeEmbeddingProvider?.embeddingModel || "embedding TBD"}`}
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
                draft={draft}
                embeddingDraft={embeddingDraft}
                models={models}
                embeddingModels={embeddingModels}
                statusLine={statusLine}
                embeddingStatusLine={embeddingStatusLine}
                agentRuntimeStatus={agentRuntimeStatus}
                busy={busy}
                onSelectProvider={selectProvider}
                onSelectEmbeddingProvider={selectEmbeddingProvider}
                onNewProvider={newProvider}
                onNewEmbeddingProvider={newEmbeddingProvider}
                onToggleProvider={toggleProvider}
                onToggleEmbeddingProvider={toggleEmbeddingProvider}
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
              <SkillSettingsPage skills={localSkills} enabledSkills={enabledSkills} gitStatus={gitStatus} onToggleSkill={toggleSkill} />
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
  draft,
  embeddingDraft,
  models,
  embeddingModels,
  statusLine,
  embeddingStatusLine,
  agentRuntimeStatus,
  busy,
  onSelectProvider,
  onSelectEmbeddingProvider,
  onNewProvider,
  onNewEmbeddingProvider,
  onToggleProvider,
  onToggleEmbeddingProvider,
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
  draft: ProviderDraftInput;
  embeddingDraft: ProviderDraftInput;
  models: ProviderModel[];
  embeddingModels: ProviderModel[];
  statusLine: string;
  embeddingStatusLine: string;
  agentRuntimeStatus: AgentRuntimeStatus | null;
  busy: boolean;
  onSelectProvider: (provider: ModelProviderConfig) => void;
  onSelectEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onNewProvider: () => void;
  onNewEmbeddingProvider: () => void;
  onToggleProvider: (provider: ModelProviderConfig) => void;
  onToggleEmbeddingProvider: (provider: ModelProviderConfig) => void;
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

  return (
    <div className="space-y-4">
      {agentRuntimeStatus && (
        <div
          className={cx(
            "rounded-lg border px-3 py-3 text-xs",
            agentRuntimeStatus.configured
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950",
          )}
        >
          <div className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-3.5 w-3.5" />
            {agentRuntimeStatus.title}
          </div>
          <div className="mt-1 leading-5 opacity-85">{agentRuntimeStatus.detail}</div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Bot className="h-3.5 w-3.5" />
              Provider Profiles
            </div>
            <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onNewProvider}>
              New
            </button>
          </div>

          <div className="space-y-2">
            {providers.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.id === selectedProviderId}
                statusLabel={provider.enabled ? "Enabled" : "Disabled"}
                statusOn={provider.enabled}
                onSelect={() => onSelectProvider(provider)}
                onToggle={() => onToggleProvider(provider)}
              />
            ))}
            {providers.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-6 text-center text-xs text-muted-foreground">No provider profiles yet.</div>}
          </div>
        </section>

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <PlugZap className="h-3.5 w-3.5" />
                Agent Provider
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Chat, multimodal recognition, and tool-call responses</div>
            </div>
            <TogglePill enabled={Boolean(draft.enabled)} onClick={() => onDraftChange({ ...draft, enabled: !draft.enabled })} />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Profile name" value={draft.name} onChange={(value) => onDraftChange({ ...draft, name: value })} />
            <SelectField label="Protocol" value={draft.protocol} onChange={(value) => onDraftChange({ ...draft, protocol: value })} />
            <Field label="Base URL" value={draft.baseUrl} onChange={(value) => onDraftChange({ ...draft, baseUrl: value })} />
            <Field
              label="API Key"
              value={draft.apiKey}
              onChange={(value) => onDraftChange({ ...draft, apiKey: value })}
              type="password"
              placeholder={selectedProvider?.apiKeyMasked ? `Stored ${selectedProvider.apiKeyMasked}; leave blank to keep` : "Paste API key"}
              icon={<KeyRound className="h-3 w-3" />}
            />
            <Field label="Chat model" value={draft.chatModel || ""} onChange={(value) => onDraftChange({ ...draft, chatModel: value })} />
            <Field label="Multimodal model" value={draft.multimodalModel || ""} onChange={(value) => onDraftChange({ ...draft, multimodalModel: value })} />
          </div>

          {models.length > 0 && (
            <ModelPicker
              models={models.filter((model) => model.type !== "embedding")}
              onPick={(model) => {
                if (model.type === "chat") onDraftChange({ ...draft, chatModel: model.id });
                if (model.type === "multimodal") onDraftChange({ ...draft, multimodalModel: model.id });
              }}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", busy && "animate-spin")} />} label="Get models" onClick={onFetchModels} />
            <ActionButton icon={<PlugZap className="h-3.5 w-3.5" />} label="Test" onClick={onTestProvider} />
            <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={onSaveProvider} primary />
          </div>
          {statusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{statusLine}</div>}
        </section>
      </div>

      <section className="rounded-lg border bg-background/70 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Database className="h-3.5 w-3.5" />
              Embedding Provider
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">RAG search, course file indexing, and context retrieval</div>
          </div>
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onNewEmbeddingProvider}>
            New embedding
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {providers.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.id === selectedEmbeddingProviderId}
                statusLabel={provider.embeddingEnabled ? "Embedding" : "Off"}
                statusOn={Boolean(provider.embeddingEnabled)}
                onSelect={() => onSelectEmbeddingProvider(provider)}
                onToggle={() => onToggleEmbeddingProvider(provider)}
              />
            ))}
          </div>

          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Profile name" value={embeddingDraft.name} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, name: value })} />
              <SelectField label="Protocol" value={embeddingDraft.protocol} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, protocol: value })} />
              <Field label="Base URL" value={embeddingDraft.baseUrl} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, baseUrl: value })} />
              <Field
                label="API Key"
                value={embeddingDraft.apiKey}
                onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, apiKey: value })}
                type="password"
                placeholder={selectedEmbeddingProvider?.apiKeyMasked ? `Stored ${selectedEmbeddingProvider.apiKeyMasked}; leave blank to keep` : "Paste API key"}
                icon={<KeyRound className="h-3 w-3" />}
              />
              <Field label="Embedding model" value={embeddingDraft.embeddingModel || ""} onChange={(value) => onEmbeddingDraftChange({ ...embeddingDraft, embeddingModel: value })} />
              <div className="flex items-end">
                <TogglePill enabled={Boolean(embeddingDraft.embeddingEnabled)} labelOn="Embedding on" labelOff="Embedding off" onClick={() => onEmbeddingDraftChange({ ...embeddingDraft, embeddingEnabled: !embeddingDraft.embeddingEnabled })} />
              </div>
            </div>

            {embeddingModels.length > 0 && (
              <ModelPicker
                models={embeddingModels.filter((model) => model.type === "embedding")}
                onPick={(model) => onEmbeddingDraftChange({ ...embeddingDraft, embeddingModel: model.id })}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <ActionButton icon={<RefreshCw className={cx("h-3.5 w-3.5", busy && "animate-spin")} />} label="Get models" onClick={onFetchEmbeddingModels} />
              <ActionButton icon={<PlugZap className="h-3.5 w-3.5" />} label="Test" onClick={onTestEmbeddingProvider} />
              <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="Save embedding" onClick={onSaveEmbeddingProvider} primary />
            </div>
            {embeddingStatusLine && <div className="rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{embeddingStatusLine}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function SkillSettingsPage({
  skills,
  enabledSkills,
  gitStatus,
  onToggleSkill,
}: {
  skills: SkillItem[];
  enabledSkills: number;
  gitStatus: GitStatus | null;
  onToggleSkill: (skill: SkillItem) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <section className="rounded-lg border bg-background/70 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            Skill Profiles
          </div>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{enabledSkills} enabled</span>
        </div>

        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-3">
              <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", skill.enabled ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground")}>
                {skill.enabled ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-semibold">{skill.name}</div>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{skill.scope}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{skill.version}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{skill.description}</div>
              </div>
              <TogglePill enabled={skill.enabled} onClick={() => onToggleSkill(skill)} />
            </div>
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Layers3 className="h-3.5 w-3.5" />
            Skill Runtime
          </div>
          <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
            <MetricRow label="Router" value="enabled skills" />
            <MetricRow label="Scope" value="course + task" />
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
          {provider.chatModel && <span className="max-w-[130px] truncate rounded bg-background/80 px-1.5 py-0.5 text-[9px]">{provider.chatModel}</span>}
          {provider.embeddingModel && <span className="max-w-[130px] truncate rounded bg-background/80 px-1.5 py-0.5 text-[9px]">{provider.embeddingModel}</span>}
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
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center gap-1 rounded-md border bg-card px-2">
        {icon}
        <input
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/55"
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange }: { label: string; value: ProviderProtocol; onChange: (value: ProviderProtocol) => void }) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <select className="h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none" value={value} onChange={(event) => onChange(event.target.value as ProviderProtocol)}>
        {protocols.map((protocol) => (
          <option key={protocol.value} value={protocol.value}>
            {protocol.label}
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

function ModelPicker({ models, onPick }: { models: ProviderModel[]; onPick: (model: ProviderModel) => void }) {
  if (models.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 rounded-md border bg-card p-2">
      {models.map((model) => (
        <button key={`${model.type}-${model.id}`} type="button" className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => onPick(model)}>
          {model.name} · {model.type}
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
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: "",
    chatModel: provider.chatModel || "",
    embeddingModel: provider.embeddingModel || "",
    multimodalModel: provider.multimodalModel || "",
    enabled: provider.enabled,
    embeddingEnabled: provider.embeddingEnabled ?? Boolean(provider.embeddingModel),
    ...overrides,
  };
}

function protocolLabel(protocol: ProviderProtocol): string {
  return protocols.find((item) => item.value === protocol)?.label || protocol;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation failed.";
}
