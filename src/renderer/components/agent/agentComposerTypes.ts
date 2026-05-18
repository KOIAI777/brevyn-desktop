import type { AgentPermissionMode } from "@/types/domain";

export interface QueuedAgentMessage {
  id: string;
  prompt: string;
  mode: "execute" | "plan";
  permissionMode: AgentPermissionMode;
  providerSelection: { providerId?: string; modelId?: string };
  createdAt: number;
}
