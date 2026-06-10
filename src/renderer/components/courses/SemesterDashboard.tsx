import { ArrowRight, BarChart3, CalendarDays, MessageSquare, NotebookTabs, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { BrevynTask, Course, FileStats, SemesterWorkspace, Thread, WorkspaceFileNode } from "@/types/domain";
import { CourseIcon } from "@/components/courses/CourseIcon";
import { TaskTypeIcon } from "@/components/shell/TaskTypeIcon";
import { ActivityHeatmap, MetricCard } from "@/components/courses/CourseDashboard";
import { buildSemesterDashboardStats } from "@/components/courses/courseDashboardStats";
import { VisionRecognitionImportButton } from "@/components/vision/VisionRecognitionImportDialog";

export function SemesterDashboard({
  semester,
  homeCourse,
  courses,
  tasksByCourse,
  threads,
  stats,
  files,
  onOpenHomeSession,
  onOpenCourses,
  onWorkspaceChanged,
  onSelectCourse,
  onSelectTask,
}: {
  semester?: SemesterWorkspace | null;
  homeCourse?: Course;
  courses: Course[];
  tasksByCourse: Record<string, BrevynTask[]>;
  threads: Thread[];
  stats?: FileStats | null;
  files: WorkspaceFileNode[];
  onOpenHomeSession: () => void;
  onOpenCourses: () => void;
  onWorkspaceChanged?: () => Promise<void> | void;
  onSelectCourse: (courseId: string) => void;
  onSelectTask: (courseId: string, taskId: string) => void;
}) {
  const dashboardStats = useMemo(
    () => buildSemesterDashboardStats({ homeCourse, courses, tasksByCourse, threads, files, stats }),
    [courses, files, homeCourse, stats, tasksByCourse, threads],
  );
  const {
    visibleCourses,
    semesterThreads,
    allTasks,
    activityDays,
    courseCards,
    recentTask,
    homeThread,
    quietCourses,
    emptyCourseCount,
    fileCount,
    threadsWithMessages,
  } = dashboardStats;

  if (courseCards.length === 0) {
    return (
      <EmptySemesterCourseStart
        semester={semester}
        homeCourse={homeCourse}
        onOpenCourses={onOpenCourses}
        onOpenHomeSession={onOpenHomeSession}
        onWorkspaceChanged={onWorkspaceChanged}
      />
    );
  }

  return (
    <div className="brevyn-dashboard-background min-h-0 flex-1 overflow-y-auto p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full min-w-[64rem] max-w-5xl flex-col gap-4">
        <section className="overflow-hidden rounded-[var(--radius-panel)] border bg-card/90 p-5 shadow-sm ring-1 ring-border/60">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {semester?.term || homeCourse?.term || "当前学期"}
                {semester?.semesterNo && <span className="rounded-[var(--radius-badge)] bg-muted px-2 py-0.5 text-[10px] normal-case tracking-normal">Semester {semester.semesterNo}</span>}
              </div>
              <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.035em] text-foreground">今天从哪里开始？</h2>
              <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
                先继续最近的课程作业；如果还没明确目标，就让本学期会话帮你整理课程、资料和待办。
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {recentTask ? (
                  <button
                    type="button"
                    className="inline-flex h-9 max-w-[20rem] items-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 active:scale-[0.98]"
                    onClick={() => onSelectTask(recentTask.courseId, recentTask.task.id)}
                    title={recentTask.task.title}
                  >
                    <span className="truncate">继续 {recentTask.task.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 active:scale-[0.98]"
                    onClick={onOpenHomeSession}
                  >
                    规划本周
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                  onClick={onOpenHomeSession}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  询问本学期
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                  onClick={onOpenCourses}
                >
                  <NotebookTabs className="h-3.5 w-3.5" />
                  我的课程
                </button>
              </div>
            </div>
            <div className="rounded-[var(--radius-panel)] bg-background/62 p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.62)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="h-4 w-4" />
                {recentTask ? "最近课程作业" : "建议入口"}
              </div>
              {recentTask ? (
                <button
                  type="button"
                  className="mt-3 block w-full rounded-[var(--radius-card)] bg-card/86 p-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--border)/0.54)] transition hover:bg-accent/45 active:scale-[0.99]"
                  onClick={() => onSelectTask(recentTask.courseId, recentTask.task.id)}
                >
                  <div className="flex items-start gap-2">
                    <TaskTypeIcon task={recentTask.task} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{recentTask.task.title}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{recentTask.courseName}</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        {recentTask.fileCount} 个文件 · {recentTask.threadCount} 个会话 · {recentTask.lastTouchedLabel}
                      </div>
                    </div>
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ) : (
                <div className="mt-3 rounded-[var(--radius-card)] bg-card/74 p-3 text-xs leading-5 text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
                  还没有活跃课程作业。先打开我的课程创建作业，或让学期会话帮你拆出本周任务。
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-panel)] border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <NotebookTabs className="h-4 w-4" />
                课程入口
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onOpenCourses}
            >
              我的课程
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {courseCards.map((course) => (
              <button
                key={course.course.id}
                type="button"
                className="group flex min-w-0 items-center gap-3 rounded-[var(--radius-card)] border bg-background/68 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-sm"
                onClick={() => onSelectCourse(course.course.id)}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] ring-1 ring-border/60"
                  style={{ color: course.course.color, backgroundColor: `${course.course.color}18` }}
                >
                  <CourseIcon course={course.course} className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{course.course.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{course.taskCount} 个任务</span>
                    <span>·</span>
                    <span>{course.fileCount} 个文件</span>
                    <span>·</span>
                    <span>{course.threadCount} 个会话</span>
                    <span>·</span>
                    <span>{course.lastActivityLabel}</span>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="min-w-0 rounded-[var(--radius-panel)] border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
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

          <section className="min-w-[21rem] rounded-[var(--radius-panel)] border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              学期状态
            </div>
            <div className="mt-3 grid gap-2">
              <MetricCard label="课程" value={visibleCourses.length.toString()} hint={`${quietCourses} 门本周较安静`} />
              <MetricCard label="课程作业" value={allTasks.length.toString()} hint={`${recentTask ? "最近有推进" : "等待创建"}`} />
              <MetricCard label="资料" value={fileCount.toString()} hint={`${emptyCourseCount} 门课程暂无文件`} />
              <MetricCard label="会话" value={semesterThreads.length.toString()} hint={`${threadsWithMessages} 个已有消息`} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptySemesterCourseStart({
  semester,
  homeCourse,
  onOpenCourses,
  onOpenHomeSession,
  onWorkspaceChanged,
}: {
  semester?: SemesterWorkspace | null;
  homeCourse?: Course;
  onOpenCourses: () => void;
  onOpenHomeSession: () => void;
  onWorkspaceChanged?: () => Promise<void> | void;
}) {
  return (
    <div className="brevyn-dashboard-background min-h-0 flex-1 overflow-y-auto p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full min-w-[64rem] max-w-5xl flex-col">
        <section className="relative overflow-hidden rounded-[var(--radius-window)] bg-[linear-gradient(180deg,hsl(var(--card)/0.98),hsl(var(--surface-panel)/0.94))] shadow-[var(--shadow-panel)]">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/12 to-transparent" />
          <div className="pointer-events-none absolute -bottom-12 right-8 select-none text-[9rem] font-semibold leading-none tracking-[-0.08em] text-foreground/5">
            02
          </div>
          <header className="relative z-[1] flex items-center justify-between gap-4 border-b border-border/50 px-6 py-5">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span className="truncate">{semester?.term || homeCourse?.term || "当前学期"}</span>
              {semester?.semesterNo && <span className="rounded-[var(--radius-badge)] bg-muted px-2 py-0.5 text-[10px] normal-case tracking-normal">Semester {semester.semesterNo}</span>}
            </div>
            <span className="shrink-0 rounded-[var(--radius-badge)] bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              0 门课程
            </span>
          </header>

          <div className="relative z-[1] grid min-h-[30rem] gap-8 px-7 py-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                课程
              </div>
              <h2 className="mt-6 max-w-2xl text-[3rem] font-semibold leading-[0.98] tracking-[-0.07em] text-foreground">
                让课程就位。
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
                上传课表，或手动添加课程。每门课程都会成为一个独立工作区，资料、作业和会话会在对应课程下继续展开。
              </p>

              <div className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-border/50 border-y border-border/55 text-xs">
                <EmptyCourseMilestone index="01" title="手动添加" text="适合先建一门课" />
                <EmptyCourseMilestone index="02" title="课表识别" text="适合批量导入" />
                <EmptyCourseMilestone index="03" title="课程作业" text="在课程里创建任务空间" />
              </div>
            </div>

            <aside className="flex min-w-0 items-center">
              <div className="w-full overflow-hidden rounded-[var(--radius-panel)] bg-background/78 shadow-[0_18px_40px_hsl(var(--foreground)/0.06),inset_0_0_0_1px_hsl(var(--border)/0.52)]">
                <div className="border-b border-border/50 px-4 py-3">
                  <div className="text-[13px] font-semibold text-foreground">添加课程</div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">选择一种开始方式。</p>
                </div>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-5 px-4 py-4 text-left transition hover:bg-accent/45 active:scale-[0.995]"
                  onClick={onOpenCourses}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-foreground text-background">
                      <NotebookTabs className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold tracking-[-0.02em] text-foreground">手动添加课程</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">输入课程名称，创建课程空间。</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>

                <div className="mx-4 h-px bg-border/45" />

                <div className="flex items-center justify-between gap-5 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tracking-[-0.02em] text-foreground">从课表识别</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">上传课表截图，批量生成课程，导入前可以确认。</div>
                    </div>
                  </div>
                  <VisionRecognitionImportButton
                    kind="course_timetable"
                    className="!h-9 !shrink-0 !rounded-[var(--radius-control)] !border-border/60 !bg-card !px-3 !text-foreground hover:!bg-accent"
                    onImported={async () => {
                      await onWorkspaceChanged?.();
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 border-t border-border/45 px-4 py-3 text-xs font-medium text-muted-foreground transition hover:bg-accent/35 hover:text-foreground active:scale-[0.99]"
                  onClick={onOpenHomeSession}
                >
                  跳过课程，打开学期会话
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyCourseMilestone({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 last:pr-0">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">{index}</div>
      <div className="mt-2 text-sm font-semibold tracking-[-0.02em] text-foreground">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}
