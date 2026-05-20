import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { PreviewPill, ToolCodeBlock, ToolDetailsShell } from "@/components/agent/tool-cards/shared";
import { getParsedToolResult, getToolResultText, recordObject, stringValue } from "@/components/agent/tool-cards/toolModel";

export function isSkillTool(toolName: string): boolean {
  return toolName === "mcp__brevyn__load_skill" || toolName === "mcp__brevyn__read_skill_resource";
}

interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  content: string;
}

export function SkillResultDetails({
  toolUse,
  result,
  ...helpers
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
} & ToolCardHelpers) {
  const data = recordObject(toolUse.input);
  const skillId = stringValue(data.skillId, "skill");
  const relativePath = stringValue(data.relativePath, "resource");
  const isResource = toolUse.name === "mcp__brevyn__read_skill_resource";
  const loaded = result && !result.isError ? parseLoadedSkill(result) : null;
  const name = loaded?.name || skillNameFromId(skillId);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <PreviewPill label="Skill" value={skillId} />
        {isResource && <PreviewPill label="Resource" value={relativePath} />}
        {loaded?.version && <PreviewPill label="Version" value={loaded.version} />}
      </div>
      {result && (
        isResource ? (
          <ToolDetailsShell className="mt-3">
            <ToolCodeBlock maxHeight="max-h-52" className="text-[11px] leading-5">
              {helpers.truncatePreview(getToolResultText(result))}
            </ToolCodeBlock>
          </ToolDetailsShell>
        ) : (
          <ToolDetailsShell className="mt-3 px-2.5 py-2 [contain:layout_paint_style]">
            <div className="text-xs font-semibold text-foreground">{loaded?.name || name}</div>
            {loaded?.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{loaded.description}</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              SKILL.md 已加载给 agent{loaded?.content ? ` · ${lineCount(loaded.content)} lines` : ""}。
            </p>
          </ToolDetailsShell>
        )
      )}
    </>
  );
}

function parseLoadedSkill(result: ToolResultBlock): LoadedSkill | null {
  const root = recordObject(getParsedToolResult(result));
  const skill = recordObject(root.skill);
  return {
    id: stringValue(skill.id, ""),
    name: stringValue(skill.name, ""),
    description: stringValue(skill.description, ""),
    version: stringValue(skill.version, ""),
    content: stringValue(root.content, ""),
  };
}

function skillNameFromId(skillId: string): string {
  return skillId.replace(/^file:/, "").split(/[-_]/g).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || skillId;
}

function lineCount(value: string): number {
  return value.split("\n").filter((line) => line.trim().length > 0).length;
}
