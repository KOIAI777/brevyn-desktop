#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runtimeRequire } from "./runtime-require.mjs";

const [specPath, outputPath] = process.argv.slice(2);
if (!specPath || !outputPath) {
  console.error("Usage: node scripts/create-pptx.mjs <spec.json> <output.pptx>");
  process.exit(2);
}

const require = runtimeRequire();
const pptxgen = require("pptxgenjs");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Brevyn";
pptx.subject = spec.title || "Brevyn presentation";
pptx.title = spec.title || "Presentation";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "en-US",
};

const titleSlide = pptx.addSlide();
titleSlide.background = { color: "F7F7F4" };
titleSlide.addText(spec.title || "Presentation", {
  x: 0.75,
  y: 1.6,
  w: 11,
  h: 0.8,
  fontSize: 34,
  bold: true,
  color: "20251F",
});
if (spec.subtitle) {
  titleSlide.addText(String(spec.subtitle), { x: 0.8, y: 2.55, w: 10.5, h: 0.5, fontSize: 16, color: "657064" });
}

for (const slideSpec of spec.slides || []) {
  const slide = pptx.addSlide();
  slide.background = { color: "FBFBF8" };
  slide.addText(String(slideSpec.title || "Slide"), {
    x: 0.6,
    y: 0.45,
    w: 11.2,
    h: 0.45,
    fontSize: 24,
    bold: true,
    color: "20251F",
  });
  slide.addShape(pptx.ShapeType.line, { x: 0.6, y: 1.08, w: 11.2, h: 0, line: { color: "D7DED2", width: 1 } });
  const bullets = slideSpec.bullets || slideSpec.points || [];
  slide.addText(bullets.map((bullet) => ({ text: String(bullet), options: { bullet: { indent: 18 } } })), {
    x: 0.9,
    y: 1.45,
    w: 10.6,
    h: 4.4,
    fontSize: 18,
    breakLine: false,
    color: "30362F",
    fit: "shrink",
    paraSpaceAfterPt: 12,
  });
}

await pptx.writeFile({ fileName: outputPath });
