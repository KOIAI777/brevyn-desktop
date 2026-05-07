import { ChevronRight } from "lucide-react";
import type { Course, Thread, UclawTask } from "@/types/domain";

export function TopBar({
  course,
  task,
  thread,
  workspaceScope,
}: {
  course?: Course;
  task?: UclawTask;
  thread?: Thread;
  workspaceScope: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-card/75 px-4 backdrop-blur transition-colors duration-200">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="truncate">{course?.name || "UCLAW"}</span>
          {task && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">{task.title}</span>
            </>
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{thread?.title || "No thread"} · {workspaceScope} · Electron local-first</div>
      </div>
    </header>
  );
}
