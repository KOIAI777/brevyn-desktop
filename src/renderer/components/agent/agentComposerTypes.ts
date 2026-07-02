import type { AgentPermissionMode } from "@/types/domain";
import type { AgentQuotedSelection } from "@/components/agent/quotedSelection";

export interface QueuedAgentMessage {
  id: string;
  prompt: string;
  permissionMode?: AgentPermissionMode;
  providerSelection?: { providerId?: string; modelId?: string };
  mentionedSkills?: string[];
  quotedSelection?: AgentQuotedSelection;
  quotedSelections?: AgentQuotedSelection[];
  createdAt: number;
}
