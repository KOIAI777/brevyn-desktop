import { useEffect, useMemo, useState } from "react";
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
  UclawTask,
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

function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<SemesterWorkspace[]>([]);
  const [semester, setSemester] = useState<SemesterWorkspace | null>(null);
  const [tasksByCourse, setTasksByCourse] = useState<Record<string, UclawTask[]>>({});
  const [threads, setThreads] = useState<Thread[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [activeCourseId, setActiveCourseId] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [activeThreadId, setActiveThreadId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileRailCollapsed, setFileRailCollapsed] = useState(false);
  const [previewRailCollapsed, setPreviewRailCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [courseFilesUploadOpen, setCourseFilesUploadOpen] = useState(false);
  const [archiveError, setArchiveError] = useState("");

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!activeCourseId) return;
    void loadCourseFiles(activeCourseId);
  }, [activeCourseId]);

  const activeCourse = useMemo(() => courses.find((course) => course.id === activeCourseId) || courses[0], [courses, activeCourseId]);
  const courseTasks = activeCourse ? tasksByCourse[activeCourse.id] || [] : [];
  const activeTask = useMemo(() => courseTasks.find((task) => task.id === activeTaskId), [courseTasks, activeTaskId]);
  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId), [threads, activeThreadId]);
  const workspaceScope = useMemo(() => describeWorkspaceScope(activeCourse, activeTask, activeThread), [activeCourse, activeTask, activeThread]);

  async function bootstrap() {
    const [semesterList, currentSemester, courseList, skillList, git] = await Promise.all([
      window.uclaw.semester.list(),
      window.uclaw.semester.current(),
      window.uclaw.courses.list(),
      window.uclaw.skills.list(),
      window.uclaw.git.status(),
    ]);
    const taskEntries = await Promise.all(courseList.map(async (course) => [course.id, await window.uclaw.tasks.list(course.id)] as const));
    const threadList = await window.uclaw.threads.list();

    setSemesters(semesterList);
    setSemester(currentSemester);
    setCourses(courseList);
    setSkills(skillList);
    setGitStatus(git);
    setTasksByCourse(Object.fromEntries(taskEntries));
    setThreads(dedupeThreads(threadList));

    if (courseList.length === 0 && threadList.length === 0) {
      setActiveCourseId("");
      setActiveTaskId(undefined);
      setActiveThreadId("");
      return;
    }

    const firstThread = threadList.find((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID) || threadList[0];
    const firstCourse = firstThread ? courseList.find((course) => course.id === firstThread.courseId) : courseList[0];
    setActiveCourseId(firstCourse?.id || "");
    setActiveTaskId(firstThread?.taskId);
    setActiveThreadId(firstThread?.id || "");
  }

  async function reloadWorkspace(preferredThreadId?: string) {
    const [semesterList, currentSemester, courseList, threadList] = await Promise.all([
      window.uclaw.semester.list(),
      window.uclaw.semester.current(),
      window.uclaw.courses.list(),
      window.uclaw.threads.list(),
    ]);
    const taskEntries = await Promise.all(courseList.map(async (course) => [course.id, await window.uclaw.tasks.list(course.id)] as const));
    setSemesters(semesterList);
    setSemester(currentSemester);
    setCourses(courseList);
    setTasksByCourse(Object.fromEntries(taskEntries));
    setThreads(dedupeThreads(threadList));

    if (courseList.length === 0 && threadList.length === 0) {
      setActiveCourseId("");
      setActiveTaskId(undefined);
      setActiveThreadId("");
      setFileTree([]);
      setFileStats(null);
      setSelectedFileId("");
      setFilePreview(null);
      return;
    }

    const nextThread = (preferredThreadId && threadList.find((thread) => thread.id === preferredThreadId)) || threadList.find((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID) || threadList[0];
    const nextCourse = nextThread ? courseList.find((course) => course.id === nextThread.courseId) : courseList[0];
    setActiveCourseId(nextCourse?.id || "");
    setActiveTaskId(nextThread?.taskId);
    setActiveThreadId(nextThread?.id || "");
    if (nextCourse?.id) await loadCourseFiles(nextCourse.id);
  }

  async function selectSemester(semesterId: string) {
    const next = await window.uclaw.semester.select(semesterId);
    setSemester(next);
    await reloadWorkspace();
  }

  async function loadCourseFiles(courseId: string) {
    const [tree, stats] = await Promise.all([window.uclaw.files.tree(courseId), window.uclaw.files.stats(courseId)]);
    setFileTree(tree);
    setFileStats(stats);

    const current = selectedFileId ? findFileNode(tree, selectedFileId) : null;
    const next = current?.kind !== "folder" ? current : firstPreviewableFile(tree);
    if (next) {
      setSelectedFileId(next.id);
      setFilePreview(await window.uclaw.files.preview(next.id));
    } else {
      setSelectedFileId("");
      setFilePreview(null);
    }
  }

  async function selectFile(file: WorkspaceFileNode) {
    setSelectedFileId(file.id);
    if (file.kind === "folder") return;
    setFilePreview(await window.uclaw.files.preview(file.id));
    setPreviewRailCollapsed(false);
  }

  async function importCourseFiles(input: FileImportInput): Promise<FileImportResult | null> {
    const result = await window.uclaw.files.import(input);
    const tree =
      activeCourseId === SEMESTER_HOME_COURSE_ID
        ? await window.uclaw.files.tree(SEMESTER_HOME_COURSE_ID)
        : activeCourseId === input.courseId
          ? result.tree
          : await window.uclaw.files.tree(activeCourseId);
    setFileTree(tree);
    setFileStats(await window.uclaw.files.stats(activeCourseId));
    setFileRailCollapsed(false);

    const next = result.files.find((file) => file.kind !== "folder") || firstPreviewableFile(tree);
    if (next) {
      setSelectedFileId(next.id);
      setFilePreview(await window.uclaw.files.preview(next.id));
      setPreviewRailCollapsed(false);
    }
    return result;
  }

  async function refreshThreads(): Promise<Thread[]> {
    const next = await window.uclaw.threads.list();
    const deduped = dedupeThreads(next);
    setThreads(deduped);
    return deduped;
  }

  function threadTitleForScope(courseId: string, taskId?: string): string {
    const task = taskId ? (tasksByCourse[courseId] || []).find((item) => item.id === taskId) : undefined;
    const course = courses.find((item) => item.id === courseId);
    return task ? `${task.title} session` : course?.workspaceKind === "semester_home" ? "Home session" : "Task session";
  }

  function pickThreadAfterArchive(threadList: Thread[], archivedThread: Thread): Thread | undefined {
    return (
      threadList.find((item) => item.courseId === archivedThread.courseId && item.taskId === archivedThread.taskId) ||
      threadList.find((item) => item.courseId === SEMESTER_HOME_COURSE_ID) ||
      threadList[0]
    );
  }

  async function createThread(courseId = activeCourse?.id || "", taskId?: string) {
    if (!courseId) return;
    if (courseId !== SEMESTER_HOME_COURSE_ID && !taskId) {
      setArchiveError("Create sessions from a task, not the course container.");
      return;
    }
    setArchiveError("");
    try {
      const thread = await window.uclaw.threads.create({
        courseId,
        taskId,
        title: threadTitleForScope(courseId, taskId),
      });
      setThreads((current) => dedupeThreads([thread, ...current]));
      setActiveCourseId(thread.courseId);
      setActiveTaskId(thread.taskId);
      setActiveThreadId(thread.id);
    } catch (error) {
      setArchiveError(errorMessage(error, "Create session failed."));
    }
  }

  async function archiveThread(thread: Thread) {
    setArchiveError("");
    try {
      await window.uclaw.threads.archive(thread.id);
      const nextThreads = await refreshThreads();
      if (thread.id !== activeThreadId) return;

      const nextThread = pickThreadAfterArchive(nextThreads, thread);
      if (nextThread) {
        setActiveCourseId(nextThread.courseId);
        setActiveTaskId(nextThread.taskId);
        setActiveThreadId(nextThread.id);
        return;
      }

      const courseStillExists = courses.some((course) => course.id === thread.courseId);
      const taskStillExists = !thread.taskId || (tasksByCourse[thread.courseId] || []).some((task) => task.id === thread.taskId);
      setActiveCourseId(courseStillExists ? thread.courseId : activeCourse?.id || "");
      setActiveTaskId(courseStillExists && taskStillExists ? thread.taskId : undefined);
      setActiveThreadId("");
    } catch (error) {
      setArchiveError(errorMessage(error, "Archive session failed."));
    }
  }

  async function selectCourseHome(courseId: string) {
    setActiveCourseId(courseId);
    setActiveTaskId(undefined);
    const thread = courseId === SEMESTER_HOME_COURSE_ID ? threads.find((item) => item.courseId === courseId && !item.taskId) : undefined;
    setActiveThreadId(thread?.id || "");
  }

  async function selectTask(courseId: string, taskId: string) {
    setActiveCourseId(courseId);
    setActiveTaskId(taskId);
    const thread = threads.find((item) => item.courseId === courseId && item.taskId === taskId);
    setActiveThreadId(thread?.id || "");
  }

  function handleCourseCreated(course: Course) {
    setCourses((current) => (current.some((item) => item.id === course.id) ? current : [...current, course]));
    setTasksByCourse((current) => ({ ...current, [course.id]: current[course.id] || [] }));
    setActiveCourseId(course.id);
    setActiveTaskId(undefined);
    void selectCourseHome(course.id);
  }

  function handleTaskCreated(task: UclawTask) {
    setTasksByCourse((current) => ({
      ...current,
      [task.courseId]: [...(current[task.courseId] || []), task],
    }));
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
          onSelectTask={(courseId, taskId) => {
            void selectTask(courseId, taskId);
          }}
          onSelectThread={(thread) => {
            setActiveCourseId(thread.courseId);
            setActiveTaskId(thread.taskId);
            setActiveThreadId(thread.id);
          }}
          onArchiveThread={(thread) => {
            void archiveThread(thread);
          }}
          onCreateThread={createThread}
          onOpenCourses={() => setCoursesOpen(true)}
          onOpenTimetable={() => setTimetableOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/80 shadow-sm ring-1 ring-border/60">
          <TopBar course={activeCourse} task={activeTask} thread={activeThread} workspaceScope={workspaceScope} />
          {archiveError && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {archiveError}
            </div>
          )}

          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            {activeThread ? (
              <p>Thread: {activeThread.title}</p>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div>
                  <p className="font-medium text-foreground">{threads.length === 0 ? "No active sessions yet." : "No session selected."}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Workspace files are ready. Create a session when you want to start chatting.</p>
                </div>
                <button
                  type="button"
                  className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={(!activeCourse?.id && !semester?.id) || Boolean(activeCourse && activeCourse.workspaceKind !== "semester_home" && !activeTask)}
                  onClick={() => void createThread(activeCourse?.id || SEMESTER_HOME_COURSE_ID, activeTask?.id)}
                >
                  {activeTask ? "Create task session" : activeCourse?.workspaceKind === "semester_home" || !activeCourse ? "Create Home session" : "Select a task to create session"}
                </button>
              </div>
            )}
          </div>
        </main>

        <FileBrowserRail
          collapsed={fileRailCollapsed}
          course={activeCourse}
          stats={fileStats}
          files={fileTree}
          selectedFileId={selectedFileId}
          onSelectFile={selectFile}
          onOpenUpload={() => setCourseFilesUploadOpen(true)}
        />

        <FilePreviewRail collapsed={previewRailCollapsed} preview={filePreview} />
      </div>

      {settingsOpen && (
        <SettingsDialog
          course={activeCourse}
          semester={semester}
          skills={skills}
          gitStatus={gitStatus}
          onSkillsChange={setSkills}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {coursesOpen && (
        <CourseManagementDialog
          courses={courses.filter((course) => course.workspaceKind !== "semester_home")}
          activeCourseId={activeCourseId}
          onSelectCourse={selectCourseHome}
          onCourseCreated={handleCourseCreated}
          onTaskCreated={handleTaskCreated}
          onWorkspaceChanged={() => void reloadWorkspace()}
          onClose={() => setCoursesOpen(false)}
        />
      )}
      {timetableOpen && (
        <TimetableDialog
          course={activeCourse}
          semesters={semesters}
          onSelectSemester={(semesterId) => void selectSemester(semesterId)}
          onWorkspaceChanged={() => void reloadWorkspace()}
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

function describeWorkspaceScope(course?: Course, task?: UclawTask, thread?: Thread): string {
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
