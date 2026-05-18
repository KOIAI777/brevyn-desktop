import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { BashResultRenderer } from "@/components/agent/tool-result-renderers/bash-result";
import { DefaultToolResultRenderer, DefaultToolUseRenderer } from "@/components/agent/tool-result-renderers/default-result";
import { FileToolResultRenderer, FileToolUseRenderer, isFileTool } from "@/components/agent/tool-result-renderers/file-result";
import { RagSearchResultRenderer } from "@/components/agent/tool-result-renderers/rag-search-result";
import { isSkillTool, SkillResultRenderer } from "@/components/agent/tool-result-renderers/skill-result";
import { isWebTool, WebResultRenderer } from "@/components/agent/tool-result-renderers/web-result";

export function renderToolUse({
  toolUse,
  result,
  collapsed,
  onToggleCollapsed,
  helpers,
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  helpers: ToolCardHelpers;
}) {
  if (toolUse.name === "mcp__brevyn__rag_search") {
    return <RagSearchResultRenderer toolUse={toolUse} result={result} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (isSkillTool(toolUse.name)) {
    return <SkillResultRenderer toolUse={toolUse} result={result} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (isWebTool(toolUse.name)) {
    return <WebResultRenderer toolUse={toolUse} result={result} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (toolUse.name === "Bash") {
    return <BashResultRenderer toolUse={toolUse} result={result} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (isFileTool(toolUse.name)) {
    return <FileToolUseRenderer toolUse={toolUse} result={result} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  return <DefaultToolUseRenderer toolUse={toolUse} result={result} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
}

export function renderToolResult({
  tool,
  toolUse,
  collapsed,
  onToggleCollapsed,
  helpers,
}: {
  tool: ToolResultBlock;
  toolUse?: ToolUseBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  helpers: ToolCardHelpers;
}) {
  if (!toolUse) {
    return <DefaultToolResultRenderer tool={tool} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (toolUse.name === "mcp__brevyn__rag_search") {
    return <RagSearchResultRenderer toolUse={toolUse} result={tool} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (isSkillTool(toolUse.name)) {
    return <SkillResultRenderer toolUse={toolUse} result={tool} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (isWebTool(toolUse.name)) {
    return <WebResultRenderer toolUse={toolUse} result={tool} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (toolUse.name === "Bash") {
    return <BashResultRenderer toolUse={toolUse} result={tool} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  if (isFileTool(toolUse.name)) {
    return <FileToolResultRenderer tool={tool} toolUse={toolUse} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
  }
  return <DefaultToolResultRenderer tool={tool} toolUse={toolUse} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} {...helpers} />;
}
