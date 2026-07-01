import { Activity, BarChart3, Clock3, Database, ReceiptText, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cx } from "@/lib/cn";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import type { LocalModelUsageModelSummary, LocalModelUsageRecord, LocalModelUsageSummary, LocalModelUsageTotals } from "../../../../types/domain";

export function BillingRecordsSettingsPage() {
  const [recordTab, setRecordTab] = useState<"recharge" | "model">("recharge");
  const [usageSummary, setUsageSummary] = useState<LocalModelUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");

  const loadUsageSummary = async () => {
    setUsageLoading(true);
    setUsageError("");
    try {
      setUsageSummary(await window.brevyn.agent.usageSummary());
    } catch (error) {
      setUsageError(errorMessage(error, "加载本地使用统计失败。"));
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    void loadUsageSummary();
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <section className="overflow-hidden rounded-[var(--radius-panel)] bg-card p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.55)]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border/45 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Usage
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">使用记录</div>
            <div className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
              查看本机已保存会话的模型用量统计；官方扣费流水以后直接以 sub2 数据为准。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-[var(--radius-control)] bg-background p-1 shadow-inner ring-1 ring-black/[0.04]">
              <RecordTabButton
                active={recordTab === "recharge"}
                icon={<ReceiptText className="h-3.5 w-3.5" />}
                label="充值记录"
                onClick={() => setRecordTab("recharge")}
              />
              <RecordTabButton
                active={recordTab === "model"}
                icon={<Activity className="h-3.5 w-3.5" />}
                label="模型使用记录"
                onClick={() => setRecordTab("model")}
              />
            </div>
            {recordTab === "model" && (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-background px-3 text-[11px] font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)] transition hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void loadUsageSummary()}
                disabled={usageLoading}
              >
                <RefreshCw className={cx("h-3.5 w-3.5", usageLoading && "animate-spin")} />
                刷新
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-card)] bg-background shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
          {recordTab === "recharge" ? (
            <RecordEmptyState
              icon={<ReceiptText className="h-4 w-4" />}
              title="暂无充值记录"
              description="后面会接入 sub2 账单流水，显示兑换码充值、后台补余额和余额调整。"
              columns={["时间", "类型", "金额", "到账后余额"]}
            />
          ) : (
            <LocalModelUsagePanel
              summary={usageSummary}
              loading={usageLoading}
              error={usageError}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function LocalModelUsagePanel({
  summary,
  loading,
  error,
}: {
  summary: LocalModelUsageSummary | null;
  loading: boolean;
  error: string;
}) {
  const topModels = summary?.models ?? [];
  const recentRecords = summary?.recentRecords ?? [];
  const maxModelTokens = useMemo(() => Math.max(...topModels.map((model) => model.totalTokens), 1), [topModels]);

  if (loading && !summary) {
    return (
      <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 py-8 text-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <div className="mt-3 text-sm font-semibold text-foreground">正在读取本地统计</div>
        <div className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">正在扫描本机已保存的会话记录。</div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-destructive/10 text-destructive">
          <Activity className="h-4 w-4" />
        </div>
        <div className="mt-3 text-sm font-semibold text-foreground">本地统计加载失败</div>
        <div className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!summary || summary.requestCount <= 0) {
    return (
      <RecordEmptyState
        icon={<Activity className="h-4 w-4" />}
        title="暂无模型使用记录"
        description="本地统计只读取已保存会话中的模型用量。开始一次对话后，这里会显示 Token 和模型分布。"
        columns={["时间", "模型", "Token", "会话"]}
      />
    );
  }

  return (
    <div className="p-3">
      <div className="grid gap-2 md:grid-cols-4">
        <UsageMetricCard label="今日" value={formatTokenCount(summary.today.totalTokens)} detail={formatTokenBreakdown(summary.today)} icon={<Clock3 className="h-3.5 w-3.5" />} />
        <UsageMetricCard label="近 7 天" value={formatTokenCount(summary.last7Days.totalTokens)} detail={`${summary.requestCount ? formatTokenCount(summary.last7Days.contextInputTokens) : "0"} 上下文输入`} icon={<BarChart3 className="h-3.5 w-3.5" />} />
        <UsageMetricCard label="近 30 天" value={formatTokenCount(summary.last30Days.totalTokens)} detail={formatTokenBreakdown(summary.last30Days)} icon={<Activity className="h-3.5 w-3.5" />} />
        <UsageMetricCard label="总计" value={formatTokenCount(summary.totals.totalTokens)} detail={`${summary.requestCount} 次记录 · ${summary.modelCount} 个模型`} icon={<Database className="h-3.5 w-3.5" />} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <section className="rounded-[var(--radius-card)] bg-card/70 p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-foreground">模型排行</div>
            <div className="text-[10px] text-muted-foreground">按 Token 总量</div>
          </div>
          <div className="space-y-2.5">
            {topModels.slice(0, 7).map((model) => (
              <ModelUsageRow key={`${model.providerId || ""}:${model.modelId}`} model={model} maxTokens={maxModelTokens} />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[var(--radius-card)] bg-card/70 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]">
          <div className="flex items-center justify-between gap-3 border-b border-border/45 px-3 py-2.5">
            <div className="text-xs font-semibold text-foreground">最近记录</div>
            <div className="text-[10px] text-muted-foreground">本机保存的会话</div>
          </div>
          <div className="grid grid-cols-[0.9fr_minmax(0,1fr)_0.72fr_minmax(0,1fr)] gap-2 border-b border-border/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>时间</span>
            <span>模型</span>
            <span className="text-right">Token</span>
            <span>会话</span>
          </div>
          <div className="max-h-[18.5rem] overflow-auto">
            {recentRecords.slice(0, 24).map((record) => (
              <UsageRecordRow key={record.id} record={record} />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-3 rounded-[var(--radius-control)] bg-muted/55 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
        本地统计仅基于这台设备已保存的会话记录，不等同于 sub2 的最终扣费流水。
      </div>
    </div>
  );
}

function RecordTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-badge)] px-3 text-[11px] font-semibold transition active:scale-[0.98]",
        active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function UsageMetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-card/70 p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ModelUsageRow({ model, maxTokens }: { model: LocalModelUsageModelSummary; maxTokens: number }) {
  const width = Math.max(4, Math.min(100, (model.totalTokens / maxTokens) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[11px] font-semibold text-foreground">{model.modelId}</div>
        <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{formatTokenCount(model.totalTokens)}</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/75" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{model.requestCount} 次记录</span>
        <span>{formatDateShort(model.lastUsedAt)}</span>
      </div>
    </div>
  );
}

function UsageRecordRow({ record }: { record: LocalModelUsageRecord }) {
  return (
    <div className="grid grid-cols-[0.9fr_minmax(0,1fr)_0.72fr_minmax(0,1fr)] gap-2 border-b border-border/25 px-3 py-2 text-[11px] last:border-b-0">
      <span className="text-muted-foreground">{formatDateShort(record.createdAt)}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{record.modelId}</span>
      <span className="text-right tabular-nums text-foreground">{formatTokenCount(record.totalTokens)}</span>
      <span className="min-w-0 truncate text-muted-foreground">{record.threadTitle || "未命名会话"}</span>
    </div>
  );
}

function RecordEmptyState({
  icon,
  title,
  description,
  columns,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  columns: string[];
}) {
  return (
    <div>
      <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr] gap-2 border-b border-border/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {columns.map((column) => (
          <span key={column} className="truncate">{column}</span>
        ))}
      </div>
      <div className="flex min-h-[16rem] flex-col items-center justify-center px-5 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(tokens)));
}

function formatTokenBreakdown(totals: LocalModelUsageTotals): string {
  const parts = [
    totals.inputTokens > 0 ? `输入 ${formatTokenCount(totals.inputTokens)}` : "",
    totals.outputTokens > 0 ? `输出 ${formatTokenCount(totals.outputTokens)}` : "",
    totals.cacheReadTokens > 0 ? `缓存 ${formatTokenCount(totals.cacheReadTokens)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "暂无记录";
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDateShort(value?: string): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
