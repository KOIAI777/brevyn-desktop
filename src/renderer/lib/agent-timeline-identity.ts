import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BrevynAgentTimelineRecord } from "@/types/domain";

export type AgentTimelineIdentityRecord =
  | BrevynAgentTimelineRecord
  | { kind: "stream"; id: string; text: string }
  | { kind: "thinking_stream"; id: string; text: string }
  | { kind: "process_placeholder"; id: string }
  | { kind: "compact_placeholder"; id: string };

export function recordCreatedAtMs(record: unknown): number | undefined {
  if (isRuntimeRecord(record)) {
    const parsed = Date.parse(record.event.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const createdAt = (record as { _createdAt?: unknown })._createdAt;
  if (typeof createdAt === "number") return createdAt;
  const timestamp = (record as { timestamp?: unknown }).timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function timelineRecordIdentity(record: AgentTimelineIdentityRecord): string {
  if (isSyntheticTimelineRecord(record)) return `${record.kind}:${record.id}`;
  if (isRuntimeRecord(record)) {
    return `runtime:${record.event.type}:${runtimeIdentityPayload(record.event)}:${stableRecordSignature(record.event)}`;
  }
  const maybeUuid = (record as { uuid?: unknown }).uuid;
  if (typeof maybeUuid === "string" && maybeUuid.trim()) return `uuid:${maybeUuid.trim()}`;
  const message = record as SDKMessage;
  return `${message.type}:${recordCreatedAtMs(message) ?? ""}:${stableRecordSignature(message)}`;
}

function isRuntimeRecord(record: unknown): record is Extract<BrevynAgentTimelineRecord, { kind: "runtime" }> {
  return Boolean(record && typeof record === "object" && "kind" in record && record.kind === "runtime");
}

function isSyntheticTimelineRecord(record: unknown): record is Exclude<AgentTimelineIdentityRecord, BrevynAgentTimelineRecord> {
  if (!record || typeof record !== "object" || !("kind" in record)) return false;
  const kind = (record as { kind?: unknown }).kind;
  return kind === "stream" || kind === "thinking_stream" || kind === "process_placeholder" || kind === "compact_placeholder";
}

function runtimeIdentityPayload(event: object): string {
  const payload = recordObject(event);
  const runId = stringValue(payload.runId, "");
  const requestId = stringValue(payload.requestId, "");
  const detail = stringValue(payload.reason ?? payload.error, "");
  const createdAt = stringValue(payload.createdAt, "");
  return [runId, requestId, detail, createdAt].filter(Boolean).join(":");
}

function stableRecordSignature(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (!json) return "";
    return hashString(json);
  } catch {
    return hashString(String(value));
  }
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}
