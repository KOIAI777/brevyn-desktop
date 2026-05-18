import { GenericToolResultCard, GenericToolUseCard } from "@/components/agent/tool-cards/GenericToolCard";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";

export function DefaultToolUseRenderer({
  toolUse,
  result,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
} & ToolCardHelpers) {
  return (
    <GenericToolUseCard
      block={toolUse}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}

export function DefaultToolResultRenderer({
  tool,
  toolUse,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: {
  tool: ToolResultBlock;
  toolUse?: ToolUseBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
} & ToolCardHelpers) {
  return (
    <GenericToolResultCard
      tool={tool}
      toolUse={toolUse}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}
