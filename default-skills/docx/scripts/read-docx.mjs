#!/usr/bin/env node
import { runtimeRequire } from "./runtime-require.mjs";

const [input, mode] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node scripts/read-docx.mjs <input.docx> [--html]");
  process.exit(2);
}

const require = runtimeRequire();
const mammoth = require("mammoth");
const result = mode === "--html"
  ? await mammoth.convertToHtml({ path: input })
  : await mammoth.extractRawText({ path: input });

process.stdout.write(result.value || "");
