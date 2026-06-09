import { ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { IPC_CHANNELS } from "../../types/ipc";
import { applyThemePreference, currentThemeState, normalizeThemePreference } from "../services/app-theme";
import type { IpcContext } from "./context";
import { requireString } from "./validation";

export function registerAppIpc(ctx: IpcContext): void {
  const service = ctx.openWithService;
  if (!service) throw new Error("OpenWithService not available");

  ipcMain.handle(IPC_CHANNELS.appProfile, () => ctx.store.profile());

  ipcMain.handle(IPC_CHANNELS.appTheme, () => currentThemeState(ctx.store.themePreference()));

  ipcMain.handle(IPC_CHANNELS.appUpdateThemePreference, (_event, preference: unknown) => {
    const nextPreference = ctx.store.updateThemePreference(normalizeThemePreference(preference));
    return applyThemePreference(nextPreference);
  });

  ipcMain.handle(IPC_CHANNELS.appUpdateProfile, (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const displayName = typeof data.displayName === "string" ? data.displayName.trim().slice(0, 40) : undefined;
    const avatarId = typeof data.avatarId === "string" ? data.avatarId.trim() : undefined;
    if (avatarId && !isValidProfileAvatar(avatarId)) {
      throw new Error("头像不可用。");
    }
    if (displayName !== undefined && displayName.length === 0) {
      throw new Error("昵称不能为空。");
    }
    return ctx.store.updateProfile({ displayName, avatarId });
  });

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

  ipcMain.handle(IPC_CHANNELS.appRevealPath, (_event, path: unknown) => {
    const targetPath = requireExistingPath(path);
    service.revealInFinder(targetPath);
  });

  ipcMain.handle(IPC_CHANNELS.appOpenPathOptions, async (_event, path: unknown) => {
    const targetPath = requireExistingPath(path);
    return service.getPathOptions(targetPath);
  });

  ipcMain.handle(IPC_CHANNELS.appOpenPathWith, async (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const targetPath = requireExistingPath(data.path);
    const optionId = requireString(data.optionId, "Open option");
    if (optionId === "default") {
      await service.openWithDefault(targetPath);
      return;
    }
    if (optionId === "finder") {
      service.revealInFinder(targetPath);
      return;
    }
    if (optionId === "terminal") {
      await service.openTerminalAt(targetPath);
      return;
    }
    if (optionId.startsWith("terminal:")) {
      await service.openTerminalAt(targetPath, typeof data.appPath === "string" ? data.appPath : undefined);
      return;
    }
    const appPath = requireString(data.appPath, "App path");
    if (!existsSync(appPath)) throw new Error("应用不可用。");
    await service.openWithApp(appPath, targetPath);
  });

  ipcMain.handle(IPC_CHANNELS.appOpenWorkspacePath, async (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const requestedPath = requireString(data.path, "Path");
    const targetPath = ctx.store.resolveThreadWorkspacePath(threadId, requestedPath);
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  });

  ipcMain.handle(IPC_CHANNELS.appPreviewWorkspacePath, (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const requestedPath = requireString(data.path, "Path");
    return ctx.store.previewThreadWorkspacePath(threadId, requestedPath);
  });
}

function isValidProfileAvatar(value: string): boolean {
  if (value.length === 0 || value.length > 2_000_000) return false;
  if (value.startsWith("data:image/")) return /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value);
  return value.length <= 24;
}

function requireExistingPath(value: unknown): string {
  const targetPath = requireString(value, "Path");
  if (!existsSync(targetPath)) throw new Error("路径不可用。");
  return targetPath;
}
