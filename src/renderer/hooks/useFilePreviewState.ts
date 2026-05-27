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

  async function loadPreviewForFile(file: WorkspaceFileNode, options: { sourcePath?: string; errorFallback?: string } = {}): Promise<void> {
    const requestId = filePreviewRequestRef.current + 1;
    const courseScopeAtRequest = activeCourseScopeKeyRef.current;
    const threadIdAtRequest = options.sourcePath ? activeThreadIdRef.current : "";
    filePreviewRequestRef.current = requestId;
    commitSelectedFileId(file.id);
    onError("");
    if (file.kind === "folder") {
      setFilePreview(null);
      setFilePreviewLoading(false);
      return;
    }
    setFilePreviewLoading(true);
    try {
      const preview = options.sourcePath && threadIdAtRequest
        ? await window.brevyn.app.previewWorkspacePath({ threadId: threadIdAtRequest, path: options.sourcePath })
        : await window.brevyn.files.preview(file.id);
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId || selectedFileIdRef.current !== file.id) return;
      if (options.sourcePath ? activeThreadIdRef.current !== threadIdAtRequest : activeCourseScopeKeyRef.current !== courseScopeAtRequest) return;
      setFilePreview(preview);
      setFilePreviewLoading(false);
    } catch (error) {
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId) return;
      setFilePreviewLoading(false);
      onError(errorMessage(error, options.errorFallback || "Failed to preview file."));
    }
  }

  async function selectFile(file: WorkspaceFileNode) {
    await loadPreviewForFile(file);
  }

  async function selectSessionFile(file: WorkspaceFileNode): Promise<void> {
    const sourcePath = file.sourcePath || file.path;
    await loadPreviewForFile(file, { sourcePath, errorFallback: "Failed to preview session file." });
  }

  async function previewWorkspacePath(filePath: string, options: { silent?: boolean } = {}) {
    const courseId = activeCourseIdRef.current;
    const courseScopeAtRequest = activeCourseScopeKeyRef.current;
    let nextFile = findFileNodeByPath(fileTreeRef.current, filePath);
    if (!nextFile && courseId) {
      const latestTree = await refreshCourseTree(courseId);
      if (!latestTree) return;
      nextFile = findFileNodeByPath(latestTree, filePath);
    }
    if (activeCourseScopeKeyRef.current !== courseScopeAtRequest) return;
    if (!nextFile) {
      const threadIdAtRequest = activeThreadIdRef.current;
      if (!threadIdAtRequest) {
        if (!options.silent) onError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
        return;
      }
      const requestId = filePreviewRequestRef.current + 1;
      filePreviewRequestRef.current = requestId;
      try {
        setFilePreviewLoading(true);
        const preview = await window.brevyn.app.previewWorkspacePath({ threadId: threadIdAtRequest, path: filePath });
        if (!mountedRef.current || filePreviewRequestRef.current !== requestId || activeThreadIdRef.current !== threadIdAtRequest) return;
        if (!preview) {
          setFilePreviewLoading(false);
          if (!options.silent) onError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
          return;
        }
        commitSelectedFileId(preview.id);
        setFilePreview(preview);
        setFilePreviewLoading(false);
      } catch (error) {
        if (!mountedRef.current || filePreviewRequestRef.current !== requestId || activeThreadIdRef.current !== threadIdAtRequest) return;
        setFilePreviewLoading(false);
        if (!options.silent) onError(errorMessage(error, "Failed to preview workspace file."));
      }
      return;
    }
    await selectFile(nextFile);
  }

  async function previewImportedFile(file: WorkspaceFileNode | undefined, loadStillLatest: () => boolean, errorFallback: string): Promise<void> {
    const previewRequestId = filePreviewRequestRef.current + 1;
    filePreviewRequestRef.current = previewRequestId;
    commitSelectedFileId(file?.id || "");
    if (file) {
      setFilePreviewLoading(true);
    } else {
      setFilePreview(null);
      setFilePreviewLoading(false);
      return;
    }
    let preview: FilePreview | null = null;
    try {
      preview = await window.brevyn.files.preview(file.id);
    } catch (error) {
      if (loadStillLatest() && filePreviewRequestRef.current === previewRequestId) {
        onError(errorMessage(error, errorFallback));
      }
    }
    if (!loadStillLatest() || filePreviewRequestRef.current !== previewRequestId) return;
    setFilePreview(preview);
    setFilePreviewLoading(false);
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
    previewImportedFile,
  };
}
