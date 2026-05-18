import { Pencil, Send, Trash2 } from "lucide-react";
import type { QueuedAgentMessage } from "@/components/agent/agentComposerTypes";

export function QueuedMessageDock({
  messages,
  running,
  onSend,
  onDelete,
  onEdit,
}: {
  messages: QueuedAgentMessage[];
  running: boolean;
  onSend: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onEdit: (message: QueuedAgentMessage) => void;
}) {
  return (
    <div className="pointer-events-auto w-full rounded-2xl border border-white/55 bg-card/78 px-3 py-2 shadow-[0_10px_28px_rgba(64,55,38,0.10)] ring-1 ring-border/30 backdrop-blur-2xl">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-foreground">Queued messages</p>
          <p className="text-[10px] text-muted-foreground">{running ? "点击发送会打断当前输出并继续" : "可直接发送或继续编辑"}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{messages.length}</span>
      </div>
      <div className="max-h-32 space-y-1 overflow-y-auto pr-1 brevyn-scrollbar">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className="group flex min-w-0 items-center gap-2 rounded-xl border border-transparent bg-background/48 px-2 py-1.5 text-[11px] transition hover:border-border/70 hover:bg-background/72"
          >
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-foreground/86" title={message.prompt}>
              {message.prompt}
            </span>
            <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition group-hover:opacity-100">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={() => onSend(message.id)}
                title={running ? "发送并打断当前输出" : "立即发送"}
                aria-label="Send queued message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={() => onEdit(message)}
                title="重新编辑"
                aria-label="Edit queued message"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                onClick={() => onDelete(message.id)}
                title="删除"
                aria-label="Delete queued message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
