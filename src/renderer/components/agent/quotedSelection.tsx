import { FileText, MessageSquareQuote, X } from "lucide-react";
import type { ReactElement } from "react";

export const MAX_QUOTED_SELECTION_CHARS = 2000;

interface AgentQuotedSelectionBase {
  id: string;
  threadId: string;
  text: string;
  capturedAt: number;
}

export interface AgentQuotedFileSelection extends AgentQuotedSelectionBase {
  kind: "file";
  filePath: string;
  fileName: string;
}

export interface AgentQuotedMessageSelection extends AgentQuotedSelectionBase {
  kind: "message";
  role: "user" | "assistant";
  label: string;
}

export type AgentQuotedSelection = AgentQuotedFileSelection | AgentQuotedMessageSelection;

export interface ParsedAgentQuote {
  kind: "file" | "message";
  path: string;
  filename: string;
  role?: "user" | "assistant";
}

const quotedFileRegex = /<quoted_file[^>]*>[\s\S]*?<\/quoted_file>\n*/g;
const quotedMessageRegex = /<quoted_message[^>]*>[\s\S]*?<\/quoted_message>\n*/g;

export function quoteSelectionId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `quote_${randomId}` : `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createQuotedSelection(input: {
  threadId: string;
  text: string;
  filePath: string;
  capturedAt?: number;
}): AgentQuotedSelection {
  const filePath = input.filePath.trim();
  return {
    id: quoteSelectionId(),
    kind: "file",
    threadId: input.threadId,
    text: input.text.slice(0, MAX_QUOTED_SELECTION_CHARS),
    filePath,
    fileName: fileName(filePath),
    capturedAt: input.capturedAt || Date.now(),
  };
}

export function createQuotedMessageSelection(input: {
  threadId: string;
  text: string;
  role: "user" | "assistant";
  capturedAt?: number;
}): AgentQuotedSelection {
  return {
    id: quoteSelectionId(),
    kind: "message",
    threadId: input.threadId,
    text: input.text.slice(0, MAX_QUOTED_SELECTION_CHARS),
    role: input.role,
    label: input.role === "user" ? "用户消息" : "Brevyn 回复",
    capturedAt: input.capturedAt || Date.now(),
  };
}

export function promptWithQuotedSelection(prompt: string, quote?: AgentQuotedSelection | null): string {
  if (!quote?.text.trim()) return prompt;
  return `${quotedSelectionBlock(quote)}\n\n${prompt}`.trim();
}

export function parseQuotedSelections(content: string): { quotes: ParsedAgentQuote[]; text: string } {
  const quotes: ParsedAgentQuote[] = [];
  let match: RegExpExecArray | null;
  while ((match = quotedFileRegex.exec(content)) !== null) {
    const pathMatch = match[0].match(/path="([^"]*)"/);
    if (!pathMatch?.[1]) continue;
    const path = decodeXmlAttribute(pathMatch[1]);
    quotes.push({ kind: "file", path, filename: fileName(path) });
  }
  while ((match = quotedMessageRegex.exec(content)) !== null) {
    const roleMatch = match[0].match(/role="([^"]*)"/);
    const role = roleMatch?.[1] === "user" ? "user" : "assistant";
    quotes.push({
      kind: "message",
      path: "",
      filename: role === "user" ? "用户消息" : "Brevyn 回复",
      role,
    });
  }
  return {
    quotes,
    text: stripQuotedSelections(content),
  };
}

export function stripQuotedSelections(content: string): string {
  return content
    .replace(quotedFileRegex, "")
    .replace(quotedMessageRegex, "")
    .trim();
}

export function QuotedSelectionChip({
  quote,
  removable = false,
  onRemove,
}: {
  quote: AgentQuotedSelection | ParsedAgentQuote;
  removable?: boolean;
  onRemove?: () => void;
}): ReactElement {
  const kind = quote.kind;
  const filename = quoteLabel(quote);
  const path = quotePath(quote);
  const text = "text" in quote ? quote.text : "";
  const title = text ? `${filename}${path ? `\n${path}` : ""}\n\n${text}` : path || filename;
  return (
    <span
      className="group/quote relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-lg border border-border/70 bg-background/68 py-1.5 pl-3 pr-1 text-[11px] font-medium text-foreground shadow-[inset_0_1px_0_hsl(var(--background)/0.65)] ring-1 ring-background/45 transition hover:border-primary/24 hover:bg-accent/42"
      title={title}
    >
      <span className="absolute inset-y-1 left-1 w-0.5 rounded-full bg-primary/45" />
      <span className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-foreground/[0.055] text-muted-foreground">
        {kind === "message" ? <MessageSquareQuote className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/75">
          {kind === "message" ? "对话引用" : "文件引用"}
        </span>
        <span className="max-w-44 truncate text-foreground/90">{filename}</span>
      </span>
      {"text" in quote && <span className="shrink-0 rounded-md bg-foreground/[0.055] px-1.5 py-0.5 text-[10px] text-muted-foreground">{quote.text.trim().length} 字</span>}
      {removable && (
        <button
          type="button"
          className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
          onClick={onRemove}
          aria-label={`Remove quoted selection from ${filename}`}
          title="移除引用"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function quoteLabel(quote: AgentQuotedSelection | ParsedAgentQuote): string {
  if (quote.kind === "message") {
    if ("label" in quote) return quote.label;
    return quote.role === "user" ? "用户消息" : "Brevyn 回复";
  }
  if ("fileName" in quote) return quote.fileName;
  return quote.filename;
}

export function quotePath(quote: AgentQuotedSelection | ParsedAgentQuote): string {
  if (quote.kind === "message") return "";
  if ("filePath" in quote) return quote.filePath;
  return quote.path;
}

function quotedSelectionBlock(quote: AgentQuotedSelection): string {
  if (quote.kind === "message") {
    const safeText = quote.text.replace(/<\/quoted_message>/gi, "</quoted_message_>");
    return `<quoted_message thread_id="${quote.threadId}" role="${quote.role}">\n${safeText}\n</quoted_message>`;
  }
  const safePath = quote.filePath
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const safeText = quote.text.replace(/<\/quoted_file>/gi, "</quoted_file_>");
  return `<quoted_file path="${safePath}">\n${safeText}\n</quoted_file>`;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function fileName(filePath: string): string {
  const normalized = filePath.trim().replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) || filePath.trim();
}
