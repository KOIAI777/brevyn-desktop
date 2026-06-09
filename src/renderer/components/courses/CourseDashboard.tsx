import { ArrowRight, BarChart3, BookOpen, CalendarClock, Plus, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { BrevynTask, Course, FileStats, SemesterWorkspace, Thread, WorkspaceFileNode } from "@/types/domain";
import { CourseIcon } from "@/components/courses/CourseIcon";
import { TaskTypeIcon } from "@/components/shell/TaskTypeIcon";
import { cx } from "@/lib/cn";
import {
  buildActivityWeeks,
  buildCourseDashboardStats,
  type ActivityDay,
  type TaskCard,
} from "@/components/courses/courseDashboardStats";

export function CourseDashboard({
  course,
  semester,
  tasks,
  threads,
  stats,
  files,
  onOpenTasks,
  onSelectTask,
  onCreateThread,
}: {
  course: Course;
  semester?: SemesterWorkspace | null;
  tasks: BrevynTask[];
  threads: Thread[];
  stats?: FileStats | null;
  files: WorkspaceFileNode[];
  onOpenTasks: () => void;
  onSelectTask: (courseId: string, taskId: string) => void;
  onCreateThread: (courseId?: string, taskId?: string) => void;
}) {
  const dashboardStats = useMemo(
    () => buildCourseDashboardStats({ course, tasks, threads, files, stats }),
    [course, files, stats, tasks, threads],
  );
  const {
    activeTasks,
    activityDays,
    courseFileCount,
    courseThreads,
    draftFiles,
    filesTouchedThisWeek,
    lectureFiles,
    lectureWeeks,
    recentTask,
    sectionCount,
    taskCards,
    threadsWithMessages,
  } = dashboardStats;
  const courseColor = course.color || "#2563eb";

  return (
    <div className="brevyn-dashboard-background min-h-0 flex-1 overflow-y-auto p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full min-w-[64rem] max-w-5xl flex-col gap-4">
        <section className="overflow-hidden rounded-2xl border bg-card/90 shadow-sm ring-1 ring-border/60">
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                  style={{ color: courseColor, backgroundColor: `${courseColor}18`, boxShadow: `inset 0 0 0 1px ${courseColor}30` }}
                >
                  <CourseIcon course={course} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground">课程概览</h2>
                    <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{course.code}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {semester?.term || course.term} · 任务、会话与文件统计
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {recentTask && (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
                    onClick={() => openTask(recentTask, course.id, onSelectTask, onCreateThread)}
                  >
                    继续最近任务
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onClick={onOpenTasks}
                >
                  <Plus className="h-3.5 w-3.5" />
                  管理任务
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="活跃任务" value={activeTasks.toString()} hint={`共 ${tasks.length} 个`} />
              <MetricCard label="会话" value={courseThreads.length.toString()} hint={`${threadsWithMessages} 个已有消息`} />
              <MetricCard label="课程文件" value={courseFileCount.toString()} hint={`${sectionCount} 个分区`} />
              <MetricCard label="草稿文件" value={draftFiles.length.toString()} hint={`本周更新 ${filesTouchedThisWeek} 个`} />
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="min-w-0 rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4" />
                  活动热力图
                </div>
              </div>
            </div>
            <ActivityHeatmap days={activityDays} />
          </section>

          <section className="min-w-[21rem] rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              建议下一步
            </div>
            {recentTask ? (
              <div className="mt-3 rounded-xl border bg-background/70 p-3">
                <div className="flex items-start gap-2">
                  <TaskTypeIcon task={recentTask.task} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{recentTask.task.title}</div>
                    <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {recentTask.fileCount} 个文件 · {recentTask.threadCount} 个会话 · {recentTask.lastTouchedLabel}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
                  onClick={() => openTask(recentTask, course.id, onSelectTask, onCreateThread)}
                >
                  {recentTask.threadCount > 0 ? "打开任务" : "开始任务会话"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed bg-background/65 p-4 text-xs leading-5 text-muted-foreground">
                为作业、展示、阅读回应或考试复习创建任务。会话会保存在任务下，而不是混在课程容器里。
                <button
                  type="button"
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-accent"
                  onClick={onOpenTasks}
                >
                  <Plus className="h-3.5 w-3.5" />
                  创建第一个任务
                </button>
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4" />
                课件资料
              </div>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {lectureFiles.length} 个文件
            </span>
          </div>
          {lectureWeeks.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {lectureWeeks.slice(0, 8).map((week) => (
                <div key={week.id} className="rounded-xl border bg-background/68 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-semibold text-foreground">{week.label}</div>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{week.files.length}</span>
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    已索引 {week.indexedCount} 个 · {week.latestLabel}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-background/65 px-4 py-6 text-center text-xs leading-5 text-muted-foreground">
              还没有课件文件。可以从文件栏或我的课程里上传每周课程材料。
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4" />
                任务进展
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onOpenTasks}
            >
              <Plus className="h-3.5 w-3.5" />
              新建任务
            </button>
          </div>

          {taskCards.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {taskCards.slice(0, 6).map((task) => (
                <button
                  key={task.task.id}
                  type="button"
                  className="group flex min-w-0 items-center gap-3 rounded-xl border bg-background/68 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-sm"
                  onClick={() => openTask(task, course.id, onSelectTask, onCreateThread)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card ring-1 ring-border/60">
                    <TaskTypeIcon task={task.task} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">{task.task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{task.fileCount} 个文件</span>
                      <span>·</span>
                      <span>{task.threadCount} 个会话</span>
                      <span>·</span>
                      <span>{task.lastTouchedLabel}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-background/65 px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
              还没有任务。先为下一份作业、展示或复习目标创建一个任务。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const weeks = buildActivityWeeks(days);
  return (
    <div className="mt-4">
      <div className="overflow-visible pb-1">
        <div className="min-w-0">
          <div className="mb-1 grid gap-[0.32rem] pl-9" style={{ gridTemplateColumns: `repeat(${weeks.length}, 0.75rem)` }}>
            {weeks.map((week) => (
              <div key={week.id} className="truncate text-center text-[8px] font-medium text-muted-foreground" title={`${week.label} · ${week.monthLabel}`}>
                {week.weekLabel}
              </div>
            ))}
          </div>
          <div className="mb-1 grid gap-[0.32rem] pl-9" style={{ gridTemplateColumns: `repeat(${weeks.length}, 0.75rem)` }}>
            {weeks.map((week, index) => (
              <div key={`${week.id}-month`} className="truncate text-center text-[8px] text-muted-foreground/70">
                {index === 0 || week.monthLabel !== weeks[index - 1]?.monthLabel ? week.shortMonthLabel : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
            <div className="grid grid-rows-7 gap-1 text-right text-[9px] leading-3 text-muted-foreground">
              {["周一", "", "周三", "", "周五", "", "周日"].map((label, index) => (
                <div key={`${label}-${index}`}>{label}</div>
              ))}
            </div>
            <div className="grid gap-[0.32rem]" style={{ gridTemplateColumns: `repeat(${weeks.length}, 0.75rem)` }}>
              {weeks.map((week) => (
                <div key={week.id} className="grid grid-rows-7 gap-1">
                  {week.days.map((day) => (
                    <div
                      key={day.dateKey}
                      className="group/day relative h-3 w-3"
                    >
                      <div className={cx("h-3 w-3 rounded-[3px] border transition group-hover/day:scale-110", heatCellClass(day.score))} />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-[10px] leading-4 text-foreground opacity-0 shadow-xl ring-1 ring-border transition group-hover/day:opacity-100">
                        <div className="font-semibold">{day.weekdayLabel}，{day.label}</div>
                        <div className="mt-1 text-muted-foreground">更新 {day.fileEvents} 个文件</div>
                        <div className="text-muted-foreground">更新 {day.sessionEvents} 个会话</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span>每列代表一周 · 最近 26 周</span>
        <span className="flex items-center gap-1">
          <span>少</span>
          {[0, 1, 3, 6].map((score) => (
            <span key={score} className={cx("h-3 w-3 rounded border", heatCellClass(score))} />
          ))}
          <span>多</span>
        </span>
      </div>
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-background/65 px-3 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function heatCellClass(score: number): string {
  if (score >= 8) return "border-blue-500/35 bg-blue-500";
  if (score >= 5) return "border-blue-400/35 bg-blue-400";
  if (score >= 2) return "border-blue-300/45 bg-blue-300";
  if (score >= 1) return "border-blue-200/70 bg-blue-100";
  return "border-border/70 bg-muted/45";
}

function openTask(task: TaskCard, courseId: string, onSelectTask: (courseId: string, taskId: string) => void, onCreateThread: (courseId?: string, taskId?: string) => void) {
  if (task.threadCount > 0) {
    onSelectTask(courseId, task.task.id);
    return;
  }
  onCreateThread(courseId, task.task.id);
}
