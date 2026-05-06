import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import type { RunStreamEnvelope, UclawRunStreamItem } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";

export class RunEventStream {
  private readonly emitter = new EventEmitter();
  private windows = new Set<BrowserWindow>();

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win);
    win.on("closed", () => this.windows.delete(win));
  }

  emitRunItem(item: UclawRunStreamItem): void {
    const envelope: RunStreamEnvelope = {
      event: "uclaw_run_item",
      data: item,
    };
    this.emitter.emit("event", envelope);
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.agentEvent, envelope);
    }
  }
}
