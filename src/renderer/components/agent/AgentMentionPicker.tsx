import { X } from "lucide-react";
import type { WorkspaceFileKind, WorkspaceFileNode } from "@/types/domain";

export function MentionSuggestions({
  files,
  onSelect,
}: {
  files: WorkspaceFileNode[];
  onSelect: (file: WorkspaceFileNode) => void;
}) {
  return (
    <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-white/55 bg-card/95 p-1.5 shadow-[0_16px_44px_rgba(64,55,38,0.16)] ring-1 ring-border/35 backdrop-blur-2xl brevyn-scrollbar">
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-accent/70"
          onClick={() => onSelect(file)}
        >
          <FileKindBadge kind={file.kind} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-foreground">{file.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{file.path}</span>
          </span>
          {file.sizeLabel && <span className="shrink-0 text-[10px] text-muted-foreground">{file.sizeLabel}</span>}
        </button>
      ))}
    </div>
  );
}

export function MentionedFileChips({
  files,
  onRemove,
}: {
  files: WorkspaceFileNode[];
  onRemove: (fileId: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background/65 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-accent"
          title={file.path}
          onClick={() => onRemove(file.id)}
        >
          <FileKindBadge kind={file.kind} />
          <span className="max-w-40 truncate">@{file.name}</span>
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function FileKindBadge({ kind }: { kind: WorkspaceFileKind }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border bg-background/70 px-1 text-[9px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
      {fileKindLabel(kind)}
    </span>
  );
}

export function flattenMentionableFiles(files: WorkspaceFileNode[]): WorkspaceFileNode[] {
  const result: WorkspaceFileNode[] = [];
  const visit = (node: WorkspaceFileNode) => {
    if (node.children?.length) {
      node.children.forEach(visit);
      return;
    }
    result.push(node);
  };
  files.forEach(visit);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function filterMentionSuggestions(files: WorkspaceFileNode[], query: string | null): WorkspaceFileNode[] {
  if (query === null) return [];
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? files.filter((file) => `${file.name} ${file.path}`.toLowerCase().includes(normalized))
    : files;
  return filtered.slice(0, 8);
}

export function currentMentionQuery(value: string): string | null {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1] || "" : null;
}

export function replaceCurrentMention(value: string, label: string): string {
  return value.replace(/(^|\s)@([^\s@]*)$/, (_match, prefix: string) => `${prefix}@${label} `);
}

export function buildPromptWithMentions(prompt: string, files: WorkspaceFileNode[]): string {
  if (files.length === 0) return prompt;
  const refs = files
    .map((file) => `- ${file.name}: ${file.sourcePath || file.path}`)
    .join("\n");
  return `<attached_files>\n${refs}\n</attached_files>\n\n${prompt}`;
}

function fileKindLabel(kind: WorkspaceFileKind): string {
  if (kind === "markdown") return "MD";
  if (kind === "image") return "IMG";
  if (kind === "unknown") return "FILE";
  return kind;
}
