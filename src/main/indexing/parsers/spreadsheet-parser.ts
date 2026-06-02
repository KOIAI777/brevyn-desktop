import { readFileSync } from "node:fs";
import { extname, posix as pathPosix } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import type { CoverageStatus, ParsedIndexingFile, ParsedIndexingSection, ParseInput } from "./types";
import { capParsedText, dedupeWarnings, emptyParsedFile, normalizeText, readFilePrefix } from "./utils";

const MAX_DELIMITED_BYTES = 50 * 1024 * 1024;
const MAX_SPREADSHEET_SHEETS = 32;
const MAX_SPREADSHEET_ROWS_PER_SHEET = 2_000;
const MAX_SPREADSHEET_COLUMNS = 80;

export async function parseSpreadsheet(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  const extension = extname(input.sourcePath).toLowerCase();
  if (extension === ".xls") {
    return emptyParsedFile(input, byteCount, "Legacy .xls files need conversion to .xlsx before local table extraction.");
  }
  if (extension === ".csv" || extension === ".tsv") {
    return parseDelimitedSpreadsheet(input, byteCount, extension === ".tsv" ? "\t" : ",");
  }
  return parseXlsx(input, byteCount);
}

function parseDelimitedSpreadsheet(input: ParseInput, byteCount: number, delimiter: "," | "\t"): ParsedIndexingFile {
  const bytesToRead = Math.min(byteCount, MAX_DELIMITED_BYTES);
  const raw = readFilePrefix(input.sourcePath, bytesToRead).toString("utf8");
  const warnings: string[] = [];
  const rows = parseDelimitedRows(raw, delimiter);
  const totalRows = rows.length;
  const truncatedRows = totalRows > MAX_SPREADSHEET_ROWS_PER_SHEET;
  const visibleRows = rows.slice(0, MAX_SPREADSHEET_ROWS_PER_SHEET);
  const maxColumns = Math.max(...visibleRows.map((row) => row.length), 0);
  const truncatedColumns = maxColumns > MAX_SPREADSHEET_COLUMNS;
  const normalizedRows = visibleRows
    .map((row, index) => formatSpreadsheetRow(index + 1, row.slice(0, MAX_SPREADSHEET_COLUMNS)))
    .filter(Boolean);

  if (byteCount > MAX_DELIMITED_BYTES) warnings.push(`Read first ${formatDelimitedSize(MAX_DELIMITED_BYTES)} only; streaming spreadsheet parsing is still pending.`);
  if (truncatedRows) warnings.push(`Only the first ${MAX_SPREADSHEET_ROWS_PER_SHEET} spreadsheet rows were indexed.`);
  if (truncatedColumns) warnings.push(`Only the first ${MAX_SPREADSHEET_COLUMNS} spreadsheet columns were indexed.`);
  if (normalizedRows.length === 0) warnings.push("No extractable spreadsheet text was found.");

  const capped = capParsedText(normalizedRows.join("\n"), warnings);
  const normalized = normalizeText(capped.text);
  const sourceLabel = delimiter === "\t" ? "TSV 表格" : "CSV 表格";
  const coverageStatus: CoverageStatus = !normalized
    ? "skipped"
    : byteCount > MAX_DELIMITED_BYTES || truncatedRows || truncatedColumns || capped.truncated
      ? "partial"
      : "complete";

  return {
    text: normalized,
    byteCount,
    warnings: dedupeWarnings(warnings),
    metadata: {
      parser: delimiter === "\t" ? "tsv-text" : "csv-text",
      kind: input.kind,
      sheets: 1,
      rows: totalRows,
      columns: maxColumns,
      sectionsTotal: totalRows,
      sectionsIndexed: normalizedRows.length,
      sectionsEmpty: 0,
      sectionsFailed: 0,
      sectionUnit: "行",
      coverageStatus,
      truncated: byteCount > MAX_DELIMITED_BYTES || truncatedRows || truncatedColumns || capped.truncated,
    },
    sections: normalized
      ? [{ text: normalized, sourceLabel, title: sourceLabel, sectionType: "sheet", sectionIndex: 1 }]
      : undefined,
  };
}

async function parseXlsx(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  const zip = await JSZip.loadAsync(readFileSync(input.sourcePath));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!workbookXml) {
    return emptyParsedFile(input, byteCount, "XLSX workbook.xml was not found. The file may be damaged or unsupported.");
  }

  const workbookDoc = parseXml(workbookXml);
  const relationships = await parseRelationships(zip, "xl/_rels/workbook.xml.rels", "xl");
  const sharedStrings = await parseXlsxSharedStrings(zip);
  const dateStyleIndexes = await parseXlsxDateStyleIndexes(zip);
  const workbookSheets = getElementsByLocalName(workbookDoc, "sheet");
  const warnings: string[] = [];
  const sheetTexts: string[] = [];
  const sections: ParsedIndexingSection[] = [];
  let indexedSheets = 0;
  let emptySheets = 0;
  let failedSheets = 0;
  let totalRows = 0;
  let indexedRows = 0;
  let maxColumns = 0;
  let truncatedRows = false;
  let truncatedColumns = false;
  const visibleSheets = workbookSheets.slice(0, MAX_SPREADSHEET_SHEETS);

  for (let index = 0; index < visibleSheets.length; index += 1) {
    const sheet = visibleSheets[index];
    const name = sheet.getAttribute("name") || `Sheet ${index + 1}`;
    const relationshipId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
    const sheetPath = relationshipId ? relationships.get(relationshipId) : undefined;
    if (!sheetPath) {
      failedSheets += 1;
      warnings.push(`Worksheet ${name} could not be resolved from workbook relationships.`);
      continue;
    }
    try {
      const parsed = await parseXlsxSheetRows(zip, sheetPath, sharedStrings, dateStyleIndexes);
      totalRows += parsed.totalRows;
      indexedRows += parsed.rows.length;
      maxColumns = Math.max(maxColumns, parsed.totalColumns);
      truncatedRows ||= parsed.truncatedRows;
      truncatedColumns ||= parsed.truncatedColumns;
      if (parsed.rows.length === 0) {
        emptySheets += 1;
        continue;
      }
      indexedSheets += 1;
      const sheetText = [
        `Sheet ${index + 1}: ${name}`,
        ...parsed.rows.map((row) => formatSpreadsheetRow(row.rowNumber, row.values)),
      ].filter(Boolean).join("\n");
      sheetTexts.push(sheetText);
      sections.push({
        text: sheetText,
        sourceLabel: `工作表 ${index + 1}: ${name}`,
        title: name,
        sectionType: "sheet",
        sectionIndex: index + 1,
      });
    } catch (error) {
      failedSheets += 1;
      warnings.push(`Worksheet ${name} text extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (workbookSheets.length > visibleSheets.length) {
    warnings.push(`Only the first ${MAX_SPREADSHEET_SHEETS} worksheets were indexed.`);
  }
  if (truncatedRows) warnings.push(`Only the first ${MAX_SPREADSHEET_ROWS_PER_SHEET} rows per worksheet were indexed.`);
  if (truncatedColumns) warnings.push(`Only the first ${MAX_SPREADSHEET_COLUMNS} columns per row were indexed.`);
  if (failedSheets > 0) warnings.push(`${failedSheets} XLSX worksheets could not be parsed.`);
  if (emptySheets > 0 && indexedSheets > 0) warnings.push(`${emptySheets} XLSX worksheets had no extractable text.`);
  if (indexedSheets === 0) warnings.push("No extractable XLSX text was found. The workbook may contain only charts, images, or unsupported objects.");

  const capped = capParsedText(sheetTexts.join("\n\n"), warnings);
  const normalized = normalizeText(capped.text);
  const coverageStatus: CoverageStatus = !normalized
    ? "skipped"
    : failedSheets > 0 || emptySheets > 0 || workbookSheets.length > visibleSheets.length || truncatedRows || truncatedColumns || capped.truncated
      ? "partial"
      : "complete";

  return {
    text: normalized,
    byteCount,
    warnings: dedupeWarnings(warnings),
    metadata: {
      parser: "xlsx-ooxml",
      kind: input.kind,
      sheets: workbookSheets.length,
      sheetsIndexed: indexedSheets,
      rows: totalRows,
      rowsIndexed: indexedRows,
      columns: maxColumns,
      sectionsTotal: workbookSheets.length,
      sectionsIndexed: indexedSheets,
      sectionsEmpty: emptySheets,
      sectionsFailed: failedSheets,
      sectionUnit: "个工作表",
      coverageStatus,
      truncated: workbookSheets.length > visibleSheets.length || truncatedRows || truncatedColumns || capped.truncated,
    },
    sections: sections.length > 0 ? sections : undefined,
  };
}

interface ParsedSpreadsheetRow {
  rowNumber: number;
  values: string[];
}

async function parseXlsxSheetRows(
  zip: JSZip,
  sheetPath: string,
  sharedStrings: string[],
  dateStyleIndexes: Set<number>,
): Promise<{ rows: ParsedSpreadsheetRow[]; totalRows: number; totalColumns: number; truncatedRows: boolean; truncatedColumns: boolean }> {
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) return { rows: [], totalRows: 0, totalColumns: 0, truncatedRows: false, truncatedColumns: false };

  const doc = parseXml(sheetXml);
  const allRows = getElementsByLocalName(doc, "row");
  const rows: ParsedSpreadsheetRow[] = [];
  let totalColumns = 0;
  let truncatedRows = false;
  let truncatedColumns = false;

  for (const row of allRows) {
    if (rows.length >= MAX_SPREADSHEET_ROWS_PER_SHEET) {
      truncatedRows = true;
      break;
    }
    const values: string[] = [];
    for (const cell of getDirectChildElementsByLocalName(row, "c")) {
      const cellRef = cell.getAttribute("r") || "";
      const columnIndex = columnIndexFromCellRef(cellRef);
      totalColumns = Math.max(totalColumns, columnIndex + 1);
      if (columnIndex >= MAX_SPREADSHEET_COLUMNS) {
        truncatedColumns = true;
        continue;
      }
      values[columnIndex] = getXlsxCellText(cell, sharedStrings, dateStyleIndexes);
    }
    while (values.length > 0 && !values[values.length - 1]) values.pop();
    if (values.some((value) => value.trim().length > 0)) {
      const rowNumber = Number(row.getAttribute("r"));
      rows.push({ rowNumber: Number.isFinite(rowNumber) ? rowNumber : rows.length + 1, values });
    }
  }
  return { rows, totalRows: allRows.length, totalColumns, truncatedRows, truncatedColumns };
}

async function parseXlsxSharedStrings(zip: JSZip): Promise<string[]> {
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (!sharedXml) return [];
  const doc = parseXml(sharedXml);
  return getElementsByLocalName(doc, "si").map((si) => (
    getElementsByLocalName(si, "t").map((node) => node.textContent || "").join("")
  ));
}

async function parseXlsxDateStyleIndexes(zip: JSZip): Promise<Set<number>> {
  const stylesXml = await zip.file("xl/styles.xml")?.async("string");
  const dateStyleIndexes = new Set<number>();
  if (!stylesXml) return dateStyleIndexes;

  const doc = parseXml(stylesXml);
  const customFormats = new Map<number, string>();
  for (const numFmt of getElementsByLocalName(doc, "numFmt")) {
    const id = Number(numFmt.getAttribute("numFmtId"));
    const code = numFmt.getAttribute("formatCode") || "";
    if (Number.isFinite(id) && code) customFormats.set(id, code);
  }

  const cellXfs = getElementsByLocalName(doc, "cellXfs")[0];
  if (!cellXfs) return dateStyleIndexes;

  getDirectChildElementsByLocalName(cellXfs, "xf").forEach((xf, index) => {
    const numFmtId = Number(xf.getAttribute("numFmtId"));
    if (!Number.isFinite(numFmtId)) return;
    const customFormatCode = customFormats.get(numFmtId);
    if (isDateNumFmtId(numFmtId) || (customFormatCode && isDateFormatCode(customFormatCode))) {
      dateStyleIndexes.add(index);
    }
  });
  return dateStyleIndexes;
}

async function parseRelationships(zip: JSZip, relsPath: string, baseDir: string): Promise<Map<string, string>> {
  const relsXml = await zip.file(relsPath)?.async("string");
  const rels = new Map<string, string>();
  if (!relsXml) return rels;
  const relsDoc = parseXml(relsXml);
  for (const rel of getElementsByLocalName(relsDoc, "Relationship")) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target) continue;
    rels.set(id, normalizeZipTarget(baseDir, target));
  }
  return rels;
}

function getXlsxCellText(cell: Element, sharedStrings: string[], dateStyleIndexes: Set<number>): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return getElementsByLocalName(cell, "t").map((node) => node.textContent || "").join("");
  }

  const value = getFirstTextByLocalName(cell, "v");
  if (!value) return "";
  if (type === "s") {
    const sharedIndex = Number(value);
    return Number.isInteger(sharedIndex) ? sharedStrings[sharedIndex] || "" : "";
  }
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";

  const styleIndex = Number(cell.getAttribute("s"));
  if (!type && Number.isInteger(styleIndex) && dateStyleIndexes.has(styleIndex)) {
    return formatExcelSerialDate(value);
  }
  return value;
}

function parseDelimitedRows(raw: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(value);
      value = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
      if (char === "\r" && next === "\n") index += 1;
      continue;
    }
    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function formatSpreadsheetRow(rowNumber: number, values: string[]): string {
  const cells = values
    .map((value, index) => [spreadsheetColumnName(index), normalizeCell(value)] as const)
    .filter(([, value]) => value)
    .map(([column, value]) => `${column}=${value}`);
  return cells.length > 0 ? `Row ${rowNumber}: ${cells.join(" | ")}` : "";
}

function normalizeCell(value: string): string {
  return normalizeText(String(value || "").replace(/^\ufeff/, "").replace(/\s+/g, " "));
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function getElementsByLocalName(root: Node, localName: string): Element[] {
  const result: Element[] = [];
  function walk(node: Node): void {
    const children = node.childNodes;
    if (!children) return;
    for (let index = 0; index < children.length; index += 1) {
      const child = children.item(index);
      if (child.nodeType === 1) {
        const element = child as Element;
        if (element.localName === localName || element.nodeName === localName) result.push(element);
      }
      walk(child);
    }
  }
  walk(root);
  return result;
}

function getDirectChildElementsByLocalName(root: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const children = root.childNodes;
  if (!children) return result;
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    if (element.localName === localName || element.nodeName === localName) result.push(element);
  }
  return result;
}

function getFirstTextByLocalName(root: Element, localName: string): string {
  return getElementsByLocalName(root, localName)[0]?.textContent || "";
}

function normalizeZipTarget(baseDir: string, target: string): string {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (normalizedTarget.startsWith("/")) return normalizedTarget.slice(1);
  return pathPosix.normalize(pathPosix.join(baseDir, normalizedTarget));
}

function columnIndexFromCellRef(cellRef: string): number {
  const letters = cellRef.match(/[A-Za-z]+/)?.[0]?.toUpperCase();
  if (!letters) return 0;
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function spreadsheetColumnName(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function formatExcelSerialDate(rawValue: string): string {
  const serial = Number(rawValue);
  if (!Number.isFinite(serial)) return rawValue;
  const millis = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return rawValue;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 9999) return rawValue;
  const pad = (value: number) => String(value).padStart(2, "0");
  const dateText = `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const hasTime = Math.abs(serial - Math.floor(serial)) > 0.000001;
  if (!hasTime) return dateText;
  return `${dateText} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function isDateNumFmtId(numFmtId: number): boolean {
  return (
    (numFmtId >= 14 && numFmtId <= 22) ||
    (numFmtId >= 27 && numFmtId <= 36) ||
    (numFmtId >= 45 && numFmtId <= 47) ||
    (numFmtId >= 50 && numFmtId <= 58)
  );
}

function isDateFormatCode(formatCode: string): boolean {
  const normalized = formatCode
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*]/g, "")
    .toLowerCase();
  return /[ymdhHsS]/.test(normalized);
}

function formatDelimitedSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
