import { parentPort, workerData } from "node:worker_threads";
import type { IndexingTaskRecord, IndexingWorkerResult } from "./indexing-types";
import { parseIndexingFile } from "./file-parser-adapter";

const CHUNK_SIZE = 3_600;
const CHUNK_OVERLAP = 300;

async function run(task: IndexingTaskRecord): Promise<IndexingWorkerResult> {
  const payload = task.payload;
  if (!payload.sourcePath) {
    throw new Error(`No local source path is available for ${payload.name}. Re-import the file before indexing.`);
  }

  const parsed = await parseIndexingFile({
    sourcePath: payload.sourcePath,
    kind: payload.kind,
  });
  const text = parsed.text;
  const chunks = chunkText(text);

  return {
    fileId: payload.fileId,
    sourcePath: payload.sourcePath,
    chunkCount: chunks.length,
    charCount: text.length,
    byteCount: parsed.byteCount,
    sample: chunks[0]?.slice(0, 900) || text.slice(0, 900),
    warnings: parsed.warnings,
    chunks,
    metadata: parsed.metadata,
  };
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

void run(workerData as IndexingTaskRecord)
  .then((result) => {
    parentPort?.postMessage({ ok: true, result });
  })
  .catch((error) => {
    parentPort?.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });
