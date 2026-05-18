import { RagSearchToolCard } from "@/components/agent/tool-cards/RagSearchToolCard";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";

export function RagSearchResultRenderer({
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
    <RagSearchToolCard
      input={toolUse.input}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}
