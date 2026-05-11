import { createContext, useContext, type ReactNode } from "react";
import { FileCode, FileImage, FileText, FileVideo, FolderOpen } from "lucide-react";

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
  const displayName = compactMiddleFileName(filename);
  const extension = extensionName(filename);
  const Icon = filePathIcon(extension);
  const badge = fileTypeBadge(extension, normalizedPath);
  const isDirectory = isDirectoryPath(normalizedPath);
  const onPreviewFilePath = useContext(FilePathPreviewContext);

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
      onClick={() => void handleClick()}
      className="not-prose inline-flex max-w-full items-center gap-1 rounded-md bg-muted/58 px-1.5 py-[1px] font-mono text-[0.9em] font-medium leading-[1.5] text-foreground/82 align-baseline transition hover:bg-accent hover:text-foreground disabled:cursor-default disabled:hover:bg-muted/58"
      title={filePath}
    >
      {badge ? (
        <span className={`inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[4px] px-0.5 text-[9px] font-bold leading-none ${badge.className}`}>
          {badge.label}
        </span>
      ) : (
        <Icon className={`h-3.5 w-3.5 shrink-0 ${isDirectory ? "text-amber-600" : "text-muted-foreground"}`} />
      )}
      <span className="max-w-[22rem] truncate">{displayName}</span>
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
  if (isDirectoryPath(value) && value.includes("/")) return true;
  const extension = extensionName(value);
  if (!extension || !PREVIEWABLE_EXTENSIONS.has(extension)) return false;
  if (!/^[\w .()@/-]+$/.test(value)) return false;
  if (value.startsWith(".") && !value.startsWith("./") && !value.includes("/")) return false;
  return true;
}

function filePathIcon(extension: string) {
  if (!extension) return FolderOpen;
  if (IMAGE_EXTENSIONS.has(extension)) return FileImage;
  if (VIDEO_EXTENSIONS.has(extension)) return FileVideo;
  if (CODE_EXTENSIONS.has(extension)) return FileCode;
  return FileText;
}

function fileTypeBadge(extension: string, path: string): { label: string; className: string } | null {
  if (isDirectoryPath(path)) return null;
  const normalized = extension || "file";
  const labelMap: Record<string, string> = {
    ts: "TS",
    tsx: "TSX",
    js: "JS",
    jsx: "JSX",
    md: "MD",
    markdown: "MD",
    json: "JSON",
    jsonl: "JSON",
    doc: "DOC",
    docx: "DOC",
    ppt: "PPT",
    pptx: "PPT",
    pdf: "PDF",
    xls: "XLS",
    xlsx: "XLS",
    py: "PY",
    txt: "TXT",
  };
  const label = labelMap[normalized] || normalized.slice(0, 4).toUpperCase();
  const className = (() => {
    if (["ts", "tsx", "js", "jsx"].includes(normalized)) return "bg-blue-50 text-blue-700";
    if (["md", "markdown", "txt"].includes(normalized)) return "bg-slate-100 text-slate-700";
    if (["doc", "docx"].includes(normalized)) return "bg-sky-50 text-sky-700";
    if (["ppt", "pptx"].includes(normalized)) return "bg-orange-50 text-orange-700";
    if (["xls", "xlsx", "csv"].includes(normalized)) return "bg-emerald-50 text-emerald-700";
    if (normalized === "pdf") return "bg-red-50 text-red-700";
    if (["json", "jsonl", "jsonc"].includes(normalized)) return "bg-violet-50 text-violet-700";
    return "bg-stone-100 text-stone-700";
  })();
  return { label, className };
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

function compactMiddleFileName(value: string): string {
  const maxLength = 38;
  if (value.length <= maxLength) return value;
  const dotIndex = value.lastIndexOf(".");
  const extension = dotIndex > 0 ? value.slice(dotIndex) : "";
  const basename = extension ? value.slice(0, dotIndex) : value;
  const headLength = Math.max(10, Math.floor((maxLength - extension.length - 3) * 0.48));
  const tailLength = Math.max(8, maxLength - extension.length - 3 - headLength);
  if (basename.length <= headLength + tailLength + 3) return value;
  return `${basename.slice(0, headLength)}...${basename.slice(-tailLength)}${extension}`;
}

function isDirectoryPath(value: string): boolean {
  return value.trim().endsWith("/");
}
