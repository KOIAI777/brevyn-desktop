export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: unknown;
  isError: boolean;
  contentText?: string;
  rawResult?: unknown;
  toolUseResult?: unknown;
}

export interface ReadFileResult {
  filePath: string;
  content: string;
  startLine: number;
  totalLines?: number;
  numLines?: number;
}

export interface WebSearchLink {
  title: string;
  url: string;
}

export interface AgentTaskSummary {
  id: string;
  subject: string;
  description?: string;
  status?: string;
  owner?: string;
  blocks?: string[];
  blockedBy?: string[];
}

export interface ToolDiffStats {
  additions: number;
  deletions: number;
}

export interface DiffRow {
  type: "added" | "removed" | "context";
  lineNumber: number;
  text: string;
}

export interface DiffHunk {
  id: string;
  rows: DiffRow[];
}

export interface ToolPhrase {
  label: string;
  status: string;
  target: string;
  diffLabel: string;
  failed: boolean;
  running: boolean;
}

export function getToolPhrase(toolUse: ToolUseBlock, result?: ToolResultBlock): ToolPhrase {
  const descriptor = getToolDescriptor(toolUse.name);
  const target = getToolTarget(toolUse.name, toolUse.input);
  const running = !result;
  const failed = result?.isError === true;
  const diff = getToolDiffStats(toolUse.name, toolUse.input);
  const diffLabel = diff && !failed ? formatDiffStats(diff) : "";
  const label = running ? descriptor.running : failed ? descriptor.failed : descriptor.done;
  return {
    label,
    status: running ? "运行中" : failed ? getToolErrorSummary(result) : getToolSuccessSummary(toolUse, result),
    target,
    diffLabel,
    failed,
    running,
  };
}

export function getToolTitle(toolName: string, input: unknown): string {
  const descriptor = getToolDescriptor(toolName);
  const target = getToolTarget(toolName, input);
  const diff = getToolDiffStats(toolName, input);
  const diffLabel = diff ? formatDiffStats(diff) : "";
  return [descriptor.neutral, target, diffLabel].filter(Boolean).join(" · ");
}

export function getToolResultSummary(result: ToolResultBlock): string {
  if (result.isError) return `失败 · ${getToolErrorSummary(result)}`;
  const content = getToolResultText(result);
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  return lines.length > 1 ? `${lines.length} lines` : "成功";
}

export function getToolErrorSummary(result?: ToolResultBlock): string {
  const text = getToolResultText(result).replace(/\s+/g, " ").trim();
  if (!text) return "未知错误";
  const match = text.match(/(?:Error|error):\s*([^".。]+)|([^".。]+(?:not found|does not exist|permission denied|denied|failed)[^".。]*)/i);
  return (match?.[1] || match?.[2] || text).trim();
}

export function getToolSuccessSummary(toolUse: ToolUseBlock, result?: ToolResultBlock): string {
  if (!result) return "运行中";
  if (result.isError) return getToolErrorSummary(result);
  if (toolUse.name === "Glob" || toolUse.name === "Grep") return `${countResultRows(getToolResultText(result))} 条结果`;
  if (toolUse.name === "WebSearch") return `${webSearchResultCount(result)} 个结果`;
  if (toolUse.name === "TodoRead" || toolUse.name === "TodoWrite") return todoStatus(toolUse, result);
  if (isTaskTool(toolUse.name)) return taskStatus(toolUse.name, result);
  return getToolResultSummary(result);
}

export function getToolTarget(toolName: string, input: unknown): string {
  const data = recordObject(input);
  if (toolName === "Bash") return singleLine(stringValue(data.command, "command"));
  if (toolName === "Grep") return singleLine(stringValue(data.pattern, "pattern"));
  if (toolName === "Glob") return singleLine(stringValue(data.pattern, "pattern"));
  if (toolName === "WebFetch") return stringValue(data.url, "URL");
  if (toolName === "WebSearch") return singleLine(webSearchQueryFromInput(data) || "query");
  if (toolName === "Skill") return singleLine(stringValue(data.skill ?? data.name ?? data.skillName, "skill"));
  if (toolName === "TodoRead" || toolName === "TodoWrite") return "";
  if (toolName === "TaskCreate") return singleLine(stringValue(data.subject, "task"));
  if (toolName === "TaskGet" || toolName === "TaskUpdate") return singleLine(stringValue(data.subject ?? data.taskId, "task"));
  if (toolName === "TaskList") return "";
  if (toolName === "mcp__brevyn__rag_search") return singleLine(stringValue(data.query, "query"));
  return stringValue(data.file_path ?? data.filePath ?? data.path ?? data.notebook_path, "");
}

export function getToolDiffHunks(toolName: string, input: unknown): DiffHunk[] {
  const data = recordObject(input);
  if (toolName === "Write") {
    const content = typeof data.content === "string" ? data.content : "";
    return content ? [{ id: "write", rows: rowsFromText(content, "added", 1) }] : [];
  }
  if (toolName === "Edit") {
    const rows = editRows(data);
    return rows.length > 0 ? [{ id: "edit", rows }] : [];
  }
  if (toolName === "MultiEdit") {
    const edits = Array.isArray(data.edits) ? data.edits : [];
    return edits
      .map((edit, index) => ({ id: `edit-${index}`, rows: editRows(recordObject(edit)) }))
      .filter((hunk) => hunk.rows.length > 0);
  }
  return [];
}

export function getToolDiffStats(toolName: string, input: unknown): ToolDiffStats | null {
  const hunks = getToolDiffHunks(toolName, input);
  if (hunks.length === 0) return null;
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    additions += hunk.rows.filter((row) => row.type === "added").length;
    deletions += hunk.rows.filter((row) => row.type === "removed").length;
  }
  return additions > 0 || deletions > 0 ? { additions, deletions } : null;
}

export function formatDiffStats(diff: ToolDiffStats): string {
  const parts: string[] = [];
  if (diff.additions > 0) parts.push(`+${diff.additions}`);
  if (diff.deletions > 0) parts.push(`-${diff.deletions}`);
  return parts.join(" ");
}

export function truncatePreview(value: string): string {
  const maxLength = 6000;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n... truncated for display`;
}

export function getStructuredToolResult(result?: ToolResultBlock): unknown {
  if (!result) return undefined;
  const raw = result.toolUseResult ?? result.rawResult;
  const rawObject = recordObject(raw);
  if (rawObject.structuredContent !== undefined) return rawObject.structuredContent;
  return raw;
}

export function getParsedToolResult(result?: ToolResultBlock): unknown {
  const structured = getStructuredToolResult(result);
  if (structured !== undefined && structured !== null) return structured;
  const text = getToolResultText(result).trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function getToolSearchLinks(result?: ToolResultBlock): WebSearchLink[] {
  const structured = linksFromStructuredContent(getParsedToolResult(result) ?? result?.content);
  if (structured.length > 0) return structured;
  const output = getToolResultText(result);
  const match = output.match(/Links:\s*(\[[\s\S]*?\])(?:\n|$)/);
  if (!match) return [];
  try {
    const raw = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const data = recordObject(item);
      const url = stringValue(data.url, "");
      if (!url) return [];
      return [{ title: stringValue(data.title, url), url }];
    });
  } catch {
    return [];
  }
}

function linksFromStructuredContent(content: unknown): WebSearchLink[] {
  const data = recordObject(content);
  const links = Array.isArray(data.links) ? data.links : [];
  return links.flatMap((item) => {
    const link = recordObject(item);
    const url = stringValue(link.url, "");
    if (!url) return [];
    return [{ title: stringValue(link.title, url), url }];
  });
}

export function getToolResultText(result?: ToolResultBlock): string {
  if (!result) return "";
  if (typeof result.contentText === "string") return cleanToolResultContent(result.contentText);
  return formatToolResultContent(result.content);
}

export function getReadFileResult(result?: ToolResultBlock): ReadFileResult | null {
  const raw = recordObject(result?.toolUseResult ?? result?.rawResult);
  const file = recordObject(raw.file);
  const content = typeof file.content === "string" ? file.content : "";
  if (!content && !file.filePath) return null;
  return {
    filePath: stringValue(file.filePath ?? file.path, ""),
    content,
    startLine: numericValue(file.startLine) ?? 1,
    totalLines: numericValue(file.totalLines) ?? undefined,
    numLines: numericValue(file.numLines) ?? undefined,
  };
}

export function isTaskTool(toolName: string): boolean {
  return toolName === "TaskCreate" || toolName === "TaskGet" || toolName === "TaskUpdate" || toolName === "TaskList";
}

export function getTaskFromResult(result?: ToolResultBlock): AgentTaskSummary | null {
  const parsed = recordObject(getParsedToolResult(result));
  const task = recordObject(parsed.task);
  if (!task.id && !task.subject) return null;
  return taskSummary(task);
}

export function getTasksFromResult(result?: ToolResultBlock): AgentTaskSummary[] {
  const parsed = recordObject(getParsedToolResult(result));
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  return tasks.map((task) => taskSummary(recordObject(task))).filter((task) => task.id || task.subject);
}

export function taskStatusLabel(status: string | undefined): string {
  if (status === "in_progress" || status === "running") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "killed" || status === "stopped") return "已停止";
  if (status === "deleted") return "已删除";
  return "待处理";
}

export function formatToolResultContent(value: unknown): string {
  if (typeof value === "string") return cleanToolResultContent(value);
  if (Array.isArray(value)) {
    const parts = value.flatMap((item) => {
      const data = recordObject(item);
      if (typeof data.text === "string") return [data.text];
      if (typeof data.content === "string") return [data.content];
      return [formatUnknown(item)];
    });
    return cleanToolResultContent(parts.join("\n"));
  }
  const data = recordObject(value);
  if (typeof data.stdout === "string" || typeof data.stderr === "string") {
    return cleanToolResultContent([data.stdout, data.stderr].filter((part) => typeof part === "string" && part.trim()).join("\n"));
  }
  if (typeof data.text === "string") return cleanToolResultContent(data.text);
  if (typeof data.content === "string") return cleanToolResultContent(data.content);
  return formatUnknown(value);
}

export function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function singleLine(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function getToolDescriptor(toolName: string): { neutral: string; running: string; done: string; failed: string } {
  if (toolName === "Read") return { neutral: "读取", running: "正在读取", done: "已读取", failed: "读取失败" };
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") return { neutral: "编辑", running: "正在编辑", done: "已编辑", failed: "编辑失败" };
  if (toolName === "Bash") return { neutral: "运行命令", running: "正在运行命令", done: "已运行命令", failed: "命令失败" };
  if (toolName === "Grep") return { neutral: "搜索内容", running: "正在搜索内容", done: "已搜索内容", failed: "搜索失败" };
  if (toolName === "Glob") return { neutral: "查找文件", running: "正在查找文件", done: "已查找文件", failed: "查找失败" };
  if (toolName === "WebFetch") return { neutral: "读取网页", running: "正在读取网页", done: "已读取网页", failed: "网页读取失败" };
  if (toolName === "WebSearch") return { neutral: "搜索网络", running: "正在搜索网络", done: "已搜索网络", failed: "网络搜索失败" };
  if (toolName === "Skill") return { neutral: "使用技能", running: "正在使用技能", done: "已使用技能", failed: "技能调用失败" };
  if (toolName === "TodoRead") return { neutral: "读取任务", running: "正在读取任务", done: "已读取任务", failed: "任务读取失败" };
  if (toolName === "TodoWrite") return { neutral: "更新任务", running: "正在更新任务", done: "已更新任务", failed: "任务更新失败" };
  if (toolName === "TaskCreate") return { neutral: "创建任务", running: "正在创建任务", done: "已创建任务", failed: "任务创建失败" };
  if (toolName === "TaskGet") return { neutral: "读取任务", running: "正在读取任务", done: "已读取任务", failed: "任务读取失败" };
  if (toolName === "TaskUpdate") return { neutral: "更新任务", running: "正在更新任务", done: "已更新任务", failed: "任务更新失败" };
  if (toolName === "TaskList") return { neutral: "读取任务列表", running: "正在读取任务列表", done: "已读取任务列表", failed: "任务列表读取失败" };
  if (toolName === "mcp__brevyn__course_structure") return { neutral: "读取课程结构", running: "正在读取课程结构", done: "已读取课程结构", failed: "课程结构读取失败" };
  if (toolName === "mcp__brevyn__list_course_files") return { neutral: "读取课程文件", running: "正在读取课程文件", done: "已读取课程文件", failed: "课程文件读取失败" };
  if (toolName === "mcp__brevyn__get_file_record") return { neutral: "读取文件记录", running: "正在读取文件记录", done: "已读取文件记录", failed: "文件记录读取失败" };
  if (toolName === "mcp__brevyn__rag_search") return { neutral: "检索课程材料", running: "正在检索课程材料", done: "已检索课程材料", failed: "课程材料检索失败" };
  if (toolName.startsWith("mcp__brevyn__")) return { neutral: `Brevyn · ${toolName.replace("mcp__brevyn__", "")}`, running: "正在调用 Brevyn", done: "已调用 Brevyn", failed: "Brevyn 调用失败" };
  return { neutral: `Tool · ${toolName}`, running: "正在调用工具", done: "已调用工具", failed: "工具调用失败" };
}

function webSearchQueryFromInput(input: Record<string, unknown>): string {
  const direct = stringValue(input.query, "");
  if (direct) return direct;
  const queries = Array.isArray(input.queries) ? input.queries : [];
  for (const query of queries) {
    if (typeof query === "string" && query.trim()) return query.trim();
    const object = recordObject(query);
    const value = stringValue(object.query ?? object.search_query ?? object.text, "");
    if (value) return value;
  }
  return "";
}

function editRows(input: Record<string, unknown>): DiffRow[] {
  const oldString = typeof input.old_string === "string" ? input.old_string : "";
  const newString = typeof input.new_string === "string" ? input.new_string : "";
  const startLine = numericValue(input.line_number ?? input.start_line ?? input.startLine) ?? 1;
  return [
    ...rowsFromText(oldString, "removed", startLine),
    ...rowsFromText(newString, "added", startLine),
  ];
}

function rowsFromText(value: string, type: DiffRow["type"], startLine: number): DiffRow[] {
  if (!value) return [];
  const lines = value.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line, index) => ({
    type,
    lineNumber: startLine + index,
    text: line,
  }));
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  return null;
}

function cleanToolResultContent(value: string): string {
  return value
    .replace(/<tool_use_error>/gi, "")
    .replace(/<\/tool_use_error>/gi, "")
    .trim();
}

function countResultRows(output: string): number {
  const trimmed = output.trim();
  if (!trimmed) return 0;
  const parsed = safeJsonParse(trimmed);
  if (Array.isArray(parsed)) return parsed.length;
  const data = recordObject(parsed);
  for (const key of ["matches", "files", "results"]) {
    if (Array.isArray(data[key])) return data[key].length;
  }
  return trimmed.split("\n").filter((line) => line.trim().length > 0).length;
}

function webSearchResultCount(result: ToolResultBlock): number {
  const parsed = recordObject(getParsedToolResult(result));
  const links = Array.isArray(parsed.links) ? parsed.links : [];
  if (links.length > 0) return links.length;
  const output = getToolResultText(result);
  const match = output.match(/Found\s+(\d+)\s+results?/i) || output.match(/(\d+)\s+results?/i);
  return match ? Number.parseInt(match[1] || "0", 10) || 0 : 0;
}

function todoStatus(toolUse: ToolUseBlock, result: ToolResultBlock): string {
  const inputTodos = todoItems(recordObject(toolUse.input).todos);
  const parsed = getParsedToolResult(result);
  const parsedObject = recordObject(parsed);
  const outputTodos = todoItems(Array.isArray(parsedObject.todos) ? parsedObject.todos : parsed);
  const todos = inputTodos.length > 0 ? inputTodos : outputTodos;
  if (todos.length === 0) return "已同步";
  const completed = todos.filter((item) => item.status === "completed").length;
  return `${todos.length} 项 · ${completed} 完成`;
}

function todoItems(value: unknown): Array<{ status: string }> {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => ({ status: stringValue(recordObject(item).status, "pending") }));
}

function taskStatus(toolName: string, result: ToolResultBlock): string {
  if (toolName === "TaskCreate") {
    const task = getTaskFromResult(result);
    return task?.subject ? task.subject : "已创建";
  }
  if (toolName === "TaskGet") {
    const task = getTaskFromResult(result);
    return task ? `${taskStatusLabel(task.status)} · ${task.subject || task.id}` : "未找到任务";
  }
  if (toolName === "TaskUpdate") {
    const parsed = recordObject(getParsedToolResult(result));
    const fields = Array.isArray(parsed.updatedFields) ? parsed.updatedFields.length : 0;
    const change = recordObject(parsed.statusChange);
    const status = stringValue(change.to, "");
    if (status) return `${taskStatusLabel(status)} · ${fields} 项更新`;
    return fields > 0 ? `${fields} 项更新` : stringValue(parsed.error, "已更新");
  }
  const tasks = getTasksFromResult(result);
  const completed = tasks.filter((task) => task.status === "completed").length;
  return `${tasks.length} 个任务${tasks.length > 0 ? ` · ${completed} 完成` : ""}`;
}

function taskSummary(task: Record<string, unknown>): AgentTaskSummary {
  return {
    id: stringValue(task.id, ""),
    subject: stringValue(task.subject ?? task.title, ""),
    description: stringValue(task.description, "") || undefined,
    status: stringValue(task.status, "") || undefined,
    owner: stringValue(task.owner, "") || undefined,
    blocks: stringArray(task.blocks),
    blockedBy: stringArray(task.blockedBy ?? task.blocked_by),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item] : []) : [];
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
