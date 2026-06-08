import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/koi/Desktop/projects/uclaw/apps/uclaw-electron/outputs/pricing-model";
const workbook = Workbook.create();
const ws = workbook.worksheets.add("额度套餐");

function setValues(range, values) {
  ws.getRange(range).values = values;
}

function setFormulas(range, formulas) {
  ws.getRange(range).formulas = formulas;
}

function setColumnWidths(widths) {
  for (const [column, width] of Object.entries(widths)) {
    ws.getRange(`${column}:${column}`).format.columnWidthPx = width;
  }
}

function header(range) {
  ws.getRange(range).format = {
    fill: "#1F6FEB",
    font: { name: "Aptos", size: 10, color: "#FFFFFF", bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: "#1B4EA3" },
  };
}

function section(range) {
  ws.getRange(range).merge();
  ws.getRange(range).format = {
    fill: "#EAF3FF",
    font: { name: "Aptos Display", size: 14, color: "#0F2D5C", bold: true },
    verticalAlignment: "center",
    wrapText: true,
  };
}

setValues("A1:H1", [["Brevyn 额度套餐测算", "", "", "", "", "", "", ""]]);
section("A1:H1");

setValues("A3:D3", [["基础假设", "数值", "单位", "说明"]]);
header("A3:D3");
setValues("A4:D10", [
  ["Kiro 单号成本", 30, "RMB", "一个号成本"],
  ["Kiro 单号可售额度", 300, "刀", "1000 Kiro 额度保守折算"],
  ["用户售价", 4, "刀 / RMB", "1 元 = 4 刀"],
  ["DeepSeek 加价", 0.3, "倍率", "官方人民币价加价 30%"],
  ["Kiro 单号收入", "", "RMB", "可售额度 / 用户售价"],
  ["Kiro 单号毛利", "", "RMB", "收入 - 成本"],
  ["Kiro 毛利率", "", "%", "毛利 / 收入"],
]);
setFormulas("B8:B10", [["=B5/B6"], ["=B8-B4"], ["=B9/B8"]]);

setValues("F3:H3", [["核心结论", "结果", "说明"]]);
header("F3:H3");
setValues("F4:H8", [
  ["Kiro 毛利率", "", "按 30 元成本、300 刀可售、1 元 4 刀"],
  ["Kiro 1 刀成本", "", "30 元 / 300 刀"],
  ["Kiro 1 刀售价", "", "1 元 / 4 刀"],
  ["DeepSeek 毛利率", "", "官方价加价 30%"],
  ["DeepSeek 扣刀公式", "官方 RMB/MTok × 5.2", "1.3 加价 × 4 刀/元"],
]);
setFormulas("G4:G7", [["=B10"], ["=B4/B5"], ["=1/B6"], ["=B7/(1+B7)"]]);

setValues("A12:H12", [["DeepSeek 扣刀价（刀 / 百万 tokens）", "", "", "", "", "", "", ""]]);
section("A12:H12");
setValues("A14:F14", [["模型", "cache_read", "input", "cache_write", "output", "毛利率"]]);
header("A14:F14");
setValues("A15:A16", [["deepseek-v4-flash"], ["deepseek-v4-pro"]]);
setValues("B15:E16", [
  [0.104, 5.2, 5.2, 10.4],
  [0.13, 15.6, 15.6, 31.2],
]);
setFormulas("F15:F16", [["=$B$7/(1+$B$7)"], ["=$B$7/(1+$B$7)"]]);
setValues("G14:H16", [
  ["说明", "DeepSeek 没有单独缓存写入价；cache_write 按缓存未命中 input 成本填，注意不要和 input 重复扣同一批 tokens。"],
  ["flash", "日常首选，便宜快速"],
  ["pro", "更强推理、长文本"],
]);
header("G14:H14");

setValues("A19:H19", [["额度套餐（按 1 元 = 4 刀）", "", "", "", "", "", "", ""]]);
section("A19:H19");
setValues("A21:G21", [["套餐", "售价 RMB", "到账刀", "Kiro 成本 RMB", "Kiro 毛利 RMB", "Kiro 毛利率", "备注"]]);
header("A21:G21");
setValues("A22:B27", [
  ["轻量包", 9.9],
  ["标准包", 19.9],
  ["主推包", 29.9],
  ["高频包", 49.9],
  ["大额包", 99],
  ["自定义", 0],
]);
setFormulas("C22:F27", [
  ["=B22*$B$6", "=C22*($B$4/$B$5)", "=B22-D22", "=IF(B22=0,0,E22/B22)"],
  ["=B23*$B$6", "=C23*($B$4/$B$5)", "=B23-D23", "=IF(B23=0,0,E23/B23)"],
  ["=B24*$B$6", "=C24*($B$4/$B$5)", "=B24-D24", "=IF(B24=0,0,E24/B24)"],
  ["=B25*$B$6", "=C25*($B$4/$B$5)", "=B25-D25", "=IF(B25=0,0,E25/B25)"],
  ["=B26*$B$6", "=C26*($B$4/$B$5)", "=B26-D26", "=IF(B26=0,0,E26/B26)"],
  ["=B27*$B$6", "=C27*($B$4/$B$5)", "=B27-D27", "=IF(B27=0,0,E27/B27)"],
]);
setValues("G22:G27", [
  ["低门槛体验"],
  ["常规购买"],
  ["建议主推"],
  ["重度用户"],
  ["大额充值"],
  ["手动改售价即可"],
]);

setValues("A30:H30", [["配置提醒", "", "", "", "", "", "", ""]]);
section("A30:H30");
setValues("A32:H34", [
  ["1", "sub2api 后台如果单位写 $/MTok，我们这里把它当“刀/MTok”用。", "", "", "", "", "", ""],
  ["2", "DeepSeek 的 cache_write 只在 adapter 把 miss tokens 映射到 cache_write 时使用；如果 miss 已计入 input，就不要重复扣。", "", "", "", "", "", ""],
  ["3", "当前额度套餐按 Kiro 成本测算，DeepSeek 因为按官方价 +30%，毛利率固定 23.1%。", "", "", "", "", "", ""],
]);

ws.getRange("A1:H34").format = {
  font: { name: "Aptos", size: 10, color: "#172033" },
  borders: { preset: "inside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "center",
  wrapText: true,
};
ws.getRange("A1:H1").format = {
  fill: "#EAF3FF",
  font: { name: "Aptos Display", size: 18, color: "#0F2D5C", bold: true },
  verticalAlignment: "center",
};
setColumnWidths({ A: 150, B: 120, C: 120, D: 150, E: 150, F: 120, G: 140, H: 420 });
ws.getRange("B4:B9").format.numberFormat = '0.00';
ws.getRange("B10:B10").format.numberFormat = '0.0%';
ws.getRange("G4:G7").format.numberFormat = '0.0%';
ws.getRange("G5:G6").format.numberFormat = '¥0.00';
ws.getRange("B15:E16").format.numberFormat = '0.0000';
ws.getRange("F15:F16").format.numberFormat = '0.0%';
ws.getRange("B22:E27").format.numberFormat = '¥0.00';
ws.getRange("C22:C27").format.numberFormat = '0.0';
ws.getRange("F22:F27").format.numberFormat = '0.0%';
ws.getRange("A32:H34").format = {
  fill: "#FFF7ED",
  font: { name: "Aptos", size: 10, color: "#7C2D12" },
  wrapText: true,
  verticalAlignment: "center",
};
section("A1:H1");
section("A12:H12");
section("A19:H19");
section("A30:H30");
header("A3:D3");
header("F3:H3");
header("A14:F14");
header("G14:H14");
header("A21:G21");
ws.freezePanes.freezeRows(3);

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/brevyn_pricing_profit_model.xlsx`);
