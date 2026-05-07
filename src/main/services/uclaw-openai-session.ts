import type { AgentInputItem, Session } from "@openai/agents";
import { LocalStore } from "./local-store";

export class UclawOpenAISession implements Session {
  constructor(
    private readonly store: LocalStore,
    private readonly threadId: string,
  ) {}

  async getSessionId(): Promise<string> {
    return this.threadId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    return this.store.openAISessionItems(this.threadId, limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    this.store.appendOpenAISessionItems(this.threadId, items);
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return this.store.popOpenAISessionItem(this.threadId);
  }

  async clearSession(): Promise<void> {
    this.store.clearOpenAISession(this.threadId);
  }
}
