import { app, BrowserWindow, Menu, nativeTheme, net, protocol, shell } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc";
import { IPC_CHANNELS } from "../types/ipc";
import { IndexingQueueService, WorkerThreadIndexingExecutor } from "./indexing";
import { createLocalStore, type LocalStore } from "./services/local-store";
import { startWorkspaceFileWatcher, stopWorkspaceFileWatcher } from "./services/workspace-file-watcher";
import { WORKSPACE_FILE_PREVIEW_PROTOCOL } from "./services/file-service";
import { isPathInside } from "./services/workspace-paths";
import { cleanupUpdater, initAutoUpdater, isInstallingUpdate } from "./updater/auto-updater";

app.setPath("userData", join(app.getPath("appData"), app.isPackaged ? "Brevyn" : "Brevyn Dev"));
protocol.registerSchemesAsPrivileged([
  {
    scheme: WORKSPACE_FILE_PREVIEW_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let store: LocalStore | null = null;
let indexingQueue: IndexingQueueService | null = null;
let indexingFilesChangedTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

function createWindow(): void {
  const preloadPath = join(__dirname, "preload.cjs");
  const isMac = process.platform === "darwin";
  const iconPath = resolveAppIconPath();
  if (isMac && app.dock && iconPath) {
    app.dock.setIcon(iconPath);
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    title: "Brevyn",
    icon: iconPath,
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

  mainWindow.on("closed", () => {
    stopWorkspaceFileWatcher();
    mainWindow = null;
  });
}

function resolveAppIconPath(): string | undefined {
  const resourceDirs = [
    process.resourcesPath,
    join(__dirname, "resources"),
    join(process.cwd(), "resources"),
    join(process.cwd(), "src", "renderer", "assets"),
  ];
  const platformNames = process.platform === "darwin"
    ? ["icon.png", "icon.icns"]
    : process.platform === "win32"
      ? ["icon.ico", "icon.png"]
      : ["icon.png"];
  for (const directory of resourceDirs) {
    for (const name of platformNames) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const dataRoot = brevynDataRoot();
  registerWorkspaceFilePreviewProtocol(dataRoot);
  let storeReady = false;
  try {
    configureClaudeSdk(dataRoot);
    store = createLocalStore(dataRoot);
    indexingQueue = new IndexingQueueService(store, new WorkerThreadIndexingExecutor(), {
      onTaskChanged: scheduleIndexingFilesChangedBroadcast,
    });
    registerIpcHandlers({ store, indexingQueue });
    storeReady = true;
  } catch (error) {
    console.error("[brevyn] Failed to initialize local store", error);
    store = createUnavailableStore(error);
    indexingQueue = null;
    registerIpcHandlers({ store });
  }
  createWindow();
  initAutoUpdater();
  if (storeReady) {
    startBackgroundServicesAfterFirstPaint(dataRoot);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (storeReady) startBackgroundServicesAfterFirstPaint(dataRoot);
    }
  });
});

function startBackgroundServicesAfterFirstPaint(dataRoot: string): void {
  const start = () => {
    setTimeout(() => {
      startWatcherForMainWindow(dataRoot);
      indexingQueue?.start();
    }, 1_200);
  };
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    start();
    return;
  }
  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", start);
    return;
  }
  start();
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (isInstallingUpdate()) return;
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
    console.warn("[brevyn] Shutdown timed out, forcing exit.");
    forceExit();
  }, 5_000);
  try {
    stopWorkspaceFileWatcher();
    cleanupUpdater();
    store?.stopAllAgents();
  } catch (error) {
    console.warn("[brevyn] Failed to stop active agents before shutdown", error);
  }
  void (async () => {
    try {
      await indexingQueue?.stop();
      await store?.close();
    } catch (error) {
      console.error("[brevyn] Failed to shut down cleanly", error);
    } finally {
      clearTimeout(timeout);
      forceExit();
    }
  })();
});

function scheduleIndexingFilesChangedBroadcast(): void {
  if (indexingFilesChangedTimer) return;
  indexingFilesChangedTimer = setTimeout(() => {
    indexingFilesChangedTimer = null;
    const window = mainWindow;
    if (!window || window.isDestroyed()) return;
    window.webContents.send(IPC_CHANNELS.filesChanged);
  }, 250);
}

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

function brevynDataRoot(): string {
  return join(homedir(), app.isPackaged ? ".brevyn" : ".brevyn-dev");
}

function configureClaudeSdk(dataRoot: string): void {
  const configDir = join(dataRoot, "sdk-config");
  mkdirSync(configDir, { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = configDir;
}

function registerWorkspaceFilePreviewProtocol(dataRoot: string): void {
  protocol.handle(WORKSPACE_FILE_PREVIEW_PROTOCOL, (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "workspace") {
      return new Response("Invalid workspace file host.", { status: 400 });
    }
    const requestedPath = decodeURIComponent(url.pathname.slice(1));
    if (!isPathInside(requestedPath, dataRoot)) {
      return new Response("Workspace file is outside the Brevyn data root.", { status: 403 });
    }
    if (!existsSync(requestedPath)) {
      return new Response("Workspace file does not exist.", { status: 404 });
    }
    return net.fetch(pathToFileURL(requestedPath).toString());
  });
}

function startWatcherForMainWindow(dataRoot: string): void {
  if (store && mainWindow) {
    startWorkspaceFileWatcher(dataRoot, store, mainWindow);
  }
}
