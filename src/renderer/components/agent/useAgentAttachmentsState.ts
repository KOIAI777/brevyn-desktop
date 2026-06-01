import { useEffect, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import type { AgentAttachment, WorkspaceFileKind } from "@/types/domain";

export function useAgentAttachmentsState({ threadId }: { threadId: string; running: boolean }) {
  const [pendingAttachmentsByThread, setPendingAttachmentsByThread] = useState<Record<string, AgentAttachment[]>>({});
  const [draggingFiles, setDraggingFiles] = useState(false);
  const pendingAttachments = pendingAttachmentsByThread[threadId] || [];

  useEffect(() => {
    setDraggingFiles(false);
  }, [threadId]);

  function setPendingAttachmentsForThread(targetThreadId: string, updater: (current: AgentAttachment[]) => AgentAttachment[]) {
    setPendingAttachmentsByThread((currentByThread) => {
      const nextAttachments = updater(currentByThread[targetThreadId] || []);
      const nextByThread = { ...currentByThread };
      if (nextAttachments.length === 0) delete nextByThread[targetThreadId];
      else nextByThread[targetThreadId] = nextAttachments;
      return nextByThread;
    });
  }

  async function pickAttachments() {
    const next = await window.brevyn.attachments.pick(threadId);
    if (next.length) setPendingAttachmentsForThread(threadId, (current) => mergeAttachments(current, next));
  }

  async function addDroppedFiles(files: File[]) {
    if (files.length === 0) return;
    const targetThreadId = threadId;
    const attachments = await Promise.all(files.map((file) => pendingAttachmentForFile(targetThreadId, file)));
    setPendingAttachmentsForThread(targetThreadId, (current) => mergeAttachments(current, attachments));
  }

  async function removeAttachment(attachment: AgentAttachment) {
    setPendingAttachmentsForThread(threadId, (current) => current.filter((item) => item.id !== attachment.id));
    if (attachment.pending) return;
    try {
      await window.brevyn.attachments.delete({ threadId: attachment.threadId || threadId, path: attachment.path });
    } catch (error) {
      console.error("[AgentComposer] Failed to delete pending attachment:", error);
    }
  }

  function restoreAttachments(attachments: AgentAttachment[], targetThreadId = threadId) {
    setPendingAttachmentsForThread(targetThreadId, (current) => mergeAttachments(attachments, current));
  }

  function clearAttachments(): AgentAttachment[] {
    const attachments = pendingAttachments;
    setPendingAttachmentsForThread(threadId, () => []);
    return attachments;
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    void addDroppedFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingFiles(false);
    void addDroppedFiles(Array.from(event.dataTransfer.files || []));
  }

  return {
    pendingAttachments,
    draggingFiles,
    setDraggingFiles,
    pickAttachments,
    removeAttachment,
    restoreAttachments,
    clearAttachments,
    handlePaste,
    handleDrop,
  };
}

function mergeAttachments(current: AgentAttachment[], next: AgentAttachment[]): AgentAttachment[] {
  const seen = new Set(current.map(attachmentIdentity));
  return [...current, ...next.filter((item) => {
    const identity = attachmentIdentity(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  })];
}

async function pendingAttachmentForFile(threadId: string, file: File): Promise<AgentAttachment> {
  const sourcePath = window.brevyn.attachments.pathForFile(file);
  const name = file.name || `pasted-file-${Date.now()}`;
  const data = sourcePath ? undefined : await fileToBase64(file);
  return {
    id: `pending-att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    threadId,
    name,
    kind: kindForAttachmentName(name, file.type),
    mimeType: file.type || undefined,
    size: file.size,
    sizeLabel: formatSize(file.size),
    path: sourcePath || name,
    sourcePath: sourcePath || undefined,
    data,
    pending: true,
    createdAt: new Date().toISOString(),
  };
}

function attachmentIdentity(attachment: AgentAttachment): string {
  return attachment.sourcePath || attachment.path || attachment.id;
}

function kindForAttachmentName(name: string, mimeType?: string): WorkspaceFileKind {
  if (mimeType?.startsWith("image/")) return "image";
  const extension = name.toLowerCase().slice(name.lastIndexOf("."));
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(extension)) return "image";
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx" || extension === ".doc") return "docx";
  if (extension === ".pptx" || extension === ".ppt") return "pptx";
  if ([".xls", ".xlsx", ".csv", ".tsv"].includes(extension)) return "spreadsheet";
  if (extension === ".md") return "markdown";
  if ([".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".c", ".cpp", ".h", ".css", ".html"].includes(extension)) return "code";
  if (extension === ".txt") return "text";
  return "unknown";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read attachment."));
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}
