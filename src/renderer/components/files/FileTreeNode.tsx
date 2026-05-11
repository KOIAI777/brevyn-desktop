import type { MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { WorkspaceFileNode } from "@/types/domain";
import { cx } from "@/lib/cn";
import { fileIcon } from "./file-icons";
import { fileDisplayName } from "./FileContextMenu";

export function FileTreeNode({
  node,
  level,
  selectedFileId,
  collapsedFolderIds,
  onSelect,
  onToggleFolder,
  onContextMenu,
}: {
  node: WorkspaceFileNode;
  level: number;
  selectedFileId: string;
  collapsedFolderIds: Set<string>;
  onSelect: (file: WorkspaceFileNode) => void;
  onToggleFolder: (folderId: string) => void;
  onContextMenu: (event: MouseEvent, file: WorkspaceFileNode) => void;
}) {
  const isFolder = node.kind === "folder";
  const open = isFolder && !collapsedFolderIds.has(node.id);
  const active = selectedFileId === node.id;
  const Icon = fileIcon(node.kind);
  const displayName = fileDisplayName(node);

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
          if (isFolder) onToggleFolder(node.id);
          onSelect(node);
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
        title={node.path}
      >
        {isFolder ? <ChevronRight className={cx("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} /> : <span className="w-3.5 shrink-0" />}
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        {node.sizeLabel && <span className="shrink-0 text-[10px] text-muted-foreground/70">{node.sizeLabel}</span>}
      </button>

      {isFolder && open && node.children && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedFileId={selectedFileId}
              collapsedFolderIds={collapsedFolderIds}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
