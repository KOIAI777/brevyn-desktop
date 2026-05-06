import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type {
  AgentRunInput,
  CourseImageAnalyzeInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  ProviderDraftInput,
  SemesterImageAnalyzeInput,
  SkillUpdateInput,
  TimetableImageAnalyzeInput,
  TimetableRangeQuery,
} from "../types/domain";
import { IPC_CHANNELS } from "../types/ipc";
import { AgentOrchestrator } from "./services/agent-orchestrator";
import { LocalStore } from "./services/local-store";

export function registerIpcHandlers(store: LocalStore, agent: AgentOrchestrator): void {
  ipcMain.handle(IPC_CHANNELS.semesterList, () => store.listSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterCurrent, () => store.currentSemester());
  ipcMain.handle(IPC_CHANNELS.semesterSelect, (_event, semesterId: string) => store.selectSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterAnalyzeImage, (_event, input: SemesterImageAnalyzeInput) =>
    store.analyzeSemesterImage(input),
  );
  ipcMain.handle(IPC_CHANNELS.coursesList, () => store.listCourses());
  ipcMain.handle(IPC_CHANNELS.coursesAnalyzeImage, (_event, input: CourseImageAnalyzeInput) =>
    store.analyzeCourseImage(input),
  );
  ipcMain.handle(IPC_CHANNELS.tasksList, (_event, courseId: string) => store.listTasks(courseId));
  ipcMain.handle(IPC_CHANNELS.tasksCreate, (_event, input: CreateTaskInput) => store.createTask(input));
  ipcMain.handle(IPC_CHANNELS.threadsList, (_event, courseId?: string) => store.listThreads(courseId));
  ipcMain.handle(IPC_CHANNELS.threadsCreate, (_event, input: CreateThreadInput) => store.createThread(input));
  ipcMain.handle(IPC_CHANNELS.threadsMessages, (_event, threadId: string) => store.messages(threadId));
  ipcMain.handle(IPC_CHANNELS.skillsList, () => store.listSkills());
  ipcMain.handle(IPC_CHANNELS.skillsUpdate, (_event, input: SkillUpdateInput) => store.updateSkill(input));
  ipcMain.handle(IPC_CHANNELS.ragSearch, (_event, query: string, courseId?: string) => store.searchRag(query, courseId));
  ipcMain.handle(IPC_CHANNELS.gitStatus, () => store.gitStatus());
  ipcMain.handle(IPC_CHANNELS.filesTree, (_event, courseId?: string) => store.listFiles(courseId));
  ipcMain.handle(IPC_CHANNELS.filesPreview, (_event, fileId: string) => store.previewFile(fileId));
  ipcMain.handle(IPC_CHANNELS.filesImport, async (event, input: FileImportInput) => {
    let sourcePaths = input.sourcePaths || [];
    if (sourcePaths.length === 0) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = {
        title: "Import course files",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Course files", extensions: ["pdf", "docx", "ppt", "pptx", "png", "jpg", "jpeg", "md", "txt", "ts", "tsx", "js", "jsx", "py", "java", "cpp", "c", "zip"] },
          { name: "All files", extensions: ["*"] },
        ],
      };
      const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
      if (result.canceled) {
        return { files: [], tree: store.listFiles(input.courseId), indexingJob: null };
      }
      sourcePaths = result.filePaths;
    }
    return store.importFiles({ ...input, sourcePaths });
  });
  ipcMain.handle(IPC_CHANNELS.filesSections, (_event, courseId: string) => store.courseFileSections(courseId));
  ipcMain.handle(IPC_CHANNELS.filesIndex, (_event, courseId: string, sectionId?: string) =>
    store.indexCourseFiles(courseId, sectionId),
  );
  ipcMain.handle(IPC_CHANNELS.filesIndexingJobs, (_event, courseId?: string) => store.listIndexingJobs(courseId));
  ipcMain.handle(IPC_CHANNELS.filesIndexingCancel, (_event, jobId: string) => store.cancelIndexingJob(jobId));
  ipcMain.handle(IPC_CHANNELS.providersList, () => store.listProviders());
  ipcMain.handle(IPC_CHANNELS.providersSave, (_event, input: ProviderDraftInput) => store.saveProvider(input));
  ipcMain.handle(IPC_CHANNELS.providersModels, (_event, providerId: string) => store.providerModels(providerId));
  ipcMain.handle(IPC_CHANNELS.providersTest, (_event, providerId: string) => store.testProvider(providerId));
  ipcMain.handle(IPC_CHANNELS.timetableRange, (_event, query: TimetableRangeQuery) => store.listTimetableEvents(query));
  ipcMain.handle(IPC_CHANNELS.timetableAnalyzeImage, (_event, input: TimetableImageAnalyzeInput) =>
    store.analyzeTimetableImage(input),
  );
  ipcMain.handle(IPC_CHANNELS.contextEstimate, (_event, threadId: string) => store.contextReport(threadId));
  ipcMain.handle(IPC_CHANNELS.agentRun, (_event, input: AgentRunInput) => agent.run(input));
  ipcMain.handle(IPC_CHANNELS.agentStop, (_event, runId: string) => agent.stop(runId));
  ipcMain.handle(IPC_CHANNELS.agentApprove, (_event, approvalId: string) => agent.approve(approvalId));
  ipcMain.handle(IPC_CHANNELS.agentReject, (_event, approvalId: string) => agent.reject(approvalId));
  ipcMain.handle(IPC_CHANNELS.agentRespondAskUser, (_event, requestId: string, response: string) =>
    agent.respondAskUser(requestId, response),
  );
  ipcMain.handle(IPC_CHANNELS.agentEvents, (_event, threadId: string, afterSeq?: number) =>
    agent.events(threadId, afterSeq),
  );
  ipcMain.handle(IPC_CHANNELS.agentPendingRequests, () => agent.pendingRequests());
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, (_event, url: string) => shell.openExternal(url));
}
