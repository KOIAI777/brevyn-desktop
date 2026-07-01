import { ChevronDown, Code2, Eye, ExternalLink, FileSearch, FolderOpen, ImageIcon, Maximize2, Minimize2, Minus, MoveHorizontal, Plus, Presentation, RotateCcw, Table2, Terminal, Type } from "lucide-react";
import type { FilePreview, OpenPathOption } from "@/types/domain";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Markdownish } from "@/components/chat/Markdownish";
import { FileTypeIcon } from "./FileTypeIcon";

const openPathOptionsCache = new Map<string, OpenPathOption[]>();
const IMAGE_ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
const PREVIEW_VIEW_STATE_LIMIT = 60;
const previewViewStates = new Map<string, PreviewViewState>();

type PreviewViewState = {
  scrollTop?: number;
  pdfZoom?: number;
  pdfScrollTop?: number;
  imageZoomIndex?: number;
  imageScrollLeft?: number;
  imageScrollTop?: number;
};

export function FilePreviewPane({
  preview,
  loading = false,
  expanded,
  onToggleExpanded,
}: {
  preview: FilePreview | null;
  loading?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewKey = preview ? filePreviewViewKey(preview) : "";

  useEffect(() => {
    if (!previewKey) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const saved = readPreviewViewState(previewKey);
      if (scrollRef.current) scrollRef.current.scrollTop = saved?.scrollTop || 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewKey]);

  function handlePreviewScroll() {
    if (!previewKey || !scrollRef.current) return;
    updatePreviewViewState(previewKey, { scrollTop: scrollRef.current.scrollTop });
  }

  if (!preview) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b bg-card/60 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Eye className="h-4 w-4 text-muted-foreground" />
            预览
          </div>
          {onToggleExpanded && (
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/70 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onToggleExpanded}
              title={expanded ? "收起预览" : "展开预览"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <div className="brevyn-preview-empty-card w-full max-w-[18rem] rounded-2xl border border-dashed border-border/80 bg-background/55 px-4 py-5 text-center shadow-sm ring-1 ring-white/45">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border bg-card/85 text-muted-foreground shadow-sm">
              <FileSearch className={`h-5 w-5 ${loading ? "animate-pulse" : ""}`} />
            </div>
            {loading ? (
              <>
                <p className="mt-3 text-sm font-semibold text-foreground">正在生成预览</p>
                <div className="mt-3 space-y-2">
                  <div className="mx-auto h-2.5 w-36 animate-pulse rounded-full bg-muted" />
                  <div className="mx-auto h-2.5 w-24 animate-pulse rounded-full bg-muted/70" />
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-semibold text-foreground">选择文件预览</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  点击文件树或对话里的文件引用，Markdown、PDF、图片和 Office 文档会在这里打开。
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                  {["MD", "PDF", "DOCX", "PPTX", "XLSX", "IMG"].map((label) => (
                    <span key={label} className="rounded-full border bg-card/70 px-2 py-0.5">
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-[42px] items-center gap-2 border-b px-3 py-2">
        <FileTypeIcon name={preview.title || preview.path} isDirectory={preview.kind === "folder"} size={16} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{preview.title}</div>
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="shrink-0">{previewKindLabel(preview.kind)}</span>
            <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-muted-foreground/45" />
            <span className="truncate">{preview.path}</span>
          </div>
        </div>
        {preview.sourcePath && <OpenPreviewFileMenu preview={preview} />}
        {onToggleExpanded && (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
            onClick={onToggleExpanded}
            title={expanded ? "收起预览" : "展开预览"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 brevyn-scrollbar" onScroll={handlePreviewScroll}>
        {preview.summary && <div className="mb-3 rounded-lg border bg-background/70 px-3 py-2 text-[12px] leading-5 text-muted-foreground">{preview.summary}</div>}

        {preview.kind === "markdown" && preview.content && (
          <div className="rounded-lg border bg-background px-3 py-3 text-[12px] leading-6 text-foreground">
            <Markdownish content={preview.content} preserveSoftBreaks />
          </div>
        )}

        {preview.kind === "pdf" && (preview.previewUrl || preview.fileUrl) && <PdfPreviewFrame preview={preview} viewKey={previewKey} />}

        {(preview.kind === "code" || preview.kind === "text") && preview.content && (
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 px-3 py-3 text-[12px] leading-6 text-foreground">
            <code>{preview.content}</code>
          </pre>
        )}

        {preview.kind === "image" && <ImagePreviewFrame preview={preview} viewKey={previewKey} />}

        {preview.kind === "docx" && preview.html && (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background shadow-sm">
            <iframe
              className="h-full w-full bg-background"
              sandbox=""
              srcDoc={officePreviewDocument(preview.html)}
              title={preview.title}
            />
          </div>
        )}

        {preview.kind === "docx" && !preview.html && preview.content && (
          <div className="rounded-lg border bg-background px-3 py-3">
            <pre className="whitespace-pre-wrap text-[12px] leading-6 text-foreground">{preview.content}</pre>
          </div>
        )}

        {preview.kind === "pptx" && preview.html && (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background shadow-sm">
            <iframe
              className="h-full w-full bg-background"
              sandbox=""
              srcDoc={officePreviewDocument(preview.html)}
              title={preview.title}
            />
          </div>
        )}

        {preview.kind === "spreadsheet" && preview.html && (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background shadow-sm">
            <iframe
              className="h-full w-full bg-background"
              sandbox=""
              srcDoc={officePreviewDocument(preview.html)}
              title={preview.title}
            />
          </div>
        )}

        {(preview.kind === "pptx" || preview.kind === "spreadsheet") && !preview.html && preview.content && (
          <div className="rounded-lg border bg-background px-3 py-3">
            <pre className="whitespace-pre-wrap text-[12px] leading-6 text-foreground">{preview.content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPreviewFrame({ preview, viewKey }: { preview: FilePreview; viewKey: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [zoom, setZoom] = useState(() => readPreviewViewState(viewKey)?.pdfZoom || 100);
  const src = preview.previewUrl || preview.fileUrl || "";

  useEffect(() => {
    setZoom(readPreviewViewState(viewKey)?.pdfZoom || 100);
  }, [src, viewKey]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === "pdf-zoom-changed" && typeof event.data.zoom === "number") {
        setZoom(event.data.zoom);
        updatePreviewViewState(viewKey, { pdfZoom: event.data.zoom });
      }
      if (event.data?.type === "pdf-scroll-changed" && typeof event.data.scrollTop === "number") {
        updatePreviewViewState(viewKey, { pdfScrollTop: event.data.scrollTop });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [viewKey]);

  function sendPdfZoom(direction: "in" | "out" | "reset") {
    iframeRef.current?.contentWindow?.postMessage({ type: "pdf-zoom", direction }, "*");
  }

  function restorePdfView() {
    const saved = readPreviewViewState(viewKey);
    window.setTimeout(() => {
      if (saved?.pdfZoom) {
        iframeRef.current?.contentWindow?.postMessage({ type: "pdf-zoom", zoom: saved.pdfZoom }, "*");
      }
      if (saved?.pdfScrollTop) {
        iframeRef.current?.contentWindow?.postMessage({ type: "pdf-scroll", scrollTop: saved.pdfScrollTop }, "*");
      }
    }, 80);
  }

  return (
    <PreviewCanvasFrame
      toolbar={(
        <>
          <PreviewIconButton title="缩小" onClick={() => sendPdfZoom("out")}>
            <Minus className="h-3.5 w-3.5" />
          </PreviewIconButton>
          <span className="min-w-[42px] text-center font-mono text-[11px] text-muted-foreground">{zoom}%</span>
          <PreviewIconButton title="放大" onClick={() => sendPdfZoom("in")}>
            <Plus className="h-3.5 w-3.5" />
          </PreviewIconButton>
          <PreviewIconButton title="重置缩放" onClick={() => sendPdfZoom("reset")}>
            <RotateCcw className="h-3.5 w-3.5" />
          </PreviewIconButton>
        </>
      )}
    >
      <iframe ref={iframeRef} className="h-full w-full border-0 bg-background" src={src} title={preview.title} onLoad={restorePdfView} />
    </PreviewCanvasFrame>
  );
}

function ImagePreviewFrame({ preview, viewKey }: { preview: FilePreview; viewKey: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoomIndex, setZoomIndexState] = useState(() => readPreviewViewState(viewKey)?.imageZoomIndex ?? IMAGE_ZOOM_STEPS.indexOf(1));
  const zoom = IMAGE_ZOOM_STEPS[Math.max(0, zoomIndex)] || 1;
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const imageStyle = useMemo(() => ({
    width: `${zoom * 100}%`,
    maxWidth: zoom <= 1 ? "100%" : "none",
  }), [zoom]);

  useEffect(() => {
    const saved = readPreviewViewState(viewKey);
    setZoomIndexState(saved?.imageZoomIndex ?? IMAGE_ZOOM_STEPS.indexOf(1));
    const frame = window.requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = saved?.imageScrollLeft || 0;
      scrollRef.current.scrollTop = saved?.imageScrollTop || 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [preview.fileUrl, viewKey]);

  function setZoomIndex(value: number | ((current: number) => number)) {
    setZoomIndexState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      updatePreviewViewState(viewKey, { imageZoomIndex: next });
      return next;
    });
  }

  function handleImageScroll() {
    if (!scrollRef.current) return;
    updatePreviewViewState(viewKey, {
      imageScrollLeft: scrollRef.current.scrollLeft,
      imageScrollTop: scrollRef.current.scrollTop,
    });
  }

  if (!preview.fileUrl) {
    return (
      <div className="overflow-hidden rounded-lg border bg-background p-2">
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">图片源不可用。</div>
      </div>
    );
  }

  return (
    <PreviewCanvasFrame
      toolbar={(
        <>
          <PreviewIconButton title="缩小" onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}>
            <Minus className="h-3.5 w-3.5" />
          </PreviewIconButton>
          <span className="min-w-[42px] text-center font-mono text-[11px] text-muted-foreground">{zoomLabel}</span>
          <PreviewIconButton title="放大" onClick={() => setZoomIndex((current) => Math.min(IMAGE_ZOOM_STEPS.length - 1, current + 1))}>
            <Plus className="h-3.5 w-3.5" />
          </PreviewIconButton>
          <PreviewIconButton title="适应宽度" onClick={() => setZoomIndex(IMAGE_ZOOM_STEPS.indexOf(1))}>
            <MoveHorizontal className="h-3.5 w-3.5" />
          </PreviewIconButton>
        </>
      )}
    >
      <div ref={scrollRef} className="flex min-h-full items-start justify-center overflow-auto bg-[hsl(var(--muted))]/25 p-4 brevyn-scrollbar" onScroll={handleImageScroll}>
        <img
          className="block rounded-md object-contain shadow-sm ring-1 ring-border/70"
          src={preview.fileUrl}
          alt={preview.title}
          style={imageStyle}
        />
      </div>
    </PreviewCanvasFrame>
  );
}

function filePreviewViewKey(preview: FilePreview): string {
  return preview.sourcePath || preview.id || preview.path;
}

function readPreviewViewState(key: string): PreviewViewState | undefined {
  const state = previewViewStates.get(key);
  if (!state) return undefined;
  previewViewStates.delete(key);
  previewViewStates.set(key, state);
  return state;
}

function updatePreviewViewState(key: string, patch: PreviewViewState): void {
  if (!key) return;
  const current = readPreviewViewState(key) || {};
  previewViewStates.set(key, { ...current, ...patch });
  while (previewViewStates.size > PREVIEW_VIEW_STATE_LIMIT) {
    const oldest = previewViewStates.keys().next().value;
    if (!oldest) break;
    previewViewStates.delete(oldest);
  }
}

function PreviewCanvasFrame({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) {
  return (
    <div className="h-[70vh] overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex h-9 items-center justify-end gap-1 border-b bg-card/75 px-2">
        {toolbar}
      </div>
      <div className="h-[calc(70vh-2.25rem)] min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function PreviewIconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function OpenPreviewFileMenu({ preview }: { preview: FilePreview }) {
  const [open, setOpen] = useState(false);
  const sourcePath = preview.sourcePath || "";
  const cacheKey = openPathOptionsCacheKey(sourcePath, preview.kind);
  const cachedOptions = cacheKey ? openPathOptionsCache.get(cacheKey) : undefined;
  const [options, setOptions] = useState<OpenPathOption[]>(() => cachedOptions || []);
  const [loading, setLoading] = useState(() => Boolean(sourcePath && !cachedOptions));
  const menuRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const primaryOption = options[0] || null;

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    if (!sourcePath) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const cached = cacheKey ? openPathOptionsCache.get(cacheKey) : undefined;
    if (cached) {
      setOptions(cached);
      setLoading(false);
      return;
    }
    setOptions([]);
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePath, cacheKey]);

  async function loadOptions() {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const nextOptions = await window.brevyn.app.openPathOptions(sourcePath);
      if (cacheKey) openPathOptionsCache.set(cacheKey, nextOptions);
      if (requestIdRef.current === requestId) setOptions(nextOptions);
    } catch {
      if (requestIdRef.current === requestId) setOptions([]);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }

  function closeMenu() {
    setOpen(false);
  }

  function toggleMenu() {
    setOpen((nextOpen) => !nextOpen);
  }

  async function openWith(option: OpenPathOption) {
    if (!sourcePath) return;
    await window.brevyn.app.openPathWith({ path: sourcePath, optionId: option.id, appPath: option.appPath });
    closeMenu();
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <div className={`flex h-7 overflow-hidden rounded-lg border bg-background/70 text-muted-foreground shadow-sm transition ${open ? "border-foreground/15 bg-muted/70 text-foreground" : "hover:border-foreground/15 hover:text-foreground"}`}>
        <button
          type="button"
          className="flex w-8 items-center justify-center transition hover:bg-muted/70"
          onClick={() => primaryOption ? void openWith(primaryOption) : toggleMenu()}
          title={primaryOption ? `打开：${primaryOption.label}` : "打开方式"}
        >
          {primaryOption ? <OpenPathOptionIcon option={primaryOption} /> : <OpenPathOptionIconPlaceholder loading={loading} />}
        </button>
        <button
          type="button"
          className="flex w-6 items-center justify-center border-l border-border/80 transition hover:bg-muted/70"
          onClick={toggleMenu}
          title="选择打开方式"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-60 overflow-hidden rounded-xl border bg-[hsl(var(--popover))] p-1 text-[12px] text-popover-foreground shadow-xl ring-1 ring-black/5" role="menu">
          <div className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">打开方式</div>
          {loading && <div className="px-2.5 py-2 text-muted-foreground">正在读取本机应用...</div>}
          {!loading && options.map((option) => (
            <button
              key={`${option.id}-${option.appPath || ""}`}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent"
              onClick={() => void openWith(option)}
              role="menuitem"
            >
              <OpenPathOptionIcon option={option} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          ))}
          {!loading && options.length === 0 && <div className="px-2.5 py-2 text-muted-foreground">没有找到可用应用。</div>}
        </div>
      )}
    </div>
  );
}

function OpenPathOptionIconPlaceholder({ loading }: { loading: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-4 w-4 rounded-[4px] bg-muted/70 ${loading ? "animate-pulse" : ""}`}
    />
  );
}

function OpenPathOptionIcon({ option }: { option: OpenPathOption }) {
  if (option.iconDataUrl) {
    return <img className="h-4 w-4 rounded-[4px]" src={option.iconDataUrl} alt="" aria-hidden="true" />;
  }
  const label = option.label.toLowerCase();
  if (option.kind === "finder") return <FolderOpen className="h-3.5 w-3.5 text-blue-500" />;
  if (option.kind === "terminal") return <Terminal className="h-3.5 w-3.5 text-emerald-500" />;
  if (label.includes("cursor") || label.includes("code") || label.includes("xcode")) return <Code2 className="h-3.5 w-3.5 text-sky-500" />;
  if (label.includes("preview")) return <ImageIcon className="h-3.5 w-3.5 text-blue-500" />;
  if (label.includes("powerpoint") || label.includes("keynote")) return <Presentation className="h-3.5 w-3.5 text-orange-500" />;
  if (label.includes("excel") || label.includes("numbers")) return <Table2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (label.includes("word") || label.includes("pages")) return <Type className="h-3.5 w-3.5 text-blue-600" />;
  return <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />;
}

function openPathOptionsCacheKey(sourcePath: string, kind: FilePreview["kind"]): string {
  if (!sourcePath) return "";
  if (kind === "folder") return "folder";
  const fileName = sourcePath.split(/[\\/]/).pop() || sourcePath;
  const dotIndex = fileName.lastIndexOf(".");
  const extension = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : "";
  return `${kind}:${extension || fileName.toLowerCase()}`;
}

function previewKindLabel(kind: FilePreview["kind"]): string {
  if (kind === "folder") return "文件夹";
  if (kind === "markdown") return "Markdown";
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "图片";
  if (kind === "code") return "代码";
  if (kind === "text") return "文本";
  if (kind === "docx") return "Word";
  if (kind === "pptx") return "演示文稿";
  if (kind === "spreadsheet") return "表格";
  return "文件";
}

function officePreviewDocument(html: string): string {
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
        padding: clamp(10px, 3vw, 24px);
        background:
          radial-gradient(circle at 20% 0%, rgba(255,255,255,.9), transparent 28rem),
          #f5f2ec;
        overflow-wrap: anywhere;
      }
      .page {
        box-sizing: border-box;
        width: min(100%, 780px);
        min-height: calc(100vh - 48px);
        margin: 0 auto;
        padding: clamp(22px, 5vw, 42px) clamp(18px, 6vw, 48px);
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
        width: max-content;
        min-width: 100%;
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
      .office-preview-title {
        margin: 0 0 18px;
        font-size: 18px;
        font-weight: 720;
        letter-spacing: -0.02em;
        color: #111827;
      }
      .office-preview-notice,
      .office-sheet-meta,
      .office-slide-index,
      .office-empty {
        color: #667085;
        font-size: 12px;
      }
      .office-preview-notice {
        margin: 0 0 12px;
        border: 1px solid rgba(31, 41, 51, 0.1);
        border-radius: 10px;
        background: rgba(245, 242, 236, 0.75);
        padding: 8px 10px;
      }
      .office-sheet,
      .office-slide {
        margin-top: 14px;
        border: 1px solid rgba(31, 41, 51, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.62);
        padding: 14px;
      }
      .office-sheet h3,
      .office-slide h3 {
        margin: 0 0 8px;
      }
      .office-table-wrap {
        margin-top: 10px;
        overflow: auto;
        border: 1px solid rgba(31, 41, 51, 0.12);
        border-radius: 10px;
        background: white;
      }
      .office-table-wrap table {
        margin: 0;
      }
      .office-table-wrap thead th {
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .office-row-heading {
        position: sticky;
        left: 0;
        z-index: 1;
        min-width: 38px;
        text-align: center;
        color: #667085;
      }
      .office-slide ul {
        margin: 10px 0 0;
        padding-left: 1.2rem;
      }
      .office-slide li + li {
        margin-top: 6px;
      }
    </style>
  </head>
  <body>
    <main class="page">${html}</main>
  </body>
</html>`;
}
