import type { ToolCardHelpers } from "./types";
import { PreviewBlock, PreviewPill } from "./shared";

export function ToolInputPreview({
  toolName,
  input,
  compact = false,
  ...helpers
}: {
  toolName: string;
  input: unknown;
  compact?: boolean;
} & ToolCardHelpers) {
  const data = helpers.recordObject(input);
  const path = helpers.stringValue(data.file_path ?? data.path, "");
  const command = helpers.stringValue(data.command, "");
  const url = helpers.stringValue(data.url, "");
  const query = helpers.stringValue(data.query, "");
  const pattern = helpers.stringValue(data.pattern, "");
  const content = data.content ?? data.new_string ?? data.new_text ?? data.edits ?? data.todos ?? input;

  if (toolName === "Bash" && command) {
    return (
      <PreviewBlock label="Command" value={command} language="bash" compact={compact} truncatePreview={helpers.truncatePreview} />
    );
  }

  if ((toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") && path) {
    const diff = diffStats(toolName, data);
    return (
      <div className="mt-2">
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-t-xl border border-b-0 border-border/70 bg-muted/35 px-3 py-2 text-xs">
          <span className="min-w-0 truncate font-medium text-foreground" title={path}>
            {fileName(path)}
          </span>
          {diff && <DiffStatsText additions={diff.additions} deletions={diff.deletions} />}
        </div>
        <EditDiffPreview toolName={toolName} input={data} fallback={helpers.formatUnknown(content)} truncatePreview={helpers.truncatePreview} />
      </div>
    );
  }

  if ((toolName === "Read" || toolName === "Glob" || toolName === "Grep") && (path || pattern)) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {path && <PreviewPill label="Path" value={path} />}
        {pattern && <PreviewPill label="Pattern" value={pattern} />}
      </div>
    );
  }

  if (toolName === "WebFetch" && url) {
    return <PreviewPill label="URL" value={url} />;
  }

  if (toolName === "WebSearch" && query) {
    return <PreviewPill label="Query" value={query} />;
  }

  return <PreviewBlock label="Input" value={helpers.formatUnknown(input)} compact={compact} truncatePreview={helpers.truncatePreview} />;
}

interface DiffRow {
  type: "added" | "removed" | "context";
  lineNumber: number;
  text: string;
}

function DiffStatsText({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px]">
      {additions > 0 && <span className="text-emerald-500">+{additions}</span>}
      {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
    </span>
  );
}

function EditDiffPreview({
  toolName,
  input,
  fallback,
  truncatePreview,
}: {
  toolName: string;
  input: Record<string, unknown>;
  fallback: string;
  truncatePreview: (value: string) => string;
}) {
  const hunks = diffHunks(toolName, input);
  if (hunks.length === 0) {
    return <PreviewBlock label={toolName === "Write" ? "Content" : "Change"} value={fallback} compact truncatePreview={truncatePreview} />;
  }

  return (
    <div className="overflow-hidden rounded-b-xl border-x border-b border-border/70 bg-zinc-950/[0.04] text-[11px] shadow-sm">
      {hunks.map((hunk, index) => (
        <div key={hunk.id} className={index > 0 ? "border-t border-border/70" : undefined}>
          {hunks.length > 1 && (
            <div className="border-b border-border/60 bg-muted/35 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
              Change {index + 1}
            </div>
          )}
          <div className="max-h-64 overflow-auto brevyn-scrollbar">
            {hunk.rows.map((row, rowIndex) => (
              <DiffLine key={`${hunk.id}-${rowIndex}`} row={row} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffLine({ row }: { row: DiffRow }) {
  const tone = row.type === "added"
    ? "border-l-emerald-400 bg-emerald-500/12 text-emerald-700"
    : row.type === "removed"
      ? "border-l-red-400 bg-red-500/12 text-red-700"
      : "border-l-transparent text-foreground";
  const marker = row.type === "added" ? "+" : row.type === "removed" ? "-" : " ";
  return (
    <div className={`grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] border-l-2 font-mono leading-6 ${tone}`}>
      <span className="select-none border-r border-border/50 pr-3 text-right text-muted-foreground/80">{row.lineNumber}</span>
      <span className="select-none text-center text-muted-foreground/70">{marker}</span>
      <code className="min-w-0 whitespace-pre-wrap break-words pr-3 text-[11px]">{row.text || "\u00A0"}</code>
    </div>
  );
}

function diffHunks(toolName: string, input: Record<string, unknown>): Array<{ id: string; rows: DiffRow[] }> {
  if (toolName === "Write") {
    const content = typeof input.content === "string" ? input.content : "";
    return content ? [{ id: "write", rows: rowsFromText(content, "added", 1) }] : [];
  }
  if (toolName === "Edit") {
    const rows = editRows(input);
    return rows.length > 0 ? [{ id: "edit", rows }] : [];
  }
  if (toolName === "MultiEdit") {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return edits
      .map((edit, index) => ({ id: `edit-${index}`, rows: editRows(recordObject(edit)) }))
      .filter((hunk) => hunk.rows.length > 0);
  }
  return [];
}

function diffStats(toolName: string, input: Record<string, unknown>): { additions: number; deletions: number } | null {
  const hunks = diffHunks(toolName, input);
  if (hunks.length === 0) return null;
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    additions += hunk.rows.filter((row) => row.type === "added").length;
    deletions += hunk.rows.filter((row) => row.type === "removed").length;
  }
  return additions > 0 || deletions > 0 ? { additions, deletions } : null;
}

function fileName(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) || path;
}

function editRows(input: Record<string, unknown>): DiffRow[] {
  const oldString = typeof input.old_string === "string" ? input.old_string : "";
  const newString = typeof input.new_string === "string" ? input.new_string : "";
  const startLine = numericValue(input.line_number ?? input.start_line ?? input.startLine) ?? 1;
  return [
    ...rowsFromText(oldString, "removed", startLine),
    ...rowsFromText(newString, "added", startLine),
  ];
}

function rowsFromText(value: string, type: DiffRow["type"], startLine: number): DiffRow[] {
  if (!value) return [];
  const lines = value.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line, index) => ({
    type,
    lineNumber: startLine + index,
    text: line,
  }));
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  return null;
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
