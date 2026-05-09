import { useState } from "react";
import { Archive, CalendarDays, ChevronRight, FolderOpen, GraduationCap, Home, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import type { Course, Thread, BrevynTask } from "@/types/domain";
import { cx } from "@/lib/cn";
import { formatRelative } from "@/lib/workspace-files";
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
  onToggle,
  onSelectHome,
  onSelectTask,
  onSelectThread,
  onArchiveThread,
  onCreateThread,
  onOpenCourses,
  onOpenTimetable,
  onOpenSettings,
}: {
  collapsed: boolean;
  courses: Course[];
  tasksByCourse: Record<string, BrevynTask[]>;
  threads: Thread[];
  activeCourseId: string;
  activeTaskId?: string;
  activeThreadId: string;
  onToggle: () => void;
  onSelectHome: (courseId: string) => void;
  onSelectTask: (courseId: string, taskId: string) => void;
  onSelectThread: (thread: Thread) => void;
  onArchiveThread: (thread: Thread) => void;
  onCreateThread: (courseId?: string, taskId?: string) => void;
  onOpenCourses: () => void;
  onOpenTimetable: () => void;
  onOpenSettings: () => void;
}) {
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const [openTasks, setOpenTasks] = useState<Record<string, boolean>>({});
  const [homeOpen, setHomeOpen] = useState(true);
  const recentThreads = [...threads].sort(compareThreadsByUpdatedAtDesc).slice(0, 8);
  const homeCourse = courses.find((course) => course.workspaceKind === "semester_home");
  const courseList = courses.filter((course) => course.workspaceKind !== "semester_home");
  const canCreateThread = activeCourseId === homeCourse?.id || Boolean(activeTaskId);

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-lg border bg-card/85 py-2 shadow-sm ring-1 ring-border/60 transition-[width,opacity,transform] duration-200">
        <button className="no-drag flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onToggle} title="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <div className="my-2 h-px w-8 bg-border" />
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onCreateThread(activeCourseId, activeTaskId)} title="New thread" disabled={!canCreateThread}>
          <Plus className="h-4 w-4" />
        </button>
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {recentThreads.map((thread, index) => (
            <button
              key={thread.id}
              className={cx(
                "relative flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-semibold",
                thread.id === activeThreadId ? "border-border bg-muted text-foreground" : "border-transparent bg-secondary/70 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={thread.title}
              onClick={() => onSelectThread(thread)}
            >
              {thread.title.slice(0, 1).toUpperCase() || index + 1}
            </button>
          ))}
        </div>
        <div className="my-2 h-px w-8 bg-border" />
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onOpenTimetable} title="Timetable">
          <CalendarDays className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onOpenCourses} title="Courses">
          <GraduationCap className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onOpenSettings} title="Settings">
          <Settings className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-lg border bg-card/90 shadow-sm ring-1 ring-border/60 transition-[width,opacity,transform] duration-200">
      <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-muted-foreground">TaskAgent</div>
          <div className="truncate text-sm font-semibold">Brevyn Workspace</div>
        </div>
        <button className="no-drag rounded-md border bg-background/70 p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onToggle} title="Collapse sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
            <FolderOpen className="h-3 w-3" />
            Courses
          </div>
          <div className="truncate text-[11px] text-muted-foreground/75">Tasks, threads, skills, files</div>
        </div>
        <button className="inline-flex h-7 items-center gap-1 rounded-md border bg-background/70 px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onCreateThread(activeCourseId, activeTaskId)} disabled={!canCreateThread}>
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5 brevyn-scrollbar">
        {homeCourse && (
          <div className="mb-3 rounded-lg border bg-background/70 p-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                title={homeOpen ? "Collapse Home" : "Expand Home"}
                onClick={() => setHomeOpen((value) => !value)}
              >
                <ChevronRight className={cx("h-3.5 w-3.5 transition-transform", homeOpen && "rotate-90")} />
              </button>
              <button
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors",
                  homeCourse.id === activeCourseId ? "bg-muted text-foreground ring-1 ring-border/70" : "text-foreground hover:bg-accent/70",
                )}
                onClick={() => onSelectHome(homeCourse.id)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                  <Home className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{homeCourse.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">All semester files</span>
                </span>
              </button>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                title="New Home TaskAgent session"
                onClick={() => onCreateThread(homeCourse.id)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {homeOpen && (
              <div className="ml-9 mt-1 space-y-0.5 border-l border-border/40 pl-2">
                {threads
                  .filter((thread) => thread.courseId === homeCourse.id)
                  .map((thread) => (
                    <ThreadButton key={thread.id} thread={thread} active={thread.id === activeThreadId} onClick={() => onSelectThread(thread)} onArchive={() => onArchiveThread(thread)} />
                  ))}
              </div>
            )}
          </div>
        )}

        {courseList.map((course) => {
          const courseTasks = tasksByCourse[course.id] || [];
          const courseOpen = openCourses[course.id] ?? course.id === activeCourseId;

          return (
            <div key={course.id} className="mb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={courseOpen ? `Collapse ${course.name}` : `Expand ${course.name}`}
                  onClick={() => setOpenCourses((current) => ({ ...current, [course.id]: !courseOpen }))}
                >
                  <ChevronRight className={cx("h-3.5 w-3.5 transition-transform", courseOpen && "rotate-90")} />
                </button>
                <button
                  className={cx(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors",
                    course.id === activeCourseId && !activeTaskId ? "bg-muted text-foreground ring-1 ring-border/70" : "text-foreground hover:bg-accent/70",
                  )}
                  onClick={() => onSelectHome(course.id)}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ color: course.color, backgroundColor: `${course.color}1f`, boxShadow: `inset 0 0 0 1px ${course.color}33` }}>
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
                <div className="ml-4 mt-1 space-y-1 border-l border-border/60 pl-2">
                  {courseTasks.map((task) => {
                    const taskOpen = openTasks[task.id] ?? task.id === activeTaskId;
                    const taskThreads = threads.filter((thread) => thread.courseId === course.id && thread.taskId === task.id);
                    return (
                      <div key={task.id}>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            title={taskOpen ? `Collapse ${task.title}` : `Expand ${task.title}`}
                            onClick={() => setOpenTasks((current) => ({ ...current, [task.id]: !taskOpen }))}
                          >
                            <ChevronRight className={cx("h-3 w-3 transition-transform", taskOpen && "rotate-90")} />
                          </button>
                          <button
                            className={cx(
                              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px]",
                              task.id === activeTaskId ? "bg-muted/80 text-foreground ring-1 ring-border/70" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                            onClick={() => onSelectTask(course.id, task.id)}
                          >
                            <TaskTypeIcon task={task} />
                            <span className="min-w-0 flex-1 truncate">{task.title}</span>
                            <SessionCount count={taskThreads.length} />
                          </button>
                          <button
                            type="button"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="New task session"
                            onClick={() => onCreateThread(course.id, task.id)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        {taskOpen && taskThreads.length > 0 && (
                          <div className="ml-4 mt-1 space-y-0.5 border-l border-border/40 pl-2">
                            {taskThreads.map((thread) => (
                              <ThreadButton key={thread.id} thread={thread} active={thread.id === activeThreadId} onClick={() => onSelectThread(thread)} onArchive={() => onArchiveThread(thread)} />
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

      <div className="space-y-1 border-t px-3 pb-3 pt-2">
        <button onClick={onOpenTimetable} className="w-full rounded-[10px] px-3 py-2 text-left text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 truncate text-sm">Timetable</span>
          </div>
        </button>
        <button onClick={onOpenCourses} className="w-full rounded-[10px] px-3 py-2 text-left text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 truncate text-sm">Courses</span>
          </div>
        </button>
        <button onClick={onOpenSettings} className="w-full rounded-[10px] px-3 py-2 text-left text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Settings className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 truncate text-sm">Settings</span>
          </div>
        </button>
      </div>
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
  return <span className="shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">{count}</span>;
}

function ThreadButton({ thread, active, onClick, onArchive }: { thread: Thread; active: boolean; onClick: () => void; onArchive: () => void }) {
  return (
    <div
      className={cx("group flex w-full min-w-0 items-center rounded-md text-[11px]", active ? "bg-muted text-foreground ring-1 ring-border/70" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
      title={thread.title}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={onClick}
      >
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
        <span className="shrink-0 text-[9px] text-muted-foreground/70">{formatRelative(thread.updatedAt)}</span>
      </button>
      <button
        type="button"
        className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-70"
        title="Archive session"
        onClick={(event) => {
          event.stopPropagation();
          onArchive();
        }}
      >
        <Archive className="h-3 w-3" />
      </button>
    </div>
  );
}
