import * as React from "react";
import type { FileContents } from "@pierre/diffs";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";
import { Check, Copy } from "lucide-react";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { ToolInputPreview } from "@/components/agent/tool-cards/ToolInputPreview";
import { ToolCodeBlock, ToolDetailsShell } from "@/components/agent/tool-cards/shared";
import { getToolResultText, recordObject, stringValue } from "@/components/agent/tool-cards/toolModel";
import { PIERRE_DIFF_CSS } from "@/components/agent/tool-result-renderers/pierre-styles";

export function isFileTool(toolName: string): boolean {
  return toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit";
}

export function FileToolDetails({
  toolUse,
  result,
  ...helpers
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
} & ToolCardHelpers) {
  if (!result) {
    return <ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />;
  }

  if (result.isError) {
    return (
      <>
        <ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />
        <ToolDetailsShell className="mt-2">
          <ToolCodeBlock maxHeight="max-h-44" className="text-[11px] leading-5 text-destructive/80">
            {getToolResultText(result)}
          </ToolCodeBlock>
        </ToolDetailsShell>
      </>
    );
  }

  if (toolUse.name === "Write") {
    return <FileDiffDetails toolName={toolUse.name} input={toolUse.input} result={result} fallback={<ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />} />;
  }

  if (toolUse.name === "Edit") {
    return <FileDiffDetails toolName={toolUse.name} input={toolUse.input} result={result} fallback={<ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />} />;
  }

  if (toolUse.name === "MultiEdit") {
    return <FileDiffDetails toolName={toolUse.name} input={toolUse.input} result={result} fallback={<ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />} />;
  }

  return <ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />;
}

function FileDiffDetails({
  toolName,
  input,
  result,
  fallback,
}: {
  toolName: string;
  input: unknown;
  result: ToolResultBlock;
  fallback: React.ReactNode;
}) {
  const source = React.useMemo(() => fileDiffSource(toolName, input, result), [input, result, toolName]);
  if (!source) return <>{fallback}</>;
  return <PierreDiffSource source={source} />;
}

function PierreDiffFrame({
  children,
  filePath,
  additions,
  deletions,
  copyText,
}: {
  children: React.ReactNode;
  filePath: string;
  additions: number;
  deletions: number;
  copyText?: string;
}) {
  return (
    <div className="mt-2 flex max-h-[400px] min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/95 text-[11px] shadow-sm [contain:layout_paint_style]">
      <DiffFrameHeader filePath={filePath} additions={additions} deletions={deletions} copyText={copyText} />
      <div className="min-h-0 overflow-auto bg-background/70 brevyn-scrollbar">
        {children}
      </div>
    </div>
  );
}

function DiffFrameHeader({
  filePath,
  additions,
  deletions,
  copyText,
}: {
  filePath: string;
  additions: number;
  deletions: number;
  copyText?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const displayName = React.useMemo(() => basename(filePath || "file"), [filePath]);

  async function handleCopy() {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error("[FileDiffDetails] Failed to copy diff:", error);
    }
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-muted/35 px-3">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-foreground/82" title={filePath || displayName}>
        {displayName}
      </span>
      <DiffStat value={additions} tone="add" />
      <DiffStat value={deletions} tone="delete" />
      {copyText && (
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label={copied ? "Diff copied" : "Copy diff"}
          title={copied ? "已复制" : "复制 diff"}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

function DiffStat({ value, tone }: { value: number; tone: "add" | "delete" }) {
  const prefix = tone === "add" ? "+" : "-";
  const color = tone === "add" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <span className={`shrink-0 font-mono text-[12px] font-semibold ${color}`}>
      {prefix}{Math.max(0, value)}
    </span>
  );
}

function usePierreDiffOptions(disableLineNumbers = false) {
  return React.useMemo(() => ({
    diffStyle: "unified" as const,
    theme: { dark: "one-dark-pro" as const, light: "one-light" as const },
    disableLineNumbers,
    disableFileHeader: true,
    diffIndicators: "bars" as const,
    hunkSeparators: "line-info" as const,
    lineDiffType: "none" as const,
    overflow: "scroll" as const,
    themeType: "system" as const,
    unsafeCSS: PIERRE_DIFF_CSS,
  }), [disableLineNumbers]);
}

type FileDiffSource =
  | { kind: "patch"; patch: string; filePath: string; additions: number; deletions: number }
  | { kind: "files"; filePath: string; oldContent: string; newContent: string; patch?: string; additions: number; deletions: number; disableLineNumbers?: boolean };

function PierreDiffSource({ source }: { source: FileDiffSource }) {
  const options = usePierreDiffOptions(source.kind === "files" && source.disableLineNumbers === true);

  if (source.kind === "patch") {
    return (
      <PierreDiffFrame filePath={source.filePath} additions={source.additions} deletions={source.deletions} copyText={source.patch}>
        <PatchDiff patch={source.patch} options={options} />
      </PierreDiffFrame>
    );
  }

  return (
    <PierreFileDiff
      filePath={source.filePath}
      oldContent={source.oldContent}
      newContent={source.newContent}
      patch={source.patch}
      additions={source.additions}
      deletions={source.deletions}
      options={options}
    />
  );
}

function PierreFileDiff({
  filePath,
  oldContent,
  newContent,
  patch,
  additions,
  deletions,
  options,
}: {
  filePath: string;
  oldContent: string;
  newContent: string;
  patch?: string;
  additions: number;
  deletions: number;
  options: ReturnType<typeof usePierreDiffOptions>;
}) {
  const oldFile = React.useMemo<FileContents>(() => ({
    name: filePath || "file",
    contents: oldContent,
    cacheKey: `old:${filePath}:${cheapHash(oldContent)}`,
  }), [filePath, oldContent]);
  const newFile = React.useMemo<FileContents>(() => ({
    name: filePath || "file",
    contents: newContent,
    cacheKey: `new:${filePath}:${cheapHash(newContent)}`,
  }), [filePath, newContent]);

  return (
    <PierreDiffFrame filePath={filePath} additions={additions} deletions={deletions} copyText={patch}>
      <MultiFileDiff oldFile={oldFile} newFile={newFile} options={options} />
    </PierreDiffFrame>
  );
}

function fileDiffSource(toolName: string, input: unknown, result: ToolResultBlock): FileDiffSource | null {
  const raw = recordObject(result.toolUseResult ?? result.rawResult);
  const inputData = recordObject(input);
  const filePath = filePathFrom(raw, inputData);
  const gitDiff = recordObject(raw.gitDiff);
  const gitPatch = stringValue(gitDiff.patch, "");
  if (gitPatch) {
    const patch = normalizeGitPatch(gitPatch, filePath, stringValue(gitDiff.status, ""));
    const stats = diffStatsFromPatch(patch);
    return {
      kind: "patch",
      patch,
      filePath: filePath || filePathFromPatch(patch) || "file",
      additions: stats.additions,
      deletions: stats.deletions,
    };
  }

  const structuredPatch = Array.isArray(raw.structuredPatch) ? raw.structuredPatch : [];
  if (structuredPatch.length > 0) {
    const patch = patchFromStructuredPatch(structuredPatch, filePath, raw.originalFile === null ? "added" : "modified");
    const stats = diffStatsFromPatch(patch);
    return {
      kind: "patch",
      patch,
      filePath: filePath || filePathFromPatch(patch) || "file",
      additions: stats.additions,
      deletions: stats.deletions,
    };
  }

  const originalFile = typeof raw.originalFile === "string" ? raw.originalFile : raw.originalFile === null ? "" : undefined;
  if (toolName === "Write") {
    const content = typeof raw.content === "string"
      ? raw.content
      : typeof inputData.content === "string"
        ? inputData.content
        : "";
    if (!content) return null;
    const oldContent = originalFile ?? "";
    const resolvedFilePath = filePath || "new-file";
    const patch = createUnifiedPatch(oldContent, content, resolvedFilePath, oldContent ? "modified" : "added");
    return {
      kind: "files",
      filePath: resolvedFilePath,
      oldContent,
      newContent: content,
      patch,
      additions: patch ? diffStatsFromPatch(patch).additions : contentLineCount(content),
      deletions: patch ? diffStatsFromPatch(patch).deletions : contentLineCount(oldContent),
    };
  }

  if (toolName === "Edit") {
    const oldString = typeof raw.oldString === "string"
      ? raw.oldString
      : typeof inputData.old_string === "string"
        ? inputData.old_string
        : "";
    const newString = typeof raw.newString === "string"
      ? raw.newString
      : typeof inputData.new_string === "string"
        ? inputData.new_string
        : "";
    if (originalFile !== undefined && oldString) {
      const newContent = applyEdit(originalFile, oldString, newString, raw.replaceAll === true);
      const resolvedFilePath = filePath || "file";
      const patch = createUnifiedPatch(originalFile, newContent, resolvedFilePath, "modified");
      return {
        kind: "files",
        filePath: resolvedFilePath,
        oldContent: originalFile,
        newContent,
        patch,
        additions: patch ? diffStatsFromPatch(patch).additions : contentLineCount(newString),
        deletions: patch ? diffStatsFromPatch(patch).deletions : contentLineCount(oldString),
      };
    }
    if (oldString || newString) {
      const resolvedFilePath = filePath || "file";
      return {
        kind: "files",
        filePath: resolvedFilePath,
        oldContent: oldString,
        newContent: newString,
        additions: contentLineCount(newString),
        deletions: contentLineCount(oldString),
        disableLineNumbers: true,
      };
    }
  }

  if (toolName === "MultiEdit") {
    const edits = Array.isArray(inputData.edits) ? inputData.edits.map(recordObject) : [];
    if (originalFile !== undefined && edits.length > 0) {
      const newContent = applyMultiEdit(originalFile, edits);
      const resolvedFilePath = filePath || "file";
      const patch = createUnifiedPatch(originalFile, newContent, resolvedFilePath, "modified");
      const stats = patch ? diffStatsFromPatch(patch) : { additions: 0, deletions: 0 };
      return {
        kind: "files",
        filePath: resolvedFilePath,
        oldContent: originalFile,
        newContent,
        patch,
        additions: stats.additions,
        deletions: stats.deletions,
      };
    }
    const oldContent = edits.map((edit) => typeof edit.old_string === "string" ? edit.old_string : "").join("\n");
    const newContent = edits.map((edit) => typeof edit.new_string === "string" ? edit.new_string : "").join("\n");
    if (!oldContent && !newContent) return null;
    const resolvedFilePath = filePath || "file";
    return {
      kind: "files",
      filePath: resolvedFilePath,
      oldContent,
      newContent,
      additions: contentLineCount(newContent),
      deletions: contentLineCount(oldContent),
      disableLineNumbers: true,
    };
  }

  return null;
}

function diffStatsFromPatch(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

function filePathFromPatch(patch: string): string {
  const plusMatch = patch.match(/^\+\+\+\s+b\/(.+)$/m);
  if (plusMatch?.[1]) return plusMatch[1].trim();
  const diffMatch = patch.match(/^diff --git\s+a\/.+?\s+b\/(.+)$/m);
  return diffMatch?.[1]?.trim() || "";
}

function contentLineCount(value: string): number {
  if (!value) return 0;
  let count = 1;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) count += 1;
  }
  return value.endsWith("\n") ? Math.max(0, count - 1) : count;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || normalized || "file";
}

function filePathFrom(raw: Record<string, unknown>, input: Record<string, unknown>): string {
  const gitDiff = recordObject(raw.gitDiff);
  return stringValue(raw.filePath ?? raw.file_path ?? gitDiff.filename ?? input.file_path ?? input.filePath ?? input.path, "");
}

function normalizeGitPatch(patch: string, filePath: string, status: string): string {
  const trimmed = patch.trimEnd();
  if (/^diff --git /m.test(trimmed)) return trimmed;
  return patchFromHunks(trimmed, filePath || "file", status || "modified");
}

function createUnifiedPatch(oldContent: string, newContent: string, filePath: string, status: string): string | undefined {
  if (oldContent === newContent) return undefined;
  const safePath = filePath.replace(/\\/g, "/") || "file";
  const patch = createTwoFilesPatch(
    status === "added" ? "/dev/null" : `a/${safePath}`,
    `b/${safePath}`,
    oldContent,
    newContent,
    "",
    "",
    {
      context: 3,
      headerOptions: FILE_HEADERS_ONLY,
      maxEditLength: 20_000,
      stripTrailingCr: true,
    },
  );
  if (!patch) return undefined;
  const body = patch
    .replace(/\t$/gm, "")
    .replace(/^--- \/dev\/null$/m, "--- /dev/null")
    .trimEnd();
  const header = [
    `diff --git a/${safePath} b/${safePath}`,
    status === "added" ? "new file mode 100644" : "",
  ].filter(Boolean);
  return [...header, body].join("\n");
}

function patchFromStructuredPatch(structuredPatch: unknown[], filePath: string, status: string): string {
  const hunks = structuredPatch.flatMap((item) => {
    const patch = recordObject(item);
    const lines = Array.isArray(patch.lines) ? patch.lines.filter((line): line is string => typeof line === "string") : [];
    if (lines.length === 0) return [];
    const oldStart = numericValue(patch.oldStart) ?? 0;
    const oldLines = numericValue(patch.oldLines) ?? 0;
    const newStart = numericValue(patch.newStart) ?? 0;
    const newLines = numericValue(patch.newLines) ?? 0;
    return [`@@ -${rangeSpec(oldStart, oldLines)} +${rangeSpec(newStart, newLines)} @@`, ...lines];
  });
  return patchFromHunks(hunks.join("\n"), filePath || "file", status);
}

function patchFromHunks(hunks: string, filePath: string, status: string): string {
  const safePath = filePath.replace(/\\/g, "/") || "file";
  const added = status === "added" || status === "create" || status === "new";
  const header = [
    `diff --git a/${safePath} b/${safePath}`,
    added ? "new file mode 100644" : "",
    `--- ${added ? "/dev/null" : `a/${safePath}`}`,
    `+++ b/${safePath}`,
  ].filter(Boolean);
  return [...header, hunks].join("\n");
}

function rangeSpec(start: number, lines: number): string {
  return `${Math.max(0, start)},${Math.max(0, lines)}`;
}

function applyEdit(content: string, oldString: string, newString: string, replaceAll: boolean): string {
  if (!oldString) return content;
  return replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString);
}

function applyMultiEdit(content: string, edits: Array<Record<string, unknown>>): string {
  return edits.reduce((current, edit) => {
    const oldString = typeof edit.old_string === "string" ? edit.old_string : "";
    const newString = typeof edit.new_string === "string" ? edit.new_string : "";
    const replaceAll = edit.replace_all === true || edit.replaceAll === true;
    return applyEdit(current, oldString, newString, replaceAll);
  }, content);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
  }
  return null;
}

function cheapHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
}
