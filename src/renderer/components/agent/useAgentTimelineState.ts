import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread } from "@/types/domain";
import { DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT, MAX_AUTO_COMPACT_THRESHOLD_PERCENT, MIN_AUTO_COMPACT_THRESHOLD_PERCENT } from "../../../types/domain";
import { recordCreatedAtMs } from "@/lib/agent-timeline-identity";
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
  messageContent,
  recordKey,
  recordObject,
  streamThinkingDelta,
  streamThinkingDeltaBlock,
  streamToolInputDelta,
  streamTextDeltaBlock,
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
  assistantContent?: string;
  assistantStreaming?: boolean;
  contentBlockIndex?: number;
  contentBlockKey?: string;
  stoppedByUser: boolean;
  approvalDecision?: "allow" | "deny";
  questionAnswers?: Record<string, string>;
  exitPlanDecision?: "approve" | "deny";
  processSummary: RunSummary | null;
  processEvents: ProcessEvent[];
  processExpanded: boolean;
  processLockedOpen: boolean;
  processCollapsible: boolean;
  processKey: string;
  defaultCollapsed: boolean;
}

export type AgentTimelineViewGroup =
  | { type: "user"; key: string; item: AgentTimelineViewItem }
  | { type: "assistant-turn"; key: string; items: AgentTimelineViewItem[]; entries: AgentTimelineTurnEntry[]; collapsedVisibleEntryKeys: string[]; processItem?: AgentTimelineViewItem }
  | { type: "system"; key: string; item: AgentTimelineViewItem }
  | { type: "runtime"; key: string; item: AgentTimelineViewItem };

export type AgentTimelineTurnEntry =
  | { type: "item"; key: string; item: AgentTimelineViewItem }
  | { type: "tool-group"; key: string; items: AgentTimelineViewItem[]; toolEvents: Extract<ProcessEvent, { kind: "tool_use" }>[]; summary: AgentTimelineToolGroupSummary };

export interface AgentTimelineToolGroupSummary {
  iconToolName: string;
  parts: string[];
  running: boolean;
}

export type AgentTimelineDisplayKind =
  | "hidden"
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
  | "permission-denied"
  | "run-retrying"
  | "assistant-final";

export interface UseAgentTimelinePanelStateArgs {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  running: boolean;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onRun: (prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
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
  const wasRunningRef = useRef(false);

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
  const todos = useMemo(() => latestTodoList(timelineRecords), [timelineRecords]);
  const contextUsage = useMemo(() => latestContextUsage(records) ?? defaultContextUsage(activeModelId), [activeModelId, records]);
  const compacting = useMemo(() => isCompactingContext(records), [records]);
  const effectiveCompacting = compacting || compactInFlight;
  const autoCompactThreshold = autoCompactThresholdPercent(activeProvider);
  const resolvedApprovals = useMemo(() => approvalResolutionMap(records), [records]);
  const resolvedQuestions = useMemo(() => questionResolutionMap(records), [records]);
  const resolvedExitPlans = useMemo(() => exitPlanResolutionMap(records), [records]);
  const ownerUserIndexByRecordIndex = useMemo(() => ownerUserInputIndexes(timelineRecords), [timelineRecords]);
  const runSummaryByUserIndex = useMemo(() => {
    const summaries = new Map<number, RunSummary | null>();
    for (const ownerUserIndex of ownerUserIndexByRecordIndex) {
      if (ownerUserIndex < 0 || summaries.has(ownerUserIndex)) continue;
      summaries.set(ownerUserIndex, runSummaryForUserIndex(timelineRecords, ownerUserIndex, nowMs, effectiveRunning));
    }
    return summaries;
  }, [effectiveRunning, nowMs, ownerUserIndexByRecordIndex, timelineRecords]);
  const timelineItems = useMemo(() => timelineRecords.map((record, index) => {
    const ownerUserIndex = ownerUserIndexByRecordIndex[index] ?? -1;
    const itemSummary = ownerUserIndex >= 0
      ? runSummaryByUserIndex.get(ownerUserIndex) ?? null
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
      stoppedByUser: index === stoppedAssistantIndex,
      approvalDecision: display.approvalDecision,
      questionAnswers: display.questionAnswers,
      exitPlanDecision: display.exitPlanDecision,
      processSummary: itemSummary,
      processEvents: [],
      processExpanded,
      processLockedOpen,
      processCollapsible: false,
      processKey,
      defaultCollapsed,
    };
  }), [forceProcessOpen, ownerUserIndexByRecordIndex, processCollapsedByKey, resolvedApprovals, resolvedExitPlans, resolvedQuestions, runSummary, runSummaryByUserIndex, stoppedAssistantIndex, timelineRecords]);
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
    if (wasRunningRef.current && !effectiveRunning) setProcessCollapsedByKey({});
    wasRunningRef.current = effectiveRunning;
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
      await onRun("/compact", "auto", undefined, activeProviderSelection);
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

function processStateKey(summary: RunSummary | null, userIndex: number | undefined, records: AgentTimelineRecord[], recordIndex: number): string {
  if (summary?.runId) return `run-${summary.runId}`;
  if (userIndex !== undefined && records[userIndex]) return `turn-${recordKey(records[userIndex])}`;
  const record = records[recordIndex];
  if (record) return `record-${recordKey(record)}`;
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
      const entries = assistantTurnRenderEntries(turnItems);
      const processItem = turnProcessSummaryItem(turnItems, {
        forceProcessOpen: options?.forceProcessOpen,
        runSummary: options?.runSummary,
        processCollapsedByKey: options?.processCollapsedByKey,
      });
      if (turnItems.length === 0 && !processItem) continue;
      viewGroups.push({
        type: "assistant-turn",
        key: groupKey("assistant", turnItems, processItem),
        items: turnItems,
        entries,
        collapsedVisibleEntryKeys: collapsedAssistantTextKeys(entries),
        processItem,
      });
      continue;
    }

    const item = items[group.index];
    if (!item) continue;
    const key = `${group.type}-${recordKey(item.record, group.index)}`;
    viewGroups.push({ type: group.type, key, item } as AgentTimelineViewGroup);
  }

  const filtered = viewGroups.filter((group) => {
    if (group.type === "assistant-turn") return Boolean(group.processItem) || group.items.some((item) => item.displayKind !== "hidden");
    return group.item.displayKind !== "hidden";
  });
  return appendRunningProcessViewGroup(filtered, items, records, options);
}

function assistantTurnViewItems(
  turnRecords: Array<{ record: AgentTimelineRecord; index: number }>,
  items: AgentTimelineViewItem[],
): AgentTimelineViewItem[] {
  const slots = new Map<string, AgentTimelineViewItem>();
  const slotOrder = new Map<string, number>();
  const toolResults = toolResultsById(turnRecords);
  const approvalByToolUseId = approvalDecisionByToolUseId(turnRecords);
  const hostedLinks = webCitationLinksFromTurn(turnRecords);

  let streamSegment = 0;
  let assistantSegment = 0;
  const streamContentBySlotKey = new Map<string, string>();
  const streamToolInputBySlotKey = new Map<string, string>();

  function setSlot(slotKey: string, order: number, item: AgentTimelineViewItem): void {
    if (!slotOrder.has(slotKey)) {
      slotOrder.set(slotKey, order);
    }
    slots.set(slotKey, item);
  }

  function toolSlotKeyById(toolUseId: string): string | undefined {
    if (!toolUseId) return undefined;
    for (const [key, slot] of slots) {
      if (slot.displayKind !== "tool-use") continue;
      const event = slot.processEvents.find((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
      if (event?.tool.id === toolUseId) return key;
    }
    return undefined;
  }

  function slotKey(segment: number, blockIndex: number, kind: "thinking" | "text" | "tool"): string {
    return `${segment}:${blockIndex}:${kind}`;
  }

  function slotOrderValue(segment: number, blockIndex: number, kind: "thinking" | "text" | "tool"): number {
    const kindOrder = kind === "thinking" ? 0 : kind === "tool" ? 1 : 2;
    return (segment * 10000) + (blockIndex * 10) + kindOrder;
  }

  function streamTargetSegment(blockIndex: number, kind: "thinking" | "text" | "tool"): number {
    const finalizedSegment = assistantSegment - 1;
    return finalizedSegment >= 0 && slots.has(slotKey(finalizedSegment, blockIndex, kind))
      ? finalizedSegment
      : streamSegment;
  }

  function matchingFinalizedContent(displayKind: "assistant-final" | "thinking", text: string): AgentTimelineViewItem | undefined {
    const signature = contentSignature(text);
    if (!signature) return undefined;
    return [...slots.values()].find((slot) => (
      slot.displayKind === displayKind
        && slot.assistantStreaming === false
        && contentSignature(slot.assistantContent || "") === signature
    ));
  }

  function finalizedContentStartsWith(displayKind: "assistant-final" | "thinking", text: string): boolean {
    const signature = contentSignature(text);
    if (!signature) return false;
    return [...slots.values()].some((slot) => {
      if (slot.displayKind !== displayKind || slot.assistantStreaming !== false) return false;
      const slotSignature = contentSignature(slot.assistantContent || "");
      return Boolean(slotSignature && slotSignature.startsWith(signature));
    });
  }

  function removeMatchingStreamingContent(displayKind: "assistant-final" | "thinking", text: string): void {
    const signature = contentSignature(text);
    if (!signature) return;
    for (const [key, slot] of slots) {
      if (
        slot.displayKind === displayKind
        && slot.assistantStreaming === true
        && contentSignature(slot.assistantContent || "") === signature
      ) {
        slots.delete(key);
        slotOrder.delete(key);
      }
    }
  }

  for (const { record, index } of turnRecords) {
    const item = items[index];
    if (!item) continue;
    if (isStreamEventRecord(record)) {
      const thinkingDelta = streamThinkingDeltaBlock(record);
      if (thinkingDelta?.text) {
        const segment = streamTargetSegment(thinkingDelta.index, "thinking");
        const key = slotKey(segment, thinkingDelta.index, "thinking");
        const previous = streamContentBySlotKey.get(key) || slots.get(key)?.assistantContent || "";
        const nextContent = `${previous}${thinkingDelta.text}`;
        streamContentBySlotKey.set(key, nextContent);
        if (finalizedContentStartsWith("thinking", nextContent)) continue;
        const existing = slots.get(key);
        if (existing?.assistantStreaming === false) continue;
        setSlot(key, slotOrderValue(segment, thinkingDelta.index, "thinking"), {
          ...(existing ?? orderedContentItem(item)),
          record: existing?.record ?? item.record,
          displayKind: "thinking",
          assistantContent: nextContent,
          assistantStreaming: true,
          contentBlockIndex: thinkingDelta.index,
          contentBlockKey: key,
        });
      }
      const textDelta = streamTextDeltaBlock(record);
      if (textDelta?.text) {
        const segment = streamTargetSegment(textDelta.index, "text");
        const key = slotKey(segment, textDelta.index, "text");
        const previous = streamContentBySlotKey.get(key) || slots.get(key)?.assistantContent || "";
        const nextContent = `${previous}${textDelta.text}`;
        streamContentBySlotKey.set(key, nextContent);
        if (finalizedContentStartsWith("assistant-final", nextContent)) continue;
        const existing = slots.get(key);
        if (existing?.assistantStreaming === false) continue;
        setSlot(key, slotOrderValue(segment, textDelta.index, "text"), {
          ...(existing ?? orderedContentItem(item)),
          record: existing?.record ?? item.record,
          displayKind: "assistant-final",
          assistantContent: nextContent,
          assistantStreaming: true,
          contentBlockIndex: textDelta.index,
          contentBlockKey: key,
        });
      }
      const toolUse = streamToolUseStart(record);
      if (toolUse && toolUse.tool.name !== "TodoWrite") {
        const segment = streamTargetSegment(toolUse.index, "tool");
        const key = toolSlotKeyById(toolUse.tool.id) ?? slotKey(segment, toolUse.index, "tool");
        const existing = slots.get(key);
        if (existing?.assistantStreaming === false) continue;
        setSlot(key, slotOrderValue(segment, toolUse.index, "tool"), {
          ...(existing ?? orderedContentItem(item)),
          record: existing?.record ?? item.record,
          displayKind: "tool-use",
          assistantStreaming: true,
          contentBlockIndex: existing?.contentBlockIndex ?? toolUse.index,
          contentBlockKey: existing?.contentBlockKey ?? key,
          processEvents: [{
            kind: "tool_use",
            id: `tool-use-${toolUse.tool.id}`,
            tool: {
              ...toolUse.tool,
              input: existing?.processEvents[0]?.kind === "tool_use"
                ? existing.processEvents[0].tool.input
                : toolUse.tool.input,
            },
            result: existing?.processEvents[0]?.kind === "tool_use"
              ? existing.processEvents[0].result ?? hostedToolResult(toolUse.tool, hostedLinks)
              : hostedToolResult(toolUse.tool, hostedLinks),
            approvalDecision: approvalByToolUseId.get(toolUse.tool.id),
            sourceIndex: index,
          }],
        });
      }
      const inputDelta = streamToolInputDelta(record);
      if (inputDelta) {
        const segment = streamTargetSegment(inputDelta.index, "tool");
        const key = slotKey(segment, inputDelta.index, "tool");
        const previous = streamToolInputBySlotKey.get(key) || "";
        const nextInput = `${previous}${inputDelta.partialJson}`;
        streamToolInputBySlotKey.set(key, nextInput);
        const existing = slots.get(key);
        if (existing?.displayKind === "tool-use") {
          const event = existing.processEvents.find((candidate): candidate is Extract<ProcessEvent, { kind: "tool_use" }> => candidate.kind === "tool_use");
          if (event) {
            setSlot(key, slotOrderValue(segment, inputDelta.index, "tool"), {
              ...existing,
              processEvents: [{
                ...event,
                tool: {
                  ...event.tool,
                  input: parsePartialToolInput(nextInput) ?? event.tool.input,
                },
              }],
            });
          }
        }
      }
      continue;
    }

    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "user") {
      if (toolResultBlocks(record as SDKMessage).length > 0) streamSegment = Math.max(streamSegment, assistantSegment);
      continue;
    }

    if (!isRuntimeRecord(record) && (record as SDKMessage).type === "assistant") {
      const message = record as SDKMessage;
      const errorItem = promptOrProviderErrorItem(item);
      if (errorItem) {
        setSlot(`error:${index}`, slotOrderValue(assistantSegment, 0, "text"), errorItem);
        assistantSegment += 1;
        streamSegment = assistantSegment;
        continue;
      }

      for (const [blockIndex, block] of orderedAssistantContentBlocks(message).entries()) {
        if (block.type === "thinking") {
          if (!block.thinking.trim()) continue;
          const duplicate = matchingFinalizedContent("thinking", block.thinking);
          if (duplicate) continue;
          removeMatchingStreamingContent("thinking", block.thinking);
          const key = slotKey(assistantSegment, blockIndex, "thinking");
          setSlot(key, slotOrderValue(assistantSegment, blockIndex, "thinking"), {
            ...orderedContentItem(item),
            displayKind: "thinking",
            assistantContent: block.thinking,
            assistantStreaming: false,
            contentBlockIndex: blockIndex,
            contentBlockKey: key,
          });
          continue;
        }

        if (block.type === "text") {
          if (!block.text.trim()) continue;
          const duplicate = matchingFinalizedContent("assistant-final", block.text);
          if (duplicate) continue;
          removeMatchingStreamingContent("assistant-final", block.text);
          const key = slotKey(assistantSegment, blockIndex, "text");
          setSlot(key, slotOrderValue(assistantSegment, blockIndex, "text"), {
            ...orderedContentItem(item),
            displayKind: "assistant-final",
            assistantContent: block.text,
            assistantStreaming: false,
            contentBlockIndex: blockIndex,
            contentBlockKey: key,
          });
          continue;
        }

        if (block.type === "tool_use") {
          if (block.tool.name === "TodoWrite") continue;
          const key = toolSlotKeyById(block.tool.id) ?? slotKey(assistantSegment, blockIndex, "tool");
          const existing = slots.get(key);
          setSlot(key, slotOrderValue(assistantSegment, blockIndex, "tool"), {
            ...orderedContentItem(item),
            displayKind: "tool-use",
            assistantStreaming: false,
            contentBlockIndex: existing?.contentBlockIndex ?? blockIndex,
            contentBlockKey: existing?.contentBlockKey ?? key,
            processEvents: [{
              kind: "tool_use",
              id: `tool-use-${block.tool.id}`,
              tool: block.tool,
              result: toolResults.get(block.tool.id)
                ?? (existing?.processEvents[0]?.kind === "tool_use" ? existing.processEvents[0].result : undefined)
                ?? hostedToolResult(block.tool, hostedLinks),
              approvalDecision: approvalByToolUseId.get(block.tool.id),
              sourceIndex: index,
            }],
          });
        }
      }
      assistantSegment += 1;
      streamSegment = assistantSegment;
      continue;
    }

    if (isRuntimeRecord(record)) setSlot(`runtime:${index}`, slotOrderValue(assistantSegment, 900 + index, "tool"), item);
  }

  for (const [key, slot] of slots) {
    if (slot.displayKind !== "tool-use") continue;
    let changed = false;
    const nextEvents = slot.processEvents.map((event) => {
      if (event.kind !== "tool_use" || event.result) return event;
      const result = toolResults.get(event.tool.id) ?? hostedToolResult(event.tool, hostedLinks);
      if (result) changed = true;
      return result ? { ...event, result } : event;
    });
    if (changed) {
      slots.set(key, {
        ...slot,
        assistantStreaming: nextEvents.some((event) => event.kind === "tool_use" && !event.result),
        processEvents: nextEvents,
      });
    }
  }

  return [...slots.entries()]
    .sort((left, right) => (slotOrder.get(left[0]) ?? 0) - (slotOrder.get(right[0]) ?? 0))
    .map(([, item]) => item)
    .filter((item) => item.displayKind !== "hidden");
}

function turnProcessSummaryItem(
  items: AgentTimelineViewItem[],
  options?: {
    forceProcessOpen?: boolean;
    runSummary?: RunSummary | null;
    processCollapsedByKey?: Record<string, boolean>;
  },
): AgentTimelineViewItem | undefined {
  if (items.some((item) => item.displayKind === "process")) return undefined;
  const summarySource = [...items].reverse().find((item) => item.processSummary);
  const itemSource = summarySource ?? items[items.length - 1];
  const summary = summarySource?.processSummary ?? options?.runSummary ?? null;
  if (!itemSource || !summary) return undefined;
  const hasTimelineItems = items.some(isTurnTimelineItem);
  const defaultCollapsed = !summary.running;
  const processLockedOpen = Boolean(options?.forceProcessOpen && summary.running);
  const processExpanded = processLockedOpen || !(options?.processCollapsedByKey?.[itemSource.processKey] ?? defaultCollapsed);
  return {
    ...itemSource,
    displayKind: "process",
    processSummary: summary,
    processEvents: [],
    processExpanded,
    processLockedOpen,
    processCollapsible: hasTimelineItems,
    defaultCollapsed,
  };
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

function assistantTurnRenderEntries(items: AgentTimelineViewItem[]): AgentTimelineTurnEntry[] {
  const entries: AgentTimelineTurnEntry[] = [];
  let pendingTools: AgentTimelineViewItem[] = [];

  function flushTools() {
    if (pendingTools.length === 0) return;
    if (pendingTools.length === 1) {
      const item = pendingTools[0]!;
      entries.push({ type: "item", key: assistantTurnItemKey(item), item });
    } else {
      const toolEvents = toolEventsFromItems(pendingTools);
      entries.push({
        type: "tool-group",
        key: assistantTurnItemKey(pendingTools[0]!),
        items: pendingTools,
        toolEvents,
        summary: summarizeToolGroup(toolEvents),
      });
    }
    pendingTools = [];
  }

  for (const item of items) {
    if (item.displayKind === "tool-use") {
      pendingTools.push(item);
      continue;
    }
    flushTools();
    entries.push({ type: "item", key: assistantTurnItemKey(item), item });
  }

  flushTools();
  return entries;
}

function collapsedAssistantTextKeys(entries: AgentTimelineTurnEntry[]): string[] {
  const keys = new Set<string>();
  let lastTimelineIndex = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const firstItem = entry?.type === "tool-group" ? entry.items[0] : entry?.item;
    if (firstItem && (entry?.type === "tool-group" || isTurnTimelineItem(firstItem))) {
      lastTimelineIndex = index;
      break;
    }
  }
  for (const [index, entry] of entries.entries()) {
    if (entry.type !== "item" || entry.item.displayKind !== "assistant-final") continue;
    if (index > lastTimelineIndex) keys.add(entry.key);
  }
  if (keys.size > 0) return [...keys];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "item" && entry.item.displayKind === "assistant-final") {
      keys.add(entry.key);
      break;
    }
  }
  return [...keys];
}

function assistantTurnItemKey(item: AgentTimelineViewItem): string {
  if (item.displayKind === "process") return `process-${item.processKey}`;
  if (item.contentBlockKey && (item.displayKind === "assistant-final" || item.displayKind === "thinking")) {
    return `${item.displayKind}-block-${item.contentBlockKey}`;
  }
  const tool = item.processEvents.find((event): event is Extract<ProcessEvent, { kind: "tool_use" }> => event.kind === "tool_use");
  if (tool) return `tool-${tool.tool.id || tool.id}`;
  const blockKey = item.contentBlockIndex === undefined ? "" : `-block-${item.contentBlockIndex}`;
  return `${item.displayKind}-${recordKey(item.record)}${blockKey}`;
}

function toolEventsFromItems(items: AgentTimelineViewItem[]): Extract<ProcessEvent, { kind: "tool_use" }>[] {
  return items.flatMap((item) => item.processEvents.filter((event): event is Extract<ProcessEvent, { kind: "tool_use" }> => event.kind === "tool_use"));
}

function summarizeToolGroup(events: Extract<ProcessEvent, { kind: "tool_use" }>[]): AgentTimelineToolGroupSummary {
  const runningEvent = toolGroupRunningDisplayEvent(events);
  if (runningEvent) {
    return {
      iconToolName: runningEvent.tool.name,
      parts: [runningToolLabel(runningEvent)],
      running: true,
    };
  }

  const stats = {
    editedFiles: new Set<string>(),
    exploredFiles: new Set<string>(),
    exploredCount: 0,
    searches: 0,
    commands: 0,
    skills: 0,
    others: 0,
    failed: 0,
  };

  for (const event of events) {
    const toolName = event.tool.name;
    const input = recordObject(event.tool.input);
    if (event.result?.isError) stats.failed += 1;

    if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
      const path = stringValue(input.file_path ?? input.filePath ?? input.path, event.tool.id);
      stats.editedFiles.add(path);
      continue;
    }

    if (toolName === "Read") {
      const path = stringValue(input.file_path ?? input.filePath ?? input.path, event.tool.id);
      stats.exploredFiles.add(path);
      continue;
    }

    if (toolName === "Glob" || toolName === "Grep") {
      stats.exploredCount += countResultLines(event.result?.content) || 1;
      continue;
    }

    if (toolName === "WebSearch" || toolName === "WebFetch" || toolName === "mcp__brevyn__rag_search") {
      stats.searches += 1;
      continue;
    }

    if (toolName === "Bash") {
      stats.commands += 1;
      continue;
    }

    if (toolName === "mcp__brevyn__load_skill" || toolName === "mcp__brevyn__read_skill_resource") {
      stats.skills += 1;
      continue;
    }

    stats.others += 1;
  }

  const exploredTotal = stats.exploredFiles.size + stats.exploredCount;
  const parts: string[] = [];
  if (stats.editedFiles.size > 0) parts.push(`已编辑 ${stats.editedFiles.size} 个文件`);
  if (exploredTotal > 0) parts.push(`已探索 ${exploredTotal} 个文件`);
  if (stats.searches > 0) parts.push(`已搜索 ${stats.searches} 次`);
  if (stats.commands > 0) parts.push(`已运行 ${stats.commands} 条命令`);
  if (stats.skills > 0) parts.push(`已加载 ${stats.skills} 个技能`);
  if (stats.others > 0) parts.push(`已使用 ${stats.others} 个工具`);
  if (stats.failed > 0) parts.push(`${stats.failed} 个失败`);

  return {
    iconToolName: stats.editedFiles.size > 0
      ? "Edit"
      : exploredTotal > 0
        ? "Read"
        : stats.searches > 0
          ? "WebSearch"
          : stats.commands > 0
            ? "Bash"
            : events[0]?.tool.name || "Tool",
    parts: parts.length > 0 ? parts : [`已使用 ${events.length} 个工具`],
    running: false,
  };
}

function toolGroupRunningDisplayEvent(events: Extract<ProcessEvent, { kind: "tool_use" }>[]): Extract<ProcessEvent, { kind: "tool_use" }> | undefined {
  const pendingEvents = events.filter((event) => !event.result);
  if (pendingEvents.length === 0) return undefined;
  const latestPending = pendingEvents.at(-1);
  const targetedPending = [...pendingEvents].reverse().find(toolEventHasTarget);
  const latestEvent = events.at(-1);
  if (latestPending && !toolEventHasTarget(latestPending) && latestEvent && latestEvent !== latestPending && toolEventHasTarget(latestEvent)) {
    return latestEvent;
  }
  return targetedPending ?? latestPending;
}

function toolEventHasTarget(event: Extract<ProcessEvent, { kind: "tool_use" }>): boolean {
  const toolName = event.tool.name;
  const input = recordObject(event.tool.input);
  if (toolName === "Read" || toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    return Boolean(stringValue(input.file_path ?? input.filePath ?? input.path, "").trim());
  }
  if (toolName === "Glob" || toolName === "Grep") return Boolean(stringValue(input.pattern, "").trim());
  if (toolName === "Bash") return Boolean(stringValue(input.command, "").trim());
  if (toolName === "WebSearch") return Boolean(webSearchLabel(input).trim() && webSearchLabel(input) !== "网页");
  if (toolName === "WebFetch") return Boolean(stringValue(input.url, "").trim());
  if (toolName === "mcp__brevyn__rag_search") return Boolean(stringValue(input.query, "").trim());
  if (toolName === "mcp__brevyn__load_skill") return Boolean(stringValue(input.skillId, "").trim());
  return true;
}

function runningToolLabel(event: Extract<ProcessEvent, { kind: "tool_use" }>): string {
  const toolName = event.tool.name;
  const input = recordObject(event.tool.input);
  if (toolName === "Read") {
    const path = shortPathLabel(stringValue(input.file_path ?? input.filePath ?? input.path, "文件"));
    return `正在读取 ${path}`;
  }
  if (toolName === "Glob") return `正在搜索 ${stringValue(input.pattern, "文件")}`;
  if (toolName === "Grep") return `正在搜索 ${stringValue(input.pattern, "内容")}`;
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    const path = shortPathLabel(stringValue(input.file_path ?? input.filePath ?? input.path, "文件"));
    return `正在编辑 ${path}`;
  }
  if (toolName === "Bash") return `正在运行 ${stringValue(input.command, "命令")}`;
  if (toolName === "WebSearch") return `正在搜索 ${webSearchLabel(input)}`;
  if (toolName === "WebFetch") return `正在打开 ${stringValue(input.url, "网页")}`;
  if (toolName === "mcp__brevyn__rag_search") return `正在检索 ${stringValue(input.query, "课程材料")}`;
  if (toolName === "mcp__brevyn__load_skill") return `正在加载技能 ${stringValue(input.skillId, "skill")}`;
  if (toolName === "mcp__brevyn__read_skill_resource") return "正在读取技能资源";
  return `正在调用 ${toolName}`;
}

function shortPathLabel(value: string): string {
  const parts = value.split(/[\\/]/g).filter(Boolean);
  return parts.at(-1) || value;
}

function webSearchLabel(input: Record<string, unknown>): string {
  const query = stringValue(input.query, "");
  if (query) return query;
  const queries = Array.isArray(input.queries) ? input.queries : [];
  const first = queries[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  const object = recordObject(first);
  return stringValue(object.query ?? object.search_query ?? object.text, "网页");
}

function countResultLines(content: unknown): number {
  if (typeof content === "string") return content.split("\n").filter((line) => line.trim()).length;
  const data = recordObject(content);
  const text = stringValue(data.stdout ?? data.text ?? data.content, "");
  return text ? text.split("\n").filter((line) => line.trim()).length : 0;
}

function parsePartialToolInput(value: string): unknown | null {
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return partialToolInputHints(text);
  }
}

function partialToolInputHints(text: string): Record<string, string> | null {
  const hints: Record<string, string> = {};
  for (const key of ["file_path", "filePath", "path", "command", "pattern", "query", "url", "skillId"]) {
    const value = partialJsonStringField(text, key);
    if (value) hints[key] = value;
  }
  return Object.keys(hints).length > 0 ? hints : null;
}

function partialJsonStringField(text: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`).exec(text);
  if (!match?.[1]) return "";
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\").trim();
  }
}

function orderedContentItem(item: AgentTimelineViewItem): AgentTimelineViewItem {
  return {
    ...item,
    processEvents: [],
  };
}

function contentSignature(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function orderedAssistantContentBlocks(record: SDKMessage): Array<
  | { type: "thinking"; thinking: string }
  | { type: "text"; text: string; citations?: unknown[] }
  | { type: "tool_use"; tool: ToolUseBlock }
> {
  const content = messageContent(record);
  if (!Array.isArray(content)) return [];
  const blocks: Array<
    | { type: "thinking"; thinking: string }
    | { type: "text"; text: string; citations?: unknown[] }
    | { type: "tool_use"; tool: ToolUseBlock }
  > = [];
  for (const block of content) {
    const item = recordObject(block);
    if (item.type === "thinking") {
      const thinking = stringValue(item.thinking ?? item.text ?? item.content, "");
      if (thinking) blocks.push({ type: "thinking", thinking });
      continue;
    }
    if (item.type === "text") {
      const text = typeof item.text === "string" ? item.text : "";
      const citations = Array.isArray(item.citations) ? item.citations : Array.isArray(item.annotations) ? item.annotations : undefined;
      if (text) blocks.push(citations ? { type: "text", text, citations } : { type: "text", text });
      continue;
    }
    if (item.type === "tool_use" || item.type === "server_tool_use") {
      const hosted = item.type === "server_tool_use";
      const tool: ToolUseBlock = {
        type: "tool_use",
        id: stringValue(item.id, hosted ? "server-tool" : "tool"),
        name: hosted ? "WebSearch" : stringValue(item.name, "tool"),
        input: hosted ? { ...recordObject(item.input), hosted: true } : item.input,
      };
      blocks.push({ type: "tool_use", tool });
    }
  }
  return blocks;
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
    processSummary: summary,
    processEvents: [],
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
      items: [],
      entries: [],
      collapsedVisibleEntryKeys: [],
      processItem,
    },
  ];
}

function groupKey(prefix: string, items: AgentTimelineViewItem[], processItem?: AgentTimelineViewItem): string {
  const first = items[0] ?? processItem;
  if (!first) return prefix;
  return `${prefix}-${recordKey(first.record) || first.processKey}`;
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
  approvalDecision?: "allow" | "deny";
  questionAnswers?: Record<string, string>;
  exitPlanDecision?: "approve" | "deny";
} {
  if (isStreamEventRecord(record)) return { kind: "hidden" };

  if (isRuntimeRecord(record)) {
    if (record.event.type === "run_retrying") return { kind: "run-retrying" };
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
      return { kind: "prompt-too-long", assistantContent: assistantText(message) || agentErrorMessage(message) };
    }
    const errorMessage = agentErrorMessage(message);
    if (errorMessage) {
      return { kind: "provider-error", assistantContent: assistantText(message) || errorMessage };
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
    if (subtype === "permission_denied") return { kind: "permission-denied" };
  }

  return { kind: "hidden" };
}

function runSummaryForUserIndex(records: AgentTimelineRecord[], userIndex: number, nowMs: number, active: boolean): RunSummary | null {
  const user = records[userIndex];
  if (!user || isRuntimeRecord(user) || (user as SDKMessage).type !== "user") return null;
  const result = resultForUserIndex(records, userIndex);
  const runStart = latestRunStart(records, userIndex);
  const lifecycle = latestRunLifecycle(records, userIndex);
  const retry = latestRunRetry(records, userIndex);
  const latestBounds = latestTurnBounds(records);
  const isLatestTurn = latestBounds?.userIndex === userIndex;
  const startMs = recordCreatedAtMs(user) ?? nowMs;
  const finishMs = lifecycle?.createdAtMs ?? (result.record ? recordCreatedAtMs(result.record) ?? nowMs : nowMs);
  const running = !lifecycle && !result.record && active && isLatestTurn;
  const runId = runStart?.runId || stringValue((user as { uuid?: unknown }).uuid, `turn-${userIndex}`);
  const permissionMode = runStart?.permissionMode;
  const elapsedMs = Math.max(0, finishMs - startMs);
  const duration = formatDuration(elapsedMs);
  const resultSubtype = result.record ? String((result.record as { subtype?: unknown }).subtype || "") : "";
  const status = lifecycle?.status ?? statusFromResultSubtype(resultSubtype, running);
  const detail = normalizedRunDetail(lifecycle?.detail ?? resultDetail(result.record));
  if (status === "running") {
    if (retry) {
      return { runId, label: retryRunLabel(retry, nowMs), running: true, status, permissionMode, detail: retry.reason };
    }
    const showProcessed = elapsedMs >= 1000 && eventsSinceStart(records, userIndex);
    return { runId, label: showProcessed ? `已处理 ${duration}` : "Thinking", running: true, status, permissionMode };
  }
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
  const endIndex = nextUserInputIndex(records, userIndex) ?? records.length;
  for (let index = userIndex; index < endIndex; index += 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_started") continue;
    return { runId: record.event.runId, permissionMode: record.event.permissionMode };
  }
  return null;
}

function latestRunLifecycle(records: AgentTimelineRecord[], userIndex: number): { status: RunSummary["status"]; detail?: string; createdAtMs?: number } | null {
  let runId = "";
  let runStartIndex = -1;
  const endIndex = nextUserInputIndex(records, userIndex) ?? records.length;
  for (let index = userIndex; index < endIndex; index += 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_started") continue;
    runId = record.event.runId;
    runStartIndex = index;
    break;
  }
  if (!runId) return null;

  for (let index = runStartIndex + 1; index < endIndex; index += 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || !("runId" in record.event) || record.event.runId !== runId) continue;
    if (record.event.type === "run_completed") return { status: "completed", createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_stopped") return { status: "stopped", detail: record.event.reason, createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_failed") return { status: "failed", detail: record.event.error, createdAtMs: recordCreatedAtMs(record) };
    if (record.event.type === "run_interrupted") return { status: "interrupted", detail: record.event.reason, createdAtMs: recordCreatedAtMs(record) };
  }
  return null;
}

function latestRunRetry(records: AgentTimelineRecord[], userIndex: number): { retryAttempt: number; maxRetries: number; reason: string; delayMs: number; createdAtMs: number } | null {
  const runStart = latestRunStart(records, userIndex);
  if (!runStart) return null;
  const endIndex = nextUserInputIndex(records, userIndex) ?? records.length;
  let latest: { retryAttempt: number; maxRetries: number; reason: string; delayMs: number; createdAtMs: number } | null = null;
  for (let index = userIndex + 1; index < endIndex; index += 1) {
    const record = records[index];
    if (!record || !isRuntimeRecord(record) || record.event.type !== "run_retrying" || record.event.runId !== runStart.runId) continue;
    latest = {
      retryAttempt: record.event.retryAttempt,
      maxRetries: record.event.maxRetries,
      reason: record.event.reason,
      delayMs: record.event.delayMs,
      createdAtMs: recordCreatedAtMs(record) ?? Date.now(),
    };
  }
  return latest;
}

function retryRunLabel(retry: { retryAttempt: number; maxRetries: number; delayMs: number; createdAtMs: number }, nowMs: number): string {
  const remainingMs = Math.max(0, retry.createdAtMs + retry.delayMs - nowMs);
  const suffix = remainingMs > 0 ? ` · ${Math.ceil(remainingMs / 1000)}s 后` : "";
  return `正在重试 ${retry.retryAttempt}/${retry.maxRetries}${suffix}`;
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
  const endIndex = nextUserInputIndex(records, userIndex) ?? records.length;
  for (let index = userIndex + 1; index < endIndex; index += 1) {
    const record = records[index];
    if (isRuntimeRecord(record)) continue;
    if ((record as SDKMessage).type === "assistant" || (record as SDKMessage).type === "stream_event") return true;
  }
  return false;
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

function latestTodoList(records: AgentTimelineRecord[]): AgentTodoItem[] {
  let latest: AgentTodoItem[] = [];
  let latestTodoUserInputIndex = -1;
  const latestUserInputIndex = lastUserInputIndex(records);
  const streamTodoInputByBlockIndex = new Map<number, string>();
  const streamTodoBlockIndexes = new Set<number>();
  for (const [index, record] of records.entries()) {
    if (isStreamEventRecord(record)) {
      const toolUse = streamToolUseStart(record);
      if (toolUse?.tool.name === "TodoWrite") {
        streamTodoBlockIndexes.add(toolUse.index);
        const todos = todosFromInput(toolUse.tool.input);
        if (todos.length > 0) {
          latest = todos;
          latestTodoUserInputIndex = ownerUserInputIndex(records, index);
        }
      }
      const inputDelta = streamToolInputDelta(record);
      if (inputDelta && streamTodoBlockIndexes.has(inputDelta.index)) {
        const previous = streamTodoInputByBlockIndex.get(inputDelta.index) || "";
        const nextInput = `${previous}${inputDelta.partialJson}`;
        streamTodoInputByBlockIndex.set(inputDelta.index, nextInput);
        const parsed = parsePartialToolInput(nextInput);
        const todos = todosFromInput(parsed);
        if (todos.length > 0) {
          latest = todos;
          latestTodoUserInputIndex = ownerUserInputIndex(records, index);
        }
      }
      continue;
    }
    if (isRuntimeRecord(record) || (record as SDKMessage).type !== "assistant") continue;
    for (const block of assistantBlocks(record as SDKMessage)) {
      if (block.type !== "tool_use" || block.name !== "TodoWrite") continue;
      const todos = todosFromInput(block.input);
      if (todos.length === 0) continue;
      latest = todos;
      latestTodoUserInputIndex = ownerUserInputIndex(records, index);
    }
  }
  if (latest.length === 0) return [];
  const completed = latest.every((todo) => todo.status === "completed");
  if (completed && latestUserInputIndex > latestTodoUserInputIndex) return [];
  return latest;
}

function todosFromInput(input: unknown): AgentTodoItem[] {
  const todos = recordObject(input).todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    const item = recordObject(todo);
    const content = stringValue(item.content, "");
    if (!content) return [];
    const rawStatus = stringValue(item.status, "pending");
    const status = rawStatus === "completed" || rawStatus === "in_progress" ? rawStatus : "pending";
    return [{ content, status }];
  });
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

function ownerUserInputIndexes(records: BrevynAgentTimelineRecord[]): number[] {
  const owners: number[] = [];
  let currentOwner = -1;
  for (let index = 0; index < records.length; index += 1) {
    owners[index] = currentOwner;
    const record = records[index];
    if (!record || isRuntimeRecord(record) || (record as SDKMessage).type !== "user") continue;
    if (toolResultBlocks(record as SDKMessage).length || !userText(record as SDKMessage).trim()) continue;
    currentOwner = index;
  }
  return owners;
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
