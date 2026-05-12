---
name: xlsx
description: Use this skill when the user asks to read, summarize, create, or lightly edit an Excel .xlsx workbook or CSV/TSV table in Brevyn. Use bundled xlsx helpers for basic workbook extraction and creation.
version: "1.1.0"
category: spreadsheet
triggers: [xlsx, Excel, spreadsheet, workbook, csv, table]
scopes: [global]
allowed-tools: [Read, Write, Bash, mcp__brevyn__read_skill_resource]
---

# XLSX Skill

Use this for lightweight spreadsheet extraction and creation.

## Quick Workflows

- Inspect workbook as JSON: `node scripts/read-xlsx.mjs input.xlsx`
- Create workbook from JSON: `node scripts/create-xlsx.mjs spec.json output.xlsx`

## JSON Creation Shape

```json
{
  "sheets": [
    {
      "name": "Plan",
      "rows": [["Task", "Status"], ["Read rubric", "Done"]]
    }
  ]
}
```

## Boundaries

- Keep formulas and formatting simple unless the user explicitly asks for a workbook model.
- Recalculation through LibreOffice is an external advanced operation; check availability before claiming formulas were recalculated.
