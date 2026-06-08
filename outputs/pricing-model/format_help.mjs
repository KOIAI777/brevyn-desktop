import { Workbook } from "@oai/artifact-tool";
const workbook = Workbook.create();
for (const q of ["column width", "format", "number format", "style", "freeze panes"]) {
  console.log('==', q, '==');
  console.log((await workbook.help(q)).ndjson);
}
