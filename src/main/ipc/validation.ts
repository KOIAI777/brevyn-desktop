import type {
  ArchivedCourseScope,
  ArchivedThreadScope,
  AgentAttachment,
  AgentAskUserResponseInput,
  AgentApprovalInput,
  AgentExitPlanResponseInput,
  AgentQueueMessageInput,
  AgentRunInput,
  CourseIconKey,
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  RecognizedAcademicCalendar,
  RecognizedCalendarEvent,
  RecognizedCourseSchedule,
  RecognizedCourseSession,
  RecognizedCourseTimetable,
  RenameThreadInput,
  SkillImportInput,
  SkillUpdateInput,
  SkillWriteInput,
  TimetableRangeQuery,
  UpdateCourseInput,
  UpdateTaskInput,
  VisionRecognitionInput,
  WeekdayKey,
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
    isDraft: input.isDraft === undefined ? undefined : Boolean(input.isDraft),
  };
}

export function normalizeRenameThreadInput(value: unknown): RenameThreadInput {
  const input = requireObject(value, "Thread rename input");
  return {
    threadId: requireString(input.threadId, "Thread id"),
    title: requireString(input.title, "Thread title"),
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

export function normalizeAgentRunInput(value: unknown): AgentRunInput {
  const input = requireObject(value, "Agent run input");
  return {
    threadId: requireString(input.threadId, "Thread id"),
    prompt: requireString(input.prompt, "Prompt"),
    uuid: optionalString(input.uuid),
    mode: input.mode === "plan" ? "plan" : "execute",
    permissionMode: input.permissionMode === "full_access" ? "full_access" : "review",
    providerId: optionalString(input.providerId),
    modelId: optionalString(input.modelId),
    attachments: normalizeAgentAttachments(input.attachments),
  };
}

export function normalizeAgentQueueMessageInput(value: unknown): AgentQueueMessageInput {
  const input = requireObject(value, "Agent queue message input");
  return {
    threadId: requireString(input.threadId, "Thread id"),
    prompt: requireString(input.prompt, "Prompt"),
    uuid: optionalString(input.uuid),
    interrupt: input.interrupt === undefined ? undefined : Boolean(input.interrupt),
  };
}

export function normalizeVisionRecognitionInput(value: unknown): VisionRecognitionInput {
  const input = requireObject(value, "Vision recognition input");
  return {
    sourcePath: requireString(input.sourcePath, "Image path"),
    apply: input.apply === undefined ? undefined : Boolean(input.apply),
    providerId: optionalString(input.providerId),
    modelId: optionalString(input.modelId),
  };
}

export function normalizeRecognizedAcademicCalendar(value: unknown): RecognizedAcademicCalendar {
  const input = requireObject(value, "Academic calendar recognition result");
  return {
    kind: "academic_calendar",
    sourcePath: requireString(input.sourcePath, "Image path"),
    providerName: optionalString(input.providerName) || "Vision",
    modelId: optionalString(input.modelId) || "vision-model",
    semester: input.semester ? normalizeCreateSemesterInput(input.semester) : undefined,
    events: normalizeRecognizedCalendarEvents(input.events),
    warnings: normalizeStringArray(input.warnings),
  };
}

export function normalizeRecognizedCourseTimetable(value: unknown): RecognizedCourseTimetable {
  const input = requireObject(value, "Course timetable recognition result");
  return {
    kind: "course_timetable",
    sourcePath: requireString(input.sourcePath, "Image path"),
    providerName: optionalString(input.providerName) || "Vision",
    modelId: optionalString(input.modelId) || "vision-model",
    semesterLabel: optionalString(input.semesterLabel),
    courses: normalizeRecognizedCourses(input.courses),
    warnings: normalizeStringArray(input.warnings),
  };
}

function normalizeRecognizedCalendarEvents(value: unknown): RecognizedCalendarEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const input = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const title = optionalString(input.title);
    const startsAt = optionalString(input.startsAt);
    if (!title || !startsAt) return [];
    return [{
      title,
      startsAt,
      endsAt: optionalString(input.endsAt),
      notes: optionalString(input.notes),
      confidence: normalizeNumber(input.confidence),
    }];
  });
}

function normalizeRecognizedCourses(value: unknown): RecognizedCourseSchedule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const input = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const code = optionalString(input.code);
    const name = optionalString(input.name);
    if (!code || !name) return [];
    return [{
      code,
      name,
      section: optionalString(input.section),
      category: optionalString(input.category),
      instructor: optionalString(input.instructor),
      units: normalizeNumber(input.units),
      sessions: normalizeRecognizedSessions(input.sessions),
      confidence: normalizeNumber(input.confidence),
    }];
  });
}

function normalizeRecognizedSessions(value: unknown): RecognizedCourseSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const input = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const dayOfWeek = normalizeWeekday(input.dayOfWeek);
    const startTime = optionalString(input.startTime);
    const endTime = optionalString(input.endTime);
    if (!dayOfWeek || !startTime || !endTime) return [];
    return [{
      dayOfWeek,
      startTime,
      endTime,
      room: optionalString(input.room),
      weeks: optionalString(input.weeks),
      confidence: normalizeNumber(input.confidence),
    }];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = optionalString(item);
    return text ? [text] : [];
  });
}

function normalizeWeekday(value: unknown): WeekdayKey | undefined {
  const text = optionalString(value)?.toLowerCase().slice(0, 3);
  return text && ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(text) ? text as WeekdayKey : undefined;
}

function normalizeAgentAttachments(value: unknown): AgentAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const input = item as Record<string, unknown>;
    const path = optionalString(input.path);
    const name = optionalString(input.name);
    if (!path || !name) return [];
    return [{
      id: optionalString(input.id) || `attachment-${index}`,
      threadId: optionalString(input.threadId) || "",
      name,
      kind: typeof input.kind === "string" ? input.kind as AgentAttachment["kind"] : "unknown",
      mimeType: optionalString(input.mimeType),
      size: typeof input.size === "number" ? input.size : 0,
      sizeLabel: optionalString(input.sizeLabel) || "",
      path,
      createdAt: optionalString(input.createdAt) || new Date().toISOString(),
    }];
  });
  return attachments.length > 0 ? attachments : undefined;
}

export function normalizeAgentApprovalInput(value: unknown): AgentApprovalInput {
  const input = requireObject(value, "Agent approval input");
  return {
    threadId: requireString(input.threadId, "Thread id"),
    requestId: requireString(input.requestId, "Approval request id"),
  };
}

export function normalizeAgentAskUserResponseInput(value: unknown): AgentAskUserResponseInput {
  const input = requireObject(value, "Agent question response input");
  const answersInput = requireObject(input.answers, "Agent question answers");
  const answers: Record<string, string> = {};
  for (const [key, answer] of Object.entries(answersInput)) {
    answers[key] = typeof answer === "string" ? answer : String(answer ?? "");
  }
  return {
    threadId: requireString(input.threadId, "Thread id"),
    requestId: requireString(input.requestId, "Question request id"),
    answers,
  };
}

export function normalizeAgentExitPlanResponseInput(value: unknown): AgentExitPlanResponseInput {
  const input = requireObject(value, "Agent exit plan response input");
  return {
    threadId: requireString(input.threadId, "Thread id"),
    requestId: requireString(input.requestId, "Exit plan request id"),
    decision: input.decision === "approve" ? "approve" : "deny",
    feedback: optionalString(input.feedback),
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
