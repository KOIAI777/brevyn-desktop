import type { SkillItem } from "../../types/domain";

export interface SkillBlueprint {
  id: string;
  name: string;
  description: string;
  version: string;
  defaultEnabled: boolean;
  instructions: string;
}

export const BUILTIN_SKILL_BLUEPRINTS: SkillBlueprint[] = [];

export function formatSkillRegistryPrompt(skills: SkillItem[]): string {
  const enabled = skills.filter((skill) => skill.enabled);
  if (enabled.length === 0) return "- none";

  return enabled
    .map((skill) => [
      `- ${skill.name} (${skill.id})`,
      `  Description: ${skill.description}`,
      `  Version: ${skill.version}`,
      skill.category ? `  Category: ${skill.category}` : "",
      skill.triggers?.length ? `  Triggers: ${skill.triggers.join(", ")}` : "",
      skill.scopes?.length ? `  Scopes: ${skill.scopes.join(", ")}` : "",
      skill.allowedTools?.length ? `  Allowed tools: ${skill.allowedTools.join(", ")}` : "",
      skill.resources?.length ? `  Resources: ${summarizeSkillResources(skill)}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n");
}

function summarizeSkillResources(skill: SkillItem): string {
  const counts = new Map<string, number>();
  for (const resource of skill.resources || []) {
    counts.set(resource.kind, (counts.get(resource.kind) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([kind, count]) => `${count} ${kind}`).join(", ");
}
