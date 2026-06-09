import { useState } from "react";
import { AlertTriangle, Check, Copy, Minimize2, RotateCw, ShieldCheck, X } from "lucide-react";
import { Markdownish } from "@/components/chat/Markdownish";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { useFilePathPreviewHandler } from "@/components/chat/FilePathChip";
import type { AgentAttachment } from "@/types/domain";

export function CompactContextNote({ state }: { state: "compacting" | "complete" }) {
  const compacting = state === "compacting";
  return (
    <div className="flex w-full items-center gap-3 py-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/70 to-border/25" />
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] ${
        compacting
          ? "brevyn-status-pill-warning"
          : "brevyn-status-pill-success"
      }`}>
        <Minimize2 className="h-3.5 w-3.5 shrink-0" />
        <span className={`font-semibold ${compacting ? "taskagent-sweep-text" : ""}`}>{compacting ? "正在压缩上下文" : "上下文已压缩"}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-border/25 via-border/70 to-transparent" />
    </div>
  );
}

export function RetryRuntimeNote({
  attempt,
  maxRetries,
  reason,
  delayMs,
}: {
  attempt: number;
  maxRetries: number;
  reason: string;
  delayMs: number;
}) {
  const waitSeconds = Math.max(0, Math.ceil(delayMs / 1000));
  return (
    <div className="flex justify-start px-1 py-1">
      <div className="brevyn-status-pill-warning inline-flex max-w-2xl items-center gap-2 rounded-full px-3 py-1.5 text-[11px]">
        <RotateCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="font-semibold">正在重试 {attempt}/{maxRetries}</span>
        {waitSeconds > 0 && <span className="opacity-70">{waitSeconds}s 后重连</span>}
        {reason.trim() && <span className="max-w-md truncate opacity-60">· {reason.trim()}</span>}
      </div>
    </div>
  );
}

export function PromptTooLongCard({ message, onCompact }: { message: string; onCompact: () => void }) {
  return (
    <div className="flex justify-start">
      <div className="brevyn-status-card-warning w-full max-w-xl rounded-2xl p-4 text-sm text-foreground">
        <div className="flex items-start gap-3">
          <div className="brevyn-status-icon-warning mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
            <Minimize2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">上下文太长，需要压缩</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              当前会话已经接近或超过模型上下文限制。先压缩上下文后，Brevyn 会把旧对话折叠成摘要再继续。
            </p>
            {message.trim() && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground/82" title={message}>
                {message}
              </p>
            )}
            <button
              type="button"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-xl bg-[hsl(var(--status-warning))] px-3 text-[11px] font-semibold text-background transition hover:brightness-95"
              onClick={onCompact}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              压缩上下文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProviderErrorCard({ message }: { message: string }) {
  const trimmed = message.trim();
  if (!trimmed) return null;
  return (
    <div className="flex justify-start">
      <div className="brevyn-status-card-danger w-full max-w-2xl rounded-2xl p-4 text-sm text-foreground">
        <div className="flex items-start gap-3">
          <div className="brevyn-status-icon-danger mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Provider 返回错误</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              这是模型服务商返回的原始错误，Brevyn 已停止本轮输出。
            </p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[hsl(var(--status-danger)/0.2)] bg-background/62 p-2.5 text-[11px] leading-5 text-foreground">
              {trimmed}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UserMessageBubble({
  content,
  threadId,
  attachments = [],
}: {
  content: string;
  threadId?: string;
  attachments?: AgentAttachment[];
}) {
  if (!content.trim() && attachments.length === 0) return null;
  return (
    <div className="group/message flex min-w-0 justify-end">
      <div className="flex min-w-0 max-w-[76%] flex-col items-end">
        <div className="min-w-0 max-w-full overflow-hidden rounded-[1.35rem] bg-[hsl(var(--surface-warm)/0.9)] px-4 py-3 text-sm leading-6 text-foreground transition-colors duration-200">
          {content.trim() && <Markdownish content={content} threadId={threadId} />}
          {attachments.length > 0 && <MessageAttachments attachments={attachments} threadId={threadId} />}
        </div>
        {content.trim() && <MessageCopyAction content={content} align="right" />}
      </div>
    </div>
  );
}

function MessageAttachments({ attachments, threadId }: { attachments: AgentAttachment[]; threadId?: string }) {
  const onPreviewFilePath = useFilePathPreviewHandler();

  async function openAttachment(attachment: AgentAttachment) {
    if (onPreviewFilePath) {
      await onPreviewFilePath(attachment.path);
      return;
    }
    if (!threadId) return;
    await window.brevyn.app.openWorkspacePath({ threadId, path: attachment.path });
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <button
          key={attachment.id || attachment.path}
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-background/72 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm transition hover:bg-accent/65"
          title={attachment.path}
          onClick={() => void openAttachment(attachment)}
        >
          <FileTypeIcon name={attachment.name} size={15} />
          <span className="max-w-48 truncate">{attachment.name}</span>
          {attachment.sizeLabel && <span className="text-[10px] text-muted-foreground">{attachment.sizeLabel}</span>}
        </button>
      ))}
    </div>
  );
}

export function ResolvedRuntimeNote({
  tone,
  label,
  detail,
}: {
  tone: "approved" | "denied";
  label: string;
  detail: string;
}) {
  const approved = tone === "approved";
  return (
    <div className="flex justify-start">
      <div className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-[11px] ${
        approved
          ? "brevyn-status-pill-success"
          : "brevyn-status-pill-warning"
      }`}>
        {approved ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
        <span className="shrink-0 font-semibold">{label}</span>
        <span className="min-w-0 truncate text-muted-foreground" title={detail}>{detail}</span>
      </div>
    </div>
  );
}

function MessageCopyAction({ content, align }: { content: string; align: "left" | "right" }) {
  const [copied, setCopied] = useState(false);
  const trimmedContent = content.trim();

  async function handleCopy() {
    if (!trimmedContent) return;
    try {
      await navigator.clipboard.writeText(trimmedContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[AgentMessageParts] Failed to copy message:", error);
    }
  }

  return (
    <div className={`mt-1.5 flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/65 opacity-70 transition hover:bg-accent/65 hover:text-foreground hover:opacity-100 focus-visible:bg-accent focus-visible:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/message:opacity-100"
        aria-label={copied ? "Message copied" : "Copy message"}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function AssistantTextBubble({
  content,
  threadId,
  streaming = false,
  copyable = true,
  copyContent,
}: {
  content: string;
  threadId?: string;
  streaming?: boolean;
  stoppedByUser?: boolean;
  copyable?: boolean;
  copyContent?: string;
}) {
  const displayContent = content.replace(/\u0000/g, "");
  if (!displayContent.trim()) return null;
  return (
    <div className="group/message flex min-w-0 w-full justify-start">
      <div
        className="min-w-0 w-full max-w-full overflow-hidden py-1 text-sm leading-6 text-foreground [contain:layout_paint_style]"
        data-thread-id={threadId}
        data-streaming={streaming ? "true" : "false"}
      >
        <Markdownish content={displayContent} threadId={threadId} streaming={streaming} />
        {!streaming && copyable && <MessageCopyAction content={copyContent || content} align="left" />}
      </div>
    </div>
  );
}

export function StreamingMarkdownish({
  content,
  threadId,
  streaming: _streaming = false,
}: {
  content: string;
  threadId?: string;
  streaming?: boolean;
}) {
  const displayContent = content.replace(/\u0000/g, "");
  if (!displayContent.trim()) return null;
  return <Markdownish content={displayContent} threadId={threadId} streaming={_streaming} />;
}
