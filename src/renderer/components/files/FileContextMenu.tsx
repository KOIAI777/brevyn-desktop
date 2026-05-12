import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { WorkspaceFileNode } from "@/types/domain";
import { cx } from "@/lib/cn";

export type FileContextMenuState = {
  file: WorkspaceFileNode;
  anchor: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

type FileContextMenuAction = "open" | "reveal" | "copyPath" | "copyName" | "rename" | "delete";

export function FileContextMenu({
  state,
  onAction,
  onClose,
}: {
  state: FileContextMenuState | null;
  onAction: (action: FileContextMenuAction, file: WorkspaceFileNode) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state?.anchor.right || 0, top: state?.anchor.top || 0 });

  useEffect(() => {
    if (!state) return;
    const frame = window.requestAnimationFrame(() => {
      const rect = menuRef.current?.getBoundingClientRect();
      const width = rect?.width || 190;
      const height = rect?.height || 220;
      const preferredLeft = state.anchor.left + 2;
      const fallbackLeft = state.anchor.left - width - 6;
      const preferredTop = state.anchor.top + 2;
      const left = preferredLeft + width <= window.innerWidth - 8 ? preferredLeft : fallbackLeft;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(preferredTop, window.innerHeight - height - 8)),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function close() {
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, state]);

  const items = useMemo(() => {
    if (!state) return [];
    const mutable = Boolean(state.file.sourcePath);
    return [
      { action: "open" as const, label: "Open", icon: ExternalLink, disabled: !state.file.sourcePath },
      { action: "reveal" as const, label: "Reveal in Finder", icon: FolderOpen, disabled: !state.file.sourcePath },
      { action: "copyPath" as const, label: "Copy Path", icon: Copy, disabled: false },
      { action: "copyName" as const, label: "Copy Name", icon: Copy, disabled: false },
      { action: "rename" as const, label: "Rename", icon: Pencil, disabled: !mutable },
      { action: "delete" as const, label: "Delete", icon: Trash2, disabled: !mutable, danger: true },
    ];
  }, [state]);

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[80] w-52 overflow-hidden rounded-xl border border-border/70 bg-card/95 p-1.5 text-xs shadow-xl ring-1 ring-border/60 backdrop-blur-xl"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-border/60 px-2 py-1.5">
        <div className="truncate text-[11px] font-medium text-foreground" title={state.file.name}>
          {fileDisplayName(state.file)}
        </div>
        <div className="truncate text-[10px] text-muted-foreground" title={state.file.sourcePath || state.file.path}>
          {state.file.kind === "folder" ? "Folder" : "File"}
        </div>
      </div>
      <div className="py-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.action}
              type="button"
              className={cx(
                "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition",
                item.disabled
                  ? "cursor-not-allowed text-muted-foreground/45"
                  : item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              disabled={item.disabled}
              onClick={() => {
                onAction(item.action, state.file);
                onClose();
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

export function fileDisplayName(node: WorkspaceFileNode): string {
  if (node.displayName) return node.displayName;
  if (node.kind === "folder" && node.sectionKind === "task" && node.taskId) {
    const prefix = `${node.taskId}__`;
    if (node.name.startsWith(prefix)) return node.name.slice(prefix.length) || node.name;
  }
  return node.name;
}
