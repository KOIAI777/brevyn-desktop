import { Check, ChevronRight, FileText, Library, Search, ShieldCheck, Sparkles, TerminalSquare, Wrench, X } from "lucide-react";
import { useState } from "react";
import type { RunStatus, TaskAgentTimelineItem } from "@/types/domain";
import { cx } from "@/lib/cn";
import { isRunning, timelineStatusText } from "@/lib/run-status";
import { buildTimelineDisplayEntries, compactToolLine } from "@/lib/timeline";
import { Markdownish } from "./Markdownish";

export function TaskAgentTimeline({
  items,
  runStatus,
  collapsed,
  onToggle,
  onApprove,
  onReject,
  onAskUserResponse,
}: {
  items: TaskAgentTimelineItem[];
  runStatus: RunStatus;
  collapsed: boolean;
  onToggle: () => void;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  onAskUserResponse?: (requestId: string, response: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (items.length === 0 && !isRunning(runStatus)) return null;

  const entries = buildTimelineDisplayEntries(items);
  const detailsOpen = runStatus === "waiting_approval" || !collapsed;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-1.5 py-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 border-b border-border/70 px-1 pb-2 pt-0.5 text-left text-[13px] leading-6 text-muted-foreground hover:text-foreground"
      >
        <span className={cx(isRunning(runStatus) && "taskagent-sweep-text")}>{timelineStatusText(runStatus)}</span>
        <ChevronRight className={cx("h-3.5 w-3.5 opacity-60 transition-transform", detailsOpen && "rotate-90")} />
      </button>

      <div className={cx("grid transition-[grid-template-rows,opacity] duration-200", detailsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-1">
            {entries.map((entry) => {
              if (entry.type === "group") {
                const open = expanded[entry.id] ?? Boolean(entry.defaultOpen);
                const Icon = activityIcon(entry.kind);
                const running = entry.items.some((item) => item.status === "running" || item.kind === "tool_start");
                return (
                  <div key={entry.id} className="space-y-1">
                    <button
                      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left text-[13px] leading-6 text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                      onClick={() => setExpanded((current) => ({ ...current, [entry.id]: !open }))}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className={cx("flex min-w-0 items-center gap-1.5", running && "taskagent-sweep-text")}>
                        <span className="shrink-0">{entry.title}</span>
                        <span className="min-w-0 truncate text-muted-foreground/85">{entry.detail}</span>
                      </span>
                      <ChevronRight className={cx("ml-auto h-3.5 w-3.5 opacity-50 transition-transform", open && "rotate-90")} />
                    </button>
                    <div className={cx("grid transition-[grid-template-rows,opacity] duration-200", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <div className="min-h-0 overflow-hidden">
                        <div className="space-y-1.5 border-l border-border/60 pb-1 pl-5 pt-1 text-[13px] text-muted-foreground/90">
                          {entry.items.map((item) => (
                            <TimelineDetail
                              key={item.id}
                              item={item}
                              onApprove={onApprove}
                              onReject={onReject}
                              onAskUserResponse={onAskUserResponse}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              const item = entry.item;
              const Icon = item.tone === "thinking" ? Sparkles : item.kind === "context_snapshot" ? Library : Wrench;
              return (
                <div key={item.id} className="space-y-1">
                  <div className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-[13px] leading-6 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className={cx("flex min-w-0 items-center gap-1.5", item.tone === "thinking" && isRunning(runStatus) && "taskagent-sweep-text")}>
                      <span className="shrink-0">{item.tone === "thinking" ? "正在思考" : item.title}</span>
                      {item.tone !== "thinking" && item.detail && <span className="min-w-0 truncate text-muted-foreground/80">{item.detail}</span>}
                    </span>
                  </div>
                  {item.tone === "thinking" && item.detail && (
                    <div className="border-l border-border/60 pl-5 text-sm leading-7 text-foreground/90">
                      <Markdownish content={item.detail} />
                    </div>
                  )}
                  {item.kind === "ask_user_requested" && (
                    <div className="border-l border-border/60 pl-5">
                      <TimelineDetail item={item} onAskUserResponse={onAskUserResponse} />
                    </div>
                  )}
                </div>
              );
            })}
            {isRunning(runStatus) && !items.some((item) => item.tone === "thinking") && (
              <div className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[13px] leading-6 text-muted-foreground">
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span className="taskagent-sweep-text">正在思考</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineDetail({
  item,
  onApprove,
  onReject,
  onAskUserResponse,
}: {
  item: TaskAgentTimelineItem;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  onAskUserResponse?: (requestId: string, response: string) => void;
}) {
  const [askResponse, setAskResponse] = useState("");

  if (item.kind === "tool_approval" && item.approval) {
    return (
      <div className="rounded-lg border bg-amber-50 px-3 py-2 text-xs text-amber-950">
        <div className="font-medium">{item.approval.title}</div>
        <div className="mt-1 text-amber-900/80">{item.approval.detail}</div>
        {item.status === "done" ? (
          <div className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white/70 px-2 text-[11px] font-medium">
            <Check className="h-3 w-3" />
            {item.detail || "resolved"}
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-600 px-2 text-[11px] font-medium text-white"
              onClick={() => onApprove?.(item.approval?.id || "")}
            >
              <Check className="h-3 w-3" />
              Approve
            </button>
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white/70 px-2 text-[11px] font-medium"
              onClick={() => onReject?.(item.approval?.id || "")}
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </div>
        )}
      </div>
    );
  }

  if (item.kind === "ask_user_requested" && item.askUser) {
    return (
      <div className="rounded-lg border bg-blue-50 px-3 py-2 text-xs text-blue-950">
        <div className="font-medium">{item.askUser.title}</div>
        <div className="mt-1 text-blue-900/80">{item.askUser.question}</div>
        <div className="mt-2 flex gap-2">
          <input
            className="h-7 min-w-0 flex-1 rounded-md border border-blue-200 bg-white/80 px-2 text-[11px] outline-none focus:border-blue-400"
            placeholder={item.askUser.placeholder || "Answer..."}
            value={askResponse}
            onChange={(event) => setAskResponse(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && askResponse.trim()) {
                onAskUserResponse?.(item.askUser?.id || "", askResponse.trim());
                setAskResponse("");
              }
            }}
          />
          <button
            className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-medium text-white disabled:opacity-50"
            disabled={!askResponse.trim()}
            onClick={() => {
              onAskUserResponse?.(item.askUser?.id || "", askResponse.trim());
              setAskResponse("");
            }}
          >
            <Check className="h-3 w-3" />
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 truncate">
      {item.toolCall?.tool_name?.includes("skill") ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/55 px-2 py-0.5 text-xs text-foreground">
          <Check className="h-3 w-3 shrink-0" />
          <span className="truncate">{compactToolLine(item)}</span>
        </span>
      ) : (
        compactToolLine(item)
      )}
    </div>
  );
}

function activityIcon(kind: string) {
  if (kind === "skill") return Sparkles;
  if (kind === "explore") return Search;
  if (kind === "edit") return FileText;
  if (kind === "run") return TerminalSquare;
  if (kind === "approval") return ShieldCheck;
  return Wrench;
}
