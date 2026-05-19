import type { ToolCardHelpers, ToolResultBlock } from "./types";
import { CompactProcessCard, DeferredToolDetails, PreviewPill } from "./shared";

interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  content: string;
}

export function SkillToolCard({
  input,
  result,
  collapsed,
  onToggleCollapsed,
  ...helpers
}: {
  input: unknown;
  result?: ToolResultBlock;
  collapsed: boolean;
  onToggleCollapsed: () => void;
} & ToolCardHelpers) {
  const data = helpers.recordObject(input);
  const skillId = helpers.stringValue(data.skillId, "skill");
  const loaded = result && !result.isError ? parseLoadedSkill(helpers.formatToolResultContent(result.content), helpers) : null;
  const running = !result;
  const name = loaded?.name || skillNameFromId(skillId);
  const status = running ? "运行中" : result?.isError ? "失败" : "已加载";
  const title = running ? `正在加载技能 · ${name}` : result?.isError ? `加载技能失败 · ${name}` : `已加载技能 · ${name}`;
  const heading = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {helpers.renderToolGlyph("mcp__brevyn__load_skill", "h-3.5 w-3.5 shrink-0")}
      <span className="min-w-0 truncate">{title}</span>
    </span>
  );

  return (
    <div className="overflow-hidden text-xs text-foreground">
      <CompactProcessCard
        title={heading}
        status={status}
        running={running}
        isError={result?.isError}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className={`${collapsed ? "mt-0 grid-rows-[0fr] opacity-0" : "mt-1.5 grid-rows-[1fr] opacity-100"} grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out`}>
        <div className="min-h-0 overflow-hidden px-1 py-1">
          <DeferredToolDetails collapsed={collapsed}>
            <div className="flex flex-wrap gap-2">
              <PreviewPill label="Skill" value={skillId} />
              {loaded?.version && <PreviewPill label="Version" value={loaded.version} />}
            </div>
            {result && (
              result.isError ? (
                <p className="mt-3 text-xs text-destructive">技能加载失败。</p>
              ) : (
                <div className="mt-3 rounded-lg bg-muted/30 px-2.5 py-2">
                  <div className="text-xs font-semibold text-foreground">{loaded?.name || name}</div>
                  {loaded?.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{loaded.description}</p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    SKILL.md 已加载给 agent{loaded?.content ? ` · ${lineCount(loaded.content)} lines` : ""}。
                  </p>
                </div>
              )
            )}
          </DeferredToolDetails>
        </div>
      </div>
    </div>
  );
}

function parseLoadedSkill(output: string, helpers: ToolCardHelpers): LoadedSkill | null {
  try {
    const root = helpers.recordObject(JSON.parse(output) as unknown);
    const skill = helpers.recordObject(root.skill);
    return {
      id: helpers.stringValue(skill.id, ""),
      name: helpers.stringValue(skill.name, ""),
      description: helpers.stringValue(skill.description, ""),
      version: helpers.stringValue(skill.version, ""),
      content: helpers.stringValue(root.content, ""),
    };
  } catch {
    return null;
  }
}

function skillNameFromId(skillId: string): string {
  return skillId.replace(/^file:/, "").split(/[-_]/g).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || skillId;
}

function lineCount(value: string): number {
  return value.split("\n").filter((line) => line.trim().length > 0).length;
}
