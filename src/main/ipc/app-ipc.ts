import { ipcMain, shell } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { requireString } from "./validation";

export function registerAppIpc(_ctx: IpcContext): void {
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
}
