export interface Course {
  id: string;
  semesterId?: string;
  name: string;
  code: string;
  term: string;
  instructor: string;
  workspaceKind?: "semester_home" | "course";
  meetingTime?: string;
  location?: string;
  color: string;
  description: string;
  archivedAt?: string;
}

export interface SemesterWorkspace {
  id: string;
  semesterNo: string;
  term: string;
  folderName: string;
  startsAt?: string;
  endsAt?: string;
  source: "manual";
  recognizedAt?: string;
  archivedAt?: string;
}

export interface CreateSemesterInput {
  term: string;
  folderName?: string;
  semesterNo?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface CreateCourseInput {
  name: string;
  code: string;
  instructor?: string;
  meetingTime?: string;
  location?: string;
  color?: string;
  description?: string;
}

/**
 * Task type is user-defined free-form string (e.g. "assignment", "exam", "读书报告", "小组项目").
 * It's a business label for display, filtering, icons, and section titles.
 * Physical task workspace paths are keyed by task id:
 *   <courseDir>/Task/<taskId>__<taskTitle>/{Materials, Drafts, Submitted}
 */
export type TaskType = string;
export type TaskStatus = "not_started" | "in_progress" | "due_soon" | "done";
export type TaskFileBucket = "materials" | "drafts" | "submitted";

export interface UclawTask {
  id: string;
  semesterId?: string;
  courseId: string;
  title: string;
  taskType: TaskType;
  status: TaskStatus;
  dueAt?: string;
  summary: string;
}

export interface Thread {
  id: string;
  semesterId?: string;
  courseId: string;
  taskId?: string;
  threadType: "semester_home" | "task";
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface CreateThreadInput {
  courseId: string;
  taskId?: string;
  title?: string;
}

export interface CreateTaskInput {
  courseId: string;
  title: string;
  taskType?: TaskType;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  taskType?: TaskType;
  status?: TaskStatus;
  dueAt?: string | null;
  summary?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  version: string;
  instructions?: string;
  slug?: string;
  sourcePath?: string;
}

export interface SkillUpdateInput {
  id: string;
  enabled: boolean;
}

export interface SkillWriteInput {
  id: string;
  content: string;
}

export interface SkillImportInput {
  sourcePath?: string;
  enabled?: boolean;
}

export interface RagSearchResult {
  id: string;
  courseId: string;
  title: string;
  source: string;
  citation: string;
  excerpt: string;
  score: number;
}

export interface GitStatus {
  root: string;
  branch: string;
  changedFiles: number;
  summary: string;
}

export type WorkspaceFileKind =
  | "folder"
  | "pdf"
  | "docx"
  | "pptx"
  | "image"
  | "markdown"
  | "code"
  | "text"
  | "unknown";

export interface WorkspaceFileNode {
  id: string;
  semesterId: string;
  courseId: string;
  taskId?: string;
  taskType?: TaskType;
  taskFileBucket?: TaskFileBucket;
  sectionKind?: CourseFileSectionKind;
  weekNumber?: number;
  sourcePath?: string;
  name: string;
  path: string;
  kind: WorkspaceFileKind;
  sizeLabel?: string;
  updatedAt: string;
  children?: WorkspaceFileNode[];
}

export interface FilePreview {
  id: string;
  title: string;
  path: string;
  kind: WorkspaceFileKind;
  mimeType?: string;
  content?: string;
  summary?: string;
  pages?: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface FileSectionStat {
  id: string;
  kind: CourseFileSectionKind;
  title: string;
  fileCount: number;
}

export interface FileStats {
  semesterId: string;
  courseId?: string;
  scope: "semester" | "course";
  totalFiles: number;
  sectionCount: number;
  sections: FileSectionStat[];
  byKind: Record<WorkspaceFileKind, number>;
}

export type TimetableViewMode = "week" | "month" | "year";
export type TimetableEventKind = "course_session" | "deadline" | "school_event";
export type TimetableEventSource = "manual" | "course" | "school_calendar";

export interface TimetableRangeQuery {
  viewMode: TimetableViewMode;
  rangeStart: string;
  rangeEnd: string;
  courseId?: string;
  includeSchoolEvents?: boolean;
  includeDeadlines?: boolean;
}

export interface TimetableEvent {
  id: string;
  semesterId?: string;
  title: string;
  kind: TimetableEventKind;
  source: TimetableEventSource;
  startsAt: string;
  endsAt?: string;
  courseId?: string;
  taskId?: string;
  location?: string;
  notes?: string;
  confidence?: number;
}

export type CourseFileSectionKind = "course_shared" | "lecture" | "task";
export type IndexingStatus = "idle" | "queued" | "indexing" | "indexed" | "failed" | "cancelled";

export interface CourseFileSection {
  id: string;
  courseId: string;
  kind: CourseFileSectionKind;
  title: string;
  taskType?: TaskType;
  taskFileBucket?: TaskFileBucket;
  weekNumber?: number;
  taskId?: string;
  indexingStatus: IndexingStatus;
  embeddingModel?: string;
  files: WorkspaceFileNode[];
}

export interface IndexingJob {
  id: string;
  semesterId?: string;
  courseId: string;
  sectionId?: string;
  status: IndexingStatus;
  stage?: string;
  embeddingModel: string;
  indexedFiles: number;
  totalFiles?: number;
  completedFiles?: number;
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileImportInput {
  courseId: string;
  targetSection: CourseFileSectionKind;
  sourcePaths?: string[];
  weekNumber?: number;
  taskId?: string;
  taskFileBucket?: TaskFileBucket;
}

export interface FileImportResult {
  files: WorkspaceFileNode[];
  tree: WorkspaceFileNode[];
  indexingJob: IndexingJob | null;
}

export type ProviderPurpose = "agent" | "embedding";
export type AgentProtocol = "anthropic_messages";
export type EmbeddingProtocol = "openai_compatible";
export type ProviderProtocol = AgentProtocol | EmbeddingProtocol;
export type ProviderAuthMode = "api_key" | "auth_token" | "bearer";

export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ModelProviderConfig {
  id: string;
  purpose: ProviderPurpose;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKeyMasked: string;
  apiKeySecretRef?: string;
  authMode: ProviderAuthMode;
  models: ProviderModel[];
  selectedModel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDraftInput {
  id?: string;
  purpose: ProviderPurpose;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  authMode: ProviderAuthMode;
  models?: ProviderModel[];
  selectedModel: string;
  enabled?: boolean;
}

export interface ProviderDeleteInput {
  id: string;
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface UclawAPI {
  semester: {
    list: () => Promise<SemesterWorkspace[]>;
    listArchived: () => Promise<SemesterWorkspace[]>;
    current: () => Promise<SemesterWorkspace | null>;
    create: (input: CreateSemesterInput) => Promise<SemesterWorkspace>;
    select: (semesterId: string) => Promise<SemesterWorkspace>;
    archive: (semesterId: string) => Promise<SemesterWorkspace>;
    restore: (semesterId: string) => Promise<SemesterWorkspace>;
    delete: (semesterId: string) => Promise<boolean>;
  };
  courses: {
    list: () => Promise<Course[]>;
    listArchived: () => Promise<Course[]>;
    create: (input: CreateCourseInput) => Promise<Course>;
    archive: (courseId: string) => Promise<Course>;
    restore: (courseId: string) => Promise<Course>;
    delete: (courseId: string) => Promise<boolean>;
  };
  tasks: {
    list: (courseId: string) => Promise<UclawTask[]>;
    create: (input: CreateTaskInput) => Promise<UclawTask>;
    update: (input: UpdateTaskInput) => Promise<UclawTask>;
    delete: (taskId: string) => Promise<boolean>;
  };
  threads: {
    list: (courseId?: string) => Promise<Thread[]>;
    listArchived: (courseId?: string) => Promise<Thread[]>;
    create: (input: CreateThreadInput) => Promise<Thread>;
    archive: (threadId: string) => Promise<boolean>;
    restore: (threadId: string) => Promise<Thread>;
    delete: (threadId: string) => Promise<boolean>;
  };
  skills: {
    list: () => Promise<SkillItem[]>;
    update: (input: SkillUpdateInput) => Promise<SkillItem>;
    readContent: (skillId: string) => Promise<string>;
    writeContent: (input: SkillWriteInput) => Promise<SkillItem>;
    importFolder: (input: SkillImportInput) => Promise<SkillItem>;
    openFolder: (skillId: string) => Promise<void>;
  };
  rag: {
    search: (query: string, courseId?: string) => Promise<RagSearchResult[]>;
  };
  git: {
    status: () => Promise<GitStatus>;
  };
  files: {
    tree: (courseId?: string) => Promise<WorkspaceFileNode[]>;
    preview: (fileId: string) => Promise<FilePreview | null>;
    import: (input: FileImportInput) => Promise<FileImportResult>;
    sections: (courseId: string) => Promise<CourseFileSection[]>;
    stats: (courseId?: string) => Promise<FileStats>;
    index: (courseId: string, sectionId?: string) => Promise<IndexingJob>;
    indexingJobs: (courseId?: string) => Promise<IndexingJob[]>;
    cancelIndexing: (jobId: string) => Promise<IndexingJob | null>;
    delete: (fileId: string) => Promise<{ courseId: string; tree: WorkspaceFileNode[] }>;
    reveal: (fileId: string) => Promise<void>;
  };
  providers: {
    list: () => Promise<ModelProviderConfig[]>;
    save: (input: ProviderDraftInput) => Promise<ModelProviderConfig>;
    delete: (providerId: string) => Promise<boolean>;
    models: (providerId: string) => Promise<ProviderModel[]>;
    test: (providerId: string) => Promise<ProviderTestResult>;
  };
  timetable: {
    range: (query: TimetableRangeQuery) => Promise<TimetableEvent[]>;
  };
  app: {
    openExternal: (url: string) => Promise<void>;
  };
}
