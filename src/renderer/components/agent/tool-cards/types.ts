import type { ReactNode } from "react";
export type { ReadFileResult, ToolResultBlock, ToolUseBlock, WebSearchLink } from "@/components/agent/tool-cards/toolModel";

export interface ToolCardHelpers {
  truncatePreview: (value: string) => string;
  renderToolGlyph: (toolName: string, className: string) => ReactNode;
}
