import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { extname } from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import type { WorkspaceFileKind } from "../../types/domain";

export interface ParsedIndexingFile {
  text: string;
  byteCount: number;
  warnings: string[];
  metadata: Record<string, string | number | boolean>;
}

interface ParseInput {
  sourcePath: string;
  kind: WorkspaceFileKind;
}

const TEXT_KINDS = new Set<WorkspaceFileKind>(["markdown", "code", "text"]);
const MAX_TEXT_BYTES = 50 * 1024 * 1024;
const MAX_PARSED_CHARS = 900_000;

export async function parseIndexingFile(input: ParseInput): Promise<ParsedIndexingFile> {
  const stats = statSync(input.sourcePath);
  if (TEXT_KINDS.has(input.kind)) {
    return parsePlainText(input, stats.size);
  }
  if (input.kind === "docx") {
    return parseDocx(input, stats.size);
  }
  if (input.kind === "pdf") {
    return parsePdf(input, stats.size);
  }
  if (input.kind === "pptx") {
    return parsePptx(input, stats.size);
  }
  if (input.kind === "image") {
    return emptyParsedFile(input, stats.size, "Image multimodal indexing is reserved for the vision parser adapter.");
  }
  return emptyParsedFile(input, stats.size, `${input.kind.toUpperCase()} parser is not enabled for RAG indexing yet.`);
}

export function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function parsePlainText(input: ParseInput, byteCount: number): ParsedIndexingFile {
  const bytesToRead = Math.min(byteCount, MAX_TEXT_BYTES);
  const raw = readFilePrefix(input.sourcePath, bytesToRead).toString("utf8");
  const warnings: string[] = [];
  const byteTruncated = byteCount > MAX_TEXT_BYTES;
  if (byteTruncated) warnings.push(`Read first ${formatBytes(MAX_TEXT_BYTES)} only; streaming text parsing is still pending.`);
  const capped = capParsedText(raw, warnings);
  return {
    text: normalizeText(capped.text),
    byteCount,
    warnings,
    metadata: {
      parser: "plain-text",
      kind: input.kind,
      truncated: byteTruncated || capped.truncated,
      bytesRead: bytesToRead,
    },
  };
}

function readFilePrefix(sourcePath: string, bytesToRead: number): Buffer {
  if (bytesToRead <= 0) return Buffer.alloc(0);
  const buffer = Buffer.allocUnsafe(bytesToRead);
  let fd: number | undefined;
  try {
    fd = openSync(sourcePath, "r");
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, 0);
    return bytesRead === bytesToRead ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

async function parseDocx(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  if (extname(input.sourcePath).toLowerCase() === ".doc") {
    return emptyParsedFile(input, byteCount, "Legacy .doc files need conversion to .docx before local text extraction.");
  }

  const result = await mammoth.extractRawText({ path: input.sourcePath });
  const warnings = result.messages.map((message) => message.message).filter(Boolean);
  const capped = capParsedText(result.value, warnings);
  return {
    text: normalizeText(capped.text),
    byteCount,
    warnings,
    metadata: {
      parser: "mammoth",
      kind: input.kind,
      truncated: capped.truncated,
    },
  };
}

async function parsePdf(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  const warnings: string[] = [];
  const result = await pdfParse(readFileSync(input.sourcePath));
  const capped = capParsedText(result.text || "", warnings);
  return {
    text: normalizeText(capped.text),
    byteCount,
    warnings,
    metadata: {
      parser: "pdf-parse",
      kind: input.kind,
      pages: result.numpages || result.numrender || 0,
      renderedPages: result.numrender || 0,
      truncated: capped.truncated,
    },
  };
}

async function parsePptx(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  if (extname(input.sourcePath).toLowerCase() === ".ppt") {
    return emptyParsedFile(input, byteCount, "Legacy .ppt files need conversion to .pptx before local text extraction.");
  }

  const zip = await JSZip.loadAsync(readFileSync(input.sourcePath));
  const slideFiles = sortedZipFiles(zip, /^ppt\/slides\/slide\d+\.xml$/);
  const noteFiles = sortedZipFiles(zip, /^ppt\/notesSlides\/notesSlide\d+\.xml$/);
  const parts: string[] = [];

  for (const file of slideFiles) {
    const text = extractPptxXmlText(await file.async("string"));
    if (text) parts.push(`Slide ${numberFromPath(file.name)}\n${text}`);
  }

  for (const file of noteFiles) {
    const text = extractPptxXmlText(await file.async("string"));
    if (text) parts.push(`Speaker notes ${numberFromPath(file.name)}\n${text}`);
  }

  const warnings: string[] = [];
  const capped = capParsedText(parts.join("\n\n"), warnings);
  return {
    text: normalizeText(capped.text),
    byteCount,
    warnings,
    metadata: {
      parser: "pptx-jszip",
      kind: input.kind,
      slides: slideFiles.length,
      notes: noteFiles.length,
      truncated: capped.truncated,
    },
  };
}

function sortedZipFiles(zip: JSZip, pattern: RegExp): JSZip.JSZipObject[] {
  return Object.values(zip.files)
    .filter((file) => !file.dir && pattern.test(file.name))
    .sort((a, b) => numberFromPath(a.name) - numberFromPath(b.name));
}

function extractPptxXmlText(xml: string): string {
  const fragments: string[] = [];
  const tagPattern = /<(?:a|m):t\b[^>]*>([\s\S]*?)<\/(?:a|m):t>/g;
  for (const match of xml.matchAll(tagPattern)) {
    const value = decodeXml(match[1] || "").trim();
    if (value) fragments.push(value);
  }
  return normalizeText(fragments.join("\n"));
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function numberFromPath(path: string): number {
  const match = path.match(/(\d+)(?=\.xml$)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function capParsedText(text: string, warnings: string[]): { text: string; truncated: boolean } {
  if (text.length <= MAX_PARSED_CHARS) {
    return { text, truncated: false };
  }
  warnings.push(`Parsed text was capped at ${MAX_PARSED_CHARS} characters for this indexing pass.`);
  return { text: text.slice(0, MAX_PARSED_CHARS), truncated: true };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function emptyParsedFile(input: ParseInput, byteCount: number, warning: string): ParsedIndexingFile {
  return {
    text: "",
    byteCount,
    warnings: [warning],
    metadata: {
      parser: "unsupported",
      kind: input.kind,
      truncated: false,
    },
  };
}
