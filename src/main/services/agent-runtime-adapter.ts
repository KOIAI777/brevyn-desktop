import {
  Agent,
  OpenAIProvider,
  Runner,
  type RunItemStreamEvent,
  type RunRawModelStreamEvent,
  type RunState,
  type RunStreamEvent,
  type RunToolApprovalItem,
  type StreamedRunResult,
} from "@openai/agents";
import type {
  AgentRunInput,
  AgentRuntimeStatus,
  ApprovalRequest,
  ChatMessage,
  ModelProviderConfig,
  ToolCallPayload,
  UclawRunStreamItem,
} from "../../types/domain";
import { createUclawToolRegistry, type UclawHostedToolOptions } from "../tools";
import { classifyShellCommand } from "../tools/uclaw-shell";
import { AgentAskUserService } from "./agent-ask-user-service";
import type { AgentRunItemDraft } from "./agent-event-log";
import { AgentPermissionService } from "./agent-permission-service";
import { LocalStore, SEMESTER_HOME_COURSE_ID } from "./local-store";
import { UclawOpenAISession } from "./uclaw-openai-session";
import { formatEnabledSkillPrompt } from "../skills/skill-registry";

export type AgentRuntimeEmit = (item: AgentRunItemDraft) => UclawRunStreamItem;

export interface AgentRuntimeRunInput extends AgentRunInput {
  runId: string;
  assistantMessageId: string;
  signal: AbortSignal;
}

export interface AgentRuntimeRunCallbacks {
  emit: AgentRuntimeEmit;
  onAssistantDelta: (delta: string) => void;
}

export interface AgentRuntimeRunResult {
  content: string;
  metrics: Record<string, unknown>;
}

export interface AgentRuntimeAdapter {
  isConfigured(): boolean;
  status(): AgentRuntimeStatus;
  run(input: AgentRuntimeRunInput, callbacks: AgentRuntimeRunCallbacks): Promise<AgentRuntimeRunResult>;
}

export interface OpenAIAgentsAdapterOptions {
  hostedTools?: UclawHostedToolOptions;
}

interface PendingSdkApproval {
  item: RunToolApprovalItem;
  request: ApprovalRequest;
  decision: Promise<"allow" | "deny">;
}

interface ResolvedRuntimeConfig {
  provider?: ModelProviderConfig;
  apiKey?: string;
  source: AgentRuntimeStatus["source"];
  model: string;
  baseURL?: string;
  useResponses: boolean;
  hostedTools?: UclawHostedToolOptions;
}

const DEFAULT_MODEL = "gpt-4.1";
const MAX_TURNS = 8;

export class OpenAIAgentsAdapter implements AgentRuntimeAdapter {
  constructor(
    private readonly store: LocalStore,
    private readonly permissionService: AgentPermissionService,
    private readonly askUserService: AgentAskUserService,
    private readonly options: OpenAIAgentsAdapterOptions = {},
  ) {}

  isConfigured(): boolean {
    return this.status().configured;
  }

  status(): AgentRuntimeStatus {
    const runtime = this.resolveRuntimeConfig();
    if (runtime.apiKey) {
      return {
        configured: true,
        source: runtime.source,
        title: "OpenAI Agents SDK ready",
        detail:
          runtime.source === "provider_secret" && runtime.provider
            ? `Using ${runtime.model} via ${runtime.provider.name} (${runtime.baseURL || "https://api.openai.com/v1"}).`
            : `Using ${runtime.model} from ${process.env.UCLAW_OPENAI_API_KEY ? "UCLAW_OPENAI_API_KEY" : "OPENAI_API_KEY"}${runtime.baseURL ? ` via ${runtime.baseURL}` : ""}.`,
      };
    }
    if (!runtime.provider) {
      return {
        configured: false,
        source: "none",
        title: "Agent provider required",
        detail: "Enable an OpenAI Responses or OpenAI-compatible provider profile before starting a real Agent run.",
        actionLabel: "Open Provider Settings",
      };
    }
    if (!this.store.providerSecretStorageAvailable()) {
      return {
        configured: false,
        source: "none",
        title: "Secure key storage unavailable",
        detail: "UCLAW will not save plaintext keys. Set UCLAW_OPENAI_API_KEY or OPENAI_API_KEY, or enable OS secure storage.",
        actionLabel: "Open Provider Settings",
      };
    }
    return {
      configured: false,
      source: "none",
      title: "Agent provider key required",
      detail: `Paste and save an API key for ${runtime.provider.name}, or set UCLAW_OPENAI_API_KEY / OPENAI_API_KEY.`,
      actionLabel: "Open Provider Settings",
    };
  }

  async run(input: AgentRuntimeRunInput, callbacks: AgentRuntimeRunCallbacks): Promise<AgentRuntimeRunResult> {
    const runtime = this.resolveRuntimeConfig();
    if (!runtime.apiKey) {
      throw new Error("OpenAI Agents SDK runtime is not configured. Save a provider API key or set OPENAI_API_KEY / UCLAW_OPENAI_API_KEY.");
    }

    const workspaceCwd = this.store.workspacePathForRunScope(input.threadId);
    const enabledSkills = this.store.skillsForThread(input.threadId).filter((skill) => skill.enabled);
    const model = runtime.model;
    const modelProvider = new OpenAIProvider({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL,
      useResponses: runtime.useResponses,
    });
    const registry = createUclawToolRegistry({
      store: this.store,
      cwd: workspaceCwd,
      permissionMode: input.permissionMode,
      hostedTools: runtime.useResponses ? (runtime.hostedTools ?? this.options.hostedTools) : undefined,
      skills: enabledSkills,
      runContext: {
        runId: input.runId,
        threadId: input.threadId,
        signal: input.signal,
      },
      emit: callbacks.emit,
      askUserService: this.askUserService,
    });
    const agent = new Agent({
      name: "UCLAW TaskAgent",
      model,
      instructions: this.buildInstructions(input, workspaceCwd),
      tools: registry.tools,
      modelSettings: {
        parallelToolCalls: true,
        reasoning: {
          effort: "medium",
          summary: "auto",
        },
      },
    });

    let content = "";
    type RuntimeAgent = Agent<unknown, any>;
    let state: RunState<unknown, RuntimeAgent> | undefined;
    const approvals = new Map<string, PendingSdkApproval>();
    const startedAt = Date.now();
    const session = new UclawOpenAISession(this.store, input.threadId);
    const runner = new Runner({
      modelProvider,
      tracingDisabled: true,
      workflowName: "UCLAW TaskAgent",
      groupId: input.threadId,
    });

    try {
      for (let resumeCount = 0; resumeCount < 8; resumeCount += 1) {
        const stream = await runner.run(agent, state ?? input.message, {
          stream: true,
          signal: input.signal,
          maxTurns: MAX_TURNS,
          session,
        });

        await this.consumeStream(stream, input, callbacks, approvals, (delta) => {
          content += delta;
        });
        await stream.completed;
        state = stream.state;

        const interruptions = stream.interruptions;
        if (interruptions.length === 0) {
          const finalOutput = typeof stream.finalOutput === "string" ? stream.finalOutput : content;
          if (!content && finalOutput) {
            content = finalOutput;
            callbacks.onAssistantDelta(finalOutput);
          }
          return {
            content,
            metrics: collectMetrics(stream, startedAt),
          };
        }

        for (const approval of interruptions) {
          const pending = this.ensureApprovalRequest(approval, input, callbacks.emit, approvals);
          const decision = await pending.decision;
          if (decision === "allow") {
            state.approve(approval);
          } else {
            state.reject(approval, { message: "User rejected the tool call in UCLAW approval UI." });
          }
        }
      }
    } finally {
      await modelProvider.close().catch(() => undefined);
    }

    throw new Error("OpenAI Agents SDK runtime exceeded approval resume limit.");
  }

  private async consumeStream(
    stream: StreamedRunResult<unknown, Agent<unknown, any>>,
    input: AgentRuntimeRunInput,
    callbacks: AgentRuntimeRunCallbacks,
    approvals: Map<string, PendingSdkApproval>,
    appendContent: (delta: string) => void,
  ): Promise<void> {
    for await (const event of stream) {
      if (input.signal.aborted) return;
      if (event.type === "raw_model_stream_event") {
        this.handleRawModelEvent(event, input, callbacks, appendContent);
      }
      if (event.type === "run_item_stream_event") {
        this.handleRunItemEvent(event, input, callbacks.emit, approvals);
      }
      if (event.type === "agent_updated_stream_event") {
        callbacks.emit({
          id: `${input.runId}-agent-${safeId(event.agent.name)}`,
          type: "reasoning_summary_delta",
          runId: input.runId,
          threadId: input.threadId,
          status: "running",
          title: "Agent updated",
          detail: `Running ${event.agent.name}`,
        });
      }
    }
  }

  private handleRawModelEvent(
    event: RunRawModelStreamEvent,
    input: AgentRuntimeRunInput,
    callbacks: AgentRuntimeRunCallbacks,
    appendContent: (delta: string) => void,
  ): void {
    const data = event.data as unknown;
    const textDelta = extractTextDelta(data);
    if (textDelta) {
      appendContent(textDelta);
      callbacks.onAssistantDelta(textDelta);
      return;
    }

    const reasoningDelta = extractReasoningDelta(data);
    if (reasoningDelta) {
      callbacks.emit({
        id: `${input.runId}-reasoning-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        type: "reasoning_summary_delta",
        runId: input.runId,
        threadId: input.threadId,
        status: "running",
        title: "Thinking",
        detail: reasoningDelta,
      });
    }
  }

  private handleRunItemEvent(
    event: RunItemStreamEvent,
    input: AgentRuntimeRunInput,
    emit: AgentRuntimeEmit,
    approvals: Map<string, PendingSdkApproval>,
  ): void {
    if (event.name === "tool_approval_requested") {
      this.ensureApprovalRequest(event.item as RunToolApprovalItem, input, emit, approvals);
      return;
    }

    const rawItem = getRawItem(event.item);
    if (!rawItem) return;

    if (event.name === "tool_search_called") {
      const toolCall = {
        call_id: rawId(rawItem),
        tool_name: "tool_search",
        arguments: argumentsFromRawItem(rawItem),
      };
      emit({
        id: `${input.runId}-tool-${toolCall.call_id}-start`,
        type: "tool_call_started",
        runId: input.runId,
        threadId: input.threadId,
        status: "waiting_tool",
        title: "Searching tools",
        detail: toolDetail(toolCall),
        tool_call: toolCall,
      });
      return;
    }

    if (event.name === "tool_search_output_created") {
      const toolCall = {
        call_id: rawId(rawItem),
        tool_name: "tool_search",
        result: {
          output: rawItem.output,
        },
      };
      emit({
        id: `${input.runId}-tool-${toolCall.call_id}-done`,
        type: "tool_call_completed",
        runId: input.runId,
        threadId: input.threadId,
        status: "running",
        title: "Tools loaded",
        detail: outputDetail(toolCall.result),
        tool_call: toolCall,
      });
      return;
    }

    if (event.name === "tool_called") {
      const toolCall = toolCallFromRawItem(rawItem);
      if (!toolCall) return;
      emit({
        id: `${input.runId}-tool-${toolCall.call_id}-start`,
        type: "tool_call_started",
        runId: input.runId,
        threadId: input.threadId,
        status: "waiting_tool",
        title: toolTitle(toolCall.tool_name, "start"),
        detail: toolDetail(toolCall),
        tool_call: toolCall,
      });
      return;
    }

    if (event.name === "tool_output") {
      const toolCall = toolOutputFromRawItem(rawItem);
      if (!toolCall) return;
      emit({
        id: `${input.runId}-tool-${toolCall.call_id}-done`,
        type: "tool_call_completed",
        runId: input.runId,
        threadId: input.threadId,
        status: "running",
        title: toolTitle(toolCall.tool_name, "done"),
        detail: outputDetail(toolCall.result),
        tool_call: toolCall,
      });
      return;
    }

    if (event.name === "reasoning_item_created") {
      emit({
        id: `${input.runId}-reasoning-item-${rawId(rawItem)}`,
        type: "reasoning_summary_done",
        runId: input.runId,
        threadId: input.threadId,
        status: "running",
        title: "Thinking",
        detail: reasoningFromRawItem(rawItem) || "Reasoning item created.",
      });
    }
  }

  private ensureApprovalRequest(
    approval: RunToolApprovalItem,
    input: AgentRuntimeRunInput,
    emit: AgentRuntimeEmit,
    approvals: Map<string, PendingSdkApproval>,
  ): PendingSdkApproval {
    const rawItem = getRawItem(approval);
    const callId = callIdFromRawItem(rawItem) || rawId(rawItem);
    const approvalId = `approval-${input.runId}-${safeId(callId)}`;
    const existing = approvals.get(approvalId);
    if (existing) return existing;

    const request: ApprovalRequest = {
      id: approvalId,
      runId: input.runId,
      threadId: input.threadId,
      title: approvalTitle(approval, rawItem),
      detail: approvalDetail(rawItem),
      toolName: approval.name || toolNameFromRawItem(rawItem) || "tool",
      arguments: argumentsFromRawItem(rawItem),
    };
    const decision = this.permissionService.waitForApproval(request, input.signal);
    const pending = { item: approval, request, decision };
    approvals.set(approvalId, pending);
    emit({
      id: `${approvalId}-requested`,
      type: "tool_approval_required",
      runId: input.runId,
      threadId: input.threadId,
      status: "waiting_approval",
      title: "等待确认",
      detail: request.toolName,
      approval: request,
    });
    return pending;
  }

  private buildInstructions(input: AgentRuntimeRunInput, workspaceCwd: string): string {
    const thread = this.store.listThreads().find((item) => item.id === input.threadId);
    const courses = this.store.listCourses();
    const course = courses.find((item) => item.id === thread?.courseId);
    const tasks = course ? this.store.listTasks(course.id) : [];
    const task = tasks.find((item) => item.id === thread?.taskId);
    const skills = this.store.skillsForThread(input.threadId).filter((skill) => skill.enabled);
    const context = this.store.contextReport(input.threadId);
    const recent = this.recentMessages(input.threadId);
    const skillPrompt = formatEnabledSkillPrompt(skills);

    return [
      "You are UCLAW TaskAgent, a local-first course workspace agent inside an Electron app.",
      "Use the provided local tools instead of inventing file or course state.",
      "Use context_report when you need the current course/task/thread, file list, enabled skills, or context-window estimate.",
      "Use rag_search before answering questions about course materials, assignments, exams, rubrics, readings, or uploaded files.",
      "Use ask_user only when a missing preference or required detail blocks the next useful action.",
      "Use shell for local inspection, Git status/diff/log, and build checks. In review mode, only risky shell commands require approval; blocked commands stay blocked in every mode.",
      "Use apply_patch for workspace edits. It does not ask for approval, but it must stay inside the current semester/course/task workspace.",
      "Return concise answers in the user's language. The user often writes Chinese; answer Chinese unless the task clearly needs English output.",
      "",
      "Current scope:",
      `- Thread: ${thread?.title || input.threadId}`,
      `- Course: ${course ? `${course.name} (${course.code})` : "unknown"}`,
      `- Task: ${task ? `${task.title} (${task.taskType})` : course?.id === SEMESTER_HOME_COURSE_ID ? "semester home" : "course home"}`,
      `- Workspace cwd: ${workspaceCwd}`,
      `- Permission mode: ${input.permissionMode}`,
      `- Context estimate: ${context.tokens}/${context.budget} tokens`,
      "",
      "Enabled skills:",
      skillPrompt,
      "",
      "Recent thread messages:",
      recent.length ? recent.map((message) => `- ${message.role}: ${message.content}`).join("\n") : "- none",
    ].join("\n");
  }

  private recentMessages(threadId: string): ChatMessage[] {
    return this.store
      .messages(threadId)
      .filter((message) => message.content.trim().length > 0)
      .slice(-8);
  }

  private resolveRuntimeConfig(): ResolvedRuntimeConfig {
    const provider = this.store
      .listProviders()
      .find((item) => item.enabled && (item.protocol === "openai_responses" || item.protocol === "openai_compatible"));
    const envModel = process.env.UCLAW_OPENAI_MODEL || process.env.OPENAI_MODEL;
    const providerSecret = provider ? this.store.providerApiKey(provider.id) : undefined;
    const envSecret = resolveEnvApiKey();
    const normalizedBaseURL = provider?.baseUrl.trim().replace(/\/+$/, "");
    const baseURL = normalizedBaseURL && normalizedBaseURL !== "https://api.openai.com/v1" ? normalizedBaseURL : undefined;
    return {
      model: envModel || provider?.chatModel || DEFAULT_MODEL,
      provider,
      apiKey: providerSecret || envSecret,
      source: providerSecret ? "provider_secret" : envSecret ? "env" : "none",
      baseURL,
      useResponses: provider?.protocol !== "openai_compatible",
      hostedTools: provider?.agentTools,
    };
  }
}

function resolveEnvApiKey(): string | undefined {
  return process.env.UCLAW_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

function extractTextDelta(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const type = typeof record.type === "string" ? record.type : "";
  if ((type.includes("output_text.delta") || type.includes("response.text.delta")) && typeof record.delta === "string") {
    return record.delta;
  }
  if (type.includes("message.delta") && typeof record.delta === "string") {
    return record.delta;
  }
  return null;
}

function extractReasoningDelta(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const type = typeof record.type === "string" ? record.type : "";
  if (!type.includes("reasoning")) return null;
  if (typeof record.delta === "string") return record.delta;
  if (typeof record.text === "string") return record.text;
  if (typeof record.summary === "string") return record.summary;
  return null;
}

function getRawItem(item: unknown): Record<string, unknown> | null {
  const record = asRecord(item);
  return asRecord(record?.rawItem) || asRecord(record?.raw_item) || record;
}

function toolCallFromRawItem(rawItem: Record<string, unknown>): ToolCallPayload | null {
  const type = stringField(rawItem, "type");
  if (type === "function_call") {
    return {
      call_id: stringField(rawItem, "callId") || stringField(rawItem, "call_id") || rawId(rawItem),
      tool_name: stringField(rawItem, "name") || "function",
      arguments: parseArguments(rawItem.arguments),
    };
  }
  if (type === "shell_call") {
    const action = asRecord(rawItem.action);
    return {
      call_id: stringField(rawItem, "callId") || rawId(rawItem),
      tool_name: "shell",
      arguments: {
        commands: Array.isArray(action?.commands) ? action.commands : [],
        timeoutMs: action?.timeoutMs,
      },
    };
  }
  if (type === "apply_patch_call") {
    return {
      call_id: stringField(rawItem, "callId") || rawId(rawItem),
      tool_name: "apply_patch",
      arguments: asRecord(rawItem.operation) || {},
    };
  }
  if (type === "hosted_tool_call") {
    return {
      call_id: rawId(rawItem),
      tool_name: stringField(rawItem, "name") || "hosted_tool",
      arguments: parseArguments(rawItem.arguments),
    };
  }
  if (type === "tool_search_call") {
    return {
      call_id: stringField(rawItem, "callId") || stringField(rawItem, "call_id") || rawId(rawItem),
      tool_name: "tool_search",
      arguments: parseArguments(rawItem.arguments),
    };
  }
  return null;
}

function toolOutputFromRawItem(rawItem: Record<string, unknown>): ToolCallPayload | null {
  const type = stringField(rawItem, "type");
  if (type === "function_call_result") {
    return {
      call_id: stringField(rawItem, "callId") || stringField(rawItem, "call_id") || rawId(rawItem),
      tool_name: stringField(rawItem, "name") || "function",
      result: outputToResult(rawItem.output),
    };
  }
  if (type === "shell_call_output") {
    return {
      call_id: stringField(rawItem, "callId") || rawId(rawItem),
      tool_name: "shell",
      result: {
        ok: true,
        output: rawItem.output,
        maxOutputLength: rawItem.maxOutputLength,
      },
    };
  }
  if (type === "apply_patch_call_output") {
    return {
      call_id: stringField(rawItem, "callId") || rawId(rawItem),
      tool_name: "apply_patch",
      result: {
        ok: stringField(rawItem, "status") !== "failed",
        status: rawItem.status,
        output: rawItem.output,
      },
    };
  }
  if (type === "tool_search_output") {
    return {
      call_id: stringField(rawItem, "callId") || stringField(rawItem, "call_id") || rawId(rawItem),
      tool_name: "tool_search",
      result: {
        ok: true,
        tools: rawItem.tools,
      },
    };
  }
  if (type === "hosted_tool_call" && (rawItem.output || rawItem.status === "completed")) {
    return {
      call_id: rawId(rawItem),
      tool_name: stringField(rawItem, "name") || "hosted_tool",
      result: {
        ok: stringField(rawItem, "status") !== "failed",
        status: rawItem.status,
        output: rawItem.output,
      },
    };
  }
  return null;
}

function collectMetrics(stream: StreamedRunResult<unknown, Agent<unknown, any>>, startedAt: number): Record<string, unknown> {
  const usage = stream.rawResponses.reduce(
    (acc, response) => {
      const rawUsage = asRecord(response.usage);
      acc.input_tokens += numberField(rawUsage, "inputTokens") || numberField(rawUsage, "input_tokens") || 0;
      acc.output_tokens += numberField(rawUsage, "outputTokens") || numberField(rawUsage, "output_tokens") || 0;
      acc.total_tokens += numberField(rawUsage, "totalTokens") || numberField(rawUsage, "total_tokens") || 0;
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  );
  return {
    ...usage,
    runtime_ms: Date.now() - startedAt,
    responses: stream.rawResponses.length,
    model: stream.lastAgent?.model,
    last_response_id: stream.lastResponseId,
  };
}

function approvalTitle(approval: RunToolApprovalItem, rawItem: Record<string, unknown> | null): string {
  const name = approval.name || toolNameFromRawItem(rawItem) || "tool";
  if (name === "shell") return "允许 Agent 运行风险较高的 shell 命令？";
  return `允许 Agent 调用 ${name}？`;
}

function approvalDetail(rawItem: Record<string, unknown> | null): string {
  if (!rawItem) return "Tool call requires approval.";
  const type = stringField(rawItem, "type");
  if (type === "shell_call") {
    const action = asRecord(rawItem.action);
    const commands = Array.isArray(action?.commands) ? action.commands.map(String) : [];
    const detail = commands.join("\n");
    const policy = commands.reduce<{ risk: "allow" | "review" | "deny"; reason: string }>(
      (current, command) => {
        const next = classifyShellCommand(command);
        return next.risk === "review" ? next : current;
      },
      { risk: "allow" as const, reason: "Shell command requires approval." },
    );
    return [detail || "Shell command requires approval.", `Reason: ${policy.reason}`].join("\n\n");
  }
  if (type === "apply_patch_call") {
    const operation = asRecord(rawItem.operation);
    return `${String(operation?.type || "apply_patch")} ${String(operation?.path || "")}`.trim();
  }
  return JSON.stringify(argumentsFromRawItem(rawItem));
}

function argumentsFromRawItem(rawItem: Record<string, unknown> | null): Record<string, unknown> {
  if (!rawItem) return {};
  const type = stringField(rawItem, "type");
  if (type === "shell_call") return { action: rawItem.action };
  if (type === "apply_patch_call") return { operation: rawItem.operation };
  return parseArguments(rawItem.arguments);
}

function toolNameFromRawItem(rawItem: Record<string, unknown> | null): string | undefined {
  if (!rawItem) return undefined;
  const type = stringField(rawItem, "type");
  if (type === "shell_call") return "shell";
  if (type === "apply_patch_call") return "apply_patch";
  if (type === "tool_search_call") return "tool_search";
  return stringField(rawItem, "name");
}

function callIdFromRawItem(rawItem: Record<string, unknown> | null): string | undefined {
  if (!rawItem) return undefined;
  return stringField(rawItem, "callId") || stringField(rawItem, "call_id") || stringField(rawItem, "id");
}

function reasoningFromRawItem(rawItem: Record<string, unknown>): string | null {
  const content = rawItem.content;
  if (!Array.isArray(content)) return null;
  return content
    .map((item) => {
      const record = asRecord(item);
      return typeof record?.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("");
}

function outputToResult(output: unknown): Record<string, unknown> {
  if (typeof output === "string") {
    const parsed = safeJson(output);
    return asRecord(parsed) || { ok: true, output };
  }
  const record = asRecord(output);
  if (record?.type === "text" && typeof record.text === "string") {
    const parsed = safeJson(record.text);
    return asRecord(parsed) || { ok: true, output: record.text };
  }
  return { ok: true, output };
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return asRecord(safeJson(value)) || { input: value };
  return asRecord(value) || {};
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toolTitle(toolName: string, phase: "start" | "done"): string {
  if (toolName === "rag_search") return phase === "start" ? "正在检索知识库" : "已检索知识库";
  if (toolName === "shell") return phase === "start" ? "正在运行 Shell" : "Shell 已完成";
  if (toolName === "apply_patch") return phase === "start" ? "正在编辑文件" : "文件编辑完成";
  if (toolName === "tool_search") return phase === "start" ? "正在查找工具" : "工具查找完成";
  return phase === "start" ? "正在调用工具" : "工具调用完成";
}

function toolDetail(toolCall: ToolCallPayload): string {
  if (toolCall.tool_name === "shell") {
    const commands = toolCall.arguments?.commands;
    return Array.isArray(commands) ? commands.join(" && ") : "shell";
  }
  if (toolCall.tool_name === "apply_patch") {
    return String(toolCall.arguments?.path || toolCall.arguments?.type || "workspace");
  }
  if (toolCall.tool_name === "rag_search") {
    return String(toolCall.arguments?.query || "course materials");
  }
  return toolCall.tool_name;
}

function outputDetail(result: Record<string, unknown> | undefined): string {
  if (!result) return "completed";
  if (result.ok === false) return String(result.error || "failed");
  if (typeof result.count === "number") return `${result.count} results`;
  if (typeof result.status === "string") return result.status;
  return "completed";
}

function rawId(rawItem: Record<string, unknown> | null): string {
  return stringField(rawItem, "id") || Math.random().toString(36).slice(2, 10);
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "item";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(value: Record<string, unknown> | null, key: string): string | undefined {
  const field = value?.[key];
  return typeof field === "string" && field ? field : undefined;
}

function numberField(value: Record<string, unknown> | null, key: string): number | undefined {
  const field = value?.[key];
  return typeof field === "number" ? field : undefined;
}
