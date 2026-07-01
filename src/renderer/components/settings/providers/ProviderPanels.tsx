import { Check, Circle, Eye, ShieldCheck, TerminalSquare, ToggleLeft, ToggleRight } from "lucide-react";
import { IconActionButton } from "@/components/settings/shared/SettingsControls";
import { getProviderProfileLogo, resolveModelProviderLogo } from "@/lib/model-provider-logo";
import { cx } from "@/lib/cn";
import type { AgentGatewayStatus, ModelProviderConfig, ProviderKind, ProviderModel, RecognizedAcademicCalendar, RecognizedCourseTimetable } from "../../../../types/domain";
import { ProviderSwitch } from "./ProviderControls";
import { officialProviderGroupLabel, providerDisplayName } from "./providerUtils";

type VisionTestResult = RecognizedAcademicCalendar | RecognizedCourseTimetable;

export function OfficialProviderPanel({
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
  const panelTitle = "Brevyn 官方模型";

  return (
    <section
      className={cx(
        "overflow-hidden rounded-lg border p-3 shadow-sm ring-1",
        enabled
          ? "border-[hsl(var(--status-success)/0.26)] bg-[linear-gradient(135deg,hsl(var(--status-success)/0.13),hsl(var(--card)/0.94)_48%,hsl(var(--surface-warm)/0.76))] ring-[hsl(var(--status-success)/0.11)]"
          : "border-border/70 bg-card/85 ring-border/35",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--status-success)/0.24)] bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))] shadow-sm">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
              {panelTitle}
              <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-medium", enabled ? "bg-[hsl(var(--status-success)/0.14)] text-[hsl(var(--status-success))] shadow-[inset_0_0_0_1px_hsl(var(--status-success)/0.18)]" : "bg-muted text-muted-foreground")}>
                {enabled ? "已启用" : "已关闭"}
              </span>
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground" title={primaryProvider ? `${officialProviderGroupLabel(primaryProvider)} · ${modelCount} 个模型` : "未同步官方模型"}>
              {primaryProvider ? `${officialProviderGroupLabel(primaryProvider)} · ${modelCount} 个模型` : "未同步官方模型"}
            </div>
          </div>
        </div>
        <ProviderSwitch enabled={enabled} label={statusLabel} onClick={onToggle} disabled={busy || providers.length === 0} />
      </div>

      {primaryProvider ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-background/62 p-2 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.035)]">
          <img src={getProviderProfileLogo(primaryProvider)} alt="" className="brevyn-model-logo-tile h-8 w-8 shrink-0 rounded-lg object-contain p-1" />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(primaryProvider)} disabled={busy}>
            <span className="block truncate text-xs font-semibold text-foreground" title={providerDisplayName(primaryProvider)}>{providerDisplayName(primaryProvider)}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {modelCount} 个模型
            </span>
          </button>
          <IconActionButton icon={<Eye className="h-3.5 w-3.5" />} label="查看官方模型" onClick={() => onEdit(primaryProvider)} disabled={busy} />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/50 px-3 py-6 text-center text-xs text-muted-foreground">
          账号同步后会在这里显示官方模型。
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
                provider.enabled ? "border-[hsl(var(--status-success)/0.26)] bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))]" : "border-border/60 bg-background/48 text-muted-foreground hover:bg-accent hover:text-foreground",
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

export function OfficialModelList({
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
            <span className="brevyn-model-logo-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-1">
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

export function AgentGatewayAdvancedPanel({
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
            enabled ? "border-[hsl(var(--status-success)/0.26)] bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))] hover:bg-[hsl(var(--status-success)/0.18)]" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
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

export function VisionTestResultPanel({ result }: { result: VisionTestResult }) {
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
