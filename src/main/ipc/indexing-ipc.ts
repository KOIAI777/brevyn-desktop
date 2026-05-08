import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { optionalString, requireString } from "./validation";

export function registerIndexingIpc({ store, indexingQueue }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.filesIndex, (_event, courseId: unknown, sectionId?: unknown) => {
    const job = store.indexCourseFiles(requireString(courseId, "Course id"), optionalString(sectionId));
    indexingQueue?.poke();
    return job;
  });
  ipcMain.handle(IPC_CHANNELS.filesIndexActiveSemester, () => {
    const result = store.indexActiveSemesterCourses();
    if (result.jobs.length > 0) indexingQueue?.poke();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.filesIndexingJobs, (_event, courseId?: unknown) => store.listIndexingJobs(optionalString(courseId)));
  ipcMain.handle(IPC_CHANNELS.filesIndexingCancel, (_event, jobId: unknown) => store.cancelIndexingJob(requireString(jobId, "Indexing job id")));
  ipcMain.handle(IPC_CHANNELS.ragSearch, (_event, query: unknown, courseId?: unknown) => store.searchRag(requireString(query, "RAG query"), optionalString(courseId)));
}
