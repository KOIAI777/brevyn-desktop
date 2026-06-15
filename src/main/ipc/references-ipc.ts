import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import {
  normalizeReferenceCreateInput,
  normalizeReferenceExportInput,
  normalizeReferenceImportInput,
  normalizeReferenceScopeInput,
  normalizeReferenceScopeQuery,
  normalizeReferenceUpdateInput,
  requireString,
} from "./validation";

export function registerReferencesIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.referencesList, (_event, query: unknown) => store.listReferences(normalizeReferenceScopeQuery(query)));
  ipcMain.handle(IPC_CHANNELS.referencesCreate, (_event, input: unknown) => store.createReference(normalizeReferenceCreateInput(input)));
  ipcMain.handle(IPC_CHANNELS.referencesUpdate, (_event, input: unknown) => store.updateReference(normalizeReferenceUpdateInput(input)));
  ipcMain.handle(IPC_CHANNELS.referencesArchive, (_event, referenceId: unknown) => store.archiveReference(requireString(referenceId, "Reference id")));
  ipcMain.handle(IPC_CHANNELS.referencesDelete, (_event, referenceId: unknown) => store.deleteReference(requireString(referenceId, "Reference id")));
  ipcMain.handle(IPC_CHANNELS.referencesAddScope, (_event, input: unknown) => store.addReferenceScope(normalizeReferenceScopeInput(input)));
  ipcMain.handle(IPC_CHANNELS.referencesRemoveScope, (_event, scopeId: unknown) => store.removeReferenceScope(requireString(scopeId, "Reference scope id")));
  ipcMain.handle(IPC_CHANNELS.referencesImport, (_event, input: unknown) => store.importReferences(normalizeReferenceImportInput(input)));
  ipcMain.handle(IPC_CHANNELS.referencesExport, (_event, input: unknown) => store.exportReferences(normalizeReferenceExportInput(input)));
}
