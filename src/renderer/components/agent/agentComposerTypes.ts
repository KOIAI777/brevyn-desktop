import type { AgentPermissionMode } from "@/types/domain";

export interface QueuedAgentMessage {
  id: string;
  prompt: string;
  permissionMode?: AgentPermissionMode;
  providerSelection?: { providerId?: string; modelId?: string };
  mentionedSkills?: string[];
  createdAt: number;
}
