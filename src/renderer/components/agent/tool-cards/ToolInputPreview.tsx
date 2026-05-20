import type { ToolCardHelpers } from "./types";
import { PreviewBlock, PreviewPill } from "./shared";
import { formatUnknown, getToolDiffHunks, getToolDiffStats, recordObject, stringValue, type DiffRow } from "@/components/agent/tool-cards/toolModel";

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
  const data = recordObject(input);
  const path = stringValue(data.file_path ?? data.path, "");
  const command = stringValue(data.command, "");
  const url = stringValue(data.url, "");
  const query = stringValue(data.query, "");
  const pattern = stringValue(data.pattern, "");
  const content = data.content ?? data.new_string ?? data.new_text ?? data.edits ?? data.todos ?? input;

  if (toolName === "Bash" && command) {
    return (
      <PreviewBlock label="Command" value={command} language="bash" compact={compact} truncatePreview={helpers.truncatePreview} />
    );
  }

  if ((toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") && path) {
    const diff = getToolDiffStats(toolName, data);
    return (
      <div className="mt-2">
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-t-xl border border-b-0 border-border/70 bg-muted/35 px-3 py-2 text-xs">
          <span className="min-w-0 truncate font-medium text-foreground" title={path}>
            {fileName(path)}
          </span>
          {diff && <DiffStatsText additions={diff.additions} deletions={diff.deletions} />}
        </div>
        <EditDiffPreview toolName={toolName} input={data} fallback={formatUnknown(content)} truncatePreview={helpers.truncatePreview} />
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

  return <PreviewBlock label="Input" value={formatUnknown(input)} compact={compact} truncatePreview={helpers.truncatePreview} />;
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
  const hunks = getToolDiffHunks(toolName, input);
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

function fileName(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) || path;
}
