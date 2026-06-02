import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { IndexingTaskRecord, IndexingWorkerResult } from "./indexing-types";
import type { WorkspaceFileKind } from "../../types/domain";

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "brevyn-indexing-parser-"));
  const fixtures = await createFixtures(dir);
  for (const fixture of fixtures) {
    const result = await runWorker(fixture.path, fixture.kind);
    assert.ok(result.chunkCount > 0, `${fixture.name} should produce chunks`);
    assert.equal(result.chunks.length, result.chunkCount, `${fixture.name} chunk count should match`);
    assert.equal(result.chunkMetadata?.length, result.chunkCount, `${fixture.name} metadata should align`);
    assert.equal(result.metadata?.parser, fixture.parser, `${fixture.name} parser mismatch`);
    assert.ok(result.metadata?.coverageStatus === "complete" || result.metadata?.coverageStatus === "partial", `${fixture.name} should report coverage`);
    assert.match(result.sample, fixture.sample, `${fixture.name} sample should include extracted text`);
    assert.ok(result.chunkMetadata?.some((metadata) => metadata.sourceLabel), `${fixture.name} should include section labels`);
  }
  console.log("indexing parser tests passed");
}

async function createFixtures(dir: string): Promise<Array<{ name: string; path: string; kind: WorkspaceFileKind; parser: string; sample: RegExp }>> {
  const textPath = join(dir, "notes.txt");
  writeFileSync(textPath, "Week 1\nDebate topic and rubric notes.", "utf8");
  const csvPath = join(dir, "rubric.csv");
  writeFileSync(csvPath, "Criterion,Weight\nArgument clarity,40%\nEvidence,60%\n", "utf8");
  const tsvPath = join(dir, "schedule.tsv");
  writeFileSync(tsvPath, "Week\tTopic\n1\tDebate prep\n2\tFinal speech\n", "utf8");
  const xlsxPath = join(dir, "rubric.xlsx");
  await writeXlsxFixture(xlsxPath);
  const docxPath = join(dir, "brief.docx");
  await writeDocxFixture(docxPath);
  const pptxPath = join(dir, "slides.pptx");
  await writePptxFixture(pptxPath);
  const pdfPath = join(dir, "handout.pdf");
  await writePdfFixture(pdfPath);
  return [
    { name: "text", path: textPath, kind: "text", parser: "plain-text", sample: /Debate topic/ },
    { name: "csv", path: csvPath, kind: "spreadsheet", parser: "csv-text", sample: /Argument clarity/ },
    { name: "tsv", path: tsvPath, kind: "spreadsheet", parser: "tsv-text", sample: /Debate prep/ },
    { name: "xlsx", path: xlsxPath, kind: "spreadsheet", parser: "xlsx-ooxml", sample: /Argument clarity/ },
    { name: "docx", path: docxPath, kind: "docx", parser: "docx-ooxml", sample: /Debate Brief/ },
    { name: "pptx", path: pptxPath, kind: "pptx", parser: "pptx-jszip", sample: /Debate Slide/ },
    { name: "pdf", path: pdfPath, kind: "pdf", parser: "pdfjs-dist", sample: /Debate PDF/ },
  ];
}

function runWorker(sourcePath: string, kind: WorkspaceFileKind): Promise<IndexingWorkerResult> {
  return new Promise((resolveResult, reject) => {
    const task: IndexingTaskRecord = {
      id: `task-${basename(sourcePath)}`,
      jobId: "job",
      courseId: "course",
      fileId: `file-${basename(sourcePath)}`,
      kind: "parse_chunk",
      status: "queued",
      attempts: 0,
      maxAttempts: 1,
      nextRunAt: new Date().toISOString(),
      progress: 0,
      payload: {
        fileId: `file-${basename(sourcePath)}`,
        courseId: "course",
        name: basename(sourcePath),
        path: basename(sourcePath),
        sourcePath,
        kind,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const worker = new Worker(resolve("dist/indexing-worker.cjs"), { workerData: task });
    worker.on("message", (message: { ok: true; result: IndexingWorkerResult } | { ok: false; error: string }) => {
      if (message.ok) resolveResult(message.result);
      else reject(new Error(message.error));
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`indexing worker exited with ${code}`));
    });
  });
}

async function writeXlsxFixture(path: string): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rubric" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6"><si><t>Criterion</t></si><si><t>Weight</t></si><si><t>Argument clarity</t></si><si><t>40%</t></si><si><t>Evidence</t></si><si><t>60%</t></si></sst>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row><row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row></sheetData></worksheet>`);
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeDocxFixture(path: string): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Debate Brief</w:t></w:r></w:p><w:p><w:r><w:t>Argument clarity and evidence matter.</w:t></w:r></w:p></w:body></w:document>`);
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writePptxFixture(path: string): Promise<void> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Debate Slide</a:t></a:r></a:p><a:p><a:r><a:t>Evidence summary</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writePdfFixture(path: string): Promise<void> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 240]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Debate PDF handout", { x: 40, y: 180, size: 18, font });
  page.drawText("Use evidence and rebuttal.", { x: 40, y: 150, size: 12, font });
  writeFileSync(path, await pdf.save());
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
