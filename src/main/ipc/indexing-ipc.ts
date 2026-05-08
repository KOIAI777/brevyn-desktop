import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerIndexingIpc({ store, indexingQueue }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.filesIndex, (_event, courseId: string, sectionId?: string) => {
    const job = store.indexCourseFiles(courseId, sectionId);
    indexingQueue?.poke();
    return job;
  });
  ipcMain.handle(IPC_CHANNELS.filesIndexingJobs, (_event, courseId?: string) => store.listIndexingJobs(courseId));
  ipcMain.handle(IPC_CHANNELS.filesIndexingCancel, (_event, jobId: string) => store.cancelIndexingJob(jobId));
  ipcMain.handle(IPC_CHANNELS.ragSearch, (_event, query: string, courseId?: string) => store.searchRag(query, courseId));
}
