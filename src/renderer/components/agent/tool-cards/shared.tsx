import type { ReactNode } from "react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";

export function ProcessCardHeader({
  title,
  collapsed,
  onToggleCollapsed,
}: {
  title: ReactNode;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 font-sans">
      <div className="min-w-0 truncate text-xs font-semibold text-muted-foreground">{title}</div>
      {onToggleCollapsed && (
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/45 hover:text-foreground"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand tool timeline" : "Collapse tool timeline"}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`} />
        </button>
      )}
    </div>
  );
}

export function CompactProcessCard({
  title,
  status,
  running = false,
  isError = false,
  onToggleCollapsed,
}: {
  title: ReactNode;
  status: string;
  running?: boolean;
  isError?: boolean;
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
        <ChevronRight className="h-3.5 w-3.5 rotate-90" />
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
      <pre className={`${compact ? "max-h-36" : "max-h-56"} mt-1 overflow-auto rounded-lg bg-muted/35 p-2 text-[11px] leading-5 text-foreground`}>
        {language ? `$ ${truncatePreview(value)}` : truncatePreview(value)}
      </pre>
    </div>
  );
}
