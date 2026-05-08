import { CalendarDays, Check, FileArchive, FileCode, FileImage, FileText, FolderOpen, Layers3, Library, Loader2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Course, CourseFileSectionKind, FileImportInput, FileImportResult, TaskFileBucket, UclawTask } from "@/types/domain";
import { cx } from "@/lib/cn";

const TASK_BUCKET_LABELS: Record<TaskFileBucket, string> = {
  materials: "Materials",
  drafts: "Drafts",
  submitted: "Submitted",
};

export function CourseFilesUploadDialog({
  course,
  courses,
  tasksByCourse,
  activeTaskId,
  onClose,
  onImportFiles,
}: {
  course?: Course;
  courses: Course[];
  tasksByCourse: Record<string, UclawTask[]>;
  activeTaskId?: string;
  onClose: () => void;
  onImportFiles: (input: FileImportInput) => Promise<FileImportResult | null>;
}) {
  const initialCourseId = course?.id || courses[0]?.id || "";
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);
  const [importing, setImporting] = useState(false);
  const [targetSection, setTargetSection] = useState<CourseFileSectionKind>("course_shared");
  const [taskId, setTaskId] = useState(activeTaskId || "");
  const [taskFileBucket, setTaskFileBucket] = useState<TaskFileBucket>("materials");
  const [lastResult, setLastResult] = useState<FileImportResult | null>(null);

  const selectedCourse = courses.find((item) => item.id === selectedCourseId);
  const isSemesterTarget = selectedCourse?.workspaceKind === "semester_home";
  const courseTasks = useMemo(() => tasksByCourse[selectedCourseId] || [], [selectedCourseId, tasksByCourse]);
  const selectedTaskId = !isSemesterTarget && targetSection === "task" ? taskId || courseTasks[0]?.id || "" : undefined;
  const selectedTask = courseTasks.find((task) => task.id === selectedTaskId);
  const normalizedTargetSection = isSemesterTarget ? "course_shared" : targetSection;
  const canImport = Boolean(selectedCourseId) && (normalizedTargetSection !== "task" || Boolean(selectedTaskId));
  const targetPathPreview = isSemesterTarget
    ? "Semester shared"
    : normalizedTargetSection === "course_shared"
      ? "Course shared"
      : normalizedTargetSection === "lecture"
        ? "Lecture"
        : selectedTask
          ? `Task / ${selectedTask.taskType} / ${selectedTask.title} / ${TASK_BUCKET_LABELS[taskFileBucket]}`
          : "Task / Assignment / New task";

  async function handleImport() {
    if (!canImport) return;
    setImporting(true);
    try {
      const result = await onImportFiles({
        courseId: selectedCourseId,
        targetSection: normalizedTargetSection,
        taskId: selectedTaskId,
        taskFileBucket: normalizedTargetSection === "task" ? taskFileBucket : undefined,
      });
      setLastResult(result);
      if (result?.files.length) onClose();
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
              Course File Upload
            </div>
              <div className="truncate text-[11px] text-muted-foreground">Route files into Course shared, Lecture, or task outputs for indexing</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="Close upload"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1.05fr_0.95fr] uclaw-scrollbar">
          <section className="rounded-lg border border-dashed bg-background/70 p-4">
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md bg-card px-5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground text-background">
                {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
              </div>
              <div className="mt-4 text-sm font-semibold">Choose files from this Mac</div>
              <div className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Files stay local. The main process places them into the selected folder and queues an embedding indexing job.
              </div>
              <button
                type="button"
                className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={importing || !canImport}
                onClick={handleImport}
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "Importing..." : "Import files"}
              </button>
              {lastResult?.indexingJob && (
                <div className="mt-4 rounded-md bg-muted/55 px-3 py-2 text-[11px] text-muted-foreground">
                  Queued {lastResult.indexingJob.totalFiles ?? lastResult.indexingJob.indexedFiles} files with {lastResult.indexingJob.embeddingModel}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-3">
            <section className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs font-semibold">Target Course</div>
              <select
                className="mt-2 h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none"
                value={selectedCourseId}
                onChange={(event) => {
                  setSelectedCourseId(event.target.value);
                  setTaskId("");
                  const next = courses.find((item) => item.id === event.target.value);
                  if (next?.workspaceKind === "semester_home") setTargetSection("course_shared");
                }}
              >
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 rounded-md bg-muted/55 px-3 py-2">
                <div className="truncate text-sm font-medium">{selectedCourse?.name || "No course selected"}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {selectedCourse?.code || "UCLAW"} · {selectedCourse?.term || "local"}
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs font-semibold">Target Workspace</div>
              <div className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground">
                <TargetButton active={normalizedTargetSection === "course_shared"} icon={<FolderOpen className="h-3 w-3" />} label={isSemesterTarget ? "Semester shared" : "Course shared"} onClick={() => setTargetSection("course_shared")} />
                {!isSemesterTarget && <TargetButton active={targetSection === "lecture"} icon={<CalendarDays className="h-3 w-3" />} label="Lecture" onClick={() => setTargetSection("lecture")} />}
                {!isSemesterTarget && <TargetButton active={targetSection === "task"} icon={<FileText className="h-3 w-3" />} label="Task workspace" onClick={() => setTargetSection("task")} />}
              </div>

              {!isSemesterTarget && targetSection === "task" && (
                <div className="mt-3 space-y-3">
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>Task</span>
                    <select className="h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground outline-none" value={selectedTaskId || ""} onChange={(event) => setTaskId(event.target.value)}>
                      {courseTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.taskType} / {task.title}
                        </option>
                      ))}
                    </select>
                    {courseTasks.length === 0 && <span className="block rounded-md bg-muted/55 px-2 py-2">Create a task first, then import into the task workspace.</span>}
                  </label>

                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Destination</div>
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
              <div className="text-xs font-semibold">Supported Types</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <TypeChip icon={<FileText className="h-3 w-3" />} label="PDF / DOCX" />
                <TypeChip icon={<Library className="h-3 w-3" />} label="PPT / PPTX" />
                <TypeChip icon={<FileImage className="h-3 w-3" />} label="PNG / JPG" />
                <TypeChip icon={<FileCode className="h-3 w-3" />} label="Code" />
                <TypeChip icon={<FileArchive className="h-3 w-3" />} label="ZIP later" />
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
