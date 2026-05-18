import type { RefObject } from "react";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread } from "@/types/domain";
import { useAgentAutoCompactState } from "@/components/agent/useAgentAutoCompactState";
import { useAgentPanelPreferencesState } from "@/components/agent/useAgentPanelPreferencesState";
import { useAgentQueueState } from "@/components/agent/useAgentQueueState";
import { useAgentScrollState } from "@/components/agent/useAgentScrollState";
import { autoCompactThresholdPercent, processStateKey, runSummaryForUserIndex, useAgentTimelineState } from "@/components/agent/useAgentTimelineState";
import type { AgentTimelineRecord, AgentTodoItem, ContextUsage, RunSummary } from "@/components/agent/agentTimelineModel";
import type { QueuedAgentMessage } from "@/components/agent/AgentComposer";

export interface AgentThreadPanelState {
  scrollRef: RefObject<HTMLDivElement>;
  contentRef: (node: HTMLDivElement | null) => void;
  composerDockRef: RefObject<HTMLDivElement>;
  timelineBottomInset: number;
  isFollowingOutput: boolean;
  nowMs: number;
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  timelineRecords: AgentTimelineRecord[];
  timelineItems: ReturnType<typeof useAgentTimelineState>["timelineItems"];
  renderMeta: ReturnType<typeof useAgentTimelineState>["renderMeta"];
  liveAssistantText: boolean;
  forceProcessOpen: boolean;
  runSummary: RunSummary | null;
  stoppedAssistantIndex?: number;
  todos: AgentTodoItem[];
  contextUsage: ContextUsage | null;
  compacting: boolean;
  effectiveRunning: boolean;
  effectiveCompacting: boolean;
  queuedMessages: QueuedAgentMessage[];
  sentQueuedMessages: QueuedAgentMessage[];
  processCollapsedByKey: Record<string, boolean>;
  autoCompactThresholdPercent: number;
  setPlanMode: (value: boolean | ((current: boolean) => boolean)) => void;
  setPermissionMode: (mode: AgentPermissionMode) => void;
  handleCompact: () => Promise<void>;
  queueMessage: (message: QueuedAgentMessage) => void;
  deleteQueuedMessage: (messageId: string) => void;
  sendQueuedMessage: (messageId: string) => Promise<void>;
  toggleProcessCollapsed: (key: string, defaultCollapsed: boolean, lockedOpen: boolean) => void;
  scrollToBottom: (behavior: ScrollBehavior) => void;
}

interface UseAgentThreadPanelStateArgs {
  thread: Thread;
  records: BrevynAgentTimelineRecord[];
  loading: boolean;
  running: boolean;
  error?: string;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
}

export function useAgentThreadPanelState({
  thread,
  records,
  loading,
  running,
  error,
  agentProviders,
  activeProviderId,
  onRun,
}: UseAgentThreadPanelStateArgs): AgentThreadPanelState {
  const timelineState = useAgentTimelineState({
    thread,
    records,
    running,
    agentProviders,
    activeProviderId,
    onRun,
  });
  const scrollState = useAgentScrollState(
    thread.id,
    [
      records.length,
      timelineState.timelineRecords.length,
      timelineState.effectiveRunning ? "running" : "idle",
      loading ? "loading" : "ready",
      timelineState.todos.length,
    ].join(":"),
  );
  const preferencesState = useAgentPanelPreferencesState(thread.id);
  const queueState = useAgentQueueState({
    threadId: thread.id,
    records,
    running: timelineState.effectiveRunning,
    onRun,
  });

  useAgentAutoCompactState({
    threadId: thread.id,
    records,
    queuedMessageCount: queueState.queuedMessages.length,
    loading,
    error,
    activeProvider: timelineState.activeProvider,
    contextUsage: timelineState.contextUsage,
    effectiveRunning: timelineState.effectiveRunning,
    effectiveCompacting: timelineState.effectiveCompacting,
    handleCompact: timelineState.handleCompact,
  });

  return {
    ...scrollState,
    ...preferencesState,
    ...timelineState,
    ...queueState,
  };
}

export { autoCompactThresholdPercent, processStateKey, runSummaryForUserIndex } from "@/components/agent/useAgentTimelineState";
