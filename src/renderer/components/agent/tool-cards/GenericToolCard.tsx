import { Check } from "lucide-react";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "./types";
import { CompactProcessCard, DeferredToolDetails, ToolCodeBlock, ToolDetailsShell } from "./shared";
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
  const hideDetails = result?.isError === true;
  const title = (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      {helpers.renderToolGlyph(block.name, "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0">{helpers.renderToolTitle(block.name, block.input, { isError: result?.isError })}</span>
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
      {!hideDetails && (
        <div className={`${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"} grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out`}>
          <div className="min-h-0 overflow-hidden px-1 py-1 text-xs text-muted-foreground">
            <DeferredToolDetails collapsed={collapsed} defer={!running}>
              <ToolInputPreview toolName={block.name} input={block.input} compact {...helpers} />
              {result && !isFileEditTool(block.name) && <InlineToolResult result={result} {...helpers} />}
            </DeferredToolDetails>
          </div>
        </div>
      )}
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
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      {helpers.renderToolGlyph(toolUse.name, "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0">{helpers.renderToolTitle(toolUse.name, toolUse.input, { isError: tool.isError })}</span>
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
      <div className={`${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"} grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out`}>
        <div className="min-h-0 overflow-hidden">
          {!tool.isError && (
            <DeferredToolDetails collapsed={collapsed}>
              <ToolDetailsShell>
                <ToolCodeBlock maxHeight="max-h-44" className="text-[11px] leading-5">
                  {helpers.formatToolResultContent(tool.content)}
                </ToolCodeBlock>
              </ToolDetailsShell>
            </DeferredToolDetails>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineToolResult({ result, ...helpers }: { result: ToolResultBlock } & ToolCardHelpers) {
  return (
    <div className="mt-2">
      <div className="flex min-w-0 items-start gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        <span className="min-w-0 whitespace-normal break-words">结果 · {helpers.toolResultSummary(result)}</span>
      </div>
      <ToolDetailsShell>
        <ToolCodeBlock maxHeight="max-h-44" className="text-[11px] leading-5">
          {helpers.formatToolResultContent(result.content)}
        </ToolCodeBlock>
      </ToolDetailsShell>
    </div>
  );
}

function isFileEditTool(toolName: string): boolean {
  return toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit";
}
