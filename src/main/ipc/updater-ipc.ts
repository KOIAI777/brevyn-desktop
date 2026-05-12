import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import {
  checkForUpdates,
  getUpdaterStatus,
  quitAndInstallUpdate,
} from "../updater/auto-updater";

export function registerUpdaterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.updaterCheck, async () => {
    await checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.updaterStatus, () => getUpdaterStatus());

  ipcMain.handle(IPC_CHANNELS.updaterQuitAndInstall, () => {
    quitAndInstallUpdate();
  });
}
