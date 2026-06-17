import { getParsedToolResult, recordObject, stringValue, type ToolResultBlock } from "@/components/agent/tool-cards/toolModel";

export interface RagEvidence {
  fileId?: string;
  fileName: string;
  path: string;
  sectionKind?: string;
  taskId?: string;
  chunkIndex?: number;
  chunkCount?: number;
  score?: number;
  text: string;
  citation?: string;
}

export interface AnswerEvidenceSource extends RagEvidence {
  key: string;
  label: string;
  count: number;
  snippets: RagEvidence[];
}

export function parseRagEvidenceOutput(result: ToolResultBlock | undefined): { count: number; results: RagEvidence[] } {
  if (!result) return { count: 0, results: [] };
  const root = recordObject(getParsedToolResult(result));
  const rawResults = Array.isArray(root.results) ? root.results : [];
  const results = rawResults.flatMap((item) => {
    const record = recordObject(item);
    const fileName = stringValue(record.fileName, stringValue(record.file_name, ""));
    const path = stringValue(record.path, "");
    const citation = stringValue(record.citation, "");
    const text = stringValue(record.text, stringValue(record.excerpt, ""));
    if (!fileName && !path && !citation && !text) return [];
    return [{
      fileId: stringValue(record.fileId ?? record.file_id, ""),
      fileName,
      path,
      sectionKind: stringValue(record.sectionKind ?? record.section_kind, ""),
      taskId: stringValue(record.taskId ?? record.task_id, ""),
      chunkIndex: numberValue(record.chunkIndex ?? record.chunk_index),
      chunkCount: numberValue(record.chunkCount ?? record.chunk_count),
      score: numberValue(record.score),
      text,
      citation,
    }];
  });
  return {
    count: numberValue(root.count) ?? results.length,
    results,
  };
}

export function buildAnswerEvidenceSources(
  evidence: RagEvidence[],
  options: { maxSources?: number; maxSnippetsPerSource?: number } = {},
): AnswerEvidenceSource[] {
  const maxSources = options.maxSources ?? 6;
  const maxSnippetsPerSource = options.maxSnippetsPerSource ?? 2;
  const byKey = new Map<string, AnswerEvidenceSource>();

  for (const item of evidence) {
    const key = evidenceKey(item);
    const existing = byKey.get(key);
    const nextSnippet = normalizeEvidence(item);
    if (!existing) {
      byKey.set(key, {
        ...nextSnippet,
        key,
        label: evidenceLabel(nextSnippet),
        count: 1,
        snippets: [nextSnippet],
      });
      continue;
    }

    const snippets = [...existing.snippets, nextSnippet]
      .sort(compareEvidenceByScore)
      .slice(0, maxSnippetsPerSource);
    const best = snippets[0] ?? existing;
    byKey.set(key, {
      ...existing,
      ...best,
      key,
      label: existing.label,
      count: existing.count + 1,
      snippets,
    });
  }

  return [...byKey.values()]
    .sort(compareEvidenceByScore)
    .slice(0, maxSources);
}

function normalizeEvidence(item: RagEvidence): RagEvidence {
  return {
    ...item,
    fileName: item.fileName || basename(item.path) || item.citation || "课程材料",
    path: item.path || "",
    citation: item.citation || "",
    text: item.text || item.citation || "",
  };
}

function evidenceKey(item: RagEvidence): string {
  return [
    item.fileId,
    item.path,
    item.fileName,
    item.citation,
  ].find((value) => value && value.trim()) || item.text.slice(0, 80) || "evidence";
}

function evidenceLabel(item: RagEvidence): string {
  return item.fileName || basename(item.path) || compactCitation(item.citation || "") || "课程材料";
}

function compactCitation(citation: string): string {
  const firstPart = citation.split(" · ")[0]?.trim() || citation.trim();
  return basename(firstPart) || firstPart;
}

function basename(path: string): string {
  const value = path.trim();
  if (!value) return "";
  return value.split(/[\\/]/).filter(Boolean).pop() || value;
}

function compareEvidenceByScore(left: Pick<RagEvidence, "score">, right: Pick<RagEvidence, "score">): number {
  return (right.score ?? -1) - (left.score ?? -1);
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
