import {
  AlertCircle,
  BookOpen,
  Check,
  CircleStop,
  Database,
  FileText,
  FolderOpen,
  GraduationCap,
  Image,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Course, CourseFileSection, IndexingJob, RagSearchResult, TaskType, UclawTask } from "@/types/domain";
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
  const [indexingJobs, setIndexingJobs] = useState<IndexingJob[]>([]);
  const [loadingIndexingJobs, setLoadingIndexingJobs] = useState(false);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<RagSearchResult[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [ragError, setRagError] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("assignment");

  useEffect(() => {
    if (!activeCourse?.id) return;
    setRagResults([]);
    setRagError("");
    void loadCourseView(activeCourse.id);
  }, [activeCourse?.id]);

  useEffect(() => {
    if (!activeCourse?.id) return;
    const hasActiveJob = indexingJobs.some((job) => job.status === "queued" || job.status === "indexing");
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => {
      void loadCourseView(activeCourse.id);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [activeCourse?.id, indexingJobs]);

  async function loadCourseView(courseId: string) {
    await Promise.all([loadSections(courseId), loadIndexingJobs(courseId)]);
  }

  async function loadSections(courseId: string) {
    setSections(await window.uclaw.files.sections(courseId));
  }

  async function loadIndexingJobs(courseId: string) {
    setLoadingIndexingJobs(true);
    try {
      setIndexingJobs(await window.uclaw.files.indexingJobs(courseId));
    } finally {
      setLoadingIndexingJobs(false);
    }
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
    try {
      await window.uclaw.files.index(activeCourse.id, sectionId);
      await loadCourseView(activeCourse.id);
    } finally {
      setIndexingSectionId("");
    }
  }

  async function cancelIndexing(jobId: string) {
    if (!activeCourse?.id) return;
    await window.uclaw.files.cancelIndexing(jobId);
    await loadCourseView(activeCourse.id);
  }

  async function searchRag() {
    if (!activeCourse?.id) return;
    const query = ragQuery.trim();
    if (!query) return;
    setRagSearching(true);
    setRagError("");
    try {
      setRagResults(await window.uclaw.rag.search(query, activeCourse.id));
    } catch (error) {
      setRagError(error instanceof Error ? error.message : "RAG search failed.");
      setRagResults([]);
    } finally {
      setRagSearching(false);
    }
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

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_340px]">
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

                <IndexingProgressPanel
                  jobs={indexingJobs}
                  loading={loadingIndexingJobs}
                  sections={sections}
                  onRefresh={() => activeCourse?.id && void loadCourseView(activeCourse.id)}
                  onCancel={(jobId) => void cancelIndexing(jobId)}
                />

                <RagDebugPanel
                  query={ragQuery}
                  results={ragResults}
                  searching={ragSearching}
                  error={ragError}
                  onQueryChange={setRagQuery}
                  onSearch={() => void searchRag()}
                />

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
              </aside>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function IndexingProgressPanel({
  jobs,
  loading,
  sections,
  onRefresh,
  onCancel,
}: {
  jobs: IndexingJob[];
  loading: boolean;
  sections: CourseFileSection[];
  onRefresh: () => void;
  onCancel: (jobId: string) => void;
}) {
  const sectionTitles = new Map(sections.map((section) => [section.id, section.title]));
  const activeCount = jobs.filter((job) => job.status === "queued" || job.status === "indexing").length;

  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
          <Database className="h-3.5 w-3.5" />
          <span className="truncate">Indexing</span>
          {activeCount > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{activeCount} active</span>}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onRefresh}
          title="Refresh indexing jobs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-md border border-dashed bg-background/60 px-3 py-4 text-center text-[11px] text-muted-foreground">No indexing jobs</div>
      ) : (
        <div className="space-y-2">
          {jobs.slice(0, 5).map((job) => {
            const progress = Math.max(0, Math.min(100, job.progress || 0));
            const cancellable = job.status === "queued" || job.status === "indexing";
            return (
              <div key={job.id} className="rounded-md border bg-background/70 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-foreground">{job.sectionId ? sectionTitles.get(job.sectionId) || "Section" : "All sections"}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {job.indexedFiles}/{job.totalFiles ?? 0} files · {job.stage || job.status} · {formatJobTime(job.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={cx("rounded px-1.5 py-0.5 text-[10px]", statusTone(job.status))}>{job.status}</span>
                    {cancellable && (
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        onClick={() => onCancel(job.id)}
                        title="Cancel indexing"
                      >
                        <CircleStop className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cx("h-full rounded-full transition-all duration-300", job.status === "failed" ? "bg-red-500" : "bg-foreground")} style={{ width: `${progress}%` }} />
                </div>
                {job.error && (
                  <div className="mt-2 flex gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[10px] leading-4 text-red-700">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="min-w-0 break-words">{job.error}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RagDebugPanel({
  query,
  results,
  searching,
  error,
  onQueryChange,
  onSearch,
}: {
  query: string;
  results: RagSearchResult[];
  searching: boolean;
  error: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <Search className="h-3.5 w-3.5" />
        RAG Debug
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <input
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search indexed chunks"
        />
        <button
          type="submit"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={searching || !query.trim()}
          title="Run RAG search"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </button>
      </form>

      {error && (
        <div className="mt-2 flex gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[10px] leading-4 text-red-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <div className="mt-2 space-y-2">
        {results.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
            {query.trim() ? "No chunks returned" : "No query"}
          </div>
        ) : (
          results.map((result) => (
            <div key={result.id} className="rounded-md border bg-background/70 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 truncate text-[11px] font-semibold">{result.title}</div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{Math.round(result.score * 100)}%</span>
              </div>
              <div className="mt-1 line-clamp-3 break-words text-[11px] leading-5 text-muted-foreground">{result.excerpt}</div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground/80">{result.citation || result.source}</div>
            </div>
          ))
        )}
      </div>
    </section>
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

function statusTone(status: IndexingJob["status"]): string {
  if (status === "indexed") return "bg-emerald-50 text-emerald-800";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "cancelled") return "bg-muted text-muted-foreground";
  if (status === "queued") return "bg-amber-50 text-amber-700";
  if (status === "indexing") return "bg-blue-50 text-blue-700";
  return "bg-muted text-muted-foreground";
}

function formatJobTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
