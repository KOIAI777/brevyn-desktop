import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { SkillItem } from "../../types/domain";
import type { SkillBlueprint } from "./skill-registry";

interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  scope?: SkillItem["scope"];
}

export interface SkillFileQuery {
  semesterId: string;
  courseId?: string;
}

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

  listSkills(query: SkillFileQuery): SkillItem[] {
    const globalSkills = [
      ...this.scanDir(join(this.rootPath, "skills"), true, "default"),
      ...this.scanDir(join(this.rootPath, "skills-inactive"), false, "default"),
    ];
    const courseSkills = query.courseId
      ? [
          ...this.scanDir(this.courseSkillsDir(query.semesterId, query.courseId, true), true, "course", query.courseId),
          ...this.scanDir(this.courseSkillsDir(query.semesterId, query.courseId, false), false, "course", query.courseId),
        ]
      : [];
    return [...globalSkills, ...courseSkills];
  }

  toggleSkill(id: string, enabled: boolean, query: SkillFileQuery): SkillItem | null {
    const resolved = this.resolveSkillDir(id, query);
    if (!resolved) return null;
    const source = resolved.courseId
      ? this.courseSkillsDir(query.semesterId, resolved.courseId, !enabled)
      : join(this.rootPath, enabled ? "skills-inactive" : "skills");
    const target = resolved.courseId
      ? this.courseSkillsDir(query.semesterId, resolved.courseId, enabled)
      : join(this.rootPath, enabled ? "skills" : "skills-inactive");
    const sourcePath = join(source, resolved.slug);
    const targetPath = join(target, resolved.slug);
    if (!existsSync(sourcePath)) return null;
    mkdirSync(target, { recursive: true });
    renameSync(sourcePath, targetPath);
    return this.readSkillDir(targetPath, resolved.slug, enabled, resolved.scope, resolved.courseId);
  }

  readSkillContent(id: string, query: SkillFileQuery): string | null {
    const resolved = this.resolveSkillDir(id, query);
    if (!resolved) return null;
    return readFileSync(join(resolved.dir, "SKILL.md"), "utf8");
  }

  writeSkillContent(id: string, content: string, query: SkillFileQuery): SkillItem | null {
    const resolved = this.resolveSkillDir(id, query);
    if (!resolved) return null;
    writeFileSync(join(resolved.dir, "SKILL.md"), content, "utf8");
    return this.readSkillDir(resolved.dir, resolved.slug, resolved.enabled, resolved.scope, resolved.courseId);
  }

  importSkillFolder(sourcePath: string, query: SkillFileQuery, enabled = true): SkillItem {
    const sourceDir = resolve(sourcePath);
    const slug = basename(sourceDir);
    if (!slug) throw new Error("Skill folder must have a valid directory name.");
    const sourceSkillPath = join(sourceDir, "SKILL.md");
    if (!existsSync(sourceSkillPath)) {
      throw new Error(`Imported skill folder is missing SKILL.md: ${sourceDir}`);
    }

    const scope: SkillItem["scope"] = query.courseId ? "course" : "default";
    const targetBaseDir = query.courseId
      ? this.courseSkillsDir(query.semesterId, query.courseId, enabled)
      : join(this.rootPath, enabled ? "skills" : "skills-inactive");
    const targetDir = join(targetBaseDir, slug);
    const inactiveTargetDir = query.courseId
      ? this.courseSkillsDir(query.semesterId, query.courseId, false)
      : join(this.rootPath, "skills-inactive");
    const activeTargetDir = query.courseId
      ? this.courseSkillsDir(query.semesterId, query.courseId, true)
      : join(this.rootPath, "skills");

    if (existsSync(join(activeTargetDir, slug)) || existsSync(join(inactiveTargetDir, slug))) {
      throw new Error(`A skill with the same folder name already exists: ${slug}`);
    }

    mkdirSync(targetBaseDir, { recursive: true });
    cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false });
    const imported = this.readSkillDir(targetDir, slug, enabled, scope, query.courseId);
    if (!imported) {
      throw new Error(`Failed to load imported skill: ${slug}`);
    }
    return imported;
  }

  skillFolderPath(id: string, query: SkillFileQuery): string | null {
    return this.resolveSkillDir(id, query)?.dir || null;
  }

  private scanDir(dir: string, enabled: boolean, scope: SkillItem["scope"], courseId?: string): SkillItem[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const skill = this.readSkillDir(join(dir, entry.name), entry.name, enabled, scope, courseId);
        return skill ? [skill] : [];
      });
  }

  private readSkillDir(dir: string, slug: string, enabled: boolean, scope: SkillItem["scope"], courseId?: string): SkillItem | null {
    const skillPath = join(dir, "SKILL.md");
    if (!existsSync(skillPath)) return null;
    try {
      const parsed = parseSkillMarkdown(readFileSync(skillPath, "utf8"));
      const effectiveScope = courseId ? "course" : parsed.frontmatter.scope || scope;
      return {
        id: courseId ? `course:${courseId}:${slug}` : `file:${slug}`,
        slug,
        name: parsed.frontmatter.name || titleFromSlug(slug),
        enabled,
        scope: effectiveScope,
        description: parsed.frontmatter.description || "Workspace skill loaded from SKILL.md.",
        version: parsed.frontmatter.version || "0.1.0",
        instructions: parsed.body.trim(),
        courseId,
        sourcePath: skillPath,
      };
    } catch (error) {
      console.warn(`[skills] Failed to parse ${skillPath}`, error);
      return null;
    }
  }

  private courseSkillsDir(semesterId: string, courseId: string, enabled: boolean): string {
    return join(this.rootPath, "semesters", semesterId, "courses", courseId, enabled ? "skills" : "skills-inactive");
  }

  private resolveSkillDir(
    id: string,
    query: SkillFileQuery,
  ): { dir: string; slug: string; enabled: boolean; scope: SkillItem["scope"]; courseId?: string } | null {
    const parsed = parseFileSkillId(id);
    if (!parsed) return null;
    const scope: SkillItem["scope"] = parsed.courseId ? "course" : "default";
    const activeDir = parsed.courseId
      ? this.courseSkillsDir(query.semesterId, parsed.courseId, true)
      : join(this.rootPath, "skills");
    const inactiveDir = parsed.courseId
      ? this.courseSkillsDir(query.semesterId, parsed.courseId, false)
      : join(this.rootPath, "skills-inactive");
    const activePath = join(activeDir, parsed.slug);
    if (existsSync(activePath)) {
      return { dir: activePath, slug: parsed.slug, enabled: true, scope, courseId: parsed.courseId };
    }
    const inactivePath = join(inactiveDir, parsed.slug);
    if (existsSync(inactivePath)) {
      return { dir: inactivePath, slug: parsed.slug, enabled: false, scope, courseId: parsed.courseId };
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
    if (key === "scope" && (raw === "default" || raw === "course")) result.scope = raw;
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

function parseFileSkillId(id: string): { slug: string; courseId?: string } | null {
  if (id.startsWith("file:")) return { slug: id.slice("file:".length) };
  if (!id.startsWith("course:")) return null;
  const [, courseId, ...slugParts] = id.split(":");
  const slug = slugParts.join(":");
  return courseId && slug ? { courseId, slug } : null;
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
    `scope: "${blueprint.scope}"`,
    "---",
    "",
    blueprint.instructions,
    "",
  ].join("\n");
}
