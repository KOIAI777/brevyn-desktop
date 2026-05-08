import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type {
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  ProviderDraftInput,
  SkillImportInput,
  SkillWriteInput,
  SkillUpdateInput,
  TimetableRangeQuery,
} from "../types/domain";
import { IPC_CHANNELS } from "../types/ipc";
import type { IndexingQueueService } from "./indexing";
import { LocalStore } from "./services/local-store";

export function registerIpcHandlers(store: LocalStore, indexingQueue?: IndexingQueueService): void {
  ipcMain.handle(IPC_CHANNELS.semesterList, () => store.listSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterListArchived, () => store.listArchivedSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterCurrent, () => store.currentSemester());
  ipcMain.handle(IPC_CHANNELS.semesterCreate, (_event, input: CreateSemesterInput) => store.createSemester(input));
  ipcMain.handle(IPC_CHANNELS.semesterSelect, (_event, semesterId: string) => store.selectSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterArchive, (_event, semesterId: string) => store.archiveSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterRestore, (_event, semesterId: string) => store.restoreSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterDelete, (_event, semesterId: string) => store.deleteSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.coursesList, () => store.listCourses());
  ipcMain.handle(IPC_CHANNELS.coursesListArchived, () => store.listArchivedCourses());
  ipcMain.handle(IPC_CHANNELS.coursesCreate, (_event, input: CreateCourseInput) => store.createCourse(input));
  ipcMain.handle(IPC_CHANNELS.coursesArchive, (_event, courseId: string) => store.archiveCourse(courseId));
  ipcMain.handle(IPC_CHANNELS.coursesRestore, (_event, courseId: string) => store.restoreCourse(courseId));
  ipcMain.handle(IPC_CHANNELS.coursesDelete, (_event, courseId: string) => store.deleteCourse(courseId));
  ipcMain.handle(IPC_CHANNELS.tasksList, (_event, courseId: string) => store.listTasks(courseId));
  ipcMain.handle(IPC_CHANNELS.tasksCreate, (_event, input: CreateTaskInput) => store.createTask(input));
  ipcMain.handle(IPC_CHANNELS.threadsList, (_event, courseId?: string) => store.listThreads(courseId));
  ipcMain.handle(IPC_CHANNELS.threadsCreate, (_event, input: CreateThreadInput) => store.createThread(input));
  ipcMain.handle(IPC_CHANNELS.threadsArchive, (_event, threadId: string) => store.archiveThread(threadId));
  ipcMain.handle(IPC_CHANNELS.skillsList, () => store.listSkills());
  ipcMain.handle(IPC_CHANNELS.skillsUpdate, (_event, input: SkillUpdateInput) => store.updateSkill(input));
  ipcMain.handle(IPC_CHANNELS.skillsReadContent, (_event, skillId: string) => store.readSkillContent(skillId));
  ipcMain.handle(IPC_CHANNELS.skillsWriteContent, (_event, input: SkillWriteInput) => store.writeSkillContent(input));
  ipcMain.handle(IPC_CHANNELS.skillsImportFolder, async (event, input: SkillImportInput) => {
    let sourcePath = input.sourcePath?.trim();
    if (!sourcePath) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = {
        title: "Import skill folder",
        properties: ["openDirectory"],
      };
      const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) {
        throw new Error("Skill import was cancelled.");
      }
      sourcePath = result.filePaths[0];
    }
    return store.importSkillFolder({ ...input, sourcePath });
  });
  ipcMain.handle(IPC_CHANNELS.skillsOpenFolder, async (_event, skillId: string) => {
    const result = await shell.openPath(store.skillFolderPath(skillId));
    if (result) throw new Error(result);
  });
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
    const result = store.importFiles({ ...input, sourcePaths });
    if (result.indexingJob) indexingQueue?.poke();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.filesSections, (_event, courseId: string) => store.courseFileSections(courseId));
  ipcMain.handle(IPC_CHANNELS.filesStats, (_event, courseId?: string) => store.fileStats(courseId));
  ipcMain.handle(IPC_CHANNELS.filesIndex, (_event, courseId: string, sectionId?: string) => {
    const job = store.indexCourseFiles(courseId, sectionId);
    indexingQueue?.poke();
    return job;
  });
  ipcMain.handle(IPC_CHANNELS.filesIndexingJobs, (_event, courseId?: string) => store.listIndexingJobs(courseId));
  ipcMain.handle(IPC_CHANNELS.filesIndexingCancel, (_event, jobId: string) => store.cancelIndexingJob(jobId));
  ipcMain.handle(IPC_CHANNELS.filesDelete, (_event, fileId: string) => store.deleteFile(fileId));
  ipcMain.handle(IPC_CHANNELS.filesReveal, async (_event, fileId: string) => {
    const sourcePath = store.fileSourcePath(fileId);
    if (!sourcePath) throw new Error("File source path not available.");
    shell.showItemInFolder(sourcePath);
  });
  ipcMain.handle(IPC_CHANNELS.providersList, () => store.listProviders());
  ipcMain.handle(IPC_CHANNELS.providersSave, (_event, input: ProviderDraftInput) => store.saveProvider(input));
  ipcMain.handle(IPC_CHANNELS.providersDelete, (_event, providerId: string) => store.deleteProvider(providerId));
  ipcMain.handle(IPC_CHANNELS.providersModels, (_event, providerId: string) => store.providerModels(providerId));
  ipcMain.handle(IPC_CHANNELS.providersTest, (_event, providerId: string) => store.testProvider(providerId));
  ipcMain.handle(IPC_CHANNELS.timetableRange, (_event, query: TimetableRangeQuery) => store.listTimetableEvents(query));
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, (_event, url: string) => shell.openExternal(url));
}
