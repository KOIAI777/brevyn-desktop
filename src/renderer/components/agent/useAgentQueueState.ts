import { useEffect, useRef, useState } from "react";
import type { AgentAttachment, AgentPermissionMode } from "@/types/domain";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";
import type { RunSummary } from "@/components/agent/agentTimelineModel";

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
  runSummary,
  onRun,
}: {
  threadId: string;
  effectiveRunning: boolean;
  runSummary: RunSummary | null;
  onRun: (prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]) => Promise<void>;
}): AgentQueueState {
  const queuedMessagesRef = useRef<QueuedAgentMessage[]>([]);
  const wasRunningRef = useRef(false);
  const lastAutoSentRunIdRef = useRef("");
  const [queuedMessagesByThread, setQueuedMessagesByThread] = useState<Record<string, QueuedAgentMessage[]>>({});
  const [sendingQueuedMessageIdsByThread, setSendingQueuedMessageIdsByThread] = useState<Record<string, string[]>>({});

  const queuedMessages = queuedMessagesByThread[threadId] || [];
  const sendingQueuedMessageIds = sendingQueuedMessageIdsByThread[threadId] || [];

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    lastAutoSentRunIdRef.current = "";
    wasRunningRef.current = effectiveRunning;
  }, [threadId]);

  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = effectiveRunning;
    if (!wasRunning || effectiveRunning) return;
    if (runSummary?.status !== "completed" || !runSummary.runId) return;
    if (lastAutoSentRunIdRef.current === runSummary.runId) return;
    const nextMessage = queuedMessagesRef.current[0];
    if (!nextMessage) return;
    lastAutoSentRunIdRef.current = runSummary.runId;
    void sendQueuedMessageAsNewRun(nextMessage, "auto");
  }, [effectiveRunning, runSummary?.runId, runSummary?.status]);

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

  async function sendQueuedMessageAsNewRun(message: QueuedAgentMessage, source: "manual" | "auto") {
    if (sendingQueuedMessageIdsByThread[threadId]?.includes(message.id)) return;
    setQueuedMessageSending(message.id, true);
    try {
      await onRun(message.prompt, message.permissionMode, undefined, message.providerSelection, message.mentionedSkills);
      removeQueuedMessage(message.id);
    } catch (error) {
      console.error(source === "auto" ? "[AgentThreadPanel] Failed to auto-send queued message:" : "[AgentThreadPanel] Failed to start queued message:", error);
    } finally {
      setQueuedMessageSending(message.id, false);
    }
  }

  async function sendQueuedMessage(messageId: string) {
    const message = queuedMessagesRef.current.find((item) => item.id === messageId);
    if (!message) return;
    if (sendingQueuedMessageIdsByThread[threadId]?.includes(messageId)) return;
    if (effectiveRunning) {
      setQueuedMessageSending(messageId, true);
      try {
        await window.brevyn.agent.queueMessage({
          threadId,
          prompt: message.prompt,
          uuid: message.id,
          interrupt: true,
          mentionedSkills: message.mentionedSkills,
        });
        removeQueuedMessage(messageId);
      } catch (error) {
        console.error("[AgentThreadPanel] Failed to send queued message:", error);
      } finally {
        setQueuedMessageSending(messageId, false);
      }
      return;
    }
    await sendQueuedMessageAsNewRun(message, "manual");
  }

  return {
    queuedMessages,
    sendingQueuedMessageIds,
    queueMessage,
    deleteQueuedMessage,
    sendQueuedMessage,
  };
}
