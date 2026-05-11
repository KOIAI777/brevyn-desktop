import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgentPermissionMode } from "@/types/domain";
import { Markdownish } from "@/components/chat/Markdownish";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: unknown;
  isError: boolean;
}

interface RunSummary {
  runId: string;
  label: string;
  running: boolean;
  status: "running" | "completed" | "stopped" | "failed" | "interrupted";
  permissionMode?: AgentPermissionMode;
  detail?: string;
}

type ProcessEvent =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "narration"; id: string; text: string }
  | { kind: "tool_use"; id: string; tool: ToolUseBlock; result?: ToolResultBlock; approvalDecision?: "allow" | "deny" };

interface ProcessGroup {
  id: string;
  kind: "thinking" | "tools";
  summary: string;
  events: ProcessEvent[];
}

interface TimelineTone {
  text: string;
  dot: string;
  detail: string;
}

interface ProcessTimelineHelpers {
  threadId?: string;
  toolTitle: (toolName: string, input: unknown) => string;
  renderToolTitle: (toolName: string, input: unknown, options?: { isError?: boolean }) => ReactNode;
  toolResultSummary: (tool: ToolResultBlock) => string;
  runSummaryTone: (status: RunSummary["status"]) => TimelineTone;
  renderToolGlyph: (toolName: string, className: string) => ReactNode;
  renderToolUseCard: (event: Extract<ProcessEvent, { kind: "tool_use" }>, onToggle?: () => void) => ReactNode;
}

interface ProcessTimelinePanelProps extends ProcessTimelineHelpers {
  summary: RunSummary;
  events: ProcessEvent[];
  expanded: boolean;
  lockedOpen: boolean;
  onToggle: () => void;
}

export function ProcessTimelinePanel({
  summary,
  events,
  expanded,
  lockedOpen,
  onToggle,
  ...helpers
}: ProcessTimelinePanelProps) {
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => groupProcessEvents(events), [events]);

  function toggleTool(id: string) {
    setExpandedToolIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasTimeline = events.length > 0;
  const isThinkingOnly = summary.running && !hasTimeline;
  const showPendingThinking = summary.running && shouldShowPendingThinking(events);
  const tone = helpers.runSummaryTone(summary.status);

  return (
    <div className="w-full">
      <button
        type="button"
        className={`flex w-fit items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] font-semibold transition-[background-color,color,opacity,transform] duration-300 hover:bg-accent/35 hover:text-foreground disabled:hover:bg-transparent ${tone.text}`}
        onClick={onToggle}
        disabled={lockedOpen}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        {!isThinkingOnly ? (
          <span className="transition-opacity duration-300">{summary.label}</span>
        ) : (
          <span className="taskagent-sweep-text">Thinking</span>
        )}
        {summary.permissionMode && !isThinkingOnly && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
            summary.permissionMode === "full_access"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-border bg-background/70 text-muted-foreground"
          }`}>
            {summary.permissionMode === "full_access" ? "Full Access" : "Review"}
          </span>
        )}
        {!isThinkingOnly && <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />}
      </button>
      {summary.detail && summary.status !== "completed" && !expanded && (
        <p className="mt-0.5 max-w-xl truncate px-1 text-[11px] text-muted-foreground">{summary.detail}</p>
      )}
      <div className="mt-1 h-px w-full bg-gradient-to-r from-border/70 via-border/25 to-transparent" />
      <div className={`${hasTimeline && expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"} grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out`}>
        <div className="min-h-0 overflow-hidden">
          {summary.detail && summary.status !== "completed" && (
            <div className={`mb-2 border-l px-3 py-1.5 text-[11px] leading-5 ${tone.detail}`}>
              {summary.detail}
            </div>
          )}
          <div className="space-y-2">
            {groups.map((group) => (
              <ProcessGroupRow
                key={group.id}
                group={group}
                expanded={expandedToolIds.has(group.id)}
                expandedToolIds={expandedToolIds}
                onToggle={() => toggleTool(group.id)}
                onToggleTool={toggleTool}
                {...helpers}
              />
            ))}
            {showPendingThinking && <PendingThinkingRow />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineProcessTimeline({ events, ...helpers }: { events: ProcessEvent[] } & ProcessTimelineHelpers) {
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => groupProcessEvents(events), [events]);
  if (groups.length === 0) return null;

  function toggleTool(id: string) {
    setExpandedToolIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <ProcessGroupRow
          key={group.id}
          group={group}
          expanded={expandedToolIds.has(group.id)}
          expandedToolIds={expandedToolIds}
          onToggle={() => toggleTool(group.id)}
          onToggleTool={toggleTool}
          {...helpers}
        />
      ))}
    </div>
  );
}

function PendingThinkingRow() {
  return (
    <div className="animate-[process-row-in_220ms_cubic-bezier(0.22,1,0.36,1)_both] px-1 py-1">
      <span className="taskagent-sweep-text text-xs font-semibold">Thinking</span>
    </div>
  );
}

function shouldShowPendingThinking(events: ProcessEvent[]): boolean {
  const last = events.at(-1);
  return last?.kind === "tool_use" && Boolean(last.result);
}

function ProcessGroupRow({
  group,
  expanded,
  expandedToolIds,
  onToggle,
  onToggleTool,
  ...helpers
}: {
  group: ProcessGroup;
  expanded: boolean;
  expandedToolIds: Set<string>;
  onToggle: () => void;
  onToggleTool: (id: string) => void;
} & ProcessTimelineHelpers) {
  if (group.kind === "thinking") {
    return (
      <div className="space-y-1.5 animate-[process-row-in_220ms_cubic-bezier(0.22,1,0.36,1)_both]">
        {group.events.map((event) => (
          <ProcessEventRow
            key={event.id}
            event={event}
            expanded={false}
            {...helpers}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="animate-[process-row-in_220ms_cubic-bezier(0.22,1,0.36,1)_both] text-xs text-muted-foreground">
      <button
        type="button"
        className="flex w-fit max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-[background-color,color,transform] duration-200 hover:bg-accent/35 hover:text-foreground"
        onClick={onToggle}
      >
        {helpers.renderToolGlyph(groupPrimaryToolName(group), "h-3.5 w-3.5 shrink-0")}
        <span className="min-w-0 truncate">{group.summary}</span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </button>
      <div className={`${expanded ? "mt-1.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"} grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-1.5 border-l border-border/60 pl-3">
            {group.events.map((event) => (
              <ProcessEventRow
                key={event.id}
                event={event}
                expanded={event.kind === "tool_use" ? expandedToolIds.has(event.id) : false}
                onToggle={event.kind === "tool_use" ? () => onToggleTool(event.id) : undefined}
                {...helpers}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessEventRow({
  event,
  expanded,
  onToggle,
  ...helpers
}: {
  event: ProcessEvent;
  expanded: boolean;
  onToggle?: () => void;
} & ProcessTimelineHelpers) {
  if (event.kind === "thinking" || event.kind === "narration") {
    return (
      <div className="w-full animate-[process-row-in_220ms_cubic-bezier(0.22,1,0.36,1)_both] px-1 py-1 text-xs leading-5 text-foreground">
        {event.text && (
          <div className="brevyn-thinking-markdown opacity-95">
            <Markdownish content={event.text} threadId={helpers.threadId} />
          </div>
        )}
      </div>
    );
  }

  const title = helpers.renderToolTitle(event.tool.name, event.tool.input, { isError: event.result?.isError });
  const status = event.result ? helpers.toolResultSummary(event.result) : "运行中";
  return (
    <div className="animate-[process-row-in_220ms_cubic-bezier(0.22,1,0.36,1)_both] text-xs text-muted-foreground">
      <div
        role="button"
        tabIndex={0}
        className="flex w-fit max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-[background-color,color,transform] duration-200 hover:bg-accent/35 hover:text-foreground"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle?.();
          }
        }}
      >
        {helpers.renderToolGlyph(event.tool.name, "h-3.5 w-3.5 shrink-0")}
        <span className="min-w-0 truncate">{title}</span>
        {event.approvalDecision && <ApprovalStatusPill decision={event.approvalDecision} />}
        <span className="shrink-0 text-muted-foreground/80">{status}</span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </div>
      <div className={`${expanded ? "mt-1.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"} grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`}>
        <div className="min-h-0 overflow-hidden">
          {helpers.renderToolUseCard(event, onToggle)}
        </div>
      </div>
    </div>
  );
}

function ApprovalStatusPill({ decision }: { decision: "allow" | "deny" }) {
  const approved = decision === "allow";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
      approved
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-red-200 bg-red-50 text-red-700"
    }`}>
      {approved ? "已批准" : "已拒绝"}
    </span>
  );
}

function groupProcessEvents(events: ProcessEvent[]): ProcessGroup[] {
  const groups: ProcessGroup[] = [];
  let currentTools: Array<Extract<ProcessEvent, { kind: "tool_use" }>> = [];
  let groupIndex = 0;

  const flushTools = () => {
    if (currentTools.length === 0) return;
    const first = currentTools[0];
    const last = currentTools[currentTools.length - 1];
    groups.push({
      id: `tools-${first?.id || groupIndex}-${last?.id || groupIndex}`,
      kind: "tools",
      summary: summarizeProcessGroup(currentTools),
      events: currentTools,
    });
    currentTools = [];
    groupIndex += 1;
  };

  for (const event of events) {
    if (event.kind === "thinking" || event.kind === "narration") {
      flushTools();
      groups.push({
        id: `${event.kind}-${event.id || groupIndex}`,
        kind: "thinking",
        summary: event.kind === "thinking" ? "Thinking" : "Narration",
        events: [event],
      });
      groupIndex += 1;
      continue;
    }
    currentTools.push(event);
  }
  flushTools();

  return groups;
}

function summarizeProcessGroup(tools: Array<Extract<ProcessEvent, { kind: "tool_use" }>>): string {
  const explored = tools.filter((event) => event.tool.name === "Read" || event.tool.name === "Glob").length;
  const searched = tools.filter((event) => event.tool.name === "Grep").length;
  const commands = tools.filter((event) => event.tool.name === "Bash").length;
  const edited = tools.filter((event) => ["Write", "Edit", "MultiEdit"].includes(event.tool.name)).length;
  const other = tools.length - explored - searched - commands - edited;
  const parts: string[] = [];
  if (edited) parts.push(`已编辑 ${edited} 个文件`);
  if (explored) parts.push(`已探索 ${explored} 个文件`);
  if (searched) parts.push(`${searched} 次搜索`);
  if (commands) parts.push(`已运行 ${commands} 条命令`);
  if (other) parts.push(`调用 ${other} 个工具`);
  return parts.join(",") || `调用 ${tools.length} 个工具`;
}

function groupPrimaryToolName(group: ProcessGroup): string {
  const firstTool = group.events.find((event): event is Extract<ProcessEvent, { kind: "tool_use" }> => event.kind === "tool_use");
  return firstTool?.tool.name || "Tool";
}
