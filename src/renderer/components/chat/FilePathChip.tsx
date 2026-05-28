import { createContext, useContext, type ReactNode } from "react";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const CODE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "json",
  "jsonl",
  "jsonc",
  "xml",
  "html",
  "htm",
  "txt",
  "log",
  "csv",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "lock",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sh",
  "bash",
  "zsh",
  "fish",
  "css",
  "scss",
  "less",
  "sql",
  "rb",
  "php",
  "diff",
  "patch",
]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"]);
const PREVIEWABLE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
]);

type FilePathPreviewHandler = (filePath: string) => void | Promise<void>;

const FilePathPreviewContext = createContext<FilePathPreviewHandler | undefined>(undefined);

export function useFilePathPreviewHandler(): FilePathPreviewHandler | undefined {
  return useContext(FilePathPreviewContext);
}

export function FilePathPreviewProvider({
  onPreviewFilePath,
  children,
}: {
  onPreviewFilePath?: FilePathPreviewHandler;
  children: ReactNode;
}) {
  return (
    <FilePathPreviewContext.Provider value={onPreviewFilePath}>
      {children}
    </FilePathPreviewContext.Provider>
  );
}

export function FilePathChip({ filePath, threadId }: { filePath: string; threadId?: string }) {
  const normalizedPath = filePath.trim();
  const filename = fileName(filePath);
  const isDirectory = isDirectoryPath(normalizedPath);
  const onPreviewFilePath = useFilePathPreviewHandler();

  async function handleClick() {
    if (onPreviewFilePath) {
      await onPreviewFilePath(normalizedPath);
      return;
    }
    if (!threadId) return;
    try {
      await window.brevyn.app.openWorkspacePath({ threadId, path: normalizedPath });
    } catch (error) {
      console.error("[FilePathChip] Failed to open workspace path:", error);
    }
  }

  return (
    <button
      type="button"
      disabled={!threadId && !onPreviewFilePath}
      onClick={(event) => {
        event.stopPropagation();
        void handleClick();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      className="not-prose inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-stone-300/55 bg-[#f8f3e8]/65 px-1.5 py-[1px] font-mono text-[0.9em] font-medium leading-[1.5] text-stone-700 align-middle shadow-[0_1px_0_rgba(120,113,108,0.08)] transition hover:border-stone-400/65 hover:bg-[#f2eadb]/75 hover:text-stone-900 disabled:cursor-default disabled:hover:border-stone-300/55 disabled:hover:bg-[#f8f3e8]/65"
      title={filePath}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center self-center leading-none">
        <FileTypeIcon name={filename} isDirectory={isDirectory} size={14} />
      </span>
      <span className="min-w-0 max-w-full whitespace-normal break-all text-left">{filename}</span>
    </button>
  );
}

export function isFilePathLike(value: string): boolean {
  const text = value.trim();
  if (text.length < 3 || text.includes("\n")) return false;
  if (isAbsoluteFilePath(text)) return true;
  return isRelativeFilePath(text);
}

function isAbsoluteFilePath(value: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (!value.startsWith("/") || !/^\/[^\n]+\/[^\n]+$/.test(value)) return false;
  if (value.endsWith("/") && !value.includes(".")) return false;
  return true;
}

function isRelativeFilePath(value: string): boolean {
  if (!hasSafeInlineFilePathCharacters(value)) return false;
  if (isDirectoryPath(value) && value.includes("/")) return true;
  const extension = extensionName(value);
  if (!extension || !PREVIEWABLE_EXTENSIONS.has(extension)) return false;
  if (value.startsWith(".") && !value.startsWith("./") && !value.includes("/")) return false;
  return true;
}

function hasSafeInlineFilePathCharacters(value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  return !/[<>"|?*`]/.test(value);
}

function fileName(filePath: string): string {
  const normalized = filePath.trim().replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) || filePath.trim();
}

function extensionName(filePath: string): string {
  const name = fileName(filePath);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1).toLowerCase();
}

function isDirectoryPath(value: string): boolean {
  return value.trim().endsWith("/");
}
