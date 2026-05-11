import { Check, Loader2, X } from "lucide-react";
import type { ToolCardHelpers } from "./types";
import { CompactProcessCard, ProcessCardHeader } from "./shared";

export function ShellToolCard({
  command,
  output,
  running = false,
  isError = false,
  collapsed = false,
  onToggleCollapsed,
  ...helpers
}: {
  command: string;
  output?: string;
  running?: boolean;
  isError?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
} & ToolCardHelpers) {
  if (collapsed) {
    return (
      <CompactProcessCard
        title={`Shell · ${helpers.singleLine(command || "command")}`}
        status={running ? "运行中" : isError ? "失败" : "成功"}
        running={running}
        isError={isError}
        onToggleCollapsed={onToggleCollapsed}
      />
    );
  }

  return (
    <div className="overflow-hidden border-l border-border/60 py-1 pl-3 font-mono text-[11px] leading-5 text-foreground">
      <ProcessCardHeader title="Shell" collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      <pre className="whitespace-pre-wrap break-words text-foreground">{command ? `$ ${command}` : "$"}</pre>
      <div className={`${output ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"} grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out`}>
        <div className="min-h-0 overflow-hidden">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-2 text-muted-foreground brevyn-scrollbar">
            {output ? helpers.truncatePreview(output) : ""}
          </pre>
        </div>
      </div>
      <div className="mt-2 flex justify-end font-sans text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isError ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {running ? "运行中" : isError ? "失败" : "成功"}
        </span>
      </div>
    </div>
  );
}
