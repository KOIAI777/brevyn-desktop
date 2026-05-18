import { SkillToolCard } from "@/components/agent/tool-cards/SkillToolCard";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";

export function isSkillTool(toolName: string): boolean {
  return toolName === "mcp__brevyn__load_skill";
}

export function SkillResultRenderer({
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
    <SkillToolCard
      input={toolUse.input}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}
