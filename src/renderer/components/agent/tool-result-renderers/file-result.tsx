import * as React from "react";
import type { FileContents } from "@pierre/diffs";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
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

function PierreDiffFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 max-h-[400px] min-w-0 overflow-auto rounded-xl border border-border/70 bg-background/70 text-[11px] shadow-sm [contain:layout_paint_style] brevyn-scrollbar">
      {children}
    </div>
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
  | { kind: "patch"; patch: string }
  | { kind: "files"; filePath: string; oldContent: string; newContent: string; disableLineNumbers?: boolean };

function PierreDiffSource({ source }: { source: FileDiffSource }) {
  const options = usePierreDiffOptions(source.kind === "files" && source.disableLineNumbers === true);

  if (source.kind === "patch") {
    return (
      <PierreDiffFrame>
        <PatchDiff patch={source.patch} options={options} />
      </PierreDiffFrame>
    );
  }

  return (
    <PierreFileDiff
      filePath={source.filePath}
      oldContent={source.oldContent}
      newContent={source.newContent}
      options={options}
    />
  );
}

function PierreFileDiff({
  filePath,
  oldContent,
  newContent,
  options,
}: {
  filePath: string;
  oldContent: string;
  newContent: string;
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
    <PierreDiffFrame>
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
    return {
      kind: "patch",
      patch: normalizeGitPatch(gitPatch, filePath, stringValue(gitDiff.status, "")),
    };
  }

  const structuredPatch = Array.isArray(raw.structuredPatch) ? raw.structuredPatch : [];
  if (structuredPatch.length > 0) {
    return {
      kind: "patch",
      patch: patchFromStructuredPatch(structuredPatch, filePath, raw.originalFile === null ? "added" : "modified"),
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
    return {
      kind: "files",
      filePath: filePath || "new-file",
      oldContent: originalFile ?? "",
      newContent: content,
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
      return {
        kind: "files",
        filePath: filePath || "file",
        oldContent: originalFile,
        newContent: applyEdit(originalFile, oldString, newString, raw.replaceAll === true),
      };
    }
    if (oldString || newString) {
      return {
        kind: "files",
        filePath: filePath || "file",
        oldContent: oldString,
        newContent: newString,
        disableLineNumbers: true,
      };
    }
  }

  if (toolName === "MultiEdit") {
    const edits = Array.isArray(inputData.edits) ? inputData.edits.map(recordObject) : [];
    const oldContent = edits.map((edit) => typeof edit.old_string === "string" ? edit.old_string : "").join("\n");
    const newContent = edits.map((edit) => typeof edit.new_string === "string" ? edit.new_string : "").join("\n");
    if (!oldContent && !newContent) return null;
    return {
      kind: "files",
      filePath: filePath || "file",
      oldContent,
      newContent,
      disableLineNumbers: true,
    };
  }

  return null;
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
