import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  Layers3,
  Save,
  Sparkles,
  TerminalSquare,
  Upload,
  Wrench,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { ActionButton } from "@/components/settings/shared/SettingsControls";
import { cx } from "@/lib/cn";
import type { GitStatus, SkillItem } from "../../../../types/domain";

export function SkillSettingsPage({
  skills,
  enabledSkills,
  gitStatus,
  selectedSkillId,
  skillContent,
  skillBusy,
  skillStatusLine,
  onSelectSkill,
  onSkillContentChange,
  onSaveSkill,
  onImportSkill,
  onOpenSkillFolder,
  onToggleSkill,
}: {
  skills: SkillItem[];
  enabledSkills: number;
  gitStatus: GitStatus | null;
  selectedSkillId: string;
  skillContent: string;
  skillBusy: boolean;
  skillStatusLine: string;
  onSelectSkill: (skillId: string) => void;
  onSkillContentChange: (content: string) => void;
  onSaveSkill: () => void;
  onImportSkill: () => void;
  onOpenSkillFolder: (skillId: string) => void;
  onToggleSkill: (skill: SkillItem) => void;
}) {
  const groupedSkills = useMemo(() => {
    return groupSkillsForSettings(skills);
  }, [skills]);
  const [expandedSkillGroups, setExpandedSkillGroups] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(groupedSkills.filter((group) => group.skills.length > 0).map((group) => [group.id, true]))
  ));
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId);
  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/20">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-3 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" />
            Skill 配置
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{enabledSkills} 个启用</span>
            <ActionButton icon={<Upload className="h-3.5 w-3.5" />} label="导入" onClick={onImportSkill} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] brevyn-scrollbar-thin">
          {groupedSkills.map((group) => (
            <SkillListGroup
              key={group.id}
              title={group.title}
              description={group.description}
              count={group.skills.length}
              skills={group.skills}
              emptyText={group.emptyText}
              expanded={expandedSkillGroups[group.id] ?? group.skills.length > 0}
              onToggleExpanded={() => setExpandedSkillGroups((current) => ({ ...current, [group.id]: !(current[group.id] ?? group.skills.length > 0) }))}
              selectedSkillId={selectedSkillId}
              onSelectSkill={onSelectSkill}
              onToggleSkill={onToggleSkill}
            />
          ))}
        </div>
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b bg-card p-3">
            <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
              <FileText className="h-3.5 w-3.5" />
              <span className="min-w-0 truncate" title={selectedSkill?.name || "技能内容"}>{selectedSkill?.name || "技能内容"}</span>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                label="打开"
                onClick={() => selectedSkill && onOpenSkillFolder(selectedSkill.id)}
              />
              <ActionButton icon={<Save className="h-3.5 w-3.5" />} label="保存" onClick={onSaveSkill} primary disabled={!selectedSkill || skillBusy || !skillContent.trim()} />
            </div>
          </div>
          </div>

          {selectedSkill ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [backface-visibility:hidden] [contain:layout_paint] [scrollbar-gutter:stable] brevyn-scrollbar">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.version}</span>
                {selectedSkill.category && <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.category}</span>}
                {!!selectedSkill.resources?.length && <span className="rounded bg-muted px-1.5 py-0.5">{selectedSkill.resources.length} 个资源</span>}
                {selectedSkill.sourcePath && <span className="min-w-0 max-w-full break-all rounded bg-muted px-1.5 py-0.5" title={selectedSkill.sourcePath}>{selectedSkill.sourcePath}</span>}
              </div>
              <div className="grid gap-2 rounded-lg border bg-background p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                <SkillMetaRow label="触发词" values={selectedSkill.triggers} />
                <SkillMetaRow label="标签" values={selectedSkill.tags} />
                <SkillMetaRow label="范围" values={selectedSkill.scopes} />
                <SkillMetaRow label="允许工具" values={selectedSkill.allowedTools} />
              </div>
              {!!selectedSkill.resources?.length && (
                <div className="rounded-lg border bg-background p-2">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
                    <Layers3 className="h-3.5 w-3.5" />
                    Skill 资源
                  </div>
                  <div className="max-h-40 space-y-1 overflow-auto pr-1 brevyn-scrollbar">
                    {selectedSkill.resources.slice(0, 24).map((resource) => (
                      <div key={resource.relativePath} className="flex items-center gap-2 rounded bg-muted/45 px-2 py-1 text-[11px] text-muted-foreground">
                        <span className="shrink-0 rounded bg-background px-1 py-0.5 text-[10px]">{resource.kind}</span>
                        <span className="min-w-0 flex-1 truncate">{resource.relativePath}</span>
                        <span className="shrink-0">{resource.sizeLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <textarea
                className="h-[360px] min-h-[280px] w-full resize-none rounded-lg border bg-background px-3 py-3 font-mono text-[12px] leading-5 text-foreground outline-none [scrollbar-gutter:stable] brevyn-scrollbar"
                value={skillContent}
                onChange={(event) => onSkillContentChange(event.target.value)}
                spellCheck={false}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                    <Layers3 className="h-3.5 w-3.5" />
                    Skill 运行时
                  </div>
                  <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
                    <MetricRow label="路由" value="已启用 Skill" />
                    <MetricRow label="范围" value="全局" />
                    <MetricRow label="上下文" value="感知上下文窗口" />
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                    <GitBranch className="h-3.5 w-3.5" />
                    Git / 编辑工具
                  </div>
                  <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
                    <div className="rounded-md bg-muted/50 px-2 py-2">
                      <span className="font-medium text-foreground">{gitStatus?.branch || "本地/mock"}</span>
                      <span> · </span>
                      <span>{gitStatus?.summary || "Git 服务占位实现已就绪。"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <ToolChip icon={<Wrench className="h-3 w-3" />} label="编辑文件" />
                      <ToolChip icon={<TerminalSquare className="h-3 w-3" />} label="运行命令" />
                      <ToolChip icon={<GitBranch className="h-3 w-3" />} label="git diff" />
                      <ToolChip icon={<Sparkles className="h-3 w-3" />} label="技能路由" />
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          ) : (
            <div className="m-3 rounded-md border border-dashed px-3 py-8 text-center text-[12px] text-muted-foreground">
              选择一个 Skill 查看或编辑它的 `SKILL.md`。
            </div>
          )}

          {skillStatusLine && <div className="mx-3 mb-3 mt-3 shrink-0 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">{skillStatusLine}</div>}
          {skillBusy && !skillStatusLine && <div className="mx-3 mb-3 mt-3 shrink-0 rounded-md bg-muted/55 px-2 py-2 text-[11px] text-muted-foreground">正在处理 Skill 文件...</div>}
        </section>
      </aside>
    </div>
  );
}

function SkillListGroup({
  title,
  description,
  count,
  skills,
  emptyText,
  expanded,
  onToggleExpanded,
  selectedSkillId,
  onSelectSkill,
  onToggleSkill,
}: {
  title: string;
  description?: string;
  count: number;
  skills: SkillItem[];
  emptyText?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  selectedSkillId: string;
  onSelectSkill: (skillId: string) => void;
  onToggleSkill: (skill: SkillItem) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 border-b border-border/55 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/45"
        onClick={onToggleExpanded}
      >
        <ChevronRight className={cx("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>{title}</span>
            <span className="tabular-nums">{count}</span>
          </span>
          {description && <span className="mt-1 block truncate text-[10px] leading-4 text-muted-foreground/75">{description}</span>}
        </span>
      </button>
      {expanded && (
        <div>
          {skills.length === 0 ? (
            <div className="px-3 py-4 text-[11px] leading-5 text-muted-foreground">{emptyText || "暂无"}</div>
          ) : (
            skills.map((skill) => (
              <SkillListItem
                key={skill.id}
                skill={skill}
                selected={skill.id === selectedSkillId}
                onSelect={() => onSelectSkill(skill.id)}
                onToggle={() => onToggleSkill(skill)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SkillSettingsGroup {
  id: SkillSettingsCategoryId | "featured";
  title: string;
  description?: string;
  emptyText?: string;
  skills: SkillItem[];
}

type SkillSettingsCategoryId =
  | "assignment"
  | "course"
  | "writing"
  | "documents"
  | "research"
  | "other";

const skillSettingsCategories: Array<{
  id: SkillSettingsCategoryId;
  title: string;
  description: string;
  emptyText: string;
}> = [
  {
    id: "assignment",
    title: "作业技能",
    description: "拆要求、对 rubric、找证据、做提交清单。",
    emptyText: "还没有安装作业类技能。后续 assignment-brief、rubric-checker 会显示在这里。",
  },
  {
    id: "course",
    title: "课程学习",
    description: "课件精读、周复习、考试复习、课堂材料整理。",
    emptyText: "还没有安装课程学习类技能。",
  },
  {
    id: "writing",
    title: "学术写作",
    description: "Essay、report、引用格式、结构和语言修改。",
    emptyText: "还没有安装学术写作类技能。",
  },
  {
    id: "documents",
    title: "展示与文档",
    description: "PDF、Word、PPT、表格等基础文件能力。",
    emptyText: "还没有安装文件处理类技能。",
  },
  {
    id: "research",
    title: "研究进阶",
    description: "文献综述、论文精读、Nature 风格、审稿回复等。",
    emptyText: "还没有安装研究进阶类技能。",
  },
  {
    id: "other",
    title: "我的技能",
    description: "用户导入或暂未归类的技能。",
    emptyText: "暂无其他技能。",
  },
];

function groupSkillsForSettings(skills: SkillItem[]): SkillSettingsGroup[] {
  const byName = (a: SkillItem, b: SkillItem) => a.name.localeCompare(b.name);
  const enabled = skills.filter((skill) => skill.enabled);
  const buckets = new Map<SkillSettingsCategoryId, SkillItem[]>(skillSettingsCategories.map((category) => [category.id, []]));

  for (const skill of enabled) {
    const category = skillSettingsCategoryForSkill(skill);
    buckets.get(category)?.push(skill);
  }

  const featured = enabled
    .filter((skill) => {
      const category = skillSettingsCategoryForSkill(skill);
      return category === "assignment" || category === "course" || category === "writing";
    })
    .sort(byName)
    .slice(0, 6);

  return [
    {
      id: "featured",
      title: "推荐",
      description: "优先展示适合大学作业和课程学习的技能。",
      emptyText: "当前还没有作业/课程/写作类技能。先从“展示与文档”使用基础文件能力。",
      skills: featured,
    },
    ...skillSettingsCategories.map((category) => ({
      ...category,
      skills: (buckets.get(category.id) || []).sort(byName),
    })),
  ];
}

function skillSettingsCategoryForSkill(skill: SkillItem): SkillSettingsCategoryId {
  const category = normalizedSkillText(skill.category);
  const haystack = normalizedSkillText([
    skill.slug,
    skill.id,
    skill.name,
    skill.description,
    skill.category,
    ...(skill.tags || []),
    ...(skill.triggers || []),
  ].filter(Boolean).join(" "));

  if (matchesAny(category, ["assignment", "homework", "作业", "rubric"])) return "assignment";
  if (matchesAny(category, ["course", "study", "lecture", "exam", "课程", "学习", "复习"])) return "course";
  if (matchesAny(category, ["writing", "essay", "academic writing", "写作", "论文"])) return "writing";
  if (matchesAny(category, ["document", "presentation", "spreadsheet", "file", "文档", "展示"])) return "documents";
  if (matchesAny(category, ["research", "paper", "literature", "nature", "研究", "文献"])) return "research";

  if (matchesAny(haystack, ["assignment", "homework", "rubric", "submission", "brief", "作业", "评分", "提交"])) return "assignment";
  if (matchesAny(haystack, ["week-review", "lecture", "course", "exam", "study", "课件", "课程", "复习", "考试"])) return "course";
  if (matchesAny(haystack, ["essay", "report", "apa", "mla", "citation", "write", "writing", "polish", "humanizer", "写作", "引用", "润色"])) return "writing";
  if (matchesAny(haystack, ["pdf", "docx", "pptx", "xlsx", "slides", "deck", "presentation", "spreadsheet", "word", "powerpoint", "文档", "幻灯片", "表格"])) return "documents";
  if (matchesAny(haystack, ["research", "paper", "literature", "reviewer", "response", "nature", "journal", "pubmed", "arxiv", "研究", "文献", "期刊", "审稿"])) return "research";
  return "other";
}

function normalizedSkillText(value?: string): string {
  return (value || "").toLowerCase();
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function SkillListItem({ skill, selected, onSelect, onToggle }: { skill: SkillItem; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cx(
        "group flex h-11 w-full cursor-pointer items-center gap-2 border-b border-border/45 px-3 text-left transition-colors",
        selected ? "bg-accent text-accent-foreground" : "bg-transparent hover:bg-muted/45",
        !skill.enabled && "opacity-55",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      title={`${skill.name}\n${skill.description}`}
    >
      <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", selected ? "bg-background/70 text-foreground" : "bg-background text-muted-foreground")}>
        <BookOpen className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 leading-none">
        <div className="truncate text-sm font-medium" title={skill.name}>{skill.name}</div>
        <div className={cx("mt-1 truncate text-[10px]", selected ? "text-accent-foreground/65" : "text-muted-foreground")}>
          {skill.category || skill.version || skill.id}
        </div>
      </div>
      <SkillSwitch enabled={skill.enabled} onClick={onToggle} />
    </div>
  );
}

function SkillSwitch({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  const label = enabled ? "停用 Skill" : "启用 Skill";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200",
        enabled ? "border-emerald-500 bg-emerald-500" : "border-border bg-muted hover:bg-muted/80",
      )}
    >
      <span
        className={cx(
          "pointer-events-none h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200",
          enabled ? "translate-x-[21px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SkillMetaRow({ label, values }: { label: string; values?: string[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</div>
      {values?.length ? (
        <div className="flex flex-wrap gap-1">
          {values.slice(0, 6).map((value) => (
            <span key={value} className="max-w-full truncate rounded-full border bg-background/70 px-1.5 py-0.5 text-[10px] leading-none">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/60">暂无</div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2 py-2">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function ToolChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1.5">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}
