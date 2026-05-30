import type { FormEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Send, Square } from "lucide-react";
import type { AgentAttachment, AgentPermissionMode, ModelProviderConfig, SkillItem, WorkspaceFileNode } from "@/types/domain";
import type { AgentTodoItem, ContextUsage } from "@/components/agent/agentTimelineModel";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";
import { AttachmentChip } from "@/components/agent/AgentAttachmentChips";
import { ContextUsageButton } from "@/components/agent/AgentContextUsageButton";
import {
  buildPromptWithMentions,
  flattenMentionableFiles,
  flattenMentionableSkills,
  MentionedFileChips,
  skillSlugsForPrompt,
  type MentionedSkill,
} from "@/components/agent/AgentMentionPicker";
import { AgentRichPromptInput } from "@/components/agent/AgentRichPromptInput";
import { AgentProviderPicker, parseProviderModelValue } from "@/components/agent/AgentProviderPicker";
import { QueuedMessageDock } from "@/components/agent/AgentQueuedMessageDock";
import { TodoDock } from "@/components/agent/AgentTodoDock";
import { useAgentAttachmentsState } from "@/components/agent/useAgentAttachmentsState";
import { CHAT_BODY_WIDTH_CLASS } from "@/components/agent/agentLayout";

interface AgentComposerProps {
  todos: AgentTodoItem[];
  queuedMessages: QueuedAgentMessage[];
  sendingQueuedMessageIds: string[];
  running: boolean;
  permissionMode: AgentPermissionMode;
  contextUsage: ContextUsage | null;
  autoCompactThresholdPercent: number;
  compacting: boolean;
  threadId: string;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  files: WorkspaceFileNode[];
  skills: SkillItem[];
  onHeightChange?: (height: number) => void;
  onSetPermissionMode: (mode: AgentPermissionMode) => void;
  onRun: (prompt: string, permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }, mentionedSkills?: string[]) => Promise<void>;
  onQueueMessage: (message: QueuedAgentMessage) => void;
  onSendQueuedMessage: (messageId: string) => void;
  onDeleteQueuedMessage: (messageId: string) => void;
  onStop: () => Promise<void>;
  onCompact: () => void;
  onSelectProvider: (providerId: string) => Promise<void>;
}

export const AgentComposer = memo(function AgentComposer({
  todos,
  queuedMessages,
  sendingQueuedMessageIds,
  running,
  permissionMode,
  contextUsage,
  autoCompactThresholdPercent,
  compacting,
  threadId,
  agentProviders,
  activeProviderId,
  files,
  skills,
  onHeightChange,
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
  const [mentionedSkills, setMentionedSkills] = useState<MentionedSkill[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
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
  const mentionableSkills = useMemo(() => flattenMentionableSkills(skills), [skills]);
  const promptText = promptValue.trim();
  const hasMentionedSkills = mentionedSkills.length > 0;
  const canSubmit = Boolean(promptText || pendingAttachments.length > 0 || hasMentionedSkills);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !onHeightChange) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      onHeightChange(Math.ceil(form.getBoundingClientRect().height));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(form);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [onHeightChange]);

  useEffect(() => {
    setPromptValue("");
    setMentionedFiles([]);
    setMentionedSkills([]);
  }, [threadId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const effectiveMentionedSkills = skillMentionsFromPrompt(promptText, mentionableSkills);
    const mentionedSkillSlugs = skillSlugsForPrompt(effectiveMentionedSkills);
    const prompt = buildPromptWithMentions(promptText, mentionedFiles, effectiveMentionedSkills);
    if (!prompt && pendingAttachments.length === 0 && mentionedSkillSlugs.length === 0) return;

    if (running) {
      if ((!prompt && mentionedSkillSlugs.length === 0) || pendingAttachments.length > 0) return;
      onQueueMessage({
        id: `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt: prompt || "请使用已选择的 Skill。",
        mentionedSkills: mentionedSkillSlugs,
        createdAt: Date.now(),
      });
      setPromptValue("");
      setMentionedFiles([]);
      setMentionedSkills([]);
      return;
    }

    setPromptValue("");
    setMentionedFiles([]);
    setMentionedSkills([]);
    const attachments = clearAttachments();
    try {
      await onRun(prompt || (mentionedSkillSlugs.length > 0 ? "请使用已选择的 Skill。" : "请查看附件。"), permissionMode, attachments, parseProviderModelValue(activeProviderId), mentionedSkillSlugs);
    } catch (error) {
      restoreAttachments(attachments);
      console.error("[AgentComposer] Failed to start agent run:", error);
    }
  }

  function handlePromptChange(value: string) {
    setPromptValue(value);
    setMentionedSkills(skillMentionsFromPrompt(value, mentionableSkills));
  }

  return (
    <form
      ref={formRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 min-w-0 overflow-x-hidden px-5 pb-6 pt-3"
      style={{ paddingRight: "calc(1.25rem + 10px)" }}
      onSubmit={handleSubmit}
    >
      <div className={`${CHAT_BODY_WIDTH_CLASS} flex min-w-0 flex-col gap-2`}>
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
              setPromptValue(promptWithSkillTokens(message.prompt, message.mentionedSkills));
              setMentionedSkills(skillMentionsFromSlugs(message.mentionedSkills, mentionableSkills));
            }}
          />
        )}
        <div
          className={`pointer-events-auto relative w-full min-w-0 rounded-[1.6rem] border p-2.5 shadow-[0_8px_22px_rgba(64,55,38,0.12)] [backface-visibility:hidden] [transform:translateZ(0)] ${
            draggingFiles
              ? "border-sky-200 bg-sky-50"
              : "border-white/70 bg-[#f5f0e6]"
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
          <AgentRichPromptInput
            value={promptValue}
            skills={mentionableSkills}
            files={mentionableFiles}
            placeholder={running ? "输入补充消息，先加入待确认..." : "Ask Brevyn about this thread..."}
            onChange={handlePromptChange}
            onSubmit={() => formRef.current?.requestSubmit()}
            onPaste={handlePaste}
            onMentionFile={(file) => setMentionedFiles((current) => current.some((item) => item.id === file.id) ? current : [...current, file])}
          />
          <MentionedFileChips
            files={mentionedFiles}
            onRemove={(fileId) => setMentionedFiles((current) => current.filter((item) => item.id !== fileId))}
          />
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
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
                    title={pendingAttachments.length > 0 ? "运行中暂不支持待确认附件" : "加入待确认"}
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
}, areAgentComposerPropsEqual);

function areAgentComposerPropsEqual(previous: AgentComposerProps, next: AgentComposerProps): boolean {
  return previous.todos === next.todos
    && previous.queuedMessages === next.queuedMessages
    && previous.sendingQueuedMessageIds === next.sendingQueuedMessageIds
    && previous.running === next.running
    && previous.permissionMode === next.permissionMode
    && previous.contextUsage === next.contextUsage
    && previous.autoCompactThresholdPercent === next.autoCompactThresholdPercent
    && previous.compacting === next.compacting
    && previous.threadId === next.threadId
    && previous.agentProviders === next.agentProviders
    && previous.activeProviderId === next.activeProviderId
    && previous.files === next.files
    && previous.skills === next.skills
    && previous.onHeightChange === next.onHeightChange
    && previous.onSetPermissionMode === next.onSetPermissionMode
    && previous.onRun === next.onRun
    && previous.onQueueMessage === next.onQueueMessage
    && previous.onSendQueuedMessage === next.onSendQueuedMessage
    && previous.onDeleteQueuedMessage === next.onDeleteQueuedMessage
    && previous.onStop === next.onStop
    && previous.onCompact === next.onCompact
    && previous.onSelectProvider === next.onSelectProvider;
}

function skillMentionsFromSlugs(slugs: string[] | undefined, skills: MentionedSkill[]): MentionedSkill[] {
  if (!slugs?.length) return [];
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  return slugs.flatMap((slug) => {
    const skill = bySlug.get(slug);
    return skill ? [skill] : [];
  });
}

function skillMentionsFromPrompt(prompt: string, skills: MentionedSkill[]): MentionedSkill[] {
  const slugs = [
    ...prompt.matchAll(/(?:^|\s)\/skill:([^\s/]+)(?=\s|$)/g),
    ...prompt.matchAll(/(?:^|\s)\/([^:\s/]+)(?=\s|$)/g),
  ].map((match) => match[1]).filter(Boolean);
  return skillMentionsFromSlugs(slugs, skills);
}

function promptWithSkillTokens(prompt: string, slugs: string[] | undefined): string {
  if (!slugs?.length) return prompt;
  const prefix = slugs.map((slug) => `/${slug}`).join(" ");
  return [prefix, prompt].filter(Boolean).join(" ");
}
