import { useEffect, useRef, useState } from "react";
import type { AgentAttachment, AgentPermissionMode } from "@/types/domain";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";

export interface AgentQueueState {
  queuedMessages: QueuedAgentMessage[];
  sendingQueuedMessageIds: string[];
  queueMessage: (message: QueuedAgentMessage) => void;
  deleteQueuedMessage: (messageId: string) => void;
  sendQueuedMessage: (messageId: string) => Promise<void>;
}

export function useAgentQueueState({
  threadId,
  effectiveRunning,
  onRun,
}: {
  threadId: string;
  effectiveRunning: boolean;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
}): AgentQueueState {
  const queuedMessagesRef = useRef<QueuedAgentMessage[]>([]);
  const [queuedMessagesByThread, setQueuedMessagesByThread] = useState<Record<string, QueuedAgentMessage[]>>({});
  const [sendingQueuedMessageIdsByThread, setSendingQueuedMessageIdsByThread] = useState<Record<string, string[]>>({});

  const queuedMessages = queuedMessagesByThread[threadId] || [];
  const sendingQueuedMessageIds = sendingQueuedMessageIdsByThread[threadId] || [];

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

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

  function setQueuedMessageSending(messageId: string, sending: boolean) {
    setSendingQueuedMessageIdsByThread((current) => {
      const currentIds = current[threadId] || [];
      const nextIds = sending
        ? Array.from(new Set([...currentIds, messageId]))
        : currentIds.filter((id) => id !== messageId);
      return { ...current, [threadId]: nextIds };
    });
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
    if (sendingQueuedMessageIdsByThread[threadId]?.includes(messageId)) return;
    setQueuedMessageSending(messageId, true);
    if (effectiveRunning) {
      try {
        await window.brevyn.agent.queueMessage({
          threadId,
          prompt: message.prompt,
          uuid: message.id,
          interrupt: true,
        });
        removeQueuedMessage(messageId);
      } catch (error) {
        console.error("[AgentThreadPanel] Failed to send queued message:", error);
      } finally {
        setQueuedMessageSending(messageId, false);
      }
      return;
    }
    try {
      await onRun(message.prompt, message.mode, message.permissionMode, undefined, message.providerSelection);
      removeQueuedMessage(messageId);
    } catch (error) {
      console.error("[AgentThreadPanel] Failed to start queued message:", error);
    } finally {
      setQueuedMessageSending(messageId, false);
    }
  }

  return {
    queuedMessages,
    sendingQueuedMessageIds,
    queueMessage,
    deleteQueuedMessage,
    sendQueuedMessage,
  };
}
