import { useEffect, useRef } from "react";
import type { FileImportInput, FileImportResult } from "@/types/domain";
import { findFileNode, firstPreviewableFile } from "@/lib/workspace-files";
import { useFilePreviewState } from "@/hooks/useFilePreviewState";
import { useFileTreeState } from "@/hooks/useFileTreeState";
import { errorMessage } from "@/hooks/workspaceFileUtils";

interface UseWorkspaceFilesStateArgs {
  activeCourseId: string;
  activeThreadId: string;
  onError: (message: string) => void;
}

export function useWorkspaceFilesState({ activeCourseId, activeThreadId, onError }: UseWorkspaceFilesStateArgs) {
  const mountedRef = useRef(true);
  const activeCourseIdRef = useRef(activeCourseId);
  const activeThreadIdRef = useRef(activeThreadId);

  activeCourseIdRef.current = activeCourseId;
  activeThreadIdRef.current = activeThreadId;

  const treeState = useFileTreeState({
    mountedRef,
    activeCourseIdRef,
    activeThreadIdRef,
    onError,
  });
  const previewState = useFilePreviewState({
    mountedRef,
    activeCourseIdRef,
    activeThreadIdRef,
    fileTreeRef: treeState.fileTreeRef,
    refreshCourseTree: treeState.refreshCourseTree,
    onError,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activeCourseId) {
      clearFileState();
      return;
    }
    void loadCourseFiles(activeCourseId);
  }, [activeCourseId]);

  useEffect(() => {
    const unsubscribe = window.brevyn.files.onChanged(() => {
      const courseId = activeCourseIdRef.current;
      if (courseId) void loadCourseFiles(courseId);
      const threadId = activeThreadIdRef.current;
      if (threadId) void treeState.loadSessionFiles(threadId);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      treeState.setSessionFiles([]);
      return;
    }
    void treeState.loadSessionFiles(activeThreadId);
  }, [activeThreadId]);

  function clearFileState() {
    treeState.clearTreeState();
    previewState.clearPreviewState();
  }

  async function loadCourseFiles(courseId: string): Promise<boolean> {
    const requestId = treeState.fileLoadRequestRef.current + 1;
    treeState.fileLoadRequestRef.current = requestId;
    treeState.setFilesLoading(true);
    try {
      const [tree, stats] = await Promise.all([window.brevyn.files.tree(courseId), window.brevyn.files.stats(courseId)]);
      if (!treeState.isLatestFileLoad(requestId, courseId)) return false;

      const current = previewState.selectedFileIdRef.current ? findFileNode(tree, previewState.selectedFileIdRef.current) : null;
      const next = current?.kind !== "folder" ? current : firstPreviewableFile(tree);
      treeState.fileTreeRef.current = tree;
      treeState.setFileTree(tree);
      treeState.setFileStats(stats);
      await previewState.previewImportedFile(next || undefined, () => treeState.isLatestFileLoad(requestId, courseId), "Failed to preview file.");
      return true;
    } catch (error) {
      if (treeState.isLatestFileLoad(requestId, courseId)) {
        onError(errorMessage(error, "Failed to load course files."));
        treeState.clearTreeState();
        previewState.clearPreviewState();
      }
      return false;
    } finally {
      if (treeState.fileLoadRequestRef.current === requestId) treeState.setFilesLoading(false);
    }
  }

  async function importCourseFiles(input: FileImportInput): Promise<FileImportResult | null> {
    const targetCourseId = input.courseId;
    onError("");
    try {
      const result = await window.brevyn.files.import(input);
      if (!mountedRef.current || activeCourseIdRef.current !== targetCourseId) return result;

      const requestId = treeState.fileLoadRequestRef.current + 1;
      treeState.fileLoadRequestRef.current = requestId;
      const stats = await window.brevyn.files.stats(targetCourseId);
      const next = result.files.find((file) => file.kind !== "folder") || firstPreviewableFile(result.tree);
      treeState.fileTreeRef.current = result.tree;
      treeState.setFileTree(result.tree);
      treeState.setFileStats(stats);
      await previewState.previewImportedFile(next || undefined, () => treeState.isLatestFileLoad(requestId, targetCourseId), "Imported files, but preview failed.");
      return result;
    } catch (error) {
      const message = errorMessage(error, "Failed to import files.");
      if (mountedRef.current) onError(message);
      throw new Error(message);
    }
  }

  return {
    fileTree: treeState.fileTree,
    sessionFiles: treeState.sessionFiles,
    fileStats: treeState.fileStats,
    filesLoading: treeState.filesLoading,
    selectedFileId: previewState.selectedFileId,
    filePreview: previewState.filePreview,
    filePreviewLoading: previewState.filePreviewLoading,
    clearFileState,
    loadCourseFiles,
    loadSessionFiles: treeState.loadSessionFiles,
    selectFile: previewState.selectFile,
    selectSessionFile: previewState.selectSessionFile,
    previewWorkspacePath: previewState.previewWorkspacePath,
    importCourseFiles,
  };
}
