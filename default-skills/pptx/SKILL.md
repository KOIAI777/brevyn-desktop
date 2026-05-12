---
name: pptx
description: Use this skill when the user asks to create, read, summarize, or lightly edit a PowerPoint .pptx deck in Brevyn. Use bundled pptxgenjs for simple deck creation and officeparser for text extraction.
version: "1.1.0"
category: presentation
triggers: [pptx, PowerPoint, slides, slide deck, presentation]
scopes: [global]
allowed-tools: [Read, Write, Bash, mcp__brevyn__read_skill_resource]
---

# PPTX Skill

Use this for simple PowerPoint creation and text extraction.

## Quick Workflows

- Extract text: `node scripts/read-pptx.mjs input.pptx`
- Create a PPTX from JSON: `node scripts/create-pptx.mjs spec.json output.pptx`

## JSON Creation Shape

```json
{
  "title": "Academic Debate Prep",
  "slides": [
    { "title": "Argument Structure", "bullets": ["Claim", "Evidence", "Reasoning"] }
  ]
}
```

## Boundaries

- This helper creates clean basic decks, not high-design editorial decks.
- For visual thumbnails or PDF conversion, check for LibreOffice/poppler availability before claiming success.
