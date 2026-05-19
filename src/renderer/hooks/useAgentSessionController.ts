import { useCallback, useEffect, useRef, useState } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentAttachment,
  AgentPermissionMode,
  BrevynAgentSessionRecord,
  BrevynAgentTimelineRecord,
  ModelProviderConfig,
} from "@/types/domain";
import {
  agentRuntimeEventThreadId,
  appendAgentLiveMessage,
  appendAgentRuntimeEvent,
  clearAgentLiveRecords,
  clearAllAgentLiveRecords,
  flushAgentLiveRecords,
  setAgentLiveRunning,
} from "@/lib/agent-live-store";

interface UseAgentSessionControllerArgs {
  activeThreadId: string;
  onThreadHasMessages: (threadId: string) => void;
  onWriteToolCompleted?: (filePath: string) => void;
}

export interface AgentProviderSelection {
  providerId?: string;
  modelId?: string;
}

export function useAgentSessionController({
  activeThreadId,
  onThreadHasMessages,
  onWriteToolCompleted,
}: UseAgentSessionControllerArgs) {
  const mountedRef = useRef(true);
  const activeThreadIdRef = useRef(activeThreadId);
  const agentLoadRequestRef = useRef(0);
  const selectedAgentModelRef = useRef("");
  const pendingWriteToolPathsRef = useRef<Map<string, string>>(new Map());
  const onThreadHasMessagesRef = useRef(onThreadHasMessages);
  const onWriteToolCompletedRef = useRef(onWriteToolCompleted);

  const [records, setRecords] = useState<BrevynAgentTimelineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ModelProviderConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  activeThreadIdRef.current = activeThreadId;
  selectedAgentModelRef.current = selectedModel;
  onThreadHasMessagesRef.current = onThreadHasMessages;
  onWriteToolCompletedRef.current = onWriteToolCompleted;

  const loadMessages = useCallback(async (threadId: string): Promise<boolean> => {
    const requestId = agentLoadRequestRef.current + 1;
    agentLoadRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const nextRecords = await window.brevyn.agent.messages(threadId);
      if (!mountedRef.current || agentLoadRequestRef.current !== requestId || activeThreadIdRef.current !== threadId) return false;
      setRecords(nextRecords);
      const openRun = hasOpenAgentRun(nextRecords);
      setRunning(openRun);
      setAgentLiveRunning(threadId, openRun);
      if (!openRun) {
        clearAgentLiveRecords(threadId);
      }
      return true;
    } catch (loadError) {
      if (mountedRef.current && agentLoadRequestRef.current === requestId) {
        setError(errorMessage(loadError, "Failed to load agent timeline."));
        setRecords([]);
        setRunning(false);
      }
      return false;
    } finally {
      if (agentLoadRequestRef.current === requestId) setLoading(false);
    }
  }, []);

  const refreshProviders = useCallback(async () => {
    try {
      const providerList = await window.brevyn.providers.list();
      if (!mountedRef.current) return;
      const agents = providerList.filter((provider) => provider.purpose === "agent");
      setProviders(agents);
      setSelectedModel((current) => validAgentModelSelection(agents, current));
    } catch {
      if (mountedRef.current) setProviders([]);
    }
  }, []);

  const selectProvider = useCallback((providerSelection: string) => {
    setError("");
    setSelectedModel((current) => validAgentModelSelection(providers, providerSelection || current));
  }, [providers]);

  const run = useCallback(async (
    prompt: string,
    mode: "execute" | "plan" = "execute",
    permissionMode: AgentPermissionMode = "review",
    attachments?: AgentAttachment[],
    providerSelection?: AgentProviderSelection,
  ): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    setError("");
    setRunning(true);
    setAgentLiveRunning(threadId, true);
    const userMessageId = createUserMessageId();
    appendAgentLiveMessage(threadId, liveUserMessage(prompt, attachments, userMessageId));
    flushAgentLiveRecords(threadId);
    onThreadHasMessagesRef.current(threadId);
    try {
      await window.brevyn.agent.run({
        threadId,
        prompt,
        uuid: userMessageId,
        mode,
        permissionMode,
        attachments,
        providerId: providerSelection?.providerId,
        modelId: providerSelection?.modelId,
      });
    } catch (runError) {
      setRunning(false);
      setAgentLiveRunning(threadId, false);
      const message = errorMessage(runError, "Failed to start agent run.");
      setError(message);
      throw new Error(message);
    }
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await window.brevyn.agent.stop(threadId);
      setRunning(false);
    } catch (stopError) {
      setError(errorMessage(stopError, "Failed to stop agent run."));
    }
  }, []);

  const approve = useCallback(async (requestId: string): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await window.brevyn.agent.approve({ threadId, requestId });
    } catch (approveError) {
      setError(errorMessage(approveError, "Failed to approve tool call."));
    }
  }, []);

  const reject = useCallback(async (requestId: string): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await window.brevyn.agent.reject({ threadId, requestId });
    } catch (rejectError) {
      setError(errorMessage(rejectError, "Failed to deny tool call."));
    }
  }, []);

  const answerQuestion = useCallback(async (requestId: string, answers: Record<string, string>): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await window.brevyn.agent.answerQuestion({ threadId, requestId, answers });
    } catch (answerError) {
      setError(errorMessage(answerError, "Failed to answer agent question."));
    }
  }, []);

  const resolveExitPlan = useCallback(async (requestId: string, decision: "approve" | "deny", feedback?: string): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await window.brevyn.agent.resolveExitPlan({ threadId, requestId, decision, feedback });
    } catch (resolveError) {
      setError(errorMessage(resolveError, "Failed to resolve plan request."));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAllAgentLiveRecords();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.brevyn.agent.onEvent((event) => {
      const eventThreadId = event.kind === "sdk_message" ? event.threadId : agentRuntimeEventThreadId(event.event);
      if (!eventThreadId) return;

      if (event.kind === "sdk_message") {
        const appended = appendAgentLiveMessage(eventThreadId, event.message, { modelId: modelIdFromSelection(selectedAgentModelRef.current) });
        if (event.message.type === "result") {
          flushAgentLiveRecords(eventThreadId);
        }
        if (!appended) return;
        if (isLiveStreamEventMessage(event.message)) return;

        onThreadHasMessagesRef.current(eventThreadId);
        rememberWriteToolPaths(event.message, pendingWriteToolPathsRef.current);
        const completedWritePaths = completedWriteToolPaths(event.message, pendingWriteToolPathsRef.current);
        if (eventThreadId === activeThreadIdRef.current) {
          for (const path of completedWritePaths) onWriteToolCompletedRef.current?.(path);
        }
        if (event.message.type === "result" && eventThreadId === activeThreadIdRef.current) {
          void loadMessages(eventThreadId).finally(() => {
            if (!mountedRef.current || activeThreadIdRef.current !== eventThreadId) return;
            setRunning(false);
            setAgentLiveRunning(eventThreadId, false);
          });
          const subtype = String((event.message as { subtype?: unknown }).subtype || "");
          if (subtype && subtype !== "success" && subtype !== "stopped_by_user" && subtype !== "interrupted") {
            setError(resultErrorMessage(event.message));
          }
        }
        return;
      }

      appendAgentRuntimeEvent(event.event);
      if (eventThreadId !== activeThreadIdRef.current) return;
      if (event.event.type === "run_started") {
        setRunning(true);
        setError("");
      } else if (isTerminalRunEvent(event.event.type)) {
        setRunning(false);
        setAgentLiveRunning(eventThreadId, false);
        flushAgentLiveRecords(eventThreadId);
        if (event.event.type === "run_failed") setError(event.event.error);
      }
    });
    return unsubscribe;
  }, [loadMessages]);

  useEffect(() => {
    if (!activeThreadId) {
      agentLoadRequestRef.current += 1;
      setRecords([]);
      setLoading(false);
      setRunning(false);
      setError("");
      return;
    }
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  return {
    records,
    loading,
    running,
    error,
    providers,
    selectedProviderId: validAgentModelSelection(providers, selectedModel),
    refreshProviders,
    selectProvider,
    run,
    stop,
    approve,
    reject,
    answerQuestion,
    resolveExitPlan,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "").trim();
  return message.trim() || fallback;
}

function resultErrorMessage(message: BrevynAgentSessionRecord): string {
  const errors = (message as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }
  const result = (message as { result?: unknown }).result;
  if (typeof result === "string" && result.trim()) return result;
  return "Agent run failed.";
}

function isLiveStreamEventMessage(message: BrevynAgentTimelineRecord): boolean {
  if ((message as { type?: unknown }).type !== "stream_event") return false;
  const event = (message as { event?: unknown }).event;
  if (!event || typeof event !== "object") return false;
  const type = (event as { type?: unknown }).type;
  return type === "content_block_delta" || type === "content_block_start" || type === "content_block_stop";
}

function isTerminalRunEvent(type: string): boolean {
  return type === "run_completed" || type === "run_stopped" || type === "run_failed" || type === "run_interrupted";
}

function hasOpenAgentRun(records: BrevynAgentTimelineRecord[]): boolean {
  const terminalRunIds = new Set<string>();
  for (const record of records) {
    if (!isAgentRuntimeRecord(record)) continue;
    if (isTerminalRunEvent(record.event.type) && "runId" in record.event) terminalRunIds.add(record.event.runId);
  }
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || !isAgentRuntimeRecord(record)) continue;
    if (record.event.type === "run_started" && !terminalRunIds.has(record.event.runId)) return true;
  }
  return false;
}

function isAgentRuntimeRecord(record: BrevynAgentTimelineRecord): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

function validAgentModelSelection(providers: ModelProviderConfig[], current: string): string {
  const options = agentModelSelectionOptions(providers);
  if (options.some((option) => option === current)) return current;
  return options[0] || "";
}

function agentModelSelectionOptions(providers: ModelProviderConfig[]): string[] {
  return providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => {
      const models = provider.models.filter((model) => model.enabled !== false);
      const selectedFirst = [
        ...models.filter((model) => model.id === provider.selectedModel),
        ...models.filter((model) => model.id !== provider.selectedModel),
      ];
      return selectedFirst.map((model) => agentModelSelectionValue(provider.id, model.id));
    });
}

function agentModelSelectionValue(providerId: string, modelId: string): string {
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function modelIdFromSelection(value: string): string | undefined {
  const [, modelId] = value.split("::");
  return modelId ? decodeURIComponent(modelId) : undefined;
}

function createUserMessageId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `msg_${randomId}` : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function liveUserMessage(prompt: string, attachments: AgentAttachment[] | undefined, uuid: string): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: prompt,
    },
    ...(attachments && attachments.length > 0 ? { _attachments: attachments } : {}),
    parent_tool_use_id: null,
    uuid,
    session_id: "",
    _createdAt: Date.now(),
  } as unknown as SDKMessage;
}

const WRITE_PREVIEW_TOOL_NAMES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

function rememberWriteToolPaths(message: unknown, pending: Map<string, string>): void {
  const record = objectValue(message);
  if (record.type !== "assistant") return;
  for (const block of messageContentBlocks(record)) {
    const data = objectValue(block);
    if (data.type !== "tool_use") continue;
    const toolName = stringValue(data.name);
    if (!WRITE_PREVIEW_TOOL_NAMES.has(toolName)) continue;
    const path = toolInputPath(data.input);
    const id = stringValue(data.id);
    if (id && path) pending.set(id, path);
  }
}

function completedWriteToolPaths(message: unknown, pending: Map<string, string>): string[] {
  const record = objectValue(message);
  if (record.type !== "user") return [];
  const paths: string[] = [];
  for (const block of messageContentBlocks(record)) {
    const data = objectValue(block);
    if (data.type !== "tool_result") continue;
    const id = stringValue(data.tool_use_id);
    if (!id || !pending.has(id)) continue;
    const path = pending.get(id) || "";
    pending.delete(id);
    if (data.is_error === true) continue;
    if (path) paths.push(path);
  }
  return paths;
}

function messageContentBlocks(record: Record<string, unknown>): unknown[] {
  const envelope = objectValue(record.message);
  return Array.isArray(envelope.content) ? envelope.content : [];
}

function toolInputPath(input: unknown): string {
  const data = objectValue(input);
  return stringValue(data.file_path) || stringValue(data.filePath) || stringValue(data.path) || stringValue(data.notebook_path);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
