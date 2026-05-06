import type { UclawRunStreamItem } from "../../types/domain";
import { LocalStore } from "./local-store";

export type AgentRunItemDraft = Omit<UclawRunStreamItem, "seq" | "createdAt">;

function now(): string {
  return new Date().toISOString();
}

export class AgentEventLog {
  constructor(private readonly store: LocalStore) {}

  append(draft: AgentRunItemDraft): UclawRunStreamItem {
    const item: UclawRunStreamItem = {
      ...draft,
      seq: this.store.nextEventSeq(draft.threadId),
      createdAt: now(),
    };
    return this.store.appendEvent(item);
  }

  replay(threadId: string, afterSeq = 0): UclawRunStreamItem[] {
    return this.store.events(threadId, afterSeq);
  }
}
