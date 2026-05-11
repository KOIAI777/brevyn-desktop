import type { CanUseTool, McpServerConfig, PermissionMode, PermissionResult, Query, SDKMessage, SdkBeta } from "@anthropic-ai/claude-agent-sdk";
import type * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk";
import type { AgentProviderKind, ModelProviderConfig } from "../../types/domain";
import { AnthropicAgentAdapter } from "../providers/anthropic-agent-adapter";

export type ClaudeSdkRuntime = typeof ClaudeAgentSdk;

export interface ClaudeSdkRunInput {
  prompt: string;
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
  betas?: SdkBeta[];
}

export class ClaudeSdkAdapter {
  async loadSdk(): Promise<ClaudeSdkRuntime> {
    return await import("@anthropic-ai/claude-agent-sdk") as ClaudeSdkRuntime;
  }

  buildEnv(provider: ModelProviderConfig, apiKey: string): Record<string, string> {
    return new AnthropicAgentAdapter(provider.providerKind as AgentProviderKind).buildSdkEnv(provider, apiKey);
  }

  async *query(input: ClaudeSdkRunInput): AsyncIterable<SDKMessage> {
    const sdk = await this.loadSdk();
    const query = sdk.query({
      prompt: input.prompt,
      options: {
        abortController: input.abortController,
        cwd: input.cwd,
        model: input.model,
        env: {
          ...stringProcessEnv(),
          ...input.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "brevyn/0.1.0",
        },
        resume: input.resumeSessionId,
        systemPrompt: input.systemPrompt,
        settingSources: [],
        // Match Proma's stable SDK mode: render complete SDK events instead of
        // token-level partials, which are too chatty for persisted timelines.
        includePartialMessages: false,
        tools: ["Read", "Glob", "Grep", "TodoRead", "TodoWrite", "AskUserQuestion", "EnterPlanMode", "ExitPlanMode", "Write", "Edit", "MultiEdit", "Bash", "WebFetch", "WebSearch"],
        allowedTools: [
          "Read",
          "Glob",
          "Grep",
          "WebFetch",
          "WebSearch",
          "TodoRead",
          "TodoWrite",
          "mcp__brevyn__course_structure",
          "mcp__brevyn__list_course_files",
          "mcp__brevyn__get_file_record",
          "mcp__brevyn__rag_search",
        ],
        disallowedTools: ["NotebookEdit", "Task"],
        permissionMode: input.permissionMode || "default",
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
    for await (const message of query) {
      yield message;
    }
  }
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
