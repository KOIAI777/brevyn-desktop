import type {
  ArchivedCourseScope,
  ArchivedTaskScope,
  ArchivedThreadScope,
  AgentAttachment,
  AgentAskUserResponseInput,
  AgentApprovalInput,
  AgentExitPlanResponseInput,
  AgentPermissionMode,
  AgentQueueMessageInput,
  AgentRunInput,
  CourseIconKey,
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  DeleteFileInput,
  FileImportInput,
  RecognizedAcademicCalendar,
  RecognizedCalendarEvent,
  RecognizedCourseSchedule,
  RecognizedCourseSession,
  RecognizedCourseTimetable,
  ReferenceCreateInput,
  ReferenceExportInput,
  ReferenceImportInput,
  ReferenceScopeInput,
  ReferenceScopeQuery,
  ReferenceUpdateInput,
  RenameThreadInput,
  SkillImportInput,
  SkillUpdateInput,
  SkillWriteInput,
  TaskIconKey,
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

function optionalIntegerInRange(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) return undefined;
  const integer = Math.trunc(numeric);
  if (integer < min || integer > max) return undefined;
  return integer;
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
    weekCount: optionalIntegerInRange(input.weekCount, 1, 30),
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

function normalizeTaskIcon(value: unknown): TaskIconKey {
  const icon = requireString(value, "Task icon");
  if (!TASK_ICON_KEYS.has(icon as TaskIconKey)) throw new Error("Task icon is not supported.");
  return icon as TaskIconKey;
}

export function normalizeCreateTaskInput(value: unknown): CreateTaskInput {
  const input = requireObject(value, "Task input");
  return {
    courseId: requireString(input.courseId, "Course id"),
    title: stringValue(input.title),
    taskType: optionalString(input.taskType),
    icon: input.icon === undefined ? undefined : normalizeTaskIcon(input.icon),
  };
}

export function normalizeUpdateTaskInput(value: unknown): UpdateTaskInput {
  const input = requireObject(value, "Task update input");
  return {
    id: requireString(input.id, "Task id"),
    title: optionalString(input.title),
    taskType: optionalString(input.taskType),
    icon: input.icon === undefined ? undefined : normalizeTaskIcon(input.icon),
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

export function normalizeArchivedTaskScope(value: unknown): ArchivedTaskScope | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireObject(value, "Archived task scope");
  return {
    semesterId: optionalString(input.semesterId),
    courseId: optionalString(input.courseId),
  };
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

export function normalizeDeleteFileInput(value: unknown): DeleteFileInput {
  if (typeof value === "string") {
    return { fileId: requireString(value, "File id") };
  }
  const input = requireObject(value, "File delete input");
  return {
    fileId: requireString(input.fileId, "File id"),
    forceCancelIndexing: input.forceCancelIndexing === true,
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

export function normalizeReferenceScopeQuery(value: unknown): ReferenceScopeQuery {
  if (value === undefined || value === null) return {};
  const input = requireObject(value, "Reference scope query");
  return {
    semesterId: optionalString(input.semesterId),
    courseId: optionalString(input.courseId),
    taskId: optionalString(input.taskId),
    includeCandidates: input.includeCandidates === undefined ? undefined : Boolean(input.includeCandidates),
    includeArchived: input.includeArchived === undefined ? undefined : Boolean(input.includeArchived),
  };
}

export function normalizeReferenceCreateInput(value: unknown): ReferenceCreateInput {
  const input = requireObject(value, "Reference input");
  return {
    itemType: normalizeReferenceItemType(input.itemType),
    title: requireString(input.title, "Reference title"),
    abstract: optionalString(input.abstract),
    year: optionalString(input.year),
    language: optionalString(input.language),
    publisher: optionalString(input.publisher),
    containerTitle: optionalString(input.containerTitle),
    volume: optionalString(input.volume),
    issue: optionalString(input.issue),
    pages: optionalString(input.pages),
    doi: optionalString(input.doi),
    isbn: optionalString(input.isbn),
    url: optionalString(input.url),
    citationKey: optionalString(input.citationKey),
    sourceKind: normalizeReferenceSourceKind(input.sourceKind),
    creators: normalizeReferenceCreators(input.creators),
    tags: normalizeStringArray(input.tags),
    rawCslJson: normalizeRecord(input.rawCslJson),
    scope: input.scope === undefined ? undefined : normalizeReferenceScopePayload(input.scope),
  };
}

export function normalizeReferenceUpdateInput(value: unknown): ReferenceUpdateInput {
  const input = requireObject(value, "Reference update input");
  return {
    id: requireString(input.id, "Reference id"),
    itemType: input.itemType === undefined ? undefined : normalizeReferenceItemType(input.itemType),
    title: input.title === undefined ? undefined : requireString(input.title, "Reference title"),
    abstract: input.abstract === undefined ? undefined : optionalString(input.abstract),
    year: input.year === undefined ? undefined : optionalString(input.year),
    language: input.language === undefined ? undefined : optionalString(input.language),
    publisher: input.publisher === undefined ? undefined : optionalString(input.publisher),
    containerTitle: input.containerTitle === undefined ? undefined : optionalString(input.containerTitle),
    volume: input.volume === undefined ? undefined : optionalString(input.volume),
    issue: input.issue === undefined ? undefined : optionalString(input.issue),
    pages: input.pages === undefined ? undefined : optionalString(input.pages),
    doi: input.doi === undefined ? undefined : optionalString(input.doi),
    isbn: input.isbn === undefined ? undefined : optionalString(input.isbn),
    url: input.url === undefined ? undefined : optionalString(input.url),
    citationKey: input.citationKey === undefined ? undefined : optionalString(input.citationKey),
    sourceKind: input.sourceKind === undefined ? undefined : normalizeReferenceSourceKind(input.sourceKind),
    creators: input.creators === undefined ? undefined : normalizeReferenceCreators(input.creators),
    tags: input.tags === undefined ? undefined : normalizeStringArray(input.tags),
    rawCslJson: input.rawCslJson === undefined ? undefined : normalizeRecord(input.rawCslJson),
  };
}

export function normalizeReferenceScopeInput(value: unknown): ReferenceScopeInput {
  const input = requireObject(value, "Reference scope input");
  return {
    referenceId: requireString(input.referenceId, "Reference id"),
    ...normalizeReferenceScopePayload(input),
  };
}

export function normalizeReferenceImportInput(value: unknown): ReferenceImportInput {
  const input = requireObject(value, "Reference import input");
  return {
    format: normalizeReferenceImportFormat(input.format),
    content: requireString(input.content, "Reference import content"),
    scope: input.scope === undefined ? undefined : normalizeReferenceScopePayload(input.scope),
  };
}

export function normalizeReferenceExportInput(value: unknown): ReferenceExportInput {
  const input = requireObject(value, "Reference export input");
  const ids = Array.isArray(input.referenceIds) ? normalizeStringArray(input.referenceIds) : undefined;
  return {
    format: normalizeReferenceExportFormat(input.format),
    referenceIds: ids && ids.length > 0 ? ids : undefined,
    scope: input.scope === undefined ? undefined : normalizeReferenceScopeQuery(input.scope),
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
    permissionMode: normalizeAgentPermissionMode(input.permissionMode),
    providerId: optionalString(input.providerId),
    modelId: optionalString(input.modelId),
    attachments: normalizeAgentAttachments(input.attachments),
    mentionedSkills: normalizeStringArray(input.mentionedSkills),
  };
}

function normalizeReferenceScopePayload(value: unknown): NonNullable<ReferenceCreateInput["scope"]> {
  const input = requireObject(value, "Reference scope");
  const scopeType = normalizeReferenceScopeType(input.scopeType);
  const normalized = {
    scopeType,
    semesterId: optionalString(input.semesterId),
    courseId: optionalString(input.courseId),
    taskId: optionalString(input.taskId),
    status: normalizeReferenceScopeStatus(input.status) || (scopeType === "candidate" ? "candidate" as const : "active" as const),
    addedBy: input.addedBy === "agent" ? "agent" as const : "user" as const,
    note: optionalString(input.note),
  };
  if (scopeType === "semester" && !normalized.semesterId) throw new Error("Semester reference scope requires a semester id.");
  if (scopeType === "course" && !normalized.courseId) throw new Error("Course reference scope requires a course id.");
  if (scopeType === "task" && !normalized.taskId) throw new Error("Task reference scope requires a task id.");
  return normalized;
}

function normalizeReferenceCreators(value: unknown): ReferenceCreateInput["creators"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const input = item as Record<string, unknown>;
    const given = optionalString(input.given);
    const family = optionalString(input.family);
    const name = optionalString(input.name);
    if (!given && !family && !name) return [];
    return [{
      role: normalizeReferenceCreatorRole(input.role),
      given,
      family,
      name,
    }];
  });
}

function normalizeReferenceItemType(value: unknown): ReferenceCreateInput["itemType"] {
  if (
    value === "article-journal" ||
    value === "book" ||
    value === "chapter" ||
    value === "paper-conference" ||
    value === "report" ||
    value === "webpage" ||
    value === "video" ||
    value === "thesis" ||
    value === "document"
  ) return value;
  return "document";
}

function normalizeReferenceSourceKind(value: unknown): ReferenceCreateInput["sourceKind"] {
  if (value === "import" || value === "doi_lookup" || value === "agent_search" || value === "course_material") return value;
  return "manual";
}

function normalizeReferenceCreatorRole(value: unknown): NonNullable<ReferenceCreateInput["creators"]>[number]["role"] {
  if (value === "editor" || value === "translator") return value;
  return "author";
}

function normalizeReferenceScopeType(value: unknown): ReferenceScopeInput["scopeType"] {
  if (value === "course" || value === "task" || value === "candidate") return value;
  return "semester";
}

function normalizeReferenceScopeStatus(value: unknown): ReferenceScopeInput["status"] {
  if (value === "candidate" || value === "rejected") return value;
  return "active";
}

function normalizeReferenceImportFormat(value: unknown): ReferenceImportInput["format"] {
  if (value === "bibtex" || value === "ris") return value;
  return "csl-json";
}

function normalizeReferenceExportFormat(value: unknown): ReferenceExportInput["format"] {
  if (value === "bibtex" || value === "ris" || value === "apa-markdown") return value;
  return "csl-json";
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeAgentPermissionMode(value: unknown): AgentPermissionMode {
  if (value === "bypassPermissions" || value === "plan" || value === "auto") return value;
  return "auto";
}

export function normalizeAgentQueueMessageInput(value: unknown): AgentQueueMessageInput {
  const input = requireObject(value, "Agent queue message input");
  return {
    threadId: requireString(input.threadId, "Thread id"),
    prompt: requireString(input.prompt, "Prompt"),
    uuid: optionalString(input.uuid),
    interrupt: input.interrupt === undefined ? undefined : Boolean(input.interrupt),
    attachments: normalizeAgentAttachments(input.attachments),
    mentionedSkills: normalizeStringArray(input.mentionedSkills),
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
      icon: input.icon === undefined ? undefined : normalizeCourseIcon(input.icon),
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
  "square-pen",
  "clipboard-list",
]);

const TASK_ICON_KEYS = new Set<TaskIconKey>([
  "task-check",
  "essay-scroll",
  "slides-screen",
  "project-target",
  "exam-clock",
  "reading-notes",
  "research-flask",
  "code-braces",
  "discussion-bubbles",
  "idea-lightbulb",
]);
