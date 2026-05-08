import { app, BrowserWindow, Menu, nativeTheme, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc";
import { IndexingQueueService, WorkerThreadIndexingExecutor } from "./indexing";
import { createLocalStore, type LocalStore } from "./services/local-store";

if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "@uclaw/electron-dev"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let store: LocalStore | null = null;
let indexingQueue: IndexingQueueService | null = null;
let shuttingDown = false;

function createWindow(): void {
  const preloadPath = join(__dirname, "preload.cjs");
  const isMac = process.platform === "darwin";
  const iconPath = join(__dirname, "resources", process.platform === "darwin" ? "icon.icns" : "icon.png");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    title: "UCLAW",
    icon: existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0f14" : "#f7f7f4",
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "followWindow" : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, "renderer", "index.html"));
  } else {
    mainWindow.loadURL("http://127.0.0.1:5174");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!app.isPackaged && url.startsWith("http://127.0.0.1:5174")) return;
    event.preventDefault();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  try {
    store = createLocalStore(app.getPath("userData"));
    indexingQueue = new IndexingQueueService(store, new WorkerThreadIndexingExecutor());
    registerIpcHandlers({ store, indexingQueue });
    indexingQueue.start();
  } catch (error) {
    console.error("[uclaw] Failed to initialize local store", error);
    store = createUnavailableStore(error);
    indexingQueue = null;
    registerIpcHandlers({ store });
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  let exited = false;
  const forceExit = () => {
    if (exited) return;
    exited = true;
    app.exit(0);
  };
  const timeout = setTimeout(() => {
    console.warn("[uclaw] Shutdown timed out, forcing exit.");
    forceExit();
  }, 5_000);
  void (async () => {
    try {
      await indexingQueue?.stop();
      await store?.close();
    } catch (error) {
      console.error("[uclaw] Failed to shut down cleanly", error);
    } finally {
      clearTimeout(timeout);
      forceExit();
    }
  })();
});

function createUnavailableStore(error: unknown): LocalStore {
  const message = error instanceof Error ? error.message : String(error || "Unknown startup error");
  return new Proxy({} as LocalStore, {
    get(_target, property) {
      if (property === "close") return async () => undefined;
      return () => {
        throw new Error(`Workspace store unavailable: ${message}`);
      };
    },
  });
}
