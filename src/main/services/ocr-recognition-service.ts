import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import type { IndexingWorkerResult } from "../indexing";
import { chunkParsedText } from "../indexing/chunking";
import { normalizeText, type ParsedIndexingFile } from "../indexing/parsers";
import type { ParsedIndexingSection } from "../indexing/parsers/types";
import { dedupeWarnings } from "../indexing/parsers/utils";
import { extractMultimodalText, multimodalEndpoint, multimodalHeaders, multimodalRequestBody, type MultimodalInput } from "../providers/multimodal-request";
import type { ModelProviderConfig } from "../../types/domain";
import { ProviderService, envApiKeyForProvider } from "./provider-service";

interface OcrRecognitionServiceOptions {
  providers: ProviderService;
}

interface OcrEnhanceInput {
  sourcePath: string;
  kind: "pdf" | "image";
  parsed?: ParsedIndexingFile;
  result?: IndexingWorkerResult;
  fileName?: string;
}

const MAX_OCR_FILE_BYTES = 18 * 1024 * 1024;
const OCR_TIMEOUT_MS = 180_000;
const DOC_PARSE_MODEL_ID = "brevyn-doc-parse";
const DOCUMENT_PARSE_MODE = "precision";

export class OcrRecognitionService {
  constructor(private readonly options: OcrRecognitionServiceOptions) {}

  async enhanceIndexingResult(input: OcrEnhanceInput): Promise<IndexingWorkerResult | null> {
    if (input.kind !== "pdf" && input.kind !== "image") return null;
    if (!input.sourcePath || !existsSync(input.sourcePath)) return null;
    if (!shouldRunOcr(input)) return null;
    const provider = this.options.providers.ocrProvider();
    if (!provider) return appendOcrWarning(input.result ?? null, "OCR provider is not configured; indexed local extractable text only.");
    const apiKey = this.options.providers.apiKey(provider.id) || envApiKeyForProvider(provider);
    if (!apiKey) return appendOcrWarning(input.result ?? null, `OCR provider "${provider.name}" is missing an API key; indexed local extractable text only.`);
    const stats = statSync(input.sourcePath);
    if (stats.size > MAX_OCR_FILE_BYTES) {
      return appendOcrWarning(input.result ?? null, `OCR skipped because the file is larger than ${formatBytes(MAX_OCR_FILE_BYTES)}.`);
    }
    if (input.kind === "pdf" && provider.protocol === "openai_compatible") {
      return appendOcrWarning(input.result ?? null, "OCR skipped for this PDF because OpenAI-compatible chat providers do not have a standard PDF document input.");
    }

    try {
      const ocrText = await this.callOcrModel({
        provider,
        apiKey,
        sourcePath: input.sourcePath,
        kind: input.kind,
        fileName: input.fileName || basename(input.sourcePath),
        parsed: input.parsed,
      });
      const normalized = normalizeText(ocrText);
      if (!normalized) return appendOcrWarning(input.result ?? null, "OCR completed but returned no readable text.");
      return buildEnhancedResult(input, normalized, provider);
    } catch (error) {
      return appendOcrWarning(input.result ?? null, `OCR failed: ${errorMessage(error)}`);
    }
  }

  private async callOcrModel(input: {
    provider: ModelProviderConfig;
    apiKey: string;
    sourcePath: string;
    kind: "pdf" | "image";
    fileName: string;
    parsed?: ParsedIndexingFile;
  }): Promise<string> {
    const file = readOcrInput(input.sourcePath, input.kind, input.fileName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
    try {
      const response = await fetch(multimodalEndpoint(input.provider), {
        method: "POST",
        headers: multimodalHeaders(input.provider, input.apiKey),
        signal: controller.signal,
        body: JSON.stringify(withDocumentParseMode(input.provider, multimodalRequestBody(input.provider, file, ocrPrompt(input), 8192))),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`OCR request failed (${response.status}): ${text}`);
      return extractMultimodalText(input.provider, parseJson(text));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OCR timed out after ${Math.round(OCR_TIMEOUT_MS / 1000)}s.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function withDocumentParseMode(provider: ModelProviderConfig, body: unknown): unknown {
  if (provider.protocol !== "openai_responses") return body;
  if (provider.selectedModel.trim().toLowerCase() !== DOC_PARSE_MODEL_ID) return body;
  return {
    ...objectValue(body),
    parse_options: {
      ...objectValue(objectValue(body).parse_options),
      mode: DOCUMENT_PARSE_MODE,
      ocr: true,
      formula: true,
      table: true,
      is_ocr: true,
      enable_formula: true,
      enable_table: true,
    },
  };
}

function shouldRunOcr(input: OcrEnhanceInput): boolean {
  if (input.kind === "image") return true;
  const coverage = input.parsed?.coverage;
  if (coverage) {
    return coverage.needsOcr > 0 || coverage.status === "skipped";
  }
  const metadata = input.parsed?.metadata || input.result?.metadata || {};
  const coverageStatus = typeof metadata.coverageStatus === "string" ? metadata.coverageStatus : "";
  const sectionsEmpty = numberValue(metadata.sectionsEmpty);
  const sectionsIndexed = numberValue(metadata.sectionsIndexed);
  const chunkCount = input.result?.chunkCount ?? 0;
  return coverageStatus === "skipped" || (coverageStatus === "partial" && sectionsEmpty > 0) || (sectionsIndexed === 0 && chunkCount === 0);
}

function buildEnhancedResult(input: OcrEnhanceInput, ocrText: string, provider: ModelProviderConfig): IndexingWorkerResult {
  const parsed = mergeParsedWithOcr(input, ocrText, provider);
  const chunked = chunkParsedText(parsed);
  const base = input.result;
  return {
    fileId: base?.fileId || "",
    sourcePath: base?.sourcePath || input.sourcePath,
    chunkCount: chunked.chunks.length,
    charCount: parsed.text.length,
    byteCount: parsed.byteCount,
    sample: chunked.chunks[0]?.slice(0, 900) || parsed.text.slice(0, 900),
    warnings: parsed.warnings,
    chunks: chunked.chunks,
    chunkMetadata: chunked.metadata,
    metadata: parsed.metadata,
  };
}

function mergeParsedWithOcr(input: OcrEnhanceInput, ocrText: string, provider: ModelProviderConfig): ParsedIndexingFile {
  const parsed = input.parsed;
  const baseText = normalizeText(parsed?.text || "");
  const ocrSectionText = input.kind === "pdf"
    ? `OCR 补充文本\n${ocrText}`
    : `Image OCR\n${ocrText}`;
  const sections: ParsedIndexingSection[] = [
    ...(parsed?.sections || []),
    {
      text: ocrSectionText,
      sourceLabel: input.kind === "pdf" ? "OCR 补充" : "图片 OCR",
      title: input.kind === "pdf" ? "OCR 补充文本" : "图片文字识别",
      sectionType: input.kind === "pdf" ? "ocr" : "image_ocr",
      sectionIndex: (parsed?.sections?.length || 0) + 1,
    },
  ];
  const text = normalizeText([baseText, ocrSectionText].filter(Boolean).join("\n\n"));
  const metadata = {
    ...(parsed?.metadata || {}),
    parser: parsed?.metadata.parser ? `${parsed.metadata.parser}+ocr` : "ocr",
    coverageStatus: ocrCoverageStatus(input),
    ocrApplied: true,
    ocrProvider: provider.name,
    ocrModel: provider.selectedModel,
    ocrSections: 1,
  };
  return {
    text,
    byteCount: parsed?.byteCount || input.result?.byteCount || statSync(input.sourcePath).size,
    warnings: dedupeWarnings([
      ...(parsed?.warnings || input.result?.warnings || []),
      input.kind === "pdf" ? "OCR supplemented pages or regions without extractable text." : "Image text was extracted with OCR.",
    ]),
    metadata,
    coverage: markCoverageOcrApplied(parsed?.coverage, ocrCoverageStatus(input)),
    sections,
  };
}

function markCoverageOcrApplied(coverage: ParsedIndexingFile["coverage"], status: "complete" | "partial"): ParsedIndexingFile["coverage"] | undefined {
  if (!coverage) return undefined;
  return {
    ...coverage,
    status,
    needsOcr: 0,
    items: coverage.items?.map((item) => item.needsOcr
      ? { ...item, needsOcr: false, ocrApplied: true }
      : item),
  };
}

function ocrCoverageStatus(input: OcrEnhanceInput): "complete" | "partial" {
  if (input.kind === "image") return "complete";
  const metadata = input.parsed?.metadata || input.result?.metadata || {};
  return numberValue(metadata.sectionsFailed) > 0 ? "partial" : "complete";
}

function appendOcrWarning(result: IndexingWorkerResult | null, warning: string): IndexingWorkerResult | null {
  if (!result) return null;
  return {
    ...result,
    warnings: dedupeWarnings([...result.warnings, warning]),
  };
}

function readOcrInput(sourcePath: string, kind: "pdf" | "image", fileName: string): MultimodalInput {
  const data = readFileSync(sourcePath).toString("base64");
  if (kind === "pdf") {
    return { type: "document", mediaType: "application/pdf", data, filename: fileName };
  }
  return { type: "image", mediaType: mediaTypeForPath(sourcePath), data };
}

function ocrPrompt(input: { kind: "pdf" | "image"; fileName: string; parsed?: ParsedIndexingFile }): string {
  const existingSummary = input.parsed?.text
    ? `\nExisting local extraction already found some text. Focus on any scanned/image-only content that may be missing. Do not repeat obvious text if avoidable.\n`
    : "";
  const coverageHint = ocrCoveragePromptHint(input.parsed);
  return [
    input.kind === "pdf" ? `Extract readable text from this course PDF: ${input.fileName}.` : `Extract readable text from this image: ${input.fileName}.`,
    existingSummary,
    coverageHint,
    "Return plain Markdown only.",
    "Preserve headings, bullet lists, table-like rows, equations when readable, and page/section cues if visible.",
    "If a region is unreadable, write [unreadable] briefly instead of inventing content.",
    "Do not add commentary about the OCR process.",
  ].filter(Boolean).join("\n");
}

function ocrCoveragePromptHint(parsed?: ParsedIndexingFile): string {
  const items = parsed?.coverage?.items?.filter((item) => item.needsOcr) || [];
  if (items.length === 0) return "";
  const labels = items
    .slice(0, 16)
    .map((item) => `${item.sourceLabel}${item.reason ? ` (${item.reason})` : ""}`)
    .join(", ");
  const suffix = items.length > 16 ? `, and ${items.length - 16} more` : "";
  return `Local parsing marked these pages/sections as needing OCR: ${labels}${suffix}. Focus on recovering their missing text and visual content.`;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`OCR provider returned invalid JSON: ${value.slice(0, 300)}`);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mediaTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function numberValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
