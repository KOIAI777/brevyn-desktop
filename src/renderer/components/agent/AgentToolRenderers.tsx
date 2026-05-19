import { useContext } from "react";
import { FileText, FolderOpen, Globe, HelpCircle, ListTodo, MessageCircleQuestion, Pencil, Search, ShieldAlert, ShieldCheck, Sparkles, TerminalSquare } from "lucide-react";
import { ToolUseCard as BaseToolUseCard } from "@/components/agent/AgentToolCards";
import { FilePathChip } from "@/components/chat/FilePathChip";
import { AgentThreadIdContext } from "@/components/agent/AgentThreadContext";
import type { ToolResultBlock, ToolUseBlock } from "@/components/agent/agentTimelineModel";
import {
  formatDiffStats,
  formatToolResultContent,
  formatUnknown,
  recordObject,
  singleLine,
  stringValue,
  toolDiffStats,
  toolResultSummary,
  toolTitle,
  truncatePreview,
} from "@/components/agent/agentTimelineModel";

export function ToolUseCard({
  block,
  result,
  collapsed,
  onToggleCollapsed,
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const threadId = useContext(AgentThreadIdContext);
  return (
    <BaseToolUseCard
      block={block}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      formatToolResultContent={formatToolResultContent}
      formatUnknown={formatUnknown}
      recordObject={recordObject}
      stringValue={stringValue}
      toolResultSummary={toolResultSummary}
      toolTitle={toolTitle}
      renderToolTitle={(toolName, input, options) => <ToolTitle toolName={toolName} input={input} threadId={threadId} isError={options?.isError} />}
      truncatePreview={truncatePreview}
      singleLine={singleLine}
      renderToolGlyph={(toolName, className) => <ToolGlyph toolName={toolName} className={className} />}
    />
  );
}

export function ToolTitle({ toolName, input, threadId, isError = false }: { toolName: string; input: unknown; threadId?: string; isError?: boolean }) {
  const data = recordObject(input);
  const path = stringValue(data.file_path ?? data.filePath ?? data.path ?? data.notebook_path, "");
  const diff = toolDiffStats(toolName, input);
  const diffLabel = diff && !isError ? formatDiffStats(diff) : "";

  if (path && (toolName === "Read" || toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit")) {
    const action = toolName === "Read" ? "读取" : "编辑";
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span className="shrink-0">{action}</span>
        <span
          className="min-w-0"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <FilePathChip filePath={path} threadId={threadId} />
        </span>
        {diffLabel && <DiffStatsText value={diffLabel} />}
      </span>
    );
  }

  return <span>{toolTitle(toolName, input)}</span>;
}

export function DiffStatsText({ value }: { value: string }) {
  if (!value) return null;
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

export function ToolGlyph({ toolName, className }: { toolName: string; className?: string }) {
  if (toolName === "Bash") return <TerminalSquare className={className} />;
  if (toolName === "Read") return <FileText className={className} />;
  if (toolName === "Glob") return <FolderOpen className={className} />;
  if (toolName === "Grep") return <Search className={className} />;
  if (toolName === "Write") return <FileText className={className} />;
  if (toolName === "Edit" || toolName === "MultiEdit") return <Pencil className={className} />;
  if (toolName === "TodoWrite" || toolName === "TodoRead") return <ListTodo className={className} />;
  if (toolName === "mcp__brevyn__load_skill") return <Sparkles className={className} />;
  if (toolName === "mcp__brevyn__read_skill_resource") return <FileText className={className} />;
  if (toolName === "mcp__brevyn__rag_search") return <Search className={className} />;
  if (toolName === "WebFetch" || toolName === "WebSearch") return <Globe className={className} />;
  if (toolName === "AskUserQuestion") return <MessageCircleQuestion className={className} />;
  if (toolName === "EnterPlanMode" || toolName === "ExitPlanMode") return <ShieldAlert className={className} />;
  if (toolName.startsWith("mcp__brevyn__")) return <ShieldCheck className={className} />;
  return <HelpCircle className={className} />;
}
