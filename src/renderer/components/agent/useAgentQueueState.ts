import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentAttachment, AgentPermissionMode, BrevynAgentEvent } from "@/types/domain";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";
import type { RunSummary } from "@/components/agent/agentTimelineModel";
import { agentRuntimeEventThreadId } from "@/lib/agent-live-store";

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
  onRunForThread,
}: {
  threadId: string;
  effectiveRunning: boolean;
  runSummary: RunSummary | null;
  onRunForThread: (threadId: string, prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]) => Promise<boolean>;
}): AgentQueueState {
  const queuedMessagesRef = useRef<QueuedAgentMessage[]>([]);
  const queuedMessagesByThreadRef = useRef<Record<string, QueuedAgentMessage[]>>({});
  const sendingQueuedMessageIdsByThreadRef = useRef<Record<string, string[]>>({});
  const wasRunningRef = useRef(false);
  const lastAutoSentRunIdRef = useRef("");
  const lastAutoSentRunIdByThreadRef = useRef<Record<string, string>>({});
  const autoSendTimersRef = useRef<number[]>([]);
  const [queuedMessagesByThread, setQueuedMessagesByThread] = useState<Record<string, QueuedAgentMessage[]>>({});
  const [sendingQueuedMessageIdsByThread, setSendingQueuedMessageIdsByThread] = useState<Record<string, string[]>>({});

  const queuedMessages = queuedMessagesByThread[threadId] || [];
  const sendingQueuedMessageIds = sendingQueuedMessageIdsByThread[threadId] || [];

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    queuedMessagesByThreadRef.current = queuedMessagesByThread;
  }, [queuedMessagesByThread]);

  useEffect(() => {
    sendingQueuedMessageIdsByThreadRef.current = sendingQueuedMessageIdsByThread;
  }, [sendingQueuedMessageIdsByThread]);

  useEffect(() => {
    lastAutoSentRunIdRef.current = "";
    wasRunningRef.current = effectiveRunning;
  }, [threadId]);

  useEffect(() => {
    const unsubscribe = window.brevyn.agent.onEvent((event) => {
      const completed = completedRunEvent(event);
      if (!completed) return;
      const timer = window.setTimeout(() => {
        autoSendTimersRef.current = autoSendTimersRef.current.filter((item) => item !== timer);
        const nextMessage = queuedMessagesByThreadRef.current[completed.threadId]?.[0];
        if (!nextMessage) return;
        if (lastAutoSentRunIdByThreadRef.current[completed.threadId] === completed.runId) return;
        void sendQueuedMessageAsNewRun(completed.threadId, nextMessage, "auto").then((started) => {
          if (!started) return;
          lastAutoSentRunIdByThreadRef.current = {
            ...lastAutoSentRunIdByThreadRef.current,
            [completed.threadId]: completed.runId,
          };
        });
      }, 0);
      autoSendTimersRef.current.push(timer);
    });
    return () => {
      unsubscribe();
      for (const timer of autoSendTimersRef.current) window.clearTimeout(timer);
      autoSendTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = effectiveRunning;
    if (!wasRunning || effectiveRunning) return;
    if (runSummary?.status !== "completed" || !runSummary.runId) return;
    if (lastAutoSentRunIdRef.current === runSummary.runId) return;
    if (lastAutoSentRunIdByThreadRef.current[threadId] === runSummary.runId) return;
    const nextMessage = queuedMessagesRef.current[0];
    if (!nextMessage) return;
    void sendQueuedMessageAsNewRun(threadId, nextMessage, "auto").then((started) => {
      if (!started || !runSummary.runId) return;
      lastAutoSentRunIdRef.current = runSummary.runId;
      lastAutoSentRunIdByThreadRef.current = {
        ...lastAutoSentRunIdByThreadRef.current,
        [threadId]: runSummary.runId,
      };
    });
  }, [effectiveRunning, runSummary?.runId, runSummary?.status]);

  const queueMessage = useCallback((message: QueuedAgentMessage) => {
    setQueuedMessagesByThread((current) => ({
      ...current,
      [threadId]: [...(current[threadId] || []), message],
    }));
  }, [threadId]);

  const deleteQueuedMessage = useCallback((messageId: string) => {
    setQueuedMessagesByThread((current) => ({
      ...current,
      [threadId]: (current[threadId] || []).filter((message) => message.id !== messageId),
    }));
  }, [threadId]);

  function setQueuedMessageSending(targetThreadId: string, messageId: string, sending: boolean) {
    setSendingQueuedMessageIdsByThread((current) => {
      const currentIds = current[targetThreadId] || [];
      const nextIds = sending
        ? Array.from(new Set([...currentIds, messageId]))
        : currentIds.filter((id) => id !== messageId);
      return { ...current, [targetThreadId]: nextIds };
    });
  }

  function removeQueuedMessage(targetThreadId: string, messageId: string): QueuedAgentMessage | null {
    const currentQueue = queuedMessagesByThreadRef.current[targetThreadId] || [];
    const message = currentQueue.find((item) => item.id === messageId) || null;
    if (!message) return null;
    setQueuedMessagesByThread((current) => ({
      ...current,
      [targetThreadId]: (current[targetThreadId] || []).filter((item) => item.id !== messageId),
    }));
    return message;
  }

  async function sendQueuedMessageAsNewRun(targetThreadId: string, message: QueuedAgentMessage, source: "manual" | "auto"): Promise<boolean> {
    if (sendingQueuedMessageIdsByThreadRef.current[targetThreadId]?.includes(message.id)) return false;
    setQueuedMessageSending(targetThreadId, message.id, true);
    try {
      const started = await onRunForThread(targetThreadId, message.prompt, message.permissionMode, undefined, message.providerSelection, message.mentionedSkills);
      if (started) removeQueuedMessage(targetThreadId, message.id);
      return started;
    } catch (error) {
      console.error(source === "auto" ? "[AgentThreadPanel] Failed to auto-send queued message:" : "[AgentThreadPanel] Failed to start queued message:", error);
      return false;
    } finally {
      setQueuedMessageSending(targetThreadId, message.id, false);
    }
  }

  const sendQueuedMessage = useCallback(async (messageId: string) => {
    const message = queuedMessagesRef.current.find((item) => item.id === messageId);
    if (!message) return;
    if (sendingQueuedMessageIdsByThread[threadId]?.includes(messageId)) return;
    if (effectiveRunning) {
      setQueuedMessageSending(threadId, messageId, true);
      try {
        await window.brevyn.agent.queueMessage({
          threadId,
          prompt: message.prompt,
          uuid: message.id,
          interrupt: true,
          mentionedSkills: message.mentionedSkills,
        });
        removeQueuedMessage(threadId, messageId);
      } catch (error) {
        console.error("[AgentThreadPanel] Failed to send queued message:", error);
      } finally {
        setQueuedMessageSending(threadId, messageId, false);
      }
      return;
    }
    await sendQueuedMessageAsNewRun(threadId, message, "manual");
  }, [effectiveRunning, sendingQueuedMessageIdsByThread, threadId]);

  return {
    queuedMessages,
    sendingQueuedMessageIds,
    queueMessage,
    deleteQueuedMessage,
    sendQueuedMessage,
  };
}

function completedRunEvent(event: BrevynAgentEvent): { threadId: string; runId: string } | null {
  if (event.kind !== "brevyn_event" || event.event.type !== "run_completed") return null;
  const threadId = agentRuntimeEventThreadId(event.event);
  return threadId ? { threadId, runId: event.event.runId } : null;
}
