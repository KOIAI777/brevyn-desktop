import { registerAgentIpc } from "./agent-ipc";
import { registerAppIpc } from "./app-ipc";
import { registerAttachmentsIpc } from "./attachments-ipc";
import type { IpcContext } from "./context";
import { registerFilesIpc } from "./files-ipc";
import { registerIndexingIpc } from "./indexing-ipc";
import { registerProvidersIpc } from "./provider-ipc";
import { registerSkillsIpc } from "./skills-ipc";
import { registerTimetableIpc } from "./timetable-ipc";
import { registerUpdaterIpc } from "./updater-ipc";
import { registerWorkspaceIpc } from "./workspace-ipc";

export function registerIpcHandlers(ctx: IpcContext): void {
  registerWorkspaceIpc(ctx);
  registerFilesIpc(ctx);
  registerIndexingIpc(ctx);
  registerSkillsIpc(ctx);
  registerProvidersIpc(ctx);
  registerTimetableIpc(ctx);
  registerAgentIpc(ctx);
  registerAttachmentsIpc(ctx);
  registerUpdaterIpc();
  registerAppIpc(ctx);
}
