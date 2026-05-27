import { CalendarDays, Check, FileArchive, FileCode, FileImage, FileText, FolderOpen, Layers3, Library, Loader2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Course, CourseFileSectionKind, FileImportInput, FileImportResult, SemesterWorkspace, TaskFileBucket, BrevynTask } from "@/types/domain";
import { cx } from "@/lib/cn";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { semesterWeekNumberForDate, semesterWeekNumbers } from "../../../shared/semester-weeks";

const TASK_BUCKET_LABELS: Record<TaskFileBucket, string> = {
  materials: "材料",
  drafts: "草稿",
  submitted: "已提交",
};
const MAX_LECTURE_WEEK_OPTIONS = 30;

export function CourseFilesUploadDialog({
  course,
  semester,
  courses,
  tasksByCourse,
  activeTaskId,
  onClose,
  onImportFiles,
}: {
  course?: Course;
  semester?: SemesterWorkspace | null;
  courses: Course[];
  tasksByCourse: Record<string, BrevynTask[]>;
  activeTaskId?: string;
  onClose: () => void;
  onImportFiles: (input: FileImportInput) => Promise<FileImportResult | null>;
}) {
  const initialCourseId = course?.id || courses[0]?.id || "";
  const initialCourseTasks = tasksByCourse[initialCourseId] || [];
  const initialTaskId = initialCourseTasks.some((task) => task.id === activeTaskId) ? activeTaskId || "" : "";
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);
  const [importing, setImporting] = useState(false);
  const [targetSection, setTargetSection] = useState<CourseFileSectionKind>(initialTaskId ? "task" : "course_shared");
  const [taskId, setTaskId] = useState(initialTaskId);
  const [taskFileBucket, setTaskFileBucket] = useState<TaskFileBucket>("materials");
  const [lectureWeekNumber, setLectureWeekNumber] = useState(() => defaultLectureWeekNumber(semester));
  const [lastResult, setLastResult] = useState<FileImportResult | null>(null);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    if (importing) return;
    setSelectedCourseId(initialCourseId);
    setTaskId(initialTaskId);
    setTargetSection(initialTaskId ? "task" : "course_shared");
    setTaskFileBucket("materials");
    setLectureWeekNumber(defaultLectureWeekNumber(semester));
    setLastResult(null);
    setImportError("");
  }, [activeTaskId, course?.id, importing, initialCourseId, initialTaskId, semester?.endsAt, semester?.startsAt]);

  const selectedCourse = courses.find((item) => item.id === selectedCourseId);
  const isSemesterTarget = selectedCourse?.workspaceKind === "semester_home";
  const courseTasks = useMemo(() => tasksByCourse[selectedCourseId] || [], [selectedCourseId, tasksByCourse]);
  const lectureWeekOptions = useMemo(() => semesterWeekOptions(semester), [semester]);
  const selectedTask = !isSemesterTarget && targetSection === "task" ? courseTasks.find((task) => task.id === taskId) : undefined;
  const selectedTaskId = selectedTask?.id;
  const normalizedTargetSection = isSemesterTarget ? "course_shared" : targetSection;
  const canImport = Boolean(selectedCourseId) && (normalizedTargetSection !== "task" || Boolean(selectedTaskId));
  const targetPathPreview = isSemesterTarget
    ? "学期共享"
    : normalizedTargetSection === "course_shared"
      ? "课程共享"
      : normalizedTargetSection === "lecture"
        ? lectureWeekNumber
          ? `课件 / Week ${lectureWeekNumber}`
          : "课件"
        : selectedTask
          ? `任务 / ${selectedTask.id}__${selectedTask.title} / ${TASK_BUCKET_LABELS[taskFileBucket]}`
          : "任务 / 请先选择任务";

  async function handleImport() {
    if (!canImport) return;
    setImporting(true);
    setImportError("");
    setLastResult(null);
    try {
      const result = await onImportFiles({
        courseId: selectedCourseId,
        targetSection: normalizedTargetSection,
        weekNumber: normalizedTargetSection === "lecture" ? lectureWeekNumber : undefined,
        taskId: selectedTaskId,
        taskFileBucket: normalizedTargetSection === "task" ? taskFileBucket : undefined,
      });
      setLastResult(result);
      if (result?.indexingError) {
        setImportError(`已导入 ${result.files.length} 个文件，但索引未排队：${result.indexingError}`);
        return;
      }
      if (result?.files.length) onClose();
    } catch (error) {
      setImportError(errorMessage(error, "导入文件失败。"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-6 backdrop-blur-sm">
      <div className="flex max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4" />
              导入课程文件
            </div>
              <div className="truncate text-[11px] text-muted-foreground">把文件放入课程共享、课件或任务目录，并加入索引队列</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="关闭导入"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1.05fr_0.95fr] brevyn-scrollbar">
          <section className="rounded-lg border border-dashed bg-background/70 p-4">
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md bg-card px-5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground text-background">
                {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
              </div>
              <div className="mt-4 text-sm font-semibold">从本机选择文件</div>
              <div className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                文件会保留在本地。你可以选择导入到课程共享、课件，或某个任务的工作区。
              </div>
              <button
                type="button"
                className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={importing || !canImport}
                onClick={handleImport}
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "正在导入..." : "导入文件"}
              </button>
              {lastResult?.indexingJob && (
                <div className="mt-4 rounded-md bg-muted/55 px-3 py-2 text-[11px] text-muted-foreground">
                  已将 {lastResult.indexingJob.totalFiles ?? lastResult.indexingJob.indexedFiles} 个文件加入索引队列 · {lastResult.indexingJob.embeddingModel}
                </div>
              )}
              {importError && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-700">{importError}</div>}
            </div>
          </section>

          <aside className="space-y-3">
            <section className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs font-semibold">目标课程</div>
              <DropdownSelect
                className="mt-2"
                value={selectedCourseId}
                options={courses.map((item) => ({
                  value: item.id,
                  label: item.name,
                  detail: `${item.code || "Brevyn"} · ${item.term || "本地"}`,
                }))}
                placeholder="选择课程"
                ariaLabel="选择课程"
                onChange={(value) => {
                  setSelectedCourseId(value);
                  setTaskId("");
                  const next = courses.find((item) => item.id === value);
                  if (next?.workspaceKind === "semester_home") setTargetSection("course_shared");
                }}
              />
              <div className="mt-2 rounded-md bg-muted/55 px-3 py-2">
                <div className="truncate text-sm font-medium">{selectedCourse?.name || "未选择课程"}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {selectedCourse?.code || "Brevyn"} · {selectedCourse?.term || "本地"}
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs font-semibold">目标位置</div>
              <div className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground">
                <TargetButton active={normalizedTargetSection === "course_shared"} icon={<FolderOpen className="h-3 w-3" />} label={isSemesterTarget ? "学期共享" : "课程共享"} onClick={() => setTargetSection("course_shared")} />
                {!isSemesterTarget && <TargetButton active={targetSection === "lecture"} icon={<CalendarDays className="h-3 w-3" />} label="课件" onClick={() => setTargetSection("lecture")} />}
                {!isSemesterTarget && <TargetButton active={targetSection === "task"} icon={<FileText className="h-3 w-3" />} label="任务工作区" onClick={() => setTargetSection("task")} />}
              </div>

              {!isSemesterTarget && targetSection === "lecture" && lectureWeekOptions.length > 0 && (
                <label className="mt-3 block space-y-1 text-[11px] text-muted-foreground">
                  <span>课件周次</span>
                  <DropdownSelect
                    value={lectureWeekNumber ? String(lectureWeekNumber) : ""}
                    options={lectureWeekOptions}
                    placeholder="选择周次"
                    ariaLabel="选择课件周次"
                    menuMaxVisibleItems={5}
                    onChange={(value) => setLectureWeekNumber(Number(value))}
                  />
                  <span className="block rounded-md bg-muted/45 px-2 py-1.5">
                    上传后会进入 Lecture / Week {lectureWeekNumber || 1}，并带上周次索引信息。
                  </span>
                </label>
              )}

              {!isSemesterTarget && targetSection === "task" && (
                <div className="mt-3 space-y-3">
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>任务</span>
                    <DropdownSelect
                      value={selectedTaskId || ""}
                      options={courseTasks.map((task) => ({
                        value: task.id,
                        label: task.title,
                        detail: task.taskType,
                      }))}
                      placeholder="选择任务"
                      ariaLabel="选择任务"
                      disabled={courseTasks.length === 0}
                      onChange={(value) => setTaskId(value)}
                    />
                    {courseTasks.length === 0 && <span className="block rounded-md bg-muted/55 px-2 py-2">请先创建任务，再导入到任务工作区。</span>}
                  </label>

                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">分类</div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] text-muted-foreground">
                      {(["materials", "drafts", "submitted"] as TaskFileBucket[]).map((bucket) => (
                        <TargetButton
                          key={bucket}
                          active={taskFileBucket === bucket}
                          icon={<FileText className="h-3 w-3" />}
                          label={TASK_BUCKET_LABELS[bucket]}
                          onClick={() => setTaskFileBucket(bucket)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 inline-flex w-full items-center gap-1.5 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">
                <Layers3 className="h-3 w-3 shrink-0" />
                {targetPathPreview}
              </div>
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs font-semibold">支持类型</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <TypeChip icon={<FileText className="h-3 w-3" />} label="PDF / DOCX" />
                <TypeChip icon={<Library className="h-3 w-3" />} label="PPT / PPTX" />
                <TypeChip icon={<FileImage className="h-3 w-3" />} label="PNG / JPG" />
                <TypeChip icon={<FileCode className="h-3 w-3" />} label="代码" />
                <TypeChip icon={<FileArchive className="h-3 w-3" />} label="ZIP 稍后支持" />
                <TypeChip icon={<FileText className="h-3 w-3" />} label="MD / TXT" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TargetButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx("inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left", active ? "bg-muted text-foreground ring-1 ring-border/70" : "bg-card hover:text-foreground")}
      onClick={onClick}
    >
      {active && <Check className="h-3 w-3 shrink-0 text-emerald-600" />}
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function TypeChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "").trim();
  return message || fallback;
}

function semesterWeekOptions(semester?: SemesterWorkspace | null) {
  return lectureWeekNumbersForOptions(semester).map((week) => ({
    value: String(week),
    label: `Week ${week}`,
    detail: `第 ${week} 周`,
  }));
}

function defaultLectureWeekNumber(semester?: SemesterWorkspace | null): number | undefined {
  const weeks = lectureWeekNumbersForOptions(semester);
  if (weeks.length === 0) return undefined;
  const currentWeek = semesterWeekNumberForDate(semester, new Date());
  return currentWeek && weeks.includes(currentWeek) ? currentWeek : weeks[0];
}

function lectureWeekNumbersForOptions(semester?: SemesterWorkspace | null): number[] {
  return semesterWeekNumbers(semester).slice(0, MAX_LECTURE_WEEK_OPTIONS);
}
