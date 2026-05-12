---
name: pdf
description: Use this skill when the user asks to read, summarize, extract text from, or inspect a PDF file in Brevyn. Use the bundled PDF text helper for extraction; advanced form filling, OCR, or page rendering may require external tools.
version: "1.1.0"
category: document
triggers: [pdf, PDF file, extract PDF, summarize PDF]
scopes: [global]
allowed-tools: [Read, Bash, mcp__brevyn__read_skill_resource]
---

# PDF Skill

Use this for PDF text extraction and lightweight inspection.

## Quick Workflows

- Extract text: `node scripts/read-pdf.mjs input.pdf`
- Extract metadata and page count: `node scripts/read-pdf.mjs input.pdf --json`

## Boundaries

- For scanned PDFs, say OCR is needed if extracted text is empty.
- For visual page rendering, prefer Brevyn's built-in PDF preview UI when available.
- Do not claim form filling, OCR, or image conversion succeeded unless the required external tools are available.
