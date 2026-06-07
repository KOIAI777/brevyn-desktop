import { ArrowLeft, BookOpen, CalendarDays, Database, Eye, PlugZap, Plus, RefreshCw, Save, ScanText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ActionButton, IconActionButton } from "@/components/settings/shared/SettingsControls";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import { cx } from "@/lib/cn";
import type { AgentGatewayStatus, ModelProviderConfig, ProviderDraftInput, ProviderModel, ProviderPurpose, RecognizedAcademicCalendar, RecognizedCourseTimetable } from "../../../../types/domain";
import { PROVIDER_PROFILE_LIST_HEIGHT_CLASS, isOfficialProvider, officialProviderGroupLabel } from "./providerUtils";
import { ModelPicker, ProviderProfileRow } from "./ProviderControls";
import { AgentProviderEditor, EmbeddingProviderEditor, OcrProviderEditor, VisionProviderEditor } from "./ProviderEditors";
import { AgentGatewayAdvancedPanel, OfficialModelList, OfficialProviderPanel, VisionTestResultPanel } from "./ProviderPanels";
import { adapterLabel, addDraftModel, applyProviderPreset, hasRunnableVisionProvider, isOfficialAgentProvider, removeDraftModel, toggleDraftModel, updateDraftModel } from "./providerDraftUtils";

export type ProviderBusyAction =
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
  | "vision-test"
  | "ocr-save"
  | "ocr-delete"
  | "ocr-toggle"
  | "ocr-fetch"
  | "ocr-test";

type VisionTestKind = "calendar" | "timetable";
type VisionTestResult = RecognizedAcademicCalendar | RecognizedCourseTimetable;

export function ProviderSettingsPage({
  providers,
  selectedProviderId,
  selectedEmbeddingProviderId,
  selectedVisionProviderId,
  selectedOcrProviderId,
  creatingProvider,
  creatingEmbeddingProvider,
  creatingVisionProvider,
  creatingOcrProvider,
  draft,
  embeddingDraft,
  visionDraft,
  ocrDraft,
  models,
  visionModels,
  ocrModels,
  statusLine,
  embeddingStatusLine,
  visionStatusLine,
  ocrStatusLine,
  embeddingReindexNotice,
  embeddingLockedByIndexing,
  reindexingActiveSemester,
  busyActions,
  agentGatewayStatus,
  agentGatewayBusy,
  onSelectProvider,
  onSelectEmbeddingProvider,
  onSelectVisionProvider,
  onSelectOcrProvider,
  onNewProvider,
  onNewEmbeddingProvider,
  onNewVisionProvider,
  onNewOcrProvider,
  onCloseProviderEditor,
  onCloseEmbeddingEditor,
  onCloseVisionEditor,
  onCloseOcrEditor,
  onToggleProvider,
  onToggleOfficialProviders,
  onToggleEmbeddingProvider,
  onToggleVisionProvider,
  onToggleOcrProvider,
  onDeleteProvider,
  onDeleteEmbeddingProvider,
  onDeleteVisionProvider,
  onDeleteOcrProvider,
  onDraftChange,
  onEmbeddingDraftChange,
  onVisionDraftChange,
  onOcrDraftChange,
  onFetchModels,
  onFetchEmbeddingModels,
  onFetchVisionModels,
  onFetchOcrModels,
  onTestProvider,
  onTestEmbeddingProvider,
  onTestVisionProvider,
  onTestOcrProvider,
  onSaveProvider,
  onSaveEmbeddingProvider,
  onSaveVisionProvider,
  onSaveOcrProvider,
  onReindexActiveSemester,
  onDismissEmbeddingReindexNotice,
  onToggleOpenAiResponsesGateway,
}: {
  providers: ModelProviderConfig[];
  selectedProviderId: string;
  selectedEmbeddingProviderId: string;
  selectedVisionProviderId: string;
  selectedOcrProviderId: string;
  creatingProvider: boolean;
  creatingEmbeddingProvider: boolean;
  creatingVisionProvider: boolean;
  creatingOcrProvider: boolean;
  draft: ProviderDraftInput;
  embeddingDraft: ProviderDraftInput;
  visionDraft: ProviderDraftInput;
  ocrDraft: ProviderDraftInput;
  models: ProviderModel[];
  visionModels: ProviderModel[];
  ocrModels: ProviderModel[];
  statusLine: string;
  embeddingStatusLine: string;
  visionStatusLine: string;
  ocrStatusLine: string;
  embeddingReindexNotice: string;
  embeddingLockedByIndexing: boolean;
  reindexingActiveSemester: boolean;
  busyActions: Partial<Record<ProviderBusyAction, boolean>>;
  agentGatewayStatus: AgentGatewayStatus | null;
  agentGatewayBusy: boolean;
  onSelectProvider: (provider: ModelProviderConfig) => void;
  onSelectEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onSelectVisionProvider: (provider: ModelProviderConfig) => void;
  onSelectOcrProvider: (provider: ModelProviderConfig) => void;
  onNewProvider: () => void;
  onNewEmbeddingProvider: () => void;
  onNewVisionProvider: () => void;
  onNewOcrProvider: () => void;
  onCloseProviderEditor: () => void;
  onCloseEmbeddingEditor: () => void;
  onCloseVisionEditor: () => void;
  onCloseOcrEditor: () => void;
  onToggleProvider: (provider: ModelProviderConfig) => void;
  onToggleOfficialProviders: () => void;
  onToggleEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onToggleVisionProvider: (provider: ModelProviderConfig) => void;
  onToggleOcrProvider: (provider: ModelProviderConfig) => void;
  onDeleteProvider: (provider: ModelProviderConfig) => void;
  onDeleteEmbeddingProvider: (provider: ModelProviderConfig) => void;
  onDeleteVisionProvider: (provider: ModelProviderConfig) => void;
  onDeleteOcrProvider: (provider: ModelProviderConfig) => void;
  onDraftChange: (draft: ProviderDraftInput) => void;
  onEmbeddingDraftChange: (draft: ProviderDraftInput) => void;
  onVisionDraftChange: (draft: ProviderDraftInput) => void;
  onOcrDraftChange: (draft: ProviderDraftInput) => void;
  onFetchModels: () => void;
  onFetchEmbeddingModels: () => void;
  onFetchVisionModels: () => void;
  onFetchOcrModels: () => void;
  onTestProvider: () => void;
  onTestEmbeddingProvider: () => void;
  onTestVisionProvider: () => void;
  onTestOcrProvider: () => void;
  onSaveProvider: () => void;
  onSaveEmbeddingProvider: () => void;
  onSaveVisionProvider: () => void;
  onSaveOcrProvider: () => void;
  onReindexActiveSemester: () => void;
  onDismissEmbeddingReindexNotice: () => void;
  onToggleOpenAiResponsesGateway: (enabled: boolean) => void;
}) {
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedEmbeddingProvider = providers.find((provider) => provider.id === selectedEmbeddingProviderId);
  const selectedVisionProvider = providers.find((provider) => provider.id === selectedVisionProviderId);
  const selectedOcrProvider = providers.find((provider) => provider.id === selectedOcrProviderId);
  const officialAgentProviders = providers.filter(isOfficialAgentProvider);
  const enabledOfficialProvider = officialAgentProviders.find((provider) => provider.enabled);
  const userAgentProviders = providers.filter((provider) => provider.purpose === "agent" && !isOfficialAgentProvider(provider));
  const embeddingProviders = providers.filter((provider) => provider.purpose === "embedding");
  const visionProviders = providers.filter((provider) => provider.purpose === "vision");
  const ocrProviders = providers.filter((provider) => provider.purpose === "ocr");
  const providerEditorOpen = creatingProvider || Boolean(selectedProvider);
  const embeddingEditorOpen = creatingEmbeddingProvider || Boolean(selectedEmbeddingProvider);
  const visionEditorOpen = creatingVisionProvider || Boolean(selectedVisionProvider);
  const ocrEditorOpen = creatingOcrProvider || Boolean(selectedOcrProvider);
  const runtimeBanner = null;
  const isBusy = (action: ProviderBusyAction) => Boolean(busyActions[action]);
  const isPurposeBlockingBusy = (purpose: ProviderPurpose) => {
    const prefix = purpose === "agent" ? "agent" : purpose === "vision" ? "vision" : purpose === "ocr" ? "ocr" : "embedding";
    return Object.entries(busyActions).some(([action, busy]) => Boolean(busy) && action.startsWith(`${prefix}-`) && action !== `${prefix}-toggle`);
  };
  const agentBusy = isPurposeBlockingBusy("agent");
  const embeddingBusy = isPurposeBlockingBusy("embedding") || embeddingLockedByIndexing;
  const visionBusy = isPurposeBlockingBusy("vision");
  const ocrBusy = isPurposeBlockingBusy("ocr");
  const agentToggleBusy = isBusy("agent-toggle");
  const officialToggleBusy = isBusy("agent-official-toggle");
  const embeddingToggleBusy = isBusy("embedding-toggle");
  const visionToggleBusy = isBusy("vision-toggle");
  const ocrToggleBusy = isBusy("ocr-toggle");
  const [visionTestBusy, setVisionTestBusy] = useState<VisionTestKind | null>(null);
  const [visionTestResult, setVisionTestResult] = useState<VisionTestResult | null>(null);
  const [visionTestError, setVisionTestError] = useState("");
  const [manualAgentModel, setManualAgentModel] = useState("");
  const [manualVisionModel, setManualVisionModel] = useState("");
  const [manualOcrModel, setManualOcrModel] = useState("");

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

  function addManualOcrModel() {
    const modelId = manualOcrModel.trim();
    if (!modelId) return;
    onOcrDraftChange(addDraftModel(ocrDraft, modelId));
    setManualOcrModel("");
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

  if (selectedOcrProvider && isOfficialProvider(selectedOcrProvider) && !creatingOcrProvider) {
    return (
      <div className="space-y-4">
        {runtimeBanner}
        <section className="rounded-lg border bg-background/70 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onCloseOcrEditor}
                disabled={ocrBusy}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回配置列表
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4" />
                官方 OCR 配置
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground" title={officialProviderGroupLabel(selectedOcrProvider)}>
                {officialProviderGroupLabel(selectedOcrProvider)}
              </div>
            </div>
            <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10px] font-medium", ocrDraft.enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
              {ocrDraft.enabled ? "已启用" : "已关闭"}
            </span>
          </div>

          {(ocrDraft.models?.length ?? 0) > 0 && (
            <ModelPicker
              providerKind={ocrDraft.providerKind}
              baseUrl={ocrDraft.baseUrl}
              selectedModel={ocrDraft.selectedModel}
              models={ocrDraft.models ?? []}
              onPick={(model) => onOcrDraftChange({ ...ocrDraft, selectedModel: model.id })}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={<Save className={cx("h-3.5 w-3.5", isBusy("ocr-save") && "animate-pulse")} />} label="保存模型选择" onClick={onSaveOcrProvider} primary disabled={ocrBusy} />
          </div>
          {ocrStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{ocrStatusLine}</div>}
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

  if (ocrEditorOpen) {
    return (
      <OcrProviderEditor
        runtimeBanner={runtimeBanner}
        creatingOcrProvider={creatingOcrProvider}
        selectedOcrProvider={selectedOcrProvider}
        selectedOcrProviderId={selectedOcrProviderId}
        ocrDraft={ocrDraft}
        ocrModels={ocrModels}
        manualOcrModel={manualOcrModel}
        ocrStatusLine={ocrStatusLine}
        ocrBusy={ocrBusy}
        isBusy={isBusy}
        adapterLabel={adapterLabel}
        onClose={onCloseOcrEditor}
        onDeleteOcrProvider={onDeleteOcrProvider}
        onOcrDraftChange={onOcrDraftChange}
        onProviderKindChange={(value) => onOcrDraftChange(applyProviderPreset(ocrDraft, value))}
        onManualOcrModelChange={setManualOcrModel}
        onAddManualOcrModel={addManualOcrModel}
        onToggleModel={(model) => onOcrDraftChange(toggleDraftModel(ocrDraft, model.id))}
        onMakeDefaultModel={(model) => onOcrDraftChange({ ...ocrDraft, selectedModel: model.id })}
        onUpdateModel={(model) => onOcrDraftChange(updateDraftModel(ocrDraft, model))}
        onRemoveModel={(model) => onOcrDraftChange(removeDraftModel(ocrDraft, model.id))}
        onFetchOcrModels={onFetchOcrModels}
        onTestOcrProvider={onTestOcrProvider}
        onSaveOcrProvider={onSaveOcrProvider}
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

        <section className="rounded-lg border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <ScanText className="h-3.5 w-3.5" />
                OCR
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">用于扫描课件、图片页和低文本覆盖文件的索引补识别。</div>
            </div>
            <IconActionButton icon={<Plus className="h-3.5 w-3.5" />} label="新建 OCR" onClick={onNewOcrProvider} disabled={ocrBusy} />
          </div>

          <div className={cx(PROVIDER_PROFILE_LIST_HEIGHT_CLASS, "space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] brevyn-scrollbar")}>
            {ocrProviders.map((provider) => (
              <ProviderProfileRow
                key={provider.id}
                provider={provider}
                active={provider.enabled}
                statusLabel={provider.enabled ? "已启用" : "已关闭"}
                statusOn={Boolean(provider.enabled)}
                onSelect={() => onSelectOcrProvider(provider)}
                onEdit={() => onSelectOcrProvider(provider)}
                onDelete={() => onDeleteOcrProvider(provider)}
                onToggle={() => onToggleOcrProvider(provider)}
                toggleDisabled={ocrBusy || ocrToggleBusy}
              />
            ))}
            {ocrProviders.length === 0 && <div className="rounded-lg border border-dashed bg-card px-3 py-8 text-center text-xs text-muted-foreground">暂无 OCR 配置。新建后可用于课程文件索引前的扫描件补识别。</div>}
          </div>
          {ocrStatusLine && <div className="mt-3 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{ocrStatusLine}</div>}
        </section>
      </div>
    </div>
  );
}
