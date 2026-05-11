import { Eye, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import type { FilePreview } from "@/types/domain";
import { Markdownish } from "@/components/chat/Markdownish";
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
        {preview.fileUrl && (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => void window.brevyn.files.open(preview.id)}
            title="Open source file"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3 brevyn-scrollbar">
        {preview.summary && <div className="mb-3 rounded-lg border bg-background/70 px-3 py-2 text-[12px] leading-5 text-muted-foreground">{preview.summary}</div>}

        {preview.kind === "markdown" && preview.content && (
          <div className="rounded-lg border bg-background px-3 py-3 text-[12px] leading-6 text-foreground">
            <Markdownish content={preview.content} />
          </div>
        )}

        {preview.kind === "pdf" && preview.fileUrl && (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background">
            <iframe className="h-full w-full bg-background" src={preview.fileUrl} title={preview.title} />
          </div>
        )}

        {(preview.kind === "code" || preview.kind === "text") && preview.content && (
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 px-3 py-3 text-[12px] leading-6 text-foreground">
            <code>{preview.content}</code>
          </pre>
        )}

        {preview.kind === "image" && (
          <div className="overflow-hidden rounded-lg border bg-background p-2">
            {preview.fileUrl ? (
              <img className="max-h-[70vh] w-full rounded-md object-contain" src={preview.fileUrl} alt={preview.title} />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">Image source is not available.</div>
            )}
          </div>
        )}

        {preview.kind === "docx" && preview.html && (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background">
            <iframe
              className="h-full w-full bg-background"
              sandbox=""
              srcDoc={docxPreviewDocument(preview.html)}
              title={preview.title}
            />
          </div>
        )}

        {preview.kind === "docx" && !preview.html && preview.content && (
          <div className="rounded-lg border bg-background px-3 py-3">
            <pre className="whitespace-pre-wrap text-[12px] leading-6 text-foreground">{preview.content}</pre>
          </div>
        )}

        {preview.kind === "pptx" && preview.content && !preview.pages?.length && (
          <div className="rounded-lg border bg-background px-3 py-3">
            <pre className="whitespace-pre-wrap text-[12px] leading-6 text-foreground">{preview.content}</pre>
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
                <div className="whitespace-pre-wrap rounded-md bg-muted/55 px-3 py-3 text-[12px] leading-5 text-foreground/80">{page}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function docxPreviewDocument(html: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        background: #f5f2ec;
        color: #1f2933;
      }
      body {
        margin: 0;
        padding: 24px 16px;
        background:
          radial-gradient(circle at 20% 0%, rgba(255,255,255,.9), transparent 28rem),
          #f5f2ec;
      }
      .page {
        box-sizing: border-box;
        max-width: 780px;
        min-height: calc(100vh - 48px);
        margin: 0 auto;
        padding: 42px 48px;
        border: 1px solid rgba(31, 41, 51, 0.12);
        border-radius: 12px;
        background: #fffdf8;
        box-shadow: 0 20px 50px rgba(31, 41, 51, 0.10);
      }
      h1, h2, h3 {
        margin: 1.1em 0 0.55em;
        line-height: 1.2;
        color: #111827;
      }
      h1:first-child, h2:first-child, h3:first-child, p:first-child {
        margin-top: 0;
      }
      h1 { font-size: 24px; letter-spacing: -0.02em; }
      h2 { font-size: 19px; }
      h3 { font-size: 16px; }
      p, li {
        font-size: 13.5px;
        line-height: 1.72;
      }
      p {
        margin: 0.7em 0;
      }
      table {
        width: 100%;
        margin: 1em 0;
        border-collapse: collapse;
        font-size: 12.5px;
      }
      th, td {
        border: 1px solid rgba(31, 41, 51, 0.18);
        padding: 8px 10px;
        vertical-align: top;
      }
      th {
        background: rgba(245, 242, 236, 0.85);
      }
      img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
      }
      a {
        color: #2563eb;
      }
    </style>
  </head>
  <body>
    <main class="page">${html}</main>
  </body>
</html>`;
}
