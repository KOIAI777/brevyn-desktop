import { Workbook } from "@oai/artifact-tool";
const workbook = Workbook.create();
console.log((await workbook.help("merge cells")).ndjson);
