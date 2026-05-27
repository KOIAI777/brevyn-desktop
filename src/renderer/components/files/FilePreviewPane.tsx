import { ChevronDown, Code2, Eye, ExternalLink, FileSearch, FolderOpen, ImageIcon, Maximize2, Minimize2, Presentation, Table2, Terminal, Type } from "lucide-react";
import type { FilePreview, OpenPathOption } from "@/types/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdownish } from "@/components/chat/Markdownish";
import { FileTypeIcon } from "./FileTypeIcon";

const openPathOptionsCache = new Map<string, OpenPathOption[]>();

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
  const [activeSheetName, setActiveSheetName] = useState("");
  const activeSheet = useMemo(() => {
    if (!preview?.sheets?.length) return null;
    return preview.sheets.find((sheet) => sheet.name === activeSheetName) || preview.sheets[0] || null;
  }, [activeSheetName, preview?.sheets]);

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
          <div className="w-full max-w-[18rem] rounded-2xl border border-dashed border-border/80 bg-background/55 px-4 py-5 text-center shadow-sm ring-1 ring-white/45">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3 brevyn-scrollbar">
        {preview.summary && <div className="mb-3 rounded-lg border bg-background/70 px-3 py-2 text-[12px] leading-5 text-muted-foreground">{preview.summary}</div>}

        {preview.kind === "markdown" && preview.content && (
          <div className="rounded-lg border bg-background px-3 py-3 text-[12px] leading-6 text-foreground">
            <Markdownish content={preview.content} preserveSoftBreaks />
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
              <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">图片源不可用。</div>
            )}
          </div>
        )}

        {preview.kind === "docx" && preview.html && (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background shadow-sm">
            <iframe
              className="h-full w-full bg-background"
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

        {preview.kind === "spreadsheet" && preview.sheets && (
          <SpreadsheetPreview
            preview={preview}
            activeSheetName={activeSheet?.name || ""}
            onSelectSheet={setActiveSheetName}
          />
        )}

        {preview.pages && (
          <div className="space-y-2">
            {preview.pages.map((page, index) => (
              <div key={`${page}-${index}`} className="rounded-lg border bg-background px-3 py-3">
                <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{preview.kind === "pptx" ? `幻灯片 ${index + 1}` : `页面 ${index + 1}`}</span>
                  <span>预览</span>
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

function SpreadsheetPreview({
  preview,
  activeSheetName,
  onSelectSheet,
}: {
  preview: FilePreview;
  activeSheetName: string;
  onSelectSheet: (name: string) => void;
}) {
  const sheets = preview.sheets || [];
  const activeSheet = sheets.find((sheet) => sheet.name === activeSheetName) || sheets[0];
  if (!activeSheet) {
    return (
      <div className="rounded-lg border border-dashed bg-background/65 px-4 py-8 text-center text-xs text-muted-foreground">
        没有可预览的表格单元格。
      </div>
    );
  }
  const columnCount = Math.max(activeSheet.totalColumns, ...activeSheet.rows.map((row) => row.length), 1);
  const visibleColumnCount = Math.min(columnCount, 40);
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-2 brevyn-scrollbar">
        {sheets.map((sheet) => (
          <button
            key={sheet.name}
            type="button"
            className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              sheet.name === activeSheet.name ? "border-foreground/25 bg-card text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-card/80 hover:text-foreground"
            }`}
            onClick={() => onSelectSheet(sheet.name)}
            title={`${sheet.name} · ${sheet.totalRows} 行 × ${sheet.totalColumns} 列`}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-b bg-card/50 px-3 py-2 text-[10px] text-muted-foreground">
        <span>
          {activeSheet.totalRows} 行 × {activeSheet.totalColumns} 列
        </span>
        {activeSheet.truncated && <span>仅显示前 120 行 × 40 列</span>}
      </div>
      <div className="max-h-[68vh] overflow-auto brevyn-scrollbar">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-r bg-muted/95 px-2 py-1.5 text-center font-medium">#</th>
              {Array.from({ length: visibleColumnCount }, (_, index) => (
                <th key={index} className="min-w-28 border-b border-r px-2 py-1.5 font-medium">
                  {spreadsheetColumnName(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={visibleColumnCount + 1}>
                  空工作表
                </td>
              </tr>
            ) : (
              activeSheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="odd:bg-background even:bg-muted/20">
                  <th className="sticky left-0 z-10 border-b border-r bg-inherit px-2 py-1.5 text-center font-medium text-muted-foreground">{rowIndex + 1}</th>
                  {Array.from({ length: visibleColumnCount }, (_, columnIndex) => {
                    const value = row[columnIndex];
                    return (
                      <td key={columnIndex} className="max-w-64 border-b border-r px-2 py-1.5 align-top text-foreground">
                        <span className="block max-w-64 truncate" title={value == null ? "" : String(value)}>
                          {value == null ? "" : String(value)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function spreadsheetColumnName(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
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
        max-width: 100%;
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
