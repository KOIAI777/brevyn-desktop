import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateSemesterInput,
  CreateCourseInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  ProviderDraftInput,
  SkillImportInput,
  SkillWriteInput,
  SkillUpdateInput,
  TimetableRangeQuery,
  UclawAPI,
} from "../types/domain";
import { IPC_CHANNELS } from "../types/ipc";

const api: UclawAPI = {
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
    listArchived: () => ipcRenderer.invoke(IPC_CHANNELS.coursesListArchived),
    create: (input: CreateCourseInput) => ipcRenderer.invoke(IPC_CHANNELS.coursesCreate, input),
    archive: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.coursesArchive, courseId),
    restore: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.coursesRestore, courseId),
    delete: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.coursesDelete, courseId),
  },
  tasks: {
    list: (courseId: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksList, courseId),
    create: (input: CreateTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreate, input),
    delete: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksDelete, taskId),
  },
  threads: {
    list: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsList, courseId),
    listArchived: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.threadsListArchived, courseId),
    create: (input: CreateThreadInput) => ipcRenderer.invoke(IPC_CHANNELS.threadsCreate, input),
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
    indexingJobs: (courseId?: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndexingJobs, courseId),
    cancelIndexing: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesIndexingCancel, jobId),
    delete: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesDelete, fileId),
    reveal: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.filesReveal, fileId),
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.providersList),
    save: (input: ProviderDraftInput) => ipcRenderer.invoke(IPC_CHANNELS.providersSave, input),
    delete: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersDelete, providerId),
    models: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersModels, providerId),
    test: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.providersTest, providerId),
  },
  timetable: {
    range: (query: TimetableRangeQuery) => ipcRenderer.invoke(IPC_CHANNELS.timetableRange, query),
  },
  app: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url),
  },
};

contextBridge.exposeInMainWorld("uclaw", api);
