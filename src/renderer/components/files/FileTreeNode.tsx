import { memo, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { WorkspaceFileNode } from "@/types/domain";
import { cx } from "@/lib/cn";
import { fileDisplayName } from "./FileContextMenu";
import { FileTypeIcon } from "./FileTypeIcon";

type FileTreeNodeProps = {
  node: WorkspaceFileNode;
  level: number;
  selectedFileId: string;
  collapsedFolderIds: Set<string>;
  onSelect: (file: WorkspaceFileNode) => void;
  onToggleFolder: (folderId: string) => void;
  onContextMenu: (event: MouseEvent, file: WorkspaceFileNode) => void;
  selectFolders?: boolean;
};

export const FileTreeNode = memo(function FileTreeNode({
  node,
  level,
  selectedFileId,
  collapsedFolderIds,
  onSelect,
  onToggleFolder,
  onContextMenu,
  selectFolders = false,
}: FileTreeNodeProps) {
  const isFolder = node.kind === "folder";
  const open = isFolder && !collapsedFolderIds.has(node.id);
  const active = selectedFileId === node.id;
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
          if (isFolder && !selectFolders) {
            onToggleFolder(node.id);
            return;
          }
          onSelect(node);
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
        title={node.path}
      >
        {isFolder ? (
          <span
            className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFolder(node.id);
            }}
          >
            <ChevronRight className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <FileTypeIcon name={node.name || displayName} isDirectory={isFolder} size={16} />
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
              selectFolders={selectFolders}
            />
          ))}
        </div>
      )}
    </div>
  );
}, areEqualFileTreeNode);

function areEqualFileTreeNode(previous: FileTreeNodeProps, next: FileTreeNodeProps): boolean {
  const previousOpen = previous.node.kind === "folder" && !previous.collapsedFolderIds.has(previous.node.id);
  const nextOpen = next.node.kind === "folder" && !next.collapsedFolderIds.has(next.node.id);
  const previousActive = previous.selectedFileId === previous.node.id;
  const nextActive = next.selectedFileId === next.node.id;
  return (
    previous.node === next.node &&
    previous.level === next.level &&
    previous.collapsedFolderIds === next.collapsedFolderIds &&
    previousOpen === nextOpen &&
    previousActive === nextActive &&
    previous.onSelect === next.onSelect &&
    previous.onToggleFolder === next.onToggleFolder &&
    previous.onContextMenu === next.onContextMenu &&
    previous.selectFolders === next.selectFolders
  );
}
