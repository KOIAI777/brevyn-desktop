import { PreviewPill, ToolCodeBlock, ToolDetailsShell } from "@/components/agent/tool-cards/shared";
import type { ToolCardHelpers, ToolResultBlock, ToolUseBlock } from "@/components/agent/tool-cards/types";
import { getParsedToolResult, getToolResultText, recordObject, stringValue } from "@/components/agent/tool-cards/toolModel";

const BREVYN_DATA_TOOLS = new Set([
  "mcp__brevyn__course_structure",
  "mcp__brevyn__list_course_files",
  "mcp__brevyn__get_file_record",
]);

export function isBrevynDataTool(toolName: string): boolean {
  return BREVYN_DATA_TOOLS.has(toolName);
}

export function BrevynDataResultDetails({
  toolUse,
  result,
}: {
  toolUse: ToolUseBlock;
  result?: ToolResultBlock;
} & ToolCardHelpers) {
  const output = result ? getToolResultText(result) : "";
  const summary = result && !result.isError ? summarizeOutput(toolUse.name, result) : null;

  return (
    summary ? (
      <ToolDetailsShell className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {summary.pills.map((pill) => (
            <PreviewPill key={`${pill.label}:${pill.value}`} label={pill.label} value={pill.value} />
          ))}
        </div>
        {summary.preview && (
          <p className="mt-2 line-clamp-3 break-words text-[11px] leading-5 text-muted-foreground">
            {summary.preview}
          </p>
        )}
      </ToolDetailsShell>
    ) : result ? (
      <ToolDetailsShell>
        <ToolCodeBlock maxHeight="max-h-44" className="text-[11px] leading-5">
          {output || "没有返回内容。"}
        </ToolCodeBlock>
      </ToolDetailsShell>
    ) : null
  );
}

interface Summary {
  status: string;
  suffix: string;
  preview: string;
  pills: Array<{ label: string; value: string }>;
}

function summarizeOutput(toolName: string, result: ToolResultBlock): Summary | null {
  const root = recordObject(getParsedToolResult(result));
  if (toolName === "mcp__brevyn__course_structure") return courseStructureSummary(root);
  if (toolName === "mcp__brevyn__list_course_files") return listFilesSummary(root);
  if (toolName === "mcp__brevyn__get_file_record") return fileRecordSummary(root);
  return null;
}

function courseStructureSummary(root: Record<string, unknown>): Summary {
  const courses = Array.isArray(root.courses) ? root.courses : [];
  const semester = recordObject(root.semester);
  const course = recordObject(root.course);
  const task = recordObject(root.task);
  const semesterName = stringValue(semester.name ?? semester.label ?? semester.title, "");
  const courseName = stringValue(course.name ?? course.title, "");
  const taskName = stringValue(task.title ?? task.name, "");
  return {
    status: `${courses.length} 门课程`,
    suffix: courses.length > 0 ? `${courses.length} 门课程` : "当前结构",
    preview: [semesterName, courseName, taskName].filter(Boolean).join(" · "),
    pills: [
      { label: "Courses", value: String(courses.length) },
      ...(semesterName ? [{ label: "Semester", value: semesterName }] : []),
    ],
  };
}

function listFilesSummary(root: Record<string, unknown>): Summary {
  const files = Array.isArray(root.files) ? root.files : Array.isArray(root.items) ? root.items : [];
  const firstNames = files.slice(0, 3).map((item) => {
    const file = recordObject(item);
    return stringValue(file.name ?? file.fileName ?? file.path, "");
  }).filter(Boolean);
  return {
    status: `${files.length} 个文件`,
    suffix: `${files.length} 个文件`,
    preview: firstNames.join(" · "),
    pills: [{ label: "Files", value: String(files.length) }],
  };
}

function fileRecordSummary(root: Record<string, unknown>): Summary {
  const record = recordObject(root.file ?? root.record ?? root);
  const name = stringValue(record.name ?? record.fileName ?? record.path, "文件记录");
  const section = stringValue(record.sectionKind ?? record.section ?? record.bucket, "");
  return {
    status: "1 个记录",
    suffix: name,
    preview: stringValue(record.path ?? record.sourcePath, ""),
    pills: [
      { label: "File", value: name },
      ...(section ? [{ label: "Section", value: section }] : []),
    ],
  };
}
