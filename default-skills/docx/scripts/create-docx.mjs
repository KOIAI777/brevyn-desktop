#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { runtimeRequire } from "./runtime-require.mjs";

const [specPath, outputPath] = process.argv.slice(2);
if (!specPath || !outputPath) {
  console.error("Usage: node scripts/create-docx.mjs <spec.json> <output.docx>");
  process.exit(2);
}

const require = runtimeRequire();
const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const children = [];

if (spec.title) {
  children.push(new Paragraph({
    text: String(spec.title),
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
  }));
}

for (const section of spec.sections || []) {
  if (section.heading) children.push(new Paragraph({ text: String(section.heading), heading: HeadingLevel.HEADING_1 }));
  for (const paragraph of section.paragraphs || []) {
    children.push(new Paragraph({ children: [new TextRun(String(paragraph))], spacing: { after: 160 } }));
  }
}

if (spec.table?.headers?.length) {
  const rows = [spec.table.headers, ...(spec.table.rows || [])].map((row, rowIndex) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), bold: rowIndex === 0 })] })],
      borders: simpleBorders(BorderStyle.SINGLE, "D9DED6"),
    })),
  }));
  children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
}

if (spec.checklist?.length) {
  children.push(new Paragraph({ text: "Checklist", heading: HeadingLevel.HEADING_1 }));
  for (const item of spec.checklist) {
    children.push(new Paragraph({ text: `[ ] ${item}`, spacing: { after: 80 } }));
  }
}

const doc = new Document({
  sections: [{ properties: {}, children }],
});
writeFileSync(outputPath, await Packer.toBuffer(doc));

function simpleBorders(style, color) {
  return {
    top: { style, size: 1, color },
    bottom: { style, size: 1, color },
    left: { style, size: 1, color },
    right: { style, size: 1, color },
  };
}
