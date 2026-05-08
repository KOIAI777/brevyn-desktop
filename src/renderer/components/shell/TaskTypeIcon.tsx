import { BookOpen, ClipboardList, FileText, Presentation } from "lucide-react";
import type { UclawTask } from "@/types/domain";

/**
 * Pick an icon for a user-defined task type by keyword match.
 * Falls back to a clipboard icon for unknown types.
 */
export function TaskTypeIcon({ task }: { task: UclawTask }) {
  const type = (task.taskType || "").toLowerCase();
  if (type.includes("exam") || type.includes("考试") || type.includes("测试")) {
    return <BookOpen className="h-3.5 w-3.5 shrink-0 text-red-500" />;
  }
  if (type.includes("project") || type.includes("项目")) {
    return <Presentation className="h-3.5 w-3.5 shrink-0 text-purple-500" />;
  }
  if (type.includes("lecture") || type.includes("讲座") || type.includes("课件")) {
    return <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />;
  }
  return <ClipboardList className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
}
