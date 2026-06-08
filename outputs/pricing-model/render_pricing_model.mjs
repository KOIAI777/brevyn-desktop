import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const base = "/Users/koi/Desktop/projects/uclaw/apps/uclaw-electron/outputs/pricing-model";
const file = await FileBlob.load(`${base}/brevyn_pricing_profit_model.xlsx`);
const workbook = await SpreadsheetFile.importXlsx(file);
await fs.mkdir(`${base}/renders`, { recursive: true });

const image = await workbook.render({ sheetName: "额度套餐", range: "A1:H34", scale: 2 });
const bytes = Buffer.from(await image.arrayBuffer());
await fs.writeFile(`${base}/renders/额度套餐.png`, bytes);
