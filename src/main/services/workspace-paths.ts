import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  Course,
  FileImportInput,
  SemesterWorkspace,
  TaskFileBucket,
  TaskType,
  Thread,
  UclawTask,
} from "../../types/domain";

export const SEMESTER_HOME_COURSE_ID = "semester-home";

export const DEFAULT_TASK_TYPE = "Assignment";

const TASK_FILE_BUCKET_LABELS: Record<TaskFileBucket, string> = {
  materials: "Materials",
  drafts: "Drafts",
  submitted: "Submitted",
};

export const TASK_FILE_BUCKETS: TaskFileBucket[] = ["materials", "drafts", "submitted"];

/**
 * Render a user-defined task type as a folder-safe label.
 * Empty / whitespace falls back to DEFAULT_TASK_TYPE.
 */
export function taskTypeLabel(taskType: TaskType): string {
  const trimmed = (taskType || "").trim();
  return trimmed ? sanitizeFsSegment(trimmed) : DEFAULT_TASK_TYPE;
}

export function taskBucketLabel(bucket: TaskFileBucket): string {
  return TASK_FILE_BUCKET_LABELS[bucket] || "Materials";
}

export function folderNameForCourse(course: Course, semester?: SemesterWorkspace): string {
  if (course.workspaceKind === "semester_home" || course.id === SEMESTER_HOME_COURSE_ID) {
    return semester?.folderName || course.term || "Semester";
  }
  return course.name || "Course";
}

export function sanitizeFsSegment(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "workspace";
}

export function semesterWorkspaceDir(rootDataDir: string, semesterId: string): string {
  return join(rootDataDir, "semesters", semesterId);
}

export function ensureSemesterWorkspaceDir(rootDataDir: string, semesterId: string): string {
  const dir = semesterWorkspaceDir(rootDataDir, semesterId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureSemesterSharedDirs(rootDataDir: string, semesterId: string): string {
  const dir = ensureSemesterWorkspaceDir(rootDataDir, semesterId);
  mkdirSync(join(dir, "Semester shared"), { recursive: true });
  mkdirSync(join(dir, "courses"), { recursive: true });
  return dir;
}

export function courseWorkspaceDir(rootDataDir: string, semesterId: string, courseId: string): string {
  return join(semesterWorkspaceDir(rootDataDir, semesterId), "courses", courseId);
}

export function ensureCourseWorkspaceDir(rootDataDir: string, semesterId: string, courseId: string): string {
  const dir = courseWorkspaceDir(rootDataDir, semesterId, courseId);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "Course shared"), { recursive: true });
  mkdirSync(join(dir, "Lecture"), { recursive: true });
  mkdirSync(join(dir, "Task"), { recursive: true });
  return dir;
}

export function taskWorkspaceDir(courseDir: string, taskType: TaskType, title: string): string {
  return join(courseDir, "Task", taskTypeLabel(taskType), sanitizeFsSegment(title));
}

export function ensureTaskWorkspaceDir(rootDataDir: string, semesterId: string, task: UclawTask): string {
  const courseDir = ensureCourseWorkspaceDir(rootDataDir, semesterId, task.courseId);
  const taskDir = taskWorkspaceDir(courseDir, task.taskType, task.title);
  mkdirSync(taskDir, { recursive: true });
  for (const bucket of TASK_FILE_BUCKETS) {
    mkdirSync(join(taskDir, taskBucketLabel(bucket)), { recursive: true });
  }
  return taskDir;
}

/**
 * Resolve the agent workspace cwd for a given thread.
 *
 * - semester-home thread → the entire semester directory (home agent sees all courses)
 * - task thread          → the specific task directory
 * - course-home thread   → the course directory
 */
export function workspacePathForThread(
  rootDataDir: string,
  thread: Thread,
  resolveTask: (taskId: string) => UclawTask | undefined,
): string {
  const semesterId = thread.semesterId;
  if (!semesterId) {
    throw new Error(`Cannot resolve workspace path: thread ${thread.id} has no semesterId`);
  }
  if (thread.threadType === "semester_home" || thread.courseId === SEMESTER_HOME_COURSE_ID) {
    return ensureSemesterSharedDirs(rootDataDir, semesterId);
  }
  if (thread.taskId) {
    const task = resolveTask(thread.taskId);
    if (task) {
      return ensureTaskWorkspaceDir(rootDataDir, semesterId, task);
    }
  }
  return ensureCourseWorkspaceDir(rootDataDir, semesterId, thread.courseId);
}

export function ensureImportTargetDir(
  rootDataDir: string,
  semesterId: string,
  input: FileImportInput,
  resolveTaskTitle: (taskId: string) => { title: string; taskType: TaskType } | undefined,
): string {
  if (input.courseId === SEMESTER_HOME_COURSE_ID) {
    const dir = join(ensureSemesterWorkspaceDir(rootDataDir, semesterId), "Semester shared");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  const courseDir = ensureCourseWorkspaceDir(rootDataDir, semesterId, input.courseId);
  if (input.targetSection === "course_shared") {
    const dir = join(courseDir, "Course shared");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  if (input.targetSection === "lecture") {
    const dir = join(courseDir, "Lecture");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  const task = input.taskId ? resolveTaskTitle(input.taskId) : undefined;
  const taskType = task?.taskType || DEFAULT_TASK_TYPE;
  const title = task?.title || "Task workspace";
  const taskDir = taskWorkspaceDir(courseDir, taskType, title);
  const bucketDir = join(taskDir, taskBucketLabel(input.taskFileBucket || "materials"));
  mkdirSync(bucketDir, { recursive: true });
  return bucketDir;
}
