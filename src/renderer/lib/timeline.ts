import type {
  TaskAgentTimelineItem,
  TimelineActivityKind,
  TimelineDisplayEntry,
  ToolCallPayload,
  UclawRunStreamItem,
} from "@/types/domain";

export function normalizeTimelineItem(item: UclawRunStreamItem): TaskAgentTimelineItem | null {
  if (item.type === "reasoning_summary_delta" || item.type === "reasoning_summary_done") {
    return {
      id: item.id,
      kind: item.type === "reasoning_summary_done" ? "thinking_done" : "thinking_delta",
      phase: item.type === "reasoning_summary_done" ? "done" : "delta",
      title: "Thinking",
      detail: item.detail || item.delta || "",
      status: item.status,
      tone: "thinking",
    };
  }

  if (item.type === "tool_call_started" || item.type === "tool_call_completed") {
    if (!item.tool_call) return null;
    const phase = item.type === "tool_call_completed" ? "result" : "start";
    const summary = summarizeToolTimeline(item.tool_call, phase);
    return {
      id: item.id,
      kind: phase === "result" ? "tool_result" : "tool_start",
      phase,
      title: summary.title,
      detail: summary.detail,
      status: item.status,
      tone: "tool",
      toolCall: item.tool_call,
    };
  }

  if (item.type === "tool_approval_required") {
    return {
      id: item.id,
      kind: "tool_approval",
      phase: "approval",
      title: "等待确认",
      detail: item.detail || item.approval?.toolName || "",
      status: "waiting_approval",
      tone: "tool",
      approval: item.approval,
    };
  }

  if (item.type === "tool_approval_resolved") {
    return {
      id: item.id,
      kind: "tool_approval_resolved",
      phase: "result",
      title: "Approval resolved",
      detail: item.detail || "",
      status: "done",
      tone: "tool",
      approval: item.approval,
    };
  }

  if (item.type === "ask_user_requested" || item.type === "ask_user_resolved") {
    return {
      id: item.id,
      kind: item.type,
      phase: item.type === "ask_user_resolved" ? "result" : "approval",
      title: item.title || (item.type === "ask_user_resolved" ? "User answered" : "Needs input"),
      detail: item.detail || item.ask_user?.question || "",
      status: item.status,
      tone: "meta",
      askUser: item.ask_user,
      payload: item as unknown as Record<string, unknown>,
    };
  }

  if (item.type === "context_snapshot" || item.type === "context_compaction" || item.type === "attachments_loaded") {
    return {
      id: item.id,
      kind: item.type,
      phase: "done",
      title: item.title || (item.type === "context_snapshot" ? "Context loaded" : item.type),
      detail: item.detail || "",
      status: item.status,
      tone: "meta",
      payload: item as unknown as Record<string, unknown>,
    };
  }

  if (item.type === "error") {
    return {
      id: item.id,
      kind: "error",
      phase: "error",
      title: item.title || "Agent failed",
      detail: item.detail || "",
      status: item.status,
      tone: "meta",
    };
  }

  return null;
}

export function mergeTimelineItem(prev: TaskAgentTimelineItem[], item: TaskAgentTimelineItem): TaskAgentTimelineItem[] {
  if (prev.some((entry) => entry.id === item.id)) return prev;
  if (item.tone === "thinking") {
    const last = prev[prev.length - 1];
    if (last?.tone === "thinking" && item.phase === "delta") {
      return [...prev.slice(0, -1), { ...last, detail: `${last.detail}${item.detail}` }];
    }
  }
  if (item.kind === "tool_approval_resolved" && item.approval?.id) {
    const index = prev.findIndex((entry) => entry.approval?.id === item.approval?.id);
    if (index >= 0) {
      const next = [...prev];
      next[index] = {
        ...next[index],
        id: item.id,
        phase: "result",
        detail: item.detail || next[index].detail,
        status: "done",
      };
      return next;
    }
  }
  if (item.tone === "tool") {
    if (!item.toolCall) return [...prev, item];
    const callId = item.toolCall?.call_id;
    if (callId && item.phase === "result") {
      const index = prev.findIndex((entry) => entry.toolCall?.call_id === callId);
      if (index >= 0) {
        const next = [...prev];
        next[index] = {
          ...next[index],
          ...item,
          toolCall: {
            ...item.toolCall,
            result: {
              ...(next[index].toolCall?.result || {}),
              ...(item.toolCall.result || {}),
            },
          },
        };
        return next;
      }
    }
  }
  return [...prev, item];
}

export function buildTimelineDisplayEntries(items: TaskAgentTimelineItem[]): TimelineDisplayEntry[] {
  const entries: TimelineDisplayEntry[] = [];
  let groupItems: TaskAgentTimelineItem[] = [];
  let groupKind: TimelineActivityKind | null = null;

  const flush = () => {
    if (!groupKind || groupItems.length === 0) return;
    const summary = summarizeActivityGroup(groupKind, groupItems);
    entries.push({
      type: "group",
      id: `${groupKind}-${groupItems[0].id}`,
      kind: groupKind,
      items: groupItems,
      title: summary.title,
      detail: summary.detail,
      defaultOpen: summary.defaultOpen,
    });
    groupItems = [];
    groupKind = null;
  };

  for (const item of items) {
    const kind = timelineActivityKind(item);
    if (!kind) {
      flush();
      entries.push({ type: "item", item });
      continue;
    }
    if (groupKind && groupKind !== kind) flush();
    groupKind = kind;
    groupItems.push(item);
  }
  flush();
  return entries;
}

export function timelineActivityKind(item: TaskAgentTimelineItem): TimelineActivityKind | null {
  if (item.kind === "tool_approval" || item.kind === "tool_approval_resolved") return "approval";
  if (item.tone !== "tool" || !item.toolCall) return null;
  const toolName = item.toolCall.tool_name;
  if (toolName.includes("skill")) return "skill";
  if (toolName.includes("rag") || toolName.includes("search") || toolName.includes("read") || toolName.includes("list")) return "explore";
  if (toolName.includes("patch") || toolName.includes("write") || toolName.includes("delete") || toolName.includes("move")) return "edit";
  if (toolName.includes("shell") || toolName.includes("git")) return "run";
  return "meta";
}

export function summarizeActivityGroup(kind: TimelineActivityKind, items: TaskAgentTimelineItem[]) {
  if (kind === "skill") return { title: "Loaded skills", detail: `${items.length} skill actions` };
  if (kind === "explore") return { title: "Explored context", detail: compactToolLine(items[items.length - 1]) };
  if (kind === "edit") return { title: "Edited workspace", detail: compactToolLine(items[items.length - 1]), defaultOpen: true };
  if (kind === "run") return { title: "Ran command", detail: compactToolLine(items[items.length - 1]), defaultOpen: true };
  if (kind === "approval") return { title: "Waiting for approval", detail: items[0].detail, defaultOpen: true };
  return { title: "Tool activity", detail: `${items.length} steps` };
}

export function compactToolLine(item: TaskAgentTimelineItem): string {
  const tool = item.toolCall;
  if (!tool) return item.detail || item.title;
  const args = tool.arguments || {};
  const result = tool.result || {};
  if (tool.tool_name === "rag_search") {
    return result.count ? `${String(args.query || "course materials")} · ${String(result.count)} results` : String(args.query || item.detail);
  }
  return item.detail || tool.tool_name.replace(/_/g, " ");
}

function summarizeToolTimeline(tool: ToolCallPayload, phase: "start" | "result") {
  const name = tool.tool_name;
  const args = tool.arguments || {};
  const result = tool.result || {};
  if (phase === "start") {
    if (name === "rag_search") return { title: "正在检索知识库", detail: String(args.query || "course materials") };
    if (name.includes("git")) return { title: "正在查看 Git", detail: String(args.path || "workspace") };
    if (name.includes("patch") || name.includes("write")) return { title: "正在编辑", detail: String(args.path || "workspace") };
    return { title: "正在调用工具", detail: name.replace(/_/g, " ") };
  }
  if (name === "rag_search") return { title: "已检索知识库", detail: `${String(result.count || 0)} 个结果` };
  return { title: `已调用 ${name.replace(/_/g, " ")}`, detail: itemResultDetail(result) };
}

function itemResultDetail(result: Record<string, unknown>): string {
  if (result.ok === false) return String(result.error || "failed");
  if (result.count) return `${String(result.count)} results`;
  return "completed";
}
