import { useMemo } from "react";
import { useAgentLiveRecords, useAgentLiveRunning } from "@/lib/agent-live-store";
import type { BrevynAgentTimelineRecord } from "@/types/domain";
import { normalizeTimelineRecords, type AgentTimelineRecord } from "@/components/agent/agentTimelineModel";

export interface AgentTimelineRecordsState {
  liveRecords: BrevynAgentTimelineRecord[];
  liveRunning: boolean;
  effectiveRunning: boolean;
  timelineRecords: AgentTimelineRecord[];
}

export function useAgentTimelineRecords({
  threadId,
  records,
  running,
  compactInFlight,
}: {
  threadId: string;
  records: BrevynAgentTimelineRecord[];
  running: boolean;
  compactInFlight: boolean;
}): AgentTimelineRecordsState {
  const liveRecords = useAgentLiveRecords(threadId);
  const liveRunning = useAgentLiveRunning(threadId);
  const effectiveRunning = running || liveRunning;
  const timelineRecords = useMemo(
    () => normalizeTimelineRecords(records, liveRecords, effectiveRunning, compactInFlight),
    [compactInFlight, effectiveRunning, liveRecords, records],
  );

  return {
    liveRecords,
    liveRunning,
    effectiveRunning,
    timelineRecords,
  };
}
