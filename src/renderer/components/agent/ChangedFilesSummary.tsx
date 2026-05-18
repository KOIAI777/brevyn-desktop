import { useContext, useState } from "react";
import { ChevronDown } from "lucide-react";
import { changedFileTotals, type ChangedFileDiffRow, type ChangedFileSummary } from "@/components/agent/agentChangedFilesModel";
import { AgentThreadIdContext } from "@/components/agent/AgentThreadContext";
import { DiffStatsText } from "@/components/agent/AgentToolRenderers";
import { useFilePathPreviewHandler } from "@/components/chat/FilePathChip";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { formatDiffStats } from "@/components/agent/agentTimelineModel";

export function ChangedFilesSummary({ changes }: { changes: ChangedFileSummary[] }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const threadId = useContext(AgentThreadIdContext);
  const onPreviewFilePath = useFilePathPreviewHandler();
  const totals = changedFileTotals(changes);

  async function openPath(path: string) {
    if (onPreviewFilePath) {
      await onPreviewFilePath(path);
      return;
    }
    if (!threadId) return;
    await window.brevyn.app.openWorkspacePath({ threadId, path });
  }

  function togglePath(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/75 bg-card/72 shadow-sm ring-1 ring-white/50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-accent/30"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="min-w-0 text-sm font-semibold text-foreground">
          {changes.length} 个文件已更改 <DiffStatsText value={totals} />
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
      </button>
      <div className={`${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`}>
        <div className="min-h-0 overflow-hidden">
          <div className="divide-y divide-border/55 border-t border-border/60">
            {changes.map((change) => {
              const fileExpanded = expandedPaths.has(change.path);
              return (
                <div key={change.path} className="min-w-0">
                  <div className="flex w-full min-w-0 items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-accent/30">
                    <button
                      type="button"
                      className="inline-flex min-w-0 items-center gap-2 text-left"
                      title={change.path}
                      onClick={() => void openPath(change.path)}
                    >
                      <FileTypeIcon name={change.name} size={16} />
                      <span className="min-w-0 truncate text-sm font-medium text-foreground hover:text-sky-800">{change.name}</span>
                      {change.edits > 1 && (
                        <span className="shrink-0 rounded-full border bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {change.edits} 次
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-accent/60"
                      title={fileExpanded ? "收起 diff" : "展开 diff"}
                      onClick={() => togglePath(change.path)}
                    >
                      <DiffStatsText value={formatDiffStats(change)} />
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${fileExpanded ? "" : "-rotate-90"}`} />
                    </button>
                  </div>
                  <div className={`${fileExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`}>
                    <div className="min-h-0 overflow-hidden">
                      <ChangedFileDiffPreview change={change} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangedFileDiffPreview({ change }: { change: ChangedFileSummary }) {
  if (change.hunks.length === 0) {
    return (
      <div className="border-t border-border/50 px-3.5 py-2 text-xs text-muted-foreground">
        暂无可展示的行级 diff。
      </div>
    );
  }

  return (
    <div className="border-t border-border/55 bg-zinc-950/[0.035]">
      <div className="max-h-80 overflow-auto brevyn-scrollbar">
        {change.hunks.map((hunk, index) => (
          <div key={hunk.id} className={index > 0 ? "border-t border-border/60" : undefined}>
            {(change.hunks.length > 1 || hunk.label) && (
              <div className="sticky top-0 z-10 border-b border-border/50 bg-card/90 px-3 py-1.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
                {hunk.label || `Change ${index + 1}`}
              </div>
            )}
            <div className="min-w-[42rem]">
              {hunk.rows.map((row, rowIndex) => (
                <ChangedFileDiffLine key={`${hunk.id}-${rowIndex}`} row={row} />
              ))}
              {hunk.truncatedRows ? (
                <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  已隐藏 {hunk.truncatedRows} 行，完整内容可打开文件查看。
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangedFileDiffLine({ row }: { row: ChangedFileDiffRow }) {
  const tone = row.type === "added"
    ? "border-l-emerald-400 bg-emerald-500/12 text-emerald-700"
    : row.type === "removed"
      ? "border-l-red-400 bg-red-500/12 text-red-700"
      : "border-l-transparent text-foreground/85";
  const marker = row.type === "added" ? "+" : row.type === "removed" ? "-" : " ";
  return (
    <div className={`grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] border-l-2 font-mono leading-6 ${tone}`}>
      <span className="select-none border-r border-border/50 pr-3 text-right text-muted-foreground/80">{row.lineNumber}</span>
      <span className="select-none text-center text-muted-foreground/70">{marker}</span>
      <code className="min-w-0 whitespace-pre-wrap break-words pr-3 text-[11px]">{row.text || "\u00A0"}</code>
    </div>
  );
}
