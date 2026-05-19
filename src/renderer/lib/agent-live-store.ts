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

export function appendAgentRuntimeEvent(event: BrevynAgentRuntimeEvent): string {
  const threadId = agentRuntimeEventThreadId(event);
  if (!threadId) return "";
  if (event.type === "run_started") {
    setAgentLiveRunning(threadId, true);
  }
  appendAgentLiveRecords(threadId, [{ kind: "runtime", event }]);
  if (isTerminalRuntimeEvent(event)) {
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

export function clearAgentLiveRecords(threadId: string): void {
  if (!threadId) return;
  pendingRecordsByThread.delete(threadId);
  if (!liveRecordsByThread.has(threadId)) return;
  const next = new Map(liveRecordsByThread);
  next.delete(threadId);
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

function liveRecordKey(record: BrevynAgentTimelineRecord): string {
  return timelineRecordIdentity(record);
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

export function agentRuntimeEventThreadId(event: BrevynAgentRuntimeEvent): string {
  if (event.type === "approval_requested" || event.type === "ask_user_requested" || event.type === "exit_plan_requested") {
    return event.request.threadId;
  }
  return event.threadId;
}

function isTerminalRuntimeEvent(event: BrevynAgentRuntimeEvent): boolean {
  return event.type === "run_completed" || event.type === "run_stopped" || event.type === "run_failed" || event.type === "run_interrupted";
}
