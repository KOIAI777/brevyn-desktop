import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { SkillItem } from "../../types/domain";
import type { SkillBlueprint } from "./skill-registry";

interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
}

const MAX_SKILL_CONTENT_BYTES = 10 * 1024 * 1024;

export class SkillFileStore {
  constructor(private readonly rootPath: string) {}

  ensureDefaultSkillTemplates(blueprints: SkillBlueprint[]): void {
    const templateDir = join(this.rootPath, "default-skills");
    const activeDir = join(this.rootPath, "skills");
    const inactiveDir = join(this.rootPath, "skills-inactive");
    mkdirSync(templateDir, { recursive: true });
    mkdirSync(activeDir, { recursive: true });
    mkdirSync(inactiveDir, { recursive: true });
    for (const blueprint of blueprints) {
      const templateSkillDir = join(templateDir, blueprint.id);
      const templatePath = join(templateSkillDir, "SKILL.md");
      if (!existsSync(templatePath)) {
        mkdirSync(templateSkillDir, { recursive: true });
        writeFileSync(templatePath, renderSkillTemplate(blueprint), "utf8");
      }

      const activePath = join(activeDir, blueprint.id, "SKILL.md");
      const inactivePath = join(inactiveDir, blueprint.id, "SKILL.md");
      if (existsSync(activePath) || existsSync(inactivePath)) continue;
      const targetDir = blueprint.defaultEnabled ? join(activeDir, blueprint.id) : join(inactiveDir, blueprint.id);
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, "SKILL.md"), renderSkillTemplate(blueprint), "utf8");
    }
  }

  listSkills(): SkillItem[] {
    return [
      ...this.scanDir(join(this.rootPath, "skills"), true),
      ...this.scanDir(join(this.rootPath, "skills-inactive"), false),
    ];
  }

  toggleSkill(id: string, enabled: boolean): SkillItem | null {
    const resolved = this.resolveSkillDir(id);
    if (!resolved) return null;
    const source = join(this.rootPath, enabled ? "skills-inactive" : "skills");
    const target = join(this.rootPath, enabled ? "skills" : "skills-inactive");
    const sourcePath = join(source, resolved.slug);
    const targetPath = join(target, resolved.slug);
    if (!existsSync(sourcePath)) return null;
    mkdirSync(target, { recursive: true });
    renameSync(sourcePath, targetPath);
    return this.readSkillDir(targetPath, resolved.slug, enabled);
  }

  readSkillContent(id: string): string | null {
    const resolved = this.resolveSkillDir(id);
    if (!resolved) return null;
    return readFileSync(join(resolved.dir, "SKILL.md"), "utf8");
  }

  writeSkillContent(id: string, content: string): SkillItem | null {
    const resolved = this.resolveSkillDir(id);
    if (!resolved) return null;
    assertSkillContentSize(content, join(resolved.dir, "SKILL.md"));
    writeFileSync(join(resolved.dir, "SKILL.md"), content, "utf8");
    return this.readSkillDir(resolved.dir, resolved.slug, resolved.enabled);
  }

  importSkillFolder(sourcePath: string, enabled = true): SkillItem {
    const sourceDir = resolve(sourcePath);
    const slug = basename(sourceDir).trim();
    if (!isValidSkillSlug(slug)) {
      throw new Error(`Invalid skill folder name: ${slug || "(empty)"}`);
    }
    const sourceSkillPath = join(sourceDir, "SKILL.md");
    if (!existsSync(sourceSkillPath)) {
      throw new Error(`Imported skill folder is missing SKILL.md: ${sourceDir}`);
    }
    if (statSync(sourceSkillPath).size > MAX_SKILL_CONTENT_BYTES) {
      throw new Error(`Skill file is too large. Maximum size is ${formatMaxSkillSize()}.`);
    }

    const targetBaseDir = join(this.rootPath, enabled ? "skills" : "skills-inactive");
    const targetDir = join(targetBaseDir, slug);
    const inactiveTargetDir = join(this.rootPath, "skills-inactive");
    const activeTargetDir = join(this.rootPath, "skills");

    if (existsSync(join(activeTargetDir, slug)) || existsSync(join(inactiveTargetDir, slug))) {
      throw new Error(`A skill with the same folder name already exists: ${slug}`);
    }

    mkdirSync(targetBaseDir, { recursive: true });
    cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false });
    const imported = this.readSkillDir(targetDir, slug, enabled);
    if (!imported) {
      throw new Error(`Failed to load imported skill: ${slug}`);
    }
    return imported;
  }

  skillFolderPath(id: string): string | null {
    return this.resolveSkillDir(id)?.dir || null;
  }

  private scanDir(dir: string, enabled: boolean): SkillItem[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const skill = this.readSkillDir(join(dir, entry.name), entry.name, enabled);
        return skill ? [skill] : [];
      });
  }

  private readSkillDir(dir: string, slug: string, enabled: boolean): SkillItem | null {
    const skillPath = join(dir, "SKILL.md");
    if (!existsSync(skillPath)) return null;
    try {
      const parsed = parseSkillMarkdown(readFileSync(skillPath, "utf8"));
      return {
        id: `file:${slug}`,
        slug,
        name: parsed.frontmatter.name || titleFromSlug(slug),
        enabled,
        description: parsed.frontmatter.description || "Workspace skill loaded from SKILL.md.",
        version: parsed.frontmatter.version || "0.1.0",
        instructions: parsed.body.trim(),
        sourcePath: skillPath,
      };
    } catch (error) {
      console.warn(`[skills] Failed to parse ${skillPath}`, error);
      return null;
    }
  }

  private resolveSkillDir(id: string): { dir: string; slug: string; enabled: boolean } | null {
    const parsed = parseFileSkillId(id);
    if (!parsed) return null;
    const activeDir = join(this.rootPath, "skills");
    const inactiveDir = join(this.rootPath, "skills-inactive");
    const activePath = join(activeDir, parsed.slug);
    if (existsSync(activePath)) {
      return { dir: activePath, slug: parsed.slug, enabled: true };
    }
    const inactivePath = join(inactiveDir, parsed.slug);
    if (existsSync(inactivePath)) {
      return { dir: inactivePath, slug: parsed.slug, enabled: false };
    }
    return null;
  }
}

function parseSkillMarkdown(content: string): { frontmatter: SkillFrontmatter; body: string } {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const end = content.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: content };
  const rawFrontmatter = content.slice(3, end).trim();
  const body = content.slice(end + 4).trimStart();
  return { frontmatter: parseFrontmatter(rawFrontmatter), body };
}

function parseFrontmatter(value: string): SkillFrontmatter {
  const result: SkillFrontmatter = {};
  for (const line of value.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const raw = unquote(match[2] || "");
    if (key === "name") result.name = raw;
    if (key === "description") result.description = raw;
    if (key === "version") result.version = raw;
  }
  return result;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFileSkillId(id: string): { slug: string } | null {
  if (id.startsWith("file:")) return { slug: id.slice("file:".length) };
  return null;
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function renderSkillTemplate(blueprint: SkillBlueprint): string {
  return [
    "---",
    `name: "${blueprint.name}"`,
    `description: "${blueprint.description}"`,
    `version: "${blueprint.version}"`,
    "---",
    "",
    blueprint.instructions,
    "",
  ].join("\n");
}

function isValidSkillSlug(slug: string): boolean {
  if (!slug || slug === "." || slug === "..") return false;
  return slug === sanitizeSkillSlug(slug);
}

function sanitizeSkillSlug(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.\./g, "-");
}

function assertSkillContentSize(content: string, skillPath: string): void {
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength <= MAX_SKILL_CONTENT_BYTES) return;
  throw new Error(`Skill file is too large. Maximum size is ${formatMaxSkillSize()} (${skillPath}).`);
}

function formatMaxSkillSize(): string {
  return "10 MB";
}
