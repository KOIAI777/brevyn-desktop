import { Activity, BarChart3, ChevronLeft, ChevronRight, Clock3, Database, ReceiptText, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cx } from "@/lib/cn";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import type {
  Sub2BillingRecord,
  Sub2BillingRecordsSummary,
  Sub2UsageDashboardStats,
  Sub2UsageLog,
  Sub2UsageSummary,
} from "../../../../types/domain";

interface UsageModelRow {
  model: string;
  requestCount: number;
  totalTokens: number;
  totalActualCost: number;
  lastUsedAt: string;
}

interface UsageModelSlice extends UsageModelRow {
  color: string;
  share: number;
}

const MODEL_DONUT_COLORS = [
  "hsl(var(--primary))",
  "hsl(199 78% 52%)",
  "hsl(151 58% 42%)",
  "hsl(263 60% 60%)",
  "hsl(38 86% 52%)",
  "hsl(348 72% 58%)",
];

export function BillingRecordsSettingsPage() {
  const [recordTab, setRecordTab] = useState<"recharge" | "model">("recharge");
  const [usageSummary, setUsageSummary] = useState<Sub2UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");
  const [usagePage, setUsagePage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(20);
  const [billingSummary, setBillingSummary] = useState<Sub2BillingRecordsSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState("");

  const loadUsageSummary = async (page = usagePage, pageSize = usagePageSize) => {
    setUsageLoading(true);
    setUsageError("");
    try {
      const nextSummary = await window.brevyn.sub2.usageSummary({ page, pageSize });
      setUsageSummary(nextSummary);
      setUsagePage(nextSummary.pagination.page || page);
      setUsagePageSize(nextSummary.pagination.pageSize || pageSize);
    } catch (error) {
      setUsageError(errorMessage(error, "加载模型使用记录失败。"));
    } finally {
      setUsageLoading(false);
    }
  };

  const loadBillingRecords = async () => {
    setBillingLoading(true);
    setBillingError("");
    try {
      setBillingSummary(await window.brevyn.sub2.billingRecords());
    } catch (error) {
      setBillingError(errorMessage(error, "加载充值记录失败。"));
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    void loadUsageSummary();
    void loadBillingRecords();
  }, []);

  const activeLoading = recordTab === "recharge" ? billingLoading : usageLoading;
  const refreshActiveTab = () => {
    if (recordTab === "recharge") void loadBillingRecords();
    else void loadUsageSummary(usagePage, usagePageSize);
  };

  const changeUsagePage = (page: number) => {
    void loadUsageSummary(page, usagePageSize);
  };

  const changeUsagePageSize = (pageSize: number) => {
    setUsagePageSize(pageSize);
    void loadUsageSummary(1, pageSize);
  };

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
              官方账号的充值、兑换和模型扣费流水。
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
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-background px-3 text-[11px] font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)] transition hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={refreshActiveTab}
              disabled={activeLoading}
            >
              <RefreshCw className={cx("h-3.5 w-3.5", activeLoading && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-card)] bg-background shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
          {recordTab === "recharge" ? (
            <Sub2RechargePanel
              summary={billingSummary}
              loading={billingLoading}
              error={billingError}
            />
          ) : (
            <Sub2UsagePanel
              summary={usageSummary}
              loading={usageLoading}
              error={usageError}
              onPageChange={changeUsagePage}
              onPageSizeChange={changeUsagePageSize}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function Sub2UsagePanel({
  summary,
  loading,
  error,
  onPageChange,
  onPageSizeChange,
}: {
  summary: Sub2UsageSummary | null;
  loading: boolean;
  error: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const stats = summary?.stats ?? null;
  const records = summary?.records ?? [];
  const pagination = summary?.pagination ?? { page: 1, pageSize: 20, total: records.length, pages: records.length > 0 ? 1 : 0 };
  const modelRows = useMemo(() => buildUsageModelRows(records), [records]);
  const modelSlices = useMemo(() => buildModelSlices(modelRows), [modelRows]);

  if (loading && !summary) {
    return <RecordsLoadingState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="正在读取模型使用记录" description="正在同步官方账号的 sub2 用量流水。" />;
  }

  if (error && !summary) {
    return <RecordsErrorState icon={<Activity className="h-4 w-4" />} title="模型使用记录加载失败" description={friendlyRecordsError(error)} />;
  }

  if (!stats && records.length === 0) {
    return (
      <RecordEmptyState
        icon={<Activity className="h-4 w-4" />}
        title="暂无模型使用记录"
        description="登录官方账号并使用官方模型后，这里会显示 sub2 扣费流水。"
        columns={["时间", "模型", "Token", "扣费", "类型"]}
      />
    );
  }

  return (
    <div className="p-3">
      {summary?.errors?.length ? <RecordsNotice messages={summary.errors} /> : null}
      <Sub2UsageMetrics stats={stats} />

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <section className="rounded-[var(--radius-card)] bg-card/70 p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-foreground">当前页模型</div>
            <div className="text-[10px] text-muted-foreground">按当前页记录</div>
          </div>
          {modelRows.length > 0 ? (
            <ModelUsageDonut slices={modelSlices} />
          ) : (
            <div className="flex min-h-[9rem] items-center justify-center text-[11px] text-muted-foreground">暂无最近模型记录</div>
          )}
        </section>

        <section className="overflow-hidden rounded-[var(--radius-card)] bg-card/70 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]">
          <div className="flex items-center justify-between gap-3 border-b border-border/45 px-3 py-2.5">
            <div className="text-xs font-semibold text-foreground">最近扣费</div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
              <span>{formatUsagePageLabel(pagination, summary?.updatedAt)}</span>
            </div>
          </div>
          <div className="grid grid-cols-[0.85fr_minmax(0,1fr)_0.72fr_0.72fr_0.68fr] gap-2 border-b border-border/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>时间</span>
            <span>模型</span>
            <span className="text-right">Token</span>
            <span className="text-right">扣费</span>
            <span>类型</span>
          </div>
          <div className="max-h-[18.5rem] overflow-auto">
            {records.length > 0 ? records.map((record) => (
              <Sub2UsageRecordRow key={record.id} record={record} />
            )) : (
              <div className="flex min-h-[9rem] items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                暂无最近扣费记录
              </div>
            )}
          </div>
          <UsagePaginationControls
            pagination={pagination}
            loading={loading}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </section>
      </div>
    </div>
  );
}

function Sub2RechargePanel({
  summary,
  loading,
  error,
}: {
  summary: Sub2BillingRecordsSummary | null;
  loading: boolean;
  error: string;
}) {
  const records = summary?.records ?? [];
  const orders = summary?.orders ?? [];
  const redeemHistory = summary?.redeemHistory ?? [];
  const creditedAmount = records.reduce((sum, record) => sum + (record.amountUsd ?? 0), 0);
  const pendingOrders = orders.filter((order) => ["PENDING", "PAID", "RECHARGING", "REFUND_REQUESTED", "REFUNDING"].includes(order.status)).length;

  if (loading && !summary) {
    return <RecordsLoadingState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="正在读取充值记录" description="正在同步官方账号的订单和兑换记录。" />;
  }

  if (error && !summary) {
    return <RecordsErrorState icon={<ReceiptText className="h-4 w-4" />} title="充值记录加载失败" description={friendlyRecordsError(error)} />;
  }

  if (records.length === 0) {
    return (
      <RecordEmptyState
        icon={<ReceiptText className="h-4 w-4" />}
        title="暂无充值记录"
        description="登录官方账号后，这里会显示在线充值、兑换码和余额调整记录。"
        columns={["时间", "类型", "金额/权益", "状态", "来源"]}
      />
    );
  }

  return (
    <div className="p-3">
      {summary?.errors?.length ? <RecordsNotice messages={summary.errors} /> : null}
      <div className="grid gap-2 md:grid-cols-4">
        <UsageMetricCard label="已入账" value={formatUsd(creditedAmount)} detail="已完成订单和兑换变动" icon={<Wallet className="h-3.5 w-3.5" />} />
        <UsageMetricCard label="支付订单" value={formatNumber(orders.length)} detail={`${pendingOrders} 笔待处理`} icon={<ReceiptText className="h-3.5 w-3.5" />} />
        <UsageMetricCard label="兑换记录" value={formatNumber(redeemHistory.length)} detail="兑换码和后台调整" icon={<Database className="h-3.5 w-3.5" />} />
        <UsageMetricCard label="最近同步" value={formatDateShort(summary?.updatedAt)} detail="sub2 官方账号" icon={<Clock3 className="h-3.5 w-3.5" />} />
      </div>

      <section className="mt-3 overflow-hidden rounded-[var(--radius-card)] bg-card/70 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]">
        <div className="grid grid-cols-[0.85fr_minmax(0,1.1fr)_0.8fr_0.72fr_0.68fr] gap-2 border-b border-border/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span>时间</span>
          <span>类型</span>
          <span className="text-right">金额/权益</span>
          <span>状态</span>
          <span>来源</span>
        </div>
        <div className="max-h-[22rem] overflow-auto">
          {records.slice(0, 40).map((record) => (
            <BillingRecordRow key={record.id} record={record} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Sub2UsageMetrics({ stats }: { stats: Sub2UsageDashboardStats | null }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <UsageMetricCard label="今日扣费" value={formatUsd(stats?.todayActualCost ?? 0)} detail={`标准 ${formatUsd(stats?.todayCost ?? 0)}`} icon={<Clock3 className="h-3.5 w-3.5" />} />
      <UsageMetricCard label="今日 Tokens" value={formatTokenCount(stats?.todayTokens ?? 0)} detail={formatSub2TokenBreakdown(stats, "today")} icon={<BarChart3 className="h-3.5 w-3.5" />} />
      <UsageMetricCard label="总扣费" value={formatUsd(stats?.totalActualCost ?? 0)} detail={`${formatNumber(stats?.totalRequests ?? 0)} 次请求`} icon={<Activity className="h-3.5 w-3.5" />} />
      <UsageMetricCard label="当前速率" value={`${formatNumber(stats?.rpm ?? 0)} RPM`} detail={`${formatTokenCount(stats?.tpm ?? 0)} TPM · 平均 ${formatDuration(stats?.averageDurationMs ?? 0)}`} icon={<Database className="h-3.5 w-3.5" />} />
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
      <div className="mt-2 truncate text-xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ModelUsageDonut({ slices }: { slices: UsageModelSlice[] }) {
  const totalTokens = slices.reduce((sum, slice) => sum + slice.totalTokens, 0);
  const totalRequests = slices.reduce((sum, slice) => sum + slice.requestCount, 0);
  const totalCost = slices.reduce((sum, slice) => sum + slice.totalActualCost, 0);
  const gradient = donutGradient(slices);

  return (
    <div className="grid gap-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[8.75rem_minmax(0,1fr)]">
      <div className="flex items-center justify-center">
        <div
          className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_hsl(var(--border)/0.45)]"
          style={{ background: gradient }}
          aria-label="最近模型 Token 占比"
        >
          <div className="flex h-[5.2rem] w-[5.2rem] flex-col items-center justify-center rounded-full bg-card text-center shadow-[0_6px_20px_hsl(var(--foreground)/0.08),inset_0_0_0_1px_hsl(var(--border)/0.55)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tokens</div>
            <div className="mt-0.5 max-w-[4.4rem] truncate text-lg font-semibold tabular-nums text-foreground">{formatTokenCount(totalTokens)}</div>
            <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{totalRequests} 次</div>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        {slices.map((slice) => (
          <ModelUsageSliceRow key={slice.model} slice={slice} />
        ))}
        <div className="rounded-[var(--radius-control)] bg-muted/45 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
          合计 {formatUsd(totalCost)} · 按当前页记录汇总
        </div>
      </div>
    </div>
  );
}

function UsagePaginationControls({
  pagination,
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: Sub2UsageSummary["pagination"];
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const currentPage = Math.max(1, pagination.page);
  const totalPages = Math.max(0, pagination.pages);
  const hasPrevious = currentPage > 1;
  const hasNext = totalPages > 0 ? currentPage < totalPages : pagination.total > currentPage * pagination.pageSize;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/35 px-3 py-2">
      <div className="text-[10px] tabular-nums text-muted-foreground">
        {formatUsageRange(pagination)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-[var(--radius-control)] bg-background shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
          {[20, 50, 100].map((pageSize) => (
            <button
              key={pageSize}
              type="button"
              className={cx(
                "h-7 px-2.5 text-[10px] font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-50",
                pagination.pageSize === pageSize ? "bg-foreground text-background" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
              onClick={() => onPageSizeChange(pageSize)}
              disabled={loading || pagination.pageSize === pageSize}
            >
              {pageSize}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-background text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)] transition hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={loading || !hasPrevious}
          title="上一页"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-14 text-center text-[10px] font-semibold tabular-nums text-foreground">
          {currentPage} / {totalPages || 1}
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-background text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)] transition hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={loading || !hasNext}
          title="下一页"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ModelUsageSliceRow({ slice }: { slice: UsageModelSlice }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
          <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">{slice.model}</span>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{formatPercent(slice.share)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="tabular-nums">{formatTokenCount(slice.totalTokens)} · {slice.requestCount} 次</span>
        <span className="tabular-nums">{formatUsd(slice.totalActualCost)}</span>
      </div>
    </div>
  );
}

function Sub2UsageRecordRow({ record }: { record: Sub2UsageLog }) {
  return (
    <div className="grid grid-cols-[0.85fr_minmax(0,1fr)_0.72fr_0.72fr_0.68fr] gap-2 border-b border-border/25 px-3 py-2 text-[11px] last:border-b-0">
      <span className="text-muted-foreground">{formatDateShort(record.createdAt)}</span>
      <span className="min-w-0 truncate font-medium text-foreground" title={record.model}>{record.requestedModel || record.model}</span>
      <span className="text-right tabular-nums text-foreground">{formatTokenCount(record.totalTokens)}</span>
      <span className="text-right tabular-nums text-foreground">{formatUsd(record.actualCost)}</span>
      <span className="min-w-0 truncate text-muted-foreground">{usageTypeLabel(record)}</span>
    </div>
  );
}

function BillingRecordRow({ record }: { record: Sub2BillingRecord }) {
  return (
    <div className="grid grid-cols-[0.85fr_minmax(0,1.1fr)_0.8fr_0.72fr_0.68fr] gap-2 border-b border-border/25 px-3 py-2 text-[11px] last:border-b-0">
      <span className="text-muted-foreground">{formatDateShort(record.effectiveAt)}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{record.title}</span>
        {record.description ? <span className="block truncate text-[10px] text-muted-foreground">{record.description}</span> : null}
      </span>
      <span className="text-right tabular-nums text-foreground">{record.amountLabel}</span>
      <span className="min-w-0">
        <span className={cx("inline-flex max-w-full rounded-[var(--radius-badge)] px-2 py-0.5 text-[10px] font-semibold", statusBadgeClass(record.status))}>
          <span className="truncate">{record.statusLabel}</span>
        </span>
      </span>
      <span className="min-w-0 truncate text-muted-foreground">{record.source === "payment_order" ? "支付订单" : "兑换记录"}</span>
    </div>
  );
}

function RecordsLoadingState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 py-8 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

function RecordsErrorState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] bg-destructive/10 text-destructive">
        {icon}
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

function RecordsNotice({ messages }: { messages: string[] }) {
  return (
    <div className="mb-3 rounded-[var(--radius-control)] bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
      {messages.join("；")}
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
      <div
        className="grid gap-2 border-b border-border/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
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

function buildUsageModelRows(records: Sub2UsageLog[]): UsageModelRow[] {
  const byModel = new Map<string, UsageModelRow>();
  for (const record of records) {
    const model = record.requestedModel || record.model || "unknown";
    const existing = byModel.get(model) ?? {
      model,
      requestCount: 0,
      totalTokens: 0,
      totalActualCost: 0,
      lastUsedAt: record.createdAt,
    };
    existing.requestCount += 1;
    existing.totalTokens += record.totalTokens;
    existing.totalActualCost += record.actualCost;
    if (Date.parse(record.createdAt) > Date.parse(existing.lastUsedAt)) existing.lastUsedAt = record.createdAt;
    byModel.set(model, existing);
  }
  return [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

function buildModelSlices(rows: UsageModelRow[]): UsageModelSlice[] {
  const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
  if (totalTokens <= 0) return [];
  const primaryRows = rows.slice(0, 5);
  const otherRows = rows.slice(5);
  const mergedRows = otherRows.length > 0
    ? [
        ...primaryRows,
        {
          model: "其他模型",
          requestCount: otherRows.reduce((sum, row) => sum + row.requestCount, 0),
          totalTokens: otherRows.reduce((sum, row) => sum + row.totalTokens, 0),
          totalActualCost: otherRows.reduce((sum, row) => sum + row.totalActualCost, 0),
          lastUsedAt: otherRows[0]?.lastUsedAt ?? "",
        },
      ]
    : primaryRows;
  return mergedRows.map((row, index) => ({
    ...row,
    color: MODEL_DONUT_COLORS[index % MODEL_DONUT_COLORS.length],
    share: row.totalTokens / totalTokens,
  }));
}

function donutGradient(slices: UsageModelSlice[]): string {
  if (slices.length === 0) return "hsl(var(--muted))";
  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    const end = cursor + slice.share * 360;
    cursor = end;
    return `${slice.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });
  if (cursor < 359.9) stops.push(`hsl(var(--muted)) ${cursor.toFixed(1)}deg 360deg`);
  return `conic-gradient(${stops.join(", ")})`;
}

function formatSub2TokenBreakdown(stats: Sub2UsageDashboardStats | null, scope: "today" | "total"): string {
  const input = scope === "today" ? stats?.todayInputTokens ?? 0 : stats?.totalInputTokens ?? 0;
  const output = scope === "today" ? stats?.todayOutputTokens ?? 0 : stats?.totalOutputTokens ?? 0;
  const cacheCreation = scope === "today" ? stats?.todayCacheCreationTokens ?? 0 : stats?.totalCacheCreationTokens ?? 0;
  const cacheRead = scope === "today" ? stats?.todayCacheReadTokens ?? 0 : stats?.totalCacheReadTokens ?? 0;
  const parts = [
    input > 0 ? `输入 ${formatTokenCount(input)}` : "",
    output > 0 ? `输出 ${formatTokenCount(output)}` : "",
    cacheCreation + cacheRead > 0 ? `缓存 ${formatTokenCount(cacheCreation + cacheRead)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "暂无记录";
}

function usageTypeLabel(record: Sub2UsageLog): string {
  if (record.imageCount > 0) return `${record.imageCount} 张图片`;
  if (record.billingMode === "per_request") return "按次";
  if (record.billingMode === "image") return "图片";
  const requestType = (record.requestType || "").toLowerCase();
  if (requestType.includes("embedding")) return "Embedding";
  if (requestType.includes("ocr")) return "OCR";
  if (requestType.includes("vision")) return "Vision";
  return record.stream ? "流式" : "请求";
}

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (["completed", "paid", "used", "success"].includes(normalized)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["pending", "recharging", "refund_requested", "refunding", "active"].includes(normalized)) return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (["failed", "expired", "cancelled", "refunded", "refund_failed"].includes(normalized)) return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

function friendlyRecordsError(error: string): string {
  if (error.includes("请先登录")) return "登录官方账号后显示这部分记录。";
  return error;
}

function formatUsagePageLabel(pagination: Sub2UsageSummary["pagination"], updatedAt?: string): string {
  const page = Math.max(1, pagination.page);
  const pages = Math.max(1, pagination.pages || 1);
  return `第 ${page} / ${pages} 页 · ${formatDateShort(updatedAt)}`;
}

function formatUsageRange(pagination: Sub2UsageSummary["pagination"]): string {
  const page = Math.max(1, pagination.page);
  const pageSize = Math.max(1, pagination.pageSize);
  const total = Math.max(0, pagination.total);
  if (total <= 0) return "暂无记录";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `第 ${formatNumber(start)}-${formatNumber(end)} 条，共 ${formatNumber(total)} 条`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return formatNumber(Math.max(0, Math.round(tokens)));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value >= 0.995) return "100%";
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function formatUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  return `${sign}$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount >= 100 ? 0 : 2,
    maximumFractionDigits: amount >= 100 ? 2 : 4,
  }).format(amount)}`;
}

function formatDuration(value: number): string {
  if (value <= 0) return "0 ms";
  if (value >= 1000) return `${trimNumber(value / 1000)} s`;
  return `${Math.round(value)} ms`;
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
