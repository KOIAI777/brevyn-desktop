import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Archive, CalendarDays, ChevronRight, GraduationCap, Home, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Settings } from "lucide-react";
import type { Course, Thread, BrevynTask, UserProfileSettings } from "@/types/domain";
import { cx } from "@/lib/cn";
import { profileDisplayName, UserAvatar } from "@/lib/user-profile";
import { formatRelative } from "@/lib/workspace-files";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CourseIcon } from "@/components/courses/CourseIcon";
import { TaskTypeIcon } from "@/components/shell/TaskTypeIcon";

export function WorkspaceSidebar({
  collapsed,
  courses,
  tasksByCourse,
  threads,
  activeCourseId,
  activeTaskId,
  activeThreadId,
  emptyThreadIds,
  width,
  resizing,
  profile,
  onToggle,
  onSelectHome,
  onSelectTask,
  onSelectThread,
  onArchiveThread,
  onArchiveTask,
  onRenameThread,
  onCreateThread,
  onOpenCourses,
  onOpenTimetable,
  onOpenSettings,
  onResizeStart,
}: {
  collapsed: boolean;
  courses: Course[];
  tasksByCourse: Record<string, BrevynTask[]>;
  threads: Thread[];
  activeCourseId: string;
  activeTaskId?: string;
  activeThreadId: string;
  emptyThreadIds: Set<string>;
  width: number;
  resizing: boolean;
  profile: UserProfileSettings;
  onToggle: () => void;
  onSelectHome: (courseId: string) => void;
  onSelectTask: (courseId: string, taskId: string) => void;
  onSelectThread: (thread: Thread) => void;
  onArchiveThread: (thread: Thread) => void;
  onArchiveTask: (task: BrevynTask) => Promise<void> | void;
  onRenameThread: (thread: Thread, title: string) => Promise<void>;
  onCreateThread: (courseId?: string, taskId?: string) => void;
  onOpenCourses: () => void;
  onOpenTimetable: () => void;
  onOpenSettings: () => void;
  onResizeStart: (event: ReactPointerEvent) => void;
}) {
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const [openTasks, setOpenTasks] = useState<Record<string, boolean>>({});
  const [homeOpen, setHomeOpen] = useState(true);
  const [threadMenu, setThreadMenu] = useState<ThreadContextMenuState | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState("");
  const [archivingTaskId, setArchivingTaskId] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const recentThreads = [...threads].sort(compareThreadsByUpdatedAtDesc).slice(0, 8);
  const homeCourse = courses.find((course) => course.workspaceKind === "semester_home");
  const courseList = courses.filter((course) => course.workspaceKind !== "semester_home");
  const canCreateThread = activeCourseId === homeCourse?.id || Boolean(activeTaskId);

  async function archiveTaskFromSidebar(task: BrevynTask) {
    const ok = await confirm({
      title: `归档「${task.title}」？`,
      message: "该任务和它的会话会从侧边栏隐藏，文件不会删除。你可以在课程管理里恢复。",
      confirmLabel: "归档",
      cancelLabel: "保留",
    });
    if (!ok) return;
    setArchivingTaskId(task.id);
    try {
      await onArchiveTask(task);
    } catch {
      // Workspace controller surfaces the error in the main shell banner.
    } finally {
      setArchivingTaskId("");
    }
  }

  if (collapsed) {
    return (
      <aside className="brevyn-panel-surface flex w-14 shrink-0 flex-col items-center overflow-hidden py-2 transition-[width,opacity,transform] duration-200">
        {confirmDialog}
        <button className="no-drag flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]" onClick={onToggle} title="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <div className="my-2 h-px w-8 bg-border" />
        <button className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onCreateThread(activeCourseId, activeTaskId)} title="New thread" disabled={!canCreateThread}>
          <Plus className="h-4 w-4" />
        </button>
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {recentThreads.map((thread, index) => (
            <button
              key={thread.id}
              className={cx(
                "relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[11px] font-semibold transition active:scale-[0.98]",
                thread.id === activeThreadId ? "bg-muted text-foreground ring-1 ring-black/[0.05]" : "bg-secondary/70 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={thread.title}
              onClick={() => onSelectThread(thread)}
              onContextMenu={(event) => {
                event.preventDefault();
                setThreadMenu({
                  thread,
                  anchor: anchorFromElement(event.currentTarget),
                });
              }}
            >
              {thread.title.slice(0, 1).toUpperCase() || index + 1}
            </button>
          ))}
        </div>
        <ThreadContextMenu
          state={threadMenu}
          onClose={() => setThreadMenu(null)}
          onRename={(thread) => setRenamingThreadId(thread.id)}
        />
        <div className="my-2 h-px w-8 bg-border" />
        <button className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]" onClick={onOpenTimetable} title="Timetable">
          <CalendarDays className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]" onClick={onOpenCourses} title="Courses">
          <GraduationCap className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]" onClick={onOpenSettings} title="Settings">
          <Settings className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-workspace-sidebar
      className={cx(
        "brevyn-panel-surface group/sidebar relative flex shrink-0 flex-col overflow-hidden will-change-[width] transition-[width,opacity,transform] duration-200",
        resizing && "select-none ring-2 ring-ring/20 transition-none",
      )}
      style={{ width }}
    >
      {confirmDialog}
      <button
        type="button"
        className="absolute right-0 top-0 z-10 h-full w-3 cursor-col-resize touch-none bg-transparent focus:outline-none"
        aria-label="Resize workspace sidebar"
        onPointerDown={onResizeStart}
      >
        <span className={cx("absolute right-0 top-3 h-[calc(100%-1.5rem)] w-px rounded-full bg-foreground/20 opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100", resizing && "opacity-100")} />
      </button>
      <div className="drag-region flex items-center gap-2 bg-card/70 px-3 py-3 shadow-[inset_0_-1px_0_hsl(var(--border)/0.45)]">
        <button
          type="button"
          className="no-drag group/profile flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-card)] bg-background/70 px-2.5 py-2 text-left shadow-sm ring-1 ring-black/[0.04] transition-colors duration-150 hover:bg-accent/45 active:scale-[0.99]"
          onClick={onOpenSettings}
          title="打开账号设置"
        >
          <span className="relative shrink-0">
            <UserAvatar profile={profile} size="sm" className="rounded-[var(--radius-avatar)] shadow-none transition-transform duration-150 group-hover/profile:scale-[1.03]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-[hsl(var(--status-success))]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-4 text-foreground">{profileDisplayName(profile)}</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">Workspace</div>
          </div>
        </button>
        <button className="no-drag shrink-0 rounded-[var(--radius-control)] bg-background/70 p-1.5 text-muted-foreground shadow-sm ring-1 ring-black/[0.04] transition-colors hover:bg-accent hover:text-foreground active:scale-[0.98]" onClick={onToggle} title="Collapse sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5 brevyn-scrollbar">
        {homeCourse && (
          <div className="brevyn-card-surface mb-3 p-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                title={homeOpen ? "Collapse Home" : "Expand Home"}
                onClick={() => setHomeOpen((value) => !value)}
              >
                <ChevronRight className={cx("h-3.5 w-3.5 transition-transform", homeOpen && "rotate-90")} />
              </button>
              <button
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 text-left text-xs transition-colors active:scale-[0.99]",
                  homeCourse.id === activeCourseId ? "bg-background text-foreground shadow-sm ring-1 ring-black/[0.06]" : "text-foreground hover:bg-accent/70",
                )}
                onClick={() => onSelectHome(homeCourse.id)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-badge)] bg-foreground text-background">
                  <Home className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{homeCourse.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">All semester files</span>
                </span>
              </button>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-card text-muted-foreground shadow-sm ring-1 ring-black/[0.04] transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                title="New Home TaskAgent session"
                onClick={() => onCreateThread(homeCourse.id)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {homeOpen && (
              <div className="ml-9 mt-1 space-y-0.5 rounded-[var(--radius-control)] bg-background/35 p-1">
                {threads
                  .filter((thread) => thread.courseId === homeCourse.id)
                  .map((thread) => (
                    <ThreadButton
                      key={thread.id}
                      thread={thread}
                      active={thread.id === activeThreadId}
                      editing={renamingThreadId === thread.id}
                      onClick={() => onSelectThread(thread)}
                      canArchive={!emptyThreadIds.has(thread.id)}
                      onStartEditing={() => setRenamingThreadId(thread.id)}
                      onArchive={() => onArchiveThread(thread)}
                      onRename={onRenameThread}
                      onEditingDone={() => setRenamingThreadId("")}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setThreadMenu({ thread, anchor: anchorFromElement(event.currentTarget) });
                      }}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        {courseList.map((course) => {
          const courseTasks = tasksByCourse[course.id] || [];
          const courseOpen = openCourses[course.id] ?? course.id === activeCourseId;
          const toggleCourseOpen = () => setOpenCourses((current) => ({ ...current, [course.id]: !courseOpen }));

          return (
            <div key={course.id} className="mb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                  title={courseOpen ? `Collapse ${course.name}` : `Expand ${course.name}`}
                  onClick={toggleCourseOpen}
                >
                  <ChevronRight className={cx("h-3.5 w-3.5 transition-transform", courseOpen && "rotate-90")} />
                </button>
                <button
                  className={cx(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 text-left text-xs transition-colors active:scale-[0.99]",
                    course.id === activeCourseId && !activeTaskId ? "bg-background text-foreground shadow-sm ring-1 ring-black/[0.06]" : "text-foreground hover:bg-accent/70",
                  )}
                  onClick={() => {
                    onSelectHome(course.id);
                    toggleCourseOpen();
                  }}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-badge)]" style={{ color: course.color, backgroundColor: `${course.color}1f`, boxShadow: `inset 0 0 0 1px ${course.color}33` }}>
                    <CourseIcon course={course} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{course.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {course.code} · {course.term}
                    </span>
                  </span>
                </button>
              </div>

              {courseOpen && (
                <div className="ml-8 mt-1 space-y-1 rounded-[var(--radius-control)] bg-background/28 p-1">
                  {courseTasks.map((task) => {
                    const taskOpen = openTasks[task.id] ?? task.id === activeTaskId;
                    const taskThreads = threads.filter((thread) => thread.courseId === course.id && thread.taskId === task.id);
                    return (
                      <div key={task.id} className="group/task">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-badge)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                            title={taskOpen ? `Collapse ${task.title}` : `Expand ${task.title}`}
                            onClick={() => setOpenTasks((current) => ({ ...current, [task.id]: !taskOpen }))}
                          >
                            <ChevronRight className={cx("h-3 w-3 transition-transform", taskOpen && "rotate-90")} />
                          </button>
                          <button
                            className={cx(
                              "flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[11px] transition active:scale-[0.99]",
                              task.id === activeTaskId ? "bg-background text-foreground shadow-sm ring-1 ring-black/[0.06]" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                            onClick={() => onSelectTask(course.id, task.id)}
                          >
                            <TaskTypeIcon task={task} />
                            <span className="min-w-0 flex-1 truncate">{task.title}</span>
                            <SessionCount count={taskThreads.length} />
                          </button>
                          <button
                            type="button"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-badge)] text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                            title="New task session"
                            onClick={() => onCreateThread(course.id, task.id)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-badge)] text-muted-foreground opacity-0 transition group-hover/task:opacity-100 hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                            title="归档任务"
                            disabled={archivingTaskId === task.id}
                            onClick={() => void archiveTaskFromSidebar(task)}
                          >
                            <Archive className="h-3 w-3" />
                          </button>
                        </div>
                        {taskOpen && taskThreads.length > 0 && (
                          <div className="ml-7 mt-1 space-y-0.5 rounded-[var(--radius-badge)] bg-card/45 p-1">
                            {taskThreads.map((thread) => (
                              <ThreadButton
                                key={thread.id}
                                thread={thread}
                                active={thread.id === activeThreadId}
                                editing={renamingThreadId === thread.id}
                                onClick={() => onSelectThread(thread)}
                                canArchive={!emptyThreadIds.has(thread.id)}
                                onStartEditing={() => setRenamingThreadId(thread.id)}
                                onArchive={() => onArchiveThread(thread)}
                                onRename={onRenameThread}
                                onEditingDone={() => setRenamingThreadId("")}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  setThreadMenu({ thread, anchor: anchorFromElement(event.currentTarget) });
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-3 pt-2 shadow-[inset_0_1px_0_hsl(var(--border)/0.45)]">
        <div className="flex items-center justify-around gap-2">
          <SidebarFooterIconButton icon={<CalendarDays className="h-4 w-4" />} title="Timetable" onClick={onOpenTimetable} />
          <SidebarFooterIconButton icon={<GraduationCap className="h-4 w-4" />} title="Courses" onClick={onOpenCourses} />
          <SidebarFooterIconButton icon={<Settings className="h-4 w-4" />} title="Settings" onClick={onOpenSettings} />
        </div>
      </div>
      <ThreadContextMenu
        state={threadMenu}
        onClose={() => setThreadMenu(null)}
        onRename={(thread) => setRenamingThreadId(thread.id)}
      />
    </aside>
  );
}

function compareThreadsByUpdatedAtDesc(a: Thread, b: Thread): number {
  const aTime = Date.parse(a.updatedAt);
  const bTime = Date.parse(b.updatedAt);
  const safeATime = Number.isFinite(aTime) ? aTime : 0;
  const safeBTime = Number.isFinite(bTime) ? bTime : 0;
  return safeBTime - safeATime;
}

function SessionCount({ count }: { count: number }) {
  return <span className="shrink-0 rounded-[var(--radius-badge)] bg-background/70 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">{count}</span>;
}

function SidebarFooterIconButton({ icon, title, onClick }: { icon: ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.98]"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

type ThreadButtonProps = {
  thread: Thread;
  active: boolean;
  editing: boolean;
  canArchive: boolean;
  onClick: () => void;
  onStartEditing: () => void;
  onArchive: () => void;
  onRename: (thread: Thread, title: string) => Promise<void>;
  onEditingDone: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
};

function ThreadButton({ thread, active, editing, canArchive, onClick, onStartEditing, onArchive, onRename, onEditingDone, onContextMenu }: ThreadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const skipNextBlurRef = useRef(false);
  const [draft, setDraft] = useState(thread.title);

  useEffect(() => {
    if (!editing) return;
    setDraft(thread.title);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, thread.title]);

  async function saveTitle(): Promise<void> {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }
    if (savingRef.current) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === thread.title) {
      onEditingDone();
      return;
    }
    savingRef.current = true;
    try {
      await onRename(thread, trimmed);
      onEditingDone();
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <div
      className={cx("group flex w-full min-w-0 items-center rounded-[var(--radius-control)] text-[11px] transition", active ? "bg-background text-foreground shadow-sm ring-1 ring-black/[0.06]" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
      title={thread.title}
      onContextMenu={onContextMenu}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={100}
          className="mx-1 my-1 min-w-0 flex-1 rounded-[var(--radius-badge)] bg-background/90 px-1.5 py-1 text-[11px] text-foreground outline-none ring-1 ring-black/[0.05] focus:bg-background focus:ring-primary/30"
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          onBlur={() => void saveTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveTitle();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              skipNextBlurRef.current = true;
              setDraft(thread.title);
              onEditingDone();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
          onClick={onClick}
        >
          <span className="min-w-0 flex-1 truncate">{thread.title}</span>
          <span className="shrink-0 text-[9px] text-muted-foreground/70">{formatRelative(thread.updatedAt)}</span>
        </button>
      )}
      {!editing && (
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-badge)] text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-70"
          title="Rename session"
          onClick={(event) => {
            event.stopPropagation();
            onStartEditing();
          }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {canArchive && (
        <button
          type="button"
          className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-badge)] text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-70"
          title="Archive session"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

type ThreadContextMenuState = {
  thread: Thread;
  anchor: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

function ThreadContextMenu({
  state,
  onClose,
  onRename,
}: {
  state: ThreadContextMenuState | null;
  onClose: () => void;
  onRename: (thread: Thread) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state?.anchor.right || 0, top: state?.anchor.top || 0 });

  useEffect(() => {
    if (!state) return;
    const frame = window.requestAnimationFrame(() => {
      const rect = menuRef.current?.getBoundingClientRect();
      const width = rect?.width || 170;
      const height = rect?.height || 92;
      const preferredLeft = state.anchor.right + 6;
      const fallbackLeft = state.anchor.left - width - 6;
      const left = preferredLeft + width <= window.innerWidth - 8 ? preferredLeft : fallbackLeft;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(state.anchor.top - 4, window.innerHeight - height - 8)),
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

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[80] w-44 overflow-hidden rounded-[var(--radius-panel)] bg-card/95 p-1.5 text-xs shadow-xl ring-1 ring-black/[0.06] backdrop-blur-xl"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-border/60 px-2 py-1.5">
        <div className="truncate text-[11px] font-medium text-foreground" title={state.thread.title}>
          {state.thread.title}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">Session</div>
      </div>
      <button
        type="button"
        className="mt-1 flex h-8 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
        onClick={() => {
          onRename(state.thread);
          onClose();
        }}
      >
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Rename</span>
      </button>
    </div>,
    document.body,
  );
}

function anchorFromElement(element: HTMLElement): ThreadContextMenuState["anchor"] {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
  };
}
