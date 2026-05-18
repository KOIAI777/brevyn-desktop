import { formatDiffStats, recordObject, stringValue, toolDiffStats, type ProcessEvent } from "@/components/agent/agentTimelineModel";

const FILE_EDIT_TOOL_NAMES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface ChangedFileSummary {
  path: string;
  name: string;
  additions: number;
  deletions: number;
  edits: number;
  hunks: ChangedFileHunk[];
}

export interface ChangedFileHunk {
  id: string;
  label?: string;
  rows: ChangedFileDiffRow[];
  truncatedRows?: number;
}

export interface ChangedFileDiffRow {
  type: "added" | "removed" | "context";
  lineNumber: number;
  text: string;
}

export function changedFilesFromProcessEvents(events: ProcessEvent[]): ChangedFileSummary[] {
  const byPath = new Map<string, ChangedFileSummary>();
  for (const event of events) {
    if (event.kind !== "tool_use") continue;
    if (!FILE_EDIT_TOOL_NAMES.has(event.tool.name)) continue;
    if (!event.result || event.result.isError) continue;
    const data = recordObject(event.tool.input);
    const path = stringValue(data.file_path ?? data.filePath ?? data.path ?? data.notebook_path, "");
    if (!path) continue;
    const diff = toolDiffStats(event.tool.name, event.tool.input);
    if (!diff) continue;
    const hunks = diffHunksForTool(event.tool.name, data, `${event.id}-${path}`);
    const existing = byPath.get(path);
    if (existing) {
      existing.additions += diff.additions;
      existing.deletions += diff.deletions;
      existing.edits += 1;
      existing.hunks.push(...hunks);
      continue;
    }
    byPath.set(path, {
      path,
      name: fileName(path),
      additions: diff.additions,
      deletions: diff.deletions,
      edits: 1,
      hunks,
    });
  }
  return [...byPath.values()];
}

export function changedFileTotals(changes: ChangedFileSummary[]): string {
  return formatDiffStats(changes.reduce(
    (acc, change) => ({
      additions: acc.additions + change.additions,
      deletions: acc.deletions + change.deletions,
    }),
    { additions: 0, deletions: 0 },
  ));
}

function diffHunksForTool(toolName: string, input: Record<string, unknown>, idPrefix: string): ChangedFileHunk[] {
  if (toolName === "Write") {
    const content = typeof input.content === "string" ? input.content : "";
    const rows = rowsFromText(content, "added", 1);
    return rows.length > 0 ? [clampHunk({ id: `${idPrefix}-write`, label: "Write", rows })] : [];
  }
  if (toolName === "Edit") {
    const rows = editRows(input);
    return rows.length > 0 ? [clampHunk({ id: `${idPrefix}-edit`, label: "Edit", rows })] : [];
  }
  if (toolName === "MultiEdit") {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return edits.flatMap((edit, index) => {
      const rows = editRows(recordObject(edit));
      return rows.length > 0 ? [clampHunk({ id: `${idPrefix}-edit-${index}`, label: `Edit ${index + 1}`, rows })] : [];
    });
  }
  return [];
}

function editRows(input: Record<string, unknown>): ChangedFileDiffRow[] {
  const oldString = typeof input.old_string === "string" ? input.old_string : "";
  const newString = typeof input.new_string === "string" ? input.new_string : "";
  const startLine = numericValue(input.line_number ?? input.start_line ?? input.startLine) ?? 1;
  return [
    ...rowsFromText(oldString, "removed", startLine),
    ...rowsFromText(newString, "added", startLine),
  ];
}

function rowsFromText(value: string, type: ChangedFileDiffRow["type"], startLine: number): ChangedFileDiffRow[] {
  if (!value) return [];
  return value.split("\n").map((line, index) => ({
    type,
    lineNumber: startLine + index,
    text: line,
  }));
}

function clampHunk(hunk: ChangedFileHunk): ChangedFileHunk {
  const maxRows = 220;
  if (hunk.rows.length <= maxRows) return hunk;
  return {
    ...hunk,
    rows: hunk.rows.slice(0, maxRows),
    truncatedRows: hunk.rows.length - maxRows,
  };
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  return null;
}

function fileName(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) || path;
}
