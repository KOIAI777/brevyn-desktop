import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { GenericToolResultCard, GenericToolUseCard } from "@/components/agent/tool-cards/GenericToolCard";
import { ShellToolCard } from "@/components/agent/tool-cards/ShellToolCard";
import { WebToolCard } from "@/components/agent/tool-cards/WebToolCard";
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
  if (block.name === "WebSearch" || block.name === "WebFetch") {
    return (
      <WebToolCard
        toolName={block.name}
        input={block.input}
        result={result}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        {...helpers}
      />
    );
  }

  if (block.name === "Bash") {
    return (
      <ShellToolCard
        command={helpers.stringValue(helpers.recordObject(block.input).command, "")}
        output={result ? helpers.formatToolResultContent(result.content) : undefined}
        running={!result}
        isError={result?.isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        {...helpers}
      />
    );
  }

  return (
    <GenericToolUseCard
      block={block}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
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
  if (toolUse?.name === "WebSearch" || toolUse?.name === "WebFetch") {
    return (
      <WebToolCard
        toolName={toolUse.name}
        input={toolUse.input}
        result={tool}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        {...helpers}
      />
    );
  }

  if (toolUse?.name === "Bash") {
    return (
      <ShellToolCard
        command={helpers.stringValue(helpers.recordObject(toolUse.input).command, "")}
        output={helpers.formatToolResultContent(tool.content)}
        isError={tool.isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        {...helpers}
      />
    );
  }

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
