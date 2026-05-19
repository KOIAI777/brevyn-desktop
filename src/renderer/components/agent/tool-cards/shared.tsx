import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";

export function CompactProcessCard({
  title,
  status,
  running = false,
  isError = false,
  collapsed = true,
  onToggleCollapsed,
}: {
  title: ReactNode;
  status: string;
  running?: boolean;
  isError?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-accent/35 hover:text-foreground"
      onClick={onToggleCollapsed}
    >
      <span className="min-w-0 truncate font-medium">{title}</span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isError ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {status}
        <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`} />
      </span>
    </button>
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
      <pre className={`${compact ? "max-h-36" : "max-h-56"} mt-1 overflow-auto rounded-lg bg-muted/35 p-2 text-[11px] leading-5 text-foreground [contain:layout_paint_style] [content-visibility:auto] [contain-intrinsic-size:160px]`}>
        {language ? `$ ${truncatePreview(value)}` : truncatePreview(value)}
      </pre>
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
