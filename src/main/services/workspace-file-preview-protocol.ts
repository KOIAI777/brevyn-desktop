import { randomUUID } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

export const WORKSPACE_FILE_PREVIEW_PROTOCOL = "brevyn-file";

type PreviewEntry = {
  root: string;
  isDirectory: boolean;
  createdAt: number;
};

const ENTRY_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const previewEntries = new Map<string, PreviewEntry>();

export function registerWorkspaceFilePreviewProtocol(): void {
  protocol.handle(WORKSPACE_FILE_PREVIEW_PROTOCOL, handleWorkspaceFilePreviewRequest);
}

export function workspaceFilePreviewUrl(sourcePath: string): string {
  return registerPreviewEntry(sourcePath, false);
}

export function workspaceDirectoryPreviewUrl(sourcePath: string): string {
  return registerPreviewEntry(sourcePath, true);
}

function handleWorkspaceFilePreviewRequest(request: Request): Promise<Response> | Response {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return new Response("Bad request.", { status: 400 });
  }

  const entry = previewEntries.get(url.hostname);
  if (!entry) {
    return new Response("Preview resource not found.", { status: 404 });
  }

  let targetPath = entry.root;
  if (entry.isDirectory) {
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    try {
      targetPath = realpathSync(resolve(entry.root, relativePath));
    } catch {
      return new Response("Preview resource not found.", { status: 404 });
    }
    if (!isInsideDirectory(targetPath, entry.root)) {
      return new Response("Preview resource is outside the registered directory.", { status: 403 });
    }
  } else if (url.pathname && url.pathname !== "/") {
    return new Response("Preview resource not found.", { status: 404 });
  }

  if (!existsSync(targetPath)) {
    return new Response("Preview resource does not exist.", { status: 404 });
  }
  return net.fetch(pathToFileURL(targetPath).toString());
}

function registerPreviewEntry(sourcePath: string, isDirectory: boolean): string {
  prunePreviewEntries();
  const root = realpathExisting(sourcePath);
  const stats = statSync(root);
  if (isDirectory && !stats.isDirectory()) {
    throw new Error("Preview resource is not a directory.");
  }
  if (!isDirectory && !stats.isFile()) {
    throw new Error("Preview resource is not a file.");
  }

  const token = randomUUID();
  previewEntries.set(token, { root, isDirectory, createdAt: Date.now() });
  return `${WORKSPACE_FILE_PREVIEW_PROTOCOL}://${token}`;
}

function prunePreviewEntries(): void {
  const now = Date.now();
  for (const [token, entry] of previewEntries) {
    if (now - entry.createdAt > ENTRY_TTL_MS) {
      previewEntries.delete(token);
    }
  }

  while (previewEntries.size > MAX_ENTRIES) {
    const oldestToken = previewEntries.keys().next().value;
    if (!oldestToken) break;
    previewEntries.delete(oldestToken);
  }
}

function realpathExisting(sourcePath: string): string {
  const resolved = realpathSync(resolve(sourcePath));
  if (!existsSync(resolved)) {
    throw new Error("Preview resource does not exist.");
  }
  return resolved;
}

function isInsideDirectory(targetPath: string, rootPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`);
}
