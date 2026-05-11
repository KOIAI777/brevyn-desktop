import { ChevronDown, ChevronUp } from "lucide-react";
import type { ToolCardHelpers, ToolResultBlock, WebSearchLink } from "./types";
import { CompactProcessCard } from "./shared";

export function WebToolCard({
  toolName,
  input,
  result,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: {
  toolName: string;
  input: unknown;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
} & ToolCardHelpers) {
  const data = helpers.recordObject(input);
  const isSearch = toolName === "WebSearch";
  const target = isSearch
    ? helpers.stringValue(data.query, "query")
    : helpers.stringValue(data.url, "URL");
  const running = !result;
  const output = result ? helpers.formatToolResultContent(result.content) : "";
  const links = isSearch ? parseWebSearchLinks(output, helpers) : [];
  const title = webToolTitle({ isSearch, running, isError: result?.isError, target, linkCount: links.length }, helpers);
  const status = running ? "运行中" : result?.isError ? "失败" : isSearch ? `${links.length || resultCountFromText(output)} 个结果` : "完成";

  if (collapsed) {
    return (
      <CompactProcessCard
        title={title}
        status={status}
        running={running}
        isError={result?.isError}
        onToggleCollapsed={onToggleCollapsed}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/82 px-4 py-3 text-xs text-foreground shadow-sm ring-1 ring-white/45 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {helpers.renderToolGlyph(toolName, "h-4 w-4 shrink-0 text-muted-foreground")}
          <div className="min-w-0 truncate font-medium text-muted-foreground">{title}</div>
        </div>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand web tool" : "Collapse web tool"}
        >
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {isSearch ? (
        <WebSearchSummary query={target} links={links} result={result} output={output} />
      ) : (
        <WebFetchSummary url={target} result={result} output={output} />
      )}
    </div>
  );
}

function WebSearchSummary({
  query,
  links,
  result,
  output,
}: {
  query: string;
  links: WebSearchLink[];
  result?: ToolResultBlock;
  output: string;
}) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Search</p>
      <p className="mt-1 break-words text-xs leading-5 text-foreground">"{query}"</p>
      {result && (
        <div className="mt-3 space-y-1.5">
          {links.length > 0 ? links.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 rounded-lg border bg-card/70 px-2.5 py-2 text-xs text-foreground transition hover:bg-accent/60"
              title={link.url}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {siteInitial(link)}
              </span>
              <span className="min-w-0 flex-1 truncate">{link.title || link.url}</span>
              <span className="shrink-0 truncate text-[11px] text-muted-foreground">{hostFromUrl(link.url)}</span>
            </a>
          )) : (
            <p className="text-xs text-muted-foreground">
              {result.isError ? "搜索失败，展开结果不可用。" : `${resultCountFromText(output)} 个搜索结果`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function WebFetchSummary({ url, result, output }: { url: string; result?: ToolResultBlock; output: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">URL</p>
      <p className="mt-1 break-words text-xs leading-5 text-foreground">{url}</p>
      {result && (
        <p className="mt-3 line-clamp-4 text-xs leading-5 text-muted-foreground">
          {result.isError ? "网页读取失败。" : firstMeaningfulLine(output) || "网页读取完成。"}
        </p>
      )}
    </div>
  );
}

function webToolTitle(input: { isSearch: boolean; running: boolean; isError?: boolean; target: string; linkCount: number }, helpers: ToolCardHelpers): string {
  if (input.isSearch) {
    if (input.running) return `正在搜索网络 "${helpers.singleLine(input.target)}"`;
    if (input.isError) return `搜索网络失败 "${helpers.singleLine(input.target)}"`;
    return `搜索网络 · ${input.linkCount} 个结果`;
  }
  if (input.running) return `正在读取网页 "${helpers.singleLine(input.target)}"`;
  if (input.isError) return `读取网页失败 "${helpers.singleLine(input.target)}"`;
  return `已读取网页 "${helpers.singleLine(input.target)}"`;
}

function parseWebSearchLinks(output: string, helpers: ToolCardHelpers): WebSearchLink[] {
  const match = output.match(/Links:\s*(\[[\s\S]*?\])(?:\n|$)/);
  if (!match) return [];
  try {
    const raw = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const data = helpers.recordObject(item);
      const url = helpers.stringValue(data.url, "");
      if (!url) return [];
      return [{
        title: helpers.stringValue(data.title, url),
        url,
      }];
    });
  } catch {
    return [];
  }
}

function resultCountFromText(output: string): number {
  const match = output.match(/Found\s+(\d+)\s+results?/i) || output.match(/(\d+)\s+results?/i);
  if (!match) return 0;
  const count = Number.parseInt(match[1] || "0", 10);
  return Number.isFinite(count) ? count : 0;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function siteInitial(link: WebSearchLink): string {
  const host = hostFromUrl(link.url);
  return (host || link.title || "W").slice(0, 1).toUpperCase();
}

function firstMeaningfulLine(output: string): string {
  return output.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("{") && !line.startsWith("[")) || "";
}
