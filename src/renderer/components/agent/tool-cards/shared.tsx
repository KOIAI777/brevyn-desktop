import { useEffect, useState, type ReactNode } from "react";

export function ToolDetailsShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/54 shadow-sm ring-1 ring-white/55 ${className}`}>
      {children}
    </div>
  );
}

export function ToolCodeBlock({
  children,
  className = "",
  maxHeight = "max-h-72",
}: {
  children: ReactNode;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <pre className={`${maxHeight} overflow-auto whitespace-pre-wrap break-words bg-[linear-gradient(135deg,rgba(255,252,244,0.94),rgba(244,238,224,0.86))] px-4 py-3 font-mono text-[12px] leading-6 text-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] [contain:layout_paint_style] brevyn-scrollbar ${className}`}>
      {children}
    </pre>
  );
}

export function PreviewPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

export function PreviewBlock({
  label,
  value,
  language,
  compact = false,
  truncatePreview,
}: {
  label: string;
  value: string;
  language?: string;
  compact?: boolean;
  truncatePreview: (value: string) => string;
}) {
  return (
    <div className="mt-2">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <ToolDetailsShell className="mt-1">
        <ToolCodeBlock maxHeight={compact ? "max-h-36" : "max-h-56"} className="text-[11px] leading-5">
          {language ? `$ ${truncatePreview(value)}` : truncatePreview(value)}
        </ToolCodeBlock>
      </ToolDetailsShell>
    </div>
  );
}

export function DeferredToolDetails({
  collapsed,
  defer = true,
  children,
}: {
  collapsed: boolean;
  defer?: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (collapsed) {
      setMounted(false);
      return;
    }
    let firstFrame = 0;
    let secondFrame = 0;
    const delay = defer ? 72 : 24;
    const timeout = window.setTimeout(() => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setMounted(true));
      });
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [collapsed, defer]);

  if (!mounted) {
    return (
      <div className="h-7 rounded-lg bg-muted/15 opacity-70" />
    );
  }
  return <div className="tool-details-content-in [contain:layout_paint_style]">{children}</div>;
}
