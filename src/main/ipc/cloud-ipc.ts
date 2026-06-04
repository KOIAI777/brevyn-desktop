import { ipcMain } from "electron";
import type { CloudAuthInput, CloudModelCatalogInput, CloudSyncOfficialProviderInput } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { optionalString, requireObject, requireString } from "./validation";

export function registerCloudIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.cloudStatus, () => store.cloudStatus());
  ipcMain.handle(IPC_CHANNELS.cloudLogin, (_event, input: unknown) => store.cloudLogin(normalizeCloudAuthInput(input, false)));
  ipcMain.handle(IPC_CHANNELS.cloudRegister, (_event, input: unknown) => store.cloudRegister(normalizeCloudAuthInput(input, true)));
  ipcMain.handle(IPC_CHANNELS.cloudRefresh, () => store.cloudRefresh());
  ipcMain.handle(IPC_CHANNELS.cloudModelsCatalog, (_event, input: unknown) => store.cloudModelsCatalog(normalizeCloudModelCatalogInput(input)));
  ipcMain.handle(IPC_CHANNELS.cloudSyncOfficialProvider, (_event, input: unknown) => store.cloudSyncOfficialProvider(normalizeCloudSyncInput(input)));
  ipcMain.handle(IPC_CHANNELS.cloudActivateOfficialProvider, (_event, input: unknown) => store.cloudActivateOfficialProvider(normalizeCloudActivateInput(input)));
  ipcMain.handle(IPC_CHANNELS.cloudRedeemCode, (_event, input: unknown) => store.cloudRedeemCode(normalizeCloudRedeemInput(input)));
  ipcMain.handle(IPC_CHANNELS.cloudLogout, () => store.cloudLogout());
}

function normalizeCloudAuthInput(value: unknown, includeDisplayName: boolean): CloudAuthInput {
  const input = requireObject(value, "Cloud auth input");
  return {
    baseUrl: optionalString(input.baseUrl),
    email: requireString(input.email, "Email").toLowerCase(),
    password: requireString(input.password, "Password"),
    displayName: includeDisplayName ? optionalString(input.displayName) : undefined,
  };
}

function normalizeCloudModelCatalogInput(value: unknown): CloudModelCatalogInput | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "Cloud model catalog input");
  const externalGroupId = Number(input.externalGroupId);
  return Number.isFinite(externalGroupId) && externalGroupId > 0
    ? { externalGroupId: Math.floor(externalGroupId) }
    : undefined;
}

function normalizeCloudSyncInput(value: unknown): CloudSyncOfficialProviderInput | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "Cloud provider sync input");
  const externalGroupId = Number(input.externalGroupId);
  return Number.isFinite(externalGroupId) && externalGroupId > 0
    ? { externalGroupId: Math.floor(externalGroupId) }
    : undefined;
}

function normalizeCloudRedeemInput(value: unknown): { code: string } {
  const input = requireObject(value, "Redeem code input");
  return { code: requireString(input.code, "Redeem code") };
}

function normalizeCloudActivateInput(value: unknown): { externalGroupId: number } {
  const input = requireObject(value, "Cloud provider activate input");
  const externalGroupId = Number(input.externalGroupId);
  if (!Number.isFinite(externalGroupId) || externalGroupId <= 0) {
    throw new Error("External group id is required.");
  }
  return { externalGroupId: Math.floor(externalGroupId) };
}
