import { CalendarDays, ChevronRight, Eye, EyeOff, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Course, SemesterWorkspace, Thread, BrevynTask } from "@/types/domain";

export function AppTitleBar({
  course,
  task,
  thread,
  semester,
  sidebarCollapsed,
  fileRailCollapsed,
  previewRailCollapsed,
  onToggleSidebar,
  onToggleFileRail,
  onTogglePreviewRail,
}: {
  course?: Course;
  task?: BrevynTask;
  thread?: Thread;
  semester?: SemesterWorkspace | null;
  sidebarCollapsed: boolean;
  fileRailCollapsed: boolean;
  previewRailCollapsed: boolean;
  onToggleSidebar: () => void;
  onToggleFileRail: () => void;
  onTogglePreviewRail: () => void;
}) {
  const threadLabel = thread?.title || "No active session";
  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-card/70 px-2 text-foreground backdrop-blur">
      <div className="w-[76px] shrink-0" />

      {semester && (
        <div className="hidden h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background/65 px-2 text-[11px] font-medium text-muted-foreground sm:flex">
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="max-w-[128px] truncate text-foreground">{semester.term}</span>
        </div>
      )}

      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="min-w-0 flex flex-1 items-center gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">{course?.name || "Brevyn"}</div>
        {task && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 truncate text-sm text-muted-foreground">{task.title}</div>
          </>
        )}
        <span className="hidden text-muted-foreground/50 md:inline">·</span>
        <div className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">{threadLabel}</div>
      </div>

      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onTogglePreviewRail}
          title={previewRailCollapsed ? "Show preview" : "Hide preview"}
        >
          {previewRailCollapsed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onToggleFileRail}
          title={fileRailCollapsed ? "Show file browser" : "Hide file browser"}
        >
          {fileRailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
