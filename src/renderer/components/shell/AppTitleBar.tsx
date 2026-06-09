import { CalendarDays } from "lucide-react";
import type { SemesterWorkspace } from "@/types/domain";

export function AppTitleBar({
  semester,
}: {
  semester?: SemesterWorkspace | null;
}) {
  return (
    <header className="drag-region flex h-12 shrink-0 items-center border-b border-border/60 bg-card px-3 text-foreground">
      <div className="w-20 shrink-0" />

      {semester && (
        <div
          className="no-drag hidden h-8 shrink-0 cursor-default items-center gap-2 rounded-[var(--radius-control)] bg-background px-3 text-[13px] font-semibold text-foreground shadow-sm ring-1 ring-black/[0.06] sm:flex"
          title="当前学期"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[128px] truncate">{semester.term}</span>
        </div>
      )}
    </header>
  );
}
