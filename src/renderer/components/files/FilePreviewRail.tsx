import { useEffect, useState, type PointerEvent } from "react";
import type { FilePreview } from "@/types/domain";
import { FilePreviewPane } from "./FilePreviewPane";

export function FilePreviewRail({
  collapsed,
  preview,
  loading,
  resizing,
  onResizeStart,
}: {
  collapsed: boolean;
  preview: FilePreview | null;
  loading?: boolean;
  resizing?: boolean;
  onResizeStart: (event: PointerEvent) => void;
}) {
  const [renderContent, setRenderContent] = useState(!collapsed);

  useEffect(() => {
    if (!collapsed) {
      setRenderContent(true);
      return;
    }
    const timeout = window.setTimeout(() => setRenderContent(false), 260);
    return () => window.clearTimeout(timeout);
  }, [collapsed]);

  return (
    <aside
      aria-hidden={collapsed}
      className={`group/rail relative hidden min-w-0 shrink-0 origin-right transform-gpu flex-col overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 will-change-[transform,opacity] transition-[opacity,transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${collapsed ? "pointer-events-none w-full translate-x-6 border-transparent opacity-0 shadow-none ring-0" : "ml-2 w-[calc(100%-0.5rem)] translate-x-0 opacity-100"} ${resizing ? "select-none ring-2 ring-ring/20 transition-none" : ""}`}
    >
      <button
        type="button"
        tabIndex={collapsed ? -1 : 0}
        className="absolute left-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none bg-transparent focus:outline-none"
        aria-label="调整文件预览宽度"
        onPointerDown={onResizeStart}
      >
        <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-px rounded-full bg-foreground/20 opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100" />
      </button>
      <div className={`flex min-h-0 flex-1 transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
        {renderContent ? <FilePreviewPane preview={preview} loading={loading} /> : null}
      </div>
    </aside>
  );
}
