import { app, BrowserWindow, Menu, nativeTheme, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc";
import { IndexingQueueService, WorkerThreadIndexingExecutor } from "./indexing";
import { AgentAskUserService } from "./services/agent-ask-user-service";
import { AgentEventBus } from "./services/agent-event-bus";
import { AgentEventLog } from "./services/agent-event-log";
import { AgentOrchestrator } from "./services/agent-orchestrator";
import { AgentPermissionService } from "./services/agent-permission-service";
import { OpenAIAgentsAdapter } from "./services/agent-runtime-adapter";
import { createLocalStore } from "./services/local-store";
import { RunEventStream } from "./services/run-event-stream";

if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "@uclaw/electron-dev"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
const runStream = new RunEventStream();
const store = createLocalStore(app.getPath("userData"));
const indexingQueue = new IndexingQueueService(store, new WorkerThreadIndexingExecutor());
const agentEventLog = new AgentEventLog(store);
const agentEventBus = new AgentEventBus(agentEventLog);
const agentPermissionService = new AgentPermissionService();
const agentAskUserService = new AgentAskUserService();
const openAIAgentsAdapter = new OpenAIAgentsAdapter(store, agentPermissionService, agentAskUserService, { cwd: process.cwd() });
agentEventBus.on((item) => runStream.emitRunItem(item));
const agent = new AgentOrchestrator(store, agentEventBus, agentPermissionService, agentAskUserService, openAIAgentsAdapter);

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

  runStream.attachWindow(mainWindow);

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
    return { action: "allow" };
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
  registerIpcHandlers(store, agent, indexingQueue);
  indexingQueue.start();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  indexingQueue.stop();
});
