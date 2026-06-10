import { ArrowRight, BarChart3, CalendarDays, MessageSquare, NotebookTabs, Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { BrevynTask, Course, FileStats, SemesterWorkspace, Thread, WorkspaceFileNode } from "@/types/domain";
import { CourseIcon } from "@/components/courses/CourseIcon";
import { TaskTypeIcon } from "@/components/shell/TaskTypeIcon";
import { ActivityHeatmap, MetricCard } from "@/components/courses/CourseDashboard";
import { buildSemesterDashboardStats } from "@/components/courses/courseDashboardStats";

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

  return (
    <div className="brevyn-dashboard-background min-h-0 flex-1 overflow-y-auto p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full min-w-[64rem] max-w-5xl flex-col gap-4">
        <section className="overflow-hidden rounded-2xl border bg-card/90 p-5 shadow-sm ring-1 ring-border/60">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {semester?.term || homeCourse?.term || "当前学期"}
                {semester?.semesterNo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] normal-case tracking-normal">Semester {semester.semesterNo}</span>}
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
            <div className="rounded-2xl bg-background/62 p-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.62)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="h-4 w-4" />
                {recentTask ? "最近课程作业" : "建议入口"}
              </div>
              {recentTask ? (
                <button
                  type="button"
                  className="mt-3 block w-full rounded-xl bg-card/86 p-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--border)/0.54)] transition hover:bg-accent/45 active:scale-[0.99]"
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
                <div className="mt-3 rounded-xl bg-card/74 p-3 text-xs leading-5 text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]">
                  还没有活跃课程作业。先打开我的课程创建作业，或让学期会话帮你拆出本周任务。
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
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
          {courseCards.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {courseCards.map((course) => (
                <button
                  key={course.course.id}
                  type="button"
                  className="group flex min-w-0 items-center gap-3 rounded-xl border bg-background/68 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-sm"
                  onClick={() => onSelectCourse(course.course.id)}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-border/60"
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
          ) : (
            <div className="rounded-xl border border-dashed bg-background/65 px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
              当前学期还没有课程。先在我的课程里添加课程。
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
