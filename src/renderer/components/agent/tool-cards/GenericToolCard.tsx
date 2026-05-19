import { Check, X } from "lucide-react";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "./types";
import { CompactProcessCard, DeferredToolDetails } from "./shared";
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
  const running = !result;
  const status = result ? helpers.toolResultSummary(result) : "运行中";
  const title = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {helpers.renderToolGlyph(block.name, "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0 truncate">{helpers.renderToolTitle(block.name, block.input, { isError: result?.isError })}</span>
    </span>
  );

  return (
    <div className="overflow-hidden">
      <CompactProcessCard
        title={title}
        status={status}
        running={running}
        isError={result?.isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className={`${collapsed ? "mt-0 grid-rows-[0fr] opacity-0" : "mt-1.5 grid-rows-[1fr] opacity-100"} grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out`}>
        <div className="min-h-0 overflow-hidden px-1 py-1 text-xs text-muted-foreground">
          <DeferredToolDetails collapsed={collapsed}>
            <ToolInputPreview toolName={block.name} input={block.input} compact {...helpers} />
            {result && (!isFileEditTool(block.name) || result.isError) && <InlineToolResult result={result} {...helpers} />}
          </DeferredToolDetails>
        </div>
      </div>
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
  const title = toolUse ? (
    <span className="inline-flex min-w-0 items-center gap-2">
      {helpers.renderToolGlyph(toolUse.name, "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0 truncate">{helpers.renderToolTitle(toolUse.name, toolUse.input, { isError: tool.isError })}</span>
    </span>
  ) : "Tool result";

  return (
    <div className="overflow-hidden">
      <CompactProcessCard
        title={title}
        status={helpers.toolResultSummary(tool)}
        isError={tool.isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className={`${collapsed ? "mt-0 grid-rows-[0fr] opacity-0" : "mt-1.5 grid-rows-[1fr] opacity-100"} grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out`}>
        <div className="min-h-0 overflow-hidden">
          <DeferredToolDetails collapsed={collapsed}>
            <pre className="max-h-44 overflow-auto rounded-lg bg-muted/35 p-2 text-[11px] leading-5">
              {helpers.formatToolResultContent(tool.content)}
            </pre>
          </DeferredToolDetails>
        </div>
      </div>
    </div>
  );
}

function InlineToolResult({ result, ...helpers }: { result: ToolResultBlock } & ToolCardHelpers) {
  return (
    <div className="mt-2">
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
