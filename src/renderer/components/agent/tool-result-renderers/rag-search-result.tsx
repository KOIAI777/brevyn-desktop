import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { ToolDetailsShell } from "@/components/agent/tool-cards/shared";
import { getParsedToolResult, recordObject, stringValue } from "@/components/agent/tool-cards/toolModel";

interface RagEvidence {
  fileName: string;
  path: string;
  chunkIndex?: number;
  chunkCount?: number;
  score?: number;
  text: string;
  citation?: string;
}

export function RagSearchResultDetails({
  toolUse,
  result,
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
} & ToolCardHelpers) {
  const query = stringValue(recordObject(toolUse.input).query, "course materials");
  const parsed = parseRagOutput(result);
  return (
    <ToolDetailsShell className="px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Query</p>
      <p className="mt-1 break-words text-xs leading-5 text-foreground">"{query}"</p>
      {result && (
        <div className="mt-3 space-y-1.5 [contain:layout_paint_style]">
          {parsed.results.length > 0 ? (
            parsed.results.map((item, index) => (
              <div
                key={`${item.path}-${item.chunkIndex ?? index}-${index}`}
                className="min-w-0 rounded-lg px-2 py-1.5 text-xs text-foreground transition hover:bg-accent/35 [contain:layout_paint_style]"
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
    </ToolDetailsShell>
  );
}

function parseRagOutput(result: ToolResultBlock | undefined): { count: number; results: RagEvidence[] } {
  if (!result) return { count: 0, results: [] };
  const root = recordObject(getParsedToolResult(result));
  const rawResults = Array.isArray(root.results) ? root.results : [];
  const results = rawResults.map((item) => {
    const record = recordObject(item);
    return {
      fileName: stringValue(record.fileName, stringValue(record.file_name, "")),
      path: stringValue(record.path, ""),
      chunkIndex: numberValue(record.chunkIndex ?? record.chunk_index),
      chunkCount: numberValue(record.chunkCount ?? record.chunk_count),
      score: numberValue(record.score),
      text: stringValue(record.text, stringValue(record.excerpt, "")),
      citation: stringValue(record.citation, ""),
    };
  });
  return {
    count: numberValue(root.count) ?? results.length,
    results,
  };
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
  if (typeof item.chunkIndex === "number" && typeof item.chunkCount === "number") return `chunk ${item.chunkIndex + 1}/${item.chunkCount}`;
  if (typeof item.chunkIndex === "number") return `chunk ${item.chunkIndex + 1}`;
  return item.citation || "evidence";
}
