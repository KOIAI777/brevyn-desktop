import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Loader2, Paperclip, Upload, X } from "lucide-react";
import type { Course, FileStats, WorkspaceFileNode } from "@/types/domain";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cx } from "@/lib/cn";
import { FileContextMenu, fileDisplayName, type FileContextMenuState } from "./FileContextMenu";
import { FileTreeNode } from "./FileTreeNode";

export function FileBrowserRail({
  collapsed,
  course,
  stats,
  files,
  sessionFiles,
  loading,
  selectedFileId,
  onSelectFile,
  onSelectSessionFile,
  onOpenUpload,
  resizing,
  onResizeStart,
}: {
  collapsed: boolean;
  course?: Course;
  stats?: FileStats | null;
  files: WorkspaceFileNode[];
  sessionFiles?: WorkspaceFileNode[];
  loading?: boolean;
  selectedFileId: string;
  onSelectFile: (file: WorkspaceFileNode) => void;
  onSelectSessionFile?: (file: WorkspaceFileNode) => void;
  onOpenUpload: () => void;
  resizing?: boolean;
  onResizeStart: (event: PointerEvent) => void;
}) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<FileContextMenuState | null>(null);
  const [renameFile, setRenameFile] = useState<WorkspaceFileNode | null>(null);
  const [actionError, setActionError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const uploadDisabled = !course || Boolean(course.archivedAt);
  const uploadTitle = !course ? "Select a course before uploading files" : course.archivedAt ? "Restore this course before uploading files" : "Import course files";
  const toggleFolder = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };
  const refreshSelectedFile = (file: WorkspaceFileNode) => {
    if (selectedFileId === file.id) onSelectFile(file);
  };

  async function handleContextAction(action: "open" | "reveal" | "copyPath" | "copyName" | "rename" | "delete", file: WorkspaceFileNode) {
    setActionError("");
    try {
      if (action === "open") {
        await window.brevyn.files.open(file.id);
        return;
      }
      if (action === "reveal") {
        await window.brevyn.files.reveal(file.id);
        return;
      }
      if (action === "copyPath") {
        await navigator.clipboard.writeText(file.sourcePath || file.path);
        return;
      }
      if (action === "copyName") {
        await navigator.clipboard.writeText(fileDisplayName(file));
        return;
      }
      if (action === "rename") {
        setRenameFile(file);
        return;
      }
      const name = fileDisplayName(file);
      const ok = await confirm({
        title: `Delete "${name}"?`,
        message: file.kind === "folder" ? "This folder and everything inside it will be removed from the workspace." : "This file will be removed from the workspace.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        tone: "danger",
        verificationText: name,
        verificationLabel: "Type the name to confirm",
      });
      if (!ok) return;
      await window.brevyn.files.delete(file.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "File action failed.");
    }
  }

  return (
    <aside
      aria-hidden={collapsed}
      className={`group/rail relative hidden shrink-0 origin-right transform-gpu flex-col justify-self-end overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 will-change-[transform,opacity,width] transition-[width,opacity,margin,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${collapsed ? "pointer-events-none -mr-2 translate-x-8 scale-x-[0.98] border-transparent opacity-0 shadow-none ring-0" : "translate-x-0 scale-x-100 opacity-100"} ${resizing ? "select-none ring-2 ring-ring/20 transition-none" : ""}`}
      style={{ width: collapsed ? 0 : "100%" }}
    >
      {confirmDialog}
      <FileContextMenu state={menu} onAction={handleContextAction} onClose={() => setMenu(null)} />
      {renameFile && (
        <RenameFileDialog
          file={renameFile}
          onClose={() => setRenameFile(null)}
          onRename={async (name) => {
            setActionError("");
            try {
              await window.brevyn.files.rename({ fileId: renameFile.id, name });
              setRenameFile(null);
              refreshSelectedFile({ ...renameFile, name });
            } catch (error) {
              setActionError(error instanceof Error ? error.message : "Rename failed.");
              throw error;
            }
          }}
        />
      )}
      <button
        type="button"
        tabIndex={collapsed ? -1 : 0}
        className="absolute left-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none bg-transparent focus:outline-none"
        aria-label="Resize course files rail"
        onPointerDown={onResizeStart}
      >
        <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-px rounded-full bg-foreground/20 opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100" />
      </button>
      <div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
        <section className="flex max-h-[38%] min-h-[7.5rem] flex-col border-b bg-background/30">
          <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Session files</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {(sessionFiles || []).reduce((count, node) => count + countLeafFiles(node), 0)} files in this chat
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 brevyn-scrollbar">
            {sessionFiles && sessionFiles.length > 0 ? (
              <div className="space-y-0.5">
                {sessionFiles.map((file) => (
                  <FileTreeNode
                    key={file.id}
                    node={file}
                    level={0}
                    selectedFileId={selectedFileId}
                    collapsedFolderIds={collapsedFolderIds}
                    onSelect={onSelectSessionFile || onSelectFile}
                    onToggleFolder={toggleFolder}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-card/45 px-3 py-4 text-center text-[11px] leading-5 text-muted-foreground">
                Attach files in chat and they will appear here.
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Course Files</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {course?.name || "Workspace"} · {stats?.totalFiles ?? files.reduce((count, node) => count + countLeafFiles(node), 0)} files
              </div>
              {actionError && <div className="mt-1 truncate text-[10px] text-red-600" title={actionError}>{actionError}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {loading && files.length > 0 && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {stats && (
                <span className="rounded-md bg-muted px-1.5 py-1 text-[10px] text-muted-foreground" title={`${stats.sectionCount} sections`}>
                  {stats.sectionCount}
                </span>
              )}
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                disabled={uploadDisabled}
                onClick={onOpenUpload}
                title={uploadTitle}
                aria-label={uploadTitle}
              >
                <Upload className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 brevyn-scrollbar">
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-background/60 px-3 py-5 text-center text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading course files...
              </div>
            ) : files.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background/60 px-3 py-5 text-center text-xs text-muted-foreground">No course files yet.</div>
            ) : (
              <div className="space-y-0.5">
                {files.map((file) => (
                  <FileTreeNode
                    key={file.id}
                    node={file}
                    level={0}
                    selectedFileId={selectedFileId}
                    collapsedFolderIds={collapsedFolderIds}
                    onSelect={onSelectFile}
                    onToggleFolder={toggleFolder}
                    onContextMenu={(event, file) => {
                      event.preventDefault();
                      setMenu({
                        file,
                        anchor: {
                          left: event.clientX,
                          right: event.clientX,
                          top: event.clientY,
                          bottom: event.clientY,
                        },
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

function RenameFileDialog({
  file,
  onClose,
  onRename,
}: {
  file: WorkspaceFileNode;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(file.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const unchanged = trimmed === file.name;
  const canSave = Boolean(trimmed) && !unchanged && !saving;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onRename(trimmed);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Rename failed.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border/80 bg-card text-foreground shadow-2xl ring-1 ring-border/70"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Rename</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{fileDisplayName(file)}</div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <input
            ref={inputRef}
            className="h-9 w-full rounded-md border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-700">{error}</div>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cx("inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90", !canSave && "cursor-not-allowed opacity-55")}
              disabled={!canSave}
              onClick={() => void submit()}
            >
              {saving ? "Saving..." : "Rename"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function countLeafFiles(node: WorkspaceFileNode): number {
  if (node.kind !== "folder") return 1;
  return (node.children || []).reduce((count, child) => count + countLeafFiles(child), 0);
}
