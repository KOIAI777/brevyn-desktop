import type { ToolCardHelpers, ToolResultBlock, WebSearchLink } from "./types";
import { CompactProcessCard, DeferredToolDetails } from "./shared";

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
  const hosted = data.hosted === true;
  const hostedQuery = webSearchQueryFromInput(data, helpers);
  const target = isSearch
    ? hostedQuery || helpers.stringValue(data.query, "query")
    : helpers.stringValue(data.url, "URL");
  const running = !result && data.status !== "completed";
  const output = result ? helpers.formatToolResultContent(result.content) : "";
  const links = isSearch ? parseWebSearchLinks(result?.content, output, helpers) : [];
  const title = webToolTitle({ isSearch, hosted, running, isError: result?.isError, target, linkCount: links.length }, helpers);
  const status = running ? "运行中" : result?.isError ? "失败" : hosted ? "完成" : isSearch ? `${links.length || resultCountFromText(output)} 个结果` : "完成";
  const heading = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {helpers.renderToolGlyph(toolName, "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0 truncate">{title}</span>
    </span>
  );

  return (
    <div className="overflow-hidden text-xs text-foreground">
      <CompactProcessCard
        title={heading}
        status={status}
        running={running}
        isError={result?.isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className={`${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"} grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out`}>
        <div className="min-h-0 overflow-hidden">
          <DeferredToolDetails collapsed={collapsed} defer={!running}>
            {isSearch ? (
              <WebSearchSummary query={target} links={links} result={result} output={output} hosted={hosted} />
            ) : (
              <WebFetchSummary url={target} result={result} output={output} />
            )}
          </DeferredToolDetails>
        </div>
      </div>
    </div>
  );
}

function WebSearchSummary({
  query,
  links,
  result,
  output,
  hosted,
}: {
  query: string;
  links: WebSearchLink[];
  result?: ToolResultBlock;
  output: string;
  hosted?: boolean;
}) {
  return (
    <div className="px-1 py-1 [contain:layout_paint_style] [content-visibility:auto] [contain-intrinsic-size:180px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Search</p>
      <p className="mt-1 break-words text-xs leading-5 text-foreground">"{query}"</p>
      {hosted && !result && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          OpenAI Responses hosted web search 已完成，搜索结果会由模型在正文里引用。
        </p>
      )}
      {result && (
        <div className="mt-3 space-y-1.5">
          {links.length > 0 ? links.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground transition hover:bg-accent/45"
              title={link.url}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {siteInitial(link)}
              </span>
              <span className="min-w-0 flex-1 truncate">{link.title || link.url}</span>
              <span className="shrink-0 truncate text-[11px] text-muted-foreground">{hostFromUrl(link.url)}</span>
            </a>
          )) : hosted ? (
            <p className="text-xs text-muted-foreground">
              Hosted web search 已完成，暂无可展示引用链接。
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {result.isError ? "搜索失败，展开结果不可用。" : `${resultCountFromText(output)} 个搜索结果`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function webSearchQueryFromInput(data: Record<string, unknown>, helpers: ToolCardHelpers): string {
  const direct = helpers.stringValue(data.query, "");
  if (direct) return direct;
  const queries = Array.isArray(data.queries) ? data.queries : [];
  for (const query of queries) {
    if (typeof query === "string" && query.trim()) return query.trim();
    const object = helpers.recordObject(query);
    const value = helpers.stringValue(object.query ?? object.search_query ?? object.text, "");
    if (value) return value;
  }
  return "";
}

function WebFetchSummary({ url, result, output }: { url: string; result?: ToolResultBlock; output: string }) {
  return (
    <div className="px-1 py-1">
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

function webToolTitle(input: { isSearch: boolean; hosted?: boolean; running: boolean; isError?: boolean; target: string; linkCount: number }, helpers: ToolCardHelpers): string {
  if (input.isSearch) {
    if (input.hosted && input.running) return input.target === "query" ? "正在通过 hosted web search 搜索网络" : `正在通过 hosted web search 搜索 "${helpers.singleLine(input.target)}"`;
    if (input.hosted) return input.target === "query" ? "Hosted web search 已完成" : `Hosted web search · ${helpers.singleLine(input.target)}`;
    if (input.running) return `正在搜索网络 "${helpers.singleLine(input.target)}"`;
    if (input.isError) return `搜索网络失败 "${helpers.singleLine(input.target)}"`;
    return `搜索网络 · ${input.linkCount} 个结果`;
  }
  if (input.running) return `正在读取网页 "${helpers.singleLine(input.target)}"`;
  if (input.isError) return `读取网页失败 "${helpers.singleLine(input.target)}"`;
  return `已读取网页 "${helpers.singleLine(input.target)}"`;
}

function parseWebSearchLinks(content: unknown, output: string, helpers: ToolCardHelpers): WebSearchLink[] {
  const structured = linksFromStructuredContent(content, helpers);
  if (structured.length > 0) return structured;
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

function linksFromStructuredContent(content: unknown, helpers: ToolCardHelpers): WebSearchLink[] {
  const data = helpers.recordObject(content);
  const links = Array.isArray(data.links) ? data.links : [];
  return links.flatMap((item) => {
    const link = helpers.recordObject(item);
    const url = helpers.stringValue(link.url, "");
    if (!url) return [];
    return [{
      title: helpers.stringValue(link.title, url),
      url,
    }];
  });
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
