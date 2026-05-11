import { randomUUID } from "node:crypto";
import type { CanUseTool, Query, SDKMessage, SdkBeta } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentApprovalDecision,
  AgentApprovalInput,
  AgentAskUserResponseInput,
  AgentExitPlanResponseInput,
  AgentPermissionMode,
  AgentRunInput,
  AgentRunResult,
  BrevynAgentEvent,
  BrevynAgentRuntimeEvent,
  BrevynAgentSessionRecord,
  BrevynAgentTimelineRecord,
  BrevynTask,
  Course,
  SemesterWorkspace,
  Thread,
} from "../../types/domain";
import { SkillFileStore } from "../skills/skill-file-store";
import { SQLiteBusinessStore } from "../storage";
import { ProviderService, envApiKeyForProvider } from "../services/provider-service";
import { SEMESTER_HOME_COURSE_ID, workspacePathForThread } from "../services/workspace-paths";
import { AgentEventBus } from "./agent-event-bus";
import { AgentSessionStore } from "./agent-session-store";
import { AskUserService } from "./ask-user-service";
import { createBrevynMcpServer } from "./brevyn-mcp-server";
import { ClaudeSdkAdapter } from "./claude-sdk-adapter";
import { ExitPlanService } from "./exit-plan-service";
import { PermissionService } from "./permission-service";
import { PromptBuilder } from "./prompt-builder";

interface AgentOrchestratorOptions {
  rootDataDir: string;
  businessStore: SQLiteBusinessStore;
  providers: ProviderService;
  skillFiles: SkillFileStore;
  sessions: AgentSessionStore;
  eventBus: AgentEventBus;
  promptBuilder: PromptBuilder;
  permissions: PermissionService;
  askUsers: AskUserService;
  exitPlans: ExitPlanService;
  sdk: ClaudeSdkAdapter;
}

interface ActiveRun {
  runId: string;
  threadId: string;
  abortController: AbortController;
  query?: Query;
  context: ResolvedThreadContext;
  stoppedByUser: boolean;
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  terminalResultWritten: boolean;
  terminalLifecycleWritten: boolean;
}

interface ResolvedThreadContext {
  thread: Thread;
  semester: SemesterWorkspace;
  course: Course | null;
  task: BrevynTask | null;
  cwd: string;
}

export class AgentOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly options: AgentOrchestratorOptions) {}

  messages(threadId: string): BrevynAgentTimelineRecord[] {
    const context = this.resolveThreadContext(threadId);
    if (!this.activeRuns.has(context.thread.id)) {
      this.options.sessions.reconcileInterruptedRuns(context.thread);
    }
    return this.options.sessions.read(context.thread);
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const context = this.resolveThreadContext(input.threadId);
    if (this.activeRuns.has(context.thread.id)) {
      throw new Error("An agent run is already active for this thread.");
    }

    const runId = entityId("run");
    const abortController = new AbortController();
    const resumeSessionId = this.options.sessions.latestSdkSessionId(context.thread);
    this.activeRuns.set(context.thread.id, {
      runId,
      threadId: context.thread.id,
      abortController,
      context,
      stoppedByUser: false,
      planMode: input.mode === "plan",
      permissionMode: input.permissionMode === "full_access" ? "full_access" : "review",
      terminalResultWritten: false,
      terminalLifecycleWritten: false,
    });

    try {
      this.appendAndEmitRuntimeEvent(context.thread, {
        type: "run_started",
        runId,
        threadId: context.thread.id,
        permissionMode: input.mode === "plan" ? "review" : input.permissionMode === "full_access" ? "full_access" : "review",
        createdAt: now(),
      });
      if (input.mode === "plan") {
        this.appendAndEmitRuntimeEvent(context.thread, {
          type: "plan_mode_entered",
          runId,
          threadId: context.thread.id,
          createdAt: now(),
        });
      }
      this.appendAndEmitSdkMessage(context.thread, userSdkMessage(input.prompt));
    } catch (error) {
      this.activeRuns.delete(context.thread.id);
      throw error;
    }

    void this.executeRun(context, runId, input.prompt, resumeSessionId);
    return { runId };
  }

  private async executeRun(context: ResolvedThreadContext, runId: string, prompt: string, resumeSessionId?: string): Promise<void> {
    try {
      const provider = this.options.providers.agentProvider();
      if (!provider) {
        throw new Error("Configure one enabled Anthropic-compatible agent provider before running the agent.");
      }
      const apiKey = this.options.providers.apiKey(provider.id) || envApiKeyForProvider(provider);
      if (!apiKey) {
        throw new Error(`Agent provider "${provider.name}" is missing an API key.`);
      }

      const active = this.activeRuns.get(context.thread.id);
      if (!active) return;
      const systemPrompt = [
        this.options.promptBuilder.buildSystemPrompt({
          semester: context.semester,
          course: context.course,
          task: context.task,
          thread: context.thread,
          cwd: context.cwd,
          skills: this.options.skillFiles.listSkills(),
        }),
        permissionInstructions(active),
      ].join("\n\n");
      const env = this.options.sdk.buildEnv(provider, apiKey);
      const sdkRuntime = await this.options.sdk.loadSdk();
      const mcpServers = {
        brevyn: createBrevynMcpServer({
          sdk: sdkRuntime,
          rootDataDir: this.options.rootDataDir,
          businessStore: this.options.businessStore,
          context,
        }),
      };
      const stream = this.options.sdk.query({
        prompt,
        cwd: context.cwd,
        model: provider.selectedModel,
        env,
        systemPrompt,
        resumeSessionId,
        abortController: active.abortController,
        mcpServers,
        permissionMode: active.planMode ? "plan" : active.permissionMode === "full_access" ? "bypassPermissions" : "default",
        planModeInstructions: active.planMode ? PLAN_MODE_INSTRUCTIONS : undefined,
        betas: sdkBetasForModel(provider.selectedModel),
        canUseTool: this.createCanUseTool(context, runId),
        onQuery: (query) => {
          active.query = query;
        },
      });
      for await (const message of stream) {
        if (shouldPersistSdkMessage(message)) {
          this.appendAndEmitSdkMessage(context.thread, withCreatedAt(message));
          if (message.type === "result") {
            const current = this.activeRuns.get(context.thread.id);
            if (current) {
              current.terminalResultWritten = true;
              this.writeTerminalLifecycle(current, lifecycleForResult(message), String((message as { result?: unknown }).result || ""));
            }
          }
        } else {
          this.options.eventBus.emit({ kind: "sdk_message", threadId: context.thread.id, message });
        }
      }
      if (active.abortController.signal.aborted) {
        this.writeTerminalResult(active, active.stoppedByUser ? "stopped_by_user" : "error_during_execution", "Agent run stopped.");
        this.writeTerminalLifecycle(active, active.stoppedByUser ? "stopped" : "failed", "Agent run stopped.");
      }
    } catch (error) {
      const active = this.activeRuns.get(context.thread.id);
      const stoppedByUser = Boolean(active?.stoppedByUser);
      const message = active?.abortController.signal.aborted ? "Agent run stopped." : errorMessage(error);
      if (!stoppedByUser) this.appendAndEmitSdkMessage(context.thread, assistantErrorSdkMessage(message, errorCodeForMessage(message)));
      if (active) {
        this.writeTerminalResult(active, stoppedByUser ? "stopped_by_user" : "error_during_execution", message);
        this.writeTerminalLifecycle(active, stoppedByUser ? "stopped" : "failed", message);
      } else {
        this.appendAndEmitSdkMessage(context.thread, resultSdkMessage("error_during_execution", message));
      }
    } finally {
      this.options.permissions.clearThread(context.thread.id);
      this.options.askUsers.clearThread(context.thread.id);
      this.options.exitPlans.clearThread(context.thread.id);
      this.activeRuns.delete(context.thread.id);
    }
  }

  private createCanUseTool(context: ResolvedThreadContext, runId: string): CanUseTool {
    const permissionCanUseTool = this.options.permissions.createCanUseTool({
      threadId: context.thread.id,
      runId,
      mode: this.activeRuns.get(context.thread.id)?.permissionMode || "review",
      onRequest: (request) => {
        this.appendAndEmitRuntimeEvent(context.thread, {
          type: "approval_requested",
          request,
          createdAt: request.createdAt,
        });
      },
    });
    return async (toolName, toolInput, options) => {
      if (toolName === "EnterPlanMode") {
        this.appendAndEmitRuntimeEvent(context.thread, {
          type: "plan_mode_entered",
          runId,
          threadId: context.thread.id,
          createdAt: now(),
        });
        return {
          behavior: "allow",
          updatedInput: toolInput,
          toolUseID: options.toolUseID,
          decisionClassification: "user_temporary",
        };
      }
      if (toolName === "ExitPlanMode") {
        return await this.options.exitPlans.request({
          threadId: context.thread.id,
          runId,
          toolInput,
          toolUseID: options.toolUseID,
          signal: options.signal,
          onRequest: (request) => {
            this.appendAndEmitRuntimeEvent(context.thread, {
              type: "exit_plan_requested",
              request,
              createdAt: request.createdAt,
            });
          },
        });
      }
      if (toolName === "AskUserQuestion") {
        return await this.options.askUsers.ask({
          threadId: context.thread.id,
          runId,
          toolInput,
          toolUseID: options.toolUseID,
          signal: options.signal,
          onRequest: (request) => {
            this.appendAndEmitRuntimeEvent(context.thread, {
              type: "ask_user_requested",
              request,
              createdAt: request.createdAt,
            });
          },
        });
      }
      return await permissionCanUseTool(toolName, toolInput, options);
    };
  }

  stop(threadId: string): boolean {
    const active = this.activeRuns.get(threadId);
    if (!active) return false;
    active.stoppedByUser = true;
    active.abortController.abort();
    active.query?.close();
    this.writeTerminalResult(active, "stopped_by_user", "Agent run stopped.");
    this.writeTerminalLifecycle(active, "stopped", "Agent run stopped.");
    this.options.permissions.clearThread(threadId);
    this.options.askUsers.clearThread(threadId);
    this.options.exitPlans.clearThread(threadId);
    return true;
  }

  stopAll(): void {
    for (const threadId of Array.from(this.activeRuns.keys())) {
      this.stop(threadId);
    }
  }

  approve(input: AgentApprovalInput): boolean {
    return this.resolveApproval(input, "allow");
  }

  reject(input: AgentApprovalInput): boolean {
    return this.resolveApproval(input, "deny");
  }

  answerQuestion(input: AgentAskUserResponseInput): boolean {
    const context = this.resolveThreadContext(input.threadId);
    const active = this.activeRuns.get(context.thread.id);
    const runId = active?.runId || entityId("run");
    const resolved = this.options.askUsers.answer(input);
    if (resolved) {
      this.appendAndEmitRuntimeEvent(context.thread, {
        type: "ask_user_resolved",
        runId,
        threadId: context.thread.id,
        requestId: input.requestId,
        answers: input.answers,
        createdAt: now(),
      });
    }
    return resolved;
  }

  resolveExitPlan(input: AgentExitPlanResponseInput): boolean {
    const context = this.resolveThreadContext(input.threadId);
    const active = this.activeRuns.get(context.thread.id);
    const runId = active?.runId || entityId("run");
    const resolved = this.options.exitPlans.resolve(input);
    if (resolved) {
      this.appendAndEmitRuntimeEvent(context.thread, {
        type: "exit_plan_resolved",
        runId,
        threadId: context.thread.id,
        requestId: input.requestId,
        decision: input.decision,
        feedback: input.feedback,
        createdAt: now(),
      });
    }
    return resolved;
  }

  onEvent(listener: (event: BrevynAgentEvent) => void): () => void {
    return this.options.eventBus.on(listener);
  }

  private resolveApproval(input: AgentApprovalInput, decision: AgentApprovalDecision): boolean {
    const context = this.resolveThreadContext(input.threadId);
    const active = this.activeRuns.get(context.thread.id);
    const runId = active?.runId || entityId("run");
    const resolved = this.options.permissions.resolve(context.thread.id, input.requestId, decision);
    if (resolved) {
      this.appendAndEmitRuntimeEvent(context.thread, {
        type: "approval_resolved",
        runId,
        threadId: context.thread.id,
        requestId: input.requestId,
        decision,
        createdAt: now(),
      });
    }
    return resolved;
  }

  private appendAndEmitSdkMessage(thread: Thread, message: SDKMessage): void {
    this.options.sessions.append(thread, message);
    this.options.eventBus.emit({ kind: "sdk_message", threadId: thread.id, message });
  }

  private appendAndEmitRuntimeEvent(thread: Thread, event: BrevynAgentRuntimeEvent): void {
    this.options.sessions.append(thread, { kind: "runtime", event });
    this.options.eventBus.emit({ kind: "brevyn_event", event });
  }

  private writeTerminalResult(active: ActiveRun, subtype: string, message: string): void {
    if (active.terminalResultWritten) return;
    active.terminalResultWritten = true;
    this.appendAndEmitSdkMessage(active.context.thread, resultSdkMessage(subtype, message));
  }

  private writeTerminalLifecycle(active: ActiveRun, status: "completed" | "stopped" | "failed", message?: string): void {
    if (active.terminalLifecycleWritten) return;
    active.terminalLifecycleWritten = true;
    const createdAt = now();
    if (status === "completed") {
      this.appendAndEmitRuntimeEvent(active.context.thread, {
        type: "run_completed",
        runId: active.runId,
        threadId: active.threadId,
        createdAt,
      });
      return;
    }
    if (status === "stopped") {
      this.appendAndEmitRuntimeEvent(active.context.thread, {
        type: "run_stopped",
        runId: active.runId,
        threadId: active.threadId,
        reason: message,
        createdAt,
      });
      return;
    }
    this.appendAndEmitRuntimeEvent(active.context.thread, {
      type: "run_failed",
      runId: active.runId,
      threadId: active.threadId,
      error: message || "Agent run failed.",
      createdAt,
    });
  }

  private resolveThreadContext(threadId: string): ResolvedThreadContext {
    const thread = this.options.businessStore.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    if (thread.archivedAt) throw new Error("Restore the thread before running the agent.");
    if (!thread.semesterId) throw new Error(`Thread ${thread.id} has no semester scope.`);

    const semester = this.options.businessStore.getSemester(thread.semesterId);
    if (!semester) throw new Error(`Semester not found: ${thread.semesterId}`);
    if (semester.archivedAt) throw new Error("Restore this semester before running the agent.");

    const course = thread.courseId === SEMESTER_HOME_COURSE_ID ? null : this.options.businessStore.getCourse(thread.courseId);
    if (thread.courseId !== SEMESTER_HOME_COURSE_ID) {
      if (!course) throw new Error(`Course not found: ${thread.courseId}`);
      if (course.semesterId !== thread.semesterId) throw new Error("Thread course does not belong to this semester.");
      if (course.archivedAt) throw new Error("Restore this course before running the agent.");
    }

    const task = thread.taskId ? this.options.businessStore.getTask(thread.taskId) : null;
    if (thread.courseId !== SEMESTER_HOME_COURSE_ID) {
      if (!thread.taskId) throw new Error("Create sessions from a task, not the course container.");
      if (!task) throw new Error(`Task not found: ${thread.taskId}`);
      if (task.courseId !== thread.courseId) throw new Error("Task does not belong to this course.");
      if (!task.semesterId || task.semesterId !== thread.semesterId) throw new Error("Task does not belong to this semester.");
    }

    const cwd = workspacePathForThread(this.options.rootDataDir, thread, (taskId) => this.options.businessStore.getTask(taskId) || undefined);
    return { thread, semester, course, task, cwd };
  }
}

const PLAN_MODE_INSTRUCTIONS = [
  "You are in Brevyn Plan Mode.",
  "First inspect enough context to understand the user's request. Prefer Read, Glob, Grep, TodoRead, TodoWrite, and Brevyn MCP tools.",
  "Do not edit files, run destructive commands, or make lasting changes while planning.",
  "Produce a concise implementation plan with risks and verification steps.",
  "When the user explicitly approves execution, call ExitPlanMode with allowedPrompts that describe the action categories you need, then continue only after approval.",
].join("\n");

function permissionInstructions(active: ActiveRun): string {
  if (active.planMode) {
    return [
      "Permission mode for this run: Plan Mode.",
      "Do not edit files, run destructive commands, or make lasting changes while planning.",
    ].join("\n");
  }
  if (active.permissionMode === "full_access") {
    return [
      "Permission mode for this run: Full Access.",
      "The user has allowed Brevyn to edit files and run commands without per-tool review for this run.",
      "Still act carefully: inspect before editing, avoid destructive commands unless explicitly requested, and summarize changes after execution.",
    ].join("\n");
  }
  return [
    "Permission mode for this run: Review.",
    "Read-only tools may run automatically. File writes, edits, destructive actions, and risky shell commands require user approval.",
  ].join("\n");
}

function entityId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function sdkBetasForModel(modelId: string): SdkBeta[] {
  return supports1MContext(modelId) ? ["context-1m-2025-08-07"] : [];
}

function supports1MContext(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("haiku")) return false;
  if (normalized.includes("claude")) {
    if (normalized.includes("sonnet-4")) return true;
    if (normalized.includes("opus-4-6") || normalized.includes("opus-4-7")) return true;
    return false;
  }
  return normalized.includes("deepseek-v4");
}

function now(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown agent error");
}

function userSdkMessage(content: string): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content,
    },
    parent_tool_use_id: null,
    uuid: entityId("msg"),
    session_id: "",
    _createdAt: Date.now(),
  } as unknown as SDKMessage;
}

function assistantErrorSdkMessage(message: string, errorCode?: string): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "text", text: message }],
    },
    parent_tool_use_id: null,
    error: { message, errorType: errorCode || "agent_error" },
    ...(errorCode ? { _errorCode: errorCode } : {}),
    uuid: entityId("msg"),
    session_id: "",
    _createdAt: Date.now(),
  } as unknown as SDKMessage;
}

function errorCodeForMessage(message: string): string | undefined {
  const normalized = message.toLowerCase();
  return PROMPT_TOO_LONG_PATTERNS.some((pattern) => normalized.includes(pattern)) ? "prompt_too_long" : undefined;
}

const PROMPT_TOO_LONG_PATTERNS = [
  "prompt is too long",
  "prompt_too_long",
  "input is too long",
  "context_length_exceeded",
  "maximum context length",
  "token limit",
  "exceeds the model",
] as const;

function resultSdkMessage(subtype: string, message?: string): SDKMessage {
  return {
    type: "result",
    subtype,
    is_error: subtype !== "success",
    api_error_status: null,
    duration_ms: 0,
    duration_api_ms: 0,
    num_turns: 0,
    result: message || "",
    stop_reason: subtype === "success" ? "end_turn" : "error",
    session_id: "",
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    errors: message ? [message] : undefined,
    _createdAt: Date.now(),
  } as unknown as SDKMessage;
}

function lifecycleForResult(message: SDKMessage): "completed" | "stopped" | "failed" {
  const subtype = String((message as { subtype?: unknown }).subtype || "");
  if (subtype === "success") return "completed";
  if (subtype === "stopped_by_user") return "stopped";
  return "failed";
}

function withCreatedAt(message: SDKMessage): SDKMessage {
  const record = message as unknown as Record<string, unknown>;
  if (typeof record._createdAt === "number") return message;
  return { ...record, _createdAt: Date.now() } as unknown as SDKMessage;
}

function shouldPersistSdkMessage(message: SDKMessage): boolean {
  if (message.type === "stream_event") return false;
  if (message.type === "assistant" || message.type === "result") return true;
  if (message.type === "user") return userMessageHasToolResult(message);
  return message.type === "system" && message.subtype === "compact_boundary";
}

function userMessageHasToolResult(message: SDKMessage): boolean {
  const rawMessage = (message as unknown as { message?: { content?: unknown } }).message;
  const content = rawMessage?.content;
  return Array.isArray(content) && content.some((block) =>
    Boolean(block && typeof block === "object" && (block as { type?: unknown }).type === "tool_result"),
  );
}
