import { app, BrowserWindow, Menu, nativeTheme, net, protocol, shell } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { normalize, join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc";
import { IndexingQueueService, WorkerThreadIndexingExecutor } from "./indexing";
import { createLocalStore, type LocalStore } from "./services/local-store";
import { startWorkspaceFileWatcher, stopWorkspaceFileWatcher } from "./services/workspace-file-watcher";
import { WORKSPACE_FILE_PREVIEW_PROTOCOL } from "./services/file-service";
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
    join(__dirname, "resources"),
    join(process.cwd(), "resources"),
    join(process.cwd(), "src", "renderer", "assets"),
  ];
  const platformNames = process.platform === "darwin"
    ? ["icon.icns", "icon.png"]
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
    indexingQueue = new IndexingQueueService(store, new WorkerThreadIndexingExecutor());
    registerIpcHandlers({ store, indexingQueue });
    indexingQueue.start();
    storeReady = true;
  } catch (error) {
    console.error("[brevyn] Failed to initialize local store", error);
    store = createUnavailableStore(error);
    indexingQueue = null;
    registerIpcHandlers({ store });
  }
  createWindow();
  initAutoUpdater();
  if (storeReady) startWatcherForMainWindow(dataRoot);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      startWatcherForMainWindow(dataRoot);
    }
  });
});

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
    const requestedPath = normalize(decodeURIComponent(url.pathname.slice(1)));
    const normalizedRoot = normalize(dataRoot);
    if (!requestedPath.startsWith(`${normalizedRoot}/`) && requestedPath !== normalizedRoot) {
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
