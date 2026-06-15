import type {
  ReferenceCreateInput,
  ReferenceCreator,
  ReferenceExportFormat,
  ReferenceExportInput,
  ReferenceExportResult,
  ReferenceImportInput,
  ReferenceImportResult,
  ReferenceItem,
  ReferenceScopeInput,
  ReferenceScopeQuery,
  ReferenceUpdateInput,
} from "../../types/domain";
import type { SQLiteBusinessStore } from "../storage";

type CslDateParts = { "date-parts"?: Array<Array<number | string>> };
type CslCreator = { given?: string; family?: string; literal?: string };
type CslItem = Record<string, unknown> & {
  id?: string;
  type?: string;
  title?: string;
  abstract?: string;
  issued?: CslDateParts;
  language?: string;
  publisher?: string;
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  ISBN?: string;
  URL?: string;
  author?: CslCreator[];
  editor?: CslCreator[];
};

export class ReferenceLibraryService {
  constructor(private readonly businessStore: SQLiteBusinessStore) {}

  list(query?: ReferenceScopeQuery): ReferenceItem[] {
    return this.businessStore.listReferences(query);
  }

  create(input: ReferenceCreateInput): ReferenceItem {
    const title = input.title.trim();
    if (!title) throw new Error("Reference title is required.");
    return this.businessStore.createReference({ ...input, title });
  }

  update(input: ReferenceUpdateInput): ReferenceItem {
    if (!input.id.trim()) throw new Error("Reference id is required.");
    if (input.title !== undefined && !input.title.trim()) throw new Error("Reference title is required.");
    return this.businessStore.updateReference(input);
  }

  archive(referenceId: string): boolean {
    return this.businessStore.archiveReference(referenceId);
  }

  delete(referenceId: string): boolean {
    return this.businessStore.deleteReference(referenceId);
  }

  addScope(input: ReferenceScopeInput) {
    return this.businessStore.addReferenceScope(input);
  }

  removeScope(scopeId: string): boolean {
    return this.businessStore.removeReferenceScope(scopeId);
  }

  importReferences(input: ReferenceImportInput): ReferenceImportResult {
    if (input.format !== "csl-json") {
      throw new Error("This version supports CSL-JSON import first. BibTeX and RIS import will be added after the library workflow is stable.");
    }
    const cslItems = parseCslJson(input.content);
    const references = cslItems.map((item) => this.create(cslItemToReferenceInput(item, input.scope)));
    return {
      imported: references.length,
      skipped: 0,
      references,
    };
  }

  exportReferences(input: ReferenceExportInput): ReferenceExportResult {
    const references = input.referenceIds?.length
      ? input.referenceIds.flatMap((id) => {
          const reference = this.businessStore.getReference(id);
          return reference ? [reference] : [];
        })
      : this.list(input.scope);
    const format = input.format;
    return {
      format,
      fileName: exportFileName(format),
      content: serializeReferences(references, format),
    };
  }
}

function parseCslJson(content: string): CslItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("CSL-JSON import content must be valid JSON.");
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const csl = item as CslItem;
    return typeof csl.title === "string" && csl.title.trim() ? [csl] : [];
  });
}

function cslItemToReferenceInput(item: CslItem, scope?: Omit<ReferenceScopeInput, "referenceId">): ReferenceCreateInput {
  return {
    itemType: cslTypeToItemType(item.type),
    title: item.title?.trim() || "Untitled reference",
    abstract: stringField(item.abstract),
    year: issuedYear(item.issued),
    language: stringField(item.language),
    publisher: stringField(item.publisher),
    containerTitle: stringField(item["container-title"]),
    volume: stringField(item.volume),
    issue: stringField(item.issue),
    pages: stringField(item.page),
    doi: stringField(item.DOI),
    isbn: stringField(item.ISBN),
    url: stringField(item.URL),
    citationKey: stringField(item.id),
    sourceKind: "import",
    creators: cslCreators(item),
    rawCslJson: item,
    scope: scope ? {
      ...scope,
      status: scope.status || (scope.scopeType === "candidate" ? "candidate" : "active"),
      addedBy: scope.addedBy || "user",
    } : undefined,
  };
}

function cslCreators(item: CslItem): ReferenceCreateInput["creators"] {
  const authors = (Array.isArray(item.author) ? item.author : []).map((creator) => cslCreatorToInput(creator, "author"));
  const editors = (Array.isArray(item.editor) ? item.editor : []).map((creator) => cslCreatorToInput(creator, "editor"));
  return [...authors, ...editors];
}

function cslCreatorToInput(creator: CslCreator, role: ReferenceCreator["role"]) {
  return {
    role,
    given: creator.given,
    family: creator.family,
    name: creator.literal,
  };
}

function cslTypeToItemType(type: unknown): ReferenceCreateInput["itemType"] {
  if (type === "article-journal") return "article-journal";
  if (type === "book") return "book";
  if (type === "chapter") return "chapter";
  if (type === "paper-conference") return "paper-conference";
  if (type === "report") return "report";
  if (type === "webpage" || type === "webpage-post") return "webpage";
  if (type === "motion_picture" || type === "video") return "video";
  if (type === "thesis") return "thesis";
  return "document";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function issuedYear(value: CslDateParts | undefined): string | undefined {
  const firstPart = value?.["date-parts"]?.[0]?.[0];
  if (typeof firstPart === "number") return String(firstPart);
  if (typeof firstPart === "string" && firstPart.trim()) return firstPart.trim();
  return undefined;
}

function serializeReferences(references: ReferenceItem[], format: ReferenceExportFormat): string {
  if (format === "csl-json") {
    return JSON.stringify(references.map(referenceToCslItem), null, 2);
  }
  if (format === "apa-markdown") {
    return references.map(formatApaMarkdown).join("\n\n");
  }
  if (format === "bibtex") {
    return references.map(formatBibTeX).join("\n\n");
  }
  if (format === "ris") {
    return references.map(formatRis).join("\n\n");
  }
  return "";
}

function referenceToCslItem(reference: ReferenceItem): CslItem {
  const raw = reference.rawCslJson || {};
  return {
    ...raw,
    id: reference.citationKey || reference.id,
    type: reference.itemType,
    title: reference.title,
    abstract: reference.abstract,
    issued: reference.year ? { "date-parts": [[reference.year]] } : undefined,
    language: reference.language,
    publisher: reference.publisher,
    "container-title": reference.containerTitle,
    volume: reference.volume,
    issue: reference.issue,
    page: reference.pages,
    DOI: reference.doi,
    ISBN: reference.isbn,
    URL: reference.url,
    author: reference.creators.filter((creator) => creator.role === "author").map(referenceCreatorToCslCreator),
    editor: reference.creators.filter((creator) => creator.role === "editor").map(referenceCreatorToCslCreator),
  };
}

function referenceCreatorToCslCreator(creator: ReferenceCreator): CslCreator {
  if (creator.name) return { literal: creator.name };
  return {
    given: creator.given,
    family: creator.family,
  };
}

function formatApaMarkdown(reference: ReferenceItem): string {
  const authors = formatAuthors(reference.creators.filter((creator) => creator.role === "author"));
  const editors = formatEditors(reference.creators.filter((creator) => creator.role === "editor"));
  const year = reference.year || "n.d.";
  const url = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
  if (reference.itemType === "article-journal") {
    const journalPart = [reference.containerTitle, apaVolumeIssue(reference), reference.pages].filter(Boolean).join(", ");
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, journalPart, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "book") {
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "chapter") {
    const bookPart = [`In ${editors || "Editor"}`, reference.containerTitle, reference.pages ? `(pp. ${reference.pages})` : ""].filter(Boolean).join(", ");
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, bookPart, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "thesis") {
    const thesisType = reference.containerTitle || "Thesis";
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title} [${thesisType}].`, reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "webpage") {
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, reference.containerTitle || reference.publisher, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "video") {
    const source = reference.containerTitle || reference.publisher;
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title} [Video].`, source, url].filter(Boolean).join(" "));
  }
  if (reference.itemType === "report") {
    const reportTitle = reference.containerTitle ? `${reference.title} (${reference.containerTitle}).` : `${reference.title}.`;
    return cleanCitation([`${authors || "Unknown author"} (${year}). ${reportTitle}`, reference.publisher, url].filter(Boolean).join(" "));
  }
  const source = [reference.containerTitle, reference.publisher].filter(Boolean).join(". ");
  return cleanCitation([`${authors || "Unknown author"} (${year}). ${reference.title}.`, source, url].filter(Boolean).join(" "));
}

function formatAuthors(creators: ReferenceCreator[]): string {
  if (creators.length === 0) return "";
  return creators.map(formatCreatorName).join(", ");
}

function formatCreatorName(creator: ReferenceCreator): string {
  if (creator.name) return creator.name;
  if (creator.family && creator.given) return `${creator.family}, ${creator.given.slice(0, 1).toUpperCase()}.`;
  return creator.family || creator.given || "Unknown";
}

function formatEditors(creators: ReferenceCreator[]): string {
  if (creators.length === 0) return "";
  const names = creators.map((creator) => {
    if (creator.name) return creator.name;
    const initial = creator.given ? `${creator.given.slice(0, 1).toUpperCase()}.` : "";
    return [initial, creator.family].filter(Boolean).join(" ") || creator.given || "Unknown";
  }).join(", ");
  return `${names} (Ed${creators.length > 1 ? "s" : ""}.)`;
}

function apaVolumeIssue(reference: ReferenceItem): string {
  if (!reference.volume && !reference.issue) return "";
  return `${reference.volume || ""}${reference.issue ? `(${reference.issue})` : ""}`;
}

function cleanCitation(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+:/g, ":")
    .trim();
}

function formatBibTeX(reference: ReferenceItem): string {
  const key = safeCitationKey(reference);
  const fields = [
    ["title", reference.title],
    ["author", reference.creators.filter((creator) => creator.role === "author").map(formatBibTeXCreator).join(" and ")],
    ["year", reference.year],
    ["journal", reference.containerTitle],
    ["publisher", reference.publisher],
    ["volume", reference.volume],
    ["number", reference.issue],
    ["pages", reference.pages],
    ["doi", reference.doi],
    ["url", reference.url],
  ].filter(([, value]) => Boolean(value));
  return `@${bibTeXEntryType(reference)}{${key},\n${fields.map(([field, value]) => `  ${field} = {${escapeBibTeX(String(value))}}`).join(",\n")}\n}`;
}

function formatBibTeXCreator(creator: ReferenceCreator): string {
  if (creator.name) return creator.name;
  return [creator.family, creator.given].filter(Boolean).join(", ");
}

function bibTeXEntryType(reference: ReferenceItem): string {
  if (reference.itemType === "article-journal") return "article";
  if (reference.itemType === "book") return "book";
  if (reference.itemType === "chapter") return "incollection";
  if (reference.itemType === "paper-conference") return "inproceedings";
  if (reference.itemType === "thesis") return "phdthesis";
  if (reference.itemType === "report") return "techreport";
  if (reference.itemType === "video") return "misc";
  return "misc";
}

function safeCitationKey(reference: ReferenceItem): string {
  const author = reference.creators[0]?.family || reference.creators[0]?.name || "reference";
  const year = reference.year || "nd";
  return (reference.citationKey || `${author}${year}`)
    .replace(/[^a-z0-9:_-]+/gi, "")
    .slice(0, 80) || reference.id;
}

function escapeBibTeX(value: string): string {
  return value.replace(/[{}]/g, "");
}

function formatRis(reference: ReferenceItem): string {
  const lines = [
    ["TY", risType(reference)],
    ...reference.creators.filter((creator) => creator.role === "author").map((creator) => ["AU", formatRisCreator(creator)]),
    ["PY", reference.year],
    ["TI", reference.title],
    ["JO", reference.containerTitle],
    ["PB", reference.publisher],
    ["VL", reference.volume],
    ["IS", reference.issue],
    ["SP", reference.pages],
    ["DO", reference.doi],
    ["UR", reference.url],
    ["AB", reference.abstract],
    ["ER", ""],
  ].filter(([, value]) => value !== undefined && value !== null);
  return lines.map(([tag, value]) => `${tag}  - ${value}`).join("\n");
}

function risType(reference: ReferenceItem): string {
  if (reference.itemType === "article-journal") return "JOUR";
  if (reference.itemType === "book") return "BOOK";
  if (reference.itemType === "chapter") return "CHAP";
  if (reference.itemType === "paper-conference") return "CONF";
  if (reference.itemType === "thesis") return "THES";
  if (reference.itemType === "report") return "RPRT";
  if (reference.itemType === "webpage") return "ELEC";
  if (reference.itemType === "video") return "VIDEO";
  return "GEN";
}

function formatRisCreator(creator: ReferenceCreator): string {
  if (creator.name) return creator.name;
  return [creator.family, creator.given].filter(Boolean).join(", ");
}

function exportFileName(format: ReferenceExportFormat): string {
  if (format === "csl-json") return "brevyn-references.csl.json";
  if (format === "apa-markdown") return "brevyn-references.apa.md";
  return `brevyn-references.${format}`;
}
