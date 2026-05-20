import { useContext, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { AgentThreadIdContext } from "@/components/agent/AgentThreadContext";
import { FilePathChip } from "@/components/chat/FilePathChip";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { renderToolDetails } from "@/components/agent/tool-result-renderers";
import { DeferredToolDetails } from "@/components/agent/tool-cards/shared";
import {
  getToolErrorSummary,
  getToolPhrase,
  getToolTarget,
  recordObject,
  stringValue,
} from "@/components/agent/tool-cards/toolModel";
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
  const phrase = getToolPhrase(block, result);
  const failed = result?.isError === true;
  const running = !result;
  const target = getToolTarget(block.name, block.input);
  const status = failed ? getToolErrorSummary(result) : phrase.status;

  return (
    <div className="overflow-hidden text-xs text-foreground">
      <ToolCardHeader
        toolUse={block}
        label={phrase.label}
        target={target}
        diffLabel={phrase.diffLabel}
        status={status}
        running={running}
        failed={failed}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        glyph={helpers.renderToolGlyph(block.name, "h-3.5 w-3.5 shrink-0")}
      />
      {!failed && (
        <div className={`${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"} grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out`}>
          <div className="min-h-0 overflow-hidden px-1 py-1">
            <DeferredToolDetails collapsed={collapsed} defer={!running}>
              {renderToolDetails({ toolUse: block, result, helpers })}
            </DeferredToolDetails>
          </div>
        </div>
      )}
    </div>
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
  if (!toolUse) return null;
  return (
    <ToolUseCard
      block={toolUse}
      result={tool}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      {...helpers}
    />
  );
}

function ToolCardHeader({
  toolUse,
  label,
  target,
  diffLabel,
  status,
  running,
  failed,
  collapsed,
  onToggleCollapsed,
  glyph,
}: {
  toolUse: ToolUseBlock;
  label: string;
  target: string;
  diffLabel: string;
  status: string;
  running: boolean;
  failed: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  glyph: ReactNode;
}) {
  const threadId = useContext(AgentThreadIdContext);
  const filePath = fileTarget(toolUse);

  return (
    <button
      type="button"
      className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-md px-0.5 py-1 text-left text-[11px] text-muted-foreground transition hover:text-foreground"
      onClick={onToggleCollapsed}
    >
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 font-medium text-foreground/85">
        {glyph}
        <span className={running ? "taskagent-sweep-text" : undefined}>{label}</span>
        {filePath ? (
          <FilePathChip filePath={filePath} threadId={threadId} />
        ) : target ? (
          <span className="min-w-0 truncate text-muted-foreground" title={target}>
            {target}
          </span>
        ) : null}
        {diffLabel && <DiffStatsText value={diffLabel} />}
      </span>
      <span className={`inline-flex min-w-0 shrink-0 items-center gap-1.5 text-muted-foreground/80 ${running ? "taskagent-sweep-text" : ""}`}>
        {failed ? <X className="h-3.5 w-3.5" /> : !running ? <Check className="h-3.5 w-3.5" /> : null}
        <span className="whitespace-normal break-words">{status}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
      </span>
    </button>
  );
}

function DiffStatsText({ value }: { value: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px]">
      {value.split(" ").map((part) => {
        if (part.startsWith("+")) return <span key={part} className="text-emerald-500">{part}</span>;
        if (part.startsWith("-")) return <span key={part} className="text-red-500">{part}</span>;
        return <span key={part}>{part}</span>;
      })}
    </span>
  );
}

function fileTarget(toolUse: ToolUseBlock): string {
  const input = recordObject(toolUse.input);
  if (toolUse.name === "Read" || toolUse.name === "Write" || toolUse.name === "Edit" || toolUse.name === "MultiEdit") {
    return stringValue(input.file_path ?? input.filePath ?? input.path ?? input.notebook_path, "");
  }
  return "";
}
