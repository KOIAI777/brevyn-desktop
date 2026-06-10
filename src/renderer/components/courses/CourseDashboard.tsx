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

  if (tasks.length === 0) {
    return (
      <EmptyCourseTaskStart
        course={course}
        semester={semester}
        courseColor={courseColor}
        courseFileCount={courseFileCount}
        courseThreadsCount={courseThreads.length}
        lectureFileCount={lectureFiles.length}
        onOpenTasks={onOpenTasks}
      />
    );
  }

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
                    <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground">{course.name}</h2>
                    <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{course.code}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {semester?.term || course.term} · 课程作业、课件和会话入口
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {recentTask && (
                  <button
                    type="button"
                    className="inline-flex h-8 max-w-[18rem] items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
                    onClick={() => openTask(recentTask, course.id, onSelectTask, onCreateThread)}
                    title={recentTask.task.title}
                  >
                    <span className="truncate">继续 {recentTask.task.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onClick={onOpenTasks}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建课程作业
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="课程作业" value={activeTasks.toString()} hint={`共 ${tasks.length} 个`} />
              <MetricCard label="会话" value={courseThreads.length.toString()} hint={`${threadsWithMessages} 个已有消息`} />
              <MetricCard label="资料" value={courseFileCount.toString()} hint={`${sectionCount} 个分区`} />
              <MetricCard label="草稿" value={draftFiles.length.toString()} hint={`本周更新 ${filesTouchedThisWeek} 个`} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4" />
                课程作业
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onOpenTasks}
            >
              <Plus className="h-3.5 w-3.5" />
              新建作业
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
              还没有课程作业。先为下一份 essay、展示或复习目标创建一个入口。
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="min-w-0 rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4" />
                  活动记录
                </div>
              </div>
            </div>
            <ActivityHeatmap days={activityDays} />
          </section>

          <section className="min-w-[21rem] rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4" />
              资料入口
            </div>
            <div className="mt-3 rounded-xl border bg-background/70 p-3">
              <div className="text-xs font-semibold text-foreground">{lectureFiles.length > 0 ? `${lectureFiles.length} 个课件文件` : "还没有课件资料"}</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {lectureWeeks.length > 0 ? `${lectureWeeks.length} 个周次 · 本周更新 ${filesTouchedThisWeek} 个文件` : "上传 syllabus、reading 或每周课件后，这里会成为课程资料入口。"}
              </div>
              <button
                type="button"
                className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-accent"
                onClick={onOpenTasks}
              >
                管理课程资料
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
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

      </div>
    </div>
  );
}

function EmptyCourseTaskStart({
  course,
  semester,
  courseColor,
  courseFileCount,
  courseThreadsCount,
  lectureFileCount,
  onOpenTasks,
}: {
  course: Course;
  semester?: SemesterWorkspace | null;
  courseColor: string;
  courseFileCount: number;
  courseThreadsCount: number;
  lectureFileCount: number;
  onOpenTasks: () => void;
}) {
  return (
    <div className="brevyn-dashboard-background min-h-0 flex-1 overflow-y-auto p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full min-w-[64rem] max-w-5xl flex-col">
        <section className="relative overflow-hidden rounded-[var(--radius-window)] bg-[linear-gradient(180deg,hsl(var(--card)/0.98),hsl(var(--surface-panel)/0.94))] shadow-[var(--shadow-panel)]">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/12 to-transparent" />
          <div className="pointer-events-none absolute -bottom-12 right-8 select-none text-[9rem] font-semibold leading-none tracking-[-0.08em] text-foreground/5">
            03
          </div>

          <header className="relative z-[1] flex items-center justify-between gap-4 border-b border-border/50 px-6 py-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
                style={{ color: courseColor, backgroundColor: `${courseColor}18`, boxShadow: `inset 0 0 0 1px ${courseColor}30` }}
              >
                <CourseIcon course={course} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-semibold tracking-[-0.02em] text-foreground">{course.name}</span>
                  {course.code && (
                    <span className="shrink-0 rounded-[var(--radius-badge)] bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {course.code}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{semester?.term || course.term || "当前学期"}</div>
              </div>
            </div>
            <span className="shrink-0 rounded-[var(--radius-badge)] bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              0 个课程作业
            </span>
          </header>

          <div className="relative z-[1] grid min-h-[30rem] gap-8 px-7 py-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                课程作业
              </div>
              <h2 className="mt-6 max-w-2xl text-[3rem] font-semibold leading-[0.98] tracking-[-0.07em] text-foreground">
                让任务就位。
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
                课程是工作区，课程作业是具体目标。为 essay、project、exam 或复习计划建立一个作业空间，资料、草稿和会话会围绕它继续沉淀。
              </p>

              <div className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-border/50 border-y border-border/55 text-xs">
                <EmptyTaskMilestone index="01" title="要求" text="放入 brief 与 rubric" />
                <EmptyTaskMilestone index="02" title="资料" text="收集 readings 与 notes" />
                <EmptyTaskMilestone index="03" title="会话" text="围绕目标推进" />
              </div>
            </div>

            <aside className="flex min-w-0 items-center">
              <div className="w-full overflow-hidden rounded-[var(--radius-panel)] bg-background/78 shadow-[0_18px_40px_hsl(var(--foreground)/0.06),inset_0_0_0_1px_hsl(var(--border)/0.52)]">
                <div className="border-b border-border/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <Sparkles className="h-4 w-4" />
                    创建课程作业
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    先从名称开始。图标、截止日期和资料可以稍后补充。
                  </p>
                </div>

                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-5 px-4 py-4 text-left transition hover:bg-accent/45 active:scale-[0.995]"
                  onClick={onOpenTasks}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-foreground text-background">
                      <Plus className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold tracking-[-0.02em] text-foreground">新建课程作业</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">为这门课创建 essay、项目、考试或复习入口。</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>

                <div className="mx-4 h-px bg-border/45" />

                <div className="px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">课程空间</div>
                  <div className="mt-3 grid gap-2 text-xs">
                    <CourseTaskSpaceRow label="课程资料" value={`${courseFileCount} 个文件`} />
                    <CourseTaskSpaceRow label="课件" value={`${lectureFileCount} 个文件`} />
                    <CourseTaskSpaceRow label="会话" value={`${courseThreadsCount} 个`} />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyTaskMilestone({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 last:pr-0">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">{index}</div>
      <div className="mt-2 text-sm font-semibold tracking-[-0.02em] text-foreground">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function CourseTaskSpaceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/40 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
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
