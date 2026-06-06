import { ArrowRight, BarChart3, BookOpen, CalendarDays, Home, MessageSquare, Sparkles } from "lucide-react";
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm ring-1 ring-border/40">
                <Home className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground">{semester?.term || homeCourse?.term || "当前学期"}</h2>
                  {semester?.semesterNo && <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Semester {semester.semesterNo}</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">学期总控台 · 跨课程文件、任务和会话状态</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
                onClick={onOpenHomeSession}
              >
                打开跨课程会话
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={onOpenCourses}
              >
                <BookOpen className="h-3.5 w-3.5" />
                管理课程
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="课程" value={visibleCourses.length.toString()} hint={`${quietCourses} 门本周较安静`} />
            <MetricCard label="任务" value={allTasks.length.toString()} hint={`${recentTask ? "最近有推进" : "等待创建"}`} />
            <MetricCard label="文件" value={fileCount.toString()} hint={`${emptyCourseCount} 门课程暂无文件`} />
            <MetricCard label="会话" value={semesterThreads.length.toString()} hint={`${threadsWithMessages} 个已有消息`} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="min-w-0 rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4" />
                  学期活动热力图
                </div>
              </div>
            </div>
            <ActivityHeatmap days={activityDays} />
          </section>

          <section className="min-w-[21rem] rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              继续工作
            </div>
            {recentTask ? (
              <button
                type="button"
                className="mt-3 block w-full rounded-xl border bg-background/70 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-sm"
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
              <div className="mt-3 rounded-xl border border-dashed bg-background/65 p-4 text-xs leading-5 text-muted-foreground">
                还没有活跃任务。可以从课程管理里创建任务，或先打开跨课程会话做本周规划。
              </div>
            )}
            <button
              type="button"
              className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-accent"
              onClick={onOpenHomeSession}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {homeThread ? "打开 Home 会话" : "创建 Home 会话"}
            </button>
          </section>
        </div>

        <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4" />
                课程状态
              </div>
            </div>
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
              当前学期还没有课程。先在课程管理里添加课程。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
