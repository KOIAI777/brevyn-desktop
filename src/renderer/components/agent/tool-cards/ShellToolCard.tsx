import type { ToolCardHelpers } from "./types";
import { CompactProcessCard, DeferredToolDetails } from "./shared";

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
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-stone-200/70 bg-[linear-gradient(135deg,rgba(41,37,36,0.96),rgba(68,60,49,0.94))] px-4 py-3 font-mono text-[12px] leading-6 text-stone-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(64,55,38,0.12)] [contain:layout_paint_style] [content-visibility:auto] [contain-intrinsic-size:220px] brevyn-scrollbar">
              <span className="text-emerald-300">$</span>
              {terminalText.replace(/^\$/, "")}
            </pre>
          </DeferredToolDetails>
        </div>
      </div>
    </div>
  );
}
