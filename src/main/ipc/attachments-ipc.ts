import { BrowserWindow, dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { AgentAttachmentDataInput } from "../../types/domain";
import type { IpcContext } from "./context";
import { requireString } from "./validation";

export function registerAttachmentsIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.attachmentsPick, async (event, threadIdInput: unknown) => {
    const threadId = requireString(threadIdInput, "Thread id");
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ["openFile", "multiSelections"] })
      : await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
    if (result.canceled || result.filePaths.length === 0) return [];
    const attachments = await store.saveAgentAttachmentPaths(threadId, result.filePaths);
    event.sender.send(IPC_CHANNELS.filesChanged);
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.attachmentsList, (_event, threadIdInput: unknown) => {
    return store.listAgentSessionFiles(requireString(threadIdInput, "Thread id"));
  });

  ipcMain.handle(IPC_CHANNELS.attachmentsSavePaths, async (event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const paths = Array.isArray(data.paths) ? data.paths.flatMap((path) => {
      const value = typeof path === "string" ? path.trim() : "";
      return value ? [value] : [];
    }) : [];
    const attachments = await store.saveAgentAttachmentPaths(threadId, paths);
    event.sender.send(IPC_CHANNELS.filesChanged);
    return attachments;
  });

  ipcMain.handle(IPC_CHANNELS.attachmentsSaveData, (event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const normalized: AgentAttachmentDataInput = {
      threadId: requireString(data.threadId, "Thread id"),
      name: requireString(data.name, "Attachment name"),
      mediaType: typeof data.mediaType === "string" ? data.mediaType : undefined,
      data: requireString(data.data, "Attachment data"),
    };
    const attachment = store.saveAgentAttachmentData(normalized);
    event.sender.send(IPC_CHANNELS.filesChanged);
    return attachment;
  });

  ipcMain.handle(IPC_CHANNELS.attachmentsDelete, (event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const deleted = store.deleteAgentAttachment(
      requireString(data.threadId, "Thread id"),
      requireString(data.path, "Attachment path"),
    );
    event.sender.send(IPC_CHANNELS.filesChanged);
    return deleted;
  });
}
