import type { PointerEvent } from "react";
import type { FilePreview } from "@/types/domain";
import { FilePreviewPane } from "./FilePreviewPane";

export function FilePreviewRail({
  collapsed,
  preview,
  width,
  resizing,
  onResizeStart,
}: {
  collapsed: boolean;
  preview: FilePreview | null;
  width: number;
  resizing?: boolean;
  onResizeStart: (event: PointerEvent) => void;
}) {
  return (
    <aside
      aria-hidden={collapsed}
      className={`group/rail relative hidden shrink-0 flex-col overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 transition-[width,opacity,margin,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] xl:flex ${collapsed ? "pointer-events-none -mr-2 translate-x-3 border-transparent opacity-0 shadow-none ring-0" : "opacity-100"} ${resizing ? "select-none ring-2 ring-ring/20" : ""}`}
      style={{ width: collapsed ? 0 : width }}
    >
      <button
        type="button"
        tabIndex={collapsed ? -1 : 0}
        className="absolute left-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none bg-transparent focus:outline-none"
        aria-label="Resize file preview rail"
        onPointerDown={onResizeStart}
      >
        <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-px rounded-full bg-foreground/20 opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100" />
      </button>
      <div className={`flex min-h-0 flex-1 transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
        <FilePreviewPane preview={preview} />
      </div>
    </aside>
  );
}
