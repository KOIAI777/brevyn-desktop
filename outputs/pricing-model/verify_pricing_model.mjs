import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const file = await FileBlob.load("/Users/koi/Desktop/projects/uclaw/apps/uclaw-electron/outputs/pricing-model/brevyn_pricing_profit_model.xlsx");
const workbook = await SpreadsheetFile.importXlsx(file);

const check = await workbook.inspect({
  kind: "table",
  range: "额度套餐!A1:H34",
  include: "values,formulas",
  tableMaxRows: 40,
  tableMaxCols: 10,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log("== ERRORS ==");
console.log(errors.ndjson);
