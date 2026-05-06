import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  ContextWindowReport,
  Course,
  AgentRuntimeStatus,
  FileImportInput,
  FileImportResult,
  FilePreview,
  GitStatus,
  PermissionMode,
  RunStatus,
  RunStreamEnvelope,
  SemesterWorkspace,
  SkillItem,
  TaskAgentTimelineItem,
  Thread,
  UclawRunStreamItem,
  UclawTask,
  WorkspaceFileNode,
} from "@/types/domain";
import { Composer } from "@/components/chat/Composer";
import { EmptyThreadPanel } from "@/components/chat/EmptyThreadPanel";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TaskAgentTimeline } from "@/components/chat/TaskAgentTimeline";
import { CourseManagementDialog } from "@/components/courses/CourseManagementDialog";
import { CourseFilesUploadDialog } from "@/components/files/CourseFilesUploadDialog";
import { FileBrowserRail } from "@/components/files/FileBrowserRail";
import { FilePreviewRail } from "@/components/files/FilePreviewRail";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { AppTitleBar } from "@/components/shell/AppTitleBar";
import { TopBar } from "@/components/shell/TopBar";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { TimetableDialog } from "@/components/timetable/TimetableDialog";
import { isRunning } from "@/lib/run-status";
import { mergeTimelineItem, normalizeTimelineItem } from "@/lib/timeline";
import { findFileNode, firstPreviewableFile } from "@/lib/workspace-files";

const SEMESTER_HOME_COURSE_ID = "semester-home";

function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<SemesterWorkspace[]>([]);
  const [semester, setSemester] = useState<SemesterWorkspace | null>(null);
  const [tasksByCourse, setTasksByCourse] = useState<Record<string, UclawTask[]>>({});
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [agentRuntimeStatus, setAgentRuntimeStatus] = useState<AgentRuntimeStatus | null>(null);
  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [contextReport, setContextReport] = useState<ContextWindowReport | null>(null);
  const [activeCourseId, setActiveCourseId] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [activeThreadId, setActiveThreadId] = useState("");
  const [composer, setComposer] = useState("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("review");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileRailCollapsed, setFileRailCollapsed] = useState(false);
  const [previewRailCollapsed, setPreviewRailCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [courseFilesUploadOpen, setCourseFilesUploadOpen] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [activeRunId, setActiveRunId] = useState("");
  const [liveTimeline, setLiveTimeline] = useState<TaskAgentTimelineItem[]>([]);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const liveTimelineRef = useRef<TaskAgentTimelineItem[]>([]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadThread(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeCourseId) return;
    void loadCourseFiles(activeCourseId);
  }, [activeCourseId]);

  useEffect(() => {
    const off = window.uclaw.agent.onEvent((envelope) => {
      handleRunEnvelope(envelope);
    });
    return off;
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveTimeline.length, runStatus]);

  useEffect(() => {
    liveTimelineRef.current = liveTimeline;
  }, [liveTimeline]);

  const activeCourse = useMemo(() => courses.find((course) => course.id === activeCourseId) || courses[0], [courses, activeCourseId]);
  const courseTasks = activeCourse ? tasksByCourse[activeCourse.id] || [] : [];
  const activeTask = useMemo(() => courseTasks.find((task) => task.id === activeTaskId), [courseTasks, activeTaskId]);
  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId), [threads, activeThreadId]);

  async function bootstrap() {
    const [semesterList, currentSemester, courseList, skillList, git, runtime] = await Promise.all([
      window.uclaw.semester.list(),
      window.uclaw.semester.current(),
      window.uclaw.courses.list(),
      window.uclaw.skills.list(),
      window.uclaw.git.status(),
      window.uclaw.agent.runtimeStatus(),
    ]);
    const taskEntries = await Promise.all(courseList.map(async (course) => [course.id, await window.uclaw.tasks.list(course.id)] as const));
    const threadList = await window.uclaw.threads.list();

    setSemesters(semesterList);
    setSemester(currentSemester);
    setCourses(courseList);
    setSkills(skillList);
    setGitStatus(git);
    setAgentRuntimeStatus(runtime);
    setTasksByCourse(Object.fromEntries(taskEntries));
    setThreads(threadList);

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
    setThreads(threadList);

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
    const tree = await window.uclaw.files.tree(courseId);
    setFileTree(tree);

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
    setFileRailCollapsed(false);

    const next = result.files.find((file) => file.kind !== "folder") || firstPreviewableFile(tree);
    if (next) {
      setSelectedFileId(next.id);
      setFilePreview(await window.uclaw.files.preview(next.id));
      setPreviewRailCollapsed(false);
    }
    return result;
  }

  async function loadThread(threadId: string) {
    const [threadMessages, context, replayedEvents] = await Promise.all([
      window.uclaw.threads.messages(threadId),
      window.uclaw.context.estimate(threadId),
      window.uclaw.agent.events(threadId),
    ]);
    setMessages(threadMessages);
    setContextReport(context);

    const selected = threads.find((thread) => thread.id === threadId);
    if (selected) {
      setRunStatus(selected.latestRunStatus || "idle");
      setActiveCourseId(selected.courseId);
      setActiveTaskId(selected.taskId);
    }

    const replayStatus = selected?.latestRunStatus || replayedEvents[replayedEvents.length - 1]?.status || "idle";
    if (isRunning(replayStatus)) {
      const lastRunId = replayedEvents[replayedEvents.length - 1]?.runId;
      const latestRunEvents = lastRunId ? replayedEvents.filter((item) => item.runId === lastRunId) : replayedEvents;
      const replayTimeline = latestRunEvents.reduce<TaskAgentTimelineItem[]>((current, item) => {
        const timelineItem = normalizeTimelineItem(item);
        return timelineItem ? mergeTimelineItem(current, timelineItem) : current;
      }, []);
      setLiveTimeline(replayTimeline);
      const latest = latestRunEvents[latestRunEvents.length - 1];
      if (latest?.runId) setActiveRunId(latest.runId);
      if (latest?.status) setRunStatus(latest.status);
    } else {
      setLiveTimeline([]);
    }
    setTimelineCollapsed(false);
  }

  function handleRunEnvelope(envelope: RunStreamEnvelope) {
    if (envelope.event !== "uclaw_run_item") return;

    const item = envelope.data as UclawRunStreamItem;
    if (item.threadId !== activeThreadId) {
      patchThreadRuntime(item);
      return;
    }

    patchThreadRuntime(item);
    if (item.status) setRunStatus(item.status);
    if (item.runId) setActiveRunId(item.runId);
    if (item.context) setContextReport(item.context);

    const timelineItem = normalizeTimelineItem(item);
    if (timelineItem) {
      setLiveTimeline((current) => mergeTimelineItem(current, timelineItem));
    }

    if (item.type === "turn_started" && item.messageId) {
      setMessages((current) =>
        current.some((message) => message.id === item.messageId)
          ? current
          : [
              ...current,
              {
                id: item.messageId || "",
                threadId: item.threadId,
                role: "assistant",
                content: "",
                createdAt: item.createdAt,
              },
            ],
      );
    }

    if (item.type === "assistant_message_delta" && item.messageId) {
      setTimelineCollapsed(true);
      setMessages((current) =>
        current.map((message) =>
          message.id === item.messageId
            ? {
                ...message,
                content: `${message.content}${item.delta || ""}`,
                timeline: liveTimelineRef.current.length > 0 ? liveTimelineRef.current : message.timeline,
              }
            : message,
        ),
      );
    }

    if (item.type === "assistant_message_done" && item.messageId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === item.messageId
            ? {
                ...message,
                content: item.content || message.content,
                timeline: liveTimelineRef.current,
              }
            : message,
        ),
      );
      setTimelineCollapsed(true);
      void refreshThreads();
    }
  }

  function patchThreadRuntime(item: UclawRunStreamItem) {
    const status = item.status;
    if (!status) return;

    setThreads((current) =>
      current.map((thread) =>
        thread.id === item.threadId
          ? {
              ...thread,
              latestRunStatus: status,
              latestEventSeq: item.seq,
              pendingApprovalCount:
                item.type === "tool_approval_resolved"
                  ? 0
                  : status === "waiting_approval"
                    ? 1
                    : ["completed", "failed", "cancelled"].includes(status)
                      ? 0
                      : thread.pendingApprovalCount,
              updatedAt: item.createdAt,
            }
          : thread,
      ),
    );
  }

  async function refreshThreads() {
    const next = await window.uclaw.threads.list();
    setThreads(next);
  }

  async function createThread(courseId = activeCourse?.id || "", taskId?: string) {
    if (!courseId) return;
    const task = taskId ? (tasksByCourse[courseId] || []).find((item) => item.id === taskId) : undefined;
    const course = courses.find((item) => item.id === courseId);

    const thread = await window.uclaw.threads.create({
      courseId,
      taskId,
      title: task ? `${task.title} session` : course?.workspaceKind === "semester_home" ? "Home TaskAgent session" : "Course home session",
    });
    setThreads((current) => [thread, ...current]);
    setActiveCourseId(thread.courseId);
    setActiveTaskId(thread.taskId);
    setActiveThreadId(thread.id);
  }

  async function selectCourseHome(courseId: string) {
    setActiveCourseId(courseId);
    setActiveTaskId(undefined);
    const thread = threads.find((item) => item.courseId === courseId && !item.taskId);
    if (thread) {
      setActiveThreadId(thread.id);
      return;
    }
    await createThread(courseId);
  }

  async function selectTask(courseId: string, taskId: string) {
    setActiveCourseId(courseId);
    setActiveTaskId(taskId);
    const thread = threads.find((item) => item.courseId === courseId && item.taskId === taskId);
    if (thread) {
      setActiveThreadId(thread.id);
      return;
    }
    await createThread(courseId, taskId);
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

  async function handleSemesterUpdated(_semester: SemesterWorkspace) {
    await reloadWorkspace();
  }

  async function sendMessage() {
    const text = composer.trim();
    if (!text || !activeThreadId || isRunning(runStatus)) return;

    const localUser: ChatMessage = {
      id: `local-${Date.now()}`,
      threadId: activeThreadId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, localUser]);
    setComposer("");
    setLiveTimeline([]);
    setRunStatus("queued");

    const { runId } = await window.uclaw.agent.run({
      threadId: activeThreadId,
      message: text,
      permissionMode,
    });
    setActiveRunId(runId);
  }

  async function stopRun() {
    if (!activeRunId) return;
    setRunStatus("cancelling");
    await window.uclaw.agent.stop(activeRunId);
  }

  async function approveTool(approvalId: string) {
    if (!approvalId) return;
    await window.uclaw.agent.approve(approvalId);
  }

  async function rejectTool(approvalId: string) {
    if (!approvalId) return;
    await window.uclaw.agent.reject(approvalId);
  }

  async function respondAskUser(requestId: string, response: string) {
    if (!requestId || !response.trim()) return;
    await window.uclaw.agent.respondAskUser(requestId, response.trim());
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
          activeTaskId={activeTaskId}
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
          onCreateThread={createThread}
          onOpenCourses={() => setCoursesOpen(true)}
          onOpenTimetable={() => setTimetableOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/80 shadow-sm ring-1 ring-border/60">
          <TopBar course={activeCourse} task={activeTask} thread={activeThread} />

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col bg-card/70">
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 uclaw-scrollbar">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  {messages.length === 0 && (
                    <EmptyThreadPanel
                      course={activeCourse}
                      task={activeTask}
                      runtimeStatus={agentRuntimeStatus}
                      onOpenSettings={() => setSettingsOpen(true)}
                    />
                  )}
                  <TaskAgentTimeline
                    items={liveTimeline}
                    runStatus={runStatus}
                    collapsed={timelineCollapsed}
                    onToggle={() => setTimelineCollapsed((value) => !value)}
                    onApprove={(approvalId) => void approveTool(approvalId)}
                    onReject={(approvalId) => void rejectTool(approvalId)}
                    onAskUserResponse={(requestId, response) => void respondAskUser(requestId, response)}
                  />
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <Composer
                value={composer}
                disabled={!activeThreadId || isRunning(runStatus) || agentRuntimeStatus?.configured === false}
                placeholder={
                  agentRuntimeStatus?.configured === false
                    ? "Configure an OpenAI API key before starting a real Agent run..."
                    : "Ask about this course, search materials, plan a draft, or request a file/Git action..."
                }
                runStatus={runStatus}
                permissionMode={permissionMode}
                contextReport={contextReport}
                onChange={setComposer}
                onPermissionModeChange={setPermissionMode}
                onSend={sendMessage}
                onStop={stopRun}
              />
            </section>
          </div>
        </main>

        <FileBrowserRail
          collapsed={fileRailCollapsed}
          course={activeCourse}
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
          semesters={semesters}
          skills={skills}
          gitStatus={gitStatus}
          agentRuntimeStatus={agentRuntimeStatus}
          onSelectSemester={(semesterId) => void selectSemester(semesterId)}
          onSkillsChange={setSkills}
          onAgentRuntimeStatusChange={setAgentRuntimeStatus}
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
          onClose={() => setCoursesOpen(false)}
        />
      )}
      {timetableOpen && <TimetableDialog course={activeCourse} onSemesterUpdated={handleSemesterUpdated} onClose={() => setTimetableOpen(false)} />}
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
