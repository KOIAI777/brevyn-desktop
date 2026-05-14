import type { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp, Circle, ClipboardList, FileText, Loader2, Minimize2, Plus, Send, ShieldAlert, ShieldCheck, Square, X } from "lucide-react";
import type { AgentAttachment, AgentPermissionMode, ModelProviderConfig, WorkspaceFileKind, WorkspaceFileNode } from "@/types/domain";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";

const CHAT_BODY_WIDTH_CLASS = "mx-auto w-full max-w-[58rem]";

interface AgentTodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface ContextUsage {
  inputTokens: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  contextWindow?: number;
}

interface AgentComposerProps {
  dockRef: Ref<HTMLDivElement>;
  todos: AgentTodoItem[];
  running: boolean;
  planMode: boolean;
  permissionMode: AgentPermissionMode;
  contextUsage: ContextUsage | null;
  autoCompactThresholdPercent: number;
  compacting: boolean;
  threadId: string;
  agentProviders: ModelProviderConfig[];
  activeProviderId: string;
  files: WorkspaceFileNode[];
  onSetPlanMode: (value: boolean | ((current: boolean) => boolean)) => void;
  onSetPermissionMode: (mode: AgentPermissionMode) => void;
  onRun: (prompt: string, mode?: "execute" | "plan", permissionMode?: AgentPermissionMode, attachments?: AgentAttachment[], providerSelection?: { providerId?: string; modelId?: string }) => Promise<void>;
  onStop: () => Promise<void>;
  onCompact: () => void;
  onSelectProvider: (providerId: string) => Promise<void>;
}

export function AgentComposer({
  dockRef,
  todos,
  running,
  planMode,
  permissionMode,
  contextUsage,
  autoCompactThresholdPercent,
  compacting,
  threadId,
  agentProviders,
  activeProviderId,
  files,
  onSetPlanMode,
  onSetPermissionMode,
  onRun,
  onStop,
  onCompact,
  onSelectProvider,
}: AgentComposerProps) {
  const [promptValue, setPromptValue] = useState("");
  const [mentionedFiles, setMentionedFiles] = useState<WorkspaceFileNode[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const mentionableFiles = useMemo(() => flattenMentionableFiles(files), [files]);
  const mentionSuggestions = useMemo(() => filterMentionSuggestions(mentionableFiles, mentionQuery), [mentionableFiles, mentionQuery]);
  const providerOptions = useMemo(() => agentProviders
    .filter((provider) => provider.enabled)
    .flatMap((provider) => {
      const models = provider.models.filter((model) => model.enabled !== false);
      const orderedModels = [
        ...models.filter((model) => model.id === provider.selectedModel),
        ...models.filter((model) => model.id !== provider.selectedModel),
      ];
      return orderedModels.map((model) => ({
        value: providerModelValue(provider.id, model.id),
        label: model.name || model.id,
        detail: provider.name,
      }));
    }), [agentProviders]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = buildPromptWithMentions(promptValue.trim(), mentionedFiles);
    if ((!prompt && pendingAttachments.length === 0) || running) return;
    setPromptValue("");
    setMentionedFiles([]);
    setMentionQuery(null);
    const attachments = pendingAttachments;
    setPendingAttachments([]);
    try {
      await onRun(prompt || "请查看附件。", planMode ? "plan" : "execute", planMode ? "review" : permissionMode, attachments, parseProviderModelValue(activeProviderId));
    } catch (error) {
      setPendingAttachments((current) => mergeAttachments(attachments, current));
      throw error;
    }
  }

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setPromptValue(value);
    setMentionQuery(currentMentionQuery(value));
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function pickAttachments() {
    if (running) return;
    const next = await window.brevyn.attachments.pick(threadId);
    if (next.length) setPendingAttachments((current) => mergeAttachments(current, next));
  }

  async function addDroppedFiles(files: File[]) {
    if (running || files.length === 0) return;
    const pathItems: string[] = [];
    const dataItems: Promise<AgentAttachment>[] = [];
    for (const file of files) {
      const path = window.brevyn.attachments.pathForFile(file);
      if (path) {
        pathItems.push(path);
      } else {
        dataItems.push(fileToBase64(file).then((data) => window.brevyn.attachments.saveData({
          threadId,
          name: file.name || `pasted-file-${Date.now()}`,
          mediaType: file.type || undefined,
          data,
        })));
      }
    }
    const [savedPaths, ...savedData] = await Promise.all([
      pathItems.length ? window.brevyn.attachments.savePaths({ threadId, paths: pathItems }) : Promise.resolve([]),
      ...dataItems,
    ]);
    setPendingAttachments((current) => mergeAttachments(current, [...savedPaths, ...savedData]));
  }

  async function removeAttachment(attachment: AgentAttachment) {
    setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id));
    try {
      await window.brevyn.attachments.delete({ threadId, path: attachment.path });
    } catch (error) {
      console.error("[AgentComposer] Failed to delete pending attachment:", error);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    void addDroppedFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingFiles(false);
    void addDroppedFiles(Array.from(event.dataTransfer.files || []));
  }

  return (
    <form className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-5 pt-8 [background:linear-gradient(180deg,rgba(247,244,236,0),rgba(247,244,236,0.82))]" onSubmit={handleSubmit}>
      <div ref={dockRef} className={`${CHAT_BODY_WIDTH_CLASS} flex min-w-0 flex-col gap-2`}>
        {todos.length > 0 && <TodoDock todos={todos} running={running} />}
        <div
          className={`pointer-events-auto w-full min-w-0 rounded-2xl border p-3 shadow-[0_18px_52px_rgba(64,55,38,0.18)] ring-1 backdrop-blur-2xl transition ${
            draggingFiles
              ? "border-sky-200 bg-sky-50/72 ring-sky-100"
              : "border-white/55 bg-card/70 ring-border/45"
          }`}
          onDragOver={(event) => {
            if (running) return;
            event.preventDefault();
            setDraggingFiles(true);
          }}
          onDragLeave={() => setDraggingFiles(false)}
          onDrop={handleDrop}
        >
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  removable={!running}
                  onRemove={() => void removeAttachment(attachment)}
                />
              ))}
            </div>
          )}
          <textarea
            name="prompt"
            rows={1}
            value={promptValue}
            disabled={running}
            onChange={handlePromptChange}
            onKeyDown={handlePromptKeyDown}
            onPaste={handlePaste}
            placeholder={running ? "Brevyn is working..." : "Ask Brevyn about this thread..."}
            className="max-h-32 min-h-11 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <MentionSuggestions
              files={mentionSuggestions}
              onSelect={(file) => {
                setMentionedFiles((current) => current.some((item) => item.id === file.id) ? current : [...current, file]);
                setPromptValue((current) => replaceCurrentMention(current, file.name));
                setMentionQuery(null);
              }}
            />
          )}
          {mentionedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mentionedFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background/65 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-accent"
                  title={file.path}
                  onClick={() => setMentionedFiles((current) => current.filter((item) => item.id !== file.id))}
                >
                  <FileKindBadge kind={file.kind} />
                  <span className="max-w-40 truncate">@{file.name}</span>
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 shrink items-center gap-1.5">
              <button
                type="button"
                disabled={running}
                onClick={() => void pickAttachments()}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Add context"
                title="Add attachment"
              >
                <Plus className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => onSetPlanMode((current) => !current)}
                className={`inline-flex h-7 min-w-[58px] items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  planMode
                    ? "border-blue-200 bg-blue-50/85 text-blue-800 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
                    : "border-border/70 bg-background/55 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={planMode ? "Exit plan mode" : "Plan mode"}
              >
                <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Plan</span>
              </button>
            </div>

            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
              <ContextUsageButton
                usage={contextUsage}
                autoCompactThresholdPercent={autoCompactThresholdPercent}
                compacting={compacting}
                compactDisabled={running || !contextUsage || contextUsage.inputTokens <= 0}
                onCompact={onCompact}
              />
              <div className="group/permission relative shrink-0">
                <button
                  type="button"
                  disabled={running || planMode}
                  onClick={() => onSetPermissionMode(permissionMode === "full_access" ? "review" : "full_access")}
                  className={`inline-flex h-7 w-8 items-center justify-center rounded-full transition hover:bg-accent/70 disabled:cursor-not-allowed disabled:opacity-45 ${
                    !planMode && permissionMode === "full_access" ? "text-amber-600" : "text-muted-foreground"
                  }`}
                  aria-label={planMode ? "Review" : permissionMode === "full_access" ? "Full Access" : "Review"}
                >
                  {!planMode && permissionMode === "full_access"
                    ? <ShieldAlert className="h-4 w-4" strokeWidth={2.1} />
                    : <ShieldCheck className="h-4 w-4" strokeWidth={2.1} />}
                </button>
                <div className="pointer-events-none absolute bottom-full right-0 z-[80] mb-2 w-52 translate-y-1 rounded-xl border border-white/60 bg-card/95 px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-[0_14px_36px_rgba(64,55,38,0.16)] ring-1 ring-border/50 backdrop-blur-xl transition duration-150 group-hover/permission:translate-y-0 group-hover/permission:opacity-100 group-focus-within/permission:translate-y-0 group-focus-within/permission:opacity-100">
                  <p className="font-semibold text-foreground">{!planMode && permissionMode === "full_access" ? "Full Access" : "Review"}</p>
                  <p className="mt-0.5">{!planMode && permissionMode === "full_access" ? "可直接写入；危险命令仍需确认" : "写入前先请求确认"}</p>
                  {!running && !planMode && <p className="mt-1 text-[10px] text-muted-foreground/80">点击切换到 {permissionMode === "full_access" ? "Review" : "Full Access"}</p>}
                </div>
              </div>
              <DropdownSelect
                value={activeProviderId}
                options={providerOptions}
                onChange={(providerId) => void onSelectProvider(providerId)}
                placeholder="Select model"
                ariaLabel="Select agent model"
                disabled={providerOptions.length === 0}
                className="w-[132px] shrink-0 sm:w-[156px]"
                buttonClassName="h-7 rounded-full border border-border/70 bg-background/55 px-2 text-[11px] font-semibold shadow-sm backdrop-blur"
                menuClassName="bg-card/95 backdrop-blur-xl"
                menuMinWidth={172}
              />
              {running ? (
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:scale-[1.03]"
                  onClick={() => void onStop()}
                  aria-label="Stop agent run"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function MentionSuggestions({
  files,
  onSelect,
}: {
  files: WorkspaceFileNode[];
  onSelect: (file: WorkspaceFileNode) => void;
}) {
  return (
    <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-white/55 bg-card/95 p-1.5 shadow-[0_16px_44px_rgba(64,55,38,0.16)] ring-1 ring-border/35 backdrop-blur-2xl brevyn-scrollbar">
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-accent/70"
          onClick={() => onSelect(file)}
        >
          <FileKindBadge kind={file.kind} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-foreground">{file.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{file.path}</span>
          </span>
          {file.sizeLabel && <span className="shrink-0 text-[10px] text-muted-foreground">{file.sizeLabel}</span>}
        </button>
      ))}
    </div>
  );
}

function FileKindBadge({ kind }: { kind: WorkspaceFileKind }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border bg-background/70 px-1 text-[9px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
      {fileKindLabel(kind)}
    </span>
  );
}

function providerModelValue(providerId: string, modelId: string): string {
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function parseProviderModelValue(value: string): { providerId?: string; modelId?: string } {
  const [providerId, modelId] = value.split("::");
  if (!providerId || !modelId) return {};
  return {
    providerId: decodeURIComponent(providerId),
    modelId: decodeURIComponent(modelId),
  };
}

function flattenMentionableFiles(files: WorkspaceFileNode[]): WorkspaceFileNode[] {
  const result: WorkspaceFileNode[] = [];
  const visit = (node: WorkspaceFileNode) => {
    if (node.children?.length) {
      node.children.forEach(visit);
      return;
    }
    result.push(node);
  };
  files.forEach(visit);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function filterMentionSuggestions(files: WorkspaceFileNode[], query: string | null): WorkspaceFileNode[] {
  if (query === null) return [];
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? files.filter((file) => `${file.name} ${file.path}`.toLowerCase().includes(normalized))
    : files;
  return filtered.slice(0, 8);
}

function currentMentionQuery(value: string): string | null {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1] || "" : null;
}

function replaceCurrentMention(value: string, label: string): string {
  return value.replace(/(^|\s)@([^\s@]*)$/, (_match, prefix: string) => `${prefix}@${label} `);
}

function buildPromptWithMentions(prompt: string, files: WorkspaceFileNode[]): string {
  if (files.length === 0) return prompt;
  const refs = files
    .map((file) => `- ${file.name}: ${file.sourcePath || file.path}`)
    .join("\n");
  return `<attached_files>\n${refs}\n</attached_files>\n\n${prompt}`;
}

function AttachmentChip({
  attachment,
  removable,
  onRemove,
}: {
  attachment: AgentAttachment;
  removable: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-border/70 bg-background/70 py-1 pl-2 pr-1 text-[11px] font-medium text-foreground shadow-sm"
      title={attachment.path}
    >
      <FileTypeIcon name={attachment.name} size={15} />
      <span className="max-w-44 truncate">{attachment.name}</span>
      {attachment.sizeLabel && <span className="text-[10px] text-muted-foreground">{attachment.sizeLabel}</span>}
      {removable && (
        <button
          type="button"
          className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function mergeAttachments(current: AgentAttachment[], next: AgentAttachment[]): AgentAttachment[] {
  const seen = new Set(current.map((item) => item.path));
  return [...current, ...next.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  })];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read attachment."));
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

function fileKindLabel(kind: WorkspaceFileKind): string {
  if (kind === "markdown") return "MD";
  if (kind === "image") return "IMG";
  if (kind === "unknown") return "FILE";
  return kind;
}

function TodoDock({ todos, running }: { todos: AgentTodoItem[]; running: boolean }) {
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
        <div className="min-h-0 overflow-hidden rounded-2xl border border-white/55 bg-card/95 shadow-[0_18px_48px_rgba(64,55,38,0.18)] ring-1 ring-border/35 backdrop-blur-2xl">
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
        className="flex h-9 w-full items-center gap-2 rounded-2xl border border-white/55 bg-card/72 px-3 text-[11px] shadow-[0_10px_28px_rgba(64,55,38,0.10)] ring-1 ring-border/30 backdrop-blur-2xl transition hover:bg-card"
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

function ContextUsageButton({
  usage,
  autoCompactThresholdPercent,
  compacting,
  compactDisabled,
  onCompact,
}: {
  usage: ContextUsage | null;
  autoCompactThresholdPercent: number;
  compacting: boolean;
  compactDisabled: boolean;
  onCompact: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const showMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const hideMenuSoon = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 90);
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open || compacting || !usage) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 256;
      setMenuPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 12),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [compacting, open, usage]);

  if (compacting) {
    return (
      <button
        type="button"
        disabled
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
        title="正在压缩上下文"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </button>
    );
  }
  if (!usage) return null;

  const ratio = usage.contextWindow ? clampNumber(usage.inputTokens / usage.contextWindow, 0, 1) : 0;
  const compactThresholdRatio = clampNumber(autoCompactThresholdPercent, 50, 95) / 100;
  const compactThreshold = usage.contextWindow ? usage.contextWindow * compactThresholdRatio : 0;
  const warning = compactThreshold > 0 ? usage.inputTokens / compactThreshold >= 0.8 : false;
  const percent = usage.contextWindow ? Math.round((usage.inputTokens / usage.contextWindow) * 100) : undefined;
  const pureInput = Math.max(0, usage.inputTokens - (usage.cacheReadTokens || 0) - (usage.cacheCreationTokens || 0));
  const ringStyle = {
    background: `conic-gradient(${warning ? "#d97706" : "#334155"} ${Math.round(ratio * 360)}deg, rgba(120,113,108,0.18) 0deg)`,
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/60 shadow-sm transition hover:scale-[1.03] hover:bg-background ${
          warning ? "border-amber-200 text-amber-800" : "border-white/50 text-muted-foreground"
        }`}
        aria-label="Context usage"
        title="Context usage"
        onMouseEnter={showMenu}
        onMouseLeave={hideMenuSoon}
        onFocus={showMenu}
        onBlur={hideMenuSoon}
      >
        <span className="absolute inset-[5px] rounded-full" style={ringStyle} />
        <span className="absolute inset-[8px] rounded-full bg-card" />
        <Circle className="relative h-2 w-2 fill-current" />
      </button>
      {open && createPortal(
        <div
          className="fixed z-[120] w-64 -translate-y-full rounded-2xl border border-white/65 bg-card/95 p-3 text-xs shadow-[0_18px_48px_rgba(64,55,38,0.18)] ring-1 ring-border/50 backdrop-blur-xl"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onMouseEnter={showMenu}
          onMouseLeave={hideMenuSoon}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-foreground">本轮上下文用量</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {usage.contextWindow ? `${formatTokens(usage.inputTokens)} / ${formatTokens(usage.contextWindow)}` : `${formatTokens(usage.inputTokens)} used`}
              </p>
            </div>
            {percent !== undefined && (
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${warning ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                {percent}%
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-1.5">
            <ContextUsageRow label="输入" value={pureInput} />
            <ContextUsageRow label="输出" value={usage.outputTokens} />
            <ContextUsageRow label="缓存读取" value={usage.cacheReadTokens} />
            <ContextUsageRow label="缓存写入" value={usage.cacheCreationTokens} />
          </div>
          <button
            type="button"
            className={`mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              warning
                ? "border-amber-300 bg-amber-500 text-white hover:bg-amber-600"
                : "border-border bg-background/70 text-foreground hover:bg-accent"
            }`}
            disabled={compactDisabled}
            onClick={() => {
              setOpen(false);
              onCompact();
            }}
          >
            <Minimize2 className="h-3.5 w-3.5" />
            压缩上下文
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ContextUsageRow({ label, value }: { label: string; value?: number }) {
  if (!value || value <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value.toLocaleString()}</span>
    </div>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${trimNumber(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trimNumber(tokens / 1_000)}K`;
  return String(tokens);
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
