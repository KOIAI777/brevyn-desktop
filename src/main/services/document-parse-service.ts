import type { IndexingWorkerResult } from "../indexing";
import type { ParsedIndexingFile } from "../indexing/parsers";
import type { WorkspaceFileKind } from "../../types/domain";

interface DocumentParseEnhanceInput {
  sourcePath: string;
  kind: WorkspaceFileKind;
  parsed?: ParsedIndexingFile;
  result: IndexingWorkerResult;
  fileName?: string;
}

export class DocumentParseService {
  async enhanceIndexingResult(input: DocumentParseEnhanceInput): Promise<IndexingWorkerResult | null> {
    if (!shouldRunDocumentParse(input)) return null;
    // Provider adapters will plug in here (MinerU async parse, Aliyun file extract, etc.).
    return null;
  }
}

function shouldRunDocumentParse(input: DocumentParseEnhanceInput): boolean {
  if (!isDocumentParseCandidate(input.kind)) return false;
  return Boolean(input.parsed?.coverage?.needsOcr || input.parsed?.assets?.some((asset) => asset.needsOcr));
}

function isDocumentParseCandidate(kind: WorkspaceFileKind): boolean {
  return kind === "pdf" || kind === "docx" || kind === "pptx" || kind === "spreadsheet";
}
