import { useContext } from "react";
import { FileText, FolderOpen, FolderTree, Globe, HelpCircle, ListTodo, MessageCircleQuestion, Pencil, Search, ShieldAlert, ShieldCheck, Sparkles, TerminalSquare } from "lucide-react";
import { ToolUseCard as BaseToolUseCard } from "@/components/agent/AgentToolCards";
import { AgentThreadIdContext } from "@/components/agent/AgentThreadContext";
import { FilePathChip } from "@/components/chat/FilePathChip";
import type { ToolResultBlock, ToolUseBlock } from "@/components/agent/agentTimelineModel";
import { truncatePreview } from "@/components/agent/agentTimelineModel";
import {
  formatDiffStats,
  getToolDiffStats,
  getToolTitle,
  recordObject,
  stringValue,
} from "@/components/agent/tool-cards/toolModel";

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
  return (
    <BaseToolUseCard
      block={block}
      result={result}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      truncatePreview={truncatePreview}
      renderToolGlyph={(toolName, className) => <ToolGlyph toolName={toolName} className={className} />}
    />
  );
}

export function ToolTitle({ toolName, input, isError = false }: { toolName: string; input: unknown; isError?: boolean }) {
  const threadId = useContext(AgentThreadIdContext);
  const data = recordObject(input);
  const path = stringValue(data.file_path ?? data.filePath ?? data.path ?? data.notebook_path, "");
  const diff = getToolDiffStats(toolName, input);
  const diffLabel = diff && !isError ? formatDiffStats(diff) : "";

  if (toolName === "Read") {
    return <span>读取</span>;
  }

  if (path && (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit")) {
    return (
      <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
        <span className="shrink-0">编辑</span>
        <FilePathChip filePath={path} threadId={threadId} />
        {diffLabel && <DiffStatsText value={diffLabel} />}
      </span>
    );
  }

  return <span>{getToolTitle(toolName, input)}</span>;
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
  if (toolName === "TodoWrite" || toolName === "TodoRead" || toolName === "TaskCreate" || toolName === "TaskGet" || toolName === "TaskUpdate" || toolName === "TaskList") return <ListTodo className={className} />;
  if (toolName === "mcp__brevyn__course_structure") return <FolderTree className={className} />;
  if (toolName === "mcp__brevyn__rag_search") return <Search className={className} />;
  if (toolName === "WebFetch" || toolName === "WebSearch") return <Globe className={className} />;
  if (toolName === "Skill") return <Sparkles className={className} />;
  if (toolName === "AskUserQuestion") return <MessageCircleQuestion className={className} />;
  if (toolName === "EnterPlanMode" || toolName === "ExitPlanMode") return <ShieldAlert className={className} />;
  if (toolName.startsWith("mcp__brevyn__")) return <ShieldCheck className={className} />;
  return <HelpCircle className={className} />;
}
