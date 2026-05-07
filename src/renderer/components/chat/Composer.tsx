import { Paperclip, Send, ShieldCheck, Square } from "lucide-react";
import type { ContextWindowReport, PermissionMode, RunStatus } from "@/types/domain";
import { cx } from "@/lib/cn";
import { isRunning } from "@/lib/run-status";
import { ContextTokenRing, RunStatusBadge } from "@/components/status/RunIndicators";

export function Composer({
  value,
  disabled,
  placeholder = "Ask about this course, search materials, plan a draft, or request a file/Git action...",
  runStatus,
  permissionMode,
  contextReport,
  onChange,
  onPermissionModeChange,
  onSend,
  onStop,
}: {
  value: string;
  disabled: boolean;
  placeholder?: string;
  runStatus: RunStatus;
  permissionMode: PermissionMode;
  contextReport: ContextWindowReport | null;
  onChange: (value: string) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  return (
    <div className="border-t bg-card/90 px-4 py-3">
      <div className="mx-auto max-w-3xl rounded-lg border bg-background/85 p-2 shadow-sm ring-1 ring-border/60 transition-shadow duration-200 focus-within:shadow-md">
        <textarea
          className="min-h-[76px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSend();
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            <div className="flex rounded-md border bg-card p-0.5">
              {(["review", "full"] as PermissionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cx(
                    "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition",
                    permissionMode === mode ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => onPermissionModeChange(mode)}
                  title={mode === "review" ? "Review risky shell commands" : "Full access inside the current workspace"}
                >
                  {mode === "review" && <ShieldCheck className="h-3 w-3" />}
                  {mode === "review" ? "review" : "full access"}
                </button>
              ))}
            </div>
            <RunStatusBadge status={runStatus} />
            <ContextTokenRing report={contextReport} />
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Attach course files"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
          </div>

          {isRunning(runStatus) ? (
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onStop}>
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          ) : (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!value.trim() || disabled}
              onClick={onSend}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
