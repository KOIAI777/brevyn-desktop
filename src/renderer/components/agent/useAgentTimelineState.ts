import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread } from "@/types/domain";
import { useAgentTimelineRecords } from "@/components/agent/useAgentTimelineRecords";
import {
  approvalResolutionMap,
  exitPlanResolutionMap,
  isCompactCommandMessage,
  latestTurnBounds,
  questionResolutionMap,
  type AgentTimelineRecord,
  type AgentTodoItem,
  type ContextUsage,
  type RunSummary,
} from "@/components/agent/agentTimelineModel";
import {
  autoCompactThresholdPercent,
  defaultContextUsage,
  isCompactingContext,
  latestContextUsage,
} from "@/components/agent/agentTimelineContextUsage";
import { latestTodoList } from "@/components/agent/agentTimelineTodoModel";
import {
  hasRenderableAssistantContent,
  latestAssistantTextIndex,
  latestRunSummary,
  ownerUserInputIndexes,
  runSummaryForUserIndex,
} from "@/components/agent/agentTimelineRunState";
import {
  buildTimelineViewGroups,
  buildTimelineViewItems,
} from "@/components/agent/agentTimelineViewModel";
import type { AgentTimelineViewGroup } from "@/components/agent/agentTimelineViewTypes";

export {
  type AgentTimelineDisplayKind,
  type AgentTimelineToolGroupSummary,
  type AgentTimelineTurnEntry,
  type AgentTimelineViewGroup,
  type AgentTimelineViewItem,
} from "@/components/agent/agentTimelineViewTypes";
export { buildTimelineViewGroups, buildTimelineViewItems } from "@/components/agent/agentTimelineViewModel";
export { autoCompactThresholdPercent, shouldAutoCompactContext } from "@/components/agent/agentTimelineContextUsage";

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

export interface UseAgentTimelinePanelStateArgs {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  running: boolean;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onRun: (prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]) => Promise<void>;
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
  const contextUsage = useMemo(
    () => latestContextUsage(timelineRecords, { activeProvider, providers: agentProviders, activeModelId }) ?? defaultContextUsage(activeModelId, activeProvider),
    [activeModelId, activeProvider, agentProviders, timelineRecords],
  );
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
  const timelineItems = useMemo(
    () => buildTimelineViewItems(timelineRecords, {
      forceProcessOpen,
      ownerUserIndexByRecordIndex,
      processCollapsedByKey,
      resolvedApprovals,
      resolvedExitPlans,
      resolvedQuestions,
      runSummary,
      runSummaryByUserIndex,
      stoppedAssistantIndex,
    }),
    [forceProcessOpen, ownerUserIndexByRecordIndex, processCollapsedByKey, resolvedApprovals, resolvedExitPlans, resolvedQuestions, runSummary, runSummaryByUserIndex, stoppedAssistantIndex, timelineRecords],
  );
  const timelineGroups = useMemo(
    () => buildTimelineViewGroups(timelineRecords, timelineItems, {
      effectiveRunning,
      forceProcessOpen,
      runSummary,
      processCollapsedByKey,
    }),
    [effectiveRunning, forceProcessOpen, processCollapsedByKey, runSummary, timelineItems, timelineRecords],
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

function parseProviderModelSelection(value: string): { providerId?: string; modelId?: string } {
  const [providerId, modelId] = value.split("::");
  if (!providerId || !modelId) return {};
  return {
    providerId: decodeURIComponent(providerId),
    modelId: decodeURIComponent(modelId),
  };
}
