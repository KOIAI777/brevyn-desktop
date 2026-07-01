import { ipcMain } from "electron";
import type { Sub2AuthInput, Sub2RefreshInput, Sub2SyncOfficialProviderInput } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { optionalString, requireObject, requireString } from "./validation";

export function registerSub2Ipc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.sub2Status, () => store.sub2Status());
  ipcMain.handle(IPC_CHANNELS.sub2Login, (_event, input: unknown) => store.sub2Login(normalizeSub2AuthInput(input, false)));
  ipcMain.handle(IPC_CHANNELS.sub2Register, (_event, input: unknown) => store.sub2Register(normalizeSub2AuthInput(input, true)));
  ipcMain.handle(IPC_CHANNELS.sub2Login2FA, (_event, input: unknown) => store.sub2Login2FA(normalizeSub2Login2FAInput(input)));
  ipcMain.handle(IPC_CHANNELS.sub2Refresh, (_event, input: unknown) => store.sub2Refresh(normalizeSub2RefreshInput(input)));
  ipcMain.handle(IPC_CHANNELS.sub2SyncOfficialProvider, (_event, input: unknown) => store.sub2SyncOfficialProvider(normalizeSub2SyncInput(input)));
  ipcMain.handle(IPC_CHANNELS.sub2ActivateOfficialProvider, (_event, input: unknown) => store.sub2ActivateOfficialProvider(normalizeSub2ActivateInput(input)));
  ipcMain.handle(IPC_CHANNELS.sub2RedeemCode, (_event, input: unknown) => store.sub2RedeemCode(normalizeSub2RedeemInput(input)));
  ipcMain.handle(IPC_CHANNELS.sub2UsageSummary, () => store.sub2UsageSummary());
  ipcMain.handle(IPC_CHANNELS.sub2Logout, () => store.sub2Logout());
}

function normalizeSub2AuthInput(value: unknown, includeDisplayName: boolean): Sub2AuthInput {
  const input = requireObject(value, "sub2 auth input");
  return {
    baseUrl: optionalString(input.baseUrl),
    email: requireString(input.email, "Email").toLowerCase(),
    password: requireString(input.password, "Password"),
    displayName: includeDisplayName ? optionalString(input.displayName) : undefined,
  };
}

function normalizeSub2Login2FAInput(value: unknown): { tempToken: string; code: string; baseUrl?: string } {
  const input = requireObject(value, "sub2 2FA input");
  return {
    tempToken: requireString(input.tempToken, "Temp token"),
    code: requireString(input.code, "2FA code"),
    baseUrl: optionalString(input.baseUrl),
  };
}

function normalizeSub2RefreshInput(value: unknown): Sub2RefreshInput | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "sub2 refresh input");
  return {
    force: input.force === undefined ? undefined : Boolean(input.force),
    reason: optionalString(input.reason),
  };
}

function normalizeSub2SyncInput(value: unknown): Sub2SyncOfficialProviderInput | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "sub2 provider sync input");
  const groupId = Number(input.groupId);
  return Number.isFinite(groupId) && groupId > 0
    ? { groupId: Math.floor(groupId) }
    : undefined;
}

function normalizeSub2ActivateInput(value: unknown): { groupId: number } {
  const input = requireObject(value, "sub2 provider activate input");
  const groupId = Number(input.groupId);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    throw new Error("Group id is required.");
  }
  return { groupId: Math.floor(groupId) };
}

function normalizeSub2RedeemInput(value: unknown): { code: string } {
  const input = requireObject(value, "sub2 redeem code input");
  return { code: requireString(input.code, "Redeem code") };
}
