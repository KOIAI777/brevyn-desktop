import { ipcMain, shell } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerAppIpc(_ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, (_event, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https URLs can be opened externally.");
    }
    return shell.openExternal(parsed.toString());
  });
}
