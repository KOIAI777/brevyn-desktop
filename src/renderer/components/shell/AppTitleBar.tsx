import { CalendarDays, Eye, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import type { SemesterWorkspace } from "@/types/domain";
import { cx } from "@/lib/cn";

export function AppTitleBar({
  semester,
  fileRailCollapsed,
  previewRailCollapsed,
  onToggleFileRail,
  onTogglePreviewRail,
}: {
  semester?: SemesterWorkspace | null;
  fileRailCollapsed: boolean;
  previewRailCollapsed: boolean;
  onToggleFileRail: () => void;
  onTogglePreviewRail: () => void;
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
      <div className="no-drag ml-auto flex shrink-0 items-center gap-1.5">
        <TitleBarIconButton
          active={!fileRailCollapsed}
          ariaLabel="Toggle file browser"
          title="File browser"
          onClick={onToggleFileRail}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </TitleBarIconButton>
        <TitleBarIconButton
          active={!previewRailCollapsed}
          ariaLabel="Toggle preview"
          title="Preview"
          onClick={onTogglePreviewRail}
        >
          <Eye className="h-3.5 w-3.5" />
        </TitleBarIconButton>
      </div>
    </header>
  );
}

function TitleBarIconButton({
  active,
  ariaLabel,
  title,
  onClick,
  children,
}: {
  active: boolean;
  ariaLabel: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] transition active:scale-[0.98]",
        active
          ? "bg-accent text-foreground shadow-sm ring-1 ring-black/[0.06]"
          : "bg-background/70 text-muted-foreground shadow-sm ring-1 ring-black/[0.04] hover:bg-accent hover:text-foreground",
      )}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
