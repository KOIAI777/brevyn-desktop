import type { ToolCardHelpers, ToolResultBlock } from "./types";
import { CompactProcessCard, ProcessCardHeader } from "./shared";

interface RagEvidence {
  fileName: string;
  path: string;
  chunkIndex?: number;
  chunkCount?: number;
  score?: number;
  text: string;
  citation?: string;
}

export function RagSearchToolCard({
  input,
  result,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: {
  input: unknown;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
} & ToolCardHelpers) {
  const data = helpers.recordObject(input);
  const query = helpers.stringValue(data.query, "course materials");
  const output = result ? helpers.formatToolResultContent(result.content) : "";
  const parsed = parseRagOutput(output, helpers);
  const running = !result;
  const status = running ? "运行中" : result?.isError ? "失败" : `${parsed.count} 条结果`;
  const title = running ? `正在检索课程材料 "${helpers.singleLine(query)}"` : `已检索课程材料 · ${parsed.count} 条结果`;

  if (collapsed) {
    return (
      <CompactProcessCard
        title={title}
        status={status}
        running={running}
        isError={result?.isError}
        onToggleCollapsed={onToggleCollapsed}
      />
    );
  }

  return (
    <div className="overflow-hidden border-l border-border/60 py-1 pl-3 text-xs text-foreground">
      <ProcessCardHeader
        title={<span className="inline-flex min-w-0 items-center gap-2">{helpers.renderToolGlyph("mcp__brevyn__rag_search", "h-3.5 w-3.5 shrink-0")}<span className="min-w-0 truncate">{title}</span></span>}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className="px-1 py-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Query</p>
        <p className="mt-1 break-words text-xs leading-5 text-foreground">"{query}"</p>
        {result && (
          <div className="mt-3 space-y-1.5">
            {result.isError ? (
              <p className="text-xs text-destructive">课程材料检索失败。</p>
            ) : parsed.results.length > 0 ? (
              parsed.results.map((item, index) => (
                <div
                  key={`${item.path}-${item.chunkIndex ?? index}-${index}`}
                  className="min-w-0 rounded-lg px-2 py-1.5 text-xs text-foreground transition hover:bg-accent/35"
                  title={item.path || item.citation}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{item.fileName || item.path || "Course material"}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {scoreLabel(item.score)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {chunkLabel(item)}
                  </div>
                  <p className="mt-1 line-clamp-2 break-words text-[11px] leading-5 text-muted-foreground">
                    {item.text || item.citation || "No preview text returned."}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">没有召回到课程材料。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function parseRagOutput(output: string, helpers: ToolCardHelpers): { count: number; results: RagEvidence[] } {
  try {
    const data = JSON.parse(output) as unknown;
    const root = helpers.recordObject(data);
    const rawResults = Array.isArray(root.results) ? root.results : [];
    const results = rawResults.map((item) => {
      const record = helpers.recordObject(item);
      return {
        fileName: helpers.stringValue(record.fileName, helpers.stringValue(record.file_name, "")),
        path: helpers.stringValue(record.path, ""),
        chunkIndex: numberValue(record.chunkIndex ?? record.chunk_index),
        chunkCount: numberValue(record.chunkCount ?? record.chunk_count),
        score: numberValue(record.score),
        text: helpers.stringValue(record.text, helpers.stringValue(record.excerpt, "")),
        citation: helpers.stringValue(record.citation, ""),
      };
    });
    return {
      count: numberValue(root.count) ?? results.length,
      results,
    };
  } catch {
    return { count: 0, results: [] };
  }
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function scoreLabel(score?: number): string {
  if (typeof score !== "number") return "score";
  return `${Math.round(score * 100)}%`;
}

function chunkLabel(item: RagEvidence): string {
  if (typeof item.chunkIndex === "number" && typeof item.chunkCount === "number") {
    return `chunk ${item.chunkIndex + 1}/${item.chunkCount}`;
  }
  if (typeof item.chunkIndex === "number") return `chunk ${item.chunkIndex + 1}`;
  return item.citation || "evidence";
}
