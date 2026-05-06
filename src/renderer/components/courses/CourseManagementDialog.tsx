import { BookOpen, Check, FileText, FolderOpen, GraduationCap, Image, Layers3, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Course, CourseFileSection, IndexingJob, TaskType, UclawTask } from "@/types/domain";
import { cx } from "@/lib/cn";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  assignment: "Assignment",
  project: "Project",
  exam: "Exam",
  lecture: "Lecture",
};

export function CourseManagementDialog({
  courses,
  activeCourseId,
  onSelectCourse,
  onCourseCreated,
  onTaskCreated,
  onClose,
}: {
  courses: Course[];
  activeCourseId: string;
  onSelectCourse: (courseId: string) => void;
  onCourseCreated: (course: Course) => void;
  onTaskCreated: (task: UclawTask) => void;
  onClose: () => void;
}) {
  const activeCourse = courses.find((course) => course.id === activeCourseId) || courses[0];
  const [sections, setSections] = useState<CourseFileSection[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [indexingSectionId, setIndexingSectionId] = useState("");
  const [lastJob, setLastJob] = useState<IndexingJob | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("assignment");

  useEffect(() => {
    if (!activeCourse?.id) return;
    void loadSections(activeCourse.id);
  }, [activeCourse?.id]);

  async function loadSections(courseId: string) {
    setSections(await window.uclaw.files.sections(courseId));
  }

  async function recognizeCourse() {
    setRecognizing(true);
    try {
      const result = await window.uclaw.courses.analyzeImage({
        instruction: "Recognize course name, course code, term, meeting time, instructor, and school metadata from uploaded course images.",
      });
      onCourseCreated(result.course);
      onSelectCourse(result.course.id);
      await loadSections(result.course.id);
    } finally {
      setRecognizing(false);
    }
  }

  async function createTask() {
    if (!activeCourse?.id || !taskName.trim()) return;
    const task = await window.uclaw.tasks.create({
      courseId: activeCourse.id,
      title: taskName.trim(),
      taskType,
    });
    onTaskCreated(task);
    setTaskName("");
    await loadSections(activeCourse.id);
  }

  async function indexSection(sectionId?: string) {
    if (!activeCourse?.id) return;
    setIndexingSectionId(sectionId || "all");
    const job = await window.uclaw.files.index(activeCourse.id, sectionId);
    setLastJob(job);
    await loadSections(activeCourse.id);
    setIndexingSectionId("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4" />
              Courses
            </div>
            <div className="truncate text-[11px] text-muted-foreground">Course recognition, file organization, task sections, and embedding indexing</div>
          </div>
          <button
            type="button"
            className="no-drag flex h-8 w-8 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title="Close courses"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[360px_1fr] uclaw-scrollbar">
          <aside className="min-h-0 space-y-3">
            <section className="space-y-2">
              {courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  className={cx(
                    "flex w-full min-w-0 items-center gap-3 rounded-lg border bg-background/70 px-3 py-3 text-left transition",
                    course.id === activeCourseId ? "border-border shadow-sm ring-1 ring-border/60" : "border-border/60 hover:bg-accent/55",
                  )}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ color: course.color, backgroundColor: `${course.color}1f` }}>
                    <GraduationCap className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{course.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {course.code} · {course.term}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground/80">{course.meetingTime || course.instructor}</span>
                  </span>
                  {course.id === activeCourseId && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              ))}
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                New Course
              </div>
              <div className="rounded-md border border-dashed bg-card px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
                Upload a syllabus or course handout after semester recognition. Multimodal AI creates the course folder; tasks stay manual.
              </div>
              <button
                type="button"
                className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                onClick={recognizeCourse}
                disabled={recognizing}
              >
                {recognizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
                {recognizing ? "Recognizing..." : "Recognize from image"}
              </button>
            </section>
          </aside>

          <section className="min-h-0 rounded-lg border bg-background/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{activeCourse?.name || "No course selected"}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {activeCourse?.code || "UCLAW"} · {activeCourse?.term || "local"} · {activeCourse?.instructor || "Instructor TBD"}
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground/80">
                {activeCourse?.meetingTime || "Time TBD"} · {activeCourse?.location || "Location TBD"}
              </div>
              </div>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={() => indexSection()}
              >
                {indexingSectionId === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />}
                Index all
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
              <div className="space-y-2">
                {sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    indexing={indexingSectionId === section.id}
                    onIndex={() => indexSection(section.id)}
                  />
                ))}
              </div>

              <aside className="space-y-3">
                <section className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <Plus className="h-3.5 w-3.5" />
                    New Task Section
                  </div>
                  <label className="mb-2 block space-y-1 text-[11px] text-muted-foreground">
                    <span>Task type</span>
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                      value={taskType}
                      onChange={(event) => setTaskType(event.target.value as TaskType)}
                    >
                      {(["assignment", "exam", "project", "lecture"] as TaskType[]).map((item) => (
                        <option key={item} value={item}>
                          {TASK_TYPE_LABELS[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                    value={taskName}
                    onChange={(event) => setTaskName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void createTask();
                    }}
                    placeholder="Custom task name"
                  />
                  <button
                    type="button"
                    className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={createTask}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create task
                  </button>
                </section>

                <section className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <Upload className="h-3.5 w-3.5" />
                    Upload Behavior
                  </div>
                  <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
                    <div className="rounded-md bg-muted/55 px-2 py-2">Semester recognition creates the semester folder first.</div>
                    <div className="rounded-md bg-muted/55 px-2 py-2">Course recognition creates each course folder inside the semester workspace.</div>
                    <div className="rounded-md bg-muted/55 px-2 py-2">Course files use Course shared, Week / Week N, and Task / Assignment or Exam / Drafts / Submitted.</div>
                  </div>
                </section>

                {lastJob && (
                  <section className="rounded-lg border bg-card p-3 text-[11px] text-muted-foreground">
                    <div className="font-semibold text-foreground">Last indexing job</div>
                    <div className="mt-1">{lastJob.embeddingModel}</div>
                    <div className="mt-1">{lastJob.indexedFiles} files · {lastJob.status}</div>
                  </section>
                )}
              </aside>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  indexing,
  onIndex,
}: {
  section: CourseFileSection;
  indexing: boolean;
  onIndex: () => void;
}) {
  const Icon = section.kind === "course_shared" ? FolderOpen : section.kind === "week" ? BookOpen : FileText;
  return (
    <div className="rounded-lg border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{section.title}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {section.files.length} files · {section.embeddingModel || "embedding model not set"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cx("rounded px-1.5 py-0.5 text-[10px]", section.indexingStatus === "indexed" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground")}>
            {section.indexingStatus}
          </span>
          <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onIndex}>
            {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {section.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {section.files.slice(0, 5).map((file) => (
            <span key={file.id} className="max-w-[180px] truncate rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
              {file.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
