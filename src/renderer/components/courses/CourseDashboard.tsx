import { ArrowRight, BarChart3, BookOpen, CalendarClock, FileText, FolderOpen, Plus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { BrevynTask, Course, FileStats, SemesterWorkspace, Thread, WorkspaceFileNode } from "@/types/domain";
import { CourseIcon } from "@/components/courses/CourseIcon";
import { TaskTypeIcon } from "@/components/shell/TaskTypeIcon";
import { cx } from "@/lib/cn";

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
  const courseThreads = threads.filter((thread) => thread.courseId === course.id && !thread.archivedAt);
  const courseFiles = flattenFiles(files);
  const taskCards = buildTaskCards(tasks, courseThreads, courseFiles);
  const recentTask = taskCards[0];
  const activityDays = buildActivityDays(courseThreads, courseFiles);
  const draftFiles = courseFiles.filter(isDraftFile);
  const lectureFiles = courseFiles.filter((file) => file.sectionKind === "lecture");
  const lectureWeeks = buildLectureWeeks(lectureFiles);
  const filesTouchedThisWeek = courseFiles.filter((file) => isWithinDays(file.updatedAt, 7)).length;
  const activeTasks = taskCards.filter((task) => task.threadCount > 0 || task.fileCount > 0).length;
  const courseColor = course.color || "#2563eb";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_22%_8%,rgba(37,99,235,0.07),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,247,242,0.96))] p-5 text-sm text-foreground brevyn-scrollbar">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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
                    {semester?.term || course.term} · 课程看板
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
              <MetricCard label="会话" value={courseThreads.length.toString()} hint={`${courseThreads.filter((thread) => !thread.isDraft).length} 个已有消息`} />
              <MetricCard label="课程文件" value={(stats?.totalFiles ?? courseFiles.length).toString()} hint={`${stats?.sectionCount ?? 0} 个分区`} />
              <MetricCard label="草稿文件" value={draftFiles.length.toString()} hint={`本周更新 ${filesTouchedThisWeek} 个`} />
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4" />
                  活动热力图
                </div>
                <p className="mt-1 text-xs text-muted-foreground">最近 26 周的文件更新和会话活动。</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                {activityDays.reduce((sum, day) => sum + day.score, 0)} 活动
              </span>
            </div>
            <ActivityHeatmap days={activityDays} />
          </section>

          <section className="rounded-2xl border bg-card/88 p-4 shadow-sm ring-1 ring-border/50">
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
              <p className="mt-1 text-xs text-muted-foreground">课件、每周阅读和课程材料会独立于任务草稿统计。</p>
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
              还没有课件文件。可以从文件栏或课程管理里上传每周课程材料。
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
              <p className="mt-1 text-xs text-muted-foreground">选择一个任务，进入对应的写作、阅读或复习工作区。</p>
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

        <section className="grid gap-3 md:grid-cols-3">
          <FileKindCard icon={<FolderOpen className="h-4 w-4" />} label="任务材料" value={countSectionFiles(courseFiles, "materials").toString()} />
          <FileKindCard icon={<FileText className="h-4 w-4" />} label="草稿" value={draftFiles.length.toString()} />
          <FileKindCard icon={<FileText className="h-4 w-4" />} label="已提交" value={countSectionFiles(courseFiles, "submitted").toString()} />
        </section>
      </div>
    </div>
  );
}

type TaskCard = {
  task: BrevynTask;
  fileCount: number;
  threadCount: number;
  lastTouchedTime: number;
  sortTime: number;
  lastTouchedLabel: string;
};

type ActivityDay = {
  dateKey: string;
  label: string;
  weekdayLabel: string;
  monthLabel: string;
  shortMonthLabel: string;
  fileEvents: number;
  sessionEvents: number;
  score: number;
};

type ActivityWeek = {
  id: string;
  label: string;
  weekLabel: string;
  monthLabel: string;
  shortMonthLabel: string;
  days: ActivityDay[];
};

type LectureWeek = {
  id: string;
  label: string;
  files: WorkspaceFileNode[];
  indexedCount: number;
  latestTime: number;
  latestLabel: string;
};

const ACTIVITY_WEEK_COUNT = 26;

function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const weeks = buildActivityWeeks(days);
  return (
    <div className="mt-4">
      <div className="overflow-visible pb-1">
        <div className="min-w-0">
          <div className="mb-1 grid gap-1 pl-9" style={{ gridTemplateColumns: `repeat(${weeks.length}, 0.75rem)`, justifyContent: "space-between" }}>
            {weeks.map((week) => (
              <div key={week.id} className="truncate text-center text-[8px] font-medium text-muted-foreground" title={`${week.label} · ${week.monthLabel}`}>
                {week.weekLabel}
              </div>
            ))}
          </div>
          <div className="mb-1 grid gap-1 pl-9" style={{ gridTemplateColumns: `repeat(${weeks.length}, 0.75rem)`, justifyContent: "space-between" }}>
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
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, 0.75rem)`, justifyContent: "space-between" }}>
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

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-background/65 px-3 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function FileKindCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card/82 p-4 shadow-sm ring-1 ring-border/45">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</div>
      <div>
        <div className="text-lg font-semibold tracking-[-0.02em]">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function buildTaskCards(tasks: BrevynTask[], threads: Thread[], files: WorkspaceFileNode[]): TaskCard[] {
  return tasks
    .map((task) => {
      const taskThreads = threads.filter((thread) => thread.taskId === task.id);
      const taskFiles = files.filter((file) => file.taskId === task.id);
      const latestThread = [...taskThreads].sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt))[0];
      const latestFileTime = Math.max(0, ...taskFiles.map((file) => safeTime(file.updatedAt)));
      const dueTime = task.dueAt ? safeTime(task.dueAt) : 0;
      const lastTouchedTime = Math.max(safeTime(latestThread?.updatedAt), latestFileTime);
      return {
        task,
        fileCount: taskFiles.length,
        threadCount: taskThreads.length,
        lastTouchedTime,
        sortTime: lastTouchedTime || dueTime,
        lastTouchedLabel: lastTouchedTime > 0 ? formatRelativeZh(new Date(lastTouchedTime).toISOString()) : dueTime > 0 ? `截止 ${formatShortDate(task.dueAt || "")}` : "未开始",
      };
    })
    .sort((a, b) => b.sortTime - a.sortTime || a.task.title.localeCompare(b.task.title));
}

function buildActivityDays(threads: Thread[], files: WorkspaceFileNode[]): ActivityDay[] {
  const days = lastNDays(ACTIVITY_WEEK_COUNT * 7);
  const byDay = new Map(days.map((day) => [day.dateKey, { ...day, fileEvents: 0, sessionEvents: 0, score: 0 }]));
  for (const file of files) {
    const key = dateKey(file.updatedAt);
    const day = byDay.get(key);
    if (!day) continue;
    day.fileEvents += 1;
    day.score += isDraftFile(file) ? 2 : 1;
  }
  for (const thread of threads) {
    const key = dateKey(thread.updatedAt);
    const day = byDay.get(key);
    if (!day) continue;
    day.sessionEvents += 1;
    day.score += thread.isDraft ? 1 : 2;
  }
  return days.map((day) => byDay.get(day.dateKey) || day);
}

function buildActivityWeeks(days: ActivityDay[]): ActivityWeek[] {
  const weeks: ActivityWeek[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const weekDays = days.slice(index, index + 7);
    if (weekDays.length === 0) continue;
    weeks.push({
      id: weekDays[0].dateKey,
      label: index + 7 >= days.length ? "本周" : `第 ${Math.floor(index / 7) + 1} 周`,
      weekLabel: `${Math.floor(index / 7) + 1}`,
      monthLabel: weekDays[0].monthLabel,
      shortMonthLabel: weekDays[0].shortMonthLabel,
      days: weekDays,
    });
  }
  return weeks;
}

function lastNDays(count: number): ActivityDay[] {
  const today = startOfLocalDay(new Date());
  const currentWeekStart = startOfWeek(today);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() - (count - 7) + index);
    return {
      dateKey: dateKey(date.toISOString()),
      label: formatShortDate(date.toISOString()),
      weekdayLabel: formatWeekdayZh(date),
      monthLabel: `${date.getMonth() + 1}月`,
      shortMonthLabel: `${date.getMonth() + 1}`,
      fileEvents: 0,
      sessionEvents: 0,
      score: 0,
    };
  });
}

function buildLectureWeeks(files: WorkspaceFileNode[]): LectureWeek[] {
  const groups = new Map<string, WorkspaceFileNode[]>();
  for (const file of files) {
    const key = typeof file.weekNumber === "number" ? `week-${file.weekNumber}` : "unsorted";
    groups.set(key, [...(groups.get(key) || []), file]);
  }
  return Array.from(groups.entries())
    .map(([id, groupFiles]) => {
      const weekNumber = id.startsWith("week-") ? Number(id.replace("week-", "")) : null;
      const latestTime = Math.max(0, ...groupFiles.map((file) => safeTime(file.updatedAt)));
      return {
        id,
        label: typeof weekNumber === "number" && Number.isFinite(weekNumber) ? `第 ${weekNumber} 周` : "未分周课件",
        files: groupFiles,
        indexedCount: groupFiles.filter((file) => file.indexedAt || file.indexingStatus === "indexed").length,
        latestTime,
        latestLabel: latestTime > 0 ? formatRelativeZh(new Date(latestTime).toISOString()) : "暂无活动",
      };
    })
    .sort((a, b) => lectureWeekSortValue(a.id) - lectureWeekSortValue(b.id));
}

function flattenFiles(nodes: WorkspaceFileNode[]): WorkspaceFileNode[] {
  const result: WorkspaceFileNode[] = [];
  for (const node of nodes) {
    if (node.kind !== "folder") result.push(node);
    if (node.children) result.push(...flattenFiles(node.children));
  }
  return result;
}

function countSectionFiles(files: WorkspaceFileNode[], bucket: "materials" | "drafts" | "submitted"): number {
  return files.filter((file) => file.taskFileBucket === bucket || file.path.toLowerCase().includes(`/${bucket}/`)).length;
}

function isDraftFile(file: WorkspaceFileNode): boolean {
  return file.taskFileBucket === "drafts" || file.path.toLowerCase().includes("/drafts/");
}

function isWithinDays(value: string, days: number): boolean {
  const time = safeTime(value);
  if (!time) return false;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function heatCellClass(score: number): string {
  if (score >= 8) return "border-blue-700/20 bg-blue-700";
  if (score >= 5) return "border-blue-600/20 bg-blue-500";
  if (score >= 2) return "border-blue-400/20 bg-blue-300";
  if (score >= 1) return "border-blue-300/30 bg-blue-100";
  return "border-border/70 bg-muted/45";
}

function openTask(task: TaskCard, courseId: string, onSelectTask: (courseId: string, taskId: string) => void, onCreateThread: (courseId?: string, taskId?: string) => void) {
  if (task.threadCount > 0) {
    onSelectTask(courseId, task.task.id);
    return;
  }
  onCreateThread(courseId, task.task.id);
}

function dateKey(value: string): string {
  const date = startOfLocalDay(new Date(value));
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const result = startOfLocalDay(date);
  const day = result.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + mondayOffset);
  return result;
}

function safeTime(value?: string): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function formatShortDate(value: string): string {
  const time = safeTime(value);
  if (!time) return "";
  return new Date(time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function lectureWeekSortValue(id: string): number {
  if (id === "unsorted") return Number.MAX_SAFE_INTEGER;
  const value = Number(id.replace("week-", ""));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function formatRelativeZh(value: string): string {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatWeekdayZh(date: Date): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()] || "";
}
