import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { WorkspaceFileNode } from "@/types/domain";
import { cx } from "@/lib/cn";
import { fileIcon } from "./file-icons";

export function FileTreeNode({
  node,
  level,
  selectedFileId,
  onSelect,
}: {
  node: WorkspaceFileNode;
  level: number;
  selectedFileId: string;
  onSelect: (file: WorkspaceFileNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const isFolder = node.kind === "folder";
  const active = selectedFileId === node.id;
  const Icon = fileIcon(node.kind);

  return (
    <div>
      <button
        type="button"
        className={cx(
          "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition",
          active ? "bg-muted text-foreground ring-1 ring-border/70" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        style={{ paddingLeft: 8 + level * 14 }}
        onClick={() => {
          if (isFolder) setOpen((value) => !value);
          onSelect(node);
        }}
        title={node.path}
      >
        {isFolder ? <ChevronRight className={cx("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} /> : <span className="w-3.5 shrink-0" />}
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.sizeLabel && <span className="shrink-0 text-[10px] text-muted-foreground/70">{node.sizeLabel}</span>}
      </button>

      {isFolder && open && node.children && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} level={level + 1} selectedFileId={selectedFileId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
