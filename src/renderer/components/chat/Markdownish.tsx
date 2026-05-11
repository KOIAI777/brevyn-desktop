import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FilePathChip, isFilePathLike } from "./FilePathChip";

const remarkPlugins = [remarkGfm];

export function Markdownish({ content, threadId }: { content: string; threadId?: string }) {
  return (
    <div className="markdownish break-words text-sm leading-6">
      <Markdown
        remarkPlugins={remarkPlugins}
        components={{
          h1: ({ children, ...props }) => (
            <h2 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0" {...props}>
              {children}
            </h2>
          ),
          h2: ({ children, ...props }) => (
            <h3 className="mb-2 mt-4 text-sm font-semibold tracking-tight first:mt-0" {...props}>
              {children}
            </h3>
          ),
          h3: ({ children, ...props }) => (
            <h4 className="mb-2 mt-3 text-sm font-semibold tracking-tight first:mt-0" {...props}>
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p className="my-2 leading-6 first:mt-0 last:mb-0" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 leading-6" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 leading-6" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="pl-0.5" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground" {...props}>
              {children}
            </blockquote>
          ),
          hr: () => null,
          a: ({ children, ...props }) => (
            <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" {...props}>
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className || "");
            if (!isBlock) {
              const text = inlineText(children);
              if (text && isFilePathLike(text)) {
                return <FilePathChip filePath={text.trim()} threadId={threadId} />;
              }
              return (
                <code className="rounded-md bg-muted px-1.5 py-0.5 text-[0.92em]" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre className="my-3 max-h-96 overflow-auto rounded-xl border bg-muted/35 p-3 text-[12px] leading-5" {...props}>
              {children}
            </pre>
          ),
          table: ({ children, ...props }) => (
            <div className="my-3 overflow-x-auto rounded-xl border bg-background/60">
              <table className="w-full border-collapse text-left text-xs" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-muted/45 text-muted-foreground" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th className="border-b px-3 py-2 font-semibold" {...props}>
              {children}
            </th>
          ),
          tr: ({ children, ...props }) => (
            <tr className="border-b last:border-b-0" {...props}>
              {children}
            </tr>
          ),
          td: ({ children, ...props }) => (
            <td className="px-3 py-2 align-top" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(inlineText).join("");
  return "";
}
