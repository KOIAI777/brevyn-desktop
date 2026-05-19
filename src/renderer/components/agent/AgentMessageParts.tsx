import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Minimize2, ShieldCheck, X } from "lucide-react";
import { Markdownish } from "@/components/chat/Markdownish";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { useFilePathPreviewHandler } from "@/components/chat/FilePathChip";
import type { AgentAttachment } from "@/types/domain";

export function CompactContextNote({ state }: { state: "compacting" | "complete" }) {
  const compacting = state === "compacting";
  return (
    <div className="flex w-full items-center gap-3 py-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/70 to-border/25" />
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] shadow-sm backdrop-blur-xl ${
        compacting
          ? "border-amber-200 bg-amber-50/75 text-amber-900"
          : "border-emerald-200 bg-emerald-50/75 text-emerald-800"
      }`}>
        <Minimize2 className="h-3.5 w-3.5 shrink-0" />
        <span className={`font-semibold ${compacting ? "taskagent-sweep-text" : ""}`}>{compacting ? "正在压缩上下文" : "上下文已压缩"}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-border/25 via-border/70 to-transparent" />
    </div>
  );
}

export function PromptTooLongCard({ message, onCompact }: { message: string; onCompact: () => void }) {
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-xl rounded-2xl border border-amber-200 bg-amber-50/82 p-4 text-sm text-amber-950 shadow-sm ring-1 ring-white/55 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <Minimize2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">上下文太长，需要压缩</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">
              当前会话已经接近或超过模型上下文限制。先压缩上下文后，Brevyn 会把旧对话折叠成摘要再继续。
            </p>
            {message.trim() && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-amber-900/65" title={message}>
                {message}
              </p>
            )}
            <button
              type="button"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-xl bg-amber-600 px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-700"
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
      <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-red-50/82 p-4 text-sm text-red-950 shadow-sm ring-1 ring-white/55 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Provider 返回错误</p>
            <p className="mt-1 text-xs leading-5 text-red-900/78">
              这是模型服务商返回的原始错误，Brevyn 已停止本轮输出。
            </p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-red-200/70 bg-white/58 p-2.5 text-[11px] leading-5 text-red-950">
              {trimmed}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({
  role,
  content,
  threadId,
  streaming = false,
  copyable = true,
  copyContent,
  stoppedByUser = false,
  attachments = [],
}: {
  role: "user" | "assistant";
  content: string;
  threadId?: string;
  streaming?: boolean;
  copyable?: boolean;
  copyContent?: string;
  stoppedByUser?: boolean;
  attachments?: AgentAttachment[];
}) {
  if (!content.trim() && attachments.length === 0) return null;
  if (role === "assistant") {
    return (
      <div className="group/message flex justify-start">
        <div className="min-w-0 w-full animate-[message-rise-in_180ms_cubic-bezier(0.22,1,0.36,1)] px-1 py-1 text-sm leading-6 text-foreground">
          <Markdownish content={content} threadId={threadId} />
          {!streaming && stoppedByUser && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              已停止
            </span>
          )}
          {!streaming && copyable && <MessageCopyAction content={copyContent || content} align="left" />}
        </div>
      </div>
    );
  }
  return (
    <div className="group/message flex justify-end">
      <div className="flex max-w-[76%] flex-col items-end">
        <div className="min-w-0 animate-[message-rise-in_180ms_cubic-bezier(0.22,1,0.36,1)] rounded-[1.35rem] border border-border/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(246,242,232,0.86))] px-4 py-3 text-sm leading-6 text-foreground shadow-sm ring-1 ring-white/70 backdrop-blur-xl transition-[box-shadow,border-color,background-color] duration-200">
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
      <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] shadow-sm ${
        approved
          ? "border-emerald-200 bg-emerald-50/75 text-emerald-800"
          : "border-amber-200 bg-amber-50/75 text-amber-900"
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

export function StreamingMessageBubble({ content, threadId, active = true }: { content: string; threadId?: string; active?: boolean }) {
  const smoothContent = useSmoothStreamingText(content, { disabled: !active || content.length > 12_000 });
  const displayContent = normalizeStreamingDisplayText(smoothContent);
  if (!displayContent.trim()) return null;
  return (
    <div className="group/message flex justify-start">
      <div
        className="min-w-0 w-full px-1 py-1 text-sm leading-6 text-foreground"
        data-thread-id={threadId}
        data-streaming={active ? "true" : "false"}
      >
        <span className="whitespace-normal break-words">{displayContent}</span>
      </div>
    </div>
  );
}

function normalizeStreamingDisplayText(value: string): string {
  const text = value.replace(/\u0000/g, "").trim();
  if (!text.includes("\n")) return text;

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 6) return text;

  const shortLineCount = lines.filter((line) => line.length <= 8 && !/^[*-]$/.test(line)).length;
  const looksFragmented = shortLineCount / lines.length >= 0.72;
  if (!looksFragmented) return text;

  const mostlyAscii = lines.filter((line) => /^[\x00-\x7F]+$/.test(line)).length / lines.length >= 0.72;
  return mostlyAscii ? lines.join(" ") : lines.join("");
}

export function RevealedAssistantBubble({
  content,
  copyable,
  copyContent,
  threadId,
  stoppedByUser = false,
  animateReveal = false,
}: {
  content: string;
  copyable: boolean;
  copyContent?: string;
  threadId?: string;
  stoppedByUser?: boolean;
  animateReveal?: boolean;
}) {
  const smoothContent = useSmoothStreamingText(content, { disabled: !animateReveal || content.length > 12_000 });
  const revealed = smoothContent.length >= content.length;
  return (
    <MessageBubble
      role="assistant"
      content={smoothContent}
      threadId={threadId}
      streaming={false}
      copyable={copyable && revealed}
      copyContent={copyContent}
      stoppedByUser={stoppedByUser && revealed}
    />
  );
}

function useSmoothStreamingText(target: string, options?: { disabled?: boolean }): string {
  const [displayed, setDisplayed] = useState("");
  const displayedRef = useRef("");
  const targetRef = useRef(target);
  const frameRef = useRef(0);
  const lastFlushRef = useRef(0);

  useEffect(() => {
    targetRef.current = target;
    const current = displayedRef.current;
    if (target.length < current.length || !target.startsWith(current)) {
      displayedRef.current = options?.disabled ? target : "";
      setDisplayed(displayedRef.current);
      lastFlushRef.current = performance.now();
    }
  }, [options?.disabled, target]);

  useEffect(() => {
    if (options?.disabled) {
      displayedRef.current = targetRef.current;
      setDisplayed(targetRef.current);
      return;
    }

    const tick = (time: number) => {
      const latest = targetRef.current;
      const visible = displayedRef.current;
      if (visible.length >= latest.length) {
        frameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const remaining = latest.length - visible.length;
      const elapsedSinceFlush = time - lastFlushRef.current;
      const shouldBuffer = remaining < 8 && elapsedSinceFlush < 72;
      if (shouldBuffer) {
        frameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const burst = remaining > 480 ? 96 : remaining > 180 ? 48 : remaining > 64 ? 24 : remaining > 16 ? 10 : remaining;
      const chars = Math.max(1, Math.min(remaining, burst));
      displayedRef.current = latest.slice(0, visible.length + chars);
      setDisplayed(displayedRef.current);
      lastFlushRef.current = time;
      frameRef.current = window.requestAnimationFrame(tick);
    };

    lastFlushRef.current = performance.now();
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [options?.disabled]);

  return displayed;
}
