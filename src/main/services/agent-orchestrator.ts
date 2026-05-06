import type {
  AgentPendingRequests,
  AgentRunInput,
  AskUserRequest,
  ChatMessage,
  RunStatus,
  TaskAgentTimelineItem,
  UclawRunStreamItem,
} from "../../types/domain";
import type { AgentRunItemDraft } from "./agent-event-log";
import { AgentAskUserService } from "./agent-ask-user-service";
import { AgentEventBus } from "./agent-event-bus";
import { AgentPermissionService } from "./agent-permission-service";
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

      await this.wait(260, state);
      const thinking = emit({
        id: `${state.runId}-thinking-1`,
        type: "reasoning_summary_delta",
        runId: state.runId,
        threadId: input.threadId,
        status: "running",
        title: "Thinking",
        detail: "先定位课程与任务范围，再查本地材料，最后把结论回填到对话。",
      });
      timeline.push({
        id: thinking.id,
        kind: "thinking_delta",
        phase: "delta",
        title: "Thinking",
        detail: thinking.detail || "",
        status: "running",
        tone: "thinking",
      });

      await this.wait(360, state);
      const ragCall = {
        call_id: `${state.runId}-tool-rag`,
        tool_name: "rag_search",
        arguments: { query: input.message, scope: "current course/task" },
      };
      const ragStart = emit({
        id: `${state.runId}-rag-start`,
        type: "tool_call_started",
        runId: state.runId,
        threadId: input.threadId,
        status: "waiting_tool",
        title: "正在检索知识库",
        detail: input.message,
        tool_call: ragCall,
      });
      timeline.push({
        id: ragStart.id,
        kind: "tool_start",
        phase: "start",
        title: "正在检索知识库",
        detail: input.message,
        status: "running",
        tone: "tool",
        toolCall: ragCall,
      });

      await this.wait(520, state);
      const results = this.store.searchRag(input.message);
      const ragDone = emit({
        id: `${state.runId}-rag-done`,
        type: "tool_call_completed",
        runId: state.runId,
        threadId: input.threadId,
        status: "running",
        title: "已检索知识库",
        detail: `${results.length} 个结果`,
        tool_call: {
          ...ragCall,
          result: {
            ok: true,
            count: results.length,
            top: results.slice(0, 2).map((item) => item.citation),
          },
        },
      });
      timeline[timeline.length - 1] = {
        ...timeline[timeline.length - 1],
        id: ragDone.id,
        kind: "tool_result",
        phase: "result",
        title: "已检索知识库",
        detail: `${results.length} 个结果`,
        status: "done",
        toolCall: ragDone.tool_call,
      };

      await this.wait(280, state);
      const skillCall = {
        call_id: `${state.runId}-tool-skills`,
        tool_name: "list_taskagent_skills",
        arguments: { course_id: "current" },
      };
      const skillStart = emit({
        id: `${state.runId}-skills-start`,
        type: "tool_call_started",
        runId: state.runId,
        threadId: input.threadId,
        status: "waiting_tool",
        title: "Loading skills",
        detail: "enabled skills",
        tool_call: skillCall,
      });
      timeline.push({
        id: skillStart.id,
        kind: "tool_start",
        phase: "start",
        title: "Loading skills",
        detail: "enabled skills",
        status: "running",
        tone: "tool",
        toolCall: skillCall,
      });

      await this.wait(260, state);
      const skills = this.store.listSkills().filter((skill) => skill.enabled);
      const skillDone = emit({
        id: `${state.runId}-skills-done`,
        type: "tool_call_completed",
        runId: state.runId,
        threadId: input.threadId,
        status: "running",
        title: "Loaded skills",
        detail: `${skills.length} enabled`,
        tool_call: {
          ...skillCall,
          result: { ok: true, count: skills.length, skills: skills.map((skill) => skill.name) },
        },
      });
      timeline[timeline.length - 1] = {
        ...timeline[timeline.length - 1],
        id: skillDone.id,
        kind: "tool_result",
        phase: "result",
        title: "Loaded skills",
        detail: `${skills.length} enabled`,
        status: "done",
        toolCall: skillDone.tool_call,
      };

      if (shouldAskUser(input.message)) {
        const answer = await this.askUser(input, state, emit);
        timeline.push({
          id: `${state.runId}-ask-user`,
          kind: "ask_user",
          phase: "result",
          title: "User input",
          detail: answer || "No answer supplied.",
          status: "done",
          tone: "meta",
        });
      }

      if (needsApproval(input.message) && input.permissionMode === "review") {
        await this.waitForApproval(input, state, emit, timeline);
      }

      const answer =
        `我先把这版 Electron 工作台按课程业务跑起来了：\n\n` +
        `1. 当前线程通过 main process 读取课程、任务、技能和本地 RAG 范围。\n` +
        `2. RAG 搜索会返回可引用 evidence card，后面可换成 SQLite FTS + embedding。\n` +
        `3. Agent 事件现在先写 thread JSONL，再通过 IPC 推给 renderer；重载后可以按 afterSeq 回放。\n` +
        `4. Approval / ask-user 已经是 Promise + pending map，后面 OpenAI Agents SDK 的 tool approval 可以直接接进来。\n\n` +
        `下一步可以把 mock runtime 换成 OpenAI Agents SDK adapter：Agent loop、tools、human review 都放 main process，renderer 只吃事件。`;

      for (const chunk of answer.match(/[\s\S]{1,42}/g) || []) {
        this.assertActive(state);
        assistantContent += chunk;
        emit({
          id: `${state.runId}-delta-${assistantContent.length}`,
          type: "assistant_message_delta",
          runId: state.runId,
          threadId: input.threadId,
          messageId: assistantMessageId,
          status: "running",
          delta: chunk,
        });
        this.store.updateAssistantMessage(assistantMessageId, setAssistantContent(assistantContent), timeline);
        await this.wait(55, state);
      }

      emit({
        id: `${state.runId}-done`,
        type: "assistant_message_done",
        runId: state.runId,
        threadId: input.threadId,
        messageId: assistantMessageId,
        status: "completed",
        content: assistantContent,
      });
      emit({
        id: `${state.runId}-metrics`,
        type: "response_metrics",
        runId: state.runId,
        threadId: input.threadId,
        status: "completed",
        title: "Response metrics",
        detail: "mock stream completed",
        metrics: {
          input_tokens: context.tokens,
          output_tokens: Math.round(answer.length / 3.8),
          runtime_ms: 2500,
        },
      });
      emitStatus(emit, state.runId, input.threadId, "completed");
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

  private async waitForApproval(
    input: AgentRunInput,
    state: ActiveRun,
    emit: (draft: AgentRunItemDraft) => UclawRunStreamItem,
    timeline: TaskAgentTimelineItem[],
  ): Promise<void> {
    await this.wait(220, state);
    const request = {
      id: `approval-${state.runId}`,
      runId: state.runId,
      threadId: input.threadId,
      title: "允许 Agent 编辑 workspace 文件？",
      detail: "当前是主进程 approval 管线，后续会接真实 apply_workspace_patch / git tool。",
      toolName: "apply_workspace_patch",
      arguments: { path: "draft-outline.md", mode: "mock" },
    };
    const approval = emit({
      id: `${state.runId}-approval`,
      type: "tool_approval_required",
      runId: state.runId,
      threadId: input.threadId,
      status: "waiting_approval",
      title: "等待确认",
      detail: "apply_workspace_patch",
      approval: request,
    });
    timeline.push({
      id: approval.id,
      kind: "tool_approval",
      phase: "approval",
      title: "等待确认",
      detail: "apply_workspace_patch",
      status: "waiting_approval",
      tone: "tool",
      approval: request,
    });

    const decision = await this.permissionService.waitForApproval(request, state.controller.signal);
    this.assertActive(state);
    if (decision === "deny") {
      throw new Error("用户拒绝了 workspace 编辑权限。");
    }
  }

  private async askUser(
    input: AgentRunInput,
    state: ActiveRun,
    emit: (draft: AgentRunItemDraft) => UclawRunStreamItem,
  ): Promise<string> {
    const request: AskUserRequest = {
      id: `ask-${state.runId}`,
      runId: state.runId,
      threadId: input.threadId,
      title: "Agent needs input",
      question: "需要你补充一个偏好或限制条件。",
      detail: "This is the UCLAW ask-user plumbing placeholder.",
      placeholder: "Type the missing course/task preference...",
      toolName: "ask_user",
      arguments: { source: "mock" },
    };
    emit({
      id: `${state.runId}-ask-user-request`,
      type: "ask_user_requested",
      runId: state.runId,
      threadId: input.threadId,
      status: "waiting_approval",
      title: request.title,
      detail: request.question,
      ask_user: request,
    });
    const response = await this.askUserService.waitForResponse(request, state.controller.signal);
    this.assertActive(state);
    return response;
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

function needsApproval(message: string): boolean {
  return /git|commit|修改|编辑|patch|delete|删除/i.test(message);
}

function shouldAskUser(message: string): boolean {
  return /ask-user|问我|需要我回答/i.test(message);
}
