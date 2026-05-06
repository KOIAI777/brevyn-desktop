import {
  applyPatchTool,
  codeInterpreterTool,
  fileSearchTool,
  hostedMcpTool,
  imageGenerationTool,
  shellTool,
  tool,
  toolSearchTool,
  webSearchTool,
  type Tool,
} from "@openai/agents";
import type { JsonObjectSchemaNonStrict } from "@openai/agents-core/types";
import type { AskUserRequest, PermissionMode } from "../../types/domain";
import type { AgentAskUserService } from "../services/agent-ask-user-service";
import type { AgentRunItemDraft } from "../services/agent-event-log";
import { LocalStore } from "../services/local-store";
import { UclawEditor } from "./uclaw-editor";
import { UclawShell } from "./uclaw-shell";

export interface UclawHostedToolOptions {
  webSearch?: boolean;
  fileSearchVectorStoreIds?: string[];
  codeInterpreter?: boolean;
  imageGeneration?: boolean;
  toolSearch?: boolean;
  hostedMcpServers?: UclawHostedMcpToolConfig[];
}

export interface UclawHostedMcpToolConfig {
  serverLabel: string;
  serverUrl?: string;
  connectorId?: string;
  authorization?: string;
  headers?: Record<string, string>;
  allowedTools?: string[];
  deferLoading?: boolean;
  requireApproval?: "never" | "always";
}

export interface UclawToolRegistryOptions {
  store: LocalStore;
  cwd: string;
  permissionMode: PermissionMode;
  hostedTools?: UclawHostedToolOptions;
  runContext?: {
    runId: string;
    threadId: string;
    signal: AbortSignal;
  };
  emit?: (draft: AgentRunItemDraft) => unknown;
  askUserService?: AgentAskUserService;
}

export interface UclawToolRegistry {
  tools: Tool[];
  shell: UclawShell;
  editor: UclawEditor;
}

type RagSearchParameterProperties = {
  query: { type: "string"; description: string };
  courseId: { type: "string"; description: string };
  maxResults: { type: "number"; description: string };
};

const ragSearchParameters: JsonObjectSchemaNonStrict<RagSearchParameterProperties> = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The search query for course materials.",
    },
    courseId: {
      type: "string",
      description: "Optional UCLAW course id. If omitted, search the current semester scope.",
    },
    maxResults: {
      type: "number",
      description: "Maximum number of evidence results to return.",
    },
  },
  required: ["query"],
  additionalProperties: true,
};

export function createUclawToolRegistry(options: UclawToolRegistryOptions): UclawToolRegistry {
  const shell = new UclawShell({ cwd: options.cwd });
  const editor = new UclawEditor({ cwd: options.cwd });
  const ragSearchTool = createRagSearchTool(options.store);
  const contextReportTool = createContextReportTool(options.store, options.runContext?.threadId);
  const askUserTool = createAskUserTool(options);

  const tools: Tool[] = [
    contextReportTool,
    ragSearchTool,
    askUserTool,
    shellTool({
      name: "shell",
      shell,
      needsApproval: async (_runContext, action) => {
        const policy = shell.classifyAction(action);
        if (policy.risk === "deny") return false;
        if (policy.risk === "review") return options.permissionMode === "review";
        return false;
      },
    }),
    applyPatchTool({
      name: "apply_patch",
      editor,
      needsApproval: options.permissionMode === "review",
    }),
    ...createOpenAIHostedTools(options.hostedTools),
  ];

  return { tools, shell, editor };
}

export function createOpenAIHostedTools(options: UclawHostedToolOptions = {}): Tool[] {
  const tools: Tool[] = [];
  const needsToolSearch = Boolean(options.toolSearch || options.hostedMcpServers?.some((server) => server.deferLoading));
  if (needsToolSearch) tools.push(toolSearchTool());
  if (options.webSearch) tools.push(webSearchTool());
  if (options.fileSearchVectorStoreIds?.length) tools.push(fileSearchTool(options.fileSearchVectorStoreIds));
  if (options.codeInterpreter) tools.push(codeInterpreterTool());
  if (options.imageGeneration) tools.push(imageGenerationTool());
  for (const server of options.hostedMcpServers ?? []) {
    tools.push(createHostedMcpTool(server));
  }
  return tools;
}

function createHostedMcpTool(config: UclawHostedMcpToolConfig): Tool {
  const base = {
    serverLabel: config.serverLabel,
    authorization: config.authorization,
    headers: config.headers,
    allowedTools: config.allowedTools,
    deferLoading: config.deferLoading,
  };
  const approval =
    config.requireApproval === "never" ? ({ requireApproval: "never" } as const) : ({ requireApproval: "always" } as const);

  if (config.connectorId) {
    return hostedMcpTool({
      ...base,
      ...approval,
      connectorId: config.connectorId,
    });
  }

  if (!config.serverUrl) {
    throw new Error(`Hosted MCP server requires serverUrl or connectorId: ${config.serverLabel}`);
  }

  return hostedMcpTool({
    ...base,
    ...approval,
    serverUrl: config.serverUrl,
  });
}

function createRagSearchTool(store: LocalStore): Tool {
  return tool({
    name: "rag_search",
    description:
      "Search UCLAW local course materials and return scoped evidence with citations. Use this before answering course, assignment, exam, or reading questions.",
    parameters: ragSearchParameters,
    strict: false,
    execute: async (input) => {
      const args = parseRagSearchInput(input);
      const maxResults = clamp(args.maxResults ?? 6, 1, 12);
      const results = (await store.searchRag(args.query, args.courseId)).slice(0, maxResults);
      return JSON.stringify({
        query: args.query,
        courseId: args.courseId,
        count: results.length,
        results,
      });
    },
  });
}

function createContextReportTool(store: LocalStore, threadId?: string): Tool {
  return tool({
    name: "context_report",
    description:
      "Inspect the current UCLAW semester, course, task, thread, context-window estimate, enabled skills, and known workspace files. Use this when you need current scope or context-budget details.",
    parameters: {
      type: "object",
      properties: {
        includeRecentMessages: {
          type: "boolean",
          description: "Whether to include recent messages for the active thread.",
        },
        maxRecentMessages: {
          type: "number",
          description: "Maximum recent messages to include when includeRecentMessages is true.",
        },
      },
      required: [],
      additionalProperties: true,
    },
    strict: false,
    execute: async (input) => {
      const args = parseContextReportInput(input);
      const activeThread = threadId ? store.listThreads().find((thread) => thread.id === threadId) : store.listThreads()[0];
      const semester = store.currentSemester();
      const courses = store.listCourses();
      const course = courses.find((item) => item.id === activeThread?.courseId);
      const tasks = course ? store.listTasks(course.id) : [];
      const task = tasks.find((item) => item.id === activeThread?.taskId);
      const context = activeThread ? store.contextReport(activeThread.id) : null;
      const files = course ? store.listFiles(course.id) : [];
      const leafFiles = flattenFileNames(files).slice(0, 24);
      const recentMessages =
        activeThread && args.includeRecentMessages
          ? store
              .messages(activeThread.id)
              .slice(-(args.maxRecentMessages ?? 6))
              .map((message) => ({
                role: message.role,
                createdAt: message.createdAt,
                content: message.content.slice(0, 800),
              }))
          : undefined;

      return JSON.stringify({
        semester,
        thread: activeThread,
        course,
        task,
        context,
        enabledSkills: store.listSkills().filter((skill) => skill.enabled),
        workspaceFiles: {
          totalShown: leafFiles.length,
          files: leafFiles,
        },
        recentMessages,
      });
    },
  });
}

function createAskUserTool(options: UclawToolRegistryOptions): Tool {
  return tool({
    name: "ask_user",
    description:
      "Ask the user a focused clarification question from the UCLAW chat UI and wait for their answer. Use this only when missing information blocks the next useful action.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The exact question to show the user.",
        },
        title: {
          type: "string",
          description: "Short title for the request.",
        },
        detail: {
          type: "string",
          description: "Optional extra context for why the answer is needed.",
        },
        placeholder: {
          type: "string",
          description: "Optional input placeholder.",
        },
      },
      required: ["question"],
      additionalProperties: true,
    },
    strict: false,
    execute: async (input) => {
      const args = parseAskUserInput(input);
      const run = options.runContext;
      if (!run || !options.askUserService) {
        return JSON.stringify({
          ok: false,
          message: "ask_user is unavailable outside a live UCLAW run.",
        });
      }

      const request: AskUserRequest = {
        id: `ask-${run.runId}-${Date.now().toString(36)}`,
        runId: run.runId,
        threadId: run.threadId,
        title: args.title || "Agent needs input",
        question: args.question,
        detail: args.detail,
        placeholder: args.placeholder,
        toolName: "ask_user",
        arguments: args,
      };
      options.emit?.({
        id: `${request.id}-requested`,
        type: "ask_user_requested",
        runId: run.runId,
        threadId: run.threadId,
        status: "waiting_approval",
        title: request.title,
        detail: request.question,
        ask_user: request,
      });
      const response = await options.askUserService.waitForResponse(request, run.signal);
      return JSON.stringify({
        ok: true,
        response,
      });
    },
  });
}

function parseRagSearchInput(input: unknown): { query: string; courseId?: string; maxResults?: number } {
  const raw = typeof input === "string" ? safeJsonParse(input) : input;
  const record = isRecord(raw) ? raw : {};
  const query = typeof record.query === "string" && record.query.trim() ? record.query.trim() : "course materials";
  const courseId = typeof record.courseId === "string" && record.courseId.trim() ? record.courseId.trim() : undefined;
  const maxResults = typeof record.maxResults === "number" ? record.maxResults : undefined;
  return { query, courseId, maxResults };
}

function parseContextReportInput(input: unknown): { includeRecentMessages?: boolean; maxRecentMessages?: number } {
  const raw = typeof input === "string" ? safeJsonParse(input) : input;
  const record = isRecord(raw) ? raw : {};
  const includeRecentMessages = typeof record.includeRecentMessages === "boolean" ? record.includeRecentMessages : undefined;
  const maxRecentMessages = typeof record.maxRecentMessages === "number" ? clamp(record.maxRecentMessages, 1, 12) : undefined;
  return { includeRecentMessages, maxRecentMessages };
}

function parseAskUserInput(input: unknown): { question: string; title?: string; detail?: string; placeholder?: string } {
  const raw = typeof input === "string" ? safeJsonParse(input) : input;
  const record = isRecord(raw) ? raw : {};
  const question = typeof record.question === "string" && record.question.trim() ? record.question.trim() : "What should UCLAW do next?";
  return {
    question,
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : undefined,
    detail: typeof record.detail === "string" && record.detail.trim() ? record.detail.trim() : undefined,
    placeholder: typeof record.placeholder === "string" && record.placeholder.trim() ? record.placeholder.trim() : undefined,
  };
}

function flattenFileNames(files: Array<{ name: string; path: string; kind: string; children?: Array<any> }>): Array<{ name: string; path: string; kind: string }> {
  return files.flatMap((file) => [
    { name: file.name, path: file.path, kind: file.kind },
    ...flattenFileNames(file.children || []),
  ]);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { query: value };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
