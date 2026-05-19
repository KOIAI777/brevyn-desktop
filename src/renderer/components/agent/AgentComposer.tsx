import type { ChangeEvent, FormEvent, KeyboardEvent, Ref } from "react";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Send, Square } from "lucide-react";
import type { AgentAttachment, AgentPermissionMode, ModelProviderConfig, WorkspaceFileNode } from "@/types/domain";
import type { AgentTodoItem, ContextUsage } from "@/components/agent/agentTimelineModel";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";
import { AttachmentChip } from "@/components/agent/AgentAttachmentChips";
import { ContextUsageButton } from "@/components/agent/AgentContextUsageButton";
import {
  buildPromptWithMentions,
  currentMentionQuery,
  filterMentionSuggestions,
  flattenMentionableFiles,
  MentionedFileChips,
  MentionSuggestions,
  replaceCurrentMention,
} from "@/components/agent/AgentMentionPicker";
import { AgentProviderPicker, parseProviderModelValue } from "@/components/agent/AgentProviderPicker";
import { QueuedMessageDock } from "@/components/agent/AgentQueuedMessageDock";
import { TodoDock } from "@/components/agent/AgentTodoDock";
import { useAgentAttachmentsState } from "@/components/agent/useAgentAttachmentsState";

const CHAT_BODY_WIDTH_CLASS = "mx-auto w-full max-w-[58rem]";

interface AgentComposerProps {
  dockRef: Ref<HTMLDivElement>;
  todos: AgentTodoItem[];
  queuedMessages: QueuedAgentMessage[];
  sendingQueuedMessageIds: string[];
  running: boolean;
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  contextUsage: ContextUsage | null;
  autoCompactThresholdPercent: number;
  compacting: boolean;
  threadId: string;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  files: WorkspaceFileNode[];
  onSetPlanMode: (value: boolean | ((current: boolean) => boolean)) => void;
  onSetPermissionMode: (mode: AgentPermissionMode) => void;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
  onQueueMessage: (message: QueuedAgentMessage) => void;
  onSendQueuedMessage: (messageId: string) => void;
  onDeleteQueuedMessage: (messageId: string) => void;
  onStop: () => Promise<void>;
  onCompact: () => void;
  onSelectProvider: (providerId: string) => Promise<void>;
}

export function AgentComposer({
  dockRef,
  todos,
  queuedMessages,
  sendingQueuedMessageIds,
  running,
  planMode,
  permissionMode,
  contextUsage,
  autoCompactThresholdPercent,
  compacting,
  threadId,
  agentProviders,
  activeProviderId,
  files,
  onSetPlanMode,
  onSetPermissionMode,
  onRun,
  onQueueMessage,
  onSendQueuedMessage,
  onDeleteQueuedMessage,
  onStop,
  onCompact,
  onSelectProvider,
}: AgentComposerProps) {
  const [promptValue, setPromptValue] = useState("");
  const [mentionedFiles, setMentionedFiles] = useState<WorkspaceFileNode[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const {
    pendingAttachments,
    draggingFiles,
    setDraggingFiles,
    pickAttachments,
    removeAttachment,
    restoreAttachments,
    clearAttachments,
    handlePaste,
    handleDrop,
  } = useAgentAttachmentsState({ threadId, running });
  const mentionableFiles = useMemo(() => flattenMentionableFiles(files), [files]);
  const mentionSuggestions = useMemo(() => filterMentionSuggestions(mentionableFiles, mentionQuery), [mentionableFiles, mentionQuery]);
  const promptText = promptValue.trim();
  const canSubmit = Boolean(promptText || pendingAttachments.length > 0);

  useEffect(() => {
    setPromptValue("");
    setMentionedFiles([]);
    setMentionQuery(null);
  }, [threadId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = buildPromptWithMentions(promptText, mentionedFiles);
    if (!prompt && pendingAttachments.length === 0) return;

    if (running) {
      if (!prompt || pendingAttachments.length > 0) return;
      onQueueMessage({
        id: `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt,
        mode: planMode ? "plan" : "execute",
        permissionMode: planMode ? "review" : permissionMode,
        providerSelection: parseProviderModelValue(activeProviderId),
        createdAt: Date.now(),
      });
      setPromptValue("");
      setMentionedFiles([]);
      setMentionQuery(null);
      return;
    }

    setPromptValue("");
    setMentionedFiles([]);
    setMentionQuery(null);
    const attachments = clearAttachments();
    try {
      await onRun(prompt || "请查看附件。", planMode ? "plan" : "execute", planMode ? "review" : permissionMode, attachments, parseProviderModelValue(activeProviderId));
    } catch (error) {
      restoreAttachments(attachments);
      console.error("[AgentComposer] Failed to start agent run:", error);
    }
  }

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setPromptValue(value);
    setMentionQuery(currentMentionQuery(value));
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-8 pt-8 [background:linear-gradient(180deg,rgba(247,244,236,0),rgba(247,244,236,0.82))]" onSubmit={handleSubmit}>
      <div ref={dockRef} className={`${CHAT_BODY_WIDTH_CLASS} flex min-w-0 flex-col gap-2`}>
        {todos.length > 0 && <TodoDock todos={todos} running={running} />}
        {queuedMessages.length > 0 && (
          <QueuedMessageDock
            messages={queuedMessages}
            sendingMessageIds={sendingQueuedMessageIds}
            running={running}
            onSend={onSendQueuedMessage}
            onDelete={onDeleteQueuedMessage}
            onEdit={(message) => {
              onDeleteQueuedMessage(message.id);
              setPromptValue(message.prompt);
              setMentionQuery(null);
            }}
          />
        )}
        <div
          className={`pointer-events-auto w-full min-w-0 rounded-2xl border p-3 shadow-[0_18px_52px_rgba(64,55,38,0.18)] ring-1 backdrop-blur-2xl transition ${
            draggingFiles
              ? "border-sky-200 bg-sky-50/72 ring-sky-100"
              : "border-white/55 bg-card/70 ring-border/45"
          }`}
          onDragOver={(event) => {
            if (running) return;
            event.preventDefault();
            setDraggingFiles(true);
          }}
          onDragLeave={() => setDraggingFiles(false)}
          onDrop={handleDrop}
        >
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  removable={!running}
                  onRemove={() => void removeAttachment(attachment)}
                />
              ))}
            </div>
          )}
          <textarea
            name="prompt"
            rows={1}
            value={promptValue}
            onChange={handlePromptChange}
            onKeyDown={handlePromptKeyDown}
            onPaste={handlePaste}
            placeholder={running ? "输入补充消息，会加入排队列表..." : "Ask Brevyn about this thread..."}
            className="max-h-32 min-h-11 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          />
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <MentionSuggestions
              files={mentionSuggestions}
              onSelect={(file) => {
                setMentionedFiles((current) => current.some((item) => item.id === file.id) ? current : [...current, file]);
                setPromptValue((current) => replaceCurrentMention(current, file.name));
                setMentionQuery(null);
              }}
            />
          )}
          <MentionedFileChips
            files={mentionedFiles}
            onRemove={(fileId) => setMentionedFiles((current) => current.filter((item) => item.id !== fileId))}
          />
          <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 shrink items-center gap-1.5">
              <button
                type="button"
                disabled={running}
                onClick={() => void pickAttachments()}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Add context"
                title="Add attachment"
              >
                <Plus className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => onSetPlanMode((current) => !current)}
                className={`inline-flex h-7 min-w-[58px] items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  planMode
                    ? "border-blue-200 bg-blue-50/85 text-blue-800 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
                    : "border-border/70 bg-background/55 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={planMode ? "Exit plan mode" : "Plan mode"}
              >
                <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Plan</span>
              </button>
            </div>

            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
              <ContextUsageButton
                usage={contextUsage}
                autoCompactThresholdPercent={autoCompactThresholdPercent}
                compacting={compacting}
                compactDisabled={running || !contextUsage || contextUsage.inputTokens <= 0}
                onCompact={onCompact}
              />
              <AgentProviderPicker
                running={running}
                planMode={planMode}
                permissionMode={permissionMode}
                agentProviders={agentProviders}
                activeProviderId={activeProviderId}
                onSetPermissionMode={onSetPermissionMode}
                onSelectProvider={onSelectProvider}
              />
              {running ? (
                canSubmit ? (
                  <button
                    type="submit"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Queue message"
                    title={pendingAttachments.length > 0 ? "运行中暂不支持排队附件" : "加入排队"}
                    disabled={pendingAttachments.length > 0}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:scale-[1.03]"
                    onClick={() => void onStop()}
                    aria-label="Stop agent run"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                )
              ) : (
                <button
                  type="submit"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
