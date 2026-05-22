import { useEffect, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import type { AgentAttachment } from "@/types/domain";

export function useAgentAttachmentsState({ threadId, running }: { threadId: string; running: boolean }) {
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);

  useEffect(() => {
    setPendingAttachments([]);
    setDraggingFiles(false);
  }, [threadId]);

  async function pickAttachments() {
    if (running) return;
    const next = await window.brevyn.attachments.pick(threadId);
    if (next.length) setPendingAttachments((current) => mergeAttachments(current, next));
  }

  async function addDroppedFiles(files: File[]) {
    if (running || files.length === 0) return;
    const pathItems: string[] = [];
    const dataItems: Promise<AgentAttachment>[] = [];
    for (const file of files) {
      const path = window.brevyn.attachments.pathForFile(file);
      if (path) {
        pathItems.push(path);
      } else {
        dataItems.push(fileToBase64(file).then((data) => window.brevyn.attachments.saveData({
          threadId,
          name: file.name || `pasted-file-${Date.now()}`,
          mediaType: file.type || undefined,
          data,
        })));
      }
    }
    const [savedPaths, ...savedData] = await Promise.all([
      pathItems.length ? window.brevyn.attachments.savePaths({ threadId, paths: pathItems }) : Promise.resolve([]),
      ...dataItems,
    ]);
    setPendingAttachments((current) => mergeAttachments(current, [...savedPaths, ...savedData]));
  }

  async function removeAttachment(attachment: AgentAttachment) {
    setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id));
    try {
      await window.brevyn.attachments.delete({ threadId, path: attachment.path });
    } catch (error) {
      console.error("[AgentComposer] Failed to delete pending attachment:", error);
    }
  }

  function restoreAttachments(attachments: AgentAttachment[]) {
    setPendingAttachments((current) => mergeAttachments(attachments, current));
  }

  function clearAttachments(): AgentAttachment[] {
    const attachments = pendingAttachments;
    setPendingAttachments([]);
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
  const seen = new Set(current.map((item) => item.path));
  return [...current, ...next.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  })];
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
