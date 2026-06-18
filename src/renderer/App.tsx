import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentAttachment, AgentPermissionMode, AppCodeThemePreference, AppTheme, AppThemeState, UserProfileSettings } from "@/types/domain";
import { CourseDashboard } from "@/components/courses/CourseDashboard";
import { SemesterDashboard } from "@/components/courses/SemesterDashboard";
import { WorkspaceOnboardingDashboard } from "@/components/courses/WorkspaceOnboardingDashboard";
import { AppTitleBar } from "@/components/shell/AppTitleBar";
import { TopBar } from "@/components/shell/TopBar";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { useAgentSessionController, type AgentRunForThreadOptions } from "@/hooks/useAgentSessionController";
import { useWorkspaceLayoutState } from "@/hooks/useWorkspaceLayoutState";
import { useWorkspaceFilesState } from "@/hooks/useWorkspaceFilesState";
import { SEMESTER_HOME_COURSE_ID, useWorkspaceSessionController } from "@/hooks/useWorkspaceSessionController";
import { useAppDialogState } from "@/hooks/useAppDialogState";
import { useWorkspacePreviewCoordinator } from "@/hooks/useWorkspacePreviewCoordinator";

const AgentThreadPanel = lazy(() => import("@/components/agent/AgentThreadPanel").then((module) => ({ default: module.AgentThreadPanel })));
const CourseManagementDialog = lazy(() => import("@/components/courses/CourseManagementDialog").then((module) => ({ default: module.CourseManagementDialog })));
const FileBrowserRail = lazy(() => import("@/components/files/FileBrowserRail").then((module) => ({ default: module.FileBrowserRail })));
const FilePreviewRail = lazy(() => import("@/components/files/FilePreviewRail").then((module) => ({ default: module.FilePreviewRail })));
const SettingsDialog = lazy(() => import("@/components/settings/SettingsDialog").then((module) => ({ default: module.SettingsDialog })));
const SourcesRail = lazy(() => import("@/components/sources/SourcesRail").then((module) => ({ default: module.SourcesRail })));
const SourceCandidateToast = lazy(() => import("@/components/sources/SourceCandidateToast").then((module) => ({ default: module.SourceCandidateToast })));
const STARTUP_SPLASH_MIN_MS = import.meta.env.DEV ? 650 : 2400;
const STARTUP_SLOW_NOTICE_MS = 8_000;

function applyAppTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function applyCodeTheme(preference: AppCodeThemePreference): void {
  document.documentElement.dataset.codeTheme = preference;
}

function applyAppThemeState(state: AppThemeState): void {
  applyAppTheme(state.effective);
  applyCodeTheme(state.codeThemePreference);
  window.localStorage.setItem("brevyn.themePreference", state.preference);
  window.localStorage.setItem("brevyn.codeThemePreference", state.codeThemePreference);
}

function preferredRendererTheme(): AppTheme {
  const cachedPreference = window.localStorage.getItem("brevyn.themePreference");
  if (cachedPreference === "light" || cachedPreference === "dark") return cachedPreference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferredRendererCodeTheme(): AppCodeThemePreference {
  const cachedPreference = window.localStorage.getItem("brevyn.codeThemePreference");
  if (cachedPreference === "brevyn" || cachedPreference === "github" || cachedPreference === "rose" || cachedPreference === "mono") return cachedPreference;
  return "brevyn";
}

function App() {
  const contentGridRef = useRef<HTMLDivElement | null>(null);
  const fileStateRef = useRef<ReturnType<typeof useWorkspaceFilesState> | null>(null);
  const agentSessionRef = useRef<ReturnType<typeof useAgentSessionController> | null>(null);
  const previewErrorTimeoutRef = useRef<number | null>(null);
  const previewErrorMessageRef = useRef("");
  const [profile, setProfile] = useState<UserProfileSettings>({ displayName: "Brevyn User", avatarId: "🧑‍💻" });
  const [themeState, setThemeState] = useState<AppThemeState>({
    preference: "system",
    effective: preferredRendererTheme(),
    codeThemePreference: preferredRendererCodeTheme(),
  });

  const dialogs = useAppDialogState();
  const layoutState = useWorkspaceLayoutState({ contentGridRef });
  const workspace = useWorkspaceSessionController({
    onClearFiles: () => fileStateRef.current?.clearFileState(),
    onReloadCourseFiles: (courseId) => {
      void fileStateRef.current?.loadCourseFiles(courseId);
    },
    onRefreshAgentProviders: () => {
      void agentSessionRef.current?.refreshProviders();
    },
  });
  const setPreviewWorkspaceError = useCallback((message: string) => {
    if (previewErrorTimeoutRef.current !== null) {
      window.clearTimeout(previewErrorTimeoutRef.current);
      previewErrorTimeoutRef.current = null;
    }
    if (!message) {
      const currentPreviewError = previewErrorMessageRef.current;
      if (currentPreviewError) {
        workspace.setWorkspaceError((current) => current === currentPreviewError ? "" : current);
        previewErrorMessageRef.current = "";
      }
      return;
    }
    previewErrorMessageRef.current = message;
    workspace.setWorkspaceError(message);
    previewErrorTimeoutRef.current = window.setTimeout(() => {
      workspace.setWorkspaceError((current) => current === message && previewErrorMessageRef.current === message ? "" : current);
      if (previewErrorMessageRef.current === message) previewErrorMessageRef.current = "";
      previewErrorTimeoutRef.current = null;
    }, 4200);
  }, [workspace.setWorkspaceError]);
  const fileState = useWorkspaceFilesState({
    semesterId: workspace.semester?.id || "",
    activeCourseId: workspace.activeCourseId,
    activeThreadId: workspace.activeThreadId,
    onError: workspace.setWorkspaceError,
    onPreviewError: setPreviewWorkspaceError,
  });
  const agentSession = useAgentSessionController({
    activeThreadId: workspace.activeThreadId,
    onThreadHasMessages: workspace.markThreadHasMessages,
    onThreadUpdated: workspace.applyThreadUpdate,
  });
  const previewCoordinator = useWorkspacePreviewCoordinator({
    setFileRailCollapsed: layoutState.setFileRailCollapsed,
    setPreviewRailCollapsed: layoutState.setPreviewRailCollapsed,
  });
  fileStateRef.current = fileState;
  agentSessionRef.current = agentSession;

  const handleThemeStateChange = useCallback((state: AppThemeState) => {
    setThemeState(state);
    applyAppThemeState(state);
  }, []);

  useLayoutEffect(() => {
    let mounted = true;
    applyAppTheme(preferredRendererTheme());
    applyCodeTheme(preferredRendererCodeTheme());
    void window.brevyn.app.theme()
      .then((state) => {
        if (!mounted) return;
        handleThemeStateChange(state);
      })
      .catch(() => undefined);
    const unsubscribe = window.brevyn.app.onThemeChanged((state) => {
      if (!mounted) return;
      handleThemeStateChange(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [handleThemeStateChange]);

  useEffect(() => () => {
    if (previewErrorTimeoutRef.current !== null) {
      window.clearTimeout(previewErrorTimeoutRef.current);
      previewErrorTimeoutRef.current = null;
    }
    previewErrorMessageRef.current = "";
  }, []);

  useEffect(() => {
    let mounted = true;
    void window.brevyn.app.profile()
      .then((nextProfile) => {
        if (mounted) setProfile(nextProfile);
      })
      .catch(() => {
        if (mounted) setProfile({ displayName: "Brevyn User", avatarId: "🧑‍💻" });
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function runAgent(prompt: string, permissionMode: AgentPermissionMode = "auto", attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]): Promise<void> {
    await agentSession.run(prompt, permissionMode, attachments, providerSelection, mentionedSkills);
  }

  async function runAgentForThread(threadId: string, prompt: string, permissionMode: AgentPermissionMode = "auto", attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[], options?: AgentRunForThreadOptions): Promise<boolean> {
    return agentSession.runForThread(threadId, prompt, permissionMode, attachments, providerSelection, mentionedSkills, options);
  }

  async function stopAgent(): Promise<void> {
    await agentSession.stop();
  }

  async function approveAgent(requestId: string): Promise<void> {
    await agentSession.approve(requestId);
  }

  async function rejectAgent(requestId: string): Promise<void> {
    await agentSession.reject(requestId);
  }

  async function answerAgentQuestion(requestId: string, answers: Record<string, string>): Promise<void> {
    await agentSession.answerQuestion(requestId, answers);
  }

  async function resolveAgentExitPlan(requestId: string, decision: "approve" | "deny", feedback?: string): Promise<void> {
    await agentSession.resolveExitPlan(requestId, decision, feedback);
  }

  async function selectAgentProvider(providerSelection: string) {
    agentSession.selectProvider(providerSelection);
  }

  const openHomeSession = useCallback(() => {
    const homeThread = [...workspace.threads]
      .filter((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID && !thread.taskId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    if (homeThread) {
      workspace.selectThread(homeThread);
      return;
    }
    void workspace.createThread(SEMESTER_HOME_COURSE_ID);
  }, [workspace.createThread, workspace.selectThread, workspace.threads]);

  const previewInlineFilePath = useCallback(async (filePath: string): Promise<void> => {
    previewCoordinator.revealSelectedFile("file");
    await fileState.previewWorkspacePath(filePath);
  }, [fileState.previewWorkspacePath, previewCoordinator]);
  const workspaceBooting = workspace.bootState === "loading";
  const showWorkspaceOnboarding = !workspaceBooting && (workspace.noActiveSemesters || workspace.needsSemesterSelection);

  useEffect(() => {
    if (workspace.bootState === "loading") {
      const timeout = window.setTimeout(() => {
        document.getElementById("brevyn-startup-splash")?.setAttribute("data-slow", "true");
      }, STARTUP_SLOW_NOTICE_MS);
      return () => window.clearTimeout(timeout);
    }
    const splash = document.getElementById("brevyn-startup-splash");
    if (!splash) return;
    const removeSplash = () => splash.remove();
    const hideSplash = () => {
      splash.dataset.state = "leaving";
      window.setTimeout(removeSplash, 320);
    };
    if (workspace.bootState === "error") {
      hideSplash();
      return;
    }
    const shownAt = typeof window.__BREVYN_STARTUP_SPLASH_SHOWN_AT__ === "number" ? window.__BREVYN_STARTUP_SPLASH_SHOWN_AT__ : Date.now();
    const delay = Math.max(0, STARTUP_SPLASH_MIN_MS - (Date.now() - shownAt));
    let firstFrame = 0;
    let secondFrame = 0;
    const timeout = window.setTimeout(() => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(hideSplash);
      });
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [workspace.bootState]);

  if (workspace.bootState === "error") {
    return <AppBootErrorScreen error={workspace.bootError} onRetry={() => void workspace.bootstrap()} />;
  }

  if (workspace.bootState === "loading") {
    return null;
  }

  return (
    <div className="brevyn-app-background flex h-full min-h-0 flex-col text-foreground">
      <AppTitleBar
        semester={workspace.semester}
        fileRailCollapsed={layoutState.fileRailCollapsed}
        previewRailCollapsed={layoutState.previewRailCollapsed}
        sourcesRailCollapsed={layoutState.sourcesRailCollapsed}
        onToggleFileRail={() => layoutState.setFileRailCollapsed((value) => !value)}
        onTogglePreviewRail={() => layoutState.setPreviewRailCollapsed((value) => !value)}
        onToggleSourcesRail={() => layoutState.setSourcesRailCollapsed((value) => !value)}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <WorkspaceSidebar
          collapsed={layoutState.sidebarCollapsed}
          width={layoutState.sidebarWidth}
          resizing={layoutState.sidebarResizing}
          profile={profile}
          courses={workspace.courses}
          tasksByCourse={workspace.tasksByCourse}
          threads={workspace.threads}
          activeCourseId={workspace.activeCourseId}
          activeTaskId={workspace.activeTask?.id}
          activeThreadId={workspace.activeThreadId}
          onToggle={() => layoutState.setSidebarCollapsed((value) => !value)}
          onSelectHome={workspace.selectCourseHome}
          onSelectTask={workspace.selectTask}
          onSelectThread={workspace.selectThread}
          onArchiveThread={(thread) => {
            void workspace.archiveThread(thread);
          }}
          onArchiveTask={workspace.archiveTask}
          emptyThreadIds={workspace.emptyThreadIds}
          onRenameThread={workspace.renameThread}
          onCreateThread={workspace.createThread}
          onOpenCourses={dialogs.openCourses}
          onOpenSettings={() => dialogs.openSettings()}
          onResizeStart={layoutState.startSidebarResize}
        />

        <div
          ref={contentGridRef}
          className={`grid min-w-0 flex-1 gap-0 ${layoutState.resizingRail || layoutState.windowResizing ? "" : "transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"}`}
          style={{ gridTemplateColumns: layoutState.contentGridColumns }}
        >
          <main className="brevyn-panel-surface relative flex min-w-0 max-w-full flex-col overflow-hidden">
            <TopBar course={workspace.activeCourse} task={workspace.activeTask} thread={workspace.activeThread} workspaceScope={workspace.workspaceScope} />
            <Suspense fallback={null}>
              <SourceCandidateToast
                course={workspace.activeCourse}
                activeTask={workspace.activeTask}
                activeThreadId={workspace.activeThreadId}
              />
            </Suspense>
            {workspace.workspaceError && (
              <div className="border-b border-[hsl(var(--status-warning)/0.22)] bg-[hsl(var(--status-warning)/0.11)] px-4 py-2 text-xs text-[hsl(var(--status-warning))]">
                {workspace.workspaceError}
              </div>
            )}

            <div className={`min-h-0 min-w-0 flex-1 overflow-hidden ${workspace.activeThread || (workspace.activeCourse && !workspace.activeTask) || showWorkspaceOnboarding ? "flex" : "flex items-center justify-center text-sm text-muted-foreground"}`}>
              {workspace.activeThread ? (
                <Suspense fallback={<PanelWarmupFallback label="Opening session" />}>
                  <AgentThreadPanel
                    thread={workspace.activeThread}
                    records={agentSession.records}
                    loading={agentSession.loading}
                    running={agentSession.running}
                    error={agentSession.error}
                    onRun={runAgent}
                    onRunForThread={runAgentForThread}
                    onStop={stopAgent}
                    onApprove={approveAgent}
                    onReject={rejectAgent}
                    onAnswerQuestion={answerAgentQuestion}
                    onResolveExitPlan={resolveAgentExitPlan}
                    agentProviders={agentSession.providers}
                    activeProviderId={agentSession.selectedProviderId}
                    onSelectProvider={selectAgentProvider}
                    files={fileState.fileTree}
                    skills={workspace.skills}
                    onPreviewFilePath={previewInlineFilePath}
                  />
                </Suspense>
              ) : workspace.activeCourse?.workspaceKind === "semester_home" ? (
                <SemesterDashboard
                  semester={workspace.semester}
                  homeCourse={workspace.activeCourse}
                  courses={workspace.courses}
                  tasksByCourse={workspace.tasksByCourse}
                  threads={workspace.threads}
                  stats={fileState.fileStats}
                  files={fileState.fileTree}
                  onOpenHomeSession={openHomeSession}
                  onOpenCourses={dialogs.openCourses}
                  onWorkspaceChanged={async () => {
                    await workspace.reloadWorkspace();
                  }}
                  onSelectCourse={workspace.selectCourseHome}
                  onSelectTask={workspace.selectTask}
                />
              ) : workspace.activeCourse?.workspaceKind === "course" && !workspace.activeTask ? (
                <CourseDashboard
                  course={workspace.activeCourse}
                  semester={workspace.semester}
                  tasks={workspace.tasksByCourse[workspace.activeCourse.id] || []}
                  threads={workspace.threads}
                  stats={fileState.fileStats}
                  files={fileState.fileTree}
                  onOpenTasks={dialogs.openCourses}
                  onSelectTask={workspace.selectTask}
                  onCreateThread={workspace.createThread}
                />
              ) : showWorkspaceOnboarding ? (
                <WorkspaceOnboardingDashboard
                  mode={workspace.needsSemesterSelection ? "select-semester" : "no-semester"}
                  semesters={workspace.semesters}
                  onSelectSemester={workspace.selectSemester}
                  onOpenSemesterSettings={() => dialogs.openSettings("semesters")}
                  onOpenArchive={() => dialogs.openSettings("archive")}
                  onWorkspaceChanged={async () => {
                    await workspace.reloadWorkspace();
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div>
                    <p className="font-medium text-foreground">{workspace.threads.length === 0 ? "No active sessions yet." : "No session selected."}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Workspace files are ready. Create a session when you want to start chatting.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-[var(--radius-control)] bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-black/[0.05] transition hover:bg-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={(!workspace.activeCourse?.id && !workspace.semester?.id) || Boolean(workspace.activeCourse && !workspace.activeTask)}
                    onClick={() => {
                      void workspace.createThread(workspace.activeCourse?.id || SEMESTER_HOME_COURSE_ID, workspace.activeTask?.id);
                    }}
                  >
                    {workspace.activeTask ? "Create task session" : !workspace.activeCourse ? "创建学期会话" : "Select a task to create session"}
                  </button>
                </div>
              )}
            </div>
          </main>

          <Suspense fallback={<RailWarmupFallback collapsed={layoutState.sourcesRailCollapsed} />}>
            <SourcesRail
              collapsed={layoutState.sourcesRailCollapsed}
              semester={workspace.semester}
              course={workspace.activeCourse}
              activeTask={workspace.activeTask}
              files={fileState.fileTree}
              onPreviewFile={(file) => {
                previewCoordinator.revealSelectedFile("file");
                void fileState.selectFile(file);
              }}
              resizing={layoutState.resizingRail === "sources"}
              onResizeStart={(event) => layoutState.startRailResize("sources", event)}
            />
          </Suspense>

          <Suspense fallback={<RailWarmupFallback collapsed={layoutState.previewRailCollapsed} />}>
            <FilePreviewRail
              collapsed={layoutState.previewRailCollapsed}
              preview={fileState.filePreview}
              loading={fileState.filePreviewLoading}
              resizing={layoutState.resizingRail === "preview"}
              onResizeStart={(event) => layoutState.startRailResize("preview", event)}
            />
          </Suspense>

          <Suspense fallback={<RailWarmupFallback collapsed={layoutState.fileRailCollapsed} />}>
            <FileBrowserRail
              collapsed={layoutState.fileRailCollapsed}
              course={workspace.activeCourse}
              activeTask={workspace.activeTask}
              stats={fileState.fileStats}
              files={fileState.fileTree}
              sessionFiles={fileState.sessionFiles}
              loading={fileState.filesLoading}
              selectedFileId={fileState.selectedFileId}
              onSelectFile={(file) => {
                previewCoordinator.revealSelectedFile(file.kind === "folder" ? "folder" : "file");
                void fileState.selectFile(file);
              }}
              onSelectSessionFile={(file) => {
                if (file.kind !== "folder") previewCoordinator.revealSelectedFile("file");
                void fileState.selectSessionFile(file);
              }}
              onOpenUpload={() => {
                if (workspace.activeCourse?.archivedAt) return;
                dialogs.openCourses();
              }}
              resizing={layoutState.resizingRail === "files"}
              onResizeStart={(event) => layoutState.startRailResize("files", event)}
            />
          </Suspense>
        </div>
      </div>

      {dialogs.settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog
            initialPage={dialogs.settingsInitialPage}
            course={workspace.activeCourse}
            semester={workspace.semester}
            profile={profile}
            themeState={themeState}
            skills={workspace.skills}
            gitStatus={workspace.gitStatus}
            onProfileChange={setProfile}
            onThemeStateChange={handleThemeStateChange}
            onSkillsChange={workspace.setSkills}
            onWorkspaceChanged={async () => {
              await workspace.reloadWorkspace(workspace.activeThreadId);
              await agentSession.refreshProviders();
            }}
            onSelectSemester={workspace.selectSemester}
            onAgentProviderChanged={(providerSelection) => agentSession.refreshProviders(providerSelection)}
            onClose={() => {
              dialogs.closeSettings();
              void agentSession.refreshProviders();
            }}
          />
        </Suspense>
      )}
      {dialogs.coursesOpen && (
        <Suspense fallback={null}>
          <CourseManagementDialog
            semester={workspace.semester}
            courses={workspace.courses}
            activeCourseId={workspace.activeCourseId}
            onCourseCreated={workspace.handleCourseCreated}
            onCourseUpdated={workspace.handleCourseUpdated}
            onTaskCreated={workspace.handleTaskCreated}
            onTaskUpdated={workspace.handleTaskUpdated}
            onWorkspaceChanged={async () => {
              await workspace.reloadWorkspace();
            }}
            onClose={dialogs.closeCourses}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;

function PanelWarmupFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-foreground">
      <div className="flex items-center gap-2 rounded-[var(--radius-control)] bg-background/72 px-3 py-2 text-xs text-muted-foreground shadow-sm ring-1 ring-black/[0.04] dark:bg-white/[0.045] dark:ring-white/[0.06]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function RailWarmupFallback({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return <aside className="min-w-0 overflow-hidden" />;
  return (
    <aside className="brevyn-panel-surface min-w-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col p-3">
        <div className="h-4 w-20 rounded-full bg-muted/60" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-4/5 rounded-full bg-muted/45" />
          <div className="h-3 w-3/5 rounded-full bg-muted/35" />
        </div>
      </div>
    </aside>
  );
}

function AppBootErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="brevyn-app-background flex h-full min-h-screen items-center justify-center px-6 text-foreground">
      <div className="brevyn-window-surface w-full max-w-md p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertCircle className="h-4 w-4 text-[hsl(var(--status-warning))]" />
          Failed to load workspace
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Brevyn could not finish startup. Try again, and if it keeps happening we will need the error text below.
        </p>
        <div className="mt-4 rounded-[var(--radius-control)] bg-muted/35 px-3 py-2 text-[11px] leading-5 text-muted-foreground shadow-inner ring-1 ring-black/[0.04]">
          {error || "Unknown startup error."}
        </div>
        <button
          type="button"
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 active:scale-[0.98]"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    </div>
  );
}
