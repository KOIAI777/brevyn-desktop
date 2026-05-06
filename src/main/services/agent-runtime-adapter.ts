import type { AgentRunInput, UclawRunStreamItem } from "../../types/domain";

export interface AgentRuntimeAdapter {
  run(input: AgentRunInput, emit: (item: Omit<UclawRunStreamItem, "seq" | "createdAt">) => void): Promise<void>;
}

export class MockAgentRuntimeAdapter implements AgentRuntimeAdapter {
  async run(input: AgentRunInput, emit: (item: Omit<UclawRunStreamItem, "seq" | "createdAt">) => void): Promise<void> {
    const runId = `run-${Date.now().toString(36)}`;
    const base = {
      runId,
      threadId: input.threadId,
    };
    emit({
      ...base,
      id: `${runId}-context`,
      type: "context_snapshot",
      status: "running",
      title: "Context window",
      detail: "Loaded course, task, files, enabled skills, and recent thread messages.",
    });
  }
}

export class OpenAIAgentsAdapter implements AgentRuntimeAdapter {
  async run(): Promise<void> {
    await import("@openai/agents");
    throw new Error("OpenAI Agents SDK adapter is scaffolded but not connected to credentials yet.");
  }
}
