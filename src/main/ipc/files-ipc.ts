import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type { FileImportInput } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerFilesIpc({ store, indexingQueue }: IpcContext): void {
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
          {
            name: "Course files",
            extensions: [
              "pdf",
              "docx",
              "ppt",
              "pptx",
              "png",
              "jpg",
              "jpeg",
              "md",
              "txt",
              "ts",
              "tsx",
              "js",
              "jsx",
              "py",
              "java",
              "cpp",
              "c",
              "zip",
            ],
          },
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
  ipcMain.handle(IPC_CHANNELS.filesDelete, (_event, fileId: string) => store.deleteFile(fileId));
  ipcMain.handle(IPC_CHANNELS.filesReveal, async (_event, fileId: string) => {
    const sourcePath = store.fileSourcePath(fileId);
    if (!sourcePath) throw new Error("File source path not available.");
    shell.showItemInFolder(sourcePath);
  });
}
