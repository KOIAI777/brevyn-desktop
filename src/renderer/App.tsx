import { AlertCircle, Archive, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Course,
  FileImportInput,
  FileImportResult,
  FilePreview,
  FileStats,
  GitStatus,
  SemesterWorkspace,
  SkillItem,
  Thread,
  BrevynTask,
  WorkspaceFileNode,
} from "@/types/domain";
import { CourseManagementDialog } from "@/components/courses/CourseManagementDialog";
import { CourseFilesUploadDialog } from "@/components/files/CourseFilesUploadDialog";
import { FileBrowserRail } from "@/components/files/FileBrowserRail";
import { FilePreviewRail } from "@/components/files/FilePreviewRail";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { AppTitleBar } from "@/components/shell/AppTitleBar";
import { TopBar } from "@/components/shell/TopBar";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { TimetableDialog } from "@/components/timetable/TimetableDialog";
import { findFileNode, firstPreviewableFile } from "@/lib/workspace-files";

const SEMESTER_HOME_COURSE_ID = "semester-home";
type SettingsPage = "providers" | "archive" | "skills";

function App() {
  const mountedRef = useRef(true);
  const activeCourseIdRef = useRef("");
  const selectedFileIdRef = useRef("");
  const fileLoadRequestRef = useRef(0);
  const filePreviewRequestRef = useRef(0);
  const workspaceReloadRequestRef = useRef(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<SemesterWorkspace[]>([]);
  const [semester, setSemester] = useState<SemesterWorkspace | null>(null);
  const [tasksByCourse, setTasksByCourse] = useState<Record<string, BrevynTask[]>>({});
  const [threads, setThreads] = useState<Thread[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [activeCourseId, setActiveCourseId] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [activeThreadId, setActiveThreadId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileRailCollapsed, setFileRailCollapsed] = useState(false);
  const [previewRailCollapsed, setPreviewRailCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPage>("providers");
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [courseFilesUploadOpen, setCourseFilesUploadOpen] = useState(false);
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");

  activeCourseIdRef.current = activeCourseId;
  selectedFileIdRef.current = selectedFileId;

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    void bootstrap(() => cancelled);
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activeCourseId) {
      fileLoadRequestRef.current += 1;
      setFilesLoading(false);
      setFileTree([]);
      setFileStats(null);
      commitSelectedFileId("");
      setFilePreview(null);
      return;
    }
    void loadCourseFiles(activeCourseId);
  }, [activeCourseId]);

  const activeCourse = useMemo(() => courses.find((course) => course.id === activeCourseId), [courses, activeCourseId]);
  const courseTasks = activeCourse ? tasksByCourse[activeCourse.id] || [] : [];
  const activeTask = useMemo(() => courseTasks.find((task) => task.id === activeTaskId), [courseTasks, activeTaskId]);
  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId), [threads, activeThreadId]);
  const workspaceScope = useMemo(() => describeWorkspaceScope(activeCourse, activeTask, activeThread), [activeCourse, activeTask, activeThread]);
  const needsSemesterSelection = !semester && semesters.length > 0;
  const noActiveSemesters = !semester && semesters.length === 0 && threads.length === 0;

  function commitActiveCourseId(courseId: string) {
    activeCourseIdRef.current = courseId;
    setActiveCourseId(courseId);
  }

  function commitSelectedFileId(fileId: string) {
    selectedFileIdRef.current = fileId;
    setSelectedFileId(fileId);
  }

  function clearFileState() {
    fileLoadRequestRef.current += 1;
    filePreviewRequestRef.current += 1;
    setFilesLoading(false);
    setFileTree([]);
    setFileStats(null);
    commitSelectedFileId("");
    setFilePreview(null);
  }

  function isLatestFileLoad(requestId: number, courseId: string) {
    return mountedRef.current && fileLoadRequestRef.current === requestId && activeCourseIdRef.current === courseId;
  }

  async function bootstrap(isCancelled: () => boolean = () => false) {
    if (!mountedRef.current || isCancelled()) return;
    setBootState("loading");
    setBootError("");
    setWorkspaceError("");
    try {
      const [semesterList, currentSemester, courseList, skillList, git] = await Promise.all([
        window.brevyn.semester.list(),
        window.brevyn.semester.current(),
        window.brevyn.courses.list(),
        window.brevyn.skills.list(),
        window.brevyn.git.status(),
      ]);
      const taskEntries = await Promise.all(courseList.map(async (course) => [course.id, await window.brevyn.tasks.list(course.id)] as const));
      const threadList = await window.brevyn.threads.list();

      if (!mountedRef.current || isCancelled()) return;
      const visibleThreads = filterThreadsForSemester(dedupeThreads(threadList), currentSemester?.id);
      const nextTasksByCourse = Object.fromEntries(taskEntries);
      const selection = pickWorkspaceSelection(courseList, nextTasksByCourse, visibleThreads);

      setSemesters(semesterList);
      setSemester(currentSemester);
      setCourses(courseList);
      setSkills(skillList);
      setGitStatus(git);
      setTasksByCourse(nextTasksByCourse);
      setThreads(visibleThreads);

      commitActiveCourseId(selection.courseId);
      setActiveTaskId(selection.taskId);
      setActiveThreadId(selection.threadId);
      if (!selection.courseId) clearFileState();
      setBootState("ready");
    } catch (error) {
      if (!mountedRef.current || isCancelled()) return;
      setBootError(errorMessage(error, "Failed to load workspace."));
      setBootState("error");
    }
  }

  async function reloadWorkspace(preferredThreadId?: string): Promise<boolean> {
    const requestId = workspaceReloadRequestRef.current + 1;
    workspaceReloadRequestRef.current = requestId;
    setWorkspaceError("");
    try {
      const [semesterList, currentSemester, courseList, threadList] = await Promise.all([
        window.brevyn.semester.list(),
        window.brevyn.semester.current(),
        window.brevyn.courses.list(),
        window.brevyn.threads.list(),
      ]);
      const taskEntries = await Promise.all(courseList.map(async (course) => [course.id, await window.brevyn.tasks.list(course.id)] as const));

      if (!mountedRef.current || workspaceReloadRequestRef.current !== requestId) return false;

      const visibleThreads = filterThreadsForSemester(dedupeThreads(threadList), currentSemester?.id);
      const nextTasksByCourse = Object.fromEntries(taskEntries);
      const selection = pickWorkspaceSelection(
        courseList,
        nextTasksByCourse,
        visibleThreads,
        {
          courseId: activeCourseIdRef.current,
          taskId: activeTaskId,
          threadId: activeThreadId,
        },
        preferredThreadId,
      );
      const previousCourseId = activeCourseIdRef.current;

      setSemesters(semesterList);
      setSemester(currentSemester);
      setCourses(courseList);
      setTasksByCourse(nextTasksByCourse);
      setThreads(visibleThreads);

      commitActiveCourseId(selection.courseId);
      setActiveTaskId(selection.taskId);
      setActiveThreadId(selection.threadId);
      if (!selection.courseId) clearFileState();
      else if (previousCourseId === selection.courseId) void loadCourseFiles(selection.courseId);
      return true;
    } catch (error) {
      if (mountedRef.current && workspaceReloadRequestRef.current === requestId) {
        setWorkspaceError(errorMessage(error, "Failed to reload workspace."));
      }
      return false;
    }
  }

  async function selectSemester(semesterId: string) {
    setWorkspaceError("");
    try {
      await window.brevyn.semester.select(semesterId);
      await reloadWorkspace();
    } catch (error) {
      if (mountedRef.current) setWorkspaceError(errorMessage(error, "Failed to switch semester."));
    }
  }

  async function loadCourseFiles(courseId: string): Promise<boolean> {
    const requestId = fileLoadRequestRef.current + 1;
    fileLoadRequestRef.current = requestId;
    setFilesLoading(true);
    try {
      const [tree, stats] = await Promise.all([window.brevyn.files.tree(courseId), window.brevyn.files.stats(courseId)]);
      if (!isLatestFileLoad(requestId, courseId)) return false;

      const current = selectedFileIdRef.current ? findFileNode(tree, selectedFileIdRef.current) : null;
      const next = current?.kind !== "folder" ? current : firstPreviewableFile(tree);
      const previewRequestId = filePreviewRequestRef.current + 1;
      filePreviewRequestRef.current = previewRequestId;
      let preview: FilePreview | null = null;
      if (next) {
        try {
          preview = await window.brevyn.files.preview(next.id);
        } catch (error) {
          if (isLatestFileLoad(requestId, courseId) && filePreviewRequestRef.current === previewRequestId) {
            setWorkspaceError(errorMessage(error, "Failed to preview file."));
          }
        }
      }

      if (!isLatestFileLoad(requestId, courseId) || filePreviewRequestRef.current !== previewRequestId) return false;
      setFileTree(tree);
      setFileStats(stats);
      commitSelectedFileId(next?.id || "");
      setFilePreview(preview);
      return true;
    } catch (error) {
      if (isLatestFileLoad(requestId, courseId)) {
        setWorkspaceError(errorMessage(error, "Failed to load course files."));
        setFileTree([]);
        setFileStats(null);
        commitSelectedFileId("");
        setFilePreview(null);
      }
      return false;
    } finally {
      if (fileLoadRequestRef.current === requestId) setFilesLoading(false);
    }
  }

  async function selectFile(file: WorkspaceFileNode) {
    const requestId = filePreviewRequestRef.current + 1;
    filePreviewRequestRef.current = requestId;
    commitSelectedFileId(file.id);
    if (file.kind === "folder") {
      setFilePreview(null);
      return;
    }
    try {
      const preview = await window.brevyn.files.preview(file.id);
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId || selectedFileIdRef.current !== file.id) return;
      setFilePreview(preview);
      setPreviewRailCollapsed(false);
    } catch (error) {
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId) return;
      setFilePreview(null);
      setWorkspaceError(errorMessage(error, "Failed to preview file."));
    }
  }

  async function importCourseFiles(input: FileImportInput): Promise<FileImportResult | null> {
    const targetCourseId = input.courseId;
    setWorkspaceError("");
    try {
      const result = await window.brevyn.files.import(input);
      if (!mountedRef.current || activeCourseIdRef.current !== targetCourseId) return result;

      const requestId = fileLoadRequestRef.current + 1;
      fileLoadRequestRef.current = requestId;
      const stats = await window.brevyn.files.stats(targetCourseId);
      const next = result.files.find((file) => file.kind !== "folder") || firstPreviewableFile(result.tree);
      const previewRequestId = filePreviewRequestRef.current + 1;
      filePreviewRequestRef.current = previewRequestId;
      let preview: FilePreview | null = null;
      if (next) {
        try {
          preview = await window.brevyn.files.preview(next.id);
        } catch (error) {
          if (isLatestFileLoad(requestId, targetCourseId) && filePreviewRequestRef.current === previewRequestId) {
            setWorkspaceError(errorMessage(error, "Imported files, but preview failed."));
          }
        }
      }
      if (!isLatestFileLoad(requestId, targetCourseId) || filePreviewRequestRef.current !== previewRequestId) return result;

      setFileTree(result.tree);
      setFileStats(stats);
      setFileRailCollapsed(false);
      commitSelectedFileId(next?.id || "");
      setFilePreview(preview);
      if (next) setPreviewRailCollapsed(false);
      return result;
    } catch (error) {
      const message = errorMessage(error, "Failed to import files.");
      if (mountedRef.current) setWorkspaceError(message);
      throw new Error(message);
    }
  }

  async function refreshThreads(): Promise<Thread[]> {
    try {
      const next = await window.brevyn.threads.list();
      const deduped = filterThreadsForSemester(dedupeThreads(next), semester?.id);
      if (mountedRef.current) setThreads(deduped);
      return deduped;
    } catch (error) {
      if (mountedRef.current) setWorkspaceError(errorMessage(error, "Failed to refresh sessions."));
      throw error;
    }
  }

  function threadTitleForScope(courseId: string, taskId?: string): string {
    const task = taskId ? (tasksByCourse[courseId] || []).find((item) => item.id === taskId) : undefined;
    const course = courses.find((item) => item.id === courseId);
    return task ? `${task.title} session` : course?.workspaceKind === "semester_home" ? "Home session" : "Task session";
  }

  async function createThread(courseId = activeCourse?.id || "", taskId?: string) {
    if (!courseId) return;
    if (courseId !== SEMESTER_HOME_COURSE_ID && !taskId) {
      setWorkspaceError("Create sessions from a task, not the course container.");
      return;
    }
    setWorkspaceError("");
    try {
      const thread = await window.brevyn.threads.create({
        courseId,
        taskId,
        title: threadTitleForScope(courseId, taskId),
      });
      if (!threadBelongsToSemester(thread, semester?.id)) throw new Error("Created session does not belong to the selected semester.");
      setThreads((current) => dedupeThreads([thread, ...current]));
      commitActiveCourseId(thread.courseId);
      setActiveTaskId(thread.taskId);
      setActiveThreadId(thread.id);
    } catch (error) {
      setWorkspaceError(errorMessage(error, "Create session failed."));
    }
  }

  async function archiveThread(thread: Thread) {
    setWorkspaceError("");
    try {
      await window.brevyn.threads.archive(thread.id);
      await refreshThreads();
      if (thread.id !== activeThreadId) return;

      const courseStillExists = courses.some((course) => course.id === thread.courseId);
      const taskStillExists = !thread.taskId || (tasksByCourse[thread.courseId] || []).some((task) => task.id === thread.taskId);
      commitActiveCourseId(courseStillExists ? thread.courseId : "");
      setActiveTaskId(courseStillExists && taskStillExists ? thread.taskId : undefined);
      setActiveThreadId("");
    } catch (error) {
      setWorkspaceError(errorMessage(error, "Archive session failed."));
    }
  }

  function selectCourseHome(courseId: string) {
    commitActiveCourseId(courseId);
    setActiveTaskId(undefined);
    const thread = courseId === SEMESTER_HOME_COURSE_ID ? threads.find((item) => threadBelongsToSemester(item, semester?.id) && item.courseId === courseId && !item.taskId) : undefined;
    setActiveThreadId(thread?.id || "");
  }

  function selectTask(courseId: string, taskId: string) {
    commitActiveCourseId(courseId);
    setActiveTaskId(taskId);
    const thread = threads.find((item) => threadBelongsToSemester(item, semester?.id) && item.courseId === courseId && item.taskId === taskId);
    setActiveThreadId(thread?.id || "");
  }

  function selectThread(thread: Thread) {
    if (!threadBelongsToSemester(thread, semester?.id)) {
      setWorkspaceError("This session belongs to a different semester. Select that semester first.");
      return;
    }
    setWorkspaceError("");
    commitActiveCourseId(thread.courseId);
    setActiveTaskId(thread.taskId);
    setActiveThreadId(thread.id);
  }

  function openSettings(page: SettingsPage = "providers") {
    setSettingsInitialPage(page);
    setSettingsOpen(true);
  }

  function handleCourseCreated(course: Course) {
    setCourses((current) => (current.some((item) => item.id === course.id) ? current : [...current, course]));
    setTasksByCourse((current) => ({ ...current, [course.id]: current[course.id] || [] }));
  }

  function handleCourseUpdated(course: Course) {
    setCourses((current) => current.map((item) => (item.id === course.id ? course : item)));
  }

  function handleTaskCreated(task: BrevynTask) {
    setTasksByCourse((current) => ({
      ...current,
      [task.courseId]: [...(current[task.courseId] || []), task],
    }));
  }

  if (bootState === "loading") {
    return <AppLoadingScreen />;
  }

  if (bootState === "error") {
    return <AppBootErrorScreen error={bootError} onRetry={() => void bootstrap()} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.08),transparent_34%),linear-gradient(180deg,hsl(var(--background)),#f3f1ea)] text-foreground">
      <AppTitleBar
        course={activeCourse}
        task={activeTask}
        thread={activeThread}
        semester={semester}
        sidebarCollapsed={sidebarCollapsed}
        fileRailCollapsed={fileRailCollapsed}
        previewRailCollapsed={previewRailCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        onToggleFileRail={() => setFileRailCollapsed((value) => !value)}
        onTogglePreviewRail={() => setPreviewRailCollapsed((value) => !value)}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <WorkspaceSidebar
          collapsed={sidebarCollapsed}
          courses={courses}
          tasksByCourse={tasksByCourse}
          threads={threads}
          activeCourseId={activeCourseId}
          activeTaskId={activeTask?.id}
          activeThreadId={activeThreadId}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          onSelectHome={selectCourseHome}
          onSelectTask={selectTask}
          onSelectThread={selectThread}
          onArchiveThread={(thread) => {
            void archiveThread(thread);
          }}
          onCreateThread={createThread}
          onOpenCourses={() => setCoursesOpen(true)}
          onOpenTimetable={() => setTimetableOpen(true)}
          onOpenSettings={() => openSettings("providers")}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/80 shadow-sm ring-1 ring-border/60">
          <TopBar course={activeCourse} task={activeTask} thread={activeThread} workspaceScope={workspaceScope} />
          {workspaceError && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {workspaceError}
            </div>
          )}

          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            {activeThread ? (
              <p>Thread: {activeThread.title}</p>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                {noActiveSemesters ? (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background text-amber-700">
                      <Archive className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">No active semesters.</p>
                      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                        Your semesters may all be archived. Restore one from Archive, or create a new semester from Manage semesters.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
                        onClick={() => openSettings("archive")}
                      >
                        Open Archive
                      </button>
                      <button
                        type="button"
                        className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
                        onClick={() => setTimetableOpen(true)}
                      >
                        Manage semesters
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="font-medium text-foreground">{needsSemesterSelection ? "No semester selected." : threads.length === 0 ? "No active sessions yet." : "No session selected."}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {needsSemesterSelection ? "Choose a semester explicitly before loading courses, sessions, and files." : "Workspace files are ready. Create a session when you want to start chatting."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!needsSemesterSelection && ((!activeCourse?.id && !semester?.id) || Boolean(activeCourse && activeCourse.workspaceKind !== "semester_home" && !activeTask))}
                      onClick={() => {
                        if (needsSemesterSelection) {
                          setTimetableOpen(true);
                          return;
                        }
                        void createThread(activeCourse?.id || SEMESTER_HOME_COURSE_ID, activeTask?.id);
                      }}
                    >
                      {needsSemesterSelection ? "Select semester" : activeTask ? "Create task session" : activeCourse?.workspaceKind === "semester_home" || !activeCourse ? "Create Home session" : "Select a task to create session"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        <FileBrowserRail
          collapsed={fileRailCollapsed}
          course={activeCourse}
          stats={fileStats}
          files={fileTree}
          loading={filesLoading}
          selectedFileId={selectedFileId}
          onSelectFile={selectFile}
          onOpenUpload={() => {
            if (activeCourse?.archivedAt) return;
            setCourseFilesUploadOpen(true);
          }}
        />

        <FilePreviewRail collapsed={previewRailCollapsed} preview={filePreview} />
      </div>

      {settingsOpen && (
        <SettingsDialog
          initialPage={settingsInitialPage}
          course={activeCourse}
          semester={semester}
          skills={skills}
          gitStatus={gitStatus}
          onSkillsChange={setSkills}
          onWorkspaceChanged={async () => {
            await reloadWorkspace(activeThreadId);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {coursesOpen && (
        <CourseManagementDialog
          semester={semester}
          courses={courses.filter((course) => course.workspaceKind !== "semester_home")}
          activeCourseId={activeCourseId}
          onCourseCreated={handleCourseCreated}
          onCourseUpdated={handleCourseUpdated}
          onTaskCreated={handleTaskCreated}
          onWorkspaceChanged={() => void reloadWorkspace()}
          onClose={() => setCoursesOpen(false)}
        />
      )}
      {timetableOpen && (
        <TimetableDialog
          course={activeCourse}
          semesters={semesters}
          onSelectSemester={selectSemester}
          onWorkspaceChanged={async () => {
            await reloadWorkspace();
          }}
          onClose={() => setTimetableOpen(false)}
        />
      )}
      {courseFilesUploadOpen && (
        <CourseFilesUploadDialog
          course={activeCourse}
          courses={courses}
          tasksByCourse={tasksByCourse}
          activeTaskId={activeTaskId}
          onClose={() => setCourseFilesUploadOpen(false)}
          onImportFiles={importCourseFiles}
        />
      )}
    </div>
  );
}

export default App;

function describeWorkspaceScope(course?: Course, task?: BrevynTask, thread?: Thread): string {
  if (task || thread?.taskId) return "Task workspace shared across sessions";
  if (course?.workspaceKind === "semester_home" || thread?.threadType === "semester_home") return "Semester workspace";
  if (course) return "Course workspace";
  return "Workspace scope pending";
}

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "").trim();
  return message.trim() || fallback;
}

function dedupeThreads(threads: Thread[]): Thread[] {
  const seen = new Set<string>();
  const result: Thread[] = [];
  for (const thread of threads) {
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    result.push(thread);
  }
  return result;
}

function threadBelongsToSemester(thread: Thread, semesterId?: string) {
  return Boolean(semesterId && thread.semesterId === semesterId);
}

function filterThreadsForSemester(threads: Thread[], semesterId?: string) {
  return threads.filter((thread) => threadBelongsToSemester(thread, semesterId));
}

interface WorkspaceSelection {
  courseId: string;
  taskId?: string;
  threadId: string;
}

function pickWorkspaceSelection(
  courses: Course[],
  tasksByCourse: Record<string, BrevynTask[]>,
  threads: Thread[],
  current?: WorkspaceSelection,
  preferredThreadId?: string,
): WorkspaceSelection {
  const preferredThread = preferredThreadId ? validThreadSelection(threads.find((thread) => thread.id === preferredThreadId), courses, tasksByCourse) : undefined;
  if (preferredThread) return preferredThread;

  const currentThread = current?.threadId ? validThreadSelection(threads.find((thread) => thread.id === current.threadId), courses, tasksByCourse) : undefined;
  if (currentThread) return currentThread;

  if (current?.courseId && courses.some((course) => course.id === current.courseId)) {
    if (current.taskId && taskBelongsToCourse(tasksByCourse, current.courseId, current.taskId)) {
      return { courseId: current.courseId, taskId: current.taskId, threadId: "" };
    }
    if (!current.taskId) return { courseId: current.courseId, taskId: undefined, threadId: "" };
  }

  return {
    courseId: "",
    taskId: undefined,
    threadId: "",
  };
}

function validThreadSelection(thread: Thread | undefined, courses: Course[], tasksByCourse: Record<string, BrevynTask[]>): WorkspaceSelection | undefined {
  if (!thread || !courses.some((course) => course.id === thread.courseId)) return undefined;
  if (thread.taskId && !taskBelongsToCourse(tasksByCourse, thread.courseId, thread.taskId)) return undefined;
  return {
    courseId: thread.courseId,
    taskId: thread.taskId,
    threadId: thread.id,
  };
}

function taskBelongsToCourse(tasksByCourse: Record<string, BrevynTask[]>, courseId: string, taskId: string): boolean {
  return Boolean((tasksByCourse[courseId] || []).some((task) => task.id === taskId));
}

function AppLoadingScreen() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.08),transparent_34%),linear-gradient(180deg,hsl(var(--background)),#f3f1ea)] px-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border bg-card/90 p-6 shadow-2xl ring-1 ring-border/70">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workspace
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded-full bg-muted/80" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted/70" />
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Syncing semesters, courses, tasks, threads, and files.</p>
      </div>
    </div>
  );
}

function AppBootErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.08),transparent_34%),linear-gradient(180deg,hsl(var(--background)),#f3f1ea)] px-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border bg-card/90 p-6 shadow-2xl ring-1 ring-border/70">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Failed to load workspace
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Brevyn could not finish startup. Try again, and if it keeps happening we will need the error text below.
        </p>
        <div className="mt-4 rounded-lg border bg-muted/35 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          {error || "Unknown startup error."}
        </div>
        <button
          type="button"
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    </div>
  );
}
