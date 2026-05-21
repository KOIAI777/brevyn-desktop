import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Circle, Loader2, Minimize2 } from "lucide-react";
import type { ContextUsage } from "@/components/agent/agentTimelineModel";

export function ContextUsageButton({
  usage,
  autoCompactThresholdPercent,
  compacting,
  compactDisabled,
  onCompact,
}: {
  usage: ContextUsage | null;
  autoCompactThresholdPercent: number;
  compacting: boolean;
  compactDisabled: boolean;
  onCompact: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const showMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const hideMenuSoon = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 90);
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open || compacting || !usage) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 256;
      setMenuPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 12),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [compacting, open, usage]);

  if (compacting) {
    return (
      <button
        type="button"
        disabled
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
        title="正在压缩上下文"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </button>
    );
  }
  if (!usage) return null;

  const contextInputTokens = usage.contextInputTokens ?? usage.inputTokens;
  const ratio = usage.contextWindow ? clampNumber(contextInputTokens / usage.contextWindow, 0, 1) : 0;
  const compactThresholdRatio = clampNumber(autoCompactThresholdPercent, 50, 95) / 100;
  const compactThreshold = usage.contextWindow ? usage.contextWindow * compactThresholdRatio : 0;
  const warning = compactThreshold > 0 ? contextInputTokens / compactThreshold >= 0.8 : false;
  const percent = usage.contextWindow ? Math.round((contextInputTokens / usage.contextWindow) * 100) : undefined;
  const contextWindowLabel = usage.contextWindowSource === "inferred" ? "估算窗口" : usage.contextWindowSource === "unknown" ? "未知窗口" : "配置窗口";
  const ringStyle = {
    background: `conic-gradient(${warning ? "#d97706" : "#334155"} ${Math.round(ratio * 360)}deg, rgba(120,113,108,0.18) 0deg)`,
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/60 shadow-sm transition hover:scale-[1.03] hover:bg-background ${
          warning ? "border-amber-200 text-amber-800" : "border-white/50 text-muted-foreground"
        }`}
        aria-label="Context usage"
        title="Context usage"
        onMouseEnter={showMenu}
        onMouseLeave={hideMenuSoon}
        onFocus={showMenu}
        onBlur={hideMenuSoon}
      >
        <span className="absolute inset-[5px] rounded-full" style={ringStyle} />
        <span className="absolute inset-[8px] rounded-full bg-card" />
        <Circle className="relative h-2 w-2 fill-current" />
      </button>
      {open && createPortal(
        <div
          className="fixed z-[120] w-64 -translate-y-full rounded-2xl border border-white/65 bg-card/95 p-3 text-xs shadow-[0_18px_48px_rgba(64,55,38,0.18)] ring-1 ring-border/50 backdrop-blur-xl"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onMouseEnter={showMenu}
          onMouseLeave={hideMenuSoon}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-foreground">本轮上下文用量</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {usage.contextWindow ? `${formatTokens(contextInputTokens)} / ${formatTokens(usage.contextWindow)} · ${contextWindowLabel}` : `${formatTokens(contextInputTokens)} used`}
              </p>
            </div>
            {percent !== undefined && (
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${warning ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                {percent}%
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-1.5">
            <ContextUsageTextRow label="模型" value={usage.modelId} />
            <ContextUsageRow label="输入" value={usage.inputTokens} />
            <ContextUsageRow label="输出" value={usage.outputTokens} />
            <ContextUsageRow label="缓存读取" value={usage.cacheReadTokens} />
            <ContextUsageRow label="缓存写入" value={usage.cacheCreationTokens} />
            <ContextUsageRow label="推理" value={usage.reasoningTokens} />
            <ContextUsageRow label="总计" value={usage.totalTokens} />
          </div>
          <button
            type="button"
            className={`mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              warning
                ? "border-amber-300 bg-amber-500 text-white hover:bg-amber-600"
                : "border-border bg-background/70 text-foreground hover:bg-accent"
            }`}
            disabled={compactDisabled}
            onClick={() => {
              setOpen(false);
              onCompact();
            }}
          >
            <Minimize2 className="h-3.5 w-3.5" />
            压缩上下文
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ContextUsageTextRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function ContextUsageRow({ label, value }: { label: string; value?: number }) {
  if (!value || value <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value.toLocaleString()}</span>
    </div>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return String(tokens);
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
