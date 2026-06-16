import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type {
  BrevynTask,
  Course,
  CourseFileSectionKind,
  RagSearchResult,
  SemesterWorkspace,
  SourceCandidateProposeInput,
  SourceCandidateProposeResult,
  Thread,
  WorkspaceFileNode,
} from "../../types/domain";
import type { SQLiteBusinessStore } from "../storage";
import { flattenFiles } from "../services/workspace-file-tree";
import {
  SEMESTER_HOME_COURSE_ID,
  TASK_FILE_BUCKETS,
  courseWorkspaceDir,
  semesterWorkspaceDir,
  taskBucketLabel,
  taskWorkspaceDirForTask,
} from "../services/workspace-paths";

export interface BrevynMcpContext {
  thread: Thread;
  semester: SemesterWorkspace;
  course: Course | null;
  task: BrevynTask | null;
  cwd: string;
}

export interface BrevynMcpServerOptions {
  sdk: ClaudeSdkRuntime;
  rootDataDir: string;
  businessStore: SQLiteBusinessStore;
  ragSearch?: (input: { query: string; courseId?: string; taskId?: string; sectionKind?: CourseFileSectionKind; limit?: number }) => Promise<RagSearchResult[]>;
  proposeExternalSource?: (input: SourceCandidateProposeInput) => SourceCandidateProposeResult;
  context: BrevynMcpContext;
}

type ClaudeSdkRuntime = typeof ClaudeAgentSdk;

const SECTION_SCHEMA = z.enum(["course_shared", "lecture", "task"]);
const SOURCE_SCOPE_SCHEMA = z.enum(["task", "course"]);

export function createBrevynMcpServer(options: BrevynMcpServerOptions): McpServerConfig {
  const { sdk } = options;
  return sdk.createSdkMcpServer({
    name: "brevyn",
    version: "0.1.0",
    tools: [
      sdk.tool(
        "course_structure",
        "Return the current Brevyn semester/course/task structure and semantic workspace roots. Use this before reading files when folder meaning matters.",
        {
          courseId: z.string().optional().describe("Optional course id in the current semester. Omit to use the current agent scope."),
        },
        async (args) => brevynToolResult(courseStructure(options, args.courseId)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      sdk.tool(
        "list_course_files",
        "List Brevyn workspace file records for the current course or task. Returns file ids, names, semantic sections, and paths. For text/code files use Read/Grep on paths; for PDF, DOCX, PPTX, XLSX, and other binary documents use the matching Skill or command-line extraction workflow.",
        {
          courseId: z.string().optional().describe("Optional course id in the current semester. Omit to use the current agent scope."),
          sectionKind: SECTION_SCHEMA.optional().describe("Optional semantic section filter: course_shared, lecture, or task."),
          taskId: z.string().optional().describe("Optional task id filter. In a task workspace, omitted filters default to the current task."),
          limit: z.number().int().min(1).max(200).optional().describe("Maximum records to return. Defaults to 80, max 200."),
        },
        async (args) => brevynToolResult(listCourseFiles(options, args)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      sdk.tool(
        "get_file_record",
        "Look up one Brevyn workspace file record by fileId. Returns metadata and the managed workspace path. Use Read for ordinary text/code files; use the matching Skill or command-line extraction workflow for PDF, DOCX, PPTX, XLSX, and other binary documents.",
        {
          fileId: z.string().min(1).describe("Brevyn workspace file id returned by list_course_files."),
        },
        async (args) => brevynToolResult(getFileRecord(options, args.fileId)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      sdk.tool(
        "rag_search",
        "Search indexed Brevyn course materials. In a semester thread this searches all visible courses; in a course or task thread it defaults to the current course or task. Use this for course-material questions, rubric evidence, lecture concepts, and assignment evidence before opening source files. Open text/code with Read; extract PDF/Office documents with matching Skills or command-line tools.",
        {
          query: z.string().min(1).describe("Natural language search query for course materials."),
          courseId: z.string().optional().describe("Optional course id in the current semester. Omit to use the current agent scope."),
          taskId: z.string().optional().describe("Optional task id filter. In a task workspace, omitted filters default to the current task."),
          sectionKind: SECTION_SCHEMA.optional().describe("Optional semantic section filter: course_shared, lecture, or task."),
          limit: z.number().int().min(1).max(12).optional().describe("Maximum evidence chunks to return. Defaults to 6, max 12."),
        },
        async (args) => brevynToolResult(await ragSearch(options, args)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      sdk.tool(
        "propose_external_source",
        "Put a useful web source into Brevyn's user-confirmation card. Use this immediately after WebSearch/WebFetch finds a URL that may help the current course or task. Calling this tool is how you ask the user to confirm; do not first ask in chat whether to save the source. This does not download or index the source.",
        {
          url: z.string().min(1).describe("Public web URL to propose."),
          title: z.string().min(1).describe("Human-readable source title."),
          reason: z.string().min(1).describe("Why this source is useful for the current course or task."),
          snippet: z.string().optional().describe("Short relevant excerpt or summary."),
          siteName: z.string().optional().describe("Website or publisher name."),
          scope: SOURCE_SCOPE_SCHEMA.optional().describe("Save target if accepted. Defaults to task in a task thread, otherwise course."),
        },
        async (args) => brevynToolResult(proposeExternalSource(options, args)),
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
      ),
    ],
  });
}

function courseStructure(options: BrevynMcpServerOptions, requestedCourseId?: string) {
  const { context } = options;
  const courseId = resolveCourseId(options, requestedCourseId);
  if (courseId === SEMESTER_HOME_COURSE_ID) {
    const semesterDir = semesterWorkspaceDir(options.rootDataDir, context.semester.id);
    const courses = options.businessStore.listCourses(context.semester.id)
      .filter((course) => course.id !== SEMESTER_HOME_COURSE_ID && !course.archivedAt)
      .map((course) => ({
        id: course.id,
        name: course.name,
        code: course.code,
        instructor: course.instructor,
        path: courseWorkspaceDir(options.rootDataDir, context.semester.id, course.id),
      }));
    return {
      scope: "semester_home",
      cwd: context.cwd,
      semester: compactSemester(context.semester),
      roots: [
        root("semester_shared", join(semesterDir, "Semester shared"), "Shared files for the whole semester."),
        root("courses", join(semesterDir, "courses"), "Container for course workspaces."),
        root("threads", join(semesterDir, "threads"), "Agent JSONL conversation logs."),
      ],
      courses,
    };
  }

  const course = requireCourseInSemester(options, courseId);
  const tasks = options.businessStore.listTasks(context.semester.id, course.id);
  const courseDir = courseWorkspaceDir(options.rootDataDir, context.semester.id, course.id);
  return {
    scope: context.task && context.task.courseId === course.id ? "task" : "course",
    cwd: context.cwd,
    semester: compactSemester(context.semester),
    course: compactCourse(course),
    currentTask: context.task && context.task.courseId === course.id ? compactTask(context.task) : null,
    roots: [
      root("course_shared", join(courseDir, "Course shared"), "Reusable files for this course."),
      root("lecture", join(courseDir, "Lecture"), "Lecture notes, slides, and class materials."),
      root("task_root", join(courseDir, "Task"), "Container for task workspaces."),
    ],
    tasks: tasks.map((task) => ({
      ...compactTask(task),
      path: taskWorkspaceDirForTask(courseDir, task),
    })),
    currentTaskBuckets: context.task && context.task.courseId === course.id
      ? taskBuckets(courseDir, context.task)
      : [],
  };
}

function listCourseFiles(
  options: BrevynMcpServerOptions,
  args: { courseId?: string; sectionKind?: CourseFileSectionKind; taskId?: string; limit?: number },
) {
  const courseId = resolveCourseId(options, args.courseId);
  if (courseId !== SEMESTER_HOME_COURSE_ID) requireCourseInSemester(options, courseId);
  const files = flattenFiles(options.businessStore.listWorkspaceFiles(options.context.semester.id, courseId));
  const taskId = resolveTaskFilter(options, courseId, args);
  const filtered = files
    .filter((file) => file.kind !== "folder")
    .filter((file) => !args.sectionKind || file.sectionKind === args.sectionKind)
    .filter((file) => !taskId || file.taskId === taskId);
  const limit = args.limit || 80;
  const records = filtered.slice(0, limit).map((file) => compactFile(file));
  return {
    semesterId: options.context.semester.id,
    courseId,
    defaultedToCurrentTask: Boolean(!args.courseId && !args.sectionKind && !args.taskId && options.context.task && courseId === options.context.task.courseId),
    filters: {
      sectionKind: args.sectionKind || null,
      taskId: taskId || null,
    },
    count: records.length,
    totalMatched: filtered.length,
    truncated: filtered.length > records.length,
    files: records,
  };
}

function getFileRecord(options: BrevynMcpServerOptions, fileId: string) {
  const file = options.businessStore.getWorkspaceFile(fileId);
  if (!file) throw new Error(`File not found: ${fileId}`);
  assertFileVisibleInContext(options, file);
  return {
    semesterId: options.context.semester.id,
    file: compactFile(file),
  };
}

async function ragSearch(
  options: BrevynMcpServerOptions,
  args: { query: string; courseId?: string; taskId?: string; sectionKind?: CourseFileSectionKind; limit?: number },
) {
  if (!options.ragSearch) throw new Error("RAG search is not available in this Brevyn runtime.");
  const courseId = resolveCourseId(options, args.courseId);
  const searchCourseId = courseId === SEMESTER_HOME_COURSE_ID ? undefined : courseId;
  if (searchCourseId) {
    requireCourseInSemester(options, searchCourseId);
  }
  const taskId = searchCourseId ? resolveTaskFilter(options, searchCourseId, args) : undefined;
  const limit = args.limit || 6;
  const results = await options.ragSearch({
    query: args.query,
    courseId: searchCourseId,
    taskId,
    sectionKind: args.sectionKind,
    limit,
  });
  return {
    query: args.query,
    filters: {
      scope: searchCourseId ? "course" : "semester",
      courseId: searchCourseId || null,
      taskId: taskId || null,
      sectionKind: args.sectionKind || null,
      limit,
    },
    count: results.length,
    results: results.map(compactRagResult),
  };
}

function proposeExternalSource(
  options: BrevynMcpServerOptions,
  args: { url: string; title: string; reason: string; snippet?: string; siteName?: string; scope?: "task" | "course" },
) {
  if (!options.proposeExternalSource) throw new Error("External source candidates are not available in this Brevyn runtime.");
  if (!options.context.course) throw new Error("候选来源需要在具体课程或作业会话里提交。");
  const scope = args.scope || (options.context.task ? "task" : "course");
  if (scope === "task" && !options.context.task) throw new Error("当前不是作业会话，不能提交到作业范围。");
  const result = options.proposeExternalSource({
    courseId: options.context.course.id,
    taskId: scope === "task" ? options.context.task?.id : undefined,
    threadId: options.context.thread.id,
    scope,
    url: args.url,
    title: args.title,
    reason: args.reason,
    snippet: args.snippet,
    siteName: args.siteName,
  });
  return {
    ...result,
    scope,
    course: compactCourse(options.context.course),
    task: scope === "task" && options.context.task ? compactTask(options.context.task) : null,
  };
}

function resolveCourseId(options: BrevynMcpServerOptions, requestedCourseId?: string): string {
  const requested = requestedCourseId?.trim();
  if (requested) {
    if (requested === SEMESTER_HOME_COURSE_ID) return SEMESTER_HOME_COURSE_ID;
    return requireCourseInSemester(options, requested).id;
  }
  return options.context.course?.id || SEMESTER_HOME_COURSE_ID;
}

function resolveTaskFilter(
  options: BrevynMcpServerOptions,
  courseId: string,
  args: { courseId?: string; sectionKind?: CourseFileSectionKind; taskId?: string },
): string | undefined {
  if (args.taskId) {
    const task = options.businessStore.getTask(args.taskId);
    if (!task || task.semesterId !== options.context.semester.id || task.courseId !== courseId) {
      throw new Error(`Task ${args.taskId} does not belong to this course.`);
    }
    return task.id;
  }
  if (!args.courseId && !args.sectionKind && options.context.task && options.context.task.courseId === courseId) {
    return options.context.task.id;
  }
  return undefined;
}

function requireCourseInSemester(options: BrevynMcpServerOptions, courseId: string): Course {
  const course = options.businessStore.getCourse(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);
  if (course.semesterId !== options.context.semester.id) throw new Error(`Course ${courseId} is outside the current semester.`);
  if (course.archivedAt) throw new Error(`Course ${course.name} is archived.`);
  return course;
}

function assertFileVisibleInContext(options: BrevynMcpServerOptions, file: WorkspaceFileNode): void {
  if (file.semesterId !== options.context.semester.id) throw new Error("File is outside the current semester.");
  if (file.courseId !== SEMESTER_HOME_COURSE_ID) requireCourseInSemester(options, file.courseId);
  if (options.context.course && file.courseId !== options.context.course.id) {
    throw new Error("File is outside the current course.");
  }
}

function compactSemester(semester: SemesterWorkspace) {
  return {
    id: semester.id,
    semesterNo: semester.semesterNo,
    term: semester.term,
    folderName: semester.folderName,
  };
}

function compactCourse(course: Course) {
  return {
    id: course.id,
    name: course.name,
    code: course.code,
    instructor: course.instructor,
  };
}

function compactTask(task: BrevynTask) {
  return {
    id: task.id,
    title: task.title,
    taskType: task.taskType,
    status: task.status,
    dueAt: task.dueAt,
    summary: task.summary,
  };
}

function taskBuckets(courseDir: string, task: BrevynTask) {
  const taskPath = taskWorkspaceDirForTask(courseDir, task);
  return TASK_FILE_BUCKETS.map((bucket) => ({
    bucket,
    label: taskBucketLabel(bucket),
    path: join(taskPath, taskBucketLabel(bucket)),
  }));
}

function compactFile(file: WorkspaceFileNode) {
  const readPath = file.sourcePath && existsSync(file.sourcePath) ? file.sourcePath : undefined;
  return {
    fileId: file.id,
    name: file.name,
    kind: file.kind,
    path: file.path,
    readPath,
    size: file.sizeLabel,
    updatedAt: file.updatedAt,
    courseId: file.courseId,
    taskId: file.taskId,
    sectionKind: file.sectionKind,
    taskFileBucket: file.taskFileBucket,
    weekNumber: file.weekNumber,
  };
}

function compactRagResult(result: RagSearchResult) {
  return {
    fileId: result.fileId || "",
    fileName: result.fileName || result.title,
    path: result.path || result.source,
    sectionKind: result.sectionKind || null,
    taskId: result.taskId || null,
    chunkIndex: result.chunkIndex,
    chunkCount: result.chunkCount,
    score: result.score,
    citation: result.citation,
    text: result.excerpt,
  };
}

function root(purpose: string, path: string, description: string) {
  return { purpose, path, description, exists: existsSync(path) };
}

function brevynToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: summarizeToolResultForModel(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function summarizeToolResultForModel(value: unknown): string {
  const data = recordOf(value);
  const scope = stringValue(data.scope, "");
  if (scope === "semester_home" || scope === "course" || scope === "task") return summarizeCourseStructure(data);
  if (Array.isArray(data.files)) return summarizeCourseFiles(data);
  if (data.file) return summarizeFileRecord(data);
  if (Array.isArray(data.results)) return summarizeRagResults(data);
  if (data.status && data.message && (data.candidate || data.status === "existing_source")) return summarizeSourceCandidateProposal(data);
  return JSON.stringify(value);
}

function summarizeSourceCandidateProposal(data: Record<string, unknown>): string {
  const candidate = recordOf(data.candidate);
  const title = stringValue(candidate.title, "external source");
  const status = stringValue(data.status, "created");
  const message = stringValue(data.message, "候选来源已提交给用户确认。");
  if (status === "existing_source") return `Brevyn source candidate: ${message}`;
  return [
    `Brevyn source candidate: ${message}`,
    `- Title: ${title}`,
    `- Scope: ${stringValue(data.scope, "course")}`,
    "- Next: Tell the user this source is waiting in the Brevyn confirmation card. Do not ask again whether to save it.",
  ].join("\n");
}

function summarizeCourseStructure(data: Record<string, unknown>): string {
  const lines = ["Brevyn course structure:"];
  const semester = recordOf(data.semester);
  const course = recordOf(data.course);
  const currentTask = recordOf(data.currentTask);
  lines.push(`- Scope: ${stringValue(data.scope, "unknown")}`);
  lines.push(`- CWD: ${stringValue(data.cwd, "")}`);
  const semesterLabel = [stringValue(semester.term, ""), stringValue(semester.folderName, "")].filter(Boolean).join(" / ");
  if (semesterLabel) lines.push(`- Semester: ${semesterLabel}`);
  const courseLabel = [stringValue(course.name, ""), stringValue(course.code, "")].filter(Boolean).join(" / ");
  if (courseLabel) lines.push(`- Course: ${courseLabel}`);
  const taskTitle = stringValue(currentTask.title, "");
  if (taskTitle) lines.push(`- Current task: ${taskTitle}`);
  const roots = arrayOfRecords(data.roots);
  if (roots.length > 0) {
    lines.push("- Roots:");
    for (const item of roots) {
      lines.push(`  - ${stringValue(item.purpose, "root")}: ${stringValue(item.path, "")}`);
    }
  }
  const courses = arrayOfRecords(data.courses);
  if (courses.length > 0) {
    lines.push(`- Active courses (${courses.length}): ${courses.map((item) => stringValue(item.name, "course")).join(", ")}`);
  }
  const tasks = arrayOfRecords(data.tasks);
  if (tasks.length > 0) {
    lines.push(`- Tasks (${tasks.length}): ${tasks.map((item) => stringValue(item.title, "task")).join(", ")}`);
  }
  return lines.join("\n");
}

function summarizeCourseFiles(data: Record<string, unknown>): string {
  const files = arrayOfRecords(data.files);
  const totalMatched = typeof data.totalMatched === "number" ? data.totalMatched : files.length;
  const lines = [
    `Brevyn file records: ${files.length}/${totalMatched} matched${data.truncated ? " (truncated)" : ""}.`,
  ];
  for (const file of files.slice(0, 80)) {
    const name = stringValue(file.name, "file");
    const section = stringValue(file.sectionKind, "unknown");
    const path = stringValue(file.readPath ?? file.path, "");
    lines.push(`- ${name} [${section}]${path ? `: ${path}` : ""}`);
  }
  return lines.join("\n");
}

function summarizeFileRecord(data: Record<string, unknown>): string {
  const file = recordOf(data.file);
  return [
    "Brevyn file record:",
    `- Name: ${stringValue(file.name, "file")}`,
    `- Section: ${stringValue(file.sectionKind, "unknown")}`,
    `- Path: ${stringValue(file.readPath ?? file.path, "")}`,
  ].join("\n");
}

function summarizeRagResults(data: Record<string, unknown>): string {
  const results = arrayOfRecords(data.results);
  const lines = [`Brevyn RAG results: ${results.length}`];
  for (const result of results) {
    const file = stringValue(result.fileName ?? result.path, "source");
    const text = stringValue(result.text, "").replace(/\s+/g, " ").trim();
    lines.push(`- ${file}: ${text}`);
  }
  return lines.join("\n");
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap((item) => {
    const record = recordOf(item);
    return Object.keys(record).length > 0 ? [record] : [];
  }) : [];
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
