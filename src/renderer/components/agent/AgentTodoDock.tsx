import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Circle, Loader2, Square } from "lucide-react";
import type { AgentTodoItem } from "@/components/agent/agentTimelineModel";

export function TodoDock({ todos, running }: { todos: AgentTodoItem[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  const completed = todos.filter((todo) => todo.status === "completed").length;
  const focusedTodo = running ? todos.find((todo) => todo.status === "in_progress") ?? todos.at(-1) : todos.at(-1);
  const pending = todos.length - completed;
  return (
    <div className="pointer-events-auto relative w-full">
      <div
        className={`absolute bottom-10 left-0 grid w-full transition-[grid-template-rows,opacity,transform] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "grid-rows-[1fr] translate-y-0 opacity-100" : "pointer-events-none grid-rows-[0fr] translate-y-2 opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden rounded-2xl border border-white/60 bg-[hsl(var(--card))] shadow-[0_14px_36px_rgba(64,55,38,0.14)] ring-1 ring-border/35">
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Todo list</p>
                <p className="text-[11px] text-muted-foreground">{completed}/{todos.length} completed</p>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close todo list"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1 brevyn-scrollbar">
              {todos.map((todo, index) => (
                <TodoRow key={`${todo.content}-${index}`} todo={todo} running={running} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-2xl border border-white/60 bg-[hsl(var(--card))] px-3 text-[11px] shadow-[0_10px_24px_rgba(64,55,38,0.10)] ring-1 ring-border/30 transition hover:bg-card"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Toggle todo list"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-700" /> : <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        <span className="shrink-0 font-semibold text-foreground">{completed}/{todos.length}</span>
        <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
          {focusedTodo?.content || `${pending} pending`}
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
    </div>
  );
}

function TodoRow({ todo, running }: { todo: AgentTodoItem; running: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] transition ${
        todo.status === "in_progress" && running ? "bg-amber-50 text-amber-900" : "text-muted-foreground"
      }`}
    >
      {todo.status === "completed" ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : todo.status === "in_progress" && running ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-700" />
      ) : todo.status === "in_progress" ? (
        <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      )}
      <span className={`${todo.status === "completed" ? "line-through opacity-70" : ""} truncate`}>
        {todo.content}
      </span>
    </div>
  );
}
