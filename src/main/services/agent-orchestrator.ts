import type {
  AgentPendingRequests,
  AgentRunInput,
  AgentRuntimeStatus,
  ChatMessage,
  RunStatus,
  TaskAgentTimelineItem,
  UclawRunStreamItem,
} from "../../types/domain";
import type { AgentRunItemDraft } from "./agent-event-log";
import { AgentAskUserService } from "./agent-ask-user-service";
import { AgentEventBus } from "./agent-event-bus";
import { AgentPermissionService } from "./agent-permission-service";
import type { AgentRuntimeAdapter } from "./agent-runtime-adapter";
import { LocalStore } from "./local-store";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ActiveRun {
  runId: string;
  threadId: string;
  cancelled: boolean;
  controller: AbortController;
}

class RunCancelledError extends Error {
  constructor() {
    super("Run cancelled");
  }
}

function now(): string {
  return new Date().toISOString();
}

export class AgentOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly activeThreadRuns = new Map<string, string>();

  constructor(
    private readonly store: LocalStore,
    private readonly eventBus: AgentEventBus,
    private readonly permissionService: AgentPermissionService,
    private readonly askUserService: AgentAskUserService,
    private readonly runtimeAdapter?: AgentRuntimeAdapter,
  ) {}

  async run(input: AgentRunInput): Promise<{ runId: string }> {
    const existingRunId = this.activeThreadRuns.get(input.threadId);
    if (existingRunId) {
      this.eventBus.emit({
        id: `${existingRunId}-already-running`,
        type: "error",
        runId: existingRunId,
        threadId: input.threadId,
        status: "running",
        title: "Agent already running",
        detail: "This thread already has an active run.",
      });
      return { runId: existingRunId };
    }

    const runId = `run-${Date.now().toString(36)}`;
    const assistantMessageId = `assistant-${Date.now().toString(36)}`;
    const state: ActiveRun = {
      runId,
      threadId: input.threadId,
      cancelled: false,
      controller: new AbortController(),
    };
    this.activeRuns.set(runId, state);
    this.activeThreadRuns.set(input.threadId, runId);

    const timeline: TaskAgentTimelineItem[] = [];
    let assistantContent = "";

    const userMessage: ChatMessage = {
      id: `user-${Date.now().toString(36)}`,
      threadId: input.threadId,
      role: "user",
      createdAt: now(),
      content: input.message,
    };
    this.store.appendMessage(userMessage);
    this.store.appendMessage({
      id: assistantMessageId,
      threadId: input.threadId,
      role: "assistant",
      createdAt: now(),
      content: "",
      timeline,
    });

    void this.executeRun(input, state, assistantMessageId, timeline, (content) => {
      assistantContent = content;
      return assistantContent;
    });

    return { runId };
  }

  async stop(runId: string): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;
    state.cancelled = true;
    state.controller.abort();
    this.permissionService.clearRun(runId);
    this.askUserService.clearRun(runId);
  }

  async approve(approvalId: string): Promise<void> {
    const resolution = this.permissionService.approve(approvalId);
    if (!resolution) return;
    if (!resolution.request.runId || !resolution.request.threadId) return;
    this.eventBus.emit({
      id: `${approvalId}-resolved`,
      type: "tool_approval_resolved",
      runId: resolution.request.runId,
      threadId: resolution.request.threadId,
      status: "running",
      title: "Approval resolved",
      detail: "approved",
      approval: resolution.request,
    });
  }

  async reject(approvalId: string): Promise<void> {
    const resolution = this.permissionService.reject(approvalId);
    if (!resolution) return;
    if (!resolution.request.runId || !resolution.request.threadId) return;
    this.eventBus.emit({
      id: `${approvalId}-resolved`,
      type: "tool_approval_resolved",
      runId: resolution.request.runId,
      threadId: resolution.request.threadId,
      status: "running",
      title: "Approval resolved",
      detail: "rejected",
      approval: resolution.request,
    });
  }

  async respondAskUser(requestId: string, response: string): Promise<void> {
    const resolution = this.askUserService.respond(requestId, response);
    if (!resolution) return;
    this.eventBus.emit({
      id: `${requestId}-resolved`,
      type: "ask_user_resolved",
      runId: resolution.request.runId,
      threadId: resolution.request.threadId,
      status: "running",
      title: "User answered",
      detail: response,
      ask_user: resolution.request,
    });
  }

  events(threadId: string, afterSeq = 0): UclawRunStreamItem[] {
    return this.eventBus.replay(threadId, afterSeq);
  }

  pendingRequests(): AgentPendingRequests {
    return {
      approvals: this.permissionService.getPendingRequests(),
      askUsers: this.askUserService.getPendingRequests(),
    };
  }

  runtimeStatus(): AgentRuntimeStatus {
    return (
      this.runtimeAdapter?.status() || {
        configured: false,
        source: "none",
        title: "Agent runtime unavailable",
        detail: "No Agent runtime adapter has been registered.",
      }
    );
  }

  private async executeRun(
    input: AgentRunInput,
    state: ActiveRun,
    assistantMessageId: string,
    timeline: TaskAgentTimelineItem[],
    setAssistantContent: (content: string) => string,
  ): Promise<void> {
    let assistantContent = "";
    const emit = (draft: AgentRunItemDraft) => this.eventBus.emit(draft);

    try {
      emit({
        id: `${state.runId}-started`,
        type: "turn_started",
        runId: state.runId,
        threadId: input.threadId,
        messageId: assistantMessageId,
        status: "starting",
        title: "Turn started",
        detail: "Preparing Course Workspace Agent.",
      });

      await this.wait(220, state);
      const context = this.store.contextReport(input.threadId);
      emit({
        id: `${state.runId}-context`,
        type: "context_snapshot",
        runId: state.runId,
        threadId: input.threadId,
        status: "running",
        title: "Context window",
        detail: `${context.tokens.toLocaleString()} tokens · ${context.files.length} files · ${context.skills.length} skills`,
        context,
      });

      if (!this.runtimeAdapter?.isConfigured()) {
        const status = this.runtimeStatus();
        throw new Error(status.detail || "Agent runtime is not configured.");
      }

      await this.executeRuntimeRun(input, state, assistantMessageId, timeline, setAssistantContent, context, emit);
    } catch (error) {
      const cancelled = state.cancelled || error instanceof RunCancelledError;
      const message = error instanceof Error ? error.message : String(error);
      emit({
        id: `${state.runId}-error`,
        type: "error",
        runId: state.runId,
        threadId: input.threadId,
        status: cancelled ? "cancelled" : "failed",
        title: cancelled ? "已停止" : "Agent failed",
        detail: cancelled ? "Run cancelled" : message,
      });
      emitStatus(emit, state.runId, input.threadId, cancelled ? "cancelled" : "failed");
    } finally {
      this.permissionService.clearRun(state.runId);
      this.askUserService.clearRun(state.runId);
      this.activeRuns.delete(state.runId);
      if (this.activeThreadRuns.get(state.threadId) === state.runId) {
        this.activeThreadRuns.delete(state.threadId);
      }
    }
  }

  private async executeRuntimeRun(
    input: AgentRunInput,
    state: ActiveRun,
    assistantMessageId: string,
    timeline: TaskAgentTimelineItem[],
    setAssistantContent: (content: string) => string,
    context: ReturnType<LocalStore["contextReport"]>,
    emit: (draft: AgentRunItemDraft) => UclawRunStreamItem,
  ): Promise<void> {
    let assistantContent = "";
    const emitRuntime = (draft: AgentRunItemDraft) => {
      const item = emit(draft);
      const timelineItem = timelineItemFromEvent(item);
      if (timelineItem) {
        mergeServerTimeline(timeline, timelineItem);
        this.store.updateAssistantMessage(assistantMessageId, assistantContent, timeline);
      }
      return item;
    };

    const result = await this.runtimeAdapter!.run(
      {
        ...input,
        runId: state.runId,
        assistantMessageId,
        signal: state.controller.signal,
      },
      {
        emit: emitRuntime,
        onAssistantDelta: (delta) => {
          this.assertActive(state);
          assistantContent += delta;
          emitRuntime({
            id: `${state.runId}-delta-${assistantContent.length}`,
            type: "assistant_message_delta",
            runId: state.runId,
            threadId: input.threadId,
            messageId: assistantMessageId,
            status: "running",
            delta,
          });
          this.store.updateAssistantMessage(assistantMessageId, setAssistantContent(assistantContent), timeline);
        },
      },
    );

    assistantContent = result.content || assistantContent;
    this.store.updateAssistantMessage(assistantMessageId, setAssistantContent(assistantContent), timeline);
    emitRuntime({
      id: `${state.runId}-done`,
      type: "assistant_message_done",
      runId: state.runId,
      threadId: input.threadId,
      messageId: assistantMessageId,
      status: "completed",
      content: assistantContent,
    });
    emitRuntime({
      id: `${state.runId}-metrics`,
      type: "response_metrics",
      runId: state.runId,
      threadId: input.threadId,
      status: "completed",
      title: "Response metrics",
      detail: "OpenAI Agents SDK stream completed",
      metrics: {
        input_tokens: context.tokens,
        ...result.metrics,
      },
    });
    emitStatus(emitRuntime, state.runId, input.threadId, "completed");
  }

  private async wait(ms: number, state: ActiveRun): Promise<void> {
    await delay(ms);
    this.assertActive(state);
  }

  private assertActive(state: ActiveRun): void {
    if (state.cancelled || state.controller.signal.aborted) {
      throw new RunCancelledError();
    }
  }
}

function emitStatus(
  emit: (draft: AgentRunItemDraft) => void,
  runId: string,
  threadId: string,
  status: RunStatus,
): void {
  emit({
    id: `${runId}-status-${status}`,
    type: "run_status_changed",
    runId,
    threadId,
    status,
    title: "Run status",
    detail: status,
  });
}

function timelineItemFromEvent(item: UclawRunStreamItem): TaskAgentTimelineItem | null {
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
    return {
      id: item.id,
      kind: item.type === "tool_call_completed" ? "tool_result" : "tool_start",
      phase: item.type === "tool_call_completed" ? "result" : "start",
      title: item.title || "Tool",
      detail: item.detail || item.tool_call.tool_name,
      status: item.status,
      tone: "tool",
      toolCall: item.tool_call,
    };
  }
  if (item.type === "tool_approval_required" || item.type === "tool_approval_resolved") {
    return {
      id: item.id,
      kind: item.type === "tool_approval_required" ? "tool_approval" : "tool_approval_resolved",
      phase: item.type === "tool_approval_required" ? "approval" : "result",
      title: item.title || "Approval",
      detail: item.detail || item.approval?.toolName || "",
      status: item.status,
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
      status: item.type === "ask_user_resolved" ? "done" : item.status,
      tone: "meta",
      askUser: item.ask_user,
    };
  }
  if (item.type === "context_snapshot" || item.type === "context_compaction" || item.type === "attachments_loaded") {
    return {
      id: item.id,
      kind: item.type,
      phase: "done",
      title: item.title || item.type,
      detail: item.detail || "",
      status: item.status,
      tone: "meta",
    };
  }
  return null;
}

function mergeServerTimeline(timeline: TaskAgentTimelineItem[], item: TaskAgentTimelineItem): void {
  if (timeline.some((entry) => entry.id === item.id)) return;
  if (item.toolCall?.call_id && item.phase === "result") {
    const index = timeline.findIndex((entry) => entry.toolCall?.call_id === item.toolCall?.call_id);
    if (index >= 0) {
      timeline[index] = {
        ...timeline[index],
        ...item,
        toolCall: {
          ...item.toolCall,
          result: {
            ...(timeline[index].toolCall?.result || {}),
            ...(item.toolCall.result || {}),
          },
        },
      };
      return;
    }
  }
  if (item.approval?.id && item.kind === "tool_approval_resolved") {
    const index = timeline.findIndex((entry) => entry.approval?.id === item.approval?.id);
    if (index >= 0) {
      timeline[index] = { ...timeline[index], ...item, status: "done" };
      return;
    }
  }
  timeline.push(item);
}
