import {
  AlertCircle,
  Archive,
  BookOpen,
  Check,
  ChevronRight,
  CircleStop,
  Database,
  FileText,
  FolderOpen,
  GraduationCap,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Course, CourseFileSection, IndexingJob, RagSearchResult, TaskType, UclawTask } from "@/types/domain";
import { cx } from "@/lib/cn";

const DEFAULT_TASK_TYPE = "Assignment";

export function CourseManagementDialog({
  courses,
  activeCourseId,
  onSelectCourse,
  onCourseCreated,
  onTaskCreated,
  onWorkspaceChanged,
  onClose,
}: {
  courses: Course[];
  activeCourseId: string;
  onSelectCourse: (courseId: string) => void;
  onCourseCreated: (course: Course) => void;
  onTaskCreated: (task: UclawTask) => void;
  onWorkspaceChanged?: () => void;
  onClose: () => void;
}) {
  const [archivedCourses, setArchivedCourses] = useState<Course[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [courseBusyId, setCourseBusyId] = useState("");
  const [courseActionError, setCourseActionError] = useState("");
  const archivedCourseIds = useMemo(() => new Set(archivedCourses.map((course) => course.id)), [archivedCourses]);
  const activeCourses = useMemo(() => courses.filter((course) => !course.archivedAt && !archivedCourseIds.has(course.id)), [archivedCourseIds, courses]);
  const displayedCourses = showArchived ? [...activeCourses, ...archivedCourses] : activeCourses;
  const activeCourse = displayedCourses.find((course) => course.id === activeCourseId) || displayedCourses[0];
  const activeCourseArchived = Boolean(activeCourse?.archivedAt);
  const courseReadOnlyReason = activeCourseArchived ? "Restore this course before changing files, tasks, indexing, or RAG search." : "";
  const [sections, setSections] = useState<CourseFileSection[]>([]);
  const [indexingSectionId, setIndexingSectionId] = useState("");
  const [indexingJobs, setIndexingJobs] = useState<IndexingJob[]>([]);
  const [loadingIndexingJobs, setLoadingIndexingJobs] = useState(false);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<RagSearchResult[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [ragError, setRagError] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>(DEFAULT_TASK_TYPE);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseInstructor, setNewCourseInstructor] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newCourseError, setNewCourseError] = useState("");
  const [uploadingSectionId, setUploadingSectionId] = useState("");

  const existingTaskTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const section of sections) {
      if (section.kind !== "task" || !section.taskType) continue;
      seen.add(section.taskType);
    }
    return Array.from(seen);
  }, [sections]);

  useEffect(() => {
    void loadArchivedCourses();
  }, []);

  useEffect(() => {
    if (!activeCourse?.id) return;
    setRagResults([]);
    setRagError("");
    setTaskError("");
    setCourseActionError("");
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

  async function loadArchivedCourses() {
    try {
      setArchivedCourses(await window.uclaw.courses.listArchived());
    } catch (error) {
      setArchivedCourses([]);
      setCourseActionError(errorMessage(error, "Failed to load archived courses."));
    }
  }

  async function loadSections(courseId: string) {
    try {
      setSections(await window.uclaw.files.sections(courseId));
    } catch (error) {
      setSections([]);
      setCourseActionError(errorMessage(error, "Failed to load course sections."));
    }
  }

  async function loadIndexingJobs(courseId: string) {
    setLoadingIndexingJobs(true);
    try {
      setIndexingJobs(await window.uclaw.files.indexingJobs(courseId));
    } catch (error) {
      setIndexingJobs([]);
      setCourseActionError(errorMessage(error, "Failed to load indexing jobs."));
    } finally {
      setLoadingIndexingJobs(false);
    }
  }

  async function createCourse() {
    const name = newCourseName.trim();
    const code = newCourseCode.trim();
    if (!name || !code) {
      setNewCourseError("Course name and code are required.");
      return;
    }
    setNewCourseError("");
    setCreatingCourse(true);
    try {
      const created = await window.uclaw.courses.create({
        name,
        code,
        instructor: newCourseInstructor.trim() || undefined,
      });
      onCourseCreated(created);
      onSelectCourse(created.id);
      await loadArchivedCourses();
      setNewCourseName("");
      setNewCourseCode("");
      setNewCourseInstructor("");
      await loadSections(created.id);
    } catch (error) {
      setNewCourseError(error instanceof Error ? error.message : "Failed to create course.");
    } finally {
      setCreatingCourse(false);
    }
  }

  async function createTask() {
    if (!activeCourse?.id || creatingTask) return;
    if (activeCourseArchived) {
      setTaskError(courseReadOnlyReason);
      return;
    }
    const title = taskName.trim();
    if (!title) {
      setTaskError("Task name is required.");
      return;
    }
    setCreatingTask(true);
    setTaskError("");
    try {
      const task = await window.uclaw.tasks.create({
        courseId: activeCourse.id,
        title,
        taskType,
      });
      onTaskCreated(task);
      setTaskName("");
      await loadSections(activeCourse.id);
    } catch (error) {
      setTaskError(errorMessage(error, "Failed to create task."));
    } finally {
      setCreatingTask(false);
    }
  }

  async function indexAllSections() {
    await runIndexing("all");
  }

  async function indexSection(sectionId: string) {
    await runIndexing(sectionId, sectionId);
  }

  async function runIndexing(indicatorId: string, sectionId?: string) {
    if (!activeCourse?.id || activeCourseArchived) return;
    setIndexingSectionId(indicatorId);
    setCourseActionError("");
    try {
      await window.uclaw.files.index(activeCourse.id, sectionId);
      setRagError("");
      await loadCourseView(activeCourse.id);
    } catch (error) {
      setCourseActionError(errorMessage(error, "Failed to start indexing."));
    } finally {
      setIndexingSectionId("");
    }
  }

  async function uploadToSection(section: CourseFileSection) {
    if (!activeCourse?.id || activeCourseArchived) return;
    setUploadingSectionId(section.id);
    setCourseActionError("");
    try {
      const result = await window.uclaw.files.import({
        courseId: activeCourse.id,
        targetSection: section.kind,
        taskId: section.taskId,
        taskFileBucket: section.kind === "task" ? "materials" : undefined,
      });
      await loadCourseView(activeCourse.id);
      if (result.indexingError) {
        setCourseActionError(`Imported ${result.files.length} file${result.files.length === 1 ? "" : "s"}, but indexing did not queue: ${result.indexingError}`);
      }
    } catch (error) {
      setCourseActionError(errorMessage(error, "Failed to import files."));
    } finally {
      setUploadingSectionId("");
    }
  }

  async function cancelIndexing(jobId: string) {
    if (!activeCourse?.id) return;
    setCourseActionError("");
    try {
      await window.uclaw.files.cancelIndexing(jobId);
      await loadCourseView(activeCourse.id);
    } catch (error) {
      setCourseActionError(errorMessage(error, "Failed to cancel indexing."));
    }
  }

  async function searchRag() {
    if (!activeCourse?.id) return;
    if (activeCourseArchived) {
      setRagError(courseReadOnlyReason);
      setRagResults([]);
      return;
    }
    const query = ragQuery.trim();
    if (!query) return;
    setRagSearching(true);
    setRagError("");
    try {
      setRagResults(await window.uclaw.rag.search(query, activeCourse.id));
    } catch (error) {
      setRagError(errorMessage(error, "RAG search failed."));
      setRagResults([]);
    } finally {
      setRagSearching(false);
    }
  }

  async function archiveCourse(course: Course) {
    if (!window.confirm(`Archive "${course.name}"? It will disappear from the main workspace until restored.`)) return;
    setCourseBusyId(course.id);
    setCourseActionError("");
    try {
      await window.uclaw.courses.archive(course.id);
      await loadArchivedCourses();
      onWorkspaceChanged?.();
    } catch (reason) {
      setCourseActionError(errorMessage(reason, "Failed to archive course."));
    } finally {
      setCourseBusyId("");
    }
  }

  async function restoreCourse(course: Course) {
    setCourseBusyId(course.id);
    setCourseActionError("");
    try {
      const restored = await window.uclaw.courses.restore(course.id);
      await loadArchivedCourses();
      onCourseCreated(restored);
      onSelectCourse(restored.id);
      onWorkspaceChanged?.();
    } catch (reason) {
      setCourseActionError(errorMessage(reason, "Failed to restore course."));
    } finally {
      setCourseBusyId("");
    }
  }

  async function deleteCourse(course: Course) {
    if (!course.archivedAt) {
      window.alert("Archive this course before deleting it permanently.");
      return;
    }
    const typed = window.prompt(`This permanently deletes "${course.name}", all files, and indexed data.\n\nType the course name to confirm:`);
    if (typed !== course.name) return;
    setCourseBusyId(course.id);
    setCourseActionError("");
    try {
      await window.uclaw.courses.delete(course.id);
      await loadArchivedCourses();
      onWorkspaceChanged?.();
    } catch (reason) {
      setCourseActionError(errorMessage(reason, "Failed to delete course."));
    } finally {
      setCourseBusyId("");
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
            <section className="rounded-lg border bg-background/70 p-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={() => setShowArchived((value) => !value)}
              >
                <span>{showArchived ? "Showing archived courses" : "Active courses only"}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{archivedCourses.length} archived</span>
              </button>
            </section>
            {courseActionError && (
              <div className="flex gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="min-w-0 break-words">{courseActionError}</span>
              </div>
            )}
            <section className="space-y-2">
              {displayedCourses.map((course) => (
                <div
                  key={course.id}
                  className={cx(
                    "flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-3 text-left transition",
                    course.archivedAt ? "bg-muted/45 text-muted-foreground" : "bg-background/70",
                    course.id === activeCourseId ? "border-border shadow-sm ring-1 ring-border/60" : "border-border/60 hover:bg-accent/55",
                  )}
                >
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => !course.archivedAt && onSelectCourse(course.id)}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ color: course.color, backgroundColor: `${course.color}1f` }}>
                      <GraduationCap className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="block truncate text-sm font-semibold">{course.name}</span>
                        {course.archivedAt && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase">Archived</span>}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {course.code} · {course.term}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground/80">{course.meetingTime || course.instructor}</span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {course.archivedAt ? (
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground" title="Restore course" disabled={courseBusyId === course.id} onClick={() => void restoreCourse(course)}>
                        {courseBusyId === course.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    ) : (
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground" title="Archive course" disabled={courseBusyId === course.id} onClick={() => void archiveCourse(course)}>
                        {courseBusyId === course.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-red-50 hover:text-red-700" title={course.archivedAt ? "Delete permanently" : "Archive before deleting"} disabled={courseBusyId === course.id} onClick={() => void deleteCourse(course)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {course.id === activeCourseId && !course.archivedAt && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-lg border bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                New Course
              </div>
              <label className="mb-2 block space-y-1 text-[11px] text-muted-foreground">
                <span>Course name</span>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                  value={newCourseName}
                  onChange={(event) => setNewCourseName(event.target.value)}
                  placeholder="e.g. Constitutional Law"
                />
              </label>
              <label className="mb-2 block space-y-1 text-[11px] text-muted-foreground">
                <span>Course code</span>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                  value={newCourseCode}
                  onChange={(event) => setNewCourseCode(event.target.value)}
                  placeholder="e.g. LAW 200"
                />
              </label>
              <label className="mb-2 block space-y-1 text-[11px] text-muted-foreground">
                <span>Instructor (optional)</span>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                  value={newCourseInstructor}
                  onChange={(event) => setNewCourseInstructor(event.target.value)}
                  placeholder="e.g. Prof. Lee"
                />
              </label>
              {newCourseError && <div className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{newCourseError}</div>}
              <button
                type="button"
                className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                onClick={createCourse}
                disabled={creatingCourse}
              >
                {creatingCourse ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {creatingCourse ? "Creating..." : "Create course"}
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
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void indexAllSections()}
                disabled={!activeCourse?.id || activeCourseArchived || Boolean(indexingSectionId)}
              >
                {indexingSectionId === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />}
                Index all
              </button>
            </div>
            {courseReadOnlyReason && (
              <div className="mt-3 flex gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{courseReadOnlyReason}</span>
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-2">
                {sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    indexing={indexingSectionId === section.id}
                    disabled={activeCourseArchived || Boolean(indexingSectionId)}
                    onIndex={() => void indexSection(section.id)}
                    onUpload={() => uploadToSection(section)}
                    uploading={uploadingSectionId === section.id}
                    onFileDeleted={() => activeCourse?.id && void loadCourseView(activeCourse.id)}
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
                    <input
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                      value={taskType}
                      onChange={(event) => setTaskType(event.target.value)}
                      placeholder="e.g. Assignment, Exam, Reading Report"
                      list="task-type-suggestions"
                      disabled={activeCourseArchived || creatingTask}
                    />
                    <datalist id="task-type-suggestions">
                      {existingTaskTypes.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </label>
                  <input
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                    value={taskName}
                    onChange={(event) => setTaskName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !creatingTask) void createTask();
                    }}
                    placeholder="Custom task name"
                    disabled={activeCourseArchived || creatingTask}
                  />
                  {taskError && <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">{taskError}</div>}
                  <button
                    type="button"
                    className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={createTask}
                    disabled={activeCourseArchived || creatingTask || !taskName.trim()}
                  >
                    {creatingTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {creatingTask ? "Creating..." : "Create task"}
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
                  disabled={activeCourseArchived}
                />

                <section className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <Upload className="h-3.5 w-3.5" />
                    Upload Behavior
                  </div>
                  <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
                    <div className="rounded-md bg-muted/55 px-2 py-2">Semester recognition creates the semester folder first.</div>
                    <div className="rounded-md bg-muted/55 px-2 py-2">Course recognition creates each course folder inside the semester workspace.</div>
                    <div className="rounded-md bg-muted/55 px-2 py-2">Course files use Course shared, Lecture, and Task / task-id__Task title / Materials, Drafts, or Submitted.</div>
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
  disabled,
}: {
  query: string;
  results: RagSearchResult[];
  searching: boolean;
  error: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  disabled?: boolean;
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
          disabled={disabled}
        />
        <button
          type="submit"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || searching || !query.trim()}
          title="Run RAG search"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </button>
      </form>

      {error && (
        <div className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] leading-4 text-red-700">
          <div className="flex gap-1.5">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
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
  disabled,
  onIndex,
  onUpload,
  uploading,
  onFileDeleted,
}: {
  section: CourseFileSection;
  indexing: boolean;
  disabled?: boolean;
  onIndex: () => void;
  onUpload: () => void;
  uploading: boolean;
  onFileDeleted: () => void;
}) {
  const Icon = section.kind === "course_shared" ? FolderOpen : section.kind === "lecture" ? BookOpen : FileText;
  const [open, setOpen] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState("");

  async function deleteFile(fileId: string, fileName: string) {
    if (!window.confirm(`Delete "${fileName}"? The local copy will be removed.`)) return;
    setDeletingFileId(fileId);
    try {
      await window.uclaw.files.delete(fileId);
      onFileDeleted();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingFileId("");
    }
  }

  async function revealFile(fileId: string) {
    try {
      await window.uclaw.files.reveal(fileId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Reveal failed");
    }
  }

  return (
    <div className="rounded-lg border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight className={cx("mt-1 h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground", open && "rotate-90")} />
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{section.title}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {section.files.length} files · {section.embeddingModel || "no embedding provider"}
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cx("rounded px-1.5 py-0.5 text-[10px]", statusTone(section.indexingStatus))}>
            {section.indexingStatus}
          </span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            onClick={onUpload}
            disabled={disabled || uploading}
            title="Upload files into this section"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            onClick={onIndex}
            disabled={disabled}
            title="Re-index this section"
          >
            {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {open && section.files.length === 0 && (
        <div className="mt-3 rounded-md border border-dashed bg-background px-3 py-3 text-center text-[11px] text-muted-foreground">
          No files yet. Click the upload button to add some.
        </div>
      )}
      {open && section.files.length > 0 && (
        <div className="mt-3 space-y-1">
          {section.files.map((file) => (
            <div key={file.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[12px]">{file.name}</span>
              {file.sizeLabel && <span className="shrink-0 text-[10px] text-muted-foreground">{file.sizeLabel}</span>}
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => void revealFile(file.id)}
                title="Show in Finder"
              >
                <FolderOpen className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                onClick={() => void deleteFile(file.id, file.name)}
                disabled={deletingFileId === file.id}
                title="Delete file"
              >
                {deletingFileId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </div>
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

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "").trim();
  return message || fallback;
}
