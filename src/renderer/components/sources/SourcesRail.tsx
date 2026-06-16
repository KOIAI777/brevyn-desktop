import { useCallback, useEffect, useMemo, useState, type FormEvent, type PointerEvent } from "react";
import { BookMarked, Check, CheckCircle2, CircleDashed, FileText, Globe2, Layers3, LibraryBig, Link2, Loader2, LockKeyhole, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import type { BrevynTask, Course, ExternalSource, ExternalSourceScope, SemesterWorkspace, WorkspaceFileNode } from "@/types/domain";
import { cx } from "@/lib/cn";
import { fileDisplayName } from "@/components/files/FileContextMenu";

type MaterialGroup = {
  id: "semester" | "task" | "course" | "lecture";
  title: string;
  description: string;
  count: number;
  indexedCount: number;
  status: "indexed" | "processing" | "failed" | "idle";
  files: WorkspaceFileNode[];
};

type ExternalSourceViewItem = {
  source: ExternalSource;
  file?: WorkspaceFileNode;
};

const MATERIAL_PREVIEW_LIMIT = 4;
const EXTERNAL_SOURCE_PREVIEW_LIMIT = 5;

export function SourcesRail({
  collapsed,
  semester,
  course,
  activeTask,
  files,
  onPreviewFile,
  resizing,
  onResizeStart,
}: {
  collapsed: boolean;
  semester?: SemesterWorkspace | null;
  course?: Course;
  activeTask?: BrevynTask;
  files: WorkspaceFileNode[];
  onPreviewFile?: (file: WorkspaceFileNode) => void;
  resizing?: boolean;
  onResizeStart: (event: PointerEvent) => void;
}) {
  const [renderContent, setRenderContent] = useState(!collapsed);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addBusy, setAddBusy] = useState<"url" | "file" | "delete" | "">("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<MaterialGroup["id"]>>(() => new Set());
  const [externalExpanded, setExternalExpanded] = useState(false);
  const model = useMemo(() => buildSourcesModel(files, course, activeTask), [activeTask, course, files]);
  const externalModel = useMemo(() => buildExternalSourcesModel(externalSources, files), [externalSources, files]);
  const visibleExternalSources = externalExpanded ? externalModel.sources : externalModel.sources.slice(0, EXTERNAL_SOURCE_PREVIEW_LIMIT);
  const scopeLabel = activeTask ? "当前作业" : course?.workspaceKind === "semester_home" ? "当前学期" : course ? "当前课程" : "工作区";
  const scopeName = activeTask?.title?.trim() || course?.name?.trim() || semester?.term?.trim() || "Brevyn";
  const internalCount = model.groups.reduce((count, group) => count + group.count, 0);
  const totalSourceCount = internalCount + externalModel.sources.length;
  const scopeTitle = activeTask ? "作业范围" : course?.workspaceKind === "semester_home" ? "学期范围" : course ? "课程范围" : "未选择范围";
  const scopePrimary = activeTask ? activeTask.title : course?.workspaceKind === "semester_home" ? semester?.term : course?.name;
  const scopeBadges = activeTask
    ? ["优先：作业材料", "补充：课程共享与课件", "外部：当前作业/课程来源"]
    : course?.workspaceKind === "semester_home"
      ? ["优先：学期资料", "补充：本学期课程资料"]
      : course
        ? ["优先：课程共享", "补充：课件", "外部：当前课程来源"]
        : ["请选择学期、课程或作业"];

  useEffect(() => {
    if (!collapsed) {
      setRenderContent(true);
      return;
    }
    const timeout = window.setTimeout(() => setRenderContent(false), 260);
    return () => window.clearTimeout(timeout);
  }, [collapsed]);

  const canUseExternalSources = Boolean(course && course.workspaceKind !== "semester_home");
  const defaultExternalScope: ExternalSourceScope = activeTask ? "task" : "course";
  const loadExternalSources = useCallback(async () => {
    if (!course || course.workspaceKind === "semester_home") {
      setExternalSources([]);
      return;
    }
    setExternalLoading(true);
    setExternalError("");
    try {
      const sources = await window.brevyn.externalSources.list({ courseId: course.id, taskId: activeTask?.id });
      setExternalSources(sources);
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : "外部来源加载失败。");
    } finally {
      setExternalLoading(false);
    }
  }, [activeTask?.id, course]);

  useEffect(() => {
    if (!renderContent) return;
    void loadExternalSources();
  }, [loadExternalSources, renderContent]);

  useEffect(() => {
    setExpandedGroupIds(new Set());
    setExternalExpanded(false);
  }, [activeTask?.id, course?.id]);

  function toggleMaterialGroup(groupId: MaterialGroup["id"]) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function addUrl(input: { url: string; title?: string; scope: ExternalSourceScope }) {
    if (!course || course.workspaceKind === "semester_home") return;
    setAddBusy("url");
    setExternalError("");
    try {
      const result = await window.brevyn.externalSources.addUrl({
        courseId: course.id,
        taskId: activeTask?.id,
        scope: input.scope,
        url: input.url,
        title: input.title,
      });
      setExternalSources((current) => mergeSources(result.sources, current));
      setAddDialogOpen(false);
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : "添加网页来源失败。");
      throw error;
    } finally {
      setAddBusy("");
    }
  }

  async function addFiles(scope: ExternalSourceScope = defaultExternalScope) {
    if (!course || course.workspaceKind === "semester_home") return;
    setAddBusy("file");
    setExternalError("");
    try {
      const result = await window.brevyn.externalSources.addFiles({ courseId: course.id, taskId: activeTask?.id, scope });
      if (result.sources.length > 0) setExternalSources((current) => mergeSources(result.sources, current));
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : "添加文件来源失败。");
    } finally {
      setAddBusy("");
    }
  }

  async function deleteExternalSource(sourceId: string) {
    setAddBusy("delete");
    setExternalError("");
    try {
      await window.brevyn.externalSources.delete(sourceId);
      setExternalSources((current) => current.filter((source) => source.id !== sourceId));
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : "移除外部来源失败。");
    } finally {
      setAddBusy("");
    }
  }

  return (
    <aside
      aria-hidden={collapsed}
      className={`group/rail relative flex min-w-0 shrink-0 origin-right transform-gpu flex-col overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 will-change-[transform,opacity] transition-[opacity,transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "pointer-events-none w-full translate-x-6 border-transparent opacity-0 shadow-none ring-0" : "ml-2 w-[calc(100%-0.5rem)] translate-x-0 opacity-100"} ${resizing ? "select-none ring-2 ring-ring/20 transition-none" : ""}`}
    >
      <button
        type="button"
        tabIndex={collapsed ? -1 : 0}
        className="absolute left-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none bg-transparent focus:outline-none"
        aria-label="调整来源面板宽度"
        onPointerDown={onResizeStart}
      >
        <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-px rounded-full bg-foreground/20 opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100" />
      </button>

      <div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
        {renderContent ? (
          <>
            <header className="border-b bg-[linear-gradient(135deg,hsl(var(--background)/0.72),hsl(var(--accent)/0.28))] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <BookMarked className="h-4 w-4" />
                    来源
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground" title={scopeName}>
                    {scopeName ? `${scopeLabel} · ${scopeName}` : scopeLabel}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-semibold text-background" title="当前范围资料总数">
                  {totalSourceCount}
                </span>
              </div>
              <div className="mt-4 rounded-[var(--radius-panel)] bg-card/70 p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.4)]">
                <div className="flex items-start gap-3">
                  <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)]", sourceIconTone("scope"))}>
                    <LockKeyhole className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">当前范围</div>
                    <div className="mt-1 truncate text-sm font-semibold tracking-[-0.03em] text-foreground" title={scopePrimary || scopeTitle}>
                      {scopeTitle}{scopePrimary ? ` · ${scopePrimary}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {scopeBadges.map((badge) => (
                        <span key={badge} className="rounded-full bg-background/72 px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border/55">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 brevyn-scrollbar">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Check className="h-3.5 w-3.5" />
                    当前参考资料
                  </div>
                  <span className="text-[10px] text-muted-foreground">{internalCount} 个文件</span>
                </div>
                <div className="space-y-1.5">
                  {model.groups.length > 0 ? model.groups.map((group) => (
                    <MaterialSourceRow
                      key={group.id}
                      group={group}
                      expanded={expandedGroupIds.has(group.id)}
                      onToggleExpanded={() => toggleMaterialGroup(group.id)}
                      onPreviewFile={onPreviewFile}
                    />
                  )) : (
                    <EmptySourceRow label="当前范围还没有可用材料。" />
                  )}
                </div>
              </section>
              {canUseExternalSources && (
                <section className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Globe2 className="h-3.5 w-3.5" />
                      外部来源
                    </div>
                    <div className="flex items-center gap-1">
                      {externalLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <button
                        type="button"
                        className="inline-flex h-6 items-center gap-1 rounded-md bg-background px-2 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/70 transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                        disabled={Boolean(addBusy)}
                        onClick={() => setAddDialogOpen(true)}
                      >
                        <Link2 className="h-3 w-3" />
                        网页
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-6 items-center gap-1 rounded-md bg-background px-2 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/70 transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                        disabled={Boolean(addBusy)}
                        onClick={() => void addFiles()}
                      >
                        <Plus className="h-3 w-3" />
                        文件
                      </button>
                    </div>
                  </div>
                  <div className={cx("space-y-1.5", externalExpanded && externalModel.sources.length > EXTERNAL_SOURCE_PREVIEW_LIMIT && "max-h-64 overflow-y-auto pr-1 brevyn-scrollbar")}>
                    {externalModel.sources.length > 0 ? visibleExternalSources.map((item) => (
                      <ExternalSourceRow
                        key={item.source.id}
                        item={item}
                        onPreviewFile={onPreviewFile}
                        onDelete={() => void deleteExternalSource(item.source.id)}
                        busy={addBusy === "delete"}
                      />
                    )) : (
                      <EmptySourceRow label="还没有外部来源。可以添加网页链接，或选择 PDF、Word、PPT 等本地资料。" />
                    )}
                  </div>
                  {externalModel.sources.length > EXTERNAL_SOURCE_PREVIEW_LIMIT && (
                    <button
                      type="button"
                      className="mt-2 w-full rounded-md bg-background/58 px-2 py-1.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/45 transition hover:bg-accent hover:text-foreground"
                      onClick={() => setExternalExpanded((value) => !value)}
                    >
                      {externalExpanded ? "收起外部来源" : `展开 ${externalModel.sources.length - EXTERNAL_SOURCE_PREVIEW_LIMIT} 个外部来源`}
                    </button>
                  )}
                  {externalError && <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">{externalError}</div>}
                </section>
              )}
            </div>
            {addDialogOpen && canUseExternalSources && (
              <AddExternalSourceDialog
                defaultScope={defaultExternalScope}
                hasTask={Boolean(activeTask)}
                busy={addBusy === "url"}
                onClose={() => setAddDialogOpen(false)}
                onSubmit={addUrl}
              />
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function ExternalSourceRow({
  item,
  onPreviewFile,
  onDelete,
  busy,
}: {
  item: ExternalSourceViewItem;
  onPreviewFile?: (file: WorkspaceFileNode) => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const { source, file } = item;
  const Icon = source.kind === "web" ? Link2 : Paperclip;
  const label = source.kind === "web" ? "网页" : file ? fileKindLabel(file.kind) : "文件";
  const canPreview = Boolean(file && onPreviewFile);
  const preview = () => {
    if (file) onPreviewFile?.(file);
  };
  return (
    <div
      role={canPreview ? "button" : undefined}
      tabIndex={canPreview ? 0 : undefined}
      className={cx(
        "rounded-[var(--radius-card)] bg-background/58 px-3 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.34)] ring-1 ring-foreground/[0.03] transition",
        canPreview && "cursor-pointer hover:bg-accent/45 hover:shadow-[inset_0_0_0_1px_hsl(var(--border)/0.58)]",
      )}
      onClick={preview}
      onKeyDown={(event) => {
        if (!canPreview) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          preview();
        }
      }}
      title={canPreview ? "点击预览" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)]", sourceIconTone(source.kind === "web" ? "web" : "external-file"))}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground" title={source.title}>{source.title}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {label} · {source.scope === "task" ? "当前作业" : "当前课程"} · {externalStatusLabel(source.status, file)}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          title="移除外部来源"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {(source.summary || source.url) && (
        <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-muted-foreground">
          {source.summary || source.url}
        </div>
      )}
    </div>
  );
}

function AddExternalSourceDialog({
  defaultScope,
  hasTask,
  busy,
  onClose,
  onSubmit,
}: {
  defaultScope: ExternalSourceScope;
  hasTask: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { url: string; title?: string; scope: ExternalSourceScope }) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<ExternalSourceScope>(defaultScope);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onSubmit({ url, title, scope });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "添加失败。");
    }
  }
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center bg-background/62 px-4 pt-20 backdrop-blur-sm">
      <form className="w-full rounded-[var(--radius-panel)] border bg-card p-4 shadow-xl ring-1 ring-border/70" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">添加网页来源</div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">网页会保存为本地资料，并进入当前范围的参考资料。</p>
          </div>
          <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <label className="mt-4 block text-[11px] font-medium text-muted-foreground">
          网页链接
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            className="mt-1 h-9 w-full rounded-[var(--radius-control)] border bg-background px-3 text-xs text-foreground outline-none transition focus:ring-2 focus:ring-ring/25"
          />
        </label>
        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">
          标题（可选）
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="自动读取网页标题"
            className="mt-1 h-9 w-full rounded-[var(--radius-control)] border bg-background px-3 text-xs text-foreground outline-none transition focus:ring-2 focus:ring-ring/25"
          />
        </label>
        <div className="mt-3">
          <div className="text-[11px] font-medium text-muted-foreground">保存范围</div>
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-muted/55 p-1">
            {hasTask && <ScopeButton active={scope === "task"} label="当前作业" onClick={() => setScope("task")} />}
            <ScopeButton active={scope === "course"} label="当前课程" onClick={() => setScope("course")} />
          </div>
        </div>
        {error && <div className="mt-3 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-8 rounded-[var(--radius-control)] px-3 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground" onClick={onClose}>取消</button>
          <button type="submit" disabled={busy || !url.trim()} className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            添加并解析
          </button>
        </div>
      </form>
    </div>
  );
}

function ScopeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={cx("h-7 rounded-md text-[11px] font-medium transition", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={onClick}>
      {label}
    </button>
  );
}

function MaterialSourceRow({
  group,
  expanded,
  onToggleExpanded,
  onPreviewFile,
}: {
  group: MaterialGroup;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPreviewFile?: (file: WorkspaceFileNode) => void;
}) {
  const Icon = group.id === "lecture" ? Layers3 : group.id === "task" ? FileText : LibraryBig;
  const visibleFiles = expanded ? group.files : group.files.slice(0, MATERIAL_PREVIEW_LIMIT);
  return (
    <div className="rounded-[var(--radius-card)] bg-background/58 px-3 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.34)] ring-1 ring-foreground/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)]", sourceIconTone(group.id))}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{group.title}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{group.description} · {group.count} 个文件</div>
          </div>
        </div>
        <SourceStatusBadge status={group.status} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">已索引 {group.indexedCount} 个</span>
        <span className="shrink-0">{group.indexedCount}/{group.count || 0}</span>
      </div>
      {group.files.length > 0 ? (
        <div className={cx("mt-2 space-y-1", expanded && group.files.length > MATERIAL_PREVIEW_LIMIT && "max-h-48 overflow-y-auto pr-1 brevyn-scrollbar")}>
          {visibleFiles.map((file) => (
            <button
              key={file.id}
              type="button"
              className={cx(
                "flex w-full min-w-0 items-center gap-2 rounded-md bg-card/54 px-2 py-1.5 text-left text-[11px] transition",
                onPreviewFile && "hover:bg-accent hover:text-foreground",
              )}
              onClick={() => onPreviewFile?.(file)}
              title="点击预览"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/42" />
              <span className="min-w-0 flex-1 truncate text-foreground/88" title={fileDisplayName(file)}>
                {fileDisplayName(file)}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{fileMetaLabel(file)}</span>
            </button>
          ))}
          {group.files.length > MATERIAL_PREVIEW_LIMIT && (
            <button
              type="button"
              className="w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onToggleExpanded}
            >
              {expanded ? "收起资料" : `展开 ${group.files.length - MATERIAL_PREVIEW_LIMIT} 个资料`}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-border/50 bg-card/28 px-2 py-2 text-[10px] text-muted-foreground">
          这个分区还没有资料。
        </div>
      )}
    </div>
  );
}

function EmptySourceRow({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border/60 bg-background/34 px-3 py-3 text-[11px] leading-5 text-muted-foreground">
      {label}
    </div>
  );
}

function SourceStatusBadge({ status }: { status: MaterialGroup["status"] }) {
  const label = status === "indexed" ? "已索引" : status === "processing" ? "处理中" : status === "failed" ? "失败" : "待索引";
  const icon = status === "indexed" ? <CheckCircle2 className="h-3 w-3" /> : status === "processing" ? <Search className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
        status === "indexed" ? "bg-[hsl(var(--status-success)/0.14)] text-[hsl(var(--status-success))]" : "bg-muted text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function sourceIconTone(tone: MaterialGroup["id"] | "scope" | "web" | "external-file"): string {
  if (tone === "scope" || tone === "semester") {
    return "bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.24)]";
  }
  if (tone === "task" || tone === "external-file") {
    return "bg-[hsl(var(--status-warning)/0.13)] text-[hsl(var(--status-warning))] shadow-[inset_0_0_0_1px_hsl(var(--status-warning)/0.24)]";
  }
  if (tone === "course" || tone === "web") {
    return "bg-[hsl(var(--status-info)/0.13)] text-[hsl(var(--status-info))] shadow-[inset_0_0_0_1px_hsl(var(--status-info)/0.24)]";
  }
  return "bg-[hsl(var(--status-success)/0.13)] text-[hsl(var(--status-success))] shadow-[inset_0_0_0_1px_hsl(var(--status-success)/0.24)]";
}

function buildSourcesModel(files: WorkspaceFileNode[], course?: Course, activeTask?: BrevynTask): { groups: MaterialGroup[] } {
  const leafFiles = flattenFiles(files).filter(isUsableSourceFile).filter((file) => !isExternalSourceFile(file));
  if (course?.workspaceKind === "semester_home") {
    return {
      groups: [
        materialGroup("semester", "学期资料", "学期共享资料", leafFiles.filter((file) => file.courseId === course.id && file.sectionKind === "course_shared")),
        materialGroup("course", "课程资料", "本学期课程文件", leafFiles.filter((file) => file.courseId !== course.id)),
      ],
    };
  }

  const groups: MaterialGroup[] = [];
  if (activeTask) {
    groups.push(materialGroup("task", "作业材料", "任务说明、评分标准、指定阅读", leafFiles.filter((file) => file.taskId === activeTask.id && file.taskFileBucket === "materials")));
  }
  groups.push(
    materialGroup("course", "课程共享", "课程长期资料", leafFiles.filter((file) => file.sectionKind === "course_shared" && !file.taskId)),
    materialGroup("lecture", "课件", "课堂讲义与 PPT", leafFiles.filter((file) => file.sectionKind === "lecture")),
  );
  return { groups };
}

function materialGroup(id: MaterialGroup["id"], title: string, description: string, files: WorkspaceFileNode[]): MaterialGroup {
  const indexedCount = files.filter(isIndexedFile).length;
  const failed = files.some((file) => file.indexingStatus === "failed" || file.indexingStatus === "cancelled");
  const processing = files.some((file) => file.indexingStatus === "queued" || file.indexingStatus === "indexing");
  return {
    id,
    title,
    description,
    count: files.length,
    indexedCount,
    status: failed ? "failed" : processing ? "processing" : files.length > 0 && indexedCount === files.length ? "indexed" : "idle",
    files: [...files].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()),
  };
}

function buildExternalSourcesModel(sources: ExternalSource[], files: WorkspaceFileNode[]): { sources: ExternalSourceViewItem[] } {
  const allFiles = flattenFiles(files);
  const byId = new Map(allFiles.map((file) => [file.id, file]));
  return {
    sources: sources.map((source) => ({
      source,
      file: source.workspaceFileId ? byId.get(source.workspaceFileId) : undefined,
    })),
  };
}

function isUsableSourceFile(file: WorkspaceFileNode): boolean {
  if (file.kind === "folder") return false;
  if (file.ragEligible === false) return false;
  return file.sourceKind !== "agent_generated" && file.sourceKind !== "system";
}

function isExternalSourceFile(file: WorkspaceFileNode): boolean {
  return file.path.includes("/External Sources/") || file.sourcePath?.includes("/External Sources/") === true;
}

function isIndexedFile(file: WorkspaceFileNode): boolean {
  return Boolean(file.indexedAt || file.indexingStatus === "indexed" || file.indexingStatus === "partial" || file.indexingStatus === "warning");
}

function fileMetaLabel(file: WorkspaceFileNode): string {
  if (file.indexingStatus === "queued" || file.indexingStatus === "indexing") return "处理中";
  if (file.indexingStatus === "failed" || file.indexingStatus === "cancelled") return "失败";
  if (isIndexedFile(file)) return "已索引";
  return file.sizeLabel || fileKindLabel(file.kind);
}

function fileKindLabel(kind: WorkspaceFileNode["kind"]): string {
  if (kind === "pdf") return "PDF";
  if (kind === "docx") return "Word";
  if (kind === "pptx") return "PPT";
  if (kind === "spreadsheet") return "表格";
  if (kind === "image") return "图片";
  if (kind === "markdown") return "Markdown";
  if (kind === "code") return "代码";
  if (kind === "text") return "文本";
  return "文件";
}

function externalStatusLabel(status: ExternalSource["status"], file?: WorkspaceFileNode): string {
  if (status === "failed") return "失败";
  if (file?.indexingStatus === "queued" || file?.indexingStatus === "indexing") return "处理中";
  if (file && isIndexedFile(file)) return "已索引";
  if (status === "ready") return "已保存";
  return "处理中";
}

function mergeSources(incoming: ExternalSource[], current: ExternalSource[]): ExternalSource[] {
  const byId = new Map<string, ExternalSource>();
  for (const source of incoming) byId.set(source.id, source);
  for (const source of current) if (!byId.has(source.id)) byId.set(source.id, source);
  return Array.from(byId.values()).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
}

function flattenFiles(nodes: WorkspaceFileNode[]): WorkspaceFileNode[] {
  const result: WorkspaceFileNode[] = [];
  const visit = (node: WorkspaceFileNode) => {
    result.push(node);
    for (const child of node.children || []) visit(child);
  };
  for (const node of nodes) visit(node);
  return result;
}
