import { ipcMain } from "electron";
import type { ProviderDraftInput } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerProvidersIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.providersList, () => store.listProviders());
  ipcMain.handle(IPC_CHANNELS.providersSave, (_event, input: ProviderDraftInput) => store.saveProvider(input));
  ipcMain.handle(IPC_CHANNELS.providersDelete, (_event, providerId: string) => store.deleteProvider(providerId));
  ipcMain.handle(IPC_CHANNELS.providersModels, (_event, providerId: string) => store.providerModels(providerId));
  ipcMain.handle(IPC_CHANNELS.providersTest, (_event, providerId: string) => store.testProvider(providerId));
}
