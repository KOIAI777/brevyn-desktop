import type { CanUseTool, McpServerConfig, PermissionMode, PermissionResult, Query, SDKMessage, SDKUserMessage, SdkBeta } from "@anthropic-ai/claude-agent-sdk";
import type * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AgentProviderKind, ModelProviderConfig } from "../../types/domain";
import { AnthropicAgentAdapter } from "../providers/anthropic-agent-adapter";

export type ClaudeSdkRuntime = typeof ClaudeAgentSdk;

export interface ClaudeSdkRunInput {
  prompt: string;
  slashCommand?: boolean;
  sessionKey?: string;
  cwd: string;
  model: string;
  env: Record<string, string>;
  systemPrompt: string;
  resumeSessionId?: string;
  abortController: AbortController;
  canUseTool?: CanUseTool;
  mcpServers?: Record<string, McpServerConfig>;
  onQuery?: (query: Query) => void;
  permissionMode?: PermissionMode;
  planModeInstructions?: string;
  allowDangerouslySkipPermissions?: boolean;
  betas?: SdkBeta[];
}

interface MessageChannel {
  enqueue: (message: SDKUserMessage) => void;
  generator: AsyncGenerator<SDKUserMessage>;
  close: () => void;
  keepOpenOnNextResult: () => void;
  consumeKeepOpenOnResult: () => boolean;
}

export class ClaudeSdkAdapter {
  private readonly activeQueries = new Map<string, Query>();
  private readonly activeChannels = new Map<string, MessageChannel>();

  async loadSdk(): Promise<ClaudeSdkRuntime> {
    return await import("@anthropic-ai/claude-agent-sdk") as ClaudeSdkRuntime;
  }

  buildEnv(provider: ModelProviderConfig, apiKey: string): Record<string, string> {
    return new AnthropicAgentAdapter(provider.providerKind as AgentProviderKind).buildSdkEnv(provider, apiKey);
  }

  async *query(input: ClaudeSdkRunInput): AsyncIterable<SDKMessage> {
    const sdk = await this.loadSdk();
    const sessionKey = input.sessionKey;
    const channel = input.slashCommand ? null : createMessageChannel(input.abortController.signal);
    if (channel) {
      channel.enqueue({
        type: "user",
        message: {
          role: "user",
          content: input.prompt,
        },
        parent_tool_use_id: null,
      } as SDKUserMessage);
    }
    const query = sdk.query({
      prompt: input.slashCommand ? input.prompt : channel!.generator,
      options: {
        abortController: input.abortController,
        cwd: input.cwd,
        model: input.model,
        env: {
          ...stringProcessEnv(),
          ...input.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "brevyn/0.1.0",
          BREVYN_RUNTIME_REQUIRE_FROM: resolveRuntimeRequireFrom(),
        },
        resume: input.resumeSessionId,
        systemPrompt: input.systemPrompt,
        settingSources: [],
        // Keep partial SDK events in the live stream so the renderer can reveal
        // assistant text progressively. The orchestrator emits them without
        // persisting, so JSONL timelines stay compact on replay.
        includePartialMessages: true,
        tools: ["Read", "Glob", "Grep", "TodoRead", "TodoWrite", "TaskCreate", "TaskGet", "TaskUpdate", "TaskList", "AskUserQuestion", "EnterPlanMode", "ExitPlanMode", "Write", "Edit", "MultiEdit", "Bash", "WebFetch", "WebSearch"],
        allowedTools: [
          "Read",
          "Glob",
          "Grep",
          "WebFetch",
          "WebSearch",
          "TodoRead",
          "TodoWrite",
          "TaskCreate",
          "TaskGet",
          "TaskUpdate",
          "TaskList",
          "mcp__brevyn__load_skill",
          "mcp__brevyn__read_skill_resource",
          "mcp__brevyn__course_structure",
          "mcp__brevyn__list_course_files",
          "mcp__brevyn__get_file_record",
          "mcp__brevyn__rag_search",
        ],
        disallowedTools: ["NotebookEdit", "Task"],
        permissionMode: input.permissionMode || "default",
        ...(input.allowDangerouslySkipPermissions ? { allowDangerouslySkipPermissions: true } : {}),
        ...(input.planModeInstructions ? { planModeInstructions: input.planModeInstructions } : {}),
        ...(input.betas && input.betas.length > 0 ? { betas: input.betas } : {}),
        canUseTool: input.canUseTool || safeToolPolicy,
        ...(input.mcpServers && Object.keys(input.mcpServers).length > 0 ? { mcpServers: input.mcpServers } : {}),
        stderr: (data: string) => {
          if (data.trim()) console.warn("[claude-agent-sdk]", data.trimEnd());
        },
      },
    });
    input.onQuery?.(query);
    if (sessionKey) {
      this.activeQueries.set(sessionKey, query);
      if (channel) this.activeChannels.set(sessionKey, channel);
    }
    try {
      for await (const message of query) {
        if (channel && message.type === "result" && !shouldKeepChannelOpen(message) && !channel.consumeKeepOpenOnResult()) {
          channel.close();
        }
        yield message;
      }
    } finally {
      if (sessionKey) {
        this.activeQueries.delete(sessionKey);
        this.activeChannels.delete(sessionKey);
      }
      channel?.close();
    }
  }

  async queueMessage(sessionKey: string, content: string, uuid?: string, interrupt = true): Promise<void> {
    const channel = this.activeChannels.get(sessionKey);
    if (!channel) throw new Error("No active Claude SDK input channel is available for this thread.");
    if (interrupt) {
      channel.keepOpenOnNextResult();
      const query = this.activeQueries.get(sessionKey);
      try {
        await query?.interrupt();
      } catch (error) {
        console.warn("[ClaudeSdkAdapter] Failed to interrupt active turn before queueing message:", error);
      }
    }
    channel.enqueue({
      type: "user",
      uuid,
      message: {
        role: "user",
        content,
      },
      parent_tool_use_id: null,
      priority: "now",
    } as SDKUserMessage);
  }

  canQueueMessage(sessionKey: string): boolean {
    return this.activeChannels.has(sessionKey);
  }
}

function createMessageChannel(signal: AbortSignal): MessageChannel {
  const queue: SDKUserMessage[] = [];
  let resolver: (() => void) | null = null;
  let done = signal.aborted;
  let keepOpenOnResult = false;

  if (!done) {
    signal.addEventListener("abort", () => {
      done = true;
      resolver?.();
      resolver = null;
    }, { once: true });
  }

  async function* generator(): AsyncGenerator<SDKUserMessage> {
    while (!done) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      await new Promise<void>((resolve) => {
        resolver = resolve;
      });
    }
    while (queue.length > 0) {
      yield queue.shift()!;
    }
  }

  return {
    enqueue(message) {
      queue.push(message);
      resolver?.();
      resolver = null;
    },
    generator: generator(),
    close() {
      done = true;
      resolver?.();
      resolver = null;
    },
    keepOpenOnNextResult() {
      keepOpenOnResult = true;
    },
    consumeKeepOpenOnResult() {
      const keepOpen = keepOpenOnResult;
      keepOpenOnResult = false;
      return keepOpen;
    },
  };
}

function shouldKeepChannelOpen(message: SDKMessage): boolean {
  const reason = String((message as { terminal_reason?: unknown }).terminal_reason || "");
  const subtype = String((message as { subtype?: unknown }).subtype || "");
  return ["interrupt", "interrupted", "aborted"].includes(subtype)
    || ["aborted_streaming", "aborted_tools", "tool_deferred", "hook_stopped", "stop_hook_prevented"].includes(reason);
}

const SAFE_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoRead",
  "TodoWrite",
  "TaskOutput",
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
  "mcp__brevyn__load_skill",
  "mcp__brevyn__read_skill_resource",
  "mcp__brevyn__course_structure",
  "mcp__brevyn__list_course_files",
  "mcp__brevyn__get_file_record",
  "mcp__brevyn__rag_search",
]);

function stringProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []),
  );
}

function resolveRuntimeRequireFrom(): string {
  const candidates = [
    join(process.cwd(), "package.json"),
    join(process.resourcesPath || "", "app.asar.unpacked", "node_modules", "docx", "package.json"),
    join(process.resourcesPath || "", "app", "package.json"),
    join(process.resourcesPath || "", "package.json"),
    join(__dirname, "..", "package.json"),
  ];
  return resolve(candidates.find((candidate) => existsSync(candidate)) || candidates[0]);
}

const safeToolPolicy: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
  if (options.signal.aborted) {
    return {
      behavior: "deny",
      message: "Agent run was stopped.",
      toolUseID: options.toolUseID,
      decisionClassification: "user_reject",
    };
  }
  if (SAFE_TOOLS.has(toolName) || (toolName === "Bash" && isSafeBashCommand(typeof input.command === "string" ? input.command : ""))) {
    return {
      behavior: "allow",
      toolUseID: options.toolUseID,
      decisionClassification: "user_temporary",
    };
  }
  return {
    behavior: "deny",
    message: `${toolName} requires approval. Approval UI will be enabled in the next implementation stage.`,
    toolUseID: options.toolUseID,
    decisionClassification: "user_reject",
  };
};

const SAFE_BASH_PATTERNS: readonly RegExp[] = [
  /^pwd$/,
  /^ls\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^grep\b/,
  /^rg\b/,
  /^which\b/,
  /^whoami$/,
  /^uname\b/,
  /^tree\b/,
  /^wc\b/,
  /^file\b/,
  /^stat\b/,
  /^du\b/,
  /^df\b/,
  /^git\s+(status|log|diff|show|branch|remote|tag)\b/,
  /^node\s+--version$/,
  /^npm\s+(list|ls|view|info|outdated)\b/,
];

function isSafeBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (/[|;&]/.test(trimmed) || />{1,2}/.test(trimmed) || /\b-exec\b/.test(trimmed) || /\b-delete\b/.test(trimmed) || /\$\(/.test(trimmed) || /`/.test(trimmed)) {
    return false;
  }
  return SAFE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed));
}
