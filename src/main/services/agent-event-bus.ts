import type { UclawRunStreamItem } from "../../types/domain";
import type { AgentEventLog, AgentRunItemDraft } from "./agent-event-log";

export type AgentEventHandler = (item: UclawRunStreamItem) => void;

export class AgentEventBus {
  private readonly handlers = new Set<AgentEventHandler>();

  constructor(private readonly eventLog: AgentEventLog) {}

  emit(draft: AgentRunItemDraft): UclawRunStreamItem {
    const item = this.eventLog.append(draft);
    for (const handler of this.handlers) {
      try {
        handler(item);
      } catch (error) {
        console.error("[AgentEventBus] handler failed", error);
      }
    }
    return item;
  }

  replay(threadId: string, afterSeq = 0): UclawRunStreamItem[] {
    return this.eventLog.replay(threadId, afterSeq);
  }

  on(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
