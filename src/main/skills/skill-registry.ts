import type { SkillItem } from "../../types/domain";

export interface SkillBlueprint {
  id: string;
  name: string;
  description: string;
  version: string;
  defaultEnabled: boolean;
  instructions: string;
}

export const BUILTIN_SKILL_BLUEPRINTS: SkillBlueprint[] = [
  {
    id: "assignment-coach",
    name: "Assignment Coach",
    description: "Turn rubrics and assignment briefs into a short execution plan.",
    version: "0.1.0",
    defaultEnabled: true,
    instructions:
      "把 rubric、作业说明和已知材料转成可执行的检查清单。先确认缺失信息，再给出最短可行计划，最后把下一步拆成可完成的小任务。",
  },
  {
    id: "citation-helper",
    name: "Citation Helper",
    description: "Keep claims tied to source snippets and citation anchors.",
    version: "0.1.0",
    defaultEnabled: true,
    instructions:
      "把每个结论尽量绑定到检索到的证据片段上。遇到证据不足时先检索，再回答；遇到引用不稳时先提醒用户。",
  },
  {
    id: "file-librarian",
    name: "Course File Librarian",
    description: "Route course files into shared, week, and task workspaces.",
    version: "0.1.0",
    defaultEnabled: true,
    instructions:
      "负责课程文件的整理语义：识别 shared / week / task 归属，优先保留课程、周次和任务的结构线索，再决定如何归档和索引。",
  },
  {
    id: "exam-review",
    name: "Exam Review",
    description: "Build issue-spotter drills and exam revision plans.",
    version: "0.1.0",
    defaultEnabled: false,
    instructions:
      "把考试范围拆成高频考点、易错点和练习清单。优先给最短复习路线，再根据用户反馈加深到具体题型。",
  },
  {
    id: "workspace-editor",
    name: "Workspace Editor",
    description: "Handle local file inspection, Git status, and patch-oriented edits.",
    version: "0.1.0",
    defaultEnabled: false,
    instructions:
      "做本地编辑之前先读状态、看差异、再小步修改。写操作优先通过补丁完成，涉及 Git 的动作先确认风险和范围。",
  },
];

export function formatEnabledSkillPrompt(skills: SkillItem[]): string {
  const enabled = skills.filter((skill) => skill.enabled);
  if (enabled.length === 0) return "- none";

  return enabled
    .map((skill) => {
      const instructions = skill.instructions?.trim() || "Use this skill when it matches the user's task.";
      return [`- ${skill.name}`, `  ${instructions}`].join("\n");
    })
    .join("\n");
}
