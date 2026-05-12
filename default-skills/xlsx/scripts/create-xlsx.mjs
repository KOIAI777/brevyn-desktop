#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runtimeRequire } from "./runtime-require.mjs";

const [specPath, outputPath] = process.argv.slice(2);
if (!specPath || !outputPath) {
  console.error("Usage: node scripts/create-xlsx.mjs <spec.json> <output.xlsx>");
  process.exit(2);
}

const require = runtimeRequire();
const XLSX = require("xlsx");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const workbook = XLSX.utils.book_new();
for (const sheet of spec.sheets || []) {
  const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows || []);
  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheet.name || `Sheet${workbook.SheetNames.length + 1}`).slice(0, 31));
}
if (workbook.SheetNames.length === 0) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Brevyn workbook"]]), "Sheet1");
}
XLSX.writeFile(workbook, outputPath);
