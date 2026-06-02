import { parentPort, workerData } from "node:worker_threads";
import type { IndexingChunkMetadata, IndexingTaskRecord, IndexingWorkerResult } from "./indexing-types";
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
  const chunked = chunkParsedText(parsed);

  return {
    fileId: payload.fileId,
    sourcePath: payload.sourcePath,
    chunkCount: chunked.chunks.length,
    charCount: text.length,
    byteCount: parsed.byteCount,
    sample: chunked.chunks[0]?.slice(0, 900) || text.slice(0, 900),
    warnings: parsed.warnings,
    chunks: chunked.chunks,
    chunkMetadata: chunked.metadata,
    metadata: parsed.metadata,
  };
}

function chunkParsedText(parsed: Awaited<ReturnType<typeof parseIndexingFile>>): { chunks: string[]; metadata: IndexingChunkMetadata[] } {
  const sections = parsed.sections?.filter((section) => section.text.trim());
  if (!sections || sections.length === 0) {
    const chunks = chunkText(parsed.text);
    return { chunks, metadata: chunks.map(() => ({})) };
  }

  const boundedSections = trimSectionsToCharCount(sections, parsed.text.length);
  const chunks: string[] = [];
  const metadata: IndexingChunkMetadata[] = [];
  for (const section of boundedSections) {
    const sectionChunks = chunkText(section.text);
    sectionChunks.forEach((chunk, index) => {
      chunks.push(chunk);
      metadata.push({
        sourceLabel: section.sourceLabel,
        title: section.title,
        sectionType: section.sectionType,
        sectionIndex: section.sectionIndex,
        chunkInSection: index + 1,
        chunksInSection: sectionChunks.length,
      });
    });
  }
  return { chunks, metadata };
}

function trimSectionsToCharCount<T extends { text: string }>(sections: T[], maxChars: number): T[] {
  if (maxChars <= 0) return [];
  const result: T[] = [];
  let remaining = maxChars;
  for (const section of sections) {
    if (remaining <= 0) break;
    if (section.text.length <= remaining) {
      result.push(section);
      remaining -= section.text.length;
      continue;
    }
    result.push({ ...section, text: section.text.slice(0, remaining) });
    break;
  }
  return result;
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
