import { WebToolCard } from "@/components/agent/tool-cards/WebToolCard";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";

export function isWebTool(toolName: string): boolean {
  return toolName === "WebSearch" || toolName === "WebFetch";
}

export function WebResultRenderer({
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
    <WebToolCard
      toolName={toolUse.name}
      input={toolUse.input}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}
