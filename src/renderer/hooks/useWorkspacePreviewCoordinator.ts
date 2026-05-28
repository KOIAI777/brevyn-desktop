import { useCallback } from "react";
import type { FileImportInput, FileImportResult } from "@/types/domain";

interface UseWorkspacePreviewCoordinatorArgs {
  importCourseFiles: (input: FileImportInput) => Promise<FileImportResult | null>;
  setFileRailCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  setPreviewRailCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
}

export function useWorkspacePreviewCoordinator({
  importCourseFiles,
  setFileRailCollapsed,
  setPreviewRailCollapsed,
}: UseWorkspacePreviewCoordinatorArgs) {
  const importCourseFilesAndReveal = useCallback(async (input: FileImportInput): Promise<FileImportResult | null> => {
    const result = await importCourseFiles(input);
    if (result?.files.length) {
      setFileRailCollapsed(false);
    }
    return result;
  }, [importCourseFiles, setFileRailCollapsed]);

  const revealSelectedFile = useCallback((kind: "folder" | "file") => {
    if (kind === "folder") setFileRailCollapsed(false);
    else setPreviewRailCollapsed(false);
  }, [setFileRailCollapsed, setPreviewRailCollapsed]);

  return {
    importCourseFilesAndReveal,
    revealSelectedFile,
  };
}
