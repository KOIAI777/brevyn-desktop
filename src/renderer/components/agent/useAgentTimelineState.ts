import { useCallback, useEffect, useMemo, useState } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread } from "@/types/domain";
import { DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT, MAX_AUTO_COMPACT_THRESHOLD_PERCENT, MIN_AUTO_COMPACT_THRESHOLD_PERCENT } from "../../../types/domain";
import { changedFilesFromProcessEvents, type ChangedFileSummary } from "@/components/agent/agentChangedFilesModel";
import { useAgentTimelineRecords } from "@/components/agent/useAgentTimelineRecords";
import {
  assistantBlocks,
  agentErrorMessage,
  approvalDecision,
  approvalResolutionMap,
  assistantText,
  buildTimelineRenderMeta,
  exitPlanDecision,
  exitPlanResolutionMap,
  isCompactCommandMessage,
  isCompactPlaceholderRecord,
  isProcessPlaceholderRecord,
  isPromptTooLongMessage,
  isRuntimeRecord,
  isThinkingStreamRecord,
  isStreamRecord,
  latestTurnBounds,
  recordObject,
  stringValue,
  timelineRecordIdentity,
  toolResultBlocks,
  userText,
  questionAnswers,
  questionResolutionMap,
  type AgentTimelineRecord,
  type AgentTodoItem,
  type ProcessEvent,
  type ContextUsage,
  type RunSummary,
} from "@/components/agent/agentTimelineModel";

export interface AgentTimelinePanelState {
  nowMs: number;
  timelineRecords: AgentTimelineRecord[];
  timelineItems: AgentTimelineViewItem[];
  renderMeta: ReturnType<typeof buildTimelineRenderMeta>;
  liveAssistantText: boolean;
  forceProcessOpen: boolean;
  runSummary: RunSummary | null;
  stoppedAssistantIndex?: number;
  todos: AgentTodoItem[];
  contextUsage: ContextUsage | null;
  compacting: boolean;
  effectiveRunning: boolean;
  effectiveCompacting: boolean;
  processCollapsedByKey: Record<string, boolean>;
  activeProvider?: ModelProviderConfig;
  autoCompactThresholdPercent: number;
  setProcessCollapsedByKey: (value: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void;
  toggleProcessCollapsed: (key: string, defaultCollapsed: boolean, lockedOpen: boolean) => void;
  handleCompact: () => Promise<void>;
}

export interface AgentTimelineViewItem {
  record: AgentTimelineRecord;
  displayKind: AgentTimelineDisplayKind;
  assistantContent?: string;
  promptTooLongMessage?: string;
  providerErrorMessage?: string;
  attachProcess: boolean;
  processHeader: boolean;
  processNarration: boolean;
  assistantCopyContent?: string;
  stoppedByUser: boolean;
  approvalDecision?: "allow" | "deny";
  questionAnswers?: Record<string, string>;
  exitPlanDecision?: "approve" | "deny";
  processSummary: RunSummary | null;
  processEvents: ProcessEvent[];
  changedFiles: ChangedFileSummary[];
  processExpanded: boolean;
  processLockedOpen: boolean;
  processKey: string;
  defaultCollapsed: boolean;
}

export type AgentTimelineDisplayKind =
  | "hidden"
  | "stream"
  | "process"
  | "compact-compacting"
  | "compact-complete"
  | "approval-request"
  | "question-request"
  | "question-resolved"
  | "exit-plan-request"
  | "exit-plan-resolved"
  | "user-message"
  | "prompt-too-long"
  | "provider-error"
  | "assistant-process-only"
  | "assistant-narration"
  | "assistant-final"
  | "result-process";

export interface UseAgentTimelinePanelStateArgs {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  running: boolean;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
}

export function useAgentTimelineState({
  thread,
  records,
  running,
  agentProviders,
  activeProviderId,
  onRun,
}: UseAgentTimelinePanelStateArgs): AgentTimelinePanelState {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [processCollapsedByKey, setProcessCollapsedByKey] = useState<Record<string, boolean>>({});
  const [compactInFlightAfterCount, setCompactInFlightAfterCount] = useState<number | null>(null);

  const activeProviderSelection = useMemo(() => parseProviderModelSelection(activeProviderId), [activeProviderId]);
  const activeProvider = useMemo(
    () => agentProviders.find((provider) => provider.id === activeProviderSelection.providerId),
    [activeProviderSelection.providerId, agentProviders],
  );
  const activeModelId = activeProviderSelection.modelId || activeProvider?.selectedModel;
  const compactInFlight = compactInFlightAfterCount !== null;
  const { effectiveRunning, timelineRecords } = useAgentTimelineRecords({ threadId: thread.id, records, running, compactInFlight });
  const renderMeta = useMemo(() => buildTimelineRenderMeta(timelineRecords), [timelineRecords]);
  const liveAssistantText = renderMeta.hasLiveAssistantText;
  const forceProcessOpen = effectiveRunning && !liveAssistantText;
  const runSummary = useMemo(() => latestRunSummary(timelineRecords, nowMs, effectiveRunning), [effectiveRunning, nowMs, timelineRecords]);
  const stoppedAssistantIndex = useMemo(
    () => runSummary?.status === "stopped" ? latestCopyableAssistantIndex(renderMeta) : undefined,
    [renderMeta, runSummary?.status],
  );
  const todos = useMemo(() => latestTodoList(records), [records]);
  const contextUsage = useMemo(() => latestContextUsage(records) ?? defaultContextUsage(activeModelId), [activeModelId, records]);
  const compacting = useMemo(() => isCompactingContext(records), [records]);
  const effectiveCompacting = compacting || compactInFlight;
  const autoCompactThreshold = autoCompactThresholdPercent(activeProvider);
  const resolvedApprovals = useMemo(() => approvalResolutionMap(records), [records]);
  const resolvedQuestions = useMemo(() => questionResolutionMap(records), [records]);
  const resolvedExitPlans = useMemo(() => exitPlanResolutionMap(records), [records]);
  const timelineItems = useMemo(() => timelineRecords.map((record, index) => {
    const meta = renderMeta.byIndex.get(index);
    const itemSummary = meta?.processUserIndex === undefined
      ? runSummary
      : runSummaryForUserIndex(timelineRecords, meta.processUserIndex, nowMs, effectiveRunning);
    const processKey = processStateKey(itemSummary, meta?.processUserIndex, timelineRecords, index);
    const defaultCollapsed = !itemSummary?.running;
    const processLockedOpen = Boolean(forceProcessOpen && itemSummary?.running);
    const processExpanded = processLockedOpen || !(processCollapsedByKey[processKey] ?? defaultCollapsed);
    const processEvents = meta?.processEvents || [];
    const display = timelineItemDisplay(record, {
      attachProcess: Boolean(meta?.attachProcess),
      processHeader: Boolean(meta?.processHeader),
      processSummary: itemSummary,
      processNarration: Boolean(meta?.processNarration),
      assistantCopyContent: meta?.assistantCopyContent,
      approvalDecision: approvalDecision(record, resolvedApprovals),
      questionAnswers: questionAnswers(record, resolvedQuestions),
      exitPlanDecision: exitPlanDecision(record, resolvedExitPlans),
    });
    return {
      record,
      displayKind: display.kind,
      assistantContent: display.assistantContent,
      promptTooLongMessage: display.promptTooLongMessage,
      providerErrorMessage: display.providerErrorMessage,
      attachProcess: Boolean(meta?.attachProcess),
      processHeader: Boolean(meta?.processHeader),
      processNarration: Boolean(meta?.processNarration),
      assistantCopyContent: meta?.assistantCopyContent,
      stoppedByUser: index === stoppedAssistantIndex,
      approvalDecision: display.approvalDecision,
      questionAnswers: display.questionAnswers,
      exitPlanDecision: display.exitPlanDecision,
      processSummary: itemSummary,
      processEvents,
      changedFiles: itemSummary && !itemSummary.running ? changedFilesFromProcessEvents(processEvents) : [],
      processExpanded,
      processLockedOpen,
      processKey,
      defaultCollapsed,
    };
  }), [effectiveRunning, forceProcessOpen, nowMs, processCollapsedByKey, renderMeta, resolvedApprovals, resolvedExitPlans, resolvedQuestions, runSummary, stoppedAssistantIndex, timelineRecords]);

  useEffect(() => {
    setProcessCollapsedByKey({});
    setNowMs(Date.now());
  }, [thread.id]);

  useEffect(() => {
    if (!effectiveRunning) {
      setNowMs(Date.now());
      return;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [effectiveRunning]);

  useEffect(() => {
    if (compactInFlightAfterCount === null || records.length <= compactInFlightAfterCount) return;
    const bounds = latestTurnBounds(records);
    if (!bounds) return;
    if (!isCompactCommandMessage(bounds.user)) {
      setCompactInFlightAfterCount(null);
      return;
    }
    const summary = latestRunSummary(timelineRecords, nowMs, effectiveRunning);
    if (summary && summary.status !== "running") setCompactInFlightAfterCount(null);
  }, [compactInFlightAfterCount, effectiveRunning, nowMs, records, timelineRecords]);

  const handleCompact = useCallback(async () => {
    if (effectiveRunning || effectiveCompacting) return;
    setCompactInFlightAfterCount(records.length);
    try {
      await onRun("/compact", "execute", "review", undefined, activeProviderSelection);
    } catch (compactError) {
      setCompactInFlightAfterCount(null);
      console.error("[AgentThreadPanel] Failed to compact context:", compactError);
    }
  }, [activeProviderSelection, effectiveCompacting, effectiveRunning, onRun, records.length]);

  function toggleProcessCollapsed(key: string, defaultCollapsed: boolean, lockedOpen: boolean) {
    if (lockedOpen) return;
    setProcessCollapsedByKey((current) => ({
      ...current,
      [key]: !(current[key] ?? defaultCollapsed),
    }));
  }

  return {
    nowMs,
    timelineRecords,
    timelineItems,
    renderMeta,
    liveAssistantText,
    forceProcessOpen,
    runSummary,
    stoppedAssistantIndex,
    todos,
    contextUsage,
    compacting,
    effectiveRunning,
    effectiveCompacting,
    processCollapsedByKey,
    activeProvider,
    autoCompactThresholdPercent: autoCompactThreshold,
    setProcessCollapsedByKey,
    toggleProcessCollapsed,
    handleCompact,
  };
}

export function processStateKey(summary: RunSummary | null, userIndex: number | undefined, records: AgentTimelineRecord[], recordIndex: number): string {
  if (summary?.runId) return `run-${summary.runId}`;
  if (userIndex !== undefined && records[userIndex]) return `turn-${timelineRecordIdentity(records[userIndex])}`;
  const record = records[recordIndex];
  if (record) return `record-${timelineRecordIdentity(record)}`;
  return `record-${recordIndex}`;
}

function timelineItemDisplay(
  record: AgentTimelineRecord,
  state: {
    attachProcess: boolean;
    processHeader: boolean;
    processSummary: RunSummary | null;
    processNarration: boolean;
    assistantCopyContent?: string;
    approvalDecision?: "allow" | "deny";
    questionAnswers?: Record<string, string>;
    exitPlanDecision?: "approve" | "deny";
  },
): {
  kind: AgentTimelineDisplayKind;
  assistantContent?: string;
  promptTooLongMessage?: string;
  providerErrorMessage?: string;
  approvalDecision?: "allow" | "deny";
  questionAnswers?: Record<string, string>;
  exitPlanDecision?: "approve" | "deny";
} {
  if (isStreamRecord(record)) return { kind: "stream" };
  if (isThinkingStreamRecord(record)) return { kind: state.attachProcess && state.processSummary ? "process" : "hidden" };
  if (isProcessPlaceholderRecord(record)) return { kind: state.attachProcess && state.processSummary ? "process" : "hidden" };
  if (isCompactPlaceholderRecord(record)) return { kind: "compact-compacting" };

  if (isRuntimeRecord(record)) {
    if (record.event.type === "approval_requested") {
      return state.approvalDecision
        ? { kind: "hidden", approvalDecision: state.approvalDecision }
        : { kind: "approval-request", approvalDecision: state.approvalDecision };
    }
    if (record.event.type === "ask_user_requested") {
      return state.questionAnswers
        ? { kind: "question-resolved", questionAnswers: state.questionAnswers }
        : { kind: "question-request", questionAnswers: state.questionAnswers };
    }
    if (record.event.type === "exit_plan_requested") {
      return state.exitPlanDecision
        ? { kind: "exit-plan-resolved", exitPlanDecision: state.exitPlanDecision }
        : { kind: "exit-plan-request", exitPlanDecision: state.exitPlanDecision };
    }
    return { kind: "hidden" };
  }

  const message = record as SDKMessage;
  if (message.type === "user") {
    if (isCompactCommandMessage(message) || toolResultBlocks(message).length) return { kind: "hidden" };
    return { kind: "user-message" };
  }

  if (message.type === "assistant") {
    if (isPromptTooLongMessage(message)) {
      return { kind: "prompt-too-long", promptTooLongMessage: assistantText(message) || agentErrorMessage(message) };
    }
    const errorMessage = agentErrorMessage(message);
    if (errorMessage) {
      return { kind: "provider-error", providerErrorMessage: assistantText(message) || errorMessage };
    }
    const content = assistantBlocks(message).flatMap((block) => block.type === "text" ? [block.text] : []).join("\n\n");
    if (!content.trim()) return { kind: state.attachProcess ? "assistant-process-only" : "hidden" };
    if (state.processNarration) return { kind: state.attachProcess ? "assistant-narration" : "hidden" };
    if (state.attachProcess && state.processSummary?.status === "running" && !state.assistantCopyContent) {
      return { kind: "assistant-process-only" };
    }
    return { kind: "assistant-final", assistantContent: content };
  }

  if (message.type === "result") return { kind: state.attachProcess && state.processSummary ? "result-process" : "hidden" };

  if (message.type === "system") {
    const subtype = stringValue((message as { subtype?: unknown }).subtype, "");
    if (subtype === "compacting") return { kind: "compact-compacting" };
    if (subtype === "compact_boundary") return { kind: "compact-complete" };
  }

  return { kind: "hidden" };
}

export function runSummaryForUserIndex(records: AgentTimelineRecord[], userIndex: number, nowMs: number, active: boolean): RunSummary | null {
  const user = records[userIndex];
  if (!user || isRuntimeRecord(user) || (user as SDKMessage).type !== "user") return null;
  const result = resultForUserIndex(records, userIndex);
  const runStart = latestRunStart(records, userIndex);
  const lifecycle = latestRunLifecycle(records, userIndex);
  const latestBounds = latestTurnBounds(records);
  const isLatestTurn = latestBounds?.userIndex === userIndex;
  const startMs = recordCreatedAtMs(user) ?? nowMs;
  const finishMs = lifecycle?.createdAtMs ?? (result.record ? recordCreatedAtMs(result.record) ?? nowMs : nowMs);
  const running = !lifecycle && !result.record && active && isLatestTurn;
  const runId = runStart?.runId || stringValue((user as { uuid?: unknown }).uuid, `turn-${userIndex}`);
  const permissionMode = runStart?.permissionMode;
  const duration = formatDuration(Math.max(0, finishMs - startMs));
  const resultSubtype = result.record ? String((result.record as { subtype?: unknown }).subtype || "") : "";
  const status = lifecycle?.status ?? statusFromResultSubtype(resultSubtype, running);
  const detail = normalizedRunDetail(lifecycle?.detail ?? resultDetail(result.record));
  if (status === "running") return { runId, label: eventsSinceStart(records, userIndex) ? `已处理 ${duration}` : "Thinking", running: true, status, permissionMode };
  if (status === "stopped") return { runId, label: `已停止 · ${duration}`, running: false, status, permissionMode, detail };
  if (status === "failed") return { runId, label: `运行失败 · ${duration}`, running: false, status, permissionMode, detail };
  if (status === "interrupted") return { runId, label: `已中断 · ${duration}`, running: false, status, permissionMode, detail };
  return { runId, label: `已处理 ${duration}`, running: false, status: "completed", permissionMode, detail };
}

export function autoCompactThresholdPercent(provider?: ModelProviderConfig): number {
  const value = provider?.autoCompactThresholdPercent;
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT;
  return clampNumber(value, MIN_AUTO_COMPACT_THRESHOLD_PERCENT, MAX_AUTO_COMPACT_THRESHOLD_PERCENT);
}

function defaultContextUsage(model?: string): ContextUsage | null {
  const contextWindow = inferContextWindow(model || "");
  return contextWindow ? { inputTokens: 0, contextWindow } : null;
}

export function shouldAutoCompactContext(usage: ContextUsage | null, provider?: ModelProviderConfig): boolean {
  if (!usage?.contextWindow || usage.inputTokens <= 0) return false;
  return usage.inputTokens / usage.contextWindow >= autoCompactThresholdPercent(provider) / 100;
}

function parseProviderModelSelection(value: string): { providerId?: string; modelId?: string } {
  const [providerId, modelId] = value.split("::");
  if (!providerId || !modelId) return {};
  return {
    providerId: decodeURIComponent(providerId),
    modelId: decodeURIComponent(modelId),
  };
}

function latestRunSummary(records: AgentTimelineRecord[], nowMs: number, active: boolean): RunSummary | null {
  const bounds = latestTurnBounds(records);
  if (!bounds) return active ? { runId: "active", label: "Thinking", running: true, status: "running" } : null;

  return runSummaryForUserIndex(records, bounds.userIndex, nowMs, active);
}

function resultForUserIndex(records: AgentTimelineRecord[], userIndex: number): { record?: SDKMessage; index?: number } {
  const nextUserIndex = nextUserInputIndex(records, userIndex);
  const endIndex = nextUserIndex ?? records.length;
  for (let index = userIndex + 1; index < endIndex; index += 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if ((record as SDKMessage).type === "result") return { record: record as SDKMessage, index };
  }
  return {};
}

function nextUserInputIndex(records: AgentTimelineRecord[], afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamRecord(record) || isProcessPlaceholderRecord(record) || isCompactPlaceholderRecord(record)) continue;
    if ((record as SDKMessage).type === "user" && !toolResultBlocks(record as SDKMessage).length && userText(record as SDKMessage).trim()) return index;
  }
  return undefined;
}

function latestRunStart(records: AgentTimelineRecord[], userIndex: number): { runId: string; permissionMode?: AgentPermissionMode } | null {
  for (let index = userIndex; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_started") continue;
    return { runId: record.event.runId, permissionMode: record.event.permissionMode };
  }
  return null;
}

function recordCreatedAtMs(record: AgentTimelineRecord): number | undefined {
  if (isRuntimeRecord(record)) {
    const parsed = Date.parse(record.event.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const createdAt = (record as { _createdAt?: unknown })._createdAt;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
  const timestamp = (record as { timestamp?: unknown }).timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function latestRunLifecycle(records: AgentTimelineRecord[], userIndex: number): { status: RunSummary["status"]; detail?: string; createdAtMs?: number } | null {
  let runId = "";
  let runStartIndex = -1;
  for (let index = userIndex; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_started") continue;
    runId = record.event.runId;
    runStartIndex = index;
    break;
  }
  if (!runId) return null;

  for (let index = runStartIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || !("runId" in record.event) || record.event.runId !== runId) continue;
    if (record.event.type === "run_completed") return { status: "completed", createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_stopped") return { status: "stopped", detail: record.event.reason, createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_failed") return { status: "failed", detail: record.event.error, createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_interrupted") return { status: "interrupted", detail: record.event.reason, createdAtMs: recordCreatedAtMs(record) };
  }
  return null;
}

function statusFromResultSubtype(subtype: string, running: boolean): RunSummary["status"] {
  if (running) return "running";
  if (subtype === "success") return "completed";
  if (subtype === "stopped_by_user") return "stopped";
  if (subtype === "interrupted") return "interrupted";
  if (subtype) return "failed";
  return "completed";
}

function resultDetail(result?: SDKMessage): string | undefined {
  if (!result) return undefined;
  const errors = (result as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }
  const text = (result as { result?: unknown }).result;
  return typeof text === "string" && text.trim() ? text : undefined;
}

function normalizedRunDetail(detail?: string): string | undefined {
  const text = detail?.trim();
  if (!text || text === "Agent run stopped.") return undefined;
  return text;
}

function eventsSinceStart(records: AgentTimelineRecord[], userIndex: number): boolean {
  return records.slice(userIndex + 1).some((record) => {
    if (isRuntimeRecord(record)) return false;
    return (record as SDKMessage).type === "assistant" || (record as SDKMessage).type === "stream_event";
  });
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function latestCopyableAssistantIndex(meta: ReturnType<typeof buildTimelineRenderMeta>): number | undefined {
  const indexes = [...meta.byIndex.entries()].flatMap(([index, value]) => value.assistantCopyContent ? [index] : []);
  return indexes.at(-1);
}

function latestTodoList(records: BrevynAgentTimelineRecord[]): AgentTodoItem[] {
  let latest: AgentTodoItem[] = [];
  let latestTodoUserInputIndex = -1;
  const latestUserInputIndex = lastUserInputIndex(records);
  for (const [index, record] of records.entries()) {
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type !== "tool_use" || block.name !== "TodoWrite") continue;
      const todos = recordObject(block.input).todos;
      if (!Array.isArray(todos)) continue;
      latest = todos.flatMap((todo) => {
        const item = recordObject(todo);
        const content = stringValue(item.content, "");
        if (!content) return [];
        const rawStatus = stringValue(item.status, "pending");
        const status = rawStatus === "completed" || rawStatus === "in_progress" ? rawStatus : "pending";
        return [{ content, status }];
      });
      latestTodoUserInputIndex = ownerUserInputIndex(records, index);
    }
  }
  if (latest.length === 0) return [];
  const completed = latest.every((todo) => todo.status === "completed");
  if (completed && latestUserInputIndex > latestTodoUserInputIndex) return [];
  return latest;
}

function lastUserInputIndex(records: BrevynAgentTimelineRecord[]): number {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    if (toolResultBlocks(record as SDKMessage).length || !userText(record as SDKMessage).trim()) continue;
    return index;
  }
  return -1;
}

function ownerUserInputIndex(records: BrevynAgentTimelineRecord[], beforeIndex: number): number {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    if (toolResultBlocks(record as SDKMessage).length || !userText(record as SDKMessage).trim()) continue;
    return index;
  }
  return -1;
}

function latestContextUsage(records: BrevynAgentTimelineRecord[]): ContextUsage | null {
  let latest: ContextUsage | null = null;
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    const message = record as SDKMessage;
    if (message.type === "assistant") {
      const rawMessage = recordObject((message as { message?: unknown }).message);
      const usage = recordObject(rawMessage.usage);
      const inputTokens = tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
      if (inputTokens > 0) {
        const previousContextWindow: number | undefined = latest ? latest.contextWindow : undefined;
        latest = {
          inputTokens,
          outputTokens: tokenNumber(usage.output_tokens) || undefined,
          cacheReadTokens: tokenNumber(usage.cache_read_input_tokens) || undefined,
          cacheCreationTokens: tokenNumber(usage.cache_creation_input_tokens) || undefined,
          contextWindow: previousContextWindow ?? inferContextWindow(stringValue(rawMessage.model ?? (message as { _channelModelId?: unknown })._channelModelId, "")),
        };
      }
      continue;
    }
    if (message.type === "result") {
      const usage = recordObject((message as { usage?: unknown }).usage);
      const primaryUsage = primaryModelUsageFromResult(message);
      const contextWindow = primaryUsage?.contextWindow;
      if (latest && contextWindow) {
        latest = { ...latest, contextWindow };
        continue;
      }
      const inputTokens = primaryUsage
        ? primaryUsage.inputTokens + (primaryUsage.cacheReadTokens || 0) + (primaryUsage.cacheCreationTokens || 0)
        : tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
      if (!latest && (inputTokens > 0 || contextWindow)) {
        latest = {
          inputTokens: inputTokens || 0,
          outputTokens: primaryUsage?.outputTokens || tokenNumber(usage.output_tokens) || undefined,
          cacheReadTokens: primaryUsage?.cacheReadTokens || tokenNumber(usage.cache_read_input_tokens) || undefined,
          cacheCreationTokens: primaryUsage?.cacheCreationTokens || tokenNumber(usage.cache_creation_input_tokens) || undefined,
          contextWindow,
        };
      }
    }
  }
  return latest && latest.inputTokens > 0 ? latest : null;
}

function isCompactingContext(records: BrevynAgentTimelineRecord[]): boolean {
  let compacting = false;
  for (const record of records) {
    if (isRuntimeRecord(record)) continue;
    if ((record as SDKMessage).type === "result") {
      compacting = false;
      continue;
    }
    if ((record as SDKMessage).type !== "system") continue;
    const subtype = stringValue((record as { subtype?: unknown }).subtype, "");
    if (subtype === "compacting") compacting = true;
    if (subtype === "compact_boundary") compacting = false;
  }
  return compacting;
}

function primaryModelUsageFromResult(message: SDKMessage): ContextUsage | undefined {
  const modelUsage = recordObject((message as { modelUsage?: unknown }).modelUsage);
  let selected: ContextUsage | undefined;
  let selectedTokens = 0;
  for (const value of Object.values(modelUsage)) {
    const usage = recordObject(value);
    const inputTokens = tokenNumber(usage.inputTokens);
    const cacheReadTokens = tokenNumber(usage.cacheReadInputTokens);
    const cacheCreationTokens = tokenNumber(usage.cacheCreationInputTokens);
    const totalInputTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    if (totalInputTokens <= selectedTokens) continue;
    selectedTokens = totalInputTokens;
    selected = {
      inputTokens,
      outputTokens: tokenNumber(usage.outputTokens) || undefined,
      cacheReadTokens: cacheReadTokens || undefined,
      cacheCreationTokens: cacheCreationTokens || undefined,
      contextWindow: tokenNumber(usage.contextWindow) || undefined,
    };
  }
  return selected;
}

function inferContextWindow(model: string): number | undefined {
  const normalized = model.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("haiku")) return 200_000;
  if (normalized.includes("deepseek-v4")) return 1_000_000;
  if (normalized.includes("claude-sonnet-4") || normalized.includes("claude-opus-4-6") || normalized.includes("claude-opus-4-7")) return 1_000_000;
  return 200_000;
}

function tokenNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
