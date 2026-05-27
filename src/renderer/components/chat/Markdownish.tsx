import { Children, cloneElement, isValidElement, memo, useCallback, useEffect, useMemo, useRef, type ComponentProps, type ReactElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FilePathChip, isFilePathLike } from "./FilePathChip";

const remarkPlugins = [remarkGfm];

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
      <pre className="my-3 max-h-96 overflow-auto rounded-xl border bg-muted/35 p-3 text-[12px] leading-5" {...props}>
        {children}
      </pre>
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
