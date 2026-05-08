import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type { SkillImportInput, SkillUpdateInput, SkillWriteInput } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerSkillsIpc({ store }: IpcContext): void {
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
}
