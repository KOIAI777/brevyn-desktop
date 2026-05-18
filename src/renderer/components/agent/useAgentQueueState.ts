import { useEffect, useRef, useState } from "react";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentTimelineRecord } from "@/types/domain";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";
import { isRuntimeRecord } from "@/components/agent/agentTimelineModel";

export interface AgentQueueState {
  queuedMessages: QueuedAgentMessage[];
  sentQueuedMessages: QueuedAgentMessage[];
  queueMessage: (message: QueuedAgentMessage) => void;
  deleteQueuedMessage: (messageId: string) => void;
  sendQueuedMessage: (messageId: string) => Promise<void>;
}

export function useAgentQueueState({
  threadId,
  records,
  effectiveRunning,
  onRun,
}: {
  threadId: string;
  records: BrevynAgentTimelineRecord[];
  effectiveRunning: boolean;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
}): AgentQueueState {
  const queuedMessagesRef = useRef<QueuedAgentMessage[]>([]);
  const [queuedMessagesByThread, setQueuedMessagesByThread] = useState<Record<string, QueuedAgentMessage[]>>({});
  const [sentQueuedMessagesByThread, setSentQueuedMessagesByThread] = useState<Record<string, QueuedAgentMessage[]>>({});

  const queuedMessages = queuedMessagesByThread[threadId] || [];
  const sentQueuedMessages = sentQueuedMessagesByThread[threadId] || [];

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    if (sentQueuedMessages.length === 0) return;
    setSentQueuedMessagesByThread((current) => {
      const pending = (current[threadId] || []).filter((message) => !recordsContainUserUuid(records, message.id));
      if (pending.length === (current[threadId] || []).length) return current;
      return { ...current, [threadId]: pending };
    });
  }, [records, sentQueuedMessages.length, threadId]);

  function queueMessage(message: QueuedAgentMessage) {
    setQueuedMessagesByThread((current) => ({
      ...current,
      [threadId]: [...(current[threadId] || []), message],
    }));
  }

  function deleteQueuedMessage(messageId: string) {
    setQueuedMessagesByThread((current) => ({
      ...current,
      [threadId]: (current[threadId] || []).filter((message) => message.id !== messageId),
    }));
  }

  function removeQueuedMessage(messageId: string): QueuedAgentMessage | null {
    const currentQueue = queuedMessagesRef.current;
    const message = currentQueue.find((item) => item.id === messageId) || null;
    if (!message) return null;
    setQueuedMessagesByThread((current) => ({
      ...current,
      [threadId]: (current[threadId] || []).filter((item) => item.id !== messageId),
    }));
    return message;
  }

  async function sendQueuedMessage(messageId: string) {
    const message = queuedMessagesRef.current.find((item) => item.id === messageId);
    if (!message) return;
    if (effectiveRunning) {
      const removed = removeQueuedMessage(messageId);
      if (!removed) return;
      setSentQueuedMessagesByThread((current) => ({
        ...current,
        [threadId]: [...(current[threadId] || []), removed],
      }));
      try {
        await window.brevyn.agent.queueMessage({
          threadId,
          prompt: removed.prompt,
          uuid: removed.id,
          interrupt: true,
        });
      } catch (error) {
        setSentQueuedMessagesByThread((current) => ({
          ...current,
          [threadId]: (current[threadId] || []).filter((item) => item.id !== removed.id),
        }));
        setQueuedMessagesByThread((current) => ({
          ...current,
          [threadId]: [removed, ...(current[threadId] || [])],
        }));
        console.error("[AgentThreadPanel] Failed to send queued message:", error);
      }
      return;
    }
    const next = removeQueuedMessage(messageId);
    if (!next) return;
    try {
      await onRun(next.prompt, next.mode, next.permissionMode, undefined, next.providerSelection);
    } catch (error) {
      setQueuedMessagesByThread((current) => ({
        ...current,
        [threadId]: [next, ...(current[threadId] || [])],
      }));
      console.error("[AgentThreadPanel] Failed to start queued message:", error);
    }
  }

  return {
    queuedMessages,
    sentQueuedMessages,
    queueMessage,
    deleteQueuedMessage,
    sendQueuedMessage,
  };
}

function recordsContainUserUuid(records: BrevynAgentTimelineRecord[], uuid: string): boolean {
  return records.some((record) => {
    if (isRuntimeRecord(record) || (record as { type?: unknown }).type !== "user") return false;
    return String((record as { uuid?: unknown }).uuid || "") === uuid;
  });
}
