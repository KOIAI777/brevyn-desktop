import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type {
  Course,
  ModelProviderConfig,
  RecognizedAcademicCalendar,
  RecognizedCalendarEvent,
  RecognizedCourseSchedule,
  RecognizedCourseSession,
  RecognizedCourseTimetable,
  SemesterWorkspace,
  TimetableEvent,
  VisionRecognitionInput,
  WeekdayKey,
  WorkspaceFileNode,
} from "../../types/domain";
import { normalizeBaseUrl } from "../providers/url-utils";
import { SQLiteBusinessStore } from "../storage";
import { ProviderService, envApiKeyForProvider } from "./provider-service";
import { ensureCourseFolderInTree } from "./workspace-file-tree";
import { ensureCourseWorkspaceDir, ensureSemesterSharedDirs, sanitizeFsSegment, SEMESTER_HOME_COURSE_ID } from "./workspace-paths";

interface VisionRecognitionServiceOptions {
  rootDataDir: string;
  businessStore: SQLiteBusinessStore;
  providers: ProviderService;
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const VISION_TIMEOUT_MS = 180_000;

export class VisionRecognitionService {
  constructor(private readonly options: VisionRecognitionServiceOptions) {}

  async recognizeAcademicCalendar(input: VisionRecognitionInput): Promise<RecognizedAcademicCalendar> {
    const { provider, apiKey } = this.resolveVisionProvider(input);
    const payload = await this.callVisionModel({
      provider,
      apiKey,
      sourcePath: input.sourcePath,
      prompt: academicCalendarPrompt(),
    });
    const normalized = normalizeAcademicCalendarPayload(payload, input.sourcePath, provider.name, provider.selectedModel);
    if (!input.apply) return normalized;
    const applied = this.applyAcademicCalendar(normalized);
    return { ...normalized, applied };
  }

  async recognizeCourseTimetable(input: VisionRecognitionInput): Promise<RecognizedCourseTimetable> {
    const { provider, apiKey } = this.resolveVisionProvider(input);
    const payload = await this.callVisionModel({
      provider,
      apiKey,
      sourcePath: input.sourcePath,
      prompt: courseTimetablePrompt(),
    });
    const normalized = normalizeCourseTimetablePayload(payload, input.sourcePath, provider.name, provider.selectedModel);
    if (!input.apply) return normalized;
    const applied = this.applyCourseTimetable(normalized);
    return { ...normalized, applied };
  }

  importAcademicCalendar(input: RecognizedAcademicCalendar): RecognizedAcademicCalendar {
    const applied = this.applyAcademicCalendar(input);
    return { ...input, applied };
  }

  importCourseTimetable(input: RecognizedCourseTimetable): RecognizedCourseTimetable {
    const applied = this.applyCourseTimetable(input);
    return { ...input, applied };
  }

  private resolveVisionProvider(input: VisionRecognitionInput) {
    const provider = this.options.providers.visionProviderFor(input.providerId, input.modelId);
    if (!provider) {
      throw new Error("Configure and enable one Vision Provider with an enabled model in Settings.");
    }
    const apiKey = this.options.providers.apiKey(provider.id) || envApiKeyForProvider(provider);
    if (!apiKey) throw new Error(`Vision provider "${provider.name}" is missing an API key.`);
    return { provider, apiKey };
  }

  private async callVisionModel({
    provider,
    apiKey,
    sourcePath,
    prompt,
  }: {
    provider: ModelProviderConfig;
    apiKey: string;
    sourcePath: string;
    prompt: string;
  }): Promise<unknown> {
    const image = readImagePayload(sourcePath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
    try {
      const endpoint = visionEndpoint(provider);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: visionHeaders(provider, apiKey),
        signal: controller.signal,
        body: JSON.stringify(visionRequestBody(provider, image, prompt)),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Vision request failed (${response.status}): ${text}`);
      const message = parseJson(text);
      const contentText = provider.protocol === "openai_responses"
        ? extractOpenAiResponsesText(message)
        : provider.protocol === "openai_compatible"
          ? extractOpenAiChatCompletionsText(message)
          : extractAnthropicText(message);
      return parseJsonFromModelText(contentText);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Vision recognition timed out after ${Math.round(VISION_TIMEOUT_MS / 1000)}s. Try a smaller image or a faster vision model.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private applyAcademicCalendar(result: RecognizedAcademicCalendar): { semester?: SemesterWorkspace; events: TimetableEvent[] } {
    const timestamp = now();
    const semesterInput = result.semester;
    const semester: SemesterWorkspace | undefined = semesterInput?.term
      ? {
          id: entityId("semester"),
          semesterNo: semesterInput.semesterNo?.trim() || semesterInput.term,
          term: semesterInput.term.trim(),
          folderName: sanitizeFsSegment(semesterInput.folderName?.trim() || semesterInput.term),
          startsAt: semesterInput.startsAt,
          endsAt: semesterInput.endsAt,
          source: "vision",
          recognizedAt: timestamp,
        }
      : undefined;

    const semesterId = semester?.id || this.options.businessStore.currentSemesterId() || "";
    if (!semesterId) throw new Error("No semester recognized and no active semester is selected.");
    if (semester) {
      ensureSemesterSharedDirs(this.options.rootDataDir, semester.id);
      this.options.businessStore.saveSemesterWithWorkspaceFiles(semester, buildSemesterHomeRoots(semester, timestamp), true);
    }

    const weekSemester = semesterForWeeks(semester, this.options.businessStore.getSemester(semesterId));
    const weekEvents = weekSemester ? calendarWeekEvents(weekSemester, semesterId) : [];
    const events = [
      ...weekEvents,
      ...result.events.map((event) => calendarEventToTimetableEvent(event, semesterId)),
    ];
    this.options.businessStore.replaceSchoolCalendarEvents(semesterId, events);
    return { semester, events };
  }

  private applyCourseTimetable(result: RecognizedCourseTimetable): { courses: Course[]; events: TimetableEvent[] } {
    const semester = this.options.businessStore.currentSemester();
    if (!semester) throw new Error("Select a semester before applying a course timetable.");
    const existingCourses = this.options.businessStore.listCourses(semester.id);
    const applied: Course[] = [];
    const appliedEvents: TimetableEvent[] = [];

    for (const recognized of result.courses) {
      const code = recognized.code.trim();
      const name = stripSectionSuffix(recognized.name.trim(), recognized.section);
      if (!code || !name) continue;
      const existing = existingCourses.find((course) => course.code.toLowerCase() === code.toLowerCase() || course.name.toLowerCase() === name.toLowerCase());
      const meetingTime = formatRecognizedSessions(recognized.sessions);
      const location = firstLocation(recognized.sessions);
      let course: Course;
      if (existing) {
        const updated: Course = {
          ...existing,
          code,
          name,
          instructor: recognized.instructor || existing.instructor,
          meetingTime: meetingTime || existing.meetingTime,
          location: location || existing.location,
        };
        course = this.options.businessStore.updateCourseDetails(updated);
      } else {
        course = {
          id: entityId("course"),
          semesterId: semester.id,
          name,
          code,
          term: semester.term,
          instructor: recognized.instructor || "",
          workspaceKind: "course",
          meetingTime,
          location,
          color: "#2563eb",
          description: `Recognized from timetable image${recognized.section ? `, section ${recognized.section}` : ""}.`,
        };
        ensureCourseWorkspaceDir(this.options.rootDataDir, semester.id, course.id);
        course = this.options.businessStore.saveCourse(course);
        existingCourses.push(course);
      }
      applied.push(course);
      const events = recognizedCourseToEvents(recognized, course, semester);
      this.options.businessStore.replaceCourseSessionEvents(course.id, events);
      appliedEvents.push(...events);
    }
    return { courses: applied, events: appliedEvents };
  }
}

function buildSemesterHomeRoots(semester: SemesterWorkspace, timestamp: string): WorkspaceFileNode[] {
  const roots: WorkspaceFileNode[] = [];
  ensureCourseFolderInTree({
    roots,
    courseId: SEMESTER_HOME_COURSE_ID,
    semester,
    tasks: [],
    timestamp,
  });
  return roots;
}

function academicCalendarPrompt(): string {
  return [
    "Extract the academic calendar from this image.",
    "Return ONLY strict JSON with this shape:",
    "{",
    '  "semester": {"term": string, "semesterNo": string, "folderName": string, "startsAt": "YYYY-MM-DD", "endsAt": "YYYY-MM-DD"},',
    '  "events": [{"title": string, "startsAt": "YYYY-MM-DD", "endsAt": "YYYY-MM-DD optional", "notes": string optional, "confidence": number optional}],',
    '  "warnings": [string]',
    "}",
    "Use the year/month/day visible in the calendar. Convert date ranges to inclusive startsAt/endsAt. Include holidays, reading weeks, class starts, last day of classes, exams, add/drop, and major school events. If a field is uncertain, add a warning instead of inventing.",
  ].join("\n");
}

function courseTimetablePrompt(): string {
  return [
    "Extract the student's weekly course timetable from this image.",
    "Return ONLY strict JSON with this shape:",
    "{",
    '  "semesterLabel": string,',
    '  "courses": [{"code": string, "name": string, "section": string optional, "category": string optional, "instructor": string optional, "units": number optional, "sessions": [{"dayOfWeek": "mon|tue|wed|thu|fri|sat|sun", "startTime": "HH:mm", "endTime": "HH:mm", "room": string optional, "weeks": string optional, "confidence": number optional}], "confidence": number optional}],',
    '  "warnings": [string]',
    "}",
    "Prefer the detailed sections table at the bottom for course code, teacher, room, and units. Use the grid to verify day/time. If a course has multiple sessions, include all of them.",
  ].join("\n");
}

function normalizeAcademicCalendarPayload(payload: unknown, sourcePath: string, providerName: string, modelId: string): RecognizedAcademicCalendar {
  const input = objectValue(payload);
  return {
    kind: "academic_calendar",
    sourcePath,
    providerName,
    modelId,
    semester: normalizeSemesterInput(input.semester),
    events: arrayValue(input.events).flatMap(normalizeCalendarEvent),
    warnings: arrayValue(input.warnings).map(stringValue).filter(Boolean),
  };
}

function normalizeCourseTimetablePayload(payload: unknown, sourcePath: string, providerName: string, modelId: string): RecognizedCourseTimetable {
  const input = objectValue(payload);
  return {
    kind: "course_timetable",
    sourcePath,
    providerName,
    modelId,
    semesterLabel: optionalString(input.semesterLabel),
    courses: arrayValue(input.courses).flatMap(normalizeRecognizedCourse),
    warnings: arrayValue(input.warnings).map(stringValue).filter(Boolean),
  };
}

function normalizeSemesterInput(value: unknown): RecognizedAcademicCalendar["semester"] {
  const input = objectValue(value);
  const term = stringValue(input.term);
  if (!term) return undefined;
  return {
    term,
    semesterNo: optionalString(input.semesterNo),
    folderName: optionalString(input.folderName),
    startsAt: isoDateOrUndefined(input.startsAt),
    endsAt: isoDateOrUndefined(input.endsAt),
  };
}

function normalizeCalendarEvent(value: unknown): RecognizedCalendarEvent[] {
  const input = objectValue(value);
  const title = stringValue(input.title);
  const startsAt = isoDateOrUndefined(input.startsAt);
  if (!title || !startsAt) return [];
  return [{
    title,
    startsAt,
    endsAt: isoDateOrUndefined(input.endsAt),
    notes: optionalString(input.notes),
    confidence: numberValue(input.confidence),
  }];
}

function normalizeRecognizedCourse(value: unknown): RecognizedCourseSchedule[] {
  const input = objectValue(value);
  const code = stringValue(input.code);
  const name = stringValue(input.name);
  if (!code || !name) return [];
  return [{
    code,
    name,
    section: optionalString(input.section),
    category: optionalString(input.category),
    instructor: optionalString(input.instructor),
    units: numberValue(input.units),
    sessions: arrayValue(input.sessions).flatMap(normalizeRecognizedSession),
    confidence: numberValue(input.confidence),
  }];
}

function normalizeRecognizedSession(value: unknown): RecognizedCourseSession[] {
  const input = objectValue(value);
  const dayOfWeek = weekdayValue(input.dayOfWeek);
  const startTime = timeValue(input.startTime);
  const endTime = timeValue(input.endTime);
  if (!dayOfWeek || !startTime || !endTime) return [];
  return [{
    dayOfWeek,
    startTime,
    endTime,
    room: optionalString(input.room),
    weeks: optionalString(input.weeks),
    confidence: numberValue(input.confidence),
  }];
}

function calendarEventToTimetableEvent(event: RecognizedCalendarEvent, semesterId: string): TimetableEvent {
  return {
    id: entityId("event"),
    semesterId,
    title: event.title,
    kind: "school_event",
    source: "school_calendar",
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    notes: event.notes,
    confidence: event.confidence,
  };
}

function semesterForWeeks(created: SemesterWorkspace | undefined, active: SemesterWorkspace | null): SemesterWorkspace | undefined {
  const semester = created || active || undefined;
  return semester?.startsAt && semester.endsAt ? semester : undefined;
}

function calendarWeekEvents(semester: SemesterWorkspace, semesterId: string): TimetableEvent[] {
  const start = dateOnly(semester.startsAt || "");
  const end = dateOnly(semester.endsAt || "");
  if (!start || !end || end < start) return [];
  const events: TimetableEvent[] = [];
  for (let weekStart = start, week = 1; weekStart <= end; weekStart = addDays(weekStart, 7), week += 1) {
    const weekEnd = minDate(addDays(weekStart, 6), end);
    events.push({
      id: entityId("week"),
      semesterId,
      title: `Week ${week}`,
      kind: "school_week",
      source: "school_calendar",
      startsAt: formatDateOnly(weekStart),
      endsAt: formatDateOnly(weekEnd),
      notes: `${semester.term} · Week ${week}`,
      confidence: 1,
    });
  }
  return events;
}

function readImagePayload(sourcePath: string): { mediaType: string; data: string } {
  if (!existsSync(sourcePath)) throw new Error(`Image file not found: ${sourcePath}`);
  const stats = statSync(sourcePath);
  if (stats.size > MAX_IMAGE_BYTES) throw new Error(`Image is too large for vision recognition (${formatBytes(stats.size)} > ${formatBytes(MAX_IMAGE_BYTES)}).`);
  return {
    mediaType: mediaTypeForPath(sourcePath),
    data: readFileSync(sourcePath).toString("base64"),
  };
}

function visionEndpoint(provider: ModelProviderConfig): string {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
    .replace(/\/messages$/, "")
    .replace(/\/responses$/, "")
    .replace(/\/chat\/completions$/, "");
  if (provider.protocol === "openai_responses") return `${baseUrl}/responses`;
  if (provider.protocol === "openai_compatible") return `${baseUrl}/chat/completions`;
  return `${baseUrl}/messages`;
}

function visionHeaders(provider: ModelProviderConfig, apiKey: string): Record<string, string> {
  if (provider.protocol === "openai_responses" || provider.protocol === "openai_compatible") {
    return provider.authMode === "api_key"
      ? { "x-api-key": apiKey, "content-type": "application/json" }
      : { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  }
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  if (provider.authMode === "bearer") headers.Authorization = `Bearer ${apiKey}`;
  else {
    headers["x-api-key"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function visionRequestBody(provider: ModelProviderConfig, image: { mediaType: string; data: string }, prompt: string): unknown {
  if (provider.protocol === "openai_responses") {
    return {
      model: provider.selectedModel,
      max_output_tokens: 4096,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:${image.mediaType};base64,${image.data}` },
          ],
        },
      ],
    };
  }
  if (provider.protocol === "openai_compatible") {
    return {
      model: provider.selectedModel,
      max_tokens: 4096,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
          ],
        },
      ],
    };
  }
  return {
    model: provider.selectedModel,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.data,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  };
}

function extractOpenAiChatCompletionsText(message: unknown): string {
  const choices = objectValue(message).choices;
  if (!Array.isArray(choices)) return "";
  return choices
    .flatMap((choice) => {
      const content = objectValue(objectValue(choice).message).content;
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        const block = objectValue(part);
        return block.type === "text" ? stringValue(block.text) : [];
      });
    })
    .join("\n")
    .trim();
}

function extractAnthropicText(message: unknown): string {
  const content = objectValue(message).content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((item) => {
      const block = objectValue(item);
      return block.type === "text" ? stringValue(block.text) : [];
    })
    .join("\n")
    .trim();
}

function extractOpenAiResponsesText(message: unknown): string {
  const outputText = stringValue(objectValue(message).output_text);
  if (outputText) return outputText;
  const output = objectValue(message).output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => {
      const content = objectValue(item).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        const block = objectValue(part);
        return block.type === "output_text" || block.type === "text" ? stringValue(block.text) : [];
      });
    })
    .join("\n");
}

function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Vision model did not return valid JSON.");
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Vision provider returned invalid JSON: ${value.slice(0, 300)}`);
  }
}

function mediaTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function formatRecognizedSessions(sessions: RecognizedCourseSession[]): string | undefined {
  const text = sessions.map((session) => `${session.dayOfWeek.toUpperCase()} ${session.startTime}-${session.endTime}${session.room ? ` ${session.room}` : ""}`).join("; ");
  return text || undefined;
}

function firstLocation(sessions: RecognizedCourseSession[]): string | undefined {
  return sessions.find((session) => session.room)?.room;
}

function stripSectionSuffix(name: string, section?: string): string {
  if (!section) return name;
  return name.replace(new RegExp(`\\s*\\(${escapeRegExp(section)}\\)\\s*$`), "").trim() || name;
}

function recognizedCourseToEvents(recognized: RecognizedCourseSchedule, course: Course, semester: SemesterWorkspace): TimetableEvent[] {
  if (!semester.startsAt || !semester.endsAt) return [];
  const rangeStart = dateOnly(semester.startsAt);
  const rangeEnd = dateOnly(semester.endsAt);
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];
  return recognized.sessions.flatMap((session) => {
    const first = firstWeekdayOnOrAfter(rangeStart, session.dayOfWeek);
    if (!first || first > rangeEnd) return [];
    const events: TimetableEvent[] = [];
    for (let day = first; day <= rangeEnd; day = addDays(day, 7)) {
      const date = formatDateOnly(day);
      events.push({
        id: entityId("event"),
        semesterId: semester.id,
        courseId: course.id,
        title: `${course.code} ${course.name}`,
        kind: "course_session",
        source: "course",
        startsAt: `${date}T${session.startTime}:00`,
        endsAt: `${date}T${session.endTime}:00`,
        location: session.room,
        notes: [
          recognized.section ? `Section ${recognized.section}` : "",
          recognized.instructor ? `Instructor: ${recognized.instructor}` : "",
          session.weeks ? `Weeks: ${session.weeks}` : "",
        ].filter(Boolean).join("\n") || undefined,
        confidence: session.confidence ?? recognized.confidence,
      });
    }
    return events;
  });
}

function dateOnly(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function firstWeekdayOnOrAfter(start: Date, weekday: WeekdayKey): Date {
  const target = weekdayIndex(weekday);
  const next = new Date(start);
  const current = next.getDay();
  const diff = (target - current + 7) % 7;
  next.setDate(next.getDate() + diff);
  return next;
}

function weekdayIndex(weekday: WeekdayKey): number {
  return { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[weekday];
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function minDate(a: Date, b: Date): Date {
  return a <= b ? a : b;
}

function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function optionalString(value: unknown): string | undefined {
  const text = stringValue(value);
  return text || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDateOrUndefined(value: unknown): string | undefined {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function timeValue(value: unknown): string | undefined {
  const text = stringValue(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function weekdayValue(value: unknown): WeekdayKey | undefined {
  const text = stringValue(value).toLowerCase().slice(0, 3);
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(text) ? text as WeekdayKey : undefined;
}

function entityId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function now(): string {
  return new Date().toISOString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
