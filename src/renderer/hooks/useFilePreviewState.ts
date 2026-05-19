import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FilePreview, WorkspaceFileNode } from "@/types/domain";
import { findFileNodeByPath } from "@/lib/workspace-files";
import { errorMessage } from "@/hooks/workspaceFileUtils";

export function useFilePreviewState({
  mountedRef,
  activeCourseIdRef,
  activeThreadIdRef,
  fileTreeRef,
  refreshCourseTree,
  onError,
}: {
  mountedRef: MutableRefObject<boolean>;
  activeCourseIdRef: MutableRefObject<string>;
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
      const preview = options.sourcePath && activeThreadIdRef.current
        ? await window.brevyn.app.previewWorkspacePath({ threadId: activeThreadIdRef.current, path: options.sourcePath })
        : await window.brevyn.files.preview(file.id);
      if (!mountedRef.current || filePreviewRequestRef.current !== requestId || selectedFileIdRef.current !== file.id) return;
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
    let nextFile = findFileNodeByPath(fileTreeRef.current, filePath);
    if (!nextFile && courseId) {
      const latestTree = await refreshCourseTree(courseId);
      if (!latestTree) return;
      nextFile = findFileNodeByPath(latestTree, filePath);
    }
    if (!nextFile) {
      if (!activeThreadIdRef.current) {
        if (!options.silent) onError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
        return;
      }
      try {
        setFilePreviewLoading(true);
        const preview = await window.brevyn.app.previewWorkspacePath({ threadId: activeThreadIdRef.current, path: filePath });
        if (!preview) {
          setFilePreviewLoading(false);
          if (!options.silent) onError(`没有在当前文件浏览器里找到这个文件：${filePath}`);
          return;
        }
        commitSelectedFileId(preview.id);
        setFilePreview(preview);
        setFilePreviewLoading(false);
      } catch (error) {
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
