import type { BrowserWindow } from "electron";
import { existsSync, mkdirSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { join } from "node:path";
import { IPC_CHANNELS } from "../../types/ipc";
import type { LocalStore } from "./local-store";

const DEBOUNCE_MS = 300;

let watcher: FSWatcher | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function startWorkspaceFileWatcher(rootDataDir: string, store: LocalStore, window: BrowserWindow): void {
  stopWorkspaceFileWatcher();

  const semestersDir = join(rootDataDir, "semesters");
  mkdirSync(semestersDir, { recursive: true });

  try {
    const changed = store.syncActiveSemesterDiskFiles();
    if (changed) notifyFilesChanged(window);
  } catch (error) {
    console.warn("[files] Initial workspace file sync failed", error);
  }

  if (!existsSync(semestersDir)) return;

  try {
    watcher = watch(semestersDir, { recursive: true }, (_eventType, filename) => {
      if (window.isDestroyed() || shouldIgnoreFileEvent(filename)) return;
      scheduleSync(store, window);
    });
  } catch (error) {
    console.warn("[files] Workspace file watcher failed to start", error);
  }
}

export function stopWorkspaceFileWatcher(): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

function scheduleSync(store: LocalStore, window: BrowserWindow): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (window.isDestroyed()) return;
    try {
      const changed = store.syncActiveSemesterDiskFiles();
      if (changed) notifyFilesChanged(window);
    } catch (error) {
      console.warn("[files] Workspace file sync failed", error);
    }
  }, DEBOUNCE_MS);
}

function notifyFilesChanged(window: BrowserWindow): void {
  if (!window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.filesChanged);
  }
}

function shouldIgnoreFileEvent(filename: string | Buffer | null): boolean {
  if (!filename) return true;
  const normalized = String(filename).replace(/\\/g, "/");
  if (!normalized || normalized.includes("/threads/") || normalized.includes("/.brevyn/")) return true;
  const basename = normalized.split("/").pop() || "";
  return basename === ".DS_Store" || basename.endsWith(".tmp");
}
