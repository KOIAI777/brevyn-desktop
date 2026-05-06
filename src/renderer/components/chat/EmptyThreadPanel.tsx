import { Bot } from "lucide-react";
import type { Course, UclawTask } from "@/types/domain";

export function EmptyThreadPanel({ course, task }: { course?: Course; task?: UclawTask }) {
  return (
    <div className="mx-auto mt-[12vh] w-full max-w-2xl rounded-lg border bg-card/80 px-5 py-4 shadow-sm ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{task ? task.title : course?.name || "New thread"}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            这个线程还没有消息。可以直接问课程材料、让 Agent 查 RAG、拆 assignment rubric，或者测试一次 Git/edit approval timeline。
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1">search_course_materials</span>
            <span className="rounded-md bg-muted px-2 py-1">enabled skills</span>
            <span className="rounded-md bg-muted px-2 py-1">context window</span>
            <span className="rounded-md bg-muted px-2 py-1">tool approval</span>
          </div>
        </div>
      </div>
    </div>
  );
}
