import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { normalizeFileImportInput, optionalString, requireString } from "./validation";

export function registerFilesIpc({ store, indexingQueue }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.filesTree, (_event, courseId?: unknown) => store.listFiles(optionalString(courseId)));
  ipcMain.handle(IPC_CHANNELS.filesPreview, (_event, fileId: unknown) => store.previewFile(requireString(fileId, "File id")));
  ipcMain.handle(IPC_CHANNELS.filesImport, async (event, rawInput: unknown) => {
    const input = normalizeFileImportInput(rawInput);
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
  ipcMain.handle(IPC_CHANNELS.filesSections, (_event, courseId: unknown) => store.courseFileSections(requireString(courseId, "Course id")));
  ipcMain.handle(IPC_CHANNELS.filesStats, (_event, courseId?: unknown) => store.fileStats(optionalString(courseId)));
  ipcMain.handle(IPC_CHANNELS.filesDelete, (_event, fileId: unknown) => store.deleteFile(requireString(fileId, "File id")));
  ipcMain.handle(IPC_CHANNELS.filesReveal, async (_event, fileId: unknown) => {
    const sourcePath = store.fileSourcePath(requireString(fileId, "File id"));
    if (!sourcePath) throw new Error("File source path not available.");
    shell.showItemInFolder(sourcePath);
  });
}
