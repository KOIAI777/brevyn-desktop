import { ShellToolCard } from "@/components/agent/tool-cards/ShellToolCard";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";

export function BashResultRenderer({
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
    <ShellToolCard
      command={helpers.stringValue(helpers.recordObject(toolUse.input).command, "")}
      output={result ? helpers.formatToolResultContent(result.content) : undefined}
      running={!result}
      isError={result?.isError}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}
