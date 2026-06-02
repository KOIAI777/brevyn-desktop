import { AlertCircle, CheckCircle2, Clock3, Loader2, MinusCircle, XCircle } from "lucide-react";
import { memo } from "react";
import type { FileIndexingStatus, WorkspaceFileNode } from "@/types/domain";
import { cx } from "@/lib/cn";

export const FileIndexingBadge = memo(function FileIndexingBadge({ file, compact = false }: { file: WorkspaceFileNode; compact?: boolean }) {
  if (file.kind === "folder") return null;
  if (!isRagEligibleFile(file)) return null;
  const status = file.indexingStatus || "idle";
  if (status === "idle" && compact) return null;
  const label = statusLabel(status);
  const message = file.indexingError || file.indexingWarning || label;
  const Icon = statusIcon(status);
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none",
        statusTone(status),
      )}
      title={message}
    >
      <Icon className={cx("h-3 w-3", status === "indexing" && "animate-spin")} />
      {!compact && <span>{label}</span>}
    </span>
  );
}, areFileIndexingBadgePropsEqual);

function areFileIndexingBadgePropsEqual(
  a: { file: WorkspaceFileNode; compact?: boolean },
  b: { file: WorkspaceFileNode; compact?: boolean },
): boolean {
  return (
    a.compact === b.compact &&
    a.file.kind === b.file.kind &&
    a.file.ragEligible === b.file.ragEligible &&
    a.file.indexedAt === b.file.indexedAt &&
    a.file.indexingStatus === b.file.indexingStatus &&
    a.file.indexingError === b.file.indexingError &&
    a.file.indexingWarning === b.file.indexingWarning
  );
}

function isRagEligibleFile(file: WorkspaceFileNode): boolean {
  if (file.ragEligible === true) return true;
  if (file.ragEligible === false) return false;
  return Boolean(file.indexedAt || (file.indexingStatus && file.indexingStatus !== "idle"));
}

function statusIcon(status: FileIndexingStatus) {
  if (status === "indexed") return CheckCircle2;
  if (status === "indexing") return Loader2;
  if (status === "queued") return Clock3;
  if (status === "failed") return XCircle;
  if (status === "partial") return AlertCircle;
  if (status === "warning") return AlertCircle;
  if (status === "skipped") return MinusCircle;
  if (status === "cancelled") return MinusCircle;
  return Clock3;
}

function statusLabel(status: FileIndexingStatus): string {
  if (status === "indexed") return "已索引";
  if (status === "indexing") return "索引中";
  if (status === "queued") return "排队中";
  if (status === "failed") return "失败";
  if (status === "partial") return "部分索引";
  if (status === "warning") return "警告";
  if (status === "skipped") return "已跳过";
  if (status === "cancelled") return "已取消";
  return "未索引";
}

function statusTone(status: FileIndexingStatus): string {
  if (status === "indexed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "indexing") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "queued") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "partial") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "warning") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "skipped") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-border bg-muted text-muted-foreground";
}
