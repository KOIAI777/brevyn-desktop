import { Bot } from "lucide-react";
import type { ChatMessage } from "@/types/domain";
import { cx } from "@/lib/cn";
import { Markdownish } from "./Markdownish";
import { TaskAgentTimeline } from "./TaskAgentTimeline";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article className={cx("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={cx("min-w-0 max-w-[84%]", isUser && "flex justify-end")}>
        {message.timeline && message.timeline.length > 0 && !isUser && (
          <div className="mb-2">
            <TaskAgentTimeline items={message.timeline} runStatus="completed" collapsed onToggle={() => undefined} />
          </div>
        )}
        <div className={cx("rounded-lg border px-3 py-2 text-sm leading-7 shadow-sm", isUser ? "bg-foreground text-background" : "bg-card text-foreground")}>
          <Markdownish content={message.content || (message.role === "assistant" ? " " : "")} />
        </div>
      </div>
    </article>
  );
}
