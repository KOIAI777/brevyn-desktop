import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  CreateSemesterInput,
  CreateCourseInput,
  UpdateCourseInput,
  ArchivedCourseScope,
  ArchivedThreadScope,
  CreateTaskInput,
  UpdateTaskInput,
  CreateThreadInput,
  RenameThreadInput,
  AgentApprovalInput,
  AgentAttachmentDataInput,
  AgentAskUserResponseInput,
  AgentExitPlanResponseInput,
  AgentRunInput,
  BrevynAgentEvent,
  FileImportInput,
  ProviderDraftInput,
  RecognizedAcademicCalendar,
  RecognizedCourseTimetable,
  VisionRecognitionInput,
  SkillImportInput,
  SkillWriteInput,
  SkillUpdateInput,
  TimetableRangeQuery,
  BrevynAPI,
} from "../types/domain";
import { IPC_CHANNELS } from "../types/ipc";

const api: BrevynAPI = {
  semester: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.semesterList),
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.semesterListArchived),
    current: () => ipcRenderer.invoke(IPC_CHANNELS.semesterCurrent),
    create: (input: CreateSemesterInput) => ipcRenderer.invoke(IPC_CHANNELS.semesterCreate, input),
    select: (semesterId: string) => ipcRenderer.invoke(IPC_CHANNELS.semesterSelect, semesterId),
    archive: (semesterId: string) => ipcRenderer.invoke(IPC_CHANNELS.semesterArchive, semesterId),
    restore: (semesterId: string) => ipcRenderer.invoke(IPC_CHANNELS.semesterRestore, semesterId),
    delete: (semesterId: string) => ipcRenderer.invoke(IPC_CHANNELS.semesterDelete, semesterId),
  },
  courses: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.coursesList),
    listArchived: (scope?: ArchivedCourseScope) => ipcRenderer.invoke(IPC_CHANNELS.coursesListArchived, scope),
    create: (input: CreateCourseInput) => ipcRenderer.invoke(IPC_CHANNELS.coursesCreate, input),
    update: (input: UpdateCourseInput) => ipcRenderer.invoke(IPC_CHANNELS.coursesUpdate, input),
    archive: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.coursesArchive, courseId),
    restore: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.coursesRestore, courseId),
    delete: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.coursesDelete, courseId),
  },
  tasks: {
    list: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksList, courseId),
    create: (input: CreateTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreate, input),
    update: (input: UpdateTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.tasksUpdate, input),
    delete: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksDelete, taskId),
  },
  threads: {
    list: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsList, courseId),
    listArchived: (scope?: ArchivedThreadScope) => ipcRenderer.invoke(IPC_CHANNELS.threadsListArchived, scope),
    create: (input: CreateThreadInput) => ipcRenderer.invoke(IPC_CHANNELS.threadsCreate, input),
    rename: (input: RenameThreadInput) => ipcRenderer.invoke(IPC_CHANNELS.threadsRename, input),
    archive: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsArchive, threadId),
    restore: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsRestore, threadId),
    delete: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsDelete, threadId),
  },
  skills: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.skillsList),
    update: (input: SkillUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.skillsUpdate, input),
    readContent: (skillId: string) => ipcRenderer.invoke(IPC_CHANNELS.skillsReadContent, skillId),
    writeContent: (input: SkillWriteInput) => ipcRenderer.invoke(IPC_CHANNELS.skillsWriteContent, input),
    importFolder: (input: SkillImportInput) => ipcRenderer.invoke(IPC_CHANNELS.skillsImportFolder, input),
    openFolder: (skillId: string) => ipcRenderer.invoke(IPC_CHANNELS.skillsOpenFolder, skillId),
  },
  rag: {
    search: (query: string, courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.ragSearch, query, courseId),
  },
  git: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.gitStatus),
  },
  files: {
    tree: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesTree, courseId),
    preview: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesPreview, fileId),
    import: (input: FileImportInput) => ipcRenderer.invoke(IPC_CHANNELS.filesImport, input),
    sections: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesSections, courseId),
    stats: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesStats, courseId),
    index: (courseId: string, sectionId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndex, courseId, sectionId),
    indexActiveSemester: () => ipcRenderer.invoke(IPC_CHANNELS.filesIndexActiveSemester),
    indexingJobs: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndexingJobs, courseId),
    cancelIndexing: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndexingCancel, jobId),
    open: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesOpen, fileId),
    rename: (input: { fileId: string; name: string }) => ipcRenderer.invoke(IPC_CHANNELS.filesRename, input),
    delete: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesDelete, fileId),
    reveal: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesReveal, fileId),
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.filesChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.filesChanged, listener);
    },
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.providersList),
    save: (input: ProviderDraftInput) => ipcRenderer.invoke(IPC_CHANNELS.providersSave, input),
    delete: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersDelete, providerId),
    decryptApiKey: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersDecryptApiKey, providerId),
    models: (input: string | ProviderDraftInput) => ipcRenderer.invoke(IPC_CHANNELS.providersModels, input),
    test: (input: string | ProviderDraftInput) => ipcRenderer.invoke(IPC_CHANNELS.providersTest, input),
  },
  vision: {
    pickImage: () => ipcRenderer.invoke(IPC_CHANNELS.visionPickImage),
    previewImage: (sourcePath: string) => ipcRenderer.invoke(IPC_CHANNELS.visionPreviewImage, sourcePath),
    recognizeAcademicCalendar: (input: VisionRecognitionInput) => ipcRenderer.invoke(IPC_CHANNELS.visionRecognizeAcademicCalendar, input),
    recognizeCourseTimetable: (input: VisionRecognitionInput) => ipcRenderer.invoke(IPC_CHANNELS.visionRecognizeCourseTimetable, input),
    importAcademicCalendar: (input: RecognizedAcademicCalendar) => ipcRenderer.invoke(IPC_CHANNELS.visionImportAcademicCalendar, input),
    importCourseTimetable: (input: RecognizedCourseTimetable) => ipcRenderer.invoke(IPC_CHANNELS.visionImportCourseTimetable, input),
  },
  timetable: {
    range: (query: TimetableRangeQuery) => ipcRenderer.invoke(IPC_CHANNELS.timetableRange, query),
  },
  agent: {
    messages: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.agentMessages, threadId),
    run: (input: AgentRunInput) => ipcRenderer.invoke(IPC_CHANNELS.agentRun, input),
    stop: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.agentStop, threadId),
    approve: (input: AgentApprovalInput) => ipcRenderer.invoke(IPC_CHANNELS.agentApprove, input),
    reject: (input: AgentApprovalInput) => ipcRenderer.invoke(IPC_CHANNELS.agentReject, input),
    answerQuestion: (input: AgentAskUserResponseInput) => ipcRenderer.invoke(IPC_CHANNELS.agentAnswerQuestion, input),
    resolveExitPlan: (input: AgentExitPlanResponseInput) => ipcRenderer.invoke(IPC_CHANNELS.agentResolveExitPlan, input),
    onEvent: (callback: (event: BrevynAgentEvent) => void) => {
      const listener = (_event: IpcRendererEvent, event: BrevynAgentEvent) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.agentEvent, listener);
    },
  },
  agentGateway: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.agentGatewayStatus),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.agentGatewaySetEnabled, enabled),
  },
  attachments: {
    pick: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsPick, threadId),
    list: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsList, threadId),
    savePaths: (input: { threadId: string; paths: string[] }) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsSavePaths, input),
    saveData: (input: AgentAttachmentDataInput) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsSaveData, input),
    delete: (input: { threadId: string; path: string }) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsDelete, input),
    pathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updaterCheck),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updaterStatus),
    listReleases: (options) => ipcRenderer.invoke(IPC_CHANNELS.updaterReleasesList, options),
    getReleaseByTag: (tag: string) => ipcRenderer.invoke(IPC_CHANNELS.updaterReleaseByTag, tag),
    onStatusChanged: (callback) => {
      const listener = (_event: IpcRendererEvent, status: Awaited<ReturnType<BrevynAPI["updater"]["getStatus"]>>) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.updaterStatusChanged, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.updaterStatusChanged, listener);
    },
    dismissDownloaded: () => ipcRenderer.invoke(IPC_CHANNELS.updaterDismissDownloaded),
    quitAndInstall: () => ipcRenderer.invoke(IPC_CHANNELS.updaterQuitAndInstall),
  },
  app: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url),
    openWorkspacePath: (input: { threadId: string; path: string }) => ipcRenderer.invoke(IPC_CHANNELS.appOpenWorkspacePath, input),
    previewWorkspacePath: (input: { threadId: string; path: string }) => ipcRenderer.invoke(IPC_CHANNELS.appPreviewWorkspacePath, input),
  },
};

contextBridge.exposeInMainWorld("brevyn", api);
