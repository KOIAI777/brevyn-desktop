import { app, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, extname } from "node:path";

// ─── Types ───────────────────────────────────────────────────────

export interface AppCandidate {
  bundleId?: string;
  label: string;
  appPath: string;
  isDefault: boolean;
}

interface IconCacheEntry {
  dataUrl: string;
  timestamp: number;
}

// ─── UTI mapping ─────────────────────────────────────────────────

const EXTENSION_TO_UTI: Record<string, string> = {
  txt: "public.plain-text",
  md: "net.daringfireball.markdown",
  markdown: "net.daringfireball.markdown",
  json: "public.json",
  jsonl: "public.json",
  xml: "public.xml",
  yaml: "public.yaml",
  yml: "public.yaml",
  toml: "public.toml",
  html: "public.html",
  htm: "public.html",
  css: "public.css",
  csv: "public.comma-separated-values-text",
  ts: "public.source-code",
  tsx: "public.source-code",
  js: "com.netscape.javascript-source",
  jsx: "com.netscape.javascript-source",
  py: "public.python-script",
  java: "com.sun.java-source",
  cpp: "public.c-plus-plus-source",
  c: "public.c-source",
  h: "public.c-header",
  sh: "public.shell-script",
  zsh: "public.zsh-script",
  pdf: "com.adobe.pdf",
  doc: "com.microsoft.word.doc",
  docx: "org.openxmlformats.wordprocessingml.document",
  ppt: "com.microsoft.powerpoint.ppt",
  pptx: "org.openxmlformats.presentationml.presentation",
  xls: "com.microsoft.excel.xls",
  xlsx: "org.openxmlformats.spreadsheetml.sheet",
  png: "public.png",
  jpg: "public.jpeg",
  jpeg: "public.jpeg",
  gif: "com.compuserve.gif",
  webp: "org.webmproject.webp",
  svg: "public.svg-image",
};

// ─── Abstract base class ─────────────────────────────────────────

export abstract class OpenWithService {
  private iconCache = new Map<string, IconCacheEntry>();
  private static readonly ICON_CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly MAX_ICON_CACHE_SIZE = 50;

  async getFileIcon(appPath: string): Promise<string | undefined> {
    const cached = this.iconCache.get(appPath);
    if (cached && Date.now() - cached.timestamp < OpenWithService.ICON_CACHE_TTL_MS) {
      return cached.dataUrl;
    }
    try {
      const icon = await app.getFileIcon(appPath, { size: "normal" });
      const dataUrl = icon.isEmpty() ? "" : icon.toDataURL();
      if (dataUrl.startsWith("data:image/png;base64,") && dataUrl.length > 150) {
        this.iconCache.set(appPath, { dataUrl, timestamp: Date.now() });
        if (this.iconCache.size > OpenWithService.MAX_ICON_CACHE_SIZE) {
          this.evictOldest();
        }
        return dataUrl;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private evictOldest(): void {
    let oldestKey = "";
    let oldestTs = Infinity;
    for (const [key, entry] of this.iconCache) {
      if (entry.timestamp < oldestTs) {
        oldestTs = entry.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) this.iconCache.delete(oldestKey);
  }

  abstract getAppCandidates(extension: string): Promise<AppCandidate[]>;
  abstract openWithApp(appPath: string, targetPath: string): Promise<void>;
  abstract openWithDefault(targetPath: string): Promise<void>;
  abstract revealInFinder(targetPath: string): void;
  abstract openTerminalAt(dirPath: string): Promise<void>;
}

// ─── macOS implementation ────────────────────────────────────────

class MacOpenWithService extends OpenWithService {
  async getAppCandidates(extension: string): Promise<AppCandidate[]> {
    const uti = EXTENSION_TO_UTI[extension];
    const base = this.getHardcodedCandidates(extension);
    let defaultBundleId: string | undefined;

    if (uti) {
      try {
        defaultBundleId = await this.queryDefaultBundleId(uti);
      } catch {
        // 静默回退
      }
    }

    // 解析默认 Bundle ID 为 App 路径
    let defaultAppPath: string | undefined;
    if (defaultBundleId) {
      try {
        defaultAppPath = await this.resolveBundleIdToAppPath(defaultBundleId);
      } catch {
        // 静默回退
      }
    }

    // 标记默认 App
    if (defaultAppPath) {
      const found = base.find(
        (c) => c.appPath === defaultAppPath || c.bundleId === defaultBundleId,
      );
      if (!found) {
        base.unshift({
          bundleId: defaultBundleId,
          label: basename(defaultAppPath, ".app"),
          appPath: defaultAppPath,
          isDefault: true,
        });
      }
    }

    // 标记匹配默认的条目
    for (const c of base) {
      if (c.appPath === defaultAppPath || (defaultBundleId && c.bundleId === defaultBundleId)) {
        c.isDefault = true;
      }
    }

    // 去重
    return this.deduplicate(base);
  }

  private deduplicate(candidates: AppCandidate[]): AppCandidate[] {
    const seen = new Set<string>();
    const result: AppCandidate[] = [];
    for (const c of candidates) {
      const key =
        c.bundleId ?? c.appPath;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(c);
    }
    return result;
  }

  private async queryDefaultBundleId(uti: string): Promise<string | undefined> {
    const stdout = await execFileWithTimeout("/usr/bin/defaults", [
      "read",
      "com.apple.LaunchServices/com.apple.launchservices.secure",
      "LSHandlers",
    ]);
    if (!stdout) return undefined;

    // defaults read 输出是类似 plist 的文本格式
    // 解析 LSHandlerContentType = uti 对应的 LSHandlerRoleAll
    const lines = stdout.split("\n");
    let capturing = false;
    let capturedBundleId: string | undefined;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("LSHandlerContentType") && trimmed.includes(uti)) {
        capturing = true;
        capturedBundleId = undefined;
        continue;
      }
      if (capturing) {
        const bundleMatch = trimmed.match(
          /LSHandlerRole(?:All|Viewer)\s*=\s*"([^"]+)"/,
        );
        if (bundleMatch) {
          capturedBundleId = bundleMatch[1];
        }
        if (trimmed === ")" || trimmed.startsWith("}")) {
          if (capturedBundleId) return capturedBundleId;
          capturing = false;
        }
      }
    }
    return capturedBundleId;
  }

  private async resolveBundleIdToAppPath(bundleId: string): Promise<string | undefined> {
    const stdout = await execFileWithTimeout("/usr/bin/mdfind", [
      `kMDItemCFBundleIdentifier == '${bundleId}'`,
    ]);
    if (!stdout) return undefined;
    const lines = stdout.split("\n").filter(Boolean);
    // 优先取 /Applications 下的，其次 ~/Applications
    const sorted = lines.sort((a, b) => {
      const aSys = a.startsWith("/Applications") || a.startsWith("/System/Applications");
      const bSys = b.startsWith("/Applications") || b.startsWith("/System/Applications");
      return aSys === bSys ? 0 : aSys ? -1 : 1;
    });
    return sorted[0];
  }

  private getHardcodedCandidates(extension: string): AppCandidate[] {
    const homeApplications = `${process.env.HOME || ""}/Applications`;
    const candidates: AppCandidate[] = [];
    const code = [
      "md", "markdown", "txt", "json", "jsonl", "ts", "tsx",
      "js", "jsx", "py", "java", "cpp", "c", "h", "css",
      "html", "xml", "yaml", "yml", "toml", "sh", "zsh",
    ];
    const pdf = ["pdf"];
    const images = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
    const word = ["doc", "docx"];
    const ppt = ["ppt", "pptx"];
    const excel = ["xls", "xlsx", "csv"];

    const add = (...paths: string[]) => {
      for (const p of paths) {
        if (existsSync(p)) {
          candidates.push({
            label: basename(p, ".app"),
            appPath: p,
            isDefault: false,
          });
        }
      }
    };

    if (code.includes(extension)) {
      add(
        `${homeApplications}/Cursor.app`,
        "/Applications/Cursor.app",
        `${homeApplications}/Visual Studio Code.app`,
        "/Applications/Visual Studio Code.app",
        "/Applications/Xcode.app",
        "/System/Applications/TextEdit.app",
      );
    } else if (pdf.includes(extension) || images.includes(extension)) {
      add("/System/Applications/Preview.app");
    } else if (word.includes(extension)) {
      add(
        "/Applications/Microsoft Word.app",
        "/Applications/Pages.app",
      );
    } else if (ppt.includes(extension)) {
      add(
        "/Applications/Microsoft PowerPoint.app",
        "/Applications/Keynote.app",
      );
    } else if (excel.includes(extension)) {
      add(
        "/Applications/Microsoft Excel.app",
        "/Applications/Numbers.app",
      );
    } else {
      add(
        `${homeApplications}/Cursor.app`,
        "/Applications/Cursor.app",
        `${homeApplications}/Visual Studio Code.app`,
        "/Applications/Visual Studio Code.app",
        "/System/Applications/TextEdit.app",
      );
    }

    return candidates;
  }

  // ── actions ──

  async openWithApp(appPath: string, targetPath: string): Promise<void> {
    await execOpen(["-a", appPath, targetPath]);
  }

  async openWithDefault(targetPath: string): Promise<void> {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  }

  revealInFinder(targetPath: string): void {
    shell.showItemInFolder(targetPath);
  }

  async openTerminalAt(dirPath: string): Promise<void> {
    await execOpen(["-a", "Terminal", dirPath]);
  }
}

// ─── Windows stub ────────────────────────────────────────────────

class WinOpenWithService extends OpenWithService {
  async getAppCandidates(_extension: string): Promise<AppCandidate[]> {
    return [];
  }

  async openWithApp(_appPath: string, _targetPath: string): Promise<void> {
    throw new Error("Windows 暂不支持。");
  }

  async openWithDefault(targetPath: string): Promise<void> {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  }

  revealInFinder(targetPath: string): void {
    shell.showItemInFolder(targetPath);
  }

  async openTerminalAt(_dirPath: string): Promise<void> {
    throw new Error("Windows 暂不支持。");
  }
}

// ─── Linux stub ─────────────────────────────────────────────────

class LinuxOpenWithService extends OpenWithService {
  async getAppCandidates(_extension: string): Promise<AppCandidate[]> {
    return [];
  }

  async openWithApp(_appPath: string, _targetPath: string): Promise<void> {
    throw new Error("Linux 暂不支持。");
  }

  async openWithDefault(targetPath: string): Promise<void> {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  }

  revealInFinder(targetPath: string): void {
    shell.showItemInFolder(targetPath);
  }

  async openTerminalAt(_dirPath: string): Promise<void> {
    throw new Error("Linux 暂不支持。");
  }
}

// ─── Factory ─────────────────────────────────────────────────────

export function createOpenWithService(): OpenWithService {
  if (process.platform === "darwin") return new MacOpenWithService();
  if (process.platform === "win32") return new WinOpenWithService();
  return new LinuxOpenWithService();
}

// ─── Shared helpers ──────────────────────────────────────────────

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

function execFileWithTimeout(
  command: string,
  args: string[],
  timeoutMs = 3000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}
