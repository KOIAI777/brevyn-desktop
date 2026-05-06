import { Eye, Maximize2, Minimize2 } from "lucide-react";
import type { FilePreview } from "@/types/domain";
import { fileIcon } from "./file-icons";

export function FilePreviewPane({
  preview,
  expanded,
  onToggleExpanded,
}: {
  preview: FilePreview | null;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  if (!preview) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Eye className="h-4 w-4 text-muted-foreground" />
            Preview
          </div>
          {onToggleExpanded && (
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onToggleExpanded}
              title={expanded ? "Collapse preview" : "Expand preview"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          <div>
            <Eye className="mx-auto mb-2 h-5 w-5" />
            Select a file to preview.
          </div>
        </div>
      </div>
    );
  }

  const Icon = fileIcon(preview.kind);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{preview.title}</div>
          <div className="truncate text-[10px] text-muted-foreground">{preview.path}</div>
        </div>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{preview.kind}</span>
        {onToggleExpanded && (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onToggleExpanded}
            title={expanded ? "Collapse preview" : "Expand preview"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 uclaw-scrollbar">
        {preview.summary && <div className="mb-3 rounded-lg border bg-background/70 px-3 py-2 text-[12px] leading-5 text-muted-foreground">{preview.summary}</div>}

        {(preview.kind === "markdown" || preview.kind === "code" || preview.kind === "text") && preview.content && (
          <pre className="overflow-x-auto rounded-lg border bg-slate-950 px-3 py-3 text-[12px] leading-6 text-slate-100">
            <code>{preview.content}</code>
          </pre>
        )}

        {preview.kind === "image" && (
          <div className="rounded-lg border bg-background p-4">
            <div className="aspect-[4/3] rounded-md border bg-[linear-gradient(135deg,#dbeafe,#ecfeff_45%,#fef3c7)] p-4">
              <div className="flex h-full items-center justify-center rounded border border-dashed border-foreground/20 text-center text-xs text-muted-foreground">Image preview placeholder</div>
            </div>
          </div>
        )}

        {preview.pages && (
          <div className="space-y-2">
            {preview.pages.map((page, index) => (
              <div key={`${page}-${index}`} className="rounded-lg border bg-background px-3 py-3">
                <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{preview.kind === "pptx" ? `Slide ${index + 1}` : `Page ${index + 1}`}</span>
                  <span>preview</span>
                </div>
                <div className="rounded-md bg-muted/55 px-3 py-5 text-sm font-medium text-foreground/80">{page}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
