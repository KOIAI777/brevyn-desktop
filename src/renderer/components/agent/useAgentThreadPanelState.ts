import type { RefCallback, RefObject } from "react";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord, ModelProviderConfig, Thread } from "@/types/domain";
import { useAgentAutoCompactState } from "@/components/agent/useAgentAutoCompactState";
import { useAgentPanelPreferencesState } from "@/components/agent/useAgentPanelPreferencesState";
import { useAgentQueueState } from "@/components/agent/useAgentQueueState";
import { useAgentScrollState } from "@/components/agent/useAgentScrollState";
import { useAgentTimelineState } from "@/components/agent/useAgentTimelineState";
import type { AgentTimelineRecord, AgentTodoItem, ContextUsage, RunSummary } from "@/components/agent/agentTimelineModel";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";

export interface AgentThreadPanelState {
  scrollRef: RefCallback<HTMLDivElement>;
  contentRef: RefCallback<HTMLDivElement>;
  composerDockRef: RefObject<HTMLDivElement>;
  timelineBottomInset: number;
  isFollowingOutput: boolean;
  nowMs: number;
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  timelineRecords: AgentTimelineRecord[];
  timelineGroups: ReturnType<typeof useAgentTimelineState>["timelineGroups"];
  runSummary: RunSummary | null;
  todos: AgentTodoItem[];
  contextUsage: ContextUsage | null;
  effectiveRunning: boolean;
  effectiveCompacting: boolean;
  queuedMessages: QueuedAgentMessage[];
  sendingQueuedMessageIds: string[];
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
  const scrollState = useAgentScrollState(thread.id);
  const preferencesState = useAgentPanelPreferencesState(thread.id);
  const queueState = useAgentQueueState({
    threadId: thread.id,
    effectiveRunning: timelineState.effectiveRunning,
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
