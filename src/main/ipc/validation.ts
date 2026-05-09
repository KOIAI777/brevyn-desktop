import type {
  ArchivedCourseScope,
  ArchivedThreadScope,
  CourseIconKey,
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  SkillImportInput,
  SkillUpdateInput,
  SkillWriteInput,
  TimetableRangeQuery,
  UpdateCourseInput,
  UpdateTaskInput,
} from "../../types/domain";

export function requireString(value: unknown, label: string): string {
  const text = stringValue(value).trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export function optionalString(value: unknown): string | undefined {
  const text = stringValue(value).trim();
  return text || undefined;
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function normalizeCreateSemesterInput(value: unknown): CreateSemesterInput {
  const input = requireObject(value, "Semester input");
  return {
    term: stringValue(input.term),
    folderName: optionalString(input.folderName),
    semesterNo: optionalString(input.semesterNo),
    startsAt: optionalString(input.startsAt),
    endsAt: optionalString(input.endsAt),
  };
}

export function normalizeCreateCourseInput(value: unknown): CreateCourseInput {
  const input = requireObject(value, "Course input");
  return {
    name: stringValue(input.name),
    code: stringValue(input.code),
    instructor: optionalString(input.instructor),
    meetingTime: optionalString(input.meetingTime),
    location: optionalString(input.location),
    color: optionalString(input.color),
    description: optionalString(input.description),
  };
}

export function normalizeUpdateCourseInput(value: unknown): UpdateCourseInput {
  const input = requireObject(value, "Course update input");
  return {
    id: requireString(input.id, "Course id"),
    code: input.code === undefined ? undefined : stringValue(input.code),
    instructor: input.instructor === undefined ? undefined : stringValue(input.instructor),
    meetingTime: input.meetingTime === null ? null : input.meetingTime === undefined ? undefined : stringValue(input.meetingTime),
    location: input.location === null ? null : input.location === undefined ? undefined : stringValue(input.location),
    color: input.color === undefined ? undefined : stringValue(input.color),
    icon: input.icon === undefined ? undefined : normalizeCourseIcon(input.icon),
  };
}

function normalizeCourseIcon(value: unknown): CourseIconKey {
  const icon = requireString(value, "Course icon");
  if (!COURSE_ICON_KEYS.has(icon as CourseIconKey)) throw new Error("Course icon is not supported.");
  return icon as CourseIconKey;
}

export function normalizeCreateTaskInput(value: unknown): CreateTaskInput {
  const input = requireObject(value, "Task input");
  return {
    courseId: requireString(input.courseId, "Course id"),
    title: stringValue(input.title),
    taskType: optionalString(input.taskType),
  };
}

export function normalizeUpdateTaskInput(value: unknown): UpdateTaskInput {
  const input = requireObject(value, "Task update input");
  return {
    id: requireString(input.id, "Task id"),
    dueAt: input.dueAt === null ? null : optionalString(input.dueAt),
    status: normalizeTaskStatus(input.status),
    summary: input.summary === undefined ? undefined : stringValue(input.summary),
  };
}

export function normalizeCreateThreadInput(value: unknown): CreateThreadInput {
  const input = requireObject(value, "Thread input");
  return {
    courseId: requireString(input.courseId, "Course id"),
    taskId: optionalString(input.taskId),
    title: optionalString(input.title),
  };
}

export function normalizeArchivedCourseScope(value: unknown): ArchivedCourseScope | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "Archived course scope");
  return { semesterId: optionalString(input.semesterId) };
}

export function normalizeArchivedThreadScope(value: unknown): ArchivedThreadScope | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "Archived thread scope");
  return {
    semesterId: optionalString(input.semesterId),
    courseId: optionalString(input.courseId),
  };
}

export function normalizeFileImportInput(value: unknown): FileImportInput {
  const input = requireObject(value, "File import input");
  const sourcePaths = Array.isArray(input.sourcePaths)
    ? input.sourcePaths.flatMap((item) => {
        const path = optionalString(item);
        return path ? [path] : [];
      })
    : undefined;
  return {
    courseId: requireString(input.courseId, "Course id"),
    targetSection: normalizeTargetSection(input.targetSection),
    sourcePaths,
    weekNumber: normalizeNumber(input.weekNumber),
    taskId: optionalString(input.taskId),
    taskFileBucket: normalizeTaskFileBucket(input.taskFileBucket),
  };
}

export function normalizeSkillImportInput(value: unknown): SkillImportInput {
  const input = value === undefined || value === null ? {} : requireObject(value, "Skill import input");
  return {
    sourcePath: optionalString(input.sourcePath),
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
  };
}

export function normalizeSkillUpdateInput(value: unknown): SkillUpdateInput {
  const input = requireObject(value, "Skill update input");
  return {
    id: requireString(input.id, "Skill id"),
    enabled: Boolean(input.enabled),
  };
}

export function normalizeSkillWriteInput(value: unknown): SkillWriteInput {
  const input = requireObject(value, "Skill write input");
  return {
    id: requireString(input.id, "Skill id"),
    content: stringValue(input.content),
  };
}

export function normalizeTimetableRangeQuery(value: unknown): TimetableRangeQuery {
  const input = requireObject(value, "Timetable range query");
  return {
    viewMode: input.viewMode === "month" || input.viewMode === "year" ? input.viewMode : "week",
    rangeStart: requireString(input.rangeStart, "Range start"),
    rangeEnd: requireString(input.rangeEnd, "Range end"),
    courseId: optionalString(input.courseId),
    includeSchoolEvents: input.includeSchoolEvents === undefined ? undefined : Boolean(input.includeSchoolEvents),
    includeDeadlines: input.includeDeadlines === undefined ? undefined : Boolean(input.includeDeadlines),
  };
}

function normalizeTaskStatus(value: unknown): UpdateTaskInput["status"] {
  return value === "not_started" || value === "in_progress" || value === "due_soon" || value === "done" ? value : undefined;
}

function normalizeTargetSection(value: unknown): FileImportInput["targetSection"] {
  if (value === "lecture" || value === "task") return value;
  return "course_shared";
}

function normalizeTaskFileBucket(value: unknown): FileImportInput["taskFileBucket"] {
  if (value === "drafts" || value === "submitted") return value;
  if (value === "materials") return value;
  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

const COURSE_ICON_KEYS = new Set<CourseIconKey>([
  "graduation-cap",
  "book-open",
  "scale",
  "landmark",
  "briefcase",
  "file-text",
  "gavel",
  "library",
  "microscope",
  "calculator",
  "globe",
  "presentation",
]);
