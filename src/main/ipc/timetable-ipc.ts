import { ipcMain } from "electron";
import type { TimetableRangeQuery } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerTimetableIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.timetableRange, (_event, query: TimetableRangeQuery) => store.listTimetableEvents(query));
}
