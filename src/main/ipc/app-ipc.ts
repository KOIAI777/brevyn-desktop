import { ipcMain, shell } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { requireString } from "./validation";

export function registerAppIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, (_event, url: unknown) => {
    let parsed: URL;
    try {
      parsed = new URL(requireString(url, "URL"));
    } catch {
      throw new Error("A valid http or https URL is required.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https URLs can be opened externally.");
    }
    return shell.openExternal(parsed.toString());
  });

  ipcMain.handle(IPC_CHANNELS.appOpenWorkspacePath, async (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const requestedPath = requireString(data.path, "Path");
    const targetPath = store.resolveThreadWorkspacePath(threadId, requestedPath);
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  });

  ipcMain.handle(IPC_CHANNELS.appPreviewWorkspacePath, (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const requestedPath = requireString(data.path, "Path");
    return store.previewThreadWorkspacePath(threadId, requestedPath);
  });
}
