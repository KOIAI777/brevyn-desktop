import { useCallback, useEffect, useMemo, useState } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread } from "@/types/domain";
import { DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT, MAX_AUTO_COMPACT_THRESHOLD_PERCENT, MIN_AUTO_COMPACT_THRESHOLD_PERCENT } from "../../../types/domain";
import { recordCreatedAtMs, timelineRecordIdentity } from "@/lib/agent-timeline-identity";
import type { ChangedFileSummary } from "@/components/agent/agentChangedFilesModel";
import { useAgentTimelineRecords } from "@/components/agent/useAgentTimelineRecords";
import {
  assistantBlocks,
  agentErrorMessage,
  approvalDecision,
  approvalResolutionMap,
  assistantText,
  exitPlanDecision,
  exitPlanResolutionMap,
  groupIntoTurns,
  isCompactCommandMessage,
  isPromptTooLongMessage,
  isRuntimeRecord,
  isStreamEventRecord,
  latestTurnBounds,
  recordKey,
  recordObject,
  streamThinkingDelta,
  streamToolInputDelta,
  streamToolUseStart,
  streamTextDelta,
  stringValue,
  thinkingTextForMessage,
  toolResultBlocks,
  type ToolResultBlock,
  type ToolUseBlock,
  type WebCitationLink,
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
  timelineGroups: AgentTimelineViewGroup[];
  runSummary: RunSummary | null;
  todos: AgentTodoItem[];
  contextUsage: ContextUsage | null;
  effectiveRunning: boolean;
  effectiveCompacting: boolean;
  activeProvider?: ModelProviderConfig;
  autoCompactThresholdPercent: number;
  toggleProcessCollapsed: (key: string, defaultCollapsed: boolean, lockedOpen: boolean) => void;
  handleCompact: () => Promise<void>;
}

export interface AgentTimelineViewItem {
  record: AgentTimelineRecord;
  displayKind: AgentTimelineDisplayKind;
  streamContent?: string;
  assistantContent?: string;
  promptTooLongMessage?: string;
  providerErrorMessage?: string;
  processHeader: boolean;
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
  processCollapsible: boolean;
  processKey: string;
  defaultCollapsed: boolean;
}

export type AgentTimelineViewGroup =
  | { type: "user"; key: string; item: AgentTimelineViewItem }
  | { type: "assistant-turn"; key: string; items: AgentTimelineViewItem[] }
  | { type: "system"; key: string; item: AgentTimelineViewItem }
  | { type: "runtime"; key: string; item: AgentTimelineViewItem };

export type AgentTimelineDisplayKind =
  | "hidden"
  | "stream"
  | "process"
  | "compact-compacting"
  | "compact-complete"
  | "thinking"
  | "tool-use"
  | "approval-request"
  | "question-request"
  | "question-resolved"
  | "exit-plan-request"
  | "exit-plan-resolved"
  | "user-message"
  | "prompt-too-long"
  | "provider-error"
  | "assistant-final";

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
  const forceProcessOpen = effectiveRunning && !hasRenderableAssistantContent(timelineRecords);
  const runSummary = useMemo(() => latestRunSummary(timelineRecords, nowMs, effectiveRunning), [effectiveRunning, nowMs, timelineRecords]);
  const stoppedAssistantIndex = useMemo(
    () => runSummary?.status === "stopped" ? latestAssistantTextIndex(timelineRecords) : undefined,
    [runSummary?.status, timelineRecords],
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
    const ownerUserIndex = ownerUserInputIndex(timelineRecords, index);
    const itemSummary = ownerUserIndex >= 0
      ? runSummaryForUserIndex(timelineRecords, ownerUserIndex, nowMs, effectiveRunning)
      : runSummary;
    const processKey = processStateKey(itemSummary, ownerUserIndex >= 0 ? ownerUserIndex : undefined, timelineRecords, index);
    const defaultCollapsed = !itemSummary?.running;
    const processLockedOpen = Boolean(forceProcessOpen && itemSummary?.running);
    const processExpanded = processLockedOpen || !(processCollapsedByKey[processKey] ?? defaultCollapsed);
    const display = timelineItemDisplay(record, {
      processSummary: itemSummary,
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
      processHeader: false,
      assistantCopyContent: display.assistantContent,
      stoppedByUser: index === stoppedAssistantIndex,
      approvalDecision: display.approvalDecision,
      questionAnswers: display.questionAnswers,
      exitPlanDecision: display.exitPlanDecision,
      processSummary: itemSummary,
      processEvents: [],
      changedFiles: [],
      processExpanded,
      processLockedOpen,
      processCollapsible: false,
      processKey,
      defaultCollapsed,
    };
  }), [effectiveRunning, forceProcessOpen, nowMs, processCollapsedByKey, resolvedApprovals, resolvedExitPlans, resolvedQuestions, runSummary, stoppedAssistantIndex, timelineRecords]);
  const timelineGroups = useMemo(
    () => buildTimelineViewGroups(timelineRecords, timelineItems, {
      effectiveRunning,
      forceProcessOpen,
      runSummary,
      activeModelId,
      processCollapsedByKey,
    }),
    [activeModelId, effectiveRunning, forceProcessOpen, processCollapsedByKey, runSummary, timelineItems, timelineRecords],
  );

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
    timelineGroups,
    runSummary,
    todos,
    contextUsage,
    effectiveRunning,
    effectiveCompacting,
    activeProvider,
    autoCompactThresholdPercent: autoCompactThreshold,
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

export function buildTimelineViewGroups(
  records: AgentTimelineRecord[],
  items: AgentTimelineViewItem[],
  options?: {
    activeModelId?: string;
    effectiveRunning?: boolean;
    forceProcessOpen?: boolean;
    runSummary?: RunSummary | null;
    processCollapsedByKey?: Record<string, boolean>;
  },
): AgentTimelineViewGroup[] {
  const groups = groupIntoTurns(records, options?.activeModelId);
  const viewGroups: AgentTimelineViewGroup[] = [];

  for (const group of groups) {
    if (group.type === "user") {
      const item = items[group.index];
      if (!item) continue;
      viewGroups.push({ type: "user", key: `user-${recordKey(item.record, group.index)}`, item });
      continue;
    }

    if (group.type === "assistant-turn") {
      const turnItems = assistantTurnViewItems(group.turnRecords, items);
      const visibleTurnItems = appendTurnProcessSummaryItem(turnItems, {
        forceProcessOpen: options?.forceProcessOpen,
        runSummary: options?.runSummary,
        processCollapsedByKey: options?.processCollapsedByKey,
      });
      if (visibleTurnItems.length === 0) continue;
      viewGroups.push({
        type: "assistant-turn",
        key: groupKey("assistant", visibleTurnItems),
        items: visibleTurnItems,
      });
      continue;
    }

    const item = items[group.index];
    if (!item) continue;
    const key = `${group.type}-${recordKey(item.record, group.index)}`;
    viewGroups.push({ type: group.type, key, item } as AgentTimelineViewGroup);
  }

  const filtered = viewGroups.filter((group) => {
    if (group.type === "assistant-turn") return group.items.some((item) => item.displayKind !== "hidden");
    return group.item.displayKind !== "hidden";
  });
  return appendRunningProcessViewGroup(filtered, items, records, options);
}

function assistantTurnViewItems(
  turnRecords: Array<{ record: AgentTimelineRecord; index: number }>,
  items: AgentTimelineViewItem[],
): AgentTimelineViewItem[] {
  const result: AgentTimelineViewItem[] = [];
  const toolResults = toolResultsById(turnRecords);
  const approvalByToolUseId = approvalDecisionByToolUseId(turnRecords);
  const hostedLinks = webCitationLinksFromTurn(turnRecords);

  let streamItemIndex: number | undefined;
  let thinkingItemIndex: number | undefined;
  const streamToolItemByBlockIndex = new Map<number, number>();
  const streamToolInputByBlockIndex = new Map<number, string>();

  for (const { record, index } of turnRecords) {
    const item = items[index];
    if (!item) continue;
    if (isStreamEventRecord(record)) {
      const thinkingDelta = streamThinkingDelta(record);
      if (thinkingDelta) {
        if (thinkingItemIndex === undefined) {
          thinkingItemIndex = result.length;
          result.push({
            ...orderedContentItem(item),
            displayKind: "thinking",
            assistantContent: thinkingDelta,
          });
        } else {
          const existing = result[thinkingItemIndex];
          if (existing) result[thinkingItemIndex] = {
            ...existing,
            assistantContent: `${existing.assistantContent || ""}${thinkingDelta}`,
          };
        }
      }
      const textDelta = streamTextDelta(record);
      if (textDelta) {
        if (streamItemIndex === undefined) {
          streamItemIndex = result.length;
          result.push({
            ...orderedContentItem(item),
            displayKind: "stream",
            streamContent: textDelta,
          });
        } else {
          const existing = result[streamItemIndex];
          if (existing) result[streamItemIndex] = {
            ...existing,
            streamContent: `${existing.streamContent || ""}${textDelta}`,
          };
        }
      }
      const toolUse = streamToolUseStart(record);
      if (toolUse && toolUse.tool.name !== "TodoWrite") {
        streamToolItemByBlockIndex.set(toolUse.index, result.length);
        result.push({
          ...orderedContentItem(item),
          displayKind: "tool-use",
          processEvents: [{
            kind: "tool_use",
            id: `tool-use-${toolUse.tool.id}`,
            tool: toolUse.tool,
            result: hostedToolResult(toolUse.tool, hostedLinks),
            approvalDecision: approvalByToolUseId.get(toolUse.tool.id),
            sourceIndex: index,
          }],
        });
      }
      const inputDelta = streamToolInputDelta(record);
      if (inputDelta) {
        const previous = streamToolInputByBlockIndex.get(inputDelta.index) || "";
        const nextInput = `${previous}${inputDelta.partialJson}`;
        streamToolInputByBlockIndex.set(inputDelta.index, nextInput);
        const itemIndex = streamToolItemByBlockIndex.get(inputDelta.index);
        const existing = itemIndex === undefined ? undefined : result[itemIndex];
        if (existing?.displayKind === "tool-use") {
          const event = existing.processEvents.find((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
          if (event) {
            result[itemIndex!] = {
              ...existing,
              processEvents: [{
                ...event,
                tool: {
                  ...event.tool,
                  input: parsePartialToolInput(nextInput) ?? event.tool.input,
                },
              }],
            };
          }
        }
      }
      continue;
    }

    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "assistant") {
      const message = record as SDKMessage;
      const errorItem = promptOrProviderErrorItem(item);
      if (errorItem) {
        result.push(errorItem);
        continue;
      }

      const thinkingText = thinkingTextForMessage(message);
      if (thinkingText) {
        result.push({
          ...orderedContentItem(item),
          displayKind: "thinking",
          assistantContent: thinkingText,
        });
      }

      for (const block of assistantBlocks(message)) {
        if (block.type === "text") {
          if (!block.text.trim()) continue;
          result.push({
            ...orderedContentItem(item),
            displayKind: "assistant-final",
            assistantContent: block.text,
          });
          continue;
        }

        if (block.type === "tool_use") {
          if (block.name === "TodoWrite") continue;
          result.push({
            ...orderedContentItem(item),
            displayKind: "tool-use",
            processEvents: [{
              kind: "tool_use",
              id: `tool-use-${block.id}`,
              tool: block,
              result: toolResults.get(block.id) ?? hostedToolResult(block, hostedLinks),
              approvalDecision: approvalByToolUseId.get(block.id),
              sourceIndex: index,
            }],
          });
        }
      }
      continue;
    }

    if (isRuntimeRecord(record)) result.push(item);
  }

  return dedupeStreamingItems(result);
}

function appendTurnProcessSummaryItem(
  items: AgentTimelineViewItem[],
  options?: {
    forceProcessOpen?: boolean;
    runSummary?: RunSummary | null;
    processCollapsedByKey?: Record<string, boolean>;
  },
): AgentTimelineViewItem[] {
  if (items.length === 0 || items.some((item) => item.processHeader)) return items;
  const summarySource = [...items].reverse().find((item) => item.processSummary);
  const itemSource = summarySource ?? items[items.length - 1];
  const summary = summarySource?.processSummary ?? options?.runSummary ?? null;
  if (!itemSource) return items;
  if (!summary) return items;
  const hasTimelineItems = items.some(isTurnTimelineItem);
  const defaultCollapsed = !summary.running;
  const processLockedOpen = Boolean(options?.forceProcessOpen && summary.running);
  const processExpanded = processLockedOpen || !(options?.processCollapsedByKey?.[itemSource.processKey] ?? defaultCollapsed);
  const processItem: AgentTimelineViewItem = {
    ...itemSource,
    displayKind: "process",
    processHeader: true,
    processSummary: summary,
    processEvents: [],
    changedFiles: [],
    processExpanded,
    processLockedOpen,
    processCollapsible: hasTimelineItems,
    defaultCollapsed,
  };
  return [processItem, ...items];
}

function isTurnTimelineItem(item: AgentTimelineViewItem): boolean {
  return item.displayKind === "thinking"
    || item.displayKind === "tool-use"
    || item.displayKind === "approval-request"
    || item.displayKind === "question-request"
    || item.displayKind === "question-resolved"
    || item.displayKind === "exit-plan-request"
    || item.displayKind === "exit-plan-resolved";
}

function parsePartialToolInput(value: string): unknown | null {
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function orderedContentItem(item: AgentTimelineViewItem): AgentTimelineViewItem {
  return {
    ...item,
    processHeader: false,
    processEvents: [],
    changedFiles: [],
  };
}

function toolResultsById(turnRecords: Array<{ record: AgentTimelineRecord; index: number }>): Map<string, ReturnType<typeof toolResultBlocks>[number]> {
  const results = new Map<string, ReturnType<typeof toolResultBlocks>[number]>();
  for (const { record } of turnRecords) {
    if (!record || isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    for (const result of toolResultBlocks(record as SDKMessage)) {
      results.set(result.toolUseId, result);
    }
  }
  return results;
}

function approvalDecisionByToolUseId(turnRecords: Array<{ record: AgentTimelineRecord; index: number }>): Map<string, "allow" | "deny"> {
  const requestToolUseIds = new Map<string, string>();
  const decisions = new Map<string, "allow" | "deny">();
  for (const { record } of turnRecords) {
    if (!isRuntimeRecord(record)) continue;
    if (record.event.type === "approval_requested") {
      requestToolUseIds.set(record.event.request.requestId, record.event.request.toolUseId);
    } else if (record.event.type === "approval_resolved") {
      decisions.set(record.event.requestId, record.event.decision);
    }
  }

  const approvalByToolUseId = new Map<string, "allow" | "deny">();
  for (const [requestId, decision] of decisions) {
    const toolUseId = requestToolUseIds.get(requestId);
    if (toolUseId) approvalByToolUseId.set(toolUseId, decision);
  }
  return approvalByToolUseId;
}

function hostedToolResult(block: ToolUseBlock, links: WebCitationLink[] = []): ToolResultBlock | undefined {
  const input = recordObject(block.input);
  if (input.hosted !== true) return undefined;
  return {
    type: "tool_result",
    toolUseId: block.id,
    content: {
      status: stringValue(input.status, "completed"),
      providerStatus: stringValue(input.providerStatus, ""),
      query: webSearchQueryFromInput(input),
      hosted: true,
      links,
    },
    isError: false,
  };
}

function webSearchQueryFromInput(input: Record<string, unknown>): string {
  const query = stringValue(input.query, "");
  if (query) return query;
  const rawInput = recordObject(input.input);
  return stringValue(rawInput.query, "");
}

function webCitationLinksFromTurn(turnRecords: Array<{ record: AgentTimelineRecord; index: number }>): WebCitationLink[] {
  const byUrl = new Map<string, WebCitationLink>();
  for (const { record } of turnRecords) {
    if (!record || isRuntimeRecord(record) || isStreamEventRecord(record)) continue;
    if ((record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type !== "text" || !Array.isArray(block.citations)) continue;
      for (const citation of block.citations) {
        const link = webCitationLinkFromCitation(citation);
        if (!link || byUrl.has(link.url)) continue;
        byUrl.set(link.url, link);
      }
    }
  }
  return [...byUrl.values()];
}

function webCitationLinkFromCitation(citation: unknown): WebCitationLink | undefined {
  const object = recordObject(citation);
  const citationType = stringValue(object.type, "");
  if (citationType && citationType !== "web_search_result_location" && citationType !== "url_citation") return undefined;
  const url = stringValue(object.url, "");
  if (!url) return undefined;
  return {
    title: stringValue(object.title, url),
    url,
  };
}

function promptOrProviderErrorItem(item: AgentTimelineViewItem): AgentTimelineViewItem | undefined {
  if (item.displayKind === "prompt-too-long" || item.displayKind === "provider-error") return item;
  return undefined;
}

function dedupeStreamingItems(items: AgentTimelineViewItem[]): AgentTimelineViewItem[] {
  const completeToolIds = new Set(
    items
      .filter((item) => item.displayKind === "tool-use" && !isStreamEventRecord(item.record))
      .flatMap((item) => item.processEvents.flatMap((event) => event.kind === "tool_use" ? [event.tool.id] : [])),
  );
  return items.filter((item, index, allItems) => {
    if (item.displayKind === "hidden") return false;
    if (item.displayKind === "tool-use" && isStreamEventRecord(item.record)) {
      const event = item.processEvents.find((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
      return !event || !completeToolIds.has(event.tool.id);
    }
    if (item.displayKind === "stream" && item.streamContent?.trim()) {
      return !textAlreadyRendered(allItems, item.streamContent, index, "assistant-final", "assistantContent");
    }
    if (item.displayKind === "thinking" && item.assistantContent?.trim() && isStreamEventRecord(item.record)) {
      return !textAlreadyRendered(allItems, item.assistantContent, index, "thinking", "assistantContent");
    }
    return true;
  });
}

function textAlreadyRendered(
  items: AgentTimelineViewItem[],
  content: string,
  ignoreIndex: number,
  displayKind: AgentTimelineDisplayKind,
  contentKey: "assistantContent" | "streamContent",
): boolean {
  const normalizedStream = normalizeRenderableText(content);
  return items.some((item, index) => {
    if (index === ignoreIndex) return false;
    if (item.displayKind !== displayKind) return false;
    const text = normalizeRenderableText(item[contentKey] || "");
    if (!text || !normalizedStream) return false;
    return text === normalizedStream || text.startsWith(normalizedStream) || normalizedStream.startsWith(text);
  });
}

function normalizeRenderableText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function appendRunningProcessViewGroup(
  groups: AgentTimelineViewGroup[],
  items: AgentTimelineViewItem[],
  records: AgentTimelineRecord[],
  options?: {
    effectiveRunning?: boolean;
    forceProcessOpen?: boolean;
    runSummary?: RunSummary | null;
    processCollapsedByKey?: Record<string, boolean>;
  },
): AgentTimelineViewGroup[] {
  const summary = options?.runSummary;
  if (!options?.effectiveRunning || !summary?.running) return groups;
  const lastGroup = groups.at(-1);
  if (lastGroup?.type !== "user") return groups;
  const userIndex = records.findIndex((record) => record === lastGroup.item.record);
  const processKey = processStateKey(summary, userIndex >= 0 ? userIndex : undefined, records, userIndex);
  const defaultCollapsed = false;
  const processLockedOpen = Boolean(options.forceProcessOpen);
  const processExpanded = processLockedOpen || !(options.processCollapsedByKey?.[processKey] ?? defaultCollapsed);
  const processItem: AgentTimelineViewItem = {
    ...lastGroup.item,
    displayKind: "process",
    processHeader: true,
    processSummary: summary,
    processEvents: [],
    changedFiles: [],
    processExpanded,
    processLockedOpen,
    processCollapsible: false,
    processKey,
    defaultCollapsed,
  };
  return [
    ...groups,
    {
      type: "assistant-turn",
      key: `assistant-running-${processKey}`,
      items: [processItem],
    },
  ];
}

function groupKey(prefix: string, items: AgentTimelineViewItem[]): string {
  const first = items[0];
  if (!first) return prefix;
  return `${prefix}-${timelineRecordIdentity(first.record) || first.processKey}`;
}

function timelineItemDisplay(
  record: AgentTimelineRecord,
  state: {
    processSummary: RunSummary | null;
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
  if (isStreamEventRecord(record)) return { kind: "hidden" };

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
    if (!content.trim()) return { kind: "hidden" };
    return { kind: "assistant-final", assistantContent: content };
  }

  if (message.type === "result") return { kind: "hidden" };

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
    if (!record || isRuntimeRecord(record) || isStreamEventRecord(record)) continue;
    if ((record as SDKMessage).type === "result") return { record: record as SDKMessage, index };
  }
  return {};
}

function nextUserInputIndex(records: AgentTimelineRecord[], afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamEventRecord(record)) continue;
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

function latestAssistantTextIndex(records: AgentTimelineRecord[]): number | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || isRuntimeRecord(record) || isStreamEventRecord(record)) continue;
    if ((record as SDKMessage).type === "assistant" && assistantText(record as SDKMessage).trim()) return index;
  }
  return undefined;
}

function hasRenderableAssistantContent(records: AgentTimelineRecord[]): boolean {
  return records.some((record) => {
    if (!record || isRuntimeRecord(record)) return false;
    if (isStreamEventRecord(record)) return Boolean(streamTextDelta(record).trim() || streamThinkingDelta(record).trim());
    if ((record as SDKMessage).type !== "assistant") return false;
    const message = record as SDKMessage;
    if (thinkingTextForMessage(message)) return true;
    return assistantBlocks(message).some((block) => {
      if (block.type === "text") return block.text.trim().length > 0;
      return block.name !== "TodoWrite";
    });
  });
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
