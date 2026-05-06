import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentRunInput,
  CourseImageAnalyzeInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  ProviderDraftInput,
  RunStreamEnvelope,
  SemesterImageAnalyzeInput,
  SkillUpdateInput,
  TimetableImageAnalyzeInput,
  TimetableRangeQuery,
  UclawAPI,
} from "../types/domain";
import { IPC_CHANNELS } from "../types/ipc";

const api: UclawAPI = {
  semester: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.semesterList),
    current: () => ipcRenderer.invoke(IPC_CHANNELS.semesterCurrent),
    select: (semesterId: string) => ipcRenderer.invoke(IPC_CHANNELS.semesterSelect, semesterId),
    analyzeImage: (input: SemesterImageAnalyzeInput) => ipcRenderer.invoke(IPC_CHANNELS.semesterAnalyzeImage, input),
  },
  courses: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.coursesList),
    analyzeImage: (input: CourseImageAnalyzeInput) => ipcRenderer.invoke(IPC_CHANNELS.coursesAnalyzeImage, input),
  },
  tasks: {
    list: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksList, courseId),
    create: (input: CreateTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreate, input),
  },
  threads: {
    list: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsList, courseId),
    create: (input: CreateThreadInput) => ipcRenderer.invoke(IPC_CHANNELS.threadsCreate, input),
    messages: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsMessages, threadId),
  },
  skills: {
    list: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.skillsList, courseId),
    update: (input: SkillUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.skillsUpdate, input),
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
    index: (courseId: string, sectionId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndex, courseId, sectionId),
    indexingJobs: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndexingJobs, courseId),
    cancelIndexing: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndexingCancel, jobId),
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.providersList),
    save: (input: ProviderDraftInput) => ipcRenderer.invoke(IPC_CHANNELS.providersSave, input),
    models: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersModels, providerId),
    test: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersTest, providerId),
  },
  timetable: {
    range: (query: TimetableRangeQuery) => ipcRenderer.invoke(IPC_CHANNELS.timetableRange, query),
    analyzeImage: (input: TimetableImageAnalyzeInput) => ipcRenderer.invoke(IPC_CHANNELS.timetableAnalyzeImage, input),
  },
  context: {
    estimate: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.contextEstimate, threadId),
  },
  agent: {
    runtimeStatus: () => ipcRenderer.invoke(IPC_CHANNELS.agentRuntimeStatus),
    run: (input: AgentRunInput) => ipcRenderer.invoke(IPC_CHANNELS.agentRun, input),
    stop: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS.agentStop, runId),
    approve: (approvalId: string) => ipcRenderer.invoke(IPC_CHANNELS.agentApprove, approvalId),
    reject: (approvalId: string) => ipcRenderer.invoke(IPC_CHANNELS.agentReject, approvalId),
    respondAskUser: (requestId: string, response: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentRespondAskUser, requestId, response),
    events: (threadId: string, afterSeq?: number) => ipcRenderer.invoke(IPC_CHANNELS.agentEvents, threadId, afterSeq),
    pendingRequests: () => ipcRenderer.invoke(IPC_CHANNELS.agentPendingRequests),
    onEvent: (handler: (envelope: RunStreamEnvelope) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, envelope: RunStreamEnvelope) => handler(envelope);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, listener);
      return () => ipcRenderer.off(IPC_CHANNELS.agentEvent, listener);
    },
  },
  app: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url),
  },
};

contextBridge.exposeInMainWorld("uclaw", api);
