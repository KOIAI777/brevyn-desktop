import type { WorkspaceFileKind } from "../../../types/domain";

export interface ParsedIndexingFile {
  text: string;
  byteCount: number;
  warnings: string[];
  metadata: Record<string, string | number | boolean>;
  sections?: ParsedIndexingSection[];
}

export type CoverageStatus = "complete" | "partial" | "skipped";

export interface ParsedIndexingSection {
  text: string;
  sourceLabel: string;
  title?: string;
  sectionType?: string;
  sectionIndex?: number;
}

export interface ParseInput {
  sourcePath: string;
  kind: WorkspaceFileKind;
}
