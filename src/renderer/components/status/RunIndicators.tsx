import { BookOpen, Circle, Clock3, Code2, FileText, Loader2 } from "lucide-react";
import type { ContextWindowReport, RunStatus, UclawTask } from "@/types/domain";
import { cx } from "@/lib/cn";
import { isRunning, timelineStatusText } from "@/lib/run-status";

export function TaskTypeIcon({ task }: { task: UclawTask }) {
  const iconClass = "h-3 w-3 shrink-0 opacity-80";
  if (task.taskType === "exam") return <Clock3 className={iconClass} />;
  if (task.taskType === "lecture") return <BookOpen className={iconClass} />;
  if (task.taskType === "project") return <Code2 className={iconClass} />;
  return <FileText className={iconClass} />;
}

export function StatusPill({ status }: { status: UclawTask["status"] }) {
  const label = status === "due_soon" ? "due" : status === "in_progress" ? "active" : status === "done" ? "done" : "new";
  return <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">{label}</span>;
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const running = isRunning(status);
  return (
    <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-md border bg-background/70 px-2 text-[11px] text-muted-foreground", status === "waiting_approval" && "border-amber-300 bg-amber-50 text-amber-800")}>
      {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
      {timelineStatusText(status)}
    </span>
  );
}

export function RunDot({ status }: { status: RunStatus }) {
  if (isRunning(status)) {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-500" />;
  }

  const tone =
    status === "waiting_approval"
      ? "bg-amber-500"
      : status === "failed"
        ? "bg-red-500"
        : status === "completed" || status === "idle"
          ? "bg-emerald-500"
          : "bg-muted-foreground/40";
  return <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", tone)} />;
}

export function ContextTokenRing({ report }: { report: ContextWindowReport | null }) {
  const percent = report?.percent || 0;
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * percent) / 100;
  const tone = percent >= 80 ? "text-amber-500" : percent > 0 ? "text-muted-foreground" : "text-muted-foreground/40";

  return (
    <div className={cx("relative inline-flex h-8 w-8 items-center justify-center rounded-md", tone)} title={`${report?.tokens.toLocaleString() || 0} / ${report?.budget.toLocaleString() || 0} tokens`}>
      <svg viewBox="0 0 14 14" className="h-4 w-4 -rotate-90">
        <circle cx="7" cy="7" r={radius} className="stroke-muted" strokeWidth="2" fill="none" />
        <circle cx="7" cy="7" r={radius} className="stroke-current" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
    </div>
  );
}
