---
name: docx
description: Use this skill when the user asks to read, summarize, create, or lightly edit a Word .docx document in Brevyn. Prefer Brevyn bundled Node helpers for simple DOCX creation and extraction; use external LibreOffice/pandoc only if explicitly available and needed.
version: "1.1.0"
category: document
triggers: [docx, Word document, Word file, report, memo, handout]
scopes: [global]
allowed-tools: [Read, Write, Bash, mcp__brevyn__read_skill_resource]
---

# DOCX Skill

Use this for `.docx` reading, extraction, and simple generation.

## Runtime

Brevyn bundles the Node dependencies used by these helpers. When running scripts from the copied user skill folder, use the scripts as-is; they resolve packages through `BREVYN_RUNTIME_REQUIRE_FROM`.

## Quick Workflows

- Extract text: `node scripts/read-docx.mjs input.docx`
- Convert to simple HTML: `node scripts/read-docx.mjs input.docx --html`
- Create a basic DOCX from JSON: `node scripts/create-docx.mjs spec.json output.docx`

## JSON Creation Shape

```json
{
  "title": "Study Plan",
  "sections": [
    { "heading": "Goals", "paragraphs": ["Read the rubric.", "Draft the outline."] }
  ],
  "table": {
    "headers": ["Task", "Owner", "Status"],
    "rows": [["Outline", "Me", "Done"]]
  },
  "checklist": ["Review citations", "Submit final file"]
}
```

## Boundaries

- Keep generated documents simple and readable unless the user asks for advanced formatting.
- For exact visual fidelity, tracked changes, PDF conversion, or layout QA, first check whether external tools such as LibreOffice or pandoc are available. If not available, say the advanced operation is unavailable instead of pretending it passed.
