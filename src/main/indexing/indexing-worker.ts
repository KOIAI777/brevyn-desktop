import { readFileSync, statSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import type { IndexingTaskRecord, IndexingWorkerResult } from "./indexing-types";

const TEXT_KINDS = new Set(["markdown", "code", "text"]);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const CHUNK_SIZE = 3_600;
const CHUNK_OVERLAP = 300;

function run(task: IndexingTaskRecord): IndexingWorkerResult {
  const payload = task.payload;
  if (!payload.sourcePath) {
    throw new Error(`No local source path is available for ${payload.name}. Re-import the file before indexing.`);
  }

  const stats = statSync(payload.sourcePath);
  if (!TEXT_KINDS.has(payload.kind)) {
    return {
      fileId: payload.fileId,
      sourcePath: payload.sourcePath,
      chunkCount: 0,
      charCount: 0,
      byteCount: stats.size,
      sample: "",
      warnings: [`${payload.kind.toUpperCase()} parser is not enabled yet; queued worker support is ready for the parser adapter.`],
      metadata: {
        parser: "unsupported-binary-placeholder",
        kind: payload.kind,
      },
    };
  }

  const bytesToRead = Math.min(stats.size, MAX_TEXT_BYTES);
  const buffer = readFileSync(payload.sourcePath);
  const raw = buffer.subarray(0, bytesToRead).toString("utf8");
  const text = normalizeText(raw);
  const chunks = chunkText(text);
  const truncated = stats.size > MAX_TEXT_BYTES;

  return {
    fileId: payload.fileId,
    sourcePath: payload.sourcePath,
    chunkCount: chunks.length,
    charCount: text.length,
    byteCount: stats.size,
    sample: chunks[0]?.slice(0, 900) || text.slice(0, 900),
    warnings: truncated ? [`Read first ${MAX_TEXT_BYTES} bytes only; full-file parsing will move to streaming parser mode.`] : [],
    metadata: {
      parser: "plain-text",
      kind: payload.kind,
      truncated,
    },
  };
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function chunkText(text: string): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + CHUNK_SIZE);
    const softEnd = findSoftBoundary(text, start, hardEnd);
    const chunk = text.slice(start, softEnd).trim();
    if (chunk) chunks.push(chunk);
    if (softEnd >= text.length) break;
    start = Math.max(softEnd - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

function findSoftBoundary(text: string, start: number, hardEnd: number): number {
  if (hardEnd >= text.length) return text.length;
  const window = text.slice(start, hardEnd);
  const paragraphBreak = window.lastIndexOf("\n\n");
  if (paragraphBreak > CHUNK_SIZE * 0.55) return start + paragraphBreak;
  const lineBreak = window.lastIndexOf("\n");
  if (lineBreak > CHUNK_SIZE * 0.65) return start + lineBreak;
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("。"), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (sentence > CHUNK_SIZE * 0.7) return start + sentence + 1;
  return hardEnd;
}

try {
  const result = run(workerData as IndexingTaskRecord);
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
