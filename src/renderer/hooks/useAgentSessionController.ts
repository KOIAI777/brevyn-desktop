import { useCallback, useEffect, useRef, useState } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentAttachment,
  AgentPermissionMode,
  BrevynAgentSessionRecord,
  BrevynAgentTimelineRecord,
  ModelProviderConfig,
  Thread,
} from "@/types/domain";
import {
  agentRuntimeEventThreadId,
  appendAgentLiveMessage,
  appendAgentRuntimeEvent,
  clearAgentLiveRecords,
  clearAllAgentLiveRecords,
  flushAgentLiveRecords,
  removeAgentLiveMessage,
  setAgentLiveRunning,
} from "@/lib/agent-live-store";

const AGENT_MODEL_STORAGE_PREFIX = "brevyn.agent.modelSelection.";

interface UseAgentSessionControllerArgs {
  activeThreadId: string;
  onThreadHasMessages: (threadId: string) => void;
  onThreadUpdated?: (thread: Thread) => void;
}

export interface AgentProviderSelection {
  providerId?: string;
  modelId?: string;
}

export function useAgentSessionController({
  activeThreadId,
  onThreadHasMessages,
  onThreadUpdated,
}: UseAgentSessionControllerArgs) {
  const mountedRef = useRef(true);
  const activeThreadIdRef = useRef(activeThreadId);
  const agentLoadRequestRef = useRef(0);
  const runningRef = useRef(false);
  const runInFlightByThreadRef = useRef<Set<string>>(new Set());
  const selectedAgentModelRef = useRef("");
  const runModelSelectionByThreadRef = useRef<Map<string, string>>(new Map());
  const onThreadHasMessagesRef = useRef(onThreadHasMessages);
  const onThreadUpdatedRef = useRef(onThreadUpdated);

  const [records, setRecords] = useState<BrevynAgentTimelineRecord[]>([]);
  const [recordsThreadId, setRecordsThreadId] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ModelProviderConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  activeThreadIdRef.current = activeThreadId;
  selectedAgentModelRef.current = selectedModel;
  onThreadHasMessagesRef.current = onThreadHasMessages;
  onThreadUpdatedRef.current = onThreadUpdated;

  const loadMessages = useCallback(async (threadId: string): Promise<boolean> => {
    const requestId = agentLoadRequestRef.current + 1;
    agentLoadRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const nextRecords = await window.brevyn.agent.messages(threadId);
      if (!mountedRef.current || agentLoadRequestRef.current !== requestId || activeThreadIdRef.current !== threadId) return false;
      setRecords(nextRecords);
      setRecordsThreadId(threadId);
      const openRun = hasOpenAgentRun(nextRecords);
      runningRef.current = openRun;
      setRunning(openRun);
      setAgentLiveRunning(threadId, openRun);
      if (!openRun) {
        clearAgentLiveRecords(threadId, { preserveStoppedRuns: true });
      }
      return true;
    } catch (loadError) {
      if (mountedRef.current && agentLoadRequestRef.current === requestId) {
        setError(errorMessage(loadError, "Failed to load agent timeline."));
        setRecords([]);
        setRecordsThreadId(threadId);
        runningRef.current = false;
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
      const storedSelection = readStoredAgentModelSelection(activeThreadIdRef.current);
      setSelectedModel((current) => validAgentModelSelection(agents, storedSelection || current));
    } catch {
      if (mountedRef.current) setProviders([]);
    }
  }, []);

  const selectProvider = useCallback(async (providerSelection: string) => {
    setError("");
    const nextSelection = validAgentModelSelection(providers, providerSelection || selectedAgentModelRef.current);
    setSelectedModel(nextSelection);
    writeStoredAgentModelSelection(activeThreadIdRef.current, nextSelection);
  }, [providers]);

  const runForThread = useCallback(async (
    threadId: string,
    prompt: string,
    permissionMode: AgentPermissionMode = "auto",
    attachments?: AgentAttachment[],
    providerSelection?: AgentProviderSelection,
    mentionedSkills?: string[],
  ): Promise<boolean> => {
    if (!threadId) return false;
    const isActiveThread = threadId === activeThreadIdRef.current;
    if ((isActiveThread && runningRef.current) || runInFlightByThreadRef.current.has(threadId)) return false;
    if (isActiveThread) {
      setError("");
      setRecordsThreadId(threadId);
      runningRef.current = true;
      setRunning(true);
    }
    runInFlightByThreadRef.current.add(threadId);
    setAgentLiveRunning(threadId, true);
    const runSelection = agentModelSelectionFromProviderSelection(providerSelection) || selectedAgentModelRef.current;
    if (runSelection) runModelSelectionByThreadRef.current.set(threadId, runSelection);
    const userMessageId = createUserMessageId();
    appendAgentLiveMessage(threadId, liveUserMessage(prompt, attachments, userMessageId));
    flushAgentLiveRecords(threadId);
    onThreadHasMessagesRef.current(threadId);
    try {
      await window.brevyn.agent.run({
        threadId,
        prompt,
        uuid: userMessageId,
        permissionMode,
        attachments,
        providerId: providerSelection?.providerId,
        modelId: providerSelection?.modelId,
        mentionedSkills,
      });
      return true;
    } catch (runError) {
      removeAgentLiveMessage(threadId, userMessageId);
      if (isActiveThread) {
        runningRef.current = false;
        setRunning(false);
      }
      runInFlightByThreadRef.current.delete(threadId);
      setAgentLiveRunning(threadId, false);
      const message = errorMessage(runError, "Failed to start agent run.");
      if (isActiveThread) setError(message);
      throw new Error(message);
    } finally {
      runInFlightByThreadRef.current.delete(threadId);
    }
  }, []);

  const run = useCallback(async (
    prompt: string,
    permissionMode: AgentPermissionMode = "auto",
    attachments?: AgentAttachment[],
    providerSelection?: AgentProviderSelection,
    mentionedSkills?: string[],
  ): Promise<void> => {
    await runForThread(activeThreadIdRef.current, prompt, permissionMode, attachments, providerSelection, mentionedSkills);
  }, [runForThread]);

  const stop = useCallback(async (): Promise<void> => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await window.brevyn.agent.stop(threadId);
      runningRef.current = false;
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
      runInFlightByThreadRef.current.clear();
      clearAllAgentLiveRecords();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.brevyn.agent.onEvent((event) => {
      if (event.kind === "thread_updated") {
        onThreadUpdatedRef.current?.(event.thread);
        return;
      }
      const eventThreadId = event.kind === "sdk_message" ? event.threadId : agentRuntimeEventThreadId(event.event);
      if (!eventThreadId) return;

      if (event.kind === "sdk_message") {
        const appended = appendAgentLiveMessage(eventThreadId, event.message, { modelId: modelIdFromSelection(runModelSelectionByThreadRef.current.get(eventThreadId) || selectedAgentModelRef.current) });
        if (event.message.type === "result") {
          flushAgentLiveRecords(eventThreadId);
        }
        if (!appended) return;
        if (isLiveStreamEventMessage(event.message)) return;

        onThreadHasMessagesRef.current(eventThreadId);
        if (event.message.type === "result" && eventThreadId === activeThreadIdRef.current) {
          void loadMessages(eventThreadId).finally(() => {
            if (!mountedRef.current || activeThreadIdRef.current !== eventThreadId) return;
            runInFlightByThreadRef.current.delete(eventThreadId);
            runningRef.current = false;
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

      if (event.event.type === "run_started") {
        const runSelection = agentModelSelectionFromProviderSelection({ providerId: event.event.providerId, modelId: event.event.modelId });
        if (runSelection) runModelSelectionByThreadRef.current.set(eventThreadId, runSelection);
      } else if (isTerminalRunEvent(event.event.type)) {
        runModelSelectionByThreadRef.current.delete(eventThreadId);
        runInFlightByThreadRef.current.delete(eventThreadId);
        setAgentLiveRunning(eventThreadId, false);
        flushAgentLiveRecords(eventThreadId);
      }

      appendAgentRuntimeEvent(event.event);
      if (eventThreadId !== activeThreadIdRef.current) return;
      if (event.event.type === "run_started") {
        runInFlightByThreadRef.current.delete(eventThreadId);
        runningRef.current = true;
        setRunning(true);
        setError("");
      } else if (isTerminalRunEvent(event.event.type)) {
        runInFlightByThreadRef.current.delete(eventThreadId);
        runningRef.current = false;
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
      setSelectedModel("");
      return;
    }
    setSelectedModel(validAgentModelSelection(providers, readStoredAgentModelSelection(activeThreadId)));
  }, [activeThreadId, providers]);

  useEffect(() => {
    if (!activeThreadId) {
      agentLoadRequestRef.current += 1;
      setRecords([]);
      setRecordsThreadId("");
      setLoading(false);
      runningRef.current = false;
      setRunning(false);
      setError("");
      return;
    }
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  return {
    records: recordsThreadId === activeThreadId ? records : [],
    loading: loading || recordsThreadId !== activeThreadId,
    running,
    error,
    providers,
    selectedProviderId: validAgentModelSelection(providers, selectedModel),
    refreshProviders,
    selectProvider,
    run,
    runForThread,
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

function agentModelSelectionFromProviderSelection(selection?: AgentProviderSelection): string {
  if (!selection?.providerId || !selection.modelId) return "";
  return agentModelSelectionValue(selection.providerId, selection.modelId);
}

function modelIdFromSelection(value: string): string | undefined {
  const [, modelId] = value.split("::");
  return modelId ? decodeURIComponent(modelId) : undefined;
}

function readStoredAgentModelSelection(threadId: string): string {
  if (!threadId) return "";
  try {
    return window.localStorage.getItem(`${AGENT_MODEL_STORAGE_PREFIX}${threadId}`) || "";
  } catch {
    return "";
  }
}

function writeStoredAgentModelSelection(threadId: string, selection: string): void {
  if (!threadId || !selection) return;
  try {
    window.localStorage.setItem(`${AGENT_MODEL_STORAGE_PREFIX}${threadId}`, selection);
  } catch {
    // Model selection is a UI preference; provider defaults remain the fallback.
  }
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
