import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FileStats, WorkspaceFileNode } from "@/types/domain";
import { errorMessage } from "@/hooks/workspaceFileUtils";

export function useFileTreeState({
  mountedRef,
  activeCourseIdRef,
  activeThreadIdRef,
  onError,
}: {
  mountedRef: MutableRefObject<boolean>;
  activeCourseIdRef: MutableRefObject<string>;
  activeThreadIdRef: MutableRefObject<string>;
  onError: (message: string) => void;
}) {
  const fileTreeRef = useRef<WorkspaceFileNode[]>([]);
  const fileLoadRequestRef = useRef(0);
  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [sessionFiles, setSessionFiles] = useState<WorkspaceFileNode[]>([]);
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

  fileTreeRef.current = fileTree;

  function clearTreeState() {
    fileLoadRequestRef.current += 1;
    setFilesLoading(false);
    fileTreeRef.current = [];
    setFileTree([]);
    setFileStats(null);
  }

  function isLatestFileLoad(requestId: number, courseId: string) {
    return mountedRef.current && fileLoadRequestRef.current === requestId && activeCourseIdRef.current === courseId;
  }

  async function refreshCourseTree(courseId: string): Promise<WorkspaceFileNode[] | null> {
    try {
      const latestTree = await window.brevyn.files.tree(courseId);
      if (!mountedRef.current || activeCourseIdRef.current !== courseId) return null;
      setFileTree(latestTree);
      fileTreeRef.current = latestTree;
      return latestTree;
    } catch (error) {
      if (mountedRef.current) onError(errorMessage(error, "Failed to refresh files before preview."));
      return null;
    }
  }

  async function loadSessionFiles(threadId: string): Promise<void> {
    try {
      const files = await window.brevyn.attachments.list(threadId);
      if (!mountedRef.current || activeThreadIdRef.current !== threadId) return;
      setSessionFiles(files);
    } catch (error) {
      if (mountedRef.current && activeThreadIdRef.current === threadId) {
        onError(errorMessage(error, "Failed to load session files."));
      }
    }
  }

  return {
    fileTree,
    fileTreeRef,
    sessionFiles,
    fileStats,
    filesLoading,
    fileLoadRequestRef,
    setFileTree,
    setFileStats,
    setSessionFiles,
    setFilesLoading,
    clearTreeState,
    isLatestFileLoad,
    refreshCourseTree,
    loadSessionFiles,
  };
}
