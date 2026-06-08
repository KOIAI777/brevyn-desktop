import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const file = await FileBlob.load("/Users/koi/Desktop/projects/uclaw/apps/uclaw-electron/outputs/pricing-model/brevyn_pricing_profit_model.xlsx");
const workbook = await SpreadsheetFile.importXlsx(file);
const png = await workbook.render({sheetName:"Dashboard", range:"A1:H12", format:"png", scale:2});
console.log(Object.keys(png));
console.log(typeof png, png.constructor?.name);
console.log(png.mimeType, png.bytes?.length, png.data?.length, png.buffer?.length);
