#!/usr/bin/env node
import { runtimeRequire } from "./runtime-require.mjs";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node scripts/read-pptx.mjs <input.pptx>");
  process.exit(2);
}

const require = runtimeRequire();
const officeParser = require("officeparser");
const text = await officeParser.parseOfficeAsync(input);
process.stdout.write(text || "");
