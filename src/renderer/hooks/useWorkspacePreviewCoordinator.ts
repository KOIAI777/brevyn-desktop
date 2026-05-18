import { useCallback } from "react";
import type { FileImportInput, FileImportResult } from "@/types/domain";

interface UseWorkspacePreviewCoordinatorArgs {
  importCourseFiles: (input: FileImportInput) => Promise<FileImportResult | null>;
  previewWorkspacePath: (filePath: string, options?: { silent?: boolean }) => Promise<void>;
  setFileRailCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  setPreviewRailCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
}

export function useWorkspacePreviewCoordinator({
  importCourseFiles,
  previewWorkspacePath,
  setFileRailCollapsed,
  setPreviewRailCollapsed,
}: UseWorkspacePreviewCoordinatorArgs) {
  const scheduleWorkspacePathPreview = useCallback((filePath: string) => {
    if (!filePath.trim()) return;
    for (const delay of [420, 900]) {
      window.setTimeout(() => {
        setPreviewRailCollapsed(false);
        void previewWorkspacePath(filePath, { silent: true });
      }, delay);
    }
  }, [previewWorkspacePath, setPreviewRailCollapsed]);

  const importCourseFilesAndReveal = useCallback(async (input: FileImportInput): Promise<FileImportResult | null> => {
    const result = await importCourseFiles(input);
    if (result?.files.length) {
      setFileRailCollapsed(false);
      if (result.files.some((file) => file.kind !== "folder")) setPreviewRailCollapsed(false);
    }
    return result;
  }, [importCourseFiles, setFileRailCollapsed, setPreviewRailCollapsed]);

  const revealSelectedFile = useCallback((kind: "folder" | "file") => {
    if (kind === "folder") setFileRailCollapsed(false);
    else setPreviewRailCollapsed(false);
  }, [setFileRailCollapsed, setPreviewRailCollapsed]);

  return {
    scheduleWorkspacePathPreview,
    importCourseFilesAndReveal,
    revealSelectedFile,
  };
}
