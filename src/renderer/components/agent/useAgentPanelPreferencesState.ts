import { useEffect, useState } from "react";
import type { AgentPermissionMode } from "@/types/domain";

const AGENT_PERMISSION_STORAGE_PREFIX = "brevyn.agent.permissionMode.";

export interface AgentPanelPreferencesState {
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  setPlanMode: (value: boolean | ((current: boolean) => boolean)) => void;
  setPermissionMode: (mode: AgentPermissionMode) => void;
}

export function useAgentPanelPreferencesState(threadId: string): AgentPanelPreferencesState {
  const [planMode, setPlanMode] = useState(false);
  const [permissionMode, setPermissionModeState] = useState<AgentPermissionMode>("review");

  useEffect(() => {
    setPermissionModeState(readStoredPermissionMode(threadId));
  }, [threadId]);

  return {
    planMode,
    permissionMode,
    setPlanMode,
    setPermissionMode: (mode: AgentPermissionMode) => {
      setPermissionModeState(mode);
      writeStoredPermissionMode(threadId, mode);
    },
  };
}

function readStoredPermissionMode(threadId: string): AgentPermissionMode {
  try {
    return window.localStorage.getItem(`${AGENT_PERMISSION_STORAGE_PREFIX}${threadId}`) === "full_access" ? "full_access" : "review";
  } catch {
    return "review";
  }
}

function writeStoredPermissionMode(threadId: string, mode: AgentPermissionMode): void {
  try {
    window.localStorage.setItem(`${AGENT_PERMISSION_STORAGE_PREFIX}${threadId}`, mode);
  } catch {
    // Ignore storage failures; Review remains the safe fallback.
  }
}
