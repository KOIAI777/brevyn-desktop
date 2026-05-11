import type { ReactNode } from "react";

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: unknown;
  isError: boolean;
}

export interface WebSearchLink {
  title: string;
  url: string;
}

export interface ToolCardHelpers {
  formatToolResultContent: (value: unknown) => string;
  formatUnknown: (value: unknown) => string;
  recordObject: (value: unknown) => Record<string, unknown>;
  stringValue: (value: unknown, fallback: string) => string;
  toolResultSummary: (tool: ToolResultBlock) => string;
  toolTitle: (toolName: string, input: unknown) => string;
  renderToolTitle: (toolName: string, input: unknown, options?: { isError?: boolean }) => ReactNode;
  truncatePreview: (value: string) => string;
  singleLine: (value: string) => string;
  renderToolGlyph: (toolName: string, className: string) => ReactNode;
}
