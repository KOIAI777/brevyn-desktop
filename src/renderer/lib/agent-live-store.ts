import { useSyncExternalStore } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { timelineRecordIdentity, timelineRecordRenderKey } from "@/lib/agent-timeline-identity";
import type { BrevynAgentRuntimeEvent, BrevynAgentTimelineRecord } from "@/types/domain";

const EMPTY_RECORDS: BrevynAgentTimelineRecord[] = [];

let liveRecordsByThread = new Map<string, BrevynAgentTimelineRecord[]>();
let liveRunningByThread = new Map<string, boolean>();
let pendingRecordsByThread = new Map<string, BrevynAgentTimelineRecord[]>();
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function appendAgentLiveRecords(threadId: string, records: BrevynAgentTimelineRecord[]): void {
  if (!threadId || records.length === 0) return;
  const normalized = records.flatMap((record) => {
    const liveRecord = prepareLiveRecord(record);
    return liveRecord ? [liveRecord] : [];
  });
  if (normalized.length === 0) return;
  const current = pendingRecordsByThread.get(threadId) || EMPTY_RECORDS;
  pendingRecordsByThread.set(threadId, [...current, ...normalized]);
  scheduleAgentLiveRecordsFlush();
}

export function appendAgentLiveMessage(threadId: string, message: SDKMessage, options?: { modelId?: string }): boolean {
  const liveMessage = prepareLiveMessage(message, options);
  if (!liveMessage) return false;
  appendAgentLiveRecords(threadId, [liveMessage]);
  return true;
}

export function removeAgentLiveMessage(threadId: string, uuid: string): void {
  if (!threadId || !uuid) return;
  const pending = pendingRecordsByThread.get(threadId) || EMPTY_RECORDS;
  if (pending.length > 0) {
    const nextPending = pending.filter((record) => recordUuid(record) !== uuid);
    if (nextPending.length === 0) pendingRecordsByThread.delete(threadId);
    else if (nextPending.length !== pending.length) pendingRecordsByThread.set(threadId, nextPending);
  }

  const current = liveRecordsByThread.get(threadId) || EMPTY_RECORDS;
  if (current.length === 0) return;
  const nextRecords = current.filter((record) => recordUuid(record) !== uuid);
  if (nextRecords.length === current.length) return;
  const next = new Map(liveRecordsByThread);
  if (nextRecords.length === 0) next.delete(threadId);
  else next.set(threadId, nextRecords);
  liveRecordsByThread = next;
  emitAgentLiveRecordsChanged();
}

export function appendAgentRuntimeEvent(event: BrevynAgentRuntimeEvent): string {
  const threadId = agentRuntimeEventThreadId(event);
  if (!threadId) return "";
  if (event.type === "run_started") {
    setAgentLiveRunning(threadId, true);
  }
  if (event.type === "run_retrying") {
    removeLiveRetryRecord(threadId, event.runId, { silent: true });
  }
  if (event.type === "run_retry_cleared") {
    removeLiveRetryRecord(threadId, event.runId);
    return threadId;
  }
  appendAgentLiveRecords(threadId, [{ kind: "runtime", event }]);
  if (isTerminalRuntimeEvent(event)) {
    removeLiveRetryRecord(threadId, "runId" in event ? event.runId : undefined, { silent: true });
    setAgentLiveRunning(threadId, false);
    flushAgentLiveRecords(threadId);
  }
  return threadId;
}

export function flushAgentLiveRecords(threadId?: string): void {
  if (threadId) {
    flushAgentLiveThread(threadId);
    return;
  }
  if (pendingFlushTimer !== null) {
    clearLiveFlushTimer(pendingFlushTimer);
    pendingFlushTimer = null;
  }
  if (pendingRecordsByThread.size === 0) return;
  const threadIds = [...pendingRecordsByThread.keys()];
  for (const pendingThreadId of threadIds) flushAgentLiveThread(pendingThreadId, { silent: true });
  emitAgentLiveRecordsChanged();
}

export function clearAgentLiveRecords(threadId: string, options?: { preserveStoppedRuns?: boolean }): void {
  if (!threadId) return;
  const pending = pendingRecordsByThread.get(threadId) || EMPTY_RECORDS;
  pendingRecordsByThread.delete(threadId);
  const current = liveRecordsByThread.get(threadId) || EMPTY_RECORDS;
  const merged = options?.preserveStoppedRuns && pending.length > 0
    ? appendUniqueRecords(current, pending)
    : current;
  const preserved = options?.preserveStoppedRuns ? stoppedRunLiveRecords(merged) : EMPTY_RECORDS;
  if (!liveRecordsByThread.has(threadId) && preserved.length === 0) return;
  const next = new Map(liveRecordsByThread);
  if (preserved.length > 0) next.set(threadId, preserved);
  else next.delete(threadId);
  liveRecordsByThread = next;
  emitAgentLiveRecordsChanged();
}

export function setAgentLiveRunning(threadId: string, running: boolean): void {
  if (!threadId) return;
  if (liveRunningByThread.get(threadId) === running) return;
  const next = new Map(liveRunningByThread);
  if (running) next.set(threadId, true);
  else next.delete(threadId);
  liveRunningByThread = next;
  emitAgentLiveRecordsChanged();
}

export function useAgentLiveRunning(threadId: string): boolean {
  return useSyncExternalStore(
    subscribeAgentLiveRecords,
    () => getAgentLiveRunning(threadId),
    () => false,
  );
}

export function clearAllAgentLiveRecords(): void {
  const hadState = liveRecordsByThread.size > 0 || liveRunningByThread.size > 0 || pendingRecordsByThread.size > 0;
  if (pendingFlushTimer !== null) {
    clearLiveFlushTimer(pendingFlushTimer);
    pendingFlushTimer = null;
  }
  pendingRecordsByThread = new Map();
  liveRunningByThread = new Map();
  liveRecordsByThread = new Map();
  if (hadState) emitAgentLiveRecordsChanged();
}

export function getAgentLiveRecords(threadId: string): BrevynAgentTimelineRecord[] {
  if (!threadId) return EMPTY_RECORDS;
  return liveRecordsByThread.get(threadId) || EMPTY_RECORDS;
}

export function getAgentLiveRunning(threadId: string): boolean {
  if (!threadId) return false;
  return liveRunningByThread.get(threadId) ?? false;
}

export function useAgentLiveRecords(threadId: string): BrevynAgentTimelineRecord[] {
  return useSyncExternalStore(
    subscribeAgentLiveRecords,
    () => getAgentLiveRecords(threadId),
    () => EMPTY_RECORDS,
  );
}

function subscribeAgentLiveRecords(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitAgentLiveRecordsChanged(): void {
  for (const listener of listeners) listener();
}

function scheduleAgentLiveRecordsFlush(): void {
  if (pendingFlushTimer !== null) return;
  pendingFlushTimer = setLiveFlushTimer(() => {
    pendingFlushTimer = null;
    flushAgentLiveRecords();
  }, 16);
}

function setLiveFlushTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
  return globalThis.setTimeout(callback, delayMs);
}

function clearLiveFlushTimer(timer: ReturnType<typeof setTimeout>): void {
  globalThis.clearTimeout(timer);
}

function flushAgentLiveThread(threadId: string, options?: { silent?: boolean }): void {
  const pending = pendingRecordsByThread.get(threadId) || EMPTY_RECORDS;
  if (pending.length === 0) return;
  pendingRecordsByThread.delete(threadId);

  const current = liveRecordsByThread.get(threadId) || EMPTY_RECORDS;
  const merged = appendUniqueRecords(current, pending);
  if (merged === current) return;

  const next = new Map(liveRecordsByThread);
  next.set(threadId, merged);
  liveRecordsByThread = next;
  if (!options?.silent) emitAgentLiveRecordsChanged();
}

function appendUniqueRecords(current: BrevynAgentTimelineRecord[], pending: BrevynAgentTimelineRecord[]): BrevynAgentTimelineRecord[] {
  const seenKeys = new Set(current.map(liveRecordKey).filter(Boolean));
  let changed = false;
  const next = [...current];
  for (const record of pending) {
    const key = liveRecordKey(record);
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    next.push(record);
    changed = true;
  }
  return changed ? next : current;
}

function stoppedRunLiveRecords(records: BrevynAgentTimelineRecord[]): BrevynAgentTimelineRecord[] {
  const preserved: BrevynAgentTimelineRecord[] = [];
  let runRecords: BrevynAgentTimelineRecord[] = [];
  let runHasStoppedContent = false;

  function finishRun(terminal?: "run_stopped" | "stopped_result") {
    if (terminal && runHasStoppedContent) preserved.push(...runRecords);
    runRecords = [];
    runHasStoppedContent = false;
  }

  for (const record of records) {
    if (isRuntimeLiveRecord(record) && record.event.type === "run_started") {
      finishRun();
      runRecords = [record];
      continue;
    }

    if (runRecords.length > 0) {
      runRecords.push(record);
      if (isStoppedContentLiveRecord(record)) runHasStoppedContent = true;
      if (isStoppedResultLiveRecord(record)) {
        finishRun("stopped_result");
        continue;
      }
      if (isRuntimeLiveRecord(record) && isTerminalRuntimeEvent(record.event)) {
        finishRun(record.event.type === "run_stopped" ? "run_stopped" : undefined);
      }
    }
  }

  finishRun();
  return preserved;
}

function removeLiveRetryRecord(threadId: string, runId?: string, options?: { silent?: boolean }): void {
  const pending = pendingRecordsByThread.get(threadId) || EMPTY_RECORDS;
  if (pending.length > 0) {
    const nextPending = pending.filter((record) => !isRetryRecord(record, runId));
    if (nextPending.length === 0) pendingRecordsByThread.delete(threadId);
    else if (nextPending.length !== pending.length) pendingRecordsByThread.set(threadId, nextPending);
  }

  const current = liveRecordsByThread.get(threadId) || EMPTY_RECORDS;
  if (current.length === 0) return;
  const nextRecords = current.filter((record) => !isRetryRecord(record, runId));
  if (nextRecords.length === current.length) return;
  const next = new Map(liveRecordsByThread);
  if (nextRecords.length === 0) next.delete(threadId);
  else next.set(threadId, nextRecords);
  liveRecordsByThread = next;
  if (!options?.silent) emitAgentLiveRecordsChanged();
}

function isRetryRecord(record: BrevynAgentTimelineRecord, runId?: string): boolean {
  if (!isRuntimeLiveRecord(record) || record.event.type !== "run_retrying") return false;
  return !runId || record.event.runId === runId;
}

function liveRecordKey(record: BrevynAgentTimelineRecord): string {
  return timelineRecordIdentity(record);
}

function recordUuid(record: BrevynAgentTimelineRecord): string {
  if (!record || typeof record !== "object" || isRuntimeLiveRecord(record)) return "";
  const uuid = (record as { uuid?: unknown }).uuid;
  return typeof uuid === "string" ? uuid : "";
}

function prepareLiveRecord(record: BrevynAgentTimelineRecord): BrevynAgentTimelineRecord | null {
  if (isRuntimeLiveRecord(record)) return record;
  return prepareLiveMessage(record as SDKMessage);
}

function prepareLiveMessage(message: SDKMessage, options?: { modelId?: string }): SDKMessage | null {
  const record = message as SDKMessage & { type?: unknown; isReplay?: unknown; _createdAt?: unknown; _channelModelId?: unknown };
  if (record.isReplay === true) return null;
  if (record.type === "prompt_suggestion") return null;
  let next: SDKMessage & { _createdAt?: unknown; _channelModelId?: unknown; _renderId?: unknown } = message as SDKMessage & { _createdAt?: unknown; _channelModelId?: unknown; _renderId?: unknown };
  if (typeof next._createdAt !== "number") next = { ...next, _createdAt: Date.now() };
  if (!(next as { _renderId?: unknown })._renderId) {
    next = { ...next, _renderId: timelineRecordRenderKey(next, "live") };
  }
  if (record.type === "assistant" && options?.modelId && !next._channelModelId) {
    next = { ...next, _channelModelId: options.modelId };
  }
  return next;
}

function isRuntimeLiveRecord(record: BrevynAgentTimelineRecord): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

function isStoppedContentLiveRecord(record: BrevynAgentTimelineRecord): boolean {
  if (!record || typeof record !== "object" || isRuntimeLiveRecord(record)) return false;
  const type = (record as { type?: unknown }).type;
  if (type === "stream_event") return true;
  if (type !== "assistant") return false;
  const content = (record as { message?: { content?: unknown } }).message?.content;
  return Array.isArray(content) && content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const item = block as { type?: unknown; text?: unknown; thinking?: unknown };
    return (item.type === "text" && typeof item.text === "string" && item.text.trim())
      || (item.type === "thinking" && typeof item.thinking === "string" && item.thinking.trim());
  });
}

function isStoppedResultLiveRecord(record: BrevynAgentTimelineRecord): boolean {
  if (!record || typeof record !== "object" || isRuntimeLiveRecord(record)) return false;
  return (record as { type?: unknown; subtype?: unknown }).type === "result"
    && (record as { subtype?: unknown }).subtype === "stopped_by_user";
}

export function agentRuntimeEventThreadId(event: BrevynAgentRuntimeEvent): string {
  if (event.type === "approval_requested" || event.type === "ask_user_requested" || event.type === "exit_plan_requested") {
    return event.request.threadId;
  }
  return event.threadId;
}

function isTerminalRuntimeEvent(event: BrevynAgentRuntimeEvent): boolean {
  return event.type === "run_completed" || event.type === "run_stopped" || event.type === "run_failed" || event.type === "run_interrupted";
}
