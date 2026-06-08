import { readFileSync } from "node:fs";
import { extname } from "node:path";
import JSZip from "jszip";
import type { CoverageStatus, ParsedDocumentAsset, ParsedIndexingFile, ParsedIndexingSection, ParseInput } from "./types";
import { embeddedMediaFiles, mediaAssetFromPath, mediaTargetsFromRelationships } from "./ooxml-assets";
import { capParsedText, decodeXml, dedupeWarnings, emptyParsedFile, errorMessage, normalizeText, numberFromPath, sortedZipFiles } from "./utils";

export async function parsePptx(input: ParseInput, byteCount: number): Promise<ParsedIndexingFile> {
  if (extname(input.sourcePath).toLowerCase() === ".ppt") {
    return emptyParsedFile(input, byteCount, "Legacy .ppt files need conversion to .pptx before local text extraction.");
  }

  const zip = await JSZip.loadAsync(readFileSync(input.sourcePath));
  const slideFiles = sortedZipFiles(zip, /^ppt\/slides\/slide\d+\.xml$/);
  const noteFiles = sortedZipFiles(zip, /^ppt\/notesSlides\/notesSlide\d+\.xml$/);
  const mediaFiles = embeddedMediaFiles(zip, "ppt");
  const notesBySlide = new Map<number, JSZip.JSZipObject>();
  for (const file of noteFiles) {
    notesBySlide.set(numberFromPath(file.name), file);
  }
  const parts: string[] = [];
  const sections: ParsedIndexingSection[] = [];
  const assets: ParsedDocumentAsset[] = [];
  const referencedMedia = new Set<string>();
  const warnings: string[] = [];
  let indexedSlides = 0;
  let emptySlides = 0;
  let failedSlides = 0;
  let indexedNotes = 0;
  let failedNotes = 0;
  let imageOnlySlides = 0;

  for (const file of slideFiles) {
    const slideNumber = numberFromPath(file.name);
    try {
      const slideText = extractPptxXmlText(await file.async("string"));
      const slideMediaTargets = await mediaTargetsFromRelationships(zip, `ppt/slides/_rels/slide${slideNumber}.xml.rels`, "ppt/slides");
      const noteFile = notesBySlide.get(slideNumber);
      let noteText = "";
      if (noteFile) {
        try {
          noteText = extractPptxXmlText(await noteFile.async("string"));
          if (noteText) indexedNotes += 1;
        } catch (error) {
          failedNotes += 1;
          warnings.push(`Slide ${slideNumber} speaker notes extraction failed: ${errorMessage(error)}`);
        }
      }
      const slideNeedsOcr = !slideText && slideMediaTargets.length > 0;
      if (slideNeedsOcr) imageOnlySlides += 1;
      for (const target of slideMediaTargets) {
        referencedMedia.add(target);
        assets.push(mediaAssetFromPath({
          path: target,
          sourceLabel: `幻灯片 ${slideNumber} 内嵌图片`,
          slideNumber,
          needsOcr: slideNeedsOcr,
          reason: slideNeedsOcr ? "pptx_image_only_slide" : undefined,
        }));
      }
      const text = normalizeText([slideText, noteText ? `Speaker notes\n${noteText}` : ""].filter(Boolean).join("\n\n"));
      if (text) {
        indexedSlides += 1;
        const sectionText = `Slide ${slideNumber}\n${text}`;
        parts.push(sectionText);
        sections.push({
          text: sectionText,
          sourceLabel: `幻灯片 ${slideNumber}`,
          title: slideText.split("\n").map((line) => line.trim()).find(Boolean),
          sectionType: "slide",
          sectionIndex: slideNumber,
        });
      } else {
        emptySlides += 1;
      }
    } catch (error) {
      failedSlides += 1;
      warnings.push(`Slide ${slideNumber} text extraction failed: ${errorMessage(error)}`);
    }
  }
  for (const path of mediaFiles) {
    if (referencedMedia.has(path)) continue;
    assets.push(mediaAssetFromPath({
      path,
      sourceLabel: "PPTX 未关联内嵌图片",
      needsOcr: false,
    }));
  }

  const text = normalizeText(parts.join("\n\n"));
  if (!text) {
    warnings.push("No extractable PPTX text was found. The slides may contain only images or unsupported embedded objects.");
  }
  if (imageOnlySlides > 0) warnings.push(`${imageOnlySlides} PPTX slides contain images without extractable slide text and need OCR/document parsing for full indexing.`);
  if (failedSlides > 0) warnings.push(`${failedSlides} PPTX slides could not be parsed.`);
  if (failedNotes > 0) warnings.push(`${failedNotes} speaker-note sections could not be parsed.`);
  if (emptySlides > 0 && indexedSlides > 0) warnings.push(`${emptySlides} PPTX slides had no extractable text.`);
  const capped = capParsedText(text, warnings);
  const normalized = normalizeText(capped.text);
  const coverageStatus: CoverageStatus = !normalized
    ? "skipped"
    : failedSlides > 0 || failedNotes > 0 || emptySlides > 0 || capped.truncated
      ? "partial"
      : "complete";
  return {
    text: normalized,
    byteCount,
    warnings: dedupeWarnings(warnings),
    metadata: {
      parser: "pptx-jszip",
      kind: input.kind,
      slides: slideFiles.length,
      notes: noteFiles.length,
      notesIndexed: indexedNotes,
      embeddedImages: mediaFiles.length,
      imageOnlySlides,
      assetsNeedingOcr: assets.filter((asset) => asset.needsOcr).length,
      sectionsTotal: slideFiles.length,
      sectionsIndexed: indexedSlides,
      sectionsEmpty: emptySlides,
      sectionsFailed: failedSlides,
      sectionUnit: "张幻灯片",
      coverageStatus,
      truncated: capped.truncated,
    },
    assets: assets.length > 0 ? assets : undefined,
    sections: sections.length > 0 ? sections : undefined,
  };
}

function extractPptxXmlText(xml: string): string {
  const fragments: string[] = [];
  const tagPattern = /<(?:a|m):t\b[^>]*>([\s\S]*?)<\/(?:a|m):t>/g;
  for (const match of xml.matchAll(tagPattern)) {
    const value = decodeXml(match[1] || "").trim();
    if (value) fragments.push(value);
  }
  return normalizeText(fragments.join("\n"));
}
