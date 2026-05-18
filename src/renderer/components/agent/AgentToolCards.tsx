import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { renderToolResult, renderToolUse } from "@/components/agent/tool-result-renderers";
export { ToolInputPreview } from "@/components/agent/tool-cards/ToolInputPreview";

interface ToolUseCardProps extends ToolCardHelpers {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function ToolUseCard({
  block,
  result,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: ToolUseCardProps) {
  return renderToolUse({ toolUse: block, result, collapsed, onToggleCollapsed, helpers });
}

interface ToolResultCardProps extends ToolCardHelpers {
  tool: ToolResultBlock;
  toolUse?: ToolUseBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function ToolResultCard({
  tool,
  toolUse,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: ToolResultCardProps) {
  return renderToolResult({ tool, toolUse, collapsed, onToggleCollapsed, helpers });
}
