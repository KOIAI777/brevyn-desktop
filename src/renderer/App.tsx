import { AlertCircle, Archive, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  Course,
  AgentAttachment,
  FileImportInput,
  FileImportResult,
  FilePreview,
  FileStats,
  GitStatus,
  ModelProviderConfig,
  ProviderDraftInput,
  SemesterWorkspace,
  SkillItem,
  Thread,
  BrevynAgentSessionRecord,
  BrevynAgentTimelineRecord,
  BrevynTask,
  WorkspaceFileNode,
} from "@/types/domain";
import { AgentThreadPanel } from "@/components/agent/AgentThreadPanel";
import { CourseManagementDialog } from "@/components/courses/CourseManagementDialog";
import { CourseFilesUploadDialog } from "@/components/files/CourseFilesUploadDialog";
import { FileBrowserRail } from "@/components/files/FileBrowserRail";
import { FilePreviewRail } from "@/components/files/FilePreviewRail";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { AppTitleBar } from "@/components/shell/AppTitleBar";
import { TopBar } from "@/components/shell/TopBar";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { TimetableDialog } from "@/components/timetable/TimetableDialog";
import { findFileNode, findFileNodeByPath, firstPreviewableFile } from "@/lib/workspace-files";

const SEMESTER_HOME_COURSE_ID = "semester-home";
type SettingsPage = "providers" | "archive" | "skills" | "about";
type ResizableRail = "files" | "preview";

const CHAT_MIN_WIDTH = 520;
const SIDEBAR_WIDTH_STORAGE_KEY = "brevyn.sidebar.width";
const SIDEBAR_WIDTH = { min: 240, default: 340, max: 520 } as const;
const RAIL_WIDTHS = {
  files: { min: 260, renderMin: 220, default: 320 },
  preview: { min: 320, renderMin: 240, default: 440 },
} as const;

function App() {
  const mountedRef = useRef(true);
  const activeCourseIdRef = useRef("");
  const selectedFileIdRef = useRef("");
  const activeThreadIdRef = useRef("");
  const fileTreeRef = useRef<WorkspaceFileNode[]>([]);
  const fileLoadRequestRef = useRef(0);
  const filePreviewRequestRef = useRef(0);
  const pendingWriteToolPathsRef = useRef<Map<string, string>>(new Map());
  const workspaceReloadRequestRef = useRef(0);
  const agentLoadRequestRef = useRef(0);
  const contentGridRef = useRef<HTMLDivElement | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<SemesterWorkspace[]>([]);
  const [semester, setSemester] = useState<SemesterWorkspace | null>(null);
  const [tasksByCourse, setTasksByCourse] = useState<Record<string, BrevynTask[]>>({});
  const [threads, setThreads] = useState<Thread[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [sessionFiles, setSessionFiles] = useState<WorkspaceFileNode[]>([]);
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [filePreviewLoading, setFilePreviewLoading] = useState(false);
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
  const [agentRecords, setAgentRecords] = useState<BrevynAgentTimelineRecord[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentProviders, setAgentProviders] = useState<ModelProviderConfig[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readStoredSidebarWidth());
  const emptyThreadIds = useMemo(() => new Set(threads.filter(isDraftThread).map((thread) => thread.id)), [threads]);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [fileRailWidth, setFileRailWidth] = useState<number>(RAIL_WIDTHS.files.default);
  const [previewRailWidth, setPreviewRailWidth] = useState<number>(RAIL_WIDTHS.preview.default);
  const [resizingRail, setResizingRail] = useState<ResizableRail | null>(null);
  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number; element: HTMLElement } | null>(null);
  const sidebarResizeFrameRef = useRef<number | null>(null);
  const sidebarResizePointerXRef = useRef(0);
  const resizeStateRef = useRef<{ rail: ResizableRail; startX: number; startWidth: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizePointerXRef = useRef(0);
  const railWidthsRef = useRef<{ files: number; preview: number }>({ files: RAIL_WIDTHS.files.default, preview: RAIL_WIDTHS.preview.default });

  activeCourseIdRef.current = activeCourseId;
  selectedFileIdRef.current = selectedFileId;
  activeThreadIdRef.current = activeThreadId;
  fileTreeRef.current = fileTree;
  railWidthsRef.current = { files: fileRailWidth, preview: previewRailWidth };

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
      fileTreeRef.current = [];
      setFileTree([]);
      setFileStats(null);
      commitSelectedFileId("");
      setFilePreview(null);
      setFilePreviewLoading(false);
      return;
    }
    void loadCourseFiles(activeCourseId);
  }, [activeCourseId]);

  useEffect(() => {
    const unsubscribe = window.brevyn.files.onChanged(() => {
      const activeCourseId = activeCourseIdRef.current;
      if (activeCourseId) void loadCourseFiles(activeCourseId);
      const activeThreadId = activeThreadIdRef.current;
      if (activeThreadId) void loadSessionFiles(activeThreadId);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.brevyn.agent.onEvent((event) => {
      const eventThreadId = event.kind === "sdk_message"
        ? event.threadId
        : event.event.type === "approval_requested"
          ? event.event.request.threadId
          : event.event.type === "ask_user_requested"
            ? event.event.request.threadId
          : event.event.type === "exit_plan_requested"
            ? event.event.request.threadId
            : event.event.threadId;
      if (!eventThreadId || eventThreadId !== activeThreadIdRef.current) return;
      if (event.kind === "sdk_message") {
        rememberWriteToolPaths(event.message, pendingWriteToolPathsRef.current);
        const completedWritePaths = completedWriteToolPaths(event.message, pendingWriteToolPathsRef.current);
        for (const path of completedWritePaths) scheduleWorkspacePathPreview(path);
        markThreadHasMessages(eventThreadId);
        setAgentRecords((current) => [...current, event.message]);
        if (event.message.type === "result") {
          setAgentRunning(false);
          const subtype = String((event.message as { subtype?: unknown }).subtype || "");
          if (subtype && subtype !== "success" && subtype !== "stopped_by_user" && subtype !== "interrupted") {
            setAgentError(resultErrorMessage(event.message));
          }
        }
        return;
      }
      setAgentRecords((current) => [...current, { kind: "runtime", event: event.event }]);
      if (event.event.type === "run_started") {
        setAgentRunning(true);
        setAgentError("");
      } else if (isTerminalRunEvent(event.event.type)) {
        setAgentRunning(false);
        if (event.event.type === "run_failed") setAgentError(event.event.error);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      agentLoadRequestRef.current += 1;
      setAgentRecords([]);
      setSessionFiles([]);
      setAgentLoading(false);
      setAgentRunning(false);
      setAgentError("");
      return;
    }
    void loadAgentMessages(activeThreadId);
    void loadSessionFiles(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    if (!resizingRail) return;
    function applyResize(clientX: number) {
      const state = resizeStateRef.current;
      if (!state) return;
      const config = RAIL_WIDTHS[state.rail];
      const gridWidth = contentGridRef.current?.getBoundingClientRect().width || window.innerWidth;
      const otherRailWidth = state.rail === "files"
        ? (previewRailCollapsed ? 0 : railWidthsRef.current.preview)
        : (fileRailCollapsed ? 0 : railWidthsRef.current.files);
      const gridGapWidth = otherRailWidth > 0 ? 16 : 8;
      const availableMax = gridWidth - otherRailWidth - gridGapWidth - CHAT_MIN_WIDTH;
      const maxWidth = Math.max(config.min, availableMax);
      const nextWidth = clamp(state.startWidth - (clientX - state.startX), config.min, maxWidth);
      railWidthsRef.current = { ...railWidthsRef.current, [state.rail]: nextWidth };
      if (contentGridRef.current) {
        contentGridRef.current.style.gridTemplateColumns = gridColumnsForWidths(
          fileRailCollapsed,
          previewRailCollapsed,
          state.rail === "files" ? nextWidth : railWidthsRef.current.files,
          state.rail === "preview" ? nextWidth : railWidthsRef.current.preview,
        );
      }
      return nextWidth;
    }
    function handlePointerMove(event: PointerEvent) {
      resizePointerXRef.current = event.clientX;
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applyResize(resizePointerXRef.current);
      });
    }
    function handlePointerUp() {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      const nextWidth = applyResize(resizePointerXRef.current);
      if (resizeStateRef.current?.rail === "files" && typeof nextWidth === "number") setFileRailWidth(nextWidth);
      if (resizeStateRef.current?.rail === "preview" && typeof nextWidth === "number") setPreviewRailWidth(nextWidth);
      resizeStateRef.current = null;
      setResizingRail(null);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [fileRailCollapsed, previewRailCollapsed, resizingRail]);

  useEffect(() => {
    if (!sidebarResizing) return;
    function applyResize(clientX: number) {
      const state = sidebarResizeStateRef.current;
      if (!state) return;
      const availableMax = window.innerWidth - CHAT_MIN_WIDTH - 48;
      const maxWidth = Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, availableMax));
      const nextWidth = clamp(state.startWidth + clientX - state.startX, SIDEBAR_WIDTH.min, maxWidth);
      state.element.style.width = `${nextWidth}px`;
      return nextWidth;
    }
    function handlePointerMove(event: PointerEvent) {
      sidebarResizePointerXRef.current = event.clientX;
      if (sidebarResizeFrameRef.current !== null) return;
      sidebarResizeFrameRef.current = window.requestAnimationFrame(() => {
        sidebarResizeFrameRef.current = null;
        applyResize(sidebarResizePointerXRef.current);
      });
    }
    function handlePointerUp() {
      if (sidebarResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(sidebarResizeFrameRef.current);
        sidebarResizeFrameRef.current = null;
      }
      const nextWidth = applyResize(sidebarResizePointerXRef.current);
      if (typeof nextWidth === "number") {
        setSidebarWidth(nextWidth);
        storeSidebarWidth(nextWidth);
      }
      sidebarResizeStateRef.current = null;
      setSidebarResizing(false);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (sidebarResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(sidebarResizeFrameRef.current);
        sidebarResizeFrameRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [sidebarResizing]);

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
    fileTreeRef.current = [];
    setFileTree([]);
    setFileStats(null);
    commitSelectedFileId("");
    setFilePreview(null);
    setFilePreviewLoading(false);
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
      const visibleThreads = await ensureHomeThread(filterThreadsForSemester(dedupeThreads(threadList), currentSemester?.id), currentSemester?.id, courseList);
      if (!mountedRef.current || isCancelled()) return;
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
      void refreshAgentProviders();
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

      const visibleThreads = await ensureHomeThread(filterThreadsForSemester(dedupeThreads(threadList), currentSemester?.id), currentSemester?.id, courseList);
      if (!mountedRef.current || workspaceReloadRequestRef.current !== requestId) return false;
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
      fileTreeRef.current = tree;
      setFileTree(tree);
      setFileStats(stats);
      commitSelectedFileId(next?.id || "");

      const previewRequestId = filePreviewRequestRef.current + 1;
      filePreviewRequestRef.current = previewRequestId;
      let preview: FilePreview | null = null;
      setFilePreviewLoading(Boolean(next));
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
      setFilePreview(preview);
      setFilePreviewLoading(false);
      return true;
    } catch (error) {
      if (isLatestFileLoad(requestId, courseId)) {
        setWorkspaceError(errorMessage(error, "Failed to load course files."));
        fileTreeRef.current = [];
        setFileTree([]);
        setFileStats(null);
        commitSelectedFileId("");
        setFilePreview(null);
        setFilePreviewLoading(false);
      }
      return false;
    } finally {
      if (fileLoadRequestRef.current === requestId) setFilesLoading(false);
    }
  }

  async function loadSessionFiles(threadId: string): Promise<void> {
    try {
      const files = await window.brevyn.attachments.list(threadId);
      if (!mountedRef.current || activeThreadIdRef.current !== threadId) return;
      setSessionFiles(files);
    } catch (error) {
      if (mountedRef.current && activeThreadIdRef.current === threadId) {
        setWorkspaceError(errorMessage(error, "Failed to load session files."));
      }
    }
  }

  async function selectFile(file: WorkspaceFileNode) {
    const requestId = filePreviewRequestRef.current + 1;
    filePreviewRequestRef.current = requestId;
    commitSelectedFileId(file.id);
    setWorkspaceError("");
    if (file.kind === "folder") {
      setFilePreview(null);
      setFilePreviewLoading(false);
      setFileRailCollapsed(false);
      return;
    }
    setPreviewRailCollapsed(false);
    setFilePreview(null);
    setFilePreviewLoading(true);
    try {
      const preview = await window.brevyn.files.preview(file.id);
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId || selectedFileIdRef.current !== file.id) return;
      setFilePreview(preview);
      setFilePreviewLoading(false);
    } catch (error) {
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId) return;
      setFilePreview(null);
      setFilePreviewLoading(false);
      setWorkspaceError(errorMessage(error, "Failed to preview file."));
    }
  }

  async function selectSessionFile(file: WorkspaceFileNode) {
    const sourcePath = file.sourcePath || file.path;
    if (file.kind === "folder") {
      commitSelectedFileId(file.id);
      setFilePreview(null);
      setFilePreviewLoading(false);
      return;
    }
    const requestId = filePreviewRequestRef.current + 1;
    filePreviewRequestRef.current = requestId;
    commitSelectedFileId(file.id);
    setWorkspaceError("");
    setPreviewRailCollapsed(false);
    setFilePreview(null);
    setFilePreviewLoading(true);
    try {
      const preview = activeThreadIdRef.current
        ? await window.brevyn.app.previewWorkspacePath({ threadId: activeThreadIdRef.current, path: sourcePath })
        : null;
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId || selectedFileIdRef.current !== file.id) return;
      setFilePreview(preview);
      setFilePreviewLoading(false);
    } catch (error) {
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId) return;
      setFilePreview(null);
      setFilePreviewLoading(false);
      setWorkspaceError(errorMessage(error, "Failed to preview session file."));
    }
  }

  function scheduleWorkspacePathPreview(filePath: string) {
    if (!filePath.trim()) return;
    for (const delay of [420, 900]) {
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        void previewWorkspacePath(filePath, { silent: true });
      }, delay);
    }
  }

  async function previewWorkspacePath(filePath: string, options: { silent?: boolean } = {}) {
    const courseId = activeCourseIdRef.current;
    let nextFile = findFileNodeByPath(fileTreeRef.current, filePath);
    if (!nextFile && courseId) {
      try {
        const latestTree = await window.brevyn.files.tree(courseId);
        if (!mountedRef.current || activeCourseIdRef.current !== courseId) return;
        setFileTree(latestTree);
        fileTreeRef.current = latestTree;
        nextFile = findFileNodeByPath(latestTree, filePath);
      } catch (error) {
        if (mountedRef.current && !options.silent) setWorkspaceError(errorMessage(error, "Failed to refresh files before preview."));
        return;
      }
    }
    if (!nextFile) {
      if (!activeThreadIdRef.current) {
        if (!options.silent) setWorkspaceError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
        return;
      }
      try {
        const preview = await window.brevyn.app.previewWorkspacePath({ threadId: activeThreadIdRef.current, path: filePath });
        if (!preview) {
          if (!options.silent) setWorkspaceError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
          return;
        }
        setPreviewRailCollapsed(false);
        commitSelectedFileId(preview.id);
        setFilePreview(preview);
        setFilePreviewLoading(false);
      } catch (error) {
        if (!options.silent) setWorkspaceError(errorMessage(error, "Failed to preview workspace file."));
      }
      return;
    }
    await selectFile(nextFile);
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
      fileTreeRef.current = result.tree;
      setFileTree(result.tree);
      setFileStats(stats);
      setFileRailCollapsed(false);
      commitSelectedFileId(next?.id || "");
      if (next) {
        setPreviewRailCollapsed(false);
        setFilePreview(null);
        setFilePreviewLoading(true);
      } else {
        setFilePreview(null);
        setFilePreviewLoading(false);
      }
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

      setFilePreview(preview);
      setFilePreviewLoading(false);
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
      if (mountedRef.current) {
        setThreads(deduped);
      }
      return deduped;
    } catch (error) {
      if (mountedRef.current) setWorkspaceError(errorMessage(error, "Failed to refresh sessions."));
      throw error;
    }
  }

  async function loadAgentMessages(threadId: string): Promise<boolean> {
    const requestId = agentLoadRequestRef.current + 1;
    agentLoadRequestRef.current = requestId;
    setAgentLoading(true);
    setAgentError("");
    try {
      const records = await window.brevyn.agent.messages(threadId);
      if (!mountedRef.current || agentLoadRequestRef.current !== requestId || activeThreadIdRef.current !== threadId) return false;
      setAgentRecords(records);
      setAgentRunning(hasOpenAgentRun(records));
      return true;
    } catch (error) {
      if (mountedRef.current && agentLoadRequestRef.current === requestId) {
        setAgentError(errorMessage(error, "Failed to load agent timeline."));
        setAgentRecords([]);
        setAgentRunning(false);
      }
      return false;
    } finally {
      if (agentLoadRequestRef.current === requestId) setAgentLoading(false);
    }
  }

  async function runAgent(prompt: string, mode: "execute" | "plan" = "execute", permissionMode: "review" | "full_access" = "review", attachments?: AgentAttachment[]): Promise<void> {
    if (!activeThreadId) return;
    setAgentError("");
    setAgentRunning(true);
    markThreadHasMessages(activeThreadId);
    try {
      await window.brevyn.agent.run({ threadId: activeThreadId, prompt, mode, permissionMode, attachments });
    } catch (error) {
      setAgentRunning(false);
      setAgentError(errorMessage(error, "Failed to start agent run."));
    }
  }

  function markThreadHasMessages(threadId: string) {
    const timestamp = new Date().toISOString();
    setThreads((current) => current.map((thread) => {
      if (thread.id !== threadId) return thread;
      return {
        ...thread,
        isDraft: false,
        messageCount: Math.max(1, thread.messageCount || 0),
        lastMessageAt: thread.lastMessageAt || timestamp,
        updatedAt: timestamp,
      };
    }));
  }

  async function stopAgent(): Promise<void> {
    if (!activeThreadId) return;
    try {
      await window.brevyn.agent.stop(activeThreadId);
      setAgentRunning(false);
    } catch (error) {
      setAgentError(errorMessage(error, "Failed to stop agent run."));
    }
  }

  async function approveAgent(requestId: string): Promise<void> {
    if (!activeThreadId) return;
    try {
      await window.brevyn.agent.approve({ threadId: activeThreadId, requestId });
    } catch (error) {
      setAgentError(errorMessage(error, "Failed to approve tool call."));
    }
  }

  async function rejectAgent(requestId: string): Promise<void> {
    if (!activeThreadId) return;
    try {
      await window.brevyn.agent.reject({ threadId: activeThreadId, requestId });
    } catch (error) {
      setAgentError(errorMessage(error, "Failed to deny tool call."));
    }
  }

  async function answerAgentQuestion(requestId: string, answers: Record<string, string>): Promise<void> {
    if (!activeThreadId) return;
    try {
      await window.brevyn.agent.answerQuestion({ threadId: activeThreadId, requestId, answers });
    } catch (error) {
      setAgentError(errorMessage(error, "Failed to answer agent question."));
    }
  }

  async function resolveAgentExitPlan(requestId: string, decision: "approve" | "deny", feedback?: string): Promise<void> {
    if (!activeThreadId) return;
    try {
      await window.brevyn.agent.resolveExitPlan({ threadId: activeThreadId, requestId, decision, feedback });
    } catch (error) {
      setAgentError(errorMessage(error, "Failed to resolve plan request."));
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
      const emptyThread = findEmptyThreadForScope(courseId, taskId);
      if (emptyThread) {
        commitActiveCourseId(emptyThread.courseId);
        setActiveTaskId(emptyThread.taskId);
        setActiveThreadId(emptyThread.id);
        return;
      }
      const thread = await window.brevyn.threads.create({
        courseId,
        taskId,
        title: threadTitleForScope(courseId, taskId),
        isDraft: true,
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

  function findEmptyThreadForScope(courseId: string, taskId?: string): Thread | undefined {
    const candidates = threads.filter((thread) => threadBelongsToSemester(thread, semester?.id) && thread.courseId === courseId && (thread.taskId || undefined) === (taskId || undefined));
    return [...candidates].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).find(isDraftThread);
  }

  async function archiveThread(thread: Thread) {
    setWorkspaceError("");
    try {
      if (isDraftThread(thread)) {
        setWorkspaceError("空会话不需要归档；继续使用它，或者等有内容后再归档。");
        return;
      }
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

  async function renameThread(thread: Thread, title: string): Promise<void> {
    setWorkspaceError("");
    try {
      const updated = await window.brevyn.threads.rename({ threadId: thread.id, title });
      setThreads((current) => dedupeThreads(current.map((item) => (item.id === updated.id ? updated : item))));
    } catch (error) {
      setWorkspaceError(errorMessage(error, "Rename session failed."));
      throw error;
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

  async function refreshAgentProviders() {
    try {
      const providers = await window.brevyn.providers.list();
      if (!mountedRef.current) return;
      setAgentProviders(providers.filter((provider) => provider.purpose === "agent"));
    } catch {
      if (mountedRef.current) setAgentProviders([]);
    }
  }

  async function selectAgentProvider(providerId: string) {
    const provider = agentProviders.find((item) => item.id === providerId);
    if (!provider || provider.enabled) return;
    setWorkspaceError("");
    try {
      await window.brevyn.providers.save(providerDraftForActivation(provider));
      await refreshAgentProviders();
    } catch (error) {
      if (mountedRef.current) setWorkspaceError(errorMessage(error, "Failed to switch agent model."));
    }
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

  function startRailResize(rail: ResizableRail, event: ReactPointerEvent) {
    const startWidth = rail === "files" ? fileRailWidth : previewRailWidth;
    resizeStateRef.current = { rail, startX: event.clientX, startWidth };
    resizePointerXRef.current = event.clientX;
    setResizingRail(rail);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function startSidebarResize(event: ReactPointerEvent) {
    if (sidebarCollapsed) return;
    const element = event.currentTarget.closest("[data-workspace-sidebar]");
    if (!(element instanceof HTMLElement)) return;
    sidebarResizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth, element };
    sidebarResizePointerXRef.current = event.clientX;
    setSidebarResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  const contentGridColumns = gridColumnsForWidths(fileRailCollapsed, previewRailCollapsed, fileRailWidth, previewRailWidth);

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
          width={sidebarWidth}
          resizing={sidebarResizing}
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
          emptyThreadIds={emptyThreadIds}
          onRenameThread={renameThread}
          onCreateThread={createThread}
          onOpenCourses={() => setCoursesOpen(true)}
          onOpenTimetable={() => setTimetableOpen(true)}
          onOpenSettings={() => openSettings("providers")}
          onResizeStart={startSidebarResize}
        />

        <div
          ref={contentGridRef}
          className={`grid min-w-0 flex-1 gap-2 ${resizingRail ? "" : "transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"}`}
          style={{ gridTemplateColumns: contentGridColumns }}
        >
          <main className="flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border bg-card/80 shadow-sm ring-1 ring-border/60">
            <TopBar course={activeCourse} task={activeTask} thread={activeThread} workspaceScope={workspaceScope} />
            {workspaceError && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                {workspaceError}
              </div>
            )}

            <div className={`min-h-0 flex-1 ${activeThread ? "flex" : "flex items-center justify-center text-sm text-muted-foreground"}`}>
              {activeThread ? (
                <AgentThreadPanel
                  thread={activeThread}
                  records={agentRecords}
                  loading={agentLoading}
                  running={agentRunning}
                  error={agentError}
                  onRun={runAgent}
                  onStop={stopAgent}
                  onApprove={approveAgent}
                  onReject={rejectAgent}
                  onAnswerQuestion={answerAgentQuestion}
                  onResolveExitPlan={resolveAgentExitPlan}
                  agentProviders={agentProviders}
                  activeProviderId={activeAgentProviderId(agentProviders)}
                  onSelectProvider={selectAgentProvider}
                  files={fileTree}
                  onPreviewFilePath={previewWorkspacePath}
                />
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

          <FilePreviewRail
            collapsed={previewRailCollapsed}
            preview={filePreview}
            loading={filePreviewLoading}
            resizing={resizingRail === "preview"}
            onResizeStart={(event) => startRailResize("preview", event)}
          />

          <FileBrowserRail
            collapsed={fileRailCollapsed}
            course={activeCourse}
            stats={fileStats}
            files={fileTree}
            sessionFiles={sessionFiles}
            loading={filesLoading}
            selectedFileId={selectedFileId}
            onSelectFile={selectFile}
            onSelectSessionFile={selectSessionFile}
            onOpenUpload={() => {
              if (activeCourse?.archivedAt) return;
              setCourseFilesUploadOpen(true);
            }}
            resizing={resizingRail === "files"}
            onResizeStart={(event) => startRailResize("files", event)}
          />
        </div>
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
            await refreshAgentProviders();
          }}
          onClose={() => {
            setSettingsOpen(false);
            void refreshAgentProviders();
          }}
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

function resultErrorMessage(message: BrevynAgentSessionRecord): string {
  const errors = (message as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }
  const result = (message as { result?: unknown }).result;
  if (typeof result === "string" && result.trim()) return result;
  return "Agent run failed.";
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

function isDraftThread(thread: Thread): boolean {
  return Boolean(thread.isDraft);
}

async function ensureHomeThread(threads: Thread[], semesterId: string | undefined, courses: Course[]): Promise<Thread[]> {
  if (!semesterId || !courses.some((course) => course.id === SEMESTER_HOME_COURSE_ID)) return threads;
  if (threads.some((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID && !thread.taskId)) return threads;
  try {
    const thread = await window.brevyn.threads.create({
      courseId: SEMESTER_HOME_COURSE_ID,
      title: "Home TaskAgent",
      isDraft: true,
    });
    if (!threadBelongsToSemester(thread, semesterId)) return threads;
    return dedupeThreads([thread, ...threads]);
  } catch {
    return threads;
  }
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

  const homeThread = validThreadSelection(threads.find((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID && !thread.taskId), courses, tasksByCourse);
  if (homeThread) return homeThread;

  if (courses.some((course) => course.id === SEMESTER_HOME_COURSE_ID)) {
    return { courseId: SEMESTER_HOME_COURSE_ID, taskId: undefined, threadId: "" };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStoredSidebarWidth(): number {
  try {
    const value = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) ? clamp(value, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max) : SIDEBAR_WIDTH.default;
  } catch {
    return SIDEBAR_WIDTH.default;
  }
}

function storeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Non-critical preference storage can fail in restricted environments.
  }
}

function gridColumnsForWidths(fileRailCollapsed: boolean, previewRailCollapsed: boolean, fileRailWidth: number, previewRailWidth: number): string {
  return `minmax(${CHAT_MIN_WIDTH}px, 1fr) ${railColumn(previewRailCollapsed, previewRailWidth, RAIL_WIDTHS.preview.renderMin)} ${railColumn(fileRailCollapsed, fileRailWidth, RAIL_WIDTHS.files.renderMin)}`;
}

function railColumn(collapsed: boolean, width: number, renderMin: number): string {
  if (collapsed) return "0px";
  return `minmax(${Math.min(renderMin, width)}px, ${width}px)`;
}

function activeAgentProviderId(providers: ModelProviderConfig[]): string {
  return providers.find((provider) => provider.enabled)?.id || "";
}

function providerDraftForActivation(provider: ModelProviderConfig): ProviderDraftInput {
  return {
    id: provider.id,
    purpose: provider.purpose,
    providerKind: provider.providerKind,
    name: provider.name,
    protocol: provider.protocol,
    authMode: provider.authMode,
    baseUrl: provider.baseUrl,
    apiKey: "",
    clearApiKey: false,
    models: provider.models.map((model) => ({ ...model })),
    selectedModel: provider.selectedModel,
    enabled: true,
  };
}

function isTerminalRunEvent(type: string): boolean {
  return type === "run_completed" || type === "run_stopped" || type === "run_failed" || type === "run_interrupted";
}

function hasOpenAgentRun(records: BrevynAgentTimelineRecord[]): boolean {
  const terminalRunIds = new Set<string>();
  for (const record of records) {
    if (!isAgentRuntimeRecord(record)) continue;
    if (isTerminalRunEvent(record.event.type) && "runId" in record.event) terminalRunIds.add(record.event.runId);
  }
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || !isAgentRuntimeRecord(record)) continue;
    if (record.event.type === "run_started" && !terminalRunIds.has(record.event.runId)) return true;
  }
  return false;
}

function isAgentRuntimeRecord(record: BrevynAgentTimelineRecord): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

const WRITE_PREVIEW_TOOL_NAMES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

function rememberWriteToolPaths(message: unknown, pending: Map<string, string>): void {
  const record = objectValue(message);
  if (record.type !== "assistant") return;
  for (const block of messageContentBlocks(record)) {
    const data = objectValue(block);
    if (data.type !== "tool_use") continue;
    const toolName = stringValue(data.name);
    if (!WRITE_PREVIEW_TOOL_NAMES.has(toolName)) continue;
    const path = toolInputPath(data.input);
    const id = stringValue(data.id);
    if (id && path) pending.set(id, path);
  }
}

function completedWriteToolPaths(message: unknown, pending: Map<string, string>): string[] {
  const record = objectValue(message);
  if (record.type !== "user") return [];
  const paths: string[] = [];
  for (const block of messageContentBlocks(record)) {
    const data = objectValue(block);
    if (data.type !== "tool_result") continue;
    const id = stringValue(data.tool_use_id);
    if (!id || !pending.has(id)) continue;
    const path = pending.get(id) || "";
    pending.delete(id);
    if (data.is_error === true) continue;
    if (path) paths.push(path);
  }
  return paths;
}

function messageContentBlocks(record: Record<string, unknown>): unknown[] {
  const envelope = objectValue(record.message);
  return Array.isArray(envelope.content) ? envelope.content : [];
}

function toolInputPath(input: unknown): string {
  const data = objectValue(input);
  return stringValue(data.file_path) || stringValue(data.filePath) || stringValue(data.path) || stringValue(data.notebook_path);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
