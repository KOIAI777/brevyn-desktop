import {
  AlertCircle,
  Archive,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Database,
  FileText,
  FolderOpen,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Course, CourseFileSection, IndexingJob, RagSearchResult, SemesterWorkspace, TaskType, BrevynTask } from "@/types/domain";
import { cx } from "@/lib/cn";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CourseIcon, COURSE_ICON_OPTIONS } from "@/components/courses/CourseIcon";
import { FileIndexingBadge } from "@/components/files/FileIndexingBadge";
import { VisionRecognitionImportButton } from "@/components/vision/VisionRecognitionImportDialog";

const DEFAULT_TASK_TYPE = "Assignment";
const RAG_RESULTS_PAGE_SIZE = 5;
const COURSE_COLORS = ["#111827", "#2563eb", "#059669", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#be123c"];
type CoursePanel = "files" | "tasks" | "indexing" | "search";

export function CourseManagementDialog({
  semester,
  courses,
  activeCourseId,
  onCourseCreated,
  onCourseUpdated,
  onTaskCreated,
  onWorkspaceChanged,
  onClose,
}: {
  semester?: SemesterWorkspace | null;
  courses: Course[];
  activeCourseId: string;
  onCourseCreated: (course: Course) => void;
  onCourseUpdated: (course: Course) => void;
  onTaskCreated: (task: BrevynTask) => void;
  onWorkspaceChanged?: () => void;
  onClose: () => void;
}) {
  const [archivedCourses, setArchivedCourses] = useState<Course[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [viewingCourseId, setViewingCourseId] = useState(activeCourseId);
  const [courseBusyId, setCourseBusyId] = useState("");
  const [courseActionError, setCourseActionError] = useState("");
  const [editingCourseDetails, setEditingCourseDetails] = useState(false);
  const [savingCourseDetails, setSavingCourseDetails] = useState(false);
  const [courseDetailsDraft, setCourseDetailsDraft] = useState({
    code: "",
    instructor: "",
    meetingTime: "",
    location: "",
    color: "#111827",
    icon: "graduation-cap" as Course["icon"],
  });
  const [coursePanel, setCoursePanel] = useState<CoursePanel>("files");

  useEffect(() => {
    setViewingCourseId(activeCourseId);
  }, [activeCourseId]);

  const archivedCourseIds = useMemo(() => new Set(archivedCourses.map((course) => course.id)), [archivedCourses]);
  const activeCourses = useMemo(() => courses.filter((course) => !course.archivedAt && !archivedCourseIds.has(course.id)), [archivedCourseIds, courses]);
  const displayedCourses = showArchived ? [...activeCourses, ...archivedCourses] : activeCourses;
  const activeCourse = displayedCourses.find((course) => course.id === viewingCourseId);
  const activeCourseArchived = Boolean(activeCourse?.archivedAt);
  const courseReadOnlyReason = !activeCourse ? "Select a course before changing files, tasks, indexing, or RAG search." : activeCourseArchived ? "Restore this course before changing files, tasks, indexing, or RAG search." : "";
  const [sections, setSections] = useState<CourseFileSection[]>([]);
  const [indexingSectionId, setIndexingSectionId] = useState("");
  const [indexingJobs, setIndexingJobs] = useState<IndexingJob[]>([]);
  const [loadingIndexingJobs, setLoadingIndexingJobs] = useState(false);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<RagSearchResult[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [ragError, setRagError] = useState("");
  const [indexingNotice, setIndexingNotice] = useState<{ jobId: string; message: string } | null>(null);
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
  const courseViewRequestRef = useRef(0);
  const ragSearchRequestRef = useRef(0);
  const seenIndexingFailuresRef = useRef(new Set<string>());
  const indexingFailureBaselineCourseRef = useRef("");
  const { confirm, confirmDialog } = useConfirmDialog();
  const canCreateCourse = Boolean(semester?.id);

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
    setRagResults([]);
    setRagError("");
    setIndexingNotice(null);
    seenIndexingFailuresRef.current.clear();
    indexingFailureBaselineCourseRef.current = "";
    ragSearchRequestRef.current += 1;
    setTaskError("");
    setCourseActionError("");
    setEditingCourseDetails(false);
    resetCourseDetailsDraft(activeCourse);
    if (!activeCourse?.id) {
      courseViewRequestRef.current += 1;
      setSections([]);
      setIndexingJobs([]);
      setLoadingIndexingJobs(false);
      return;
    }
    void loadCourseView(activeCourse.id);
  }, [activeCourse?.id]);

  useEffect(() => {
    if (!activeCourse?.id) return;
    const hasActiveJob = indexingJobs.some((job) => job.status === "queued" || job.status === "indexing");
    const timer = window.setInterval(() => {
      void loadCourseView(activeCourse.id);
    }, hasActiveJob ? 1600 : 5000);
    return () => window.clearInterval(timer);
  }, [activeCourse?.id, indexingJobs]);

  useEffect(() => {
    const courseId = activeCourse?.id || "";
    if (!courseId) return;
    if (indexingFailureBaselineCourseRef.current !== courseId) {
      seenIndexingFailuresRef.current = new Set(indexingJobs.filter((job) => job.status === "failed").map((job) => job.id));
      indexingFailureBaselineCourseRef.current = courseId;
      return;
    }
    const failedJob = indexingJobs.find((job) => job.status === "failed" && job.error && !seenIndexingFailuresRef.current.has(job.id));
    if (!failedJob?.error) return;
    seenIndexingFailuresRef.current.add(failedJob.id);
    setIndexingNotice({ jobId: failedJob.id, message: failedJob.error });
  }, [activeCourse?.id, indexingJobs]);

  useEffect(() => {
    if (!indexingNotice) return;
    const timer = window.setTimeout(() => setIndexingNotice(null), 9000);
    return () => window.clearTimeout(timer);
  }, [indexingNotice]);

  async function loadArchivedCourses() {
    try {
      setArchivedCourses(await window.brevyn.courses.listArchived());
    } catch (error) {
      setArchivedCourses([]);
      setCourseActionError(errorMessage(error, "Failed to load archived courses."));
    }
  }

  async function loadCourseView(courseId: string): Promise<boolean> {
    const requestId = courseViewRequestRef.current + 1;
    courseViewRequestRef.current = requestId;
    setLoadingIndexingJobs(true);
    try {
      const [nextSections, nextIndexingJobs] = await Promise.all([
        window.brevyn.files.sections(courseId),
        window.brevyn.files.indexingJobs(courseId),
      ]);
      if (courseViewRequestRef.current !== requestId) return false;
      setSections(nextSections);
      setIndexingJobs(nextIndexingJobs);
      return true;
    } catch (error) {
      if (courseViewRequestRef.current === requestId) {
        setSections([]);
        setIndexingJobs([]);
        setCourseActionError(errorMessage(error, "Failed to load course view."));
      }
      return false;
    } finally {
      if (courseViewRequestRef.current === requestId) setLoadingIndexingJobs(false);
    }
  }

  async function createCourse() {
    if (!canCreateCourse) {
      setNewCourseError("Select or create a semester before creating courses.");
      return;
    }
    const name = newCourseName.trim();
    const code = newCourseCode.trim();
    if (!name || !code) {
      setNewCourseError("Course name and code are required.");
      return;
    }
    setNewCourseError("");
    setCreatingCourse(true);
    try {
      const created = await window.brevyn.courses.create({
        name,
        code,
        instructor: newCourseInstructor.trim() || undefined,
      });
      onCourseCreated(created);
      setViewingCourseId(created.id);
      await loadArchivedCourses();
      setNewCourseName("");
      setNewCourseCode("");
      setNewCourseInstructor("");
      await loadCourseView(created.id);
    } catch (error) {
      setNewCourseError(error instanceof Error ? error.message : "Failed to create course.");
    } finally {
      setCreatingCourse(false);
    }
  }

  function resetCourseDetailsDraft(course?: Course) {
    setCourseDetailsDraft({
      code: course?.code || "",
      instructor: course?.instructor || "",
      meetingTime: course?.meetingTime || "",
      location: course?.location || "",
      color: course?.color || "#111827",
      icon: course?.icon || "graduation-cap",
    });
  }

  async function saveCourseDetails() {
    if (!activeCourse?.id || activeCourseArchived || savingCourseDetails) return;
    setSavingCourseDetails(true);
    setCourseActionError("");
    try {
      const updated = await window.brevyn.courses.update({
        id: activeCourse.id,
        code: courseDetailsDraft.code,
        instructor: courseDetailsDraft.instructor,
        meetingTime: courseDetailsDraft.meetingTime || null,
        location: courseDetailsDraft.location || null,
        color: courseDetailsDraft.color,
        icon: courseDetailsDraft.icon,
      });
      onCourseUpdated(updated);
      resetCourseDetailsDraft(updated);
      setEditingCourseDetails(false);
    } catch (error) {
      setCourseActionError(errorMessage(error, "Failed to update course details."));
    } finally {
      setSavingCourseDetails(false);
    }
  }

  async function createTask() {
    if (creatingTask) return;
    if (!activeCourse?.id) {
      setTaskError(courseReadOnlyReason);
      return;
    }
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
      const task = await window.brevyn.tasks.create({
        courseId: activeCourse.id,
        title,
        taskType,
      });
      onTaskCreated(task);
      setTaskName("");
      await loadCourseView(activeCourse.id);
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
    if (!activeCourse?.id) {
      setCourseActionError(courseReadOnlyReason);
      return;
    }
    if (activeCourseArchived) return;
    setIndexingSectionId(indicatorId);
    setCourseActionError("");
    try {
      await window.brevyn.files.index(activeCourse.id, sectionId);
      setRagError("");
      await loadCourseView(activeCourse.id);
    } catch (error) {
      setCourseActionError(errorMessage(error, "Failed to start indexing."));
    } finally {
      setIndexingSectionId("");
    }
  }

  async function uploadToSection(section: CourseFileSection) {
    if (!activeCourse?.id) {
      setCourseActionError(courseReadOnlyReason);
      return;
    }
    if (activeCourseArchived) return;
    setUploadingSectionId(section.id);
    setCourseActionError("");
    try {
      const result = await window.brevyn.files.import({
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
    if (!activeCourse?.id) {
      setCourseActionError(courseReadOnlyReason);
      return;
    }
    setCourseActionError("");
    try {
      await window.brevyn.files.cancelIndexing(jobId);
      await loadCourseView(activeCourse.id);
    } catch (error) {
      setCourseActionError(errorMessage(error, "Failed to cancel indexing."));
    }
  }

  async function searchRag() {
    if (!activeCourse?.id) {
      setRagError(courseReadOnlyReason);
      setRagResults([]);
      return;
    }
    if (activeCourseArchived) {
      setRagError(courseReadOnlyReason);
      setRagResults([]);
      return;
    }
    const query = ragQuery.trim();
    if (!query) return;
    const courseId = activeCourse.id;
    const requestId = ragSearchRequestRef.current + 1;
    ragSearchRequestRef.current = requestId;
    setRagSearching(true);
    setRagError("");
    try {
      const results = await window.brevyn.rag.search(query, courseId);
      if (ragSearchRequestRef.current !== requestId) return;
      setRagResults(results);
    } catch (error) {
      if (ragSearchRequestRef.current !== requestId) return;
      setRagError(errorMessage(error, "RAG search failed."));
      setRagResults([]);
    } finally {
      if (ragSearchRequestRef.current === requestId) setRagSearching(false);
    }
  }

  async function archiveCourse(course: Course) {
    const ok = await confirm({
      title: `Archive "${course.name}"?`,
      message: "It will disappear from the main workspace until restored.",
      confirmLabel: "Archive",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    setCourseBusyId(course.id);
    setCourseActionError("");
    try {
      await window.brevyn.courses.archive(course.id);
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
      const restored = await window.brevyn.courses.restore(course.id);
      await loadArchivedCourses();
      onCourseCreated(restored);
      setViewingCourseId(restored.id);
      onWorkspaceChanged?.();
    } catch (reason) {
      setCourseActionError(errorMessage(reason, "Failed to restore course."));
    } finally {
      setCourseBusyId("");
    }
  }

  async function deleteCourse(course: Course) {
    if (!course.archivedAt) {
      setCourseActionError("Archive this course before deleting it permanently.");
      return;
    }
    const ok = await confirm({
      title: `Delete "${course.name}" permanently?`,
      message: "This removes all files and indexed data.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
      verificationText: course.name,
      verificationLabel: "Type the course name to confirm",
    });
    if (!ok) return;
    setCourseBusyId(course.id);
    setCourseActionError("");
    try {
      await window.brevyn.courses.delete(course.id);
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
      {confirmDialog}
      {indexingNotice && (
        <div className="pointer-events-auto absolute left-1/2 top-5 z-[60] w-[min(620px,calc(100vw-40px))] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50/95 px-4 py-3 text-red-800 shadow-[0_18px_54px_rgba(127,29,29,0.18)] ring-1 ring-white/60 backdrop-blur-xl">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">Embedding provider error</div>
              <div className="mt-1 max-h-24 overflow-y-auto break-words pr-1 text-[11px] leading-5 brevyn-scrollbar">{indexingNotice.message}</div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-red-700/70 transition hover:bg-red-100 hover:text-red-900"
              onClick={() => setIndexingNotice(null)}
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex h-[82vh] w-[min(1180px,calc(100vw-48px))] flex-col overflow-hidden rounded-lg border bg-card shadow-2xl ring-1 ring-border/80">
        <div className="drag-region flex items-center justify-between border-b bg-muted/25 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4" />
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

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[360px_1fr] brevyn-scrollbar">
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
                    course.id === viewingCourseId && !course.archivedAt ? "border-foreground/25 bg-accent/45 shadow-sm ring-1 ring-foreground/10" : "border-border/60 hover:bg-accent/55",
                  )}
                >
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => !course.archivedAt && setViewingCourseId(course.id)}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ color: course.color, backgroundColor: `${course.color}1f` }}>
                      <CourseIcon course={course} className="h-4 w-4" />
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
              {!canCreateCourse && !newCourseError && (
                <div className="mb-2 rounded-md bg-muted/55 px-2 py-1 text-[11px] leading-5 text-muted-foreground">
                  Select or create a semester before adding courses.
                </div>
              )}
              <button
                type="button"
                className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                onClick={createCourse}
                disabled={creatingCourse || !canCreateCourse}
              >
                {creatingCourse ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {creatingCourse ? "Creating..." : "Create course"}
              </button>
              <VisionRecognitionImportButton
                kind="course_timetable"
                className="mt-2 w-full"
                onImported={async () => {
                  onWorkspaceChanged?.();
                  await loadArchivedCourses();
                  if (activeCourse?.id) await loadCourseView(activeCourse.id);
                }}
              />
            </section>
          </aside>

          <section className="min-h-0 rounded-lg border bg-background/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{activeCourse?.name || "No course selected"}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {activeCourse?.code || "Brevyn"} · {activeCourse?.term || "local"} · {activeCourse?.instructor || "Instructor TBD"}
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground/80">
                  {activeCourse?.meetingTime || "Time TBD"} · {activeCourse?.location || "Location TBD"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    resetCourseDetailsDraft(activeCourse);
                    setEditingCourseDetails((value) => !value);
                  }}
                  disabled={!activeCourse?.id || activeCourseArchived || savingCourseDetails}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Details
                </button>
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
            </div>
            {courseReadOnlyReason && (
              <div className="mt-3 flex gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{courseReadOnlyReason}</span>
              </div>
            )}
            {activeCourse && editingCourseDetails && !activeCourseArchived && (
              <section className="mt-3 rounded-lg border bg-card p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>Course code</span>
                    <input
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                      value={courseDetailsDraft.code}
                      onChange={(event) => setCourseDetailsDraft((current) => ({ ...current, code: event.target.value }))}
                    />
                  </label>
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>Instructor</span>
                    <input
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                      value={courseDetailsDraft.instructor}
                      onChange={(event) => setCourseDetailsDraft((current) => ({ ...current, instructor: event.target.value }))}
                    />
                  </label>
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>Meeting time</span>
                    <input
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                      value={courseDetailsDraft.meetingTime}
                      onChange={(event) => setCourseDetailsDraft((current) => ({ ...current, meetingTime: event.target.value }))}
                    />
                  </label>
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    <span>Location</span>
                    <input
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                      value={courseDetailsDraft.location}
                      onChange={(event) => setCourseDetailsDraft((current) => ({ ...current, location: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-6 gap-1.5">
                    {COURSE_ICON_OPTIONS.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        className={cx(
                          "flex h-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground",
                          courseDetailsDraft.icon === key && "border-foreground/30 bg-muted text-foreground ring-1 ring-foreground/10",
                        )}
                        onClick={() => setCourseDetailsDraft((current) => ({ ...current, icon: key }))}
                        title={label}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                    {COURSE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cx("h-6 w-6 rounded-md border transition ring-offset-2 ring-offset-card", courseDetailsDraft.color === color && "ring-2 ring-foreground/30")}
                        style={{ backgroundColor: color }}
                        onClick={() => setCourseDetailsDraft((current) => ({ ...current, color }))}
                        title={color}
                      />
                    ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      onClick={() => {
                        resetCourseDetailsDraft(activeCourse);
                        setEditingCourseDetails(false);
                      }}
                      disabled={savingCourseDetails}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void saveCourseDetails()}
                      disabled={savingCourseDetails || !courseDetailsDraft.code.trim()}
                    >
                      {savingCourseDetails ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="mt-4">
              <div className="mb-3 flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
                <CoursePanelButton active={coursePanel === "files"} icon={<FolderOpen className="h-3.5 w-3.5" />} label="Files" onClick={() => setCoursePanel("files")} />
                <CoursePanelButton active={coursePanel === "tasks"} icon={<Plus className="h-3.5 w-3.5" />} label="Tasks" onClick={() => setCoursePanel("tasks")} />
                <CoursePanelButton active={coursePanel === "indexing"} icon={<Database className="h-3.5 w-3.5" />} label="Indexing" onClick={() => setCoursePanel("indexing")} />
                <CoursePanelButton active={coursePanel === "search"} icon={<Search className="h-3.5 w-3.5" />} label="Search" onClick={() => setCoursePanel("search")} />
              </div>

              {!activeCourse && (
                <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-xs leading-5 text-muted-foreground">
                  Select a course on the left before viewing files, tasks, indexing jobs, or RAG search.
                </div>
              )}

              {activeCourse && coursePanel === "files" && (
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
              )}

              {activeCourse && coursePanel === "tasks" && (
                <section className="rounded-lg border bg-card p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                    <Plus className="h-3.5 w-3.5" />
                    New Task Section
                  </div>
                  <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                    <label className="block space-y-1 text-[11px] text-muted-foreground">
                      <span>Task type</span>
                      <input
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                        value={taskType}
                        onChange={(event) => setTaskType(event.target.value)}
                        placeholder="Assignment"
                        disabled={!activeCourse?.id || activeCourseArchived || creatingTask}
                      />
                    </label>
                    <label className="block space-y-1 text-[11px] text-muted-foreground">
                      <span>Task name</span>
                      <input
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                        value={taskName}
                        onChange={(event) => setTaskName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !creatingTask) void createTask();
                        }}
                        placeholder="Custom task name"
                        disabled={!activeCourse?.id || activeCourseArchived || creatingTask}
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-5 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={createTask}
                      disabled={!activeCourse?.id || activeCourseArchived || creatingTask || !taskName.trim()}
                    >
                      {creatingTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {creatingTask ? "Creating..." : "Create"}
                    </button>
                  </div>
                  {existingTaskTypes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {existingTaskTypes.slice(0, 8).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="rounded-full border bg-background px-2.5 py-1 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          onClick={() => setTaskType(item)}
                          disabled={!activeCourse?.id || activeCourseArchived || creatingTask}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                  {taskError && <div className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">{taskError}</div>}
                </section>
              )}

              {activeCourse && coursePanel === "indexing" && (
                <IndexingProgressPanel
                  jobs={indexingJobs}
                  loading={loadingIndexingJobs}
                  sections={sections}
                  onRefresh={() => activeCourse?.id && void loadCourseView(activeCourse.id)}
                  onCancel={(jobId) => void cancelIndexing(jobId)}
                />
              )}

              {activeCourse && coursePanel === "search" && (
                <RagDebugPanel
                  query={ragQuery}
                  results={ragResults}
                  searching={ragSearching}
                  error={ragError}
                  onQueryChange={setRagQuery}
                  onSearch={() => void searchRag()}
                  disabled={!activeCourse?.id || activeCourseArchived}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CoursePanelButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition",
        active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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
  const visibleJobs = latestIndexingJobsBySection(jobs);
  const activeCount = visibleJobs.filter((job) => job.status === "queued" || job.status === "indexing").length;

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

      {visibleJobs.length === 0 ? (
        <div className="rounded-md border border-dashed bg-background/60 px-3 py-4 text-center text-[11px] text-muted-foreground">No indexing jobs</div>
      ) : (
        <div className="space-y-2">
          {visibleJobs.slice(0, 5).map((job) => {
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

function latestIndexingJobsBySection(jobs: IndexingJob[]): IndexingJob[] {
  const latest = new Map<string, IndexingJob>();
  for (const job of jobs) {
    const key = job.sectionId || `course:${job.courseId}:all`;
    const current = latest.get(key);
    if (!current || new Date(job.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      latest.set(key, job);
    }
  }
  return Array.from(latest.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(results.length / RAG_RESULTS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleResults = results.slice(safePage * RAG_RESULTS_PAGE_SIZE, safePage * RAG_RESULTS_PAGE_SIZE + RAG_RESULTS_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [query, results]);

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

      <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1 brevyn-scrollbar">
        {results.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
            {query.trim() ? "No chunks returned" : "No query"}
          </div>
        ) : (
          visibleResults.map((result) => {
            const citation = result.citation || result.source;
            const displayCitation = compactRagCitation(citation);
            return (
            <div key={result.id} className="min-w-0 overflow-hidden rounded-md border bg-background/70 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 truncate text-[11px] font-semibold" title={result.title}>{result.title}</div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{Math.round(result.score * 100)}%</span>
              </div>
              <div className="mt-1 line-clamp-3 min-w-0 break-words text-[11px] leading-5 text-muted-foreground">{result.excerpt}</div>
              <div className="mt-1 min-w-0 truncate text-[10px] text-muted-foreground/80" title={citation}>{displayCitation}</div>
            </div>
          );
          })
        )}
      </div>
      {results.length > RAG_RESULTS_PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[10px] text-muted-foreground">
          <span>{results.length} results · Page {safePage + 1}/{pageCount}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-background transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              title="Previous results"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-background transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              title="Next results"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function compactRagCitation(citation: string): string {
  const value = citation.trim();
  if (!value) return "";
  const [pathPart, ...rest] = value.split(" · ");
  const normalized = pathPart.replace(/\\/g, "/");
  const semanticMatch = normalized.match(/(?:Course shared|Lecture|Materials|Drafts|Submitted)\/[^/]+$/);
  const compactPath = semanticMatch?.[0] || normalized.split("/").slice(-2).join("/");
  return [compactPath, ...rest].filter(Boolean).join(" · ");
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
  const [fileActionError, setFileActionError] = useState("");
  const { confirm, confirmDialog } = useConfirmDialog();

  async function deleteFile(fileId: string, fileName: string) {
    const ok = await confirm({
      title: `Delete "${fileName}"?`,
      message: "The local copy will be removed.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
      verificationText: fileName,
      verificationLabel: "Type the file name to confirm",
    });
    if (!ok) return;
    setDeletingFileId(fileId);
    setFileActionError("");
    try {
      await window.brevyn.files.delete(fileId);
      onFileDeleted();
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingFileId("");
    }
  }

  async function revealFile(fileId: string) {
    try {
      await window.brevyn.files.reveal(fileId);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Reveal failed");
    }
  }

  return (
    <div className="rounded-lg border bg-card px-3 py-3">
      {confirmDialog}
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
              <FileIndexingBadge file={file} />
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
      {fileActionError && <div className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-900">{fileActionError}</div>}
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
