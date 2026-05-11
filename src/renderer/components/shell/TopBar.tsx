import type { Course, Thread, BrevynTask } from "@/types/domain";

export function TopBar({
  course,
  task,
  thread,
  workspaceScope,
}: {
  course?: Course;
  task?: BrevynTask;
  thread?: Thread;
  workspaceScope: string;
}) {
  const title = task?.title || thread?.title || course?.name || "Brevyn";
  const subtitleParts = [
    task ? course?.name : undefined,
    thread?.title && thread.title !== title ? thread.title : undefined,
    task || thread?.taskId ? "Task workspace" : course?.workspaceKind === "semester_home" || thread?.threadType === "semester_home" ? "Semester workspace" : course ? "Course workspace" : workspaceScope,
  ].filter(Boolean);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-card/75 px-4 backdrop-blur transition-colors duration-200">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {subtitleParts.length > 0 ? subtitleParts.join(" · ") : "No active session"}
        </div>
      </div>
    </header>
  );
}
