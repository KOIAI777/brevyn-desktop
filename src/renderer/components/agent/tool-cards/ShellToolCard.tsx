import type { ToolCardHelpers } from "./types";
import { CompactProcessCard, DeferredToolDetails, ToolCodeBlock, ToolDetailsShell } from "./shared";

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
  const status = running ? "运行中" : isError ? "失败" : "成功";
  const title = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {helpers.renderToolGlyph("Bash", "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0 truncate">执行 {helpers.singleLine(command || "command")}</span>
    </span>
  );
  const terminalText = [`$ ${command || ""}`, output ? `\n${helpers.truncatePreview(output)}` : ""].join("");

  return (
    <div className="overflow-hidden">
      <CompactProcessCard
        title={title}
        status={status}
        running={running}
        isError={isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className={`${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"} grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out`}>
        <div className="min-h-0 overflow-hidden">
          <DeferredToolDetails collapsed={collapsed} defer={!running}>
            <ToolDetailsShell>
              <ToolCodeBlock>
                <span className="text-emerald-600">$</span>
                {terminalText.replace(/^\$/, "")}
              </ToolCodeBlock>
            </ToolDetailsShell>
          </DeferredToolDetails>
        </div>
      </div>
    </div>
  );
}
