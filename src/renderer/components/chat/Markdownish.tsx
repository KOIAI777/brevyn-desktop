import { Children, cloneElement, isValidElement, memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FilePathChip, isFilePathLike } from "./FilePathChip";

const remarkPlugins = [remarkGfm];
const LONG_MARKDOWN_CODE_LIMIT = 16_000;
const LONG_MARKDOWN_CODE_LINES = 220;
const STREAM_BLOCK_FREEZE_MIN_CHARS = 1_800;
const STREAM_BLOCK_FREEZE_MIN_BLOCKS = 3;

type MarkdownNode = {
  position?: {
    start?: {
      line?: number;
      column?: number;
      offset?: number;
    };
  };
};

type MarkdownComponentProps<T extends keyof JSX.IntrinsicElements> = ComponentProps<T> & {
  node?: MarkdownNode;
};

interface MarkdownishProps {
  content: string;
  threadId?: string;
  preserveSoftBreaks?: boolean;
  streaming?: boolean;
}

type RenderMarkdownChildren = (children: ReactNode, path: string) => ReactNode;
interface StreamingMarkdownBlock {
  key: string;
  content: string;
}

const passthroughChildren: RenderMarkdownChildren = (children) => children;

export const Markdownish = memo(function Markdownish({
  content,
  threadId,
  preserveSoftBreaks = false,
  streaming = false,
}: MarkdownishProps) {
  if (streaming) {
    return (
      <StreamingMarkdownishRenderer
        content={content}
        preserveSoftBreaks={preserveSoftBreaks}
        threadId={threadId}
      />
    );
  }

  return (
    <StaticMarkdownishRenderer
      content={content}
      preserveSoftBreaks={preserveSoftBreaks}
      threadId={threadId}
    />
  );
});

const StaticMarkdownishRenderer = memo(function StaticMarkdownishRenderer({
  content,
  threadId,
  preserveSoftBreaks,
}: Required<Pick<MarkdownishProps, "content" | "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">) {
  const components = useMemo(
    () => createMarkdownComponents({ preserveSoftBreaks, renderChildren: passthroughChildren, threadId }),
    [preserveSoftBreaks, threadId],
  );

  return <MarkdownishFrame content={content} components={components} />;
}, areMarkdownishRenderPropsEqual);

const StreamingMarkdownishRenderer = memo(function StreamingMarkdownishRenderer({
  content,
  threadId,
  preserveSoftBreaks,
}: Required<Pick<MarkdownishProps, "content" | "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">) {
  const blocks = useMemo(() => splitStreamingMarkdownBlocks(content), [content]);
  if (shouldFreezeStreamingBlocks(content, blocks)) {
    return (
      <StreamingBlockMarkdownishRenderer
        blocks={blocks}
        preserveSoftBreaks={preserveSoftBreaks}
        threadId={threadId}
      />
    );
  }

  return (
    <InlineStreamingMarkdownishRenderer
      content={content}
      preserveSoftBreaks={preserveSoftBreaks}
      threadId={threadId}
    />
  );
}, areMarkdownishRenderPropsEqual);

const StreamingBlockMarkdownishRenderer = memo(function StreamingBlockMarkdownishRenderer({
  blocks,
  threadId,
  preserveSoftBreaks,
}: {
  blocks: StreamingMarkdownBlock[];
} & Required<Pick<MarkdownishProps, "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">) {
  return (
    <div className="markdownish-stream-blocks">
      {blocks.map((block, index) => {
        const streaming = index === blocks.length - 1;
        return (
          <div key={block.key} className="markdownish-stream-block">
            {streaming ? (
              <InlineStreamingMarkdownishRenderer
                content={block.content}
                preserveSoftBreaks={preserveSoftBreaks}
                threadId={threadId}
              />
            ) : (
              <StaticMarkdownishRenderer
                content={block.content}
                preserveSoftBreaks={preserveSoftBreaks}
                threadId={threadId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}, areStreamingBlockRenderPropsEqual);

const InlineStreamingMarkdownishRenderer = memo(function InlineStreamingMarkdownishRenderer({
  content,
  threadId,
  preserveSoftBreaks,
}: Required<Pick<MarkdownishProps, "content" | "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">) {
  const previousTextByPathRef = useRef<Map<string, string>>(new Map());
  const currentTextByPathRef = useRef<Map<string, string>>(new Map());
  currentTextByPathRef.current = new Map();
  const renderChildren = useCallback((children: ReactNode, path: string): ReactNode => renderStreamingChildren(children, {
    currentTextByPath: currentTextByPathRef.current,
    path,
    previousTextByPath: previousTextByPathRef.current,
  }), []);

  useEffect(() => {
    previousTextByPathRef.current = currentTextByPathRef.current;
  });

  const components = useMemo(
    () => createMarkdownComponents({ preserveSoftBreaks, renderChildren, threadId }),
    [preserveSoftBreaks, renderChildren, threadId],
  );

  return <MarkdownishFrame content={content} components={components} />;
}, areMarkdownishRenderPropsEqual);

function shouldFreezeStreamingBlocks(content: string, blocks: StreamingMarkdownBlock[]): boolean {
  return content.length >= STREAM_BLOCK_FREEZE_MIN_CHARS && blocks.length >= STREAM_BLOCK_FREEZE_MIN_BLOCKS;
}

function splitStreamingMarkdownBlocks(content: string): StreamingMarkdownBlock[] {
  const lines = content.split("\n");
  const blocks: StreamingMarkdownBlock[] = [];
  let current: string[] = [];
  let currentStartOffset = 0;
  let lineStartOffset = 0;
  let inFence = false;

  function pushCurrent() {
    const blockContent = current.join("\n").trimEnd();
    if (blockContent.trim()) {
      blocks.push({
        key: `${currentStartOffset}:${hashString(blockContent.slice(0, 80))}`,
        content: blockContent,
      });
    }
    current = [];
  }

  for (const line of lines) {
    if (current.length === 0) currentStartOffset = lineStartOffset;
    current.push(line);

    if (isFenceLine(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") pushCurrent();

    lineStartOffset += line.length + 1;
  }

  pushCurrent();
  return blocks;
}

function isFenceLine(line: string): boolean {
  return line.trimStart().startsWith("```");
}

function areStreamingBlockRenderPropsEqual(
  previous: {
    blocks: StreamingMarkdownBlock[];
  } & Required<Pick<MarkdownishProps, "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">,
  next: {
    blocks: StreamingMarkdownBlock[];
  } & Required<Pick<MarkdownishProps, "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">,
): boolean {
  return previous.blocks.length === next.blocks.length
    && previous.preserveSoftBreaks === next.preserveSoftBreaks
    && previous.threadId === next.threadId
    && previous.blocks.every((block, index) => {
      const nextBlock = next.blocks[index];
      return Boolean(nextBlock) && block.key === nextBlock.key && block.content === nextBlock.content;
    });
}

function createMarkdownComponents({
  preserveSoftBreaks,
  renderChildren,
  threadId,
}: {
  preserveSoftBreaks: boolean;
  renderChildren: RenderMarkdownChildren;
  threadId?: string;
}) {
  return {
    h1: ({ children, node, ...props }: MarkdownComponentProps<"h1">) => (
      <h2 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0" {...props}>
        {renderChildren(children, blockPath("h1", node))}
      </h2>
    ),
    h2: ({ children, node, ...props }: MarkdownComponentProps<"h2">) => (
      <h3 className="mb-2 mt-4 text-sm font-semibold tracking-tight first:mt-0" {...props}>
        {renderChildren(children, blockPath("h2", node))}
      </h3>
    ),
    h3: ({ children, node, ...props }: MarkdownComponentProps<"h3">) => (
      <h4 className="mb-2 mt-3 text-sm font-semibold tracking-tight first:mt-0" {...props}>
        {renderChildren(children, blockPath("h3", node))}
      </h4>
    ),
    p: ({ children, node, ...props }: MarkdownComponentProps<"p">) => (
      <p className={`my-2 leading-6 first:mt-0 last:mb-0 ${preserveSoftBreaks ? "whitespace-pre-wrap" : ""}`} {...props}>
        {renderChildren(children, blockPath("p", node))}
      </p>
    ),
    ul: ({ children, ...props }: ComponentProps<"ul">) => (
      <ul className="my-2 list-disc space-y-1 pl-5 leading-6" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: ComponentProps<"ol">) => (
      <ol className="my-2 list-decimal space-y-1 pl-5 leading-6" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, node, ...props }: MarkdownComponentProps<"li">) => (
      <li className="pl-0.5" {...props}>
        {renderChildren(children, blockPath("li", node))}
      </li>
    ),
    blockquote: ({ children, ...props }: ComponentProps<"blockquote">) => (
      <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground" {...props}>
        {children}
      </blockquote>
    ),
    hr: () => null,
    a: ({ children, node, ...props }: MarkdownComponentProps<"a">) => (
      <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" {...props}>
        {renderChildren(children, blockPath("a", node))}
      </a>
    ),
    code: ({ className, children, node, ...props }: MarkdownComponentProps<"code">) => {
      const isBlock = /language-/.test(className || "");
      if (!isBlock) {
        const text = inlineText(children);
        if (text && isFilePathLike(text)) {
          return <FilePathChip filePath={text.trim()} threadId={threadId} />;
        }
        return (
          <code className="rounded-md bg-muted px-1.5 py-0.5 text-[0.92em]" {...props}>
            {renderChildren(children, blockPath("code", node))}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }: ComponentProps<"pre">) => (
      <MarkdownCodePre {...props}>{children}</MarkdownCodePre>
    ),
    table: ({ children, ...props }: ComponentProps<"table">) => (
      <div className="my-3 overflow-x-auto rounded-xl border bg-background/60">
        <table className="w-full border-collapse text-left text-xs" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: ComponentProps<"thead">) => (
      <thead className="bg-muted/45 text-muted-foreground" {...props}>
        {children}
      </thead>
    ),
    th: ({ children, node, ...props }: MarkdownComponentProps<"th">) => (
      <th className="border-b px-3 py-2 font-semibold" {...props}>
        {renderChildren(children, blockPath("th", node))}
      </th>
    ),
    tr: ({ children, ...props }: ComponentProps<"tr">) => (
      <tr className="border-b last:border-b-0" {...props}>
        {children}
      </tr>
    ),
    td: ({ children, node, ...props }: MarkdownComponentProps<"td">) => (
      <td className="px-3 py-2 align-top" {...props}>
        {renderChildren(children, blockPath("td", node))}
      </td>
    ),
  };
}

function MarkdownCodePre({ children, ...props }: ComponentProps<"pre">) {
  const [expanded, setExpanded] = useState(false);
  const text = textContent(children);
  const preview = text && !expanded ? truncateLongText(text, LONG_MARKDOWN_CODE_LIMIT, LONG_MARKDOWN_CODE_LINES) : null;
  const truncated = Boolean(preview && preview !== text);
  const renderedChildren = truncated ? replaceFirstTextChild(children, preview ?? "") : children;

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-muted/35">
      <pre className="max-h-96 overflow-auto p-3 text-[12px] leading-5 [contain:layout_paint_style]" {...props}>
        {renderedChildren}
      </pre>
      {truncated && (
        <button
          type="button"
          className="w-full border-t bg-background/75 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          展开完整代码块
        </button>
      )}
    </div>
  );
}

function MarkdownishFrame({ content, components }: { content: string; components: ComponentProps<typeof Markdown>["components"] }) {
  return (
    <div className="markdownish break-words text-sm leading-6">
      <Markdown
        remarkPlugins={remarkPlugins}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}

function areMarkdownishRenderPropsEqual(
  previous: Required<Pick<MarkdownishProps, "content" | "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">,
  next: Required<Pick<MarkdownishProps, "content" | "preserveSoftBreaks">> & Pick<MarkdownishProps, "threadId">,
): boolean {
  return previous.content === next.content
    && previous.preserveSoftBreaks === next.preserveSoftBreaks
    && previous.threadId === next.threadId;
}

function StreamingInlineText({ previousText, text }: { previousText: string; text: string }) {
  const canAnimateDelta = text.startsWith(previousText);
  const stableText = canAnimateDelta ? previousText : "";
  const delta = canAnimateDelta ? text.slice(previousText.length) : text;
  const deltaChars = Array.from(delta);

  if (!deltaChars.length) return stableText;
  return (
    <>
      {stableText}
      {deltaChars.map((char, index) => (
        <span
          key={`${index}-${char}`}
          className="brevyn-stream-inline-char"
          style={{ animationDelay: `${Math.min(index, 18) * 5}ms` }}
        >
          {char}
        </span>
      ))}
    </>
  );
}

interface RenderStreamingChildrenOptions {
  currentTextByPath: Map<string, string>;
  path: string;
  previousTextByPath: Map<string, string>;
}

function renderStreamingChildren(children: ReactNode, options: RenderStreamingChildrenOptions): ReactNode {
  return Children.map(children, (child, index) => {
    const childPath = `${options.path}-${index}`;
    if (typeof child === "string" || typeof child === "number") {
      const text = String(child);
      const previousText = previousTextForPath(options.previousTextByPath, childPath, text);
      options.currentTextByPath.set(childPath, text);
      return <StreamingInlineText key={childPath} previousText={previousText} text={text} />;
    }
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ children?: ReactNode }>;
    if (!("children" in element.props)) return child;
    return cloneElement(element, {
      children: renderStreamingChildren(element.props.children, { ...options, path: childPath }),
    });
  });
}

function blockPath(kind: string, node?: MarkdownNode): string {
  const start = node?.position?.start;
  return `${kind}:${start?.offset ?? `${start?.line ?? 0}:${start?.column ?? 0}`}`;
}

function previousTextForPath(previousTextByPath: Map<string, string>, path: string, text: string): string {
  const direct = previousTextByPath.get(path);
  if (typeof direct === "string") return direct;

  let best = "";
  for (const previousText of previousTextByPath.values()) {
    if (text.startsWith(previousText) && previousText.length > best.length) {
      best = previousText;
    } else if (previousText.startsWith(text) && text.length > best.length) {
      best = text;
    }
  }
  return best;
}

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(inlineText).join("");
  return "";
}

function textContent(value: ReactNode): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement(value)) {
    const element = value as ReactElement<{ children?: ReactNode }>;
    return textContent(element.props.children);
  }
  return "";
}

function replaceFirstTextChild(value: ReactNode, text: string): ReactNode {
  if (typeof value === "string" || typeof value === "number") return text;
  if (Array.isArray(value)) {
    let replaced = false;
    return value.map((child) => {
      if (replaced) return child;
      const next = replaceFirstTextChild(child, text);
      replaced = next !== child;
      return next;
    });
  }
  if (isValidElement(value)) {
    const element = value as ReactElement<{ children?: ReactNode }>;
    if (!("children" in element.props)) return value;
    const nextChildren = replaceFirstTextChild(element.props.children, text);
    if (nextChildren === element.props.children) return value;
    return cloneElement(element, { children: nextChildren });
  }
  return value;
}

function truncateLongText(value: string, maxChars: number, maxLines: number): string {
  if (value.length <= maxChars && lineCount(value) <= maxLines) return value;
  const byChars = value.slice(0, maxChars);
  const lines = byChars.split("\n");
  const preview = lines.length > maxLines ? lines.slice(0, maxLines).join("\n") : byChars;
  return `${preview.trimEnd()}\n\n... 已截断长内容，展开后查看完整内容`;
}

function lineCount(value: string): number {
  let count = 1;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}
