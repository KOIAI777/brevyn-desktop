import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type {
  ChatMessage,
  ContextWindowReport,
  Course,
  CourseFileSection,
  CourseImageAnalyzeInput,
  CourseImageAnalyzeResult,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  FileImportResult,
  GitStatus,
  FilePreview,
  IndexingJob,
  ModelProviderConfig,
  ProviderDraftInput,
  ProviderModel,
  ProviderTestResult,
  RagSearchResult,
  SemesterImageAnalyzeInput,
  SemesterImageAnalyzeResult,
  SemesterWorkspace,
  SkillItem,
  SkillUpdateInput,
  TaskFileBucket,
  TaskType,
  TimetableEvent,
  TimetableImageAnalyzeInput,
  TimetableImageAnalyzeResult,
  TimetableRangeQuery,
  Thread,
  UclawRunStreamItem,
  UclawTask,
  WorkspaceFileNode,
} from "../../types/domain";

export const SEMESTER_HOME_COURSE_ID = "semester-home";

interface StoreShape {
  semester: SemesterWorkspace;
  semesters: SemesterWorkspace[];
  currentSemesterId: string;
  courses: Course[];
  tasks: UclawTask[];
  threads: Thread[];
  messages: ChatMessage[];
  events: UclawRunStreamItem[];
  skills: SkillItem[];
  files: WorkspaceFileNode[];
  timetableEvents: TimetableEvent[];
  providers: ModelProviderConfig[];
  indexingJobs: IndexingJob[];
}

const now = () => new Date().toISOString();
const DEFAULT_WEEK_COUNT = 12;
const DEFAULT_TASK_TYPES: TaskType[] = ["assignment", "exam"];
const TASK_TYPE_LABELS: Record<TaskType, string> = {
  assignment: "Assignment",
  project: "Project",
  exam: "Exam",
  lecture: "Lecture",
};
const TASK_FILE_BUCKET_LABELS: Record<TaskFileBucket, string> = {
  materials: "Materials",
  drafts: "Drafts",
  submitted: "Submitted",
};

function initialStore(): StoreShape {
  const timestamp = now();
  return {
    semester: {
      id: "semester-2026-spring",
      semesterNo: "2026-SPRING",
      term: "Spring 2026",
      folderName: "Spring 2026",
      startsAt: "2026-01-12T00:00:00.000Z",
      endsAt: "2026-05-29T23:59:00.000Z",
      source: "seed",
      recognizedAt: timestamp,
    },
    semesters: [
      {
        id: "semester-2026-spring",
        semesterNo: "2026-SPRING",
        term: "Spring 2026",
        folderName: "Spring 2026",
        startsAt: "2026-01-12T00:00:00.000Z",
        endsAt: "2026-05-29T23:59:00.000Z",
        source: "seed",
        recognizedAt: timestamp,
      },
    ],
    currentSemesterId: "semester-2026-spring",
    courses: [
      {
        id: SEMESTER_HOME_COURSE_ID,
        name: "Home TaskAgent",
        code: "SEMESTER",
        term: "Spring 2026",
        instructor: "Workspace",
        workspaceKind: "semester_home",
        color: "#111827",
        description: "Semester-level TaskAgent that can see all course folders and route work into course/task workspaces.",
      },
      {
        id: "course-ai-law",
        name: "AI and Law",
        code: "UCLAW 5101",
        term: "Spring 2026",
        instructor: "Dr. Morgan Chen",
        workspaceKind: "course",
        meetingTime: "Mon 09:30-11:00",
        location: "Room 204",
        color: "#2563eb",
        description: "Regulation, liability, and evidence problems around applied AI systems.",
      },
      {
        id: "course-evidence",
        name: "Evidence",
        code: "LAW 4204",
        term: "Spring 2026",
        instructor: "Prof. Ada Wu",
        workspaceKind: "course",
        meetingTime: "Wed 14:00-15:30",
        location: "Trial Lab",
        color: "#059669",
        description: "Hearsay, character evidence, expert testimony, and trial objections.",
      },
      {
        id: "course-writing",
        name: "Legal Writing Studio",
        code: "WRIT 3002",
        term: "Spring 2026",
        instructor: "T. Alvarez",
        workspaceKind: "course",
        meetingTime: "Fri 11:00-12:15",
        location: "Writing Center",
        color: "#c2410c",
        description: "Research memos, citation hygiene, and draft revision workflows.",
      },
    ],
    tasks: [
      {
        id: "task-ai-policy-brief",
        courseId: "course-ai-law",
        title: "Policy Brief: AI Liability",
        taskType: "assignment",
        status: "due_soon",
        dueAt: "2026-05-14T23:59:00.000Z",
        summary: "1500-word policy brief comparing strict liability and negligence standards.",
      },
      {
        id: "task-ai-case-map",
        courseId: "course-ai-law",
        title: "Case Map: Platform Duty",
        taskType: "project",
        status: "in_progress",
        dueAt: "2026-05-22T23:59:00.000Z",
        summary: "Build a case map with holdings, facts, and open questions.",
      },
      {
        id: "task-evidence-hearsay",
        courseId: "course-evidence",
        title: "Hearsay Exceptions Drill",
        taskType: "exam",
        status: "in_progress",
        dueAt: "2026-05-19T10:00:00.000Z",
        summary: "Practice classification under party admissions, present sense impression, and business records.",
      },
      {
        id: "task-writing-memo",
        courseId: "course-writing",
        title: "Research Memo Revision",
        taskType: "assignment",
        status: "not_started",
        dueAt: "2026-05-28T23:59:00.000Z",
        summary: "Revise discussion section with counterargument and Bluebook cleanup.",
      },
    ],
    threads: [
      {
        id: "thread-semester-home",
        courseId: SEMESTER_HOME_COURSE_ID,
        threadType: "semester_home",
        title: "Home TaskAgent",
        createdAt: timestamp,
        updatedAt: timestamp,
        latestRunStatus: "idle",
        latestEventSeq: 0,
        pendingApprovalCount: 0,
      },
      {
        id: "thread-home",
        courseId: "course-ai-law",
        threadType: "course_home",
        title: "TaskAgent Home",
        createdAt: timestamp,
        updatedAt: timestamp,
        latestRunStatus: "idle",
        latestEventSeq: 0,
        pendingApprovalCount: 0,
      },
      {
        id: "thread-policy-brief",
        courseId: "course-ai-law",
        taskId: "task-ai-policy-brief",
        threadType: "task",
        title: "Policy brief outline",
        createdAt: timestamp,
        updatedAt: timestamp,
        latestRunStatus: "completed",
        latestEventSeq: 0,
        pendingApprovalCount: 0,
      },
    ],
    messages: [
      {
        id: "message-semester-home",
        threadId: "thread-semester-home",
        role: "assistant",
        createdAt: timestamp,
        content:
          "Home TaskAgent is the semester entry point. It can see every course folder, route files into courses, and narrow work down into task sessions when needed.",
      },
      {
        id: "message-welcome",
        threadId: "thread-home",
        role: "assistant",
        createdAt: timestamp,
        content:
          "UCLAW Electron workspace is running locally. Backend APIs are intentionally out of the loop for now; courses, skills, RAG search, timeline events, and approvals are shaped through the Electron main process.",
      },
      {
        id: "message-policy-context",
        threadId: "thread-policy-brief",
        role: "assistant",
        createdAt: timestamp,
        content:
          "I found three likely sources for the AI liability brief: lecture 6 notes, the product liability reading, and your rubric. The next useful move is to turn the rubric into a section checklist.",
        timeline: [
          {
            id: "seed-thinking",
            kind: "thinking_done",
            phase: "done",
            title: "Thinking",
            detail: "Identified assignment scope and checked available course materials.",
            tone: "thinking",
          },
          {
            id: "seed-rag",
            kind: "tool_result",
            phase: "result",
            title: "已检索知识库",
            detail: "AI liability rubric, 3 results",
            tone: "tool",
            toolCall: {
              call_id: "seed-rag",
              tool_name: "rag_search",
              arguments: { query: "AI liability rubric" },
              result: { ok: true, count: 3 },
            },
          },
        ],
      },
    ],
    events: [],
    skills: [
      {
        id: "assignment-coach",
        name: "Assignment Coach",
        enabled: true,
        scope: "default",
        version: "0.1.0",
        description: "Turn specs and rubrics into outlines, checklists, and revision passes.",
      },
      {
        id: "citation-helper",
        name: "Citation Helper",
        enabled: true,
        scope: "default",
        version: "0.1.0",
        description: "Keep claims tied to source snippets and citation anchors.",
      },
      {
        id: "exam-review",
        name: "Exam Review",
        enabled: false,
        scope: "default",
        version: "0.1.0",
        description: "Generate issue spotter drills and spaced review plans.",
      },
      {
        id: "file-librarian",
        name: "File Librarian",
        enabled: true,
        scope: "course",
        version: "0.1.0",
        description: "Classify course files and suggest task/file links.",
      },
    ],
    files: [
      {
        id: "folder-ai-law-materials",
        courseId: "course-ai-law",
        name: "AI and Law",
        path: "AI and Law",
        kind: "folder",
        updatedAt: timestamp,
        children: [
          {
            id: "file-ai-rubric",
            courseId: "course-ai-law",
            taskId: "task-ai-policy-brief",
            name: "policy-brief-rubric.md",
            path: "AI and Law/policy-brief-rubric.md",
            kind: "markdown",
            sizeLabel: "9 KB",
            updatedAt: timestamp,
          },
          {
            id: "file-ai-lecture",
            courseId: "course-ai-law",
            name: "week-06-liability.pdf",
            path: "AI and Law/week-06-liability.pdf",
            kind: "pdf",
            sizeLabel: "1.8 MB",
            updatedAt: timestamp,
          },
          {
            id: "file-ai-deck",
            courseId: "course-ai-law",
            name: "product-duty-slides.pptx",
            path: "AI and Law/product-duty-slides.pptx",
            kind: "pptx",
            sizeLabel: "3.4 MB",
            updatedAt: timestamp,
          },
          {
            id: "file-ai-diagram",
            courseId: "course-ai-law",
            name: "liability-flow.png",
            path: "AI and Law/liability-flow.png",
            kind: "image",
            sizeLabel: "420 KB",
            updatedAt: timestamp,
          },
          {
            id: "file-ai-agent-tool",
            courseId: "course-ai-law",
            name: "rag-tools.ts",
            path: "AI and Law/rag-tools.ts",
            kind: "code",
            sizeLabel: "14 KB",
            updatedAt: timestamp,
          },
        ],
      },
      {
        id: "folder-evidence-materials",
        courseId: "course-evidence",
        name: "Evidence",
        path: "Evidence",
        kind: "folder",
        updatedAt: timestamp,
        children: [
          {
            id: "file-evidence-hearsay",
            courseId: "course-evidence",
            taskId: "task-evidence-hearsay",
            name: "hearsay-exceptions.docx",
            path: "Evidence/hearsay-exceptions.docx",
            kind: "docx",
            sizeLabel: "86 KB",
            updatedAt: timestamp,
          },
          {
            id: "file-evidence-outline",
            courseId: "course-evidence",
            name: "exam-outline.md",
            path: "Evidence/exam-outline.md",
            kind: "markdown",
            sizeLabel: "18 KB",
            updatedAt: timestamp,
          },
        ],
      },
      {
        id: "folder-writing-materials",
        courseId: "course-writing",
        name: "Legal Writing Studio",
        path: "Legal Writing Studio",
        kind: "folder",
        updatedAt: timestamp,
        children: [
          {
            id: "file-writing-memo",
            courseId: "course-writing",
            taskId: "task-writing-memo",
            name: "research-memo-draft.docx",
            path: "Legal Writing Studio/research-memo-draft.docx",
            kind: "docx",
            sizeLabel: "112 KB",
            updatedAt: timestamp,
          },
          {
            id: "file-writing-citations",
            courseId: "course-writing",
            name: "bluebook-checklist.md",
            path: "Legal Writing Studio/bluebook-checklist.md",
            kind: "markdown",
            sizeLabel: "7 KB",
            updatedAt: timestamp,
          },
        ],
      },
    ],
    timetableEvents: [
      {
        id: "tt-ai-law-mon",
        title: "AI and Law Seminar",
        kind: "course_session",
        source: "course",
        courseId: "course-ai-law",
        startsAt: "2026-05-04T09:30:00.000Z",
        endsAt: "2026-05-04T11:00:00.000Z",
        location: "Room 204",
        notes: "Platform duty and product liability.",
      },
      {
        id: "tt-evidence-wed",
        title: "Evidence Review",
        kind: "course_session",
        source: "course",
        courseId: "course-evidence",
        startsAt: "2026-05-06T14:00:00.000Z",
        endsAt: "2026-05-06T15:30:00.000Z",
        location: "Trial Lab",
        notes: "Hearsay exceptions drill.",
      },
      {
        id: "tt-writing-fri",
        title: "Writing Studio",
        kind: "course_session",
        source: "course",
        courseId: "course-writing",
        startsAt: "2026-05-08T11:00:00.000Z",
        endsAt: "2026-05-08T12:15:00.000Z",
        location: "Writing Center",
      },
      {
        id: "tt-ai-deadline",
        title: "Policy Brief Due",
        kind: "deadline",
        source: "course",
        courseId: "course-ai-law",
        taskId: "task-ai-policy-brief",
        startsAt: "2026-05-14T23:59:00.000Z",
        notes: "1500-word policy brief submission deadline.",
      },
      {
        id: "tt-school-reading-week",
        title: "University Reading Week",
        kind: "school_event",
        source: "school_calendar",
        startsAt: "2026-05-18T00:00:00.000Z",
        endsAt: "2026-05-22T23:59:00.000Z",
        notes: "No regular classes.",
      },
    ],
    indexingJobs: [],
    providers: [
      {
        id: "provider-openai",
        name: "OpenAI",
        protocol: "openai_responses",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMasked: "sk-...local",
        chatModel: "gpt-5.1",
        embeddingModel: "text-embedding-3-large",
        multimodalModel: "gpt-5.1",
        enabled: true,
        embeddingEnabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

export class LocalStore {
  private data: StoreShape;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  listSemesters(): SemesterWorkspace[] {
    return this.data.semesters
      .map((semester) => ({ ...semester }))
      .sort((a, b) => Date.parse(b.startsAt || b.recognizedAt || "") - Date.parse(a.startsAt || a.recognizedAt || ""));
  }

  currentSemester(): SemesterWorkspace {
    return { ...this.data.semester };
  }

  selectSemester(semesterId: string): SemesterWorkspace {
    const semester = this.data.semesters.find((item) => item.id === semesterId);
    if (!semester) throw new Error(`Semester not found: ${semesterId}`);
    this.data.currentSemesterId = semester.id;
    this.data.semester = semester;
    this.data = normalizeStore(this.data);
    this.save();
    return { ...this.data.semester };
  }

  analyzeSemesterImage(input: SemesterImageAnalyzeInput): SemesterImageAnalyzeResult {
    const timestamp = now();
    const semester: SemesterWorkspace = {
      id: "semester-2026-fall",
      semesterNo: "2026-FALL",
      term: "Fall 2026",
      folderName: "Fall 2026",
      startsAt: "2026-09-07T00:00:00.000Z",
      endsAt: "2026-12-18T23:59:00.000Z",
      source: "multimodal_timetable",
      recognizedAt: timestamp,
    };
    this.data.semesters = upsertSemester(this.data.semesters, semester);
    this.data.currentSemesterId = semester.id;
    this.data.semester = semester;
    this.data.courses = this.data.courses.map((course) =>
      course.id === SEMESTER_HOME_COURSE_ID
        ? { ...course, term: semester.term, code: semester.semesterNo, description: `Semester workspace generated from ${semester.source}.` }
        : course,
    );
    const createdEvents = [
      {
        id: `tt-semester-start-${Date.now().toString(36)}`,
        semesterId: semester.id,
        title: `${semester.term} begins`,
        kind: "school_event" as const,
        source: "multimodal_image" as const,
        startsAt: semester.startsAt || timestamp,
        endsAt: semester.startsAt,
        notes: input.instruction || "Recognized from semester timetable image.",
        confidence: 0.88,
      },
      {
        id: `tt-semester-end-${Date.now().toString(36)}`,
        semesterId: semester.id,
        title: `${semester.term} ends`,
        kind: "school_event" as const,
        source: "multimodal_image" as const,
        startsAt: semester.endsAt || timestamp,
        endsAt: semester.endsAt,
        notes: "Recognized semester range.",
        confidence: 0.84,
      },
    ];
    this.data.timetableEvents.push(...createdEvents);
    this.data = normalizeStore(this.data);
    this.save();
    return {
      id: `semester-import-${Date.now().toString(36)}`,
      status: "completed",
      source: "multimodal_timetable",
      semester,
      createdEvents,
      warnings: input.imageIds?.length || input.imagePaths?.length ? [] : ["No image selected yet; returned mock semester recognition output."],
    };
  }

  listCourses(): Course[] {
    return normalizeCourses(this.data.courses, this.data.semester);
  }

  listTasks(courseId: string): UclawTask[] {
    return this.data.tasks.filter((task) => task.semesterId === this.data.semester.id && task.courseId === courseId);
  }

  createTask(input: CreateTaskInput): UclawTask {
    const task: UclawTask = {
      id: `task-${Date.now().toString(36)}`,
      semesterId: this.data.semester.id,
      courseId: input.courseId,
      title: input.title.trim() || "New Task",
      taskType: input.taskType || "assignment",
      status: "not_started",
      summary: "Custom task created locally.",
    };
    this.data.tasks.push(task);
    const root = this.ensureCourseFolder(input.courseId);
    this.ensureTargetFolder(root, { courseId: input.courseId, targetSection: "task", taskId: task.id });
    this.save();
    return task;
  }

  analyzeCourseImage(input: CourseImageAnalyzeInput): CourseImageAnalyzeResult {
    const timestamp = now();
    const course: Course = {
      id: `course-${Date.now().toString(36)}`,
      semesterId: this.data.semester.id,
      name: "Recognized Course",
      code: "AUTO 1001",
      term: this.data.semester.term,
      instructor: "Recognized Instructor",
      workspaceKind: "course",
      meetingTime: "Recognized weekly time",
      location: "Recognized location",
      color: "#7c3aed",
      description: input.instruction || "Created from multimodal AI course material analysis placeholder.",
    };
    this.data.courses.push(course);
    this.data.files.push({
      id: `folder-${course.id}-shared`,
      semesterId: this.data.semester.id,
      courseId: course.id,
      name: course.name,
      path: course.name,
      kind: "folder",
      updatedAt: timestamp,
      children: [],
    });
    normalizeWorkspaceFolders(this.data);
    this.data = normalizeStore(this.data);
    this.save();
    return {
      id: `course-import-${Date.now().toString(36)}`,
      status: "completed",
      source: "multimodal_image",
      course,
      confidence: 0.84,
      warnings: input.imageIds?.length || input.imagePaths?.length ? [] : ["No image selected yet; returned mock course recognition output."],
    };
  }

  listThreads(courseId?: string): Thread[] {
    return this.data.threads
      .filter((thread) => thread.semesterId === this.data.semester.id && (!courseId || thread.courseId === courseId))
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  createThread(input: CreateThreadInput): Thread {
    const task = input.taskId ? this.data.tasks.find((item) => item.id === input.taskId) : null;
    const thread: Thread = {
      id: `thread-${Date.now().toString(36)}`,
      semesterId: this.data.semester.id,
      courseId: input.courseId,
      taskId: input.taskId,
      threadType: input.taskId ? "task" : "home",
      title: input.title || (task ? `${task.title} thread` : "New Home Thread"),
      createdAt: now(),
      updatedAt: now(),
      latestRunStatus: "idle",
      latestEventSeq: 0,
      pendingApprovalCount: 0,
    };
    this.data.threads.unshift(thread);
    this.save();
    return thread;
  }

  messages(threadId: string): ChatMessage[] {
    return this.data.messages.filter((message) => message.threadId === threadId);
  }

  appendMessage(message: ChatMessage): ChatMessage {
    this.data.messages.push(message);
    this.appendThreadJsonl(message.threadId, {
      type: `${message.role}_message`,
      message,
    });
    this.touchThread(message.threadId);
    this.save();
    return message;
  }

  updateAssistantMessage(messageId: string, content: string, timeline?: ChatMessage["timeline"]): void {
    const message = this.data.messages.find((item) => item.id === messageId);
    if (!message) return;
    message.content = content;
    if (timeline) message.timeline = timeline;
    this.touchThread(message.threadId);
    this.save();
  }

  appendEvent(item: UclawRunStreamItem): UclawRunStreamItem {
    this.data.events.push(item);
    this.appendThreadJsonl(item.threadId, {
      type: "run_item",
      item,
    });
    const thread = this.data.threads.find((entry) => entry.id === item.threadId);
    if (thread) {
      thread.latestEventSeq = item.seq;
      thread.updatedAt = item.createdAt;
      if (item.status) thread.latestRunStatus = item.status;
      if (item.type === "tool_approval_required") thread.pendingApprovalCount += 1;
      if (item.type === "tool_approval_resolved") thread.pendingApprovalCount = 0;
      if (["completed", "failed", "cancelled"].includes(String(item.status || ""))) {
        thread.pendingApprovalCount = 0;
      }
    }
    this.save();
    return item;
  }

  events(threadId: string, afterSeq = 0): UclawRunStreamItem[] {
    const jsonlEvents = this.readThreadJsonlEvents(threadId);
    const source = jsonlEvents.length > 0 ? jsonlEvents : this.data.events.filter((item) => item.threadId === threadId);
    return source
      .filter((item) => item.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq);
  }

  nextEventSeq(threadId: string): number {
    const maxSeq = this.events(threadId).reduce((max, item) => Math.max(max, item.seq), 0);
    return maxSeq + 1;
  }

  listSkills(): SkillItem[] {
    return [...this.data.skills];
  }

  updateSkill(input: SkillUpdateInput): SkillItem {
    const skill = this.data.skills.find((item) => item.id === input.id);
    if (!skill) throw new Error(`Skill not found: ${input.id}`);
    skill.enabled = input.enabled;
    this.save();
    return { ...skill };
  }

  searchRag(query: string, courseId?: string): RagSearchResult[] {
    const normalized = query.trim() || "course materials";
    const courses = this.data.courses.filter(
      (course) => course.id !== SEMESTER_HOME_COURSE_ID && (!courseId || courseId === SEMESTER_HOME_COURSE_ID || course.id === courseId),
    ).filter((course) => course.semesterId === this.data.semester.id);
    return courses.slice(0, 2).flatMap((course, courseIndex) => [
      {
        id: `rag-${course.id}-rubric`,
        courseId: course.id,
        title: `${course.code} rubric notes`,
        source: "rubric.md",
        citation: `${course.code} rubric, p.${courseIndex + 2}`,
        excerpt: `Rubric evidence for "${normalized}": identify the governing rule, compare policy tradeoffs, and cite at least two course readings.`,
        score: 0.91 - courseIndex * 0.08,
      },
      {
        id: `rag-${course.id}-lecture`,
        courseId: course.id,
        title: `${course.name} lecture brief`,
        source: "week-06-lecture.pdf",
        citation: `Week 6 lecture, slide ${courseIndex + 9}`,
        excerpt: `The lecture frames "${normalized}" as a conflict between institutional incentives, factual uncertainty, and remedy design.`,
        score: 0.84 - courseIndex * 0.05,
      },
    ]);
  }

  contextReport(threadId: string): ContextWindowReport {
    const messages = this.messages(threadId);
    const chars = messages.reduce((sum, message) => sum + message.content.length, 0);
    const tokens = Math.max(680, Math.round(chars / 3.4) + 2400);
    const budget = 128000;
    return {
      tokens,
      budget,
      percent: Math.min(100, Math.round((tokens / budget) * 100)),
      thresholdPercent: 70,
      summaryMessageCount: messages.length > 6 ? 1 : 0,
      compressedMessages: Math.max(0, messages.length - 6),
      sections: ["course", "task", "thread", "enabled skills"],
      files: ["rubric.md", "week-06-lecture.pdf", "draft-outline.md"],
      tools: ["search_course_materials", "read_workspace_file", "apply_workspace_patch", "git_diff"],
      skills: this.data.skills.filter((skill) => skill.enabled).map((skill) => skill.name),
    };
  }

  gitStatus(): GitStatus {
    return {
      root: process.cwd(),
      branch: "local/mock",
      changedFiles: 0,
      summary: "Git service stub is wired; real status will run through main-process GitService.",
    };
  }

  listFiles(courseId?: string): WorkspaceFileNode[] {
    if (!courseId || courseId === SEMESTER_HOME_COURSE_ID) {
      const semesterRoot =
        this.data.files.find((file) => file.courseId === SEMESTER_HOME_COURSE_ID && file.semesterId === this.data.semester.id && file.kind === "folder") ||
        this.ensureCourseFolder(SEMESTER_HOME_COURSE_ID);
      const semesterClone = cloneFile(semesterRoot);
      const courseRoots = this.data.files.filter((file) => file.semesterId === this.data.semester.id && file.courseId !== SEMESTER_HOME_COURSE_ID && file.kind === "folder");
      return [
        {
          ...semesterClone,
          children: [...(semesterClone.children || []), ...cloneFiles(courseRoots)],
        },
      ];
    }
    return cloneFiles(this.data.files.filter((file) => file.semesterId === this.data.semester.id && (!courseId || file.courseId === courseId)));
  }

  previewFile(fileId: string): FilePreview | null {
    const file = findFile(this.data.files, fileId);
    if (!file || file.kind === "folder") return null;
    const common = {
      id: file.id,
      title: file.name,
      path: file.path,
      kind: file.kind,
      metadata: {
        size: file.sizeLabel || "unknown",
        updated: file.updatedAt,
        courseId: file.courseId,
      },
    };
    if (file.kind === "markdown") {
      return {
        ...common,
        mimeType: "text/markdown",
        summary: "Markdown preview is rendered locally in the renderer; later this will come from FileService parser output.",
        content:
          `# ${file.name.replace(/\.md$/i, "")}\n\n` +
          `- Scope: current course/task materials\n` +
          `- RAG anchors: rubric, lecture notes, student draft\n` +
          `- Agent note: cite evidence before drafting recommendations\n\n` +
          `This mock preview keeps the UI contract ready for real markdown ingestion.`,
      };
    }
    if (file.kind === "code") {
      return {
        ...common,
        mimeType: "text/typescript",
        summary: "Code preview placeholder with syntax-friendly monospace layout.",
        content:
          `export function searchCourseMaterials(query: string) {\n` +
          `  return ragService.search({ query, scope: "current-course" });\n` +
          `}\n\n` +
          `export function requireApproval(toolName: string) {\n` +
          `  return ["apply_workspace_patch", "git_commit", "run_shell_command"].includes(toolName);\n` +
          `}\n`,
      };
    }
    if (file.kind === "pdf") {
      return {
        ...common,
        mimeType: "application/pdf",
        summary: "PDF preview placeholder. Real implementation will render pages in a sandboxed preview window.",
        pages: ["Page 1: liability framework", "Page 2: negligence factors", "Page 3: strict liability comparison"],
      };
    }
    if (file.kind === "pptx") {
      return {
        ...common,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        summary: "PPTX preview placeholder. Later: extract slide thumbnails and speaker notes.",
        pages: ["Slide 1: Platform duty", "Slide 2: Product defect analysis", "Slide 3: Remedies matrix"],
      };
    }
    if (file.kind === "docx") {
      return {
        ...common,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        summary: "DOCX preview placeholder. Later: render pages and expose parsed paragraphs to RAG.",
        pages: ["Heading: Legal standard", "Paragraph: Rule synthesis", "Comment: Citation needs checking"],
      };
    }
    if (file.kind === "image") {
      return {
        ...common,
        mimeType: "image/png",
        summary: "Image preview placeholder. Later: multimodal AI image understanding can feed RAG and timetable parsing.",
      };
    }
    return {
      ...common,
      summary: "Preview not available for this file type yet.",
    };
  }

  importFiles(input: FileImportInput): FileImportResult {
    const sourcePaths = input.sourcePaths || [];
    if (sourcePaths.length === 0) {
      return { files: [], tree: this.listFiles(input.courseId), indexingJob: null };
    }

    const timestamp = now();
    const root = this.ensureCourseFolder(input.courseId);
    const targetFolder = this.ensureTargetFolder(root, input);
    const importedFiles = sourcePaths.map((sourcePath) => {
      const stats = statSync(sourcePath);
      const name = basename(sourcePath);
      const file: WorkspaceFileNode = {
        id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        semesterId: this.data.semester.id,
        courseId: input.courseId,
        taskId: input.targetSection === "task" ? input.taskId : undefined,
        taskType: input.targetSection === "task" ? this.data.tasks.find((task) => task.id === input.taskId)?.taskType : undefined,
        taskFileBucket: input.targetSection === "task" ? input.taskFileBucket || "materials" : undefined,
        sectionKind: input.targetSection,
        weekNumber: input.targetSection === "week" ? input.weekNumber || 1 : undefined,
        sourcePath,
        name,
        path: `${targetFolder.path}/${name}`,
        kind: kindForPath(sourcePath),
        sizeLabel: formatSize(stats.size),
        updatedAt: timestamp,
      };
      targetFolder.children = [...(targetFolder.children || []), file];
      return file;
    });

    const sectionId = this.sectionIdForImport(input);
    const indexingJob = this.indexCourseFiles(input.courseId, sectionId);
    this.save();
    return {
      files: cloneFiles(importedFiles),
      tree: this.listFiles(input.courseId),
      indexingJob,
    };
  }

  courseFileSections(courseId: string): CourseFileSection[] {
    if (courseId === SEMESTER_HOME_COURSE_ID) {
      const files = this.listFiles(courseId);
      const leafFiles = flattenFiles(files);
      const provider = this.embeddingProvider();
      return [
        {
          id: `${courseId}:shared`,
          courseId,
          kind: "course_shared",
          title: "All semester files",
          indexingStatus: leafFiles.length > 0 ? "indexed" : "idle",
          embeddingModel: provider?.embeddingModel || "text-embedding-3-large",
          files: leafFiles,
        },
      ];
    }

    const files = this.listFiles(courseId);
    const tasks = this.listTasks(courseId);
    const provider = this.embeddingProvider();
    const embeddingModel = provider?.embeddingModel || "text-embedding-3-large";
    const leafFiles = flattenFiles(files);
    const weekSections: CourseFileSection[] = Array.from({ length: DEFAULT_WEEK_COUNT }, (_, index) => index + 1).map((weekNumber) => ({
      id: `${courseId}:week-${weekNumber}`,
      courseId,
      kind: "week",
      title: `Week ${weekNumber}`,
      weekNumber,
      indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:week-${weekNumber}`, leafFiles.some((file) => file.weekNumber === weekNumber)),
      embeddingModel,
      files: leafFiles.filter((file) => file.weekNumber === weekNumber),
    }));
    const taskSections: CourseFileSection[] = tasks.map((task) => ({
      id: `${courseId}:task-${task.id}`,
      courseId,
      kind: "task",
      title: `${taskTypeLabel(task.taskType)} / ${task.title}`,
      taskId: task.id,
      taskType: task.taskType,
      indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:task-${task.id}`, leafFiles.some((file) => file.taskId === task.id)),
      embeddingModel,
      files: leafFiles.filter((file) => file.taskId === task.id),
    }));
    const sharedFiles = leafFiles.filter((file) => !file.taskId && !file.weekNumber);

    return [
      {
        id: `${courseId}:shared`,
        courseId,
        kind: "course_shared",
        title: "Course shared",
        indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:shared`, sharedFiles.length > 0),
        embeddingModel,
        files: sharedFiles,
      },
      ...weekSections,
      ...taskSections,
    ];
  }

  indexCourseFiles(courseId: string, sectionId?: string): IndexingJob {
    const sections = this.courseFileSections(courseId);
    const files = sectionId ? sections.find((section) => section.id === sectionId)?.files || [] : sections.flatMap((section) => section.files);
    const provider = this.embeddingProvider();
    const job: IndexingJob = {
      id: `index-${Date.now().toString(36)}`,
      semesterId: this.data.semester.id,
      courseId,
      sectionId,
      status: "indexed",
      embeddingModel: provider?.embeddingModel || "text-embedding-3-large",
      indexedFiles: flattenFiles(files).length,
      progress: 100,
      createdAt: now(),
      updatedAt: now(),
    };
    this.data.indexingJobs.unshift(job);
    this.save();
    return { ...job };
  }

  listIndexingJobs(courseId?: string): IndexingJob[] {
    return this.data.indexingJobs
      .filter((job) => job.semesterId === this.data.semester.id && (!courseId || job.courseId === courseId))
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    const job = this.data.indexingJobs.find((item) => item.id === jobId);
    if (!job) return null;
    job.status = "cancelled";
    job.updatedAt = now();
    this.save();
    return { ...job };
  }

  listProviders(): ModelProviderConfig[] {
    return this.data.providers.map((provider) => ({ ...provider }));
  }

  saveProvider(input: ProviderDraftInput): ModelProviderConfig {
    const timestamp = now();
    const existing = input.id ? this.data.providers.find((provider) => provider.id === input.id) : undefined;
    const next: ModelProviderConfig = {
      id: input.id || `provider-${Date.now().toString(36)}`,
      name: input.name.trim() || "Custom Provider",
      protocol: input.protocol,
      baseUrl: input.baseUrl.trim(),
      apiKeyMasked: input.apiKey.trim() ? maskApiKey(input.apiKey) : existing?.apiKeyMasked || "",
      chatModel: input.chatModel,
      embeddingModel: input.embeddingModel,
      multimodalModel: input.multimodalModel,
      enabled: input.enabled ?? true,
      embeddingEnabled: input.embeddingEnabled ?? existing?.embeddingEnabled ?? Boolean(input.embeddingModel),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const index = this.data.providers.findIndex((provider) => provider.id === next.id);
    if (index >= 0) {
      next.createdAt = this.data.providers[index].createdAt;
      this.data.providers[index] = next;
    } else {
      this.data.providers.push(next);
    }
    this.save();
    return next;
  }

  providerModels(providerId: string): ProviderModel[] {
    const provider = this.data.providers.find((item) => item.id === providerId);
    if (provider?.protocol === "anthropic_messages") {
      return [
        { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", type: "chat" },
        { id: "claude-opus-4.1", name: "Claude Opus 4.1", type: "chat" },
      ];
    }
    return [
      { id: "gpt-5.1", name: "GPT-5.1", type: "chat" },
      { id: "gpt-5.1-mini", name: "GPT-5.1 mini", type: "chat" },
      { id: "text-embedding-3-large", name: "text-embedding-3-large", type: "embedding" },
      { id: "text-embedding-3-small", name: "text-embedding-3-small", type: "embedding" },
      { id: "gpt-5.1", name: "GPT-5.1 multimodal", type: "multimodal" },
    ];
  }

  testProvider(providerId: string): ProviderTestResult {
    const provider = this.data.providers.find((item) => item.id === providerId);
    return {
      ok: Boolean(provider),
      latencyMs: 128,
      message: provider ? `${provider.name} mock connection is reachable.` : "Provider not found.",
    };
  }

  listTimetableEvents(query: TimetableRangeQuery): TimetableEvent[] {
    const start = Date.parse(query.rangeStart);
    const end = Date.parse(query.rangeEnd);
    return this.data.timetableEvents
      .filter((event) => {
        if (event.semesterId !== this.data.semester.id) return false;
        const startsAt = Date.parse(event.startsAt);
        const endsAt = Date.parse(event.endsAt || event.startsAt);
        const inRange = startsAt <= end && endsAt >= start;
        if (!inRange) return false;
        if (query.courseId && event.courseId && event.courseId !== query.courseId) return false;
        if (event.kind === "school_event" && query.includeSchoolEvents === false) return false;
        if (event.kind === "deadline" && query.includeDeadlines === false) return false;
        return true;
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }

  analyzeTimetableImage(input: TimetableImageAnalyzeInput): TimetableImageAnalyzeResult {
    const generated: TimetableEvent = {
      id: `tt-ai-image-${Date.now().toString(36)}`,
      semesterId: this.data.semester.id,
      title: "Recognized timetable block",
      kind: "course_session",
      source: "multimodal_image",
      courseId: input.courseId,
      startsAt: "2026-05-11T10:00:00.000Z",
      endsAt: "2026-05-11T11:30:00.000Z",
      location: "Pending confirmation",
      notes: input.instruction || "Created from multimodal AI image analysis placeholder.",
      confidence: 0.82,
    };
    this.data.timetableEvents.push(generated);
    this.save();
    return {
      id: `tt-import-${Date.now().toString(36)}`,
      status: "completed",
      source: "multimodal_image",
      createdEvents: [generated],
      warnings: input.imageIds?.length || input.imagePaths?.length ? [] : ["No image selected yet; returned mock analysis output."],
    };
  }

  private touchThread(threadId: string): void {
    const thread = this.data.threads.find((item) => item.id === threadId);
    if (thread) thread.updatedAt = now();
  }

  private load(): StoreShape {
    if (!existsSync(this.filePath)) {
      const data = normalizeStore(initialStore());
      this.write(data);
      return data;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<StoreShape>;
      const initial = initialStore();
      const data: StoreShape = {
        ...initial,
        ...parsed,
        courses: parsed.courses ?? initial.courses,
        semester: parsed.semester ?? initial.semester,
        semesters: parsed.semesters ?? (parsed.semester ? [parsed.semester] : initial.semesters),
        currentSemesterId: parsed.currentSemesterId ?? parsed.semester?.id ?? initial.currentSemesterId,
        tasks: parsed.tasks ?? initial.tasks,
        threads: parsed.threads ?? initial.threads,
        messages: parsed.messages ?? initial.messages,
        events: parsed.events ?? initial.events,
        skills: parsed.skills ?? initial.skills,
        files: parsed.files ?? initial.files,
        timetableEvents: parsed.timetableEvents ?? initial.timetableEvents,
        providers: normalizeProviders(parsed.providers ?? initial.providers),
        indexingJobs: parsed.indexingJobs ?? initial.indexingJobs,
      };
      return normalizeStore(data);
    } catch (error) {
      console.warn("[store] Failed to read local store, using seed data", error);
      return initialStore();
    }
  }

  private save(): void {
    this.write(this.data);
  }

  private embeddingProvider(): ModelProviderConfig | undefined {
    return (
      this.data.providers.find((item) => item.embeddingEnabled && item.embeddingModel) ||
      this.data.providers.find((item) => item.enabled && item.embeddingModel) ||
      this.data.providers.find((item) => item.enabled)
    );
  }

  private ensureCourseFolder(courseId: string): WorkspaceFileNode {
    const course =
      courseId === SEMESTER_HOME_COURSE_ID
        ? semesterHomeCourse(this.data.semester)
        : this.data.courses.find((item) => item.id === courseId && item.semesterId === this.data.semester.id);
    const folderName = course ? folderNameForCourse(course, this.data.semester) : "Course";
    let root = this.data.files.find((file) => file.courseId === courseId && file.semesterId === this.data.semester.id && file.kind === "folder");
    if (!root) {
      root = {
        id: `folder-${this.data.semester.id}-${courseId}`,
        semesterId: this.data.semester.id,
        courseId,
        name: folderName,
        path: folderName,
        kind: "folder",
        updatedAt: now(),
        children: [],
      };
      this.data.files.push(root);
    }
    root.name = folderName;
    root.path = folderName;
    root.children ||= [];
    rebaseChildPaths(root);
    return root;
  }

  private ensureTargetFolder(root: WorkspaceFileNode, input: FileImportInput): WorkspaceFileNode {
    const timestamp = now();
    if (root.courseId === SEMESTER_HOME_COURSE_ID) {
      return ensureFolderPath(root, [{ name: "Semester shared", extra: { sectionKind: "course_shared" } }], timestamp);
    }
    if (input.targetSection === "course_shared") {
      return ensureFolderPath(root, [{ name: "Course shared", extra: { sectionKind: "course_shared" } }], timestamp);
    }
    if (input.targetSection === "week") {
      const weekNumber = input.weekNumber || 1;
      return ensureFolderPath(
        root,
        [
          { name: "Week", extra: { sectionKind: "week" } },
          { name: `Week ${weekNumber}`, extra: { sectionKind: "week", weekNumber } },
        ],
        timestamp,
      );
    }

    const task = input.taskId ? this.data.tasks.find((item) => item.id === input.taskId) : undefined;
    const taskType = task?.taskType || "assignment";
    const taskFolder = ensureFolderPath(
      root,
      [
        { name: "Task", extra: { sectionKind: "task" } },
        { name: taskTypeLabel(taskType), extra: { sectionKind: "task", taskType } },
        {
          name: task?.title || "Task workspace",
          extra: { sectionKind: "task", taskId: input.taskId, taskType },
        },
      ],
      timestamp,
    );
    ensureTaskBucketFolders(taskFolder, input.courseId, input.taskId, taskType, timestamp);
    return ensureFolderChild(
      taskFolder,
      taskBucketLabel(input.taskFileBucket || "materials"),
      {
        courseId: input.courseId,
        taskId: input.taskId,
        taskType,
        taskFileBucket: input.taskFileBucket || "materials",
        sectionKind: "task",
      },
      timestamp,
    );
  }

  private sectionIdForImport(input: FileImportInput): string | undefined {
    if (input.targetSection === "course_shared") return `${input.courseId}:shared`;
    if (input.targetSection === "week") return `${input.courseId}:week-${input.weekNumber || 1}`;
    if (input.targetSection === "task" && input.taskId) return `${input.courseId}:task-${input.taskId}`;
    return undefined;
  }

  private indexingStatusForSection(courseId: string, sectionId: string, hasFiles: boolean): IndexingJob["status"] {
    const job = this.data.indexingJobs.find((item) => item.semesterId === this.data.semester.id && item.courseId === courseId && item.sectionId === sectionId);
    if (job) return job.status;
    return hasFiles ? "indexed" : "idle";
  }

  private appendThreadJsonl(threadId: string, payload: Record<string, unknown>): void {
    const logPath = this.threadJsonlPath(threadId);
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(
      logPath,
      `${JSON.stringify({
        id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        semesterId: this.threadSemesterId(threadId),
        threadId,
        createdAt: now(),
        ...payload,
      })}\n`,
      "utf8",
    );
  }

  private readThreadJsonlEvents(threadId: string): UclawRunStreamItem[] {
    const logPath = this.threadJsonlPath(threadId);
    if (!existsSync(logPath)) return [];
    try {
      const raw = readFileSync(logPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .flatMap((line) => {
          try {
            const parsed = JSON.parse(line) as { type?: string; item?: unknown };
            if (parsed.type !== "run_item" || !parsed.item) return [];
            return [parsed.item as UclawRunStreamItem];
          } catch {
            return [];
          }
        });
    } catch (error) {
      console.warn(`[store] Failed to read thread event log: ${threadId}`, error);
      return [];
    }
  }

  private threadJsonlPath(threadId: string): string {
    const semesterId = this.threadSemesterId(threadId);
    return join(dirname(this.filePath), "semesters", semesterId, "threads", `${threadId}.jsonl`);
  }

  private threadSemesterId(threadId: string): string {
    const thread = this.data.threads.find((item) => item.id === threadId);
    return thread?.semesterId || this.data.semester.id;
  }

  private write(data: StoreShape): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}

function cloneFile(file: WorkspaceFileNode): WorkspaceFileNode {
  return {
    ...file,
    children: file.children ? cloneFiles(file.children) : undefined,
  };
}

function cloneFiles(files: WorkspaceFileNode[]): WorkspaceFileNode[] {
  return files.map((file) => cloneFile(file));
}

function flattenFiles(files: WorkspaceFileNode[]): WorkspaceFileNode[] {
  return files.flatMap((file) => (file.kind === "folder" ? flattenFiles(file.children || []) : [file]));
}

function findFile(files: WorkspaceFileNode[], fileId: string): WorkspaceFileNode | null {
  for (const file of files) {
    if (file.id === fileId) return file;
    const child = file.children ? findFile(file.children, fileId) : null;
    if (child) return child;
  }
  return null;
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindForPath(filePath: string): WorkspaceFileNode["kind"] {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx" || ext === ".doc") return "docx";
  if (ext === ".pptx" || ext === ".ppt") return "pptx";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  if ([".md", ".markdown"].includes(ext)) return "markdown";
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".cpp", ".c", ".h", ".css", ".html", ".json"].includes(ext)) return "code";
  if ([".txt", ".csv", ".rtf"].includes(ext)) return "text";
  return "unknown";
}

function folderNameForCourse(course: Course, semester?: SemesterWorkspace): string {
  if (course.workspaceKind === "semester_home" || course.id === SEMESTER_HOME_COURSE_ID) {
    return semester?.folderName || course.term || "Semester";
  }
  return course.name || "Course";
}

function taskTypeLabel(taskType: TaskType): string {
  return TASK_TYPE_LABELS[taskType] || "Assignment";
}

function taskBucketLabel(bucket: TaskFileBucket): string {
  return TASK_FILE_BUCKET_LABELS[bucket] || "Materials";
}

function orderedTaskTypes(tasks: UclawTask[]): TaskType[] {
  const discovered = tasks.map((task) => task.taskType);
  return [...DEFAULT_TASK_TYPES, ...discovered.filter((taskType) => !DEFAULT_TASK_TYPES.includes(taskType))].filter(
    (taskType, index, all) => all.indexOf(taskType) === index,
  );
}

function semesterHomeCourse(semester?: SemesterWorkspace): Course {
  return {
    id: SEMESTER_HOME_COURSE_ID,
    semesterId: semester?.id,
    name: "Home TaskAgent",
    code: semester?.semesterNo || "SEMESTER",
    term: semester?.term || "Spring 2026",
    instructor: "Workspace",
    workspaceKind: "semester_home",
    color: "#111827",
    description: "Semester-level TaskAgent that can see all course folders and route work into course/task workspaces.",
  };
}

function normalizeCourses(courses: Course[], semester?: SemesterWorkspace): Course[] {
  const home = semesterHomeCourse(semester);
  const realCourses = courses
    .filter((course) => course.id !== SEMESTER_HOME_COURSE_ID)
    .filter((course) => !semester?.id || course.semesterId === semester.id)
    .map((course) => ({ ...course, semesterId: course.semesterId || semester?.id, workspaceKind: course.workspaceKind || "course" }));
  return [{ ...home, code: semester?.semesterNo || home.code, term: semester?.term || home.term, workspaceKind: "semester_home" }, ...realCourses];
}

function normalizeSemesters(semesters: SemesterWorkspace[] | undefined, current: SemesterWorkspace): SemesterWorkspace[] {
  const normalized = upsertSemester(semesters || [], current);
  return normalized.length > 0 ? normalized : [current];
}

function upsertSemester(semesters: SemesterWorkspace[], semester: SemesterWorkspace): SemesterWorkspace[] {
  const existing = semesters.findIndex((item) => item.id === semester.id);
  if (existing >= 0) {
    return semesters.map((item, index) => (index === existing ? { ...item, ...semester } : item));
  }
  return [...semesters, semester];
}

function normalizeStore(data: StoreShape): StoreShape {
  const fallback = initialStore();
  const semesters = normalizeSemesters(data.semesters, data.semester || fallback.semester);
  const currentSemesterId = semesters.some((item) => item.id === data.currentSemesterId)
    ? data.currentSemesterId
    : data.semester?.id || semesters[0]?.id || fallback.currentSemesterId;
  const semester = semesters.find((item) => item.id === currentSemesterId) || semesters[0] || fallback.semester;
  const timestamp = now();
  const courses = data.courses
    .filter((course) => course.id !== SEMESTER_HOME_COURSE_ID)
    .map((course) => ({
      ...course,
      semesterId: course.semesterId || semester.id,
      workspaceKind: "course" as const,
    }));
  const courseSemester = new Map(courses.map((course) => [course.id, course.semesterId || semester.id]));
  const tasks = data.tasks.map((task) => ({
    ...task,
    semesterId: task.semesterId || courseSemester.get(task.courseId) || semester.id,
  }));
  const threads = data.threads.map((thread) => ({
    ...thread,
    semesterId: thread.semesterId || courseSemester.get(thread.courseId) || semester.id,
    threadType: thread.threadType === "home" ? "course_home" : thread.threadType,
  }));
  for (const item of semesters) {
    if (!threads.some((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID && thread.semesterId === item.id)) {
      threads.unshift({
        id: `thread-semester-home-${item.id}`,
        semesterId: item.id,
        courseId: SEMESTER_HOME_COURSE_ID,
        threadType: "semester_home",
        title: "Home TaskAgent",
        createdAt: timestamp,
        updatedAt: timestamp,
        latestRunStatus: "idle",
        latestEventSeq: 0,
        pendingApprovalCount: 0,
      });
    }
  }
  const homeMessages = threads
    .filter((thread) => thread.courseId === SEMESTER_HOME_COURSE_ID && !data.messages.some((message) => message.threadId === thread.id))
    .map((thread) => ({
      id: `message-${thread.id}`,
      threadId: thread.id,
      role: "assistant" as const,
      createdAt: timestamp,
      content:
        "Home TaskAgent is the semester entry point. It can see every course folder, route files into courses, and narrow work down into task sessions when needed.",
    }));
  const messages = homeMessages.length > 0 ? [...homeMessages, ...data.messages] : data.messages;
  const files = data.files.map((file) => ({
    ...file,
    semesterId: file.semesterId || courseSemester.get(file.courseId) || semester.id,
  }));
  const timetableEvents = data.timetableEvents.map((event) => ({
    ...event,
    semesterId: event.semesterId || courseSemester.get(event.courseId || "") || semester.id,
  }));
  const indexingJobs = (data.indexingJobs || []).map((job) => ({
    ...job,
    semesterId: job.semesterId || courseSemester.get(job.courseId) || semester.id,
  }));
  return normalizeWorkspaceFolders({
    ...data,
    semester,
    semesters,
    currentSemesterId: semester.id,
    courses,
    tasks,
    threads,
    messages,
    files,
    timetableEvents,
    indexingJobs,
    providers: normalizeProviders(data.providers),
  });
}

function normalizeWorkspaceFolders(data: StoreShape): StoreShape {
  const timestamp = now();
  const files: WorkspaceFileNode[] = [];

  function ensureRoot(course: Course, semester: SemesterWorkspace): WorkspaceFileNode {
    const folderName = folderNameForCourse(course, semester);
    const existingRoots = data.files.filter((file) => file.semesterId === semester.id && file.courseId === course.id);
    let root = existingRoots.find((file) => file.kind === "folder");
    if (!root) {
      root = {
        id: `folder-${semester.id}-${course.id}`,
        semesterId: semester.id,
        courseId: course.id,
        name: folderName,
        path: folderName,
        kind: "folder",
        updatedAt: timestamp,
        children: [],
      };
    }
    root.semesterId = semester.id;
    root.name = folderName;
    root.path = folderName;
    root.children = [];
    files.push(root);
    return root;
  }

  for (const semester of data.semesters) {
    for (const course of normalizeCourses(data.courses, semester)) {
      const existingLeaves = data.files
        .filter((file) => file.semesterId === semester.id && file.courseId === course.id)
        .flatMap((file) => (file.kind === "folder" ? flattenFiles(file.children || []) : [file]));
      const leafById = new Map(existingLeaves.map((file) => [file.id, file]));
      const root = ensureRoot(course, semester);

      if (course.id === SEMESTER_HOME_COURSE_ID) {
        ensureFolderPath(root, [{ name: "Semester shared", extra: { sectionKind: "course_shared" } }], timestamp);
        for (const file of leafById.values()) {
          moveLeafIntoTarget(root, file, semesterSharedFolder(root), { sectionKind: "course_shared" });
        }
        continue;
      }

      ensureFolderPath(root, [{ name: "Course shared", extra: { sectionKind: "course_shared" } }], timestamp);
      const weekRoot = ensureFolderPath(root, [{ name: "Week", extra: { sectionKind: "week" } }], timestamp);
      for (let weekNumber = 1; weekNumber <= DEFAULT_WEEK_COUNT; weekNumber += 1) {
        ensureFolderChild(weekRoot, `Week ${weekNumber}`, { sectionKind: "week", weekNumber }, timestamp);
      }
      const courseTasks = data.tasks.filter((item) => item.semesterId === semester.id && item.courseId === course.id);
      const taskRoot = ensureFolderPath(root, [{ name: "Task", extra: { sectionKind: "task" } }], timestamp);
      for (const taskType of orderedTaskTypes(courseTasks)) {
        ensureFolderChild(taskRoot, taskTypeLabel(taskType), { sectionKind: "task", taskType }, timestamp);
      }
      for (const task of courseTasks) {
        const taskFolder = ensureTaskWorkspace(root, task, timestamp);
        ensureTaskBucketFolders(taskFolder, course.id, task.id, task.taskType, timestamp);
      }

      for (const file of leafById.values()) {
        const route = routeLeafFile(root, file, courseTasks);
        moveLeafIntoTarget(root, file, route.target, route.extra);
      }
    }
  }

  return { ...data, files };
}

function ensureTaskWorkspace(root: WorkspaceFileNode, task: UclawTask, timestamp: string): WorkspaceFileNode {
  return ensureFolderPath(
    root,
    [
      { name: "Task", extra: { sectionKind: "task" } },
      { name: taskTypeLabel(task.taskType), extra: { sectionKind: "task", taskType: task.taskType } },
      { name: task.title, extra: { sectionKind: "task", taskId: task.id, taskType: task.taskType } },
    ],
    timestamp,
  );
}

function ensureTaskBucketFolders(
  taskFolder: WorkspaceFileNode,
  courseId: string,
  taskId: string | undefined,
  taskType: TaskType,
  timestamp: string,
): void {
  (Object.keys(TASK_FILE_BUCKET_LABELS) as TaskFileBucket[]).forEach((bucket) => {
    ensureFolderChild(
      taskFolder,
      taskBucketLabel(bucket),
      {
        courseId,
        taskId,
        taskType,
        taskFileBucket: bucket,
        sectionKind: "task",
      },
      timestamp,
    );
  });
}

type FolderSegment = {
  name: string;
  extra?: Partial<WorkspaceFileNode>;
};

function ensureFolderPath(root: WorkspaceFileNode, segments: FolderSegment[], timestamp: string): WorkspaceFileNode {
  return segments.reduce((parent, segment) => ensureFolderChild(parent, segment.name, segment.extra || {}, timestamp), root);
}

function ensureFolderChild(
  parent: WorkspaceFileNode,
  name: string,
  extra: Partial<WorkspaceFileNode> = {},
  timestamp: string,
): WorkspaceFileNode {
  parent.children ||= [];
  let child = parent.children.find((item) => item.kind === "folder" && item.name === name);
  if (!child) {
    child = {
      id: `folder-${parent.id}-${slugify(name)}`,
      semesterId: parent.semesterId,
      courseId: parent.courseId,
      name,
      path: `${parent.path}/${name}`,
      kind: "folder",
      updatedAt: timestamp,
      children: [],
    };
    parent.children.push(child);
  }
  child.semesterId = extra.semesterId || parent.semesterId;
  child.courseId = extra.courseId || parent.courseId;
  child.name = name;
  child.path = `${parent.path}/${name}`;
  child.kind = "folder";
  child.updatedAt ||= timestamp;
  child.children ||= [];
  Object.assign(child, withoutUndefined(extra));
  rebaseChildPaths(child);
  return child;
}

function routeLeafFile(
  root: WorkspaceFileNode,
  file: WorkspaceFileNode,
  tasks: UclawTask[],
): { target: WorkspaceFileNode; extra: Partial<WorkspaceFileNode> } {
  const task = inferTaskForFile(file, tasks);
  if (task) {
    const taskFolder = ensureTaskWorkspace(root, task, now());
    ensureTaskBucketFolders(taskFolder, root.courseId, task.id, task.taskType, now());
    const taskFileBucket = file.taskFileBucket || inferTaskFileBucket(file);
    return {
      target: ensureFolderChild(
        taskFolder,
        taskBucketLabel(taskFileBucket),
        {
          taskId: task.id,
          taskType: task.taskType,
          taskFileBucket,
          sectionKind: "task",
        },
        now(),
      ),
      extra: { sectionKind: "task", taskId: task.id, taskType: task.taskType, taskFileBucket, weekNumber: undefined },
    };
  }

  const weekNumber = file.weekNumber || inferWeekNumber(`${file.path} ${file.name}`);
  if (weekNumber) {
    const target = ensureFolderPath(
      root,
      [
        { name: "Week", extra: { sectionKind: "week" } },
        { name: `Week ${weekNumber}`, extra: { sectionKind: "week", weekNumber } },
      ],
      now(),
    );
    return { target, extra: { sectionKind: "week", weekNumber, taskId: undefined, taskFileBucket: undefined } };
  }

  return {
    target: ensureFolderPath(root, [{ name: "Course shared", extra: { sectionKind: "course_shared" } }], now()),
    extra: { sectionKind: "course_shared", taskId: undefined, taskFileBucket: undefined, weekNumber: undefined },
  };
}

function semesterSharedFolder(root: WorkspaceFileNode): WorkspaceFileNode {
  return ensureFolderPath(root, [{ name: "Semester shared", extra: { sectionKind: "course_shared" } }], now());
}

function moveLeafIntoTarget(
  root: WorkspaceFileNode,
  file: WorkspaceFileNode,
  target: WorkspaceFileNode,
  extra: Partial<WorkspaceFileNode>,
): void {
  target.children ||= [];
  const moved: WorkspaceFileNode = {
    ...file,
    ...extra,
    semesterId: target.semesterId || root.semesterId,
    courseId: target.courseId || root.courseId,
    path: `${target.path}/${file.name}`,
    children: undefined,
  };
  const existingIndex = target.children.findIndex((child) => child.id === moved.id);
  if (existingIndex >= 0) target.children[existingIndex] = moved;
  else target.children.push(moved);
}

function inferTaskForFile(file: WorkspaceFileNode, tasks: UclawTask[]): UclawTask | undefined {
  if (file.taskId) return tasks.find((task) => task.id === file.taskId);
  const haystack = `${file.path} ${file.name}`.toLowerCase();
  return tasks.find((task) => haystack.includes(task.title.toLowerCase()));
}

function inferTaskFileBucket(file: WorkspaceFileNode): TaskFileBucket {
  const haystack = `${file.path} ${file.name}`.toLowerCase();
  if (haystack.includes("submitted") || haystack.includes("已提交") || haystack.includes("final")) return "submitted";
  if (haystack.includes("draft")) return "drafts";
  return "materials";
}

function rebaseChildPaths(folder: WorkspaceFileNode): void {
  for (const child of folder.children || []) {
    child.path = `${folder.path}/${child.name}`;
    if (child.kind === "folder") rebaseChildPaths(child);
  }
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function inferWeekNumber(name: string): number | undefined {
  const match = name.match(/week[-_\s]?(\d{1,2})/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value > 0 && value <= DEFAULT_WEEK_COUNT ? value : undefined;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
}

function normalizeProviders(providers: ModelProviderConfig[]): ModelProviderConfig[] {
  return providers.map((provider) => ({
    ...provider,
    embeddingEnabled: provider.embeddingEnabled ?? Boolean(provider.embeddingModel),
  }));
}

export function createLocalStore(userDataPath: string): LocalStore {
  return new LocalStore(join(userDataPath, "uclaw-state.json"));
}
