#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runtimeRequire } from "./runtime-require.mjs";

const [input, mode] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node scripts/read-pdf.mjs <input.pdf> [--json]");
  process.exit(2);
}

const require = runtimeRequire();
const pdfParse = require("pdf-parse");
const result = await pdfParse(readFileSync(input));
if (mode === "--json") {
  process.stdout.write(JSON.stringify({
    pages: result.numpages,
    info: result.info || {},
    metadata: result.metadata || null,
    textLength: result.text?.length || 0,
  }, null, 2));
} else {
  process.stdout.write(result.text || "");
}
