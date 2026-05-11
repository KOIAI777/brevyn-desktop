import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type {
  BrevynTask,
  Course,
  CourseFileSectionKind,
  SemesterWorkspace,
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
  context: BrevynMcpContext;
}

type ClaudeSdkRuntime = typeof ClaudeAgentSdk;

const SECTION_SCHEMA = z.enum(["course_shared", "lecture", "task"]);

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
        async (args) => jsonToolResult(courseStructure(options, args.courseId)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      sdk.tool(
        "list_course_files",
        "List Brevyn workspace file records for the current course or task. Returns file ids, names, semantic sections, and paths. Use Read/Grep for actual file contents.",
        {
          courseId: z.string().optional().describe("Optional course id in the current semester. Omit to use the current agent scope."),
          sectionKind: SECTION_SCHEMA.optional().describe("Optional semantic section filter: course_shared, lecture, or task."),
          taskId: z.string().optional().describe("Optional task id filter. In a task workspace, omitted filters default to the current task."),
          limit: z.number().int().min(1).max(200).optional().describe("Maximum records to return. Defaults to 80, max 200."),
        },
        async (args) => jsonToolResult(listCourseFiles(options, args)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      sdk.tool(
        "get_file_record",
        "Look up one Brevyn workspace file record by fileId. Returns metadata and the managed workspace path to use with Read when available.",
        {
          fileId: z.string().min(1).describe("Brevyn workspace file id returned by list_course_files."),
        },
        async (args) => jsonToolResult(getFileRecord(options, args.fileId)),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
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
    tasks: tasks.map((task) => {
      const taskPath = taskWorkspaceDirForTask(courseDir, task);
      return {
        ...compactTask(task),
        path: taskPath,
        buckets: TASK_FILE_BUCKETS.map((bucket) => ({
          bucket,
          label: taskBucketLabel(bucket),
          path: join(taskPath, taskBucketLabel(bucket)),
        })),
      };
    }),
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

function root(purpose: string, path: string, description: string) {
  return { purpose, path, description, exists: existsSync(path) };
}

function jsonToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}
