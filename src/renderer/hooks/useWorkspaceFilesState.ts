import { useEffect, useLayoutEffect, useRef } from "react";
import type { FileImportInput, FileImportResult } from "@/types/domain";
import { findFileNode } from "@/lib/workspace-files";
import { useFilePreviewState } from "@/hooks/useFilePreviewState";
import { useFileTreeState } from "@/hooks/useFileTreeState";
import { errorMessage } from "@/hooks/workspaceFileUtils";

interface UseWorkspaceFilesStateArgs {
  semesterId: string;
  activeCourseId: string;
  activeThreadId: string;
  onError: (message: string) => void;
}

export function useWorkspaceFilesState({ semesterId, activeCourseId, activeThreadId, onError }: UseWorkspaceFilesStateArgs) {
  const mountedRef = useRef(true);
  const activeCourseIdRef = useRef(activeCourseId);
  const activeCourseScopeKeyRef = useRef(courseScopeKey(semesterId, activeCourseId));
  const activeThreadIdRef = useRef(activeThreadId);

  activeCourseIdRef.current = activeCourseId;
  activeCourseScopeKeyRef.current = courseScopeKey(semesterId, activeCourseId);
  activeThreadIdRef.current = activeThreadId;

  const treeState = useFileTreeState({
    mountedRef,
    activeCourseIdRef,
    activeCourseScopeKeyRef,
    activeThreadIdRef,
    onError,
  });
  const previewState = useFilePreviewState({
    mountedRef,
    activeCourseIdRef,
    activeCourseScopeKeyRef,
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

  useLayoutEffect(() => {
    treeState.clearTreeState();
    previewState.clearPreviewState();
    if (!activeCourseId) {
      return;
    }
    void loadCourseFiles(activeCourseId, courseScopeKey(semesterId, activeCourseId));
  }, [semesterId, activeCourseId]);

  useEffect(() => {
    const unsubscribe = window.brevyn.files.onChanged(() => {
      const courseId = activeCourseIdRef.current;
      if (courseId) void loadCourseFiles(courseId);
      const threadId = activeThreadIdRef.current;
      if (threadId) void treeState.loadSessionFiles(threadId);
    });
    return unsubscribe;
  }, []);

  useLayoutEffect(() => {
    treeState.clearSessionFiles();
    previewState.clearPreviewState();
    if (!activeThreadId) {
      return;
    }
    void treeState.loadSessionFiles(activeThreadId);
  }, [activeThreadId]);

  function clearFileState() {
    treeState.clearTreeState();
    previewState.clearPreviewState();
  }

  async function loadCourseFiles(courseId: string, scopeKey = activeCourseScopeKeyRef.current): Promise<boolean> {
    const requestId = treeState.fileLoadRequestRef.current + 1;
    treeState.fileLoadRequestRef.current = requestId;
    treeState.setFilesLoading(true);
    try {
      const [tree, stats] = await Promise.all([window.brevyn.files.tree(courseId), window.brevyn.files.stats(courseId)]);
      if (!treeState.isLatestFileLoad(requestId, courseId, scopeKey)) return false;

      treeState.fileTreeRef.current = tree;
      treeState.setFileTree(tree);
      treeState.setFileStats(stats);
      if (previewState.selectedFileIdRef.current && !findFileNode(tree, previewState.selectedFileIdRef.current)) {
        previewState.clearPreviewState();
      }
      return true;
    } catch (error) {
      if (treeState.isLatestFileLoad(requestId, courseId, scopeKey)) {
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
    const targetScopeKey = activeCourseScopeKeyRef.current;
    onError("");
    try {
      const result = await window.brevyn.files.import(input);
      if (!mountedRef.current || activeCourseIdRef.current !== targetCourseId || activeCourseScopeKeyRef.current !== targetScopeKey) return result;

      const requestId = treeState.fileLoadRequestRef.current + 1;
      treeState.fileLoadRequestRef.current = requestId;
      const stats = await window.brevyn.files.stats(targetCourseId);
      if (!treeState.isLatestFileLoad(requestId, targetCourseId, targetScopeKey)) return result;
      treeState.fileTreeRef.current = result.tree;
      treeState.setFileTree(result.tree);
      treeState.setFileStats(stats);
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

function courseScopeKey(semesterId: string, courseId: string) {
  return `${semesterId}:${courseId}`;
}
