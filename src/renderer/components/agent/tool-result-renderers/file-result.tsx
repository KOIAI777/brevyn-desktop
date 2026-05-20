import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { ToolInputPreview } from "@/components/agent/tool-cards/ToolInputPreview";

export function isFileTool(toolName: string): boolean {
  return toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit";
}

export function FileToolDetails({
  toolUse,
  ...helpers
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
} & ToolCardHelpers) {
  return <ToolInputPreview toolName={toolUse.name} input={toolUse.input} compact {...helpers} />;
}
