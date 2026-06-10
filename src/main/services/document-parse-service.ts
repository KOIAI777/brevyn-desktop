import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { IndexingWorkerResult } from "../indexing";
import { chunkParsedText } from "../indexing/chunking";
import type { ParsedIndexingFile } from "../indexing/parsers";
import { normalizeText } from "../indexing/parsers";
import { dedupeWarnings } from "../indexing/parsers/utils";
import { extractMultimodalText, multimodalEndpoint, multimodalHeaders } from "../providers/multimodal-request";
import type { ModelProviderConfig } from "../../types/domain";
import type { WorkspaceFileKind } from "../../types/domain";
import { ProviderService, envApiKeyForProvider } from "./provider-service";

interface DocumentParseEnhanceInput {
  sourcePath: string;
  kind: WorkspaceFileKind;
  parsed?: ParsedIndexingFile;
  result: IndexingWorkerResult;
  fileName?: string;
}

interface DocumentParseServiceOptions {
  providers: ProviderService;
}

const DOC_PARSE_TIMEOUT_MS = 900_000;
const MAX_DOCUMENT_PARSE_FILE_BYTES = 200 * 1024 * 1024;
const DOC_PARSE_MODEL_ID = "brevyn-doc-parse";
const PPTX_DOC_PARSE_MODE = "precision";

export class DocumentParseService {
  constructor(private readonly options: DocumentParseServiceOptions) {}

  async enhanceIndexingResult(input: DocumentParseEnhanceInput): Promise<IndexingWorkerResult | null> {
    if (!shouldRunDocumentParse(input)) return null;
    if (!input.sourcePath || !existsSync(input.sourcePath)) return null;
    const provider = this.documentParseProvider();
    if (!provider) return null;
    const apiKey = this.options.providers.apiKey(provider.id) || envApiKeyForProvider(provider);
    if (!apiKey) return null;
    const stats = statSync(input.sourcePath);
    if (stats.size > MAX_DOCUMENT_PARSE_FILE_BYTES) {
      return appendDocumentParseWarning(input.result, `MinerU document parsing skipped because the file is larger than ${formatBytes(MAX_DOCUMENT_PARSE_FILE_BYTES)}.`);
    }

    try {
      const parsedText = await this.callDocumentParser({
        provider,
        apiKey,
        sourcePath: input.sourcePath,
        fileName: input.fileName || basename(input.sourcePath),
      });
      const normalized = normalizeText(parsedText);
      if (!normalized) return appendDocumentParseWarning(input.result, "MinerU document parsing completed but returned empty Markdown.");
      return buildDocumentParsedResult(input, normalized, provider, stats.size);
    } catch (error) {
      return appendDocumentParseWarning(input.result, `MinerU document parsing failed: ${errorMessage(error)}`);
    }
  }

  private documentParseProvider(): ModelProviderConfig | undefined {
    const provider = this.options.providers.ocrProvider();
    if (!provider || provider.protocol !== "openai_responses") return undefined;
    if (provider.selectedModel.trim().toLowerCase() !== DOC_PARSE_MODEL_ID) return undefined;
    return provider;
  }

  private async callDocumentParser(input: {
    provider: ModelProviderConfig;
    apiKey: string;
    sourcePath: string;
    fileName: string;
  }): Promise<string> {
    const data = readFileSync(input.sourcePath).toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOC_PARSE_TIMEOUT_MS);
    try {
      const response = await fetch(multimodalEndpoint(input.provider), {
        method: "POST",
        headers: multimodalHeaders(input.provider, input.apiKey),
        signal: controller.signal,
        body: JSON.stringify({
          model: input.provider.selectedModel,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    "Parse this course PowerPoint into clean Markdown for retrieval indexing.",
                    "Preserve slide headings, tables, equations, bullet hierarchy, and visible OCR text.",
                    "Return Markdown only; do not add commentary about the parsing process.",
                  ].join("\n"),
                },
                {
                  type: "input_file",
                  filename: input.fileName,
                  file_data: `data:${pptxMediaType()};base64,${data}`,
                },
              ],
            },
          ],
          parse_options: {
            mode: PPTX_DOC_PARSE_MODE,
            ocr: true,
            formula: true,
            table: true,
            is_ocr: true,
            enable_formula: true,
            enable_table: true,
          },
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`document parse request failed (${response.status}): ${text}`);
      return extractMultimodalText(input.provider, parseJson(text));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`document parse timed out after ${Math.round(DOC_PARSE_TIMEOUT_MS / 1000)}s.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function shouldRunDocumentParse(input: DocumentParseEnhanceInput): boolean {
  if (input.kind !== "pptx") return false;
  const metadata = input.parsed?.metadata || input.result.metadata || {};
  return metadata.coverageStatus === "partial" || input.parsed?.coverage?.status === "partial";
}

function buildDocumentParsedResult(input: DocumentParseEnhanceInput, markdown: string, provider: ModelProviderConfig, byteCount: number): IndexingWorkerResult {
  const parsed: ParsedIndexingFile = {
    text: markdown,
    byteCount,
    warnings: [],
    metadata: {
      ...(input.parsed?.metadata || {}),
      parser: "mineru",
      localParser: String(input.parsed?.metadata?.parser || input.result.metadata?.parser || ""),
      coverageStatus: "complete",
      sectionsTotal: 0,
      sectionsIndexed: 0,
      sectionsEmpty: 0,
      sectionsFailed: 0,
      assetsNeedingOcr: 0,
      imageOnlySlides: 0,
      truncated: false,
      documentParseApplied: true,
      documentParseProvider: provider.name,
      documentParseModel: provider.selectedModel,
      documentParseMode: PPTX_DOC_PARSE_MODE,
      documentParseReplacedLocalPartial: true,
    },
    sections: [
      {
        text: markdown,
        sourceLabel: "MinerU Markdown",
        title: input.fileName || basename(input.sourcePath),
        sectionType: "document_parse",
        sectionIndex: 1,
      },
    ],
    coverage: input.parsed?.coverage
      ? {
          ...input.parsed.coverage,
          status: "complete",
          indexed: input.parsed.coverage.total || input.parsed.coverage.indexed,
          empty: 0,
          needsOcr: 0,
          items: input.parsed.coverage.items?.map((item) => ({
            ...item,
            hasText: true,
            needsOcr: false,
            ocrApplied: item.needsOcr || item.ocrApplied,
          })),
        }
      : undefined,
  };
  const chunked = chunkParsedText(parsed);
  return {
    fileId: input.result.fileId,
    sourcePath: input.result.sourcePath || input.sourcePath,
    chunkCount: chunked.chunks.length,
    charCount: markdown.length,
    byteCount,
    sample: chunked.chunks[0]?.slice(0, 900) || markdown.slice(0, 900),
    warnings: [],
    chunks: chunked.chunks,
    chunkMetadata: chunked.metadata,
    metadata: parsed.metadata,
  };
}

function appendDocumentParseWarning(result: IndexingWorkerResult | null, warning: string): IndexingWorkerResult | null {
  if (!result) return null;
  return {
    ...result,
    warnings: dedupeWarnings([...result.warnings, warning]),
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`document parser returned invalid JSON: ${value.slice(0, 300)}`);
  }
}

function pptxMediaType(): string {
  return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
