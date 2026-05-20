export function parsePartialToolInput(value: string): unknown | null {
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return partialToolInputHints(text);
  }
}

function partialToolInputHints(text: string): Record<string, string> | null {
  const hints: Record<string, string> = {};
  for (const key of ["file_path", "filePath", "path", "command", "pattern", "query", "url", "skillId"]) {
    const value = partialJsonStringField(text, key);
    if (value) hints[key] = value;
  }
  return Object.keys(hints).length > 0 ? hints : null;
}

function partialJsonStringField(text: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`).exec(text);
  if (!match?.[1]) return "";
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\").trim();
  }
}
