import type { ToolCardHelpers } from "./types";
import { PreviewBlock, PreviewPill } from "./shared";

export function ToolInputPreview({
  toolName,
  input,
  compact = false,
  ...helpers
}: {
  toolName: string;
  input: unknown;
  compact?: boolean;
} & ToolCardHelpers) {
  const data = helpers.recordObject(input);
  const path = helpers.stringValue(data.file_path ?? data.path, "");
  const command = helpers.stringValue(data.command, "");
  const url = helpers.stringValue(data.url, "");
  const query = helpers.stringValue(data.query, "");
  const pattern = helpers.stringValue(data.pattern, "");
  const content = data.content ?? data.new_string ?? data.new_text ?? data.edits ?? data.todos ?? input;

  if (toolName === "Bash" && command) {
    return (
      <PreviewBlock label="Command" value={command} language="bash" compact={compact} truncatePreview={helpers.truncatePreview} />
    );
  }

  if ((toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") && path) {
    return (
      <div className="mt-2 space-y-2">
        <PreviewPill label="Path" value={path} />
        <PreviewBlock label={toolName === "Write" ? "Content" : "Change"} value={helpers.formatUnknown(content)} compact={compact} truncatePreview={helpers.truncatePreview} />
      </div>
    );
  }

  if ((toolName === "Read" || toolName === "Glob" || toolName === "Grep") && (path || pattern)) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {path && <PreviewPill label="Path" value={path} />}
        {pattern && <PreviewPill label="Pattern" value={pattern} />}
      </div>
    );
  }

  if (toolName === "WebFetch" && url) {
    return <PreviewPill label="URL" value={url} />;
  }

  if (toolName === "WebSearch" && query) {
    return <PreviewPill label="Query" value={query} />;
  }

  return <PreviewBlock label="Input" value={helpers.formatUnknown(input)} compact={compact} truncatePreview={helpers.truncatePreview} />;
}
