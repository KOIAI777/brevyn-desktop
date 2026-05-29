import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FilePreview, WorkspaceFileNode } from "@/types/domain";
import { findFileNodeByPath } from "@/lib/workspace-files";
import { errorMessage } from "@/hooks/workspaceFileUtils";

export function useFilePreviewState({
  mountedRef,
  activeCourseIdRef,
  activeCourseScopeKeyRef,
  activeThreadIdRef,
  fileTreeRef,
  refreshCourseTree,
  onError,
}: {
  mountedRef: MutableRefObject<boolean>;
  activeCourseIdRef: MutableRefObject<string>;
  activeCourseScopeKeyRef: MutableRefObject<string>;
  activeThreadIdRef: MutableRefObject<string>;
  fileTreeRef: MutableRefObject<WorkspaceFileNode[]>;
  refreshCourseTree: (courseId: string) => Promise<WorkspaceFileNode[] | null>;
  onError: (message: string) => void;
}) {
  const selectedFileIdRef = useRef("");
  const filePreviewRequestRef = useRef(0);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [filePreviewLoading, setFilePreviewLoading] = useState(false);

  selectedFileIdRef.current = selectedFileId;

  function commitSelectedFileId(fileId: string) {
    selectedFileIdRef.current = fileId;
    setSelectedFileId(fileId);
  }

  function clearPreviewState() {
    filePreviewRequestRef.current += 1;
    commitSelectedFileId("");
    setFilePreview(null);
    setFilePreviewLoading(false);
  }

  async function loadPreviewForFile(file: WorkspaceFileNode, options: { sourcePath?: string; errorFallback?: string } = {}): Promise<boolean> {
    const requestId = filePreviewRequestRef.current + 1;
    const courseScopeAtRequest = activeCourseScopeKeyRef.current;
    const threadIdAtRequest = options.sourcePath ? activeThreadIdRef.current : "";
    filePreviewRequestRef.current = requestId;
    commitSelectedFileId(file.id);
    onError("");
    if (file.kind === "folder") {
      setFilePreview(null);
      setFilePreviewLoading(false);
      return false;
    }
    setFilePreviewLoading(true);
    try {
      const preview = options.sourcePath && threadIdAtRequest
        ? await window.brevyn.app.previewWorkspacePath({ threadId: threadIdAtRequest, path: options.sourcePath })
        : await window.brevyn.files.preview(file.id);
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId || selectedFileIdRef.current !== file.id) return false;
      if (options.sourcePath ? activeThreadIdRef.current !== threadIdAtRequest : activeCourseScopeKeyRef.current !== courseScopeAtRequest) return false;
      onError("");
      setFilePreview(preview);
      setFilePreviewLoading(false);
      return Boolean(preview);
    } catch (error) {
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId) return false;
      setFilePreviewLoading(false);
      setFilePreview(null);
      onError(errorMessage(error, options.errorFallback || "Failed to preview file."));
      return false;
    }
  }

  async function selectFile(file: WorkspaceFileNode): Promise<boolean> {
    return loadPreviewForFile(file);
  }

  async function selectSessionFile(file: WorkspaceFileNode): Promise<boolean> {
    const sourcePath = file.sourcePath || file.path;
    return loadPreviewForFile(file, { sourcePath, errorFallback: "Failed to preview session file." });
  }

  async function previewWorkspacePath(filePath: string, options: { silent?: boolean } = {}): Promise<boolean> {
    const courseId = activeCourseIdRef.current;
    const courseScopeAtRequest = activeCourseScopeKeyRef.current;
    let nextFile = findFileNodeByPath(fileTreeRef.current, filePath);
    if (!nextFile && courseId) {
      const latestTree = await refreshCourseTree(courseId);
      if (!latestTree) return false;
      nextFile = findFileNodeByPath(latestTree, filePath);
    }
    if (activeCourseScopeKeyRef.current !== courseScopeAtRequest) return false;
    if (!nextFile) {
      const threadIdAtRequest = activeThreadIdRef.current;
      if (!threadIdAtRequest) {
        if (!options.silent) onError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
        return false;
      }
      const requestId = filePreviewRequestRef.current + 1;
      filePreviewRequestRef.current = requestId;
      try {
        setFilePreviewLoading(true);
        const preview = await window.brevyn.app.previewWorkspacePath({ threadId: threadIdAtRequest, path: filePath });
        if (!mountedRef.current || filePreviewRequestRef.current !== requestId || activeThreadIdRef.current !== threadIdAtRequest) return false;
        if (!preview) {
          setFilePreviewLoading(false);
          setFilePreview(null);
          if (!options.silent) onError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
          return false;
        }
        commitSelectedFileId(preview.id);
        onError("");
        setFilePreview(preview);
        setFilePreviewLoading(false);
        return true;
      } catch (error) {
        if (!mountedRef.current || filePreviewRequestRef.current !== requestId || activeThreadIdRef.current !== threadIdAtRequest) return false;
        setFilePreviewLoading(false);
        setFilePreview(null);
        if (!options.silent) onError(errorMessage(error, "Failed to preview workspace file."));
        return false;
      }
    }
    return selectFile(nextFile);
  }

  return {
    selectedFileId,
    selectedFileIdRef,
    filePreview,
    filePreviewLoading,
    filePreviewRequestRef,
    commitSelectedFileId,
    clearPreviewState,
    setFilePreview,
    setFilePreviewLoading,
    selectFile,
    selectSessionFile,
    previewWorkspacePath,
  };
}
