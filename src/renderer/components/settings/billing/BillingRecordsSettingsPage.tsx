import { Activity, ReceiptText, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cn";

export function BillingRecordsSettingsPage() {
  const [recordTab, setRecordTab] = useState<"recharge" | "model">("recharge");

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
              查看充值到账和模型调用消耗，后续会逐步接入真实流水。
            </div>
          </div>
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
        </div>

        <div className="overflow-hidden rounded-[var(--radius-card)] bg-background shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
          {recordTab === "recharge" ? (
            <RecordEmptyState
              icon={<ReceiptText className="h-4 w-4" />}
              title="暂无充值记录"
              description="后面会接入 Cloud 余额流水，显示兑换码充值、后台补余额和余额调整。"
              columns={["时间", "类型", "金额", "到账后余额"]}
            />
          ) : (
            <RecordEmptyState
              icon={<Activity className="h-4 w-4" />}
              title="暂无模型使用记录"
              description="后面会接入 Sub2 使用明细，显示模型、Token、缓存命中和实际扣费。"
              columns={["时间", "模型", "Token", "扣费"]}
            />
          )}
        </div>
      </section>
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
