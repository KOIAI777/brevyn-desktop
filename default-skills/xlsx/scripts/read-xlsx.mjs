#!/usr/bin/env node
import { runtimeRequire } from "./runtime-require.mjs";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node scripts/read-xlsx.mjs <input.xlsx>");
  process.exit(2);
}

const require = runtimeRequire();
const XLSX = require("xlsx");
const workbook = XLSX.readFile(input, { cellDates: true });
const sheets = {};
for (const name of workbook.SheetNames) {
  sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
}
process.stdout.write(JSON.stringify({ sheetNames: workbook.SheetNames, sheets }, null, 2));
