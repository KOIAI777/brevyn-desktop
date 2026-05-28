import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Loader2, Paperclip, Upload, X } from "lucide-react";
import type { BrevynTask, Course, FileStats, WorkspaceFileNode } from "@/types/domain";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cx } from "@/lib/cn";
import { FileContextMenu, fileDisplayName, type FileContextMenuAction, type FileContextMenuState } from "./FileContextMenu";
import { FileTreeNode } from "./FileTreeNode";

export function FileBrowserRail({
  collapsed,
  course,
  activeTask,
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
  activeTask?: BrevynTask;
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
  const [renderContent, setRenderContent] = useState(!collapsed);
  const [viewMode, setViewMode] = useState<FileRailViewMode>(() => readStoredViewMode());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<FileContextMenuState | null>(null);
  const [renameFile, setRenameFile] = useState<WorkspaceFileNode | null>(null);
  const [actionError, setActionError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const uploadDisabled = !course || Boolean(course.archivedAt);
  const uploadTitle = !course ? "请先选择课程再上传文件" : course.archivedAt ? "请先恢复课程再上传文件" : "导入课程文件";
  const collapseScopeKey = useMemo(() => fileCollapseScopeKey(course?.id, activeTask?.id), [activeTask?.id, course?.id]);
  const contextSections = useMemo(() => buildContextSections(files, course, activeTask), [activeTask, course, files]);
  const courseFileCount = useMemo(
    () => stats?.totalFiles ?? files.reduce((count, node) => count + countLeafFiles(node), 0),
    [files, stats?.totalFiles],
  );

  useEffect(() => {
    if (!collapsed) {
      setRenderContent(true);
      return;
    }
    const timeout = window.setTimeout(() => setRenderContent(false), 260);
    return () => window.clearTimeout(timeout);
  }, [collapsed]);

  useEffect(() => {
    setCollapsedFolderIds(readStoredCollapsedFolderIds(collapseScopeKey));
  }, [collapseScopeKey]);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      storeCollapsedFolderIds(collapseScopeKey, next);
      return next;
    });
  }, [collapseScopeKey]);
  const selectViewMode = useCallback((mode: FileRailViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
  }, []);
  const contextMenuForFile = useCallback((event: MouseEvent, file: WorkspaceFileNode) => {
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
  }, []);
  const ignoreSessionContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
  }, []);
  const refreshSelectedFile = (file: WorkspaceFileNode) => {
    if (selectedFileId === file.id) onSelectFile(file);
  };

  async function handleContextAction(action: FileContextMenuAction, file: WorkspaceFileNode) {
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
      if (action === "retryIndex") {
        await window.brevyn.files.retryIndex(file.id);
        refreshSelectedFile({ ...file, indexingStatus: "queued", indexingError: undefined, indexingWarning: undefined });
        return;
      }
      if (action === "rename") {
        setRenameFile(file);
        return;
      }
      const name = fileDisplayName(file);
      const ok = await confirm({
        title: `删除“${name}”？`,
        message: file.kind === "folder" ? "这个文件夹及其中所有内容都会从工作区移除。" : "这个文件会从工作区移除。",
        confirmLabel: "删除",
        cancelLabel: "取消",
        tone: "danger",
      });
      if (!ok) return;
      await window.brevyn.files.delete(file.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "文件操作失败。");
    }
  }

  return (
    <aside
      aria-hidden={collapsed}
      className={`group/rail relative hidden min-w-0 shrink-0 origin-right transform-gpu flex-col overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 will-change-[transform,opacity] transition-[opacity,transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${collapsed ? "pointer-events-none w-full translate-x-6 border-transparent opacity-0 shadow-none ring-0" : "ml-2 w-[calc(100%-0.5rem)] translate-x-0 opacity-100"} ${resizing ? "select-none ring-2 ring-ring/20 transition-none" : ""}`}
    >
      {confirmDialog}
      {renderContent && <FileContextMenu state={menu} onAction={handleContextAction} onClose={() => setMenu(null)} />}
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
              setActionError(error instanceof Error ? error.message : "重命名失败。");
              throw error;
            }
          }}
        />
      )}
      <button
        type="button"
        tabIndex={collapsed ? -1 : 0}
        className="absolute left-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none bg-transparent focus:outline-none"
        aria-label="调整文件浏览器宽度"
        onPointerDown={onResizeStart}
      >
        <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-px rounded-full bg-foreground/20 opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100" />
      </button>
      <div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
        {renderContent ? (
          <>
        <section className="flex max-h-[38%] min-h-[7.5rem] flex-col border-b bg-background/30">
          <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">会话文件</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                本次对话 {(sessionFiles || []).reduce((count, node) => count + countLeafFiles(node), 0)} 个文件
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
                    onContextMenu={ignoreSessionContextMenu}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-card/45 px-3 py-4 text-center text-[11px] leading-5 text-muted-foreground">
                在对话中添加附件后，会显示在这里。
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">课程文件</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {course?.name || "工作区"} · {courseFileCount} 个文件
              </div>
              {actionError && <div className="mt-1 truncate text-[10px] text-red-600" title={actionError}>{actionError}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {loading && files.length > 0 && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {stats && (
                <span className="rounded-md bg-muted px-1.5 py-1 text-[10px] text-muted-foreground" title={`${stats.sectionCount} 个分区`}>
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
          <div className="flex items-center gap-1 border-b px-3 py-2">
            <FileRailViewButton active={viewMode === "context"} label="上下文" onClick={() => selectViewMode("context")} />
            <FileRailViewButton active={viewMode === "tree"} label="文件树" onClick={() => selectViewMode("tree")} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 brevyn-scrollbar">
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-background/60 px-3 py-5 text-center text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在加载课程文件...
              </div>
            ) : files.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background/60 px-3 py-5 text-center text-xs text-muted-foreground">还没有课程文件。</div>
            ) : viewMode === "context" ? (
              <ContextFileSections
                sections={contextSections}
                selectedFileId={selectedFileId}
                collapsedFolderIds={collapsedFolderIds}
                onSelectFile={onSelectFile}
                onToggleFolder={toggleFolder}
                onContextMenu={contextMenuForFile}
              />
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
                    onContextMenu={contextMenuForFile}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}

type FileRailViewMode = "context" | "tree";

type ContextFileSection = {
  id: string;
  title: string;
  subtitle: string;
  emptyLabel: string;
  nodes: WorkspaceFileNode[];
};

const FILE_RAIL_VIEW_MODE_KEY = "brevyn.files.rail.viewMode";
const FILE_RAIL_COLLAPSED_FOLDERS_PREFIX = "brevyn.files.rail.collapsedFolders";

function FileRailViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-7 flex-1 items-center justify-center rounded-md px-2 text-[11px] font-medium transition",
        active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ContextFileSections({
  sections,
  selectedFileId,
  collapsedFolderIds,
  onSelectFile,
  onToggleFolder,
  onContextMenu,
}: {
  sections: ContextFileSection[];
  selectedFileId: string;
  collapsedFolderIds: Set<string>;
  onSelectFile: (file: WorkspaceFileNode) => void;
  onToggleFolder: (folderId: string) => void;
  onContextMenu: (event: MouseEvent, file: WorkspaceFileNode) => void;
}) {
  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const fileCount = section.nodes.reduce((count, node) => count + countLeafFiles(node), 0);
        return (
          <section key={section.id} className="space-y-1.5">
            <div className="flex min-w-0 items-center gap-2 px-1">
              <div className="h-px flex-1 bg-border/70" />
              <div className="min-w-0 text-center">
                <div className="truncate text-[11px] font-semibold text-foreground">{section.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {section.subtitle} · {fileCount} 个文件
                </div>
              </div>
              <div className="h-px flex-1 bg-border/70" />
            </div>
            {section.nodes.length > 0 ? (
              <div className="space-y-0.5">
                {section.nodes.map((file) => (
                  <FileTreeNode
                    key={file.id}
                    node={file}
                    level={0}
                    selectedFileId={selectedFileId}
                    collapsedFolderIds={collapsedFolderIds}
                    onSelect={onSelectFile}
                    onToggleFolder={onToggleFolder}
                    onContextMenu={onContextMenu}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-background/55 px-3 py-3 text-center text-[11px] leading-5 text-muted-foreground">
                {section.emptyLabel}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function buildContextSections(files: WorkspaceFileNode[], course?: Course, activeTask?: BrevynTask): ContextFileSection[] {
  const roots = courseRootChildren(files);
  const sharedFolder = roots.find((node) => node.kind === "folder" && node.sectionKind === "course_shared");
  const lectureFolder = roots.find((node) => node.kind === "folder" && node.sectionKind === "lecture");
  const taskFolders = findTaskFolders(roots);

  if (course?.workspaceKind === "semester_home") {
    const semesterSharedNodes = visibleChildren(sharedFolder);
    const courseRoots = roots.filter((node) => node.kind === "folder" && node.courseId !== course.id && node.sectionKind !== "course_shared");
    return [
      {
        id: "semester-shared",
        title: "学期共享",
        subtitle: "Home 文件",
        emptyLabel: "还没有学期共享文件。",
        nodes: semesterSharedNodes,
      },
      {
        id: "semester-courses",
        title: "课程文件",
        subtitle: "当前学期",
        emptyLabel: "当前学期还没有课程文件。",
        nodes: courseRoots,
      },
    ];
  }

  if (activeTask) {
    const activeTaskFolder = taskFolders.find((node) => node.taskId === activeTask.id);
    return [
      {
        id: `task-${activeTask.id}`,
        title: activeTask.title || "当前任务",
        subtitle: "当前任务文件",
        emptyLabel: "这个任务还没有材料、草稿或提交文件。",
        nodes: visibleChildren(activeTaskFolder),
      },
      {
        id: "course-shared",
        title: "课程共享",
        subtitle: course?.name || "当前课程",
        emptyLabel: "还没有课程共享文件。",
        nodes: visibleChildren(sharedFolder),
      },
      {
        id: "lecture",
        title: "课件",
        subtitle: "Lecture",
        emptyLabel: "还没有课件文件。",
        nodes: visibleChildren(lectureFolder),
      },
    ];
  }

  return [
    {
      id: "course-shared",
      title: "课程共享",
      subtitle: course?.name || "当前课程",
      emptyLabel: "还没有课程共享文件。",
      nodes: visibleChildren(sharedFolder),
    },
    {
      id: "lecture",
      title: "课件",
      subtitle: "Lecture",
      emptyLabel: "还没有课件文件。",
      nodes: visibleChildren(lectureFolder),
    },
    {
      id: "tasks",
      title: "任务文件",
      subtitle: "按任务分组",
      emptyLabel: "当前课程还没有任务文件。",
      nodes: taskFolders,
    },
  ];
}

function courseRootChildren(files: WorkspaceFileNode[]): WorkspaceFileNode[] {
  if (files.length === 1 && files[0]?.kind === "folder") return files[0].children || [];
  return files;
}

function visibleChildren(node?: WorkspaceFileNode): WorkspaceFileNode[] {
  return node?.children || [];
}

function findTaskFolders(nodes: WorkspaceFileNode[]): WorkspaceFileNode[] {
  const result: WorkspaceFileNode[] = [];
  for (const node of nodes) {
    if (node.kind === "folder" && node.taskId && !node.taskFileBucket) result.push(node);
    if (node.children) result.push(...findTaskFolders(node.children));
  }
  return result;
}

function readStoredViewMode(): FileRailViewMode {
  try {
    return window.localStorage.getItem(FILE_RAIL_VIEW_MODE_KEY) === "tree" ? "tree" : "context";
  } catch {
    return "context";
  }
}

function storeViewMode(mode: FileRailViewMode): void {
  try {
    window.localStorage.setItem(FILE_RAIL_VIEW_MODE_KEY, mode);
  } catch {
    // View preference storage is best effort only.
  }
}

function fileCollapseScopeKey(courseId?: string, taskId?: string): string {
  return `${FILE_RAIL_COLLAPSED_FOLDERS_PREFIX}:${courseId || "workspace"}:${taskId || "course"}`;
}

function readStoredCollapsedFolderIds(scopeKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(scopeKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function storeCollapsedFolderIds(scopeKey: string, folderIds: Set<string>): void {
  try {
    window.localStorage.setItem(scopeKey, JSON.stringify(Array.from(folderIds)));
  } catch {
    // View preference storage is best effort only.
  }
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
      setError(renameError instanceof Error ? renameError.message : "重命名失败。");
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
            <div className="truncate text-sm font-semibold">重命名</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{fileDisplayName(file)}</div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="关闭"
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
              取消
            </button>
            <button
              type="button"
              className={cx("inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90", !canSave && "cursor-not-allowed opacity-55")}
              disabled={!canSave}
              onClick={() => void submit()}
            >
              {saving ? "正在保存..." : "重命名"}
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
