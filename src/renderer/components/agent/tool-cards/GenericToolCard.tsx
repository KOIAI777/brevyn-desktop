import { Check, X } from "lucide-react";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "./types";
import { CompactProcessCard, ProcessCardHeader } from "./shared";
import { ToolInputPreview } from "./ToolInputPreview";

export function GenericToolUseCard({
  block,
  result,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
} & ToolCardHelpers) {
  if (collapsed) {
    return (
      <CompactProcessCard
        title={helpers.toolTitle(block.name, block.input)}
        status={result ? helpers.toolResultSummary(result) : "运行中"}
        running={!result}
        isError={result?.isError}
        onToggleCollapsed={onToggleCollapsed}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
      <ProcessCardHeader title={helpers.renderToolTitle(block.name, block.input, { isError: result?.isError })} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      <ToolInputPreview toolName={block.name} input={block.input} compact {...helpers} />
      {result && (!isFileEditTool(block.name) || result.isError) && <InlineToolResult result={result} {...helpers} />}
    </div>
  );
}

export function GenericToolResultCard({
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
  if (collapsed) {
    return (
      <CompactProcessCard
        title={toolUse ? helpers.toolTitle(toolUse.name, toolUse.input) : "Tool result"}
        status={helpers.toolResultSummary(tool)}
        isError={tool.isError}
        onToggleCollapsed={onToggleCollapsed}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
      <ProcessCardHeader title={toolUse ? helpers.renderToolTitle(toolUse.name, toolUse.input, { isError: tool.isError }) : "Tool result"} collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px] leading-5">
        {helpers.formatToolResultContent(tool.content)}
      </pre>
    </div>
  );
}

function InlineToolResult({ result, ...helpers }: { result: ToolResultBlock } & ToolCardHelpers) {
  return (
    <div className="mt-3 rounded-lg border bg-background/75 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {result.isError ? <X className="h-3.5 w-3.5 text-destructive" /> : <Check className="h-3.5 w-3.5" />}
        Result · {helpers.toolResultSummary(result)}
      </div>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/35 p-2 text-[11px] leading-5 text-foreground brevyn-scrollbar">
        {helpers.formatToolResultContent(result.content)}
      </pre>
    </div>
  );
}

function isFileEditTool(toolName: string): boolean {
  return toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit";
}
