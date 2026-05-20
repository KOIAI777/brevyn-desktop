import { ipcMain, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, extname } from "node:path";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import { requireString } from "./validation";
import type { OpenPathOption } from "../../types/domain";

export function registerAppIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, (_event, url: unknown) => {
    let parsed: URL;
    try {
      parsed = new URL(requireString(url, "URL"));
    } catch {
      throw new Error("A valid http or https URL is required.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https URLs can be opened externally.");
    }
    return shell.openExternal(parsed.toString());
  });

  ipcMain.handle(IPC_CHANNELS.appRevealPath, (_event, path: unknown) => {
    const targetPath = requireExistingPath(path);
    shell.showItemInFolder(targetPath);
  });

  ipcMain.handle(IPC_CHANNELS.appOpenPathOptions, (_event, path: unknown) => {
    const targetPath = requireExistingPath(path);
    return openPathOptions(targetPath);
  });

  ipcMain.handle(IPC_CHANNELS.appOpenPathWith, async (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const targetPath = requireExistingPath(data.path);
    const optionId = requireString(data.optionId, "Open option");
    if (optionId === "default") {
      const error = await shell.openPath(targetPath);
      if (error) throw new Error(error);
      return;
    }
    if (optionId === "finder") {
      shell.showItemInFolder(targetPath);
      return;
    }
    if (optionId === "terminal") {
      await execOpen(["-a", "Terminal", dirname(targetPath)]);
      return;
    }
    const appPath = requireString(data.appPath, "App path");
    if (!existsSync(appPath)) throw new Error("应用不可用。");
    await execOpen(["-a", appPath, targetPath]);
  });

  ipcMain.handle(IPC_CHANNELS.appOpenWorkspacePath, async (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const requestedPath = requireString(data.path, "Path");
    const targetPath = store.resolveThreadWorkspacePath(threadId, requestedPath);
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  });

  ipcMain.handle(IPC_CHANNELS.appPreviewWorkspacePath, (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const threadId = requireString(data.threadId, "Thread id");
    const requestedPath = requireString(data.path, "Path");
    return store.previewThreadWorkspacePath(threadId, requestedPath);
  });
}

function requireExistingPath(value: unknown): string {
  const targetPath = requireString(value, "Path");
  if (!existsSync(targetPath)) throw new Error("路径不可用。");
  return targetPath;
}

function openPathOptions(targetPath: string): OpenPathOption[] {
  const extension = extname(targetPath).slice(1).toLowerCase();
  const candidates = appCandidates(extension);
  const options: OpenPathOption[] = [
    { id: "default", label: "Default app", kind: "default" },
    { id: "finder", label: "Finder", kind: "finder" },
    { id: "terminal", label: "Terminal", kind: "terminal" },
  ];
  for (const candidate of candidates) {
    const appPath = firstExistingPath(candidate.paths);
    if (!appPath) continue;
    if (options.some((option) => option.appPath === appPath || option.label === candidate.label)) continue;
    options.push({ id: `app:${candidate.label}`, label: candidate.label, kind: "application", appPath });
  }
  return options;
}

function appCandidates(extension: string): Array<{ label: string; paths: string[] }> {
  const homeApplications = `${process.env.HOME || ""}/Applications`;
  const common = {
    cursor: { label: "Cursor", paths: ["/Applications/Cursor.app", `${homeApplications}/Cursor.app`] },
    vscode: { label: "Visual Studio Code", paths: ["/Applications/Visual Studio Code.app", `${homeApplications}/Visual Studio Code.app`] },
    xcode: { label: "Xcode", paths: ["/Applications/Xcode.app"] },
    textedit: { label: "TextEdit", paths: ["/System/Applications/TextEdit.app"] },
    preview: { label: "Preview", paths: ["/System/Applications/Preview.app"] },
    word: { label: "Microsoft Word", paths: ["/Applications/Microsoft Word.app"] },
    powerpoint: { label: "Microsoft PowerPoint", paths: ["/Applications/Microsoft PowerPoint.app"] },
    excel: { label: "Microsoft Excel", paths: ["/Applications/Microsoft Excel.app"] },
    pages: { label: "Pages", paths: ["/Applications/Pages.app"] },
    keynote: { label: "Keynote", paths: ["/Applications/Keynote.app"] },
    numbers: { label: "Numbers", paths: ["/Applications/Numbers.app"] },
  };
  if (["md", "markdown", "txt", "json", "jsonl", "ts", "tsx", "js", "jsx", "py", "java", "cpp", "c", "h", "css", "html", "xml", "yaml", "yml", "toml", "sh", "zsh"].includes(extension)) {
    return [common.cursor, common.vscode, common.xcode, common.textedit];
  }
  if (["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return [common.preview];
  if (["doc", "docx"].includes(extension)) return [common.word, common.pages];
  if (["ppt", "pptx"].includes(extension)) return [common.powerpoint, common.keynote];
  if (["xls", "xlsx", "csv"].includes(extension)) return [common.excel, common.numbers];
  return [common.cursor, common.vscode, common.textedit];
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.find((path) => path && existsSync(path));
}

function execOpen(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/open", args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve();
    });
  });
}
