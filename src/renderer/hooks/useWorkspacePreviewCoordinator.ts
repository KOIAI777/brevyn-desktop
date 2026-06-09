import { useCallback } from "react";

interface UseWorkspacePreviewCoordinatorArgs {
  setFileRailCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  setPreviewRailCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
}

export function useWorkspacePreviewCoordinator({
  setFileRailCollapsed,
  setPreviewRailCollapsed,
}: UseWorkspacePreviewCoordinatorArgs) {
  const revealSelectedFile = useCallback((kind: "folder" | "file") => {
    if (kind === "folder") setFileRailCollapsed(false);
    else setPreviewRailCollapsed(false);
  }, [setFileRailCollapsed, setPreviewRailCollapsed]);

  return {
    revealSelectedFile,
  };
}
