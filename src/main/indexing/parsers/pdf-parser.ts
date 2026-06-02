import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CoverageStatus, ParsedIndexingFile, ParsedIndexingSection, ParseInput } from "./types";
import { capParsedText, collectConsoleWarnings, dedupeWarnings, emptyParsedFile, errorMessage, normalizeText, withTimeout } from "./utils";

const require = createRequire(__filename);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer) => Promise<{
  numpages?: number;
  numrender?: number;
  text?: string;
}>;

const PDF_PARSE_TIMEOUT_MS = 30_000;

export async function parsePdf(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  try {
    return await withTimeout(parsePdfPages(input, byteCount), PDF_PARSE_TIMEOUT_MS, "PDF text extraction timed out.");
  } catch (error) {
    return parsePdfFallback(input, byteCount, errorMessage(error));
  }
}

async function parsePdfPages(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  const parsed = await collectConsoleWarnings(() => parsePdfPagesWithPdfjs(input, byteCount));
  const warnings = [
    ...parsed.result.warnings,
    ...parsed.warnings.filter((warning) => !isIgnorablePdfjsWarning(warning)),
  ];
  return {
    ...parsed.result,
    warnings: dedupeWarnings(warnings),
  };
}

async function parsePdfPagesWithPdfjs(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(__dirname, "pdfjs", "pdf.worker.min.mjs")).href;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(input.sourcePath)),
    disableFontFace: true,
    isEvalSupported: false,
    standardFontDataUrl: pathToFileURL(`${join(__dirname, "pdfjs", "standard_fonts")}/`).href,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  const sections: ParsedIndexingSection[] = [];
  const warnings: string[] = [];
  let indexedPages = 0;
  let emptyPages = 0;
  let failedPages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      try {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = normalizeText(content.items
          .map((item) => "str" in item && typeof item.str === "string" ? item.str : "")
          .filter(Boolean)
          .join(" "));
        page.cleanup();
        if (text) {
          indexedPages += 1;
          const sectionText = `Page ${pageNumber}\n${repairPdfTextSpacing(text)}`;
          parts.push(sectionText);
          sections.push({
            text: sectionText,
            sourceLabel: `第 ${pageNumber} 页`,
            sectionType: "page",
            sectionIndex: pageNumber,
          });
        } else {
          emptyPages += 1;
        }
      } catch (error) {
        failedPages += 1;
        warnings.push(`Page ${pageNumber} text extraction failed: ${errorMessage(error)}`);
      }
    }
  } finally {
    await pdf.destroy();
  }

  const text = normalizeText(parts.join("\n\n"));
  if (!text) {
    warnings.push("No extractable PDF text was found. This may be a scanned PDF; OCR indexing is not enabled yet.");
  }
  if (failedPages > 0) {
    warnings.push(`${failedPages} PDF pages could not be parsed.`);
  }
  if (emptyPages > 0 && indexedPages > 0) {
    warnings.push(`${emptyPages} PDF pages had no extractable text.`);
  }
  const capped = capParsedText(text, warnings);
  const coverageStatus: CoverageStatus = !normalizeText(capped.text)
    ? "skipped"
    : failedPages > 0 || emptyPages > 0 || capped.truncated
      ? "partial"
      : "complete";
  return {
    text: normalizeText(capped.text),
    byteCount,
    warnings: dedupeWarnings(warnings),
    metadata: {
      parser: "pdfjs-dist",
      kind: input.kind,
      pages: pdf.numPages,
      sectionsTotal: pdf.numPages,
      sectionsIndexed: indexedPages,
      sectionsEmpty: emptyPages,
      sectionsFailed: failedPages,
      sectionUnit: "页",
      coverageStatus,
      truncated: capped.truncated,
    },
    sections: sections.length > 0 ? sections : undefined,
  };
}

function isIgnorablePdfjsWarning(warning: string): boolean {
  return warning.includes("Cannot access the `require` function") ||
    warning.includes("Cannot polyfill `DOMMatrix`") ||
    warning.includes("Cannot polyfill `ImageData`") ||
    warning.includes("Cannot polyfill `Path2D`") ||
    warning.includes("standardFontDataUrl") ||
    warning.includes("Unable to load font data");
}

async function parsePdfFallback(input: ParseInput, byteCount: number, primaryError: string): Promise<ParsedIndexingFile> {
  const warnings: string[] = [`PDF page-by-page extraction failed: ${primaryError}`];
  let parsed: { result: Awaited<ReturnType<typeof pdfParse>>; warnings: string[] };
  try {
    parsed = await collectConsoleWarnings(() => pdfParse(readFileSync(input.sourcePath)));
  } catch (error) {
    return emptyParsedFile(input, byteCount, `PDF text extraction failed: ${primaryError}; fallback failed: ${errorMessage(error)}`);
  }
  const { result } = parsed;
  warnings.push(...parsed.warnings);
  const text = repairPdfTextSpacing(result.text || "");
  if (!normalizeText(text)) {
    warnings.push("No extractable PDF text was found. This may be a scanned PDF; OCR indexing is not enabled yet.");
  }
  const capped = capParsedText(text, warnings);
  const normalized = normalizeText(capped.text);
  return {
    text: normalized,
    byteCount,
    warnings: dedupeWarnings(warnings),
    metadata: {
      parser: "pdf-parse-fallback",
      kind: input.kind,
      pages: result.numpages || result.numrender || 0,
      renderedPages: result.numrender || 0,
      coverageStatus: normalized ? "partial" : "skipped",
      truncated: capped.truncated,
    },
    sections: normalized
      ? [{ text: normalized, sourceLabel: "PDF 文本", sectionType: "document", sectionIndex: 1 }]
      : undefined,
  };
}

function repairPdfTextSpacing(value: string): string {
  return value
    .replace(/\b([A-Z][a-z]{2,})(for|and|of|to|in|with|from|by|the)(?=[A-Z])/g, "$1 $2 ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/([:;,.])(?=\S)/g, "$1 ");
}
