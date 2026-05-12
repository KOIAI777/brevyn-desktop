import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface Course {
  id: string;
  semesterId?: string;
  name: string;
  code: string;
  term: string;
  instructor: string;
  workspaceKind?: "semester_home" | "course";
  icon?: CourseIconKey;
  meetingTime?: string;
  location?: string;
  color: string;
  description: string;
  archivedAt?: string;
}

export type CourseIconKey =
  | "graduation-cap"
  | "book-open"
  | "scale"
  | "landmark"
  | "briefcase"
  | "file-text"
  | "gavel"
  | "library"
  | "microscope"
  | "calculator"
  | "globe"
  | "presentation";

export interface SemesterWorkspace {
  id: string;
  semesterNo: string;
  term: string;
  folderName: string;
  startsAt?: string;
  endsAt?: string;
  source: "manual" | "filesystem";
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

export interface UpdateCourseInput {
  id: string;
  code?: string;
  instructor?: string;
  meetingTime?: string | null;
  location?: string | null;
  color?: string;
  icon?: CourseIconKey;
}

export interface ArchivedCourseScope {
  semesterId?: string;
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

export interface BrevynTask {
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
  isDraft?: boolean;
  messageCount?: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface CreateThreadInput {
  courseId: string;
  taskId?: string;
  title?: string;
  isDraft?: boolean;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}

export interface ArchivedThreadScope {
  semesterId?: string;
  courseId?: string;
}

export interface CreateTaskInput {
  courseId: string;
  title: string;
  taskType?: TaskType;
}

export interface UpdateTaskInput {
  id: string;
  status?: TaskStatus;
  dueAt?: string | null;
  summary?: string;
}

export type SkillResourceKind = "reference" | "script" | "asset" | "template" | "example" | "agent_config" | "other";

export interface SkillResource {
  kind: SkillResourceKind;
  name: string;
  relativePath: string;
  size: number;
  sizeLabel: string;
}

export interface SkillItem {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  version: string;
  category?: string;
  icon?: string;
  triggers?: string[];
  tags?: string[];
  scopes?: string[];
  allowedTools?: string[];
  instructions?: string;
  resources?: SkillResource[];
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
  fileId?: string;
  fileName?: string;
  title: string;
  source: string;
  citation: string;
  excerpt: string;
  score: number;
  path?: string;
  sectionKind?: CourseFileSectionKind;
  taskId?: string;
  chunkIndex?: number;
  chunkCount?: number;
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
  | "spreadsheet"
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
  displayName?: string;
  path: string;
  kind: WorkspaceFileKind;
  sizeLabel?: string;
  indexingStatus?: FileIndexingStatus;
  indexingProgress?: number;
  indexingError?: string;
  indexingWarning?: string;
  indexingUpdatedAt?: string;
  indexedAt?: string;
  updatedAt: string;
  children?: WorkspaceFileNode[];
}

export interface FilePreview {
  id: string;
  title: string;
  path: string;
  kind: WorkspaceFileKind;
  mimeType?: string;
  fileUrl?: string;
  content?: string;
  html?: string;
  summary?: string;
  pages?: string[];
  sheets?: SpreadsheetPreviewSheet[];
  metadata?: Record<string, string | number | boolean>;
}

export interface SpreadsheetPreviewSheet {
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
  totalRows: number;
  totalColumns: number;
  truncated?: boolean;
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
export type FileIndexingStatus = IndexingStatus | "warning" | "skipped";

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

export interface IndexActiveSemesterFailure {
  courseId: string;
  courseName: string;
  message: string;
}

export interface IndexActiveSemesterResult {
  jobs: IndexingJob[];
  failures: IndexActiveSemesterFailure[];
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
  indexingError?: string;
}

export type ProviderPurpose = "agent" | "embedding";
export type AgentProtocol = "anthropic_messages";
export type EmbeddingProtocol = "openai_compatible";
export type ProviderProtocol = AgentProtocol | EmbeddingProtocol;
export type ProviderAdapterKind = "anthropic" | "openai_embedding";
export type AgentProviderKind = "anthropic" | "deepseek" | "kimi-api" | "kimi-coding" | "custom-anthropic";
export type EmbeddingProviderKind = "openai" | "qwen" | "doubao" | "zhipu" | "minimax" | "custom-openai";
export type ProviderKind = AgentProviderKind | EmbeddingProviderKind;
export type ProviderAuthMode = "api_key" | "auth_token" | "bearer";

export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ProviderPreset {
  kind: ProviderKind;
  purpose: ProviderPurpose;
  label: string;
  adapterKind: ProviderAdapterKind;
  protocol: ProviderProtocol;
  baseUrl: string;
  authMode: ProviderAuthMode;
  models?: readonly ProviderModel[];
}

export const AGENT_PROVIDER_PRESETS = {
  anthropic: {
    kind: "anthropic",
    purpose: "agent",
    label: "Anthropic",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "https://api.anthropic.com",
    authMode: "api_key",
  },
  deepseek: {
    kind: "deepseek",
    purpose: "agent",
    label: "DeepSeek",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "https://api.deepseek.com/anthropic",
    authMode: "api_key",
    models: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", enabled: true },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", enabled: true },
    ],
  },
  "kimi-api": {
    kind: "kimi-api",
    purpose: "agent",
    label: "Kimi API",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "https://api.moonshot.cn/anthropic",
    authMode: "api_key",
    models: [{ id: "kimi-k2.6", name: "Kimi K2.6", enabled: true }],
  },
  "kimi-coding": {
    kind: "kimi-coding",
    purpose: "agent",
    label: "Kimi for Coding",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "https://api.kimi.com/coding/v1",
    authMode: "bearer",
    models: [{ id: "kimi-for-coding", name: "Kimi for Coding", enabled: true }],
  },
  "custom-anthropic": {
    kind: "custom-anthropic",
    purpose: "agent",
    label: "Custom Anthropic",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "",
    authMode: "api_key",
  },
} as const satisfies Record<AgentProviderKind, ProviderPreset>;

export const EMBEDDING_PROVIDER_PRESETS = {
  openai: {
    kind: "openai",
    purpose: "embedding",
    label: "OpenAI",
    adapterKind: "openai_embedding",
    protocol: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    authMode: "bearer",
  },
  qwen: {
    kind: "qwen",
    purpose: "embedding",
    label: "Qwen",
    adapterKind: "openai_embedding",
    protocol: "openai_compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    authMode: "bearer",
  },
  doubao: {
    kind: "doubao",
    purpose: "embedding",
    label: "Doubao",
    adapterKind: "openai_embedding",
    protocol: "openai_compatible",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    authMode: "bearer",
  },
  zhipu: {
    kind: "zhipu",
    purpose: "embedding",
    label: "Zhipu AI",
    adapterKind: "openai_embedding",
    protocol: "openai_compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authMode: "bearer",
  },
  minimax: {
    kind: "minimax",
    purpose: "embedding",
    label: "MiniMax",
    adapterKind: "openai_embedding",
    protocol: "openai_compatible",
    baseUrl: "https://api.minimax.chat/v1",
    authMode: "bearer",
  },
  "custom-openai": {
    kind: "custom-openai",
    purpose: "embedding",
    label: "Custom OpenAI Compatible",
    adapterKind: "openai_embedding",
    protocol: "openai_compatible",
    baseUrl: "",
    authMode: "bearer",
  },
} as const satisfies Record<EmbeddingProviderKind, ProviderPreset>;

export const PROVIDER_PRESETS = {
  ...AGENT_PROVIDER_PRESETS,
  ...EMBEDDING_PROVIDER_PRESETS,
} as const satisfies Record<ProviderKind, ProviderPreset>;

export interface ModelProviderConfig {
  id: string;
  purpose: ProviderPurpose;
  providerKind: ProviderKind;
  adapterKind: ProviderAdapterKind;
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
  providerKind: ProviderKind;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  clearApiKey?: boolean;
  authMode: ProviderAuthMode;
  models?: ProviderModel[];
  selectedModel: string;
  enabled?: boolean;
}

export interface ProviderSaveResult {
  provider: ModelProviderConfig;
  embeddingIndexMayBeStale: boolean;
}

export interface ProviderDeleteInput {
  id: string;
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export type AgentPermissionMode = "review" | "full_access";

export interface AgentAttachment {
  id: string;
  threadId: string;
  name: string;
  kind: WorkspaceFileKind;
  mimeType?: string;
  size: number;
  sizeLabel: string;
  path: string;
  createdAt: string;
}

export interface AgentAttachmentDataInput {
  threadId: string;
  name: string;
  mediaType?: string;
  data: string;
}

export interface AgentRunInput {
  threadId: string;
  prompt: string;
  mode?: "execute" | "plan";
  permissionMode?: AgentPermissionMode;
  attachments?: AgentAttachment[];
}

export interface AgentApprovalInput {
  threadId: string;
  requestId: string;
}

export type AgentApprovalDecision = "allow" | "deny";
export type AgentExitPlanDecision = "approve" | "deny";
export type AgentRunTerminalStatus = "completed" | "stopped" | "failed" | "interrupted";

export interface AgentExitPlanAllowedPrompt {
  tool: "Bash";
  prompt: string;
}

export interface AgentExitPlanRequest {
  requestId: string;
  threadId: string;
  runId: string;
  toolInput: Record<string, unknown>;
  allowedPrompts: AgentExitPlanAllowedPrompt[];
  createdAt: string;
}

export interface AgentExitPlanResponseInput {
  threadId: string;
  requestId: string;
  decision: AgentExitPlanDecision;
  feedback?: string;
}

export interface AgentAskUserQuestionOption {
  label: string;
  description?: string;
  preview?: string;
}

export interface AgentAskUserQuestion {
  question: string;
  header?: string;
  options: AgentAskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AgentAskUserRequest {
  requestId: string;
  threadId: string;
  runId: string;
  questions: AgentAskUserQuestion[];
  toolInput: Record<string, unknown>;
  createdAt: string;
}

export interface AgentAskUserResponseInput {
  threadId: string;
  requestId: string;
  answers: Record<string, string>;
}

export interface AgentApprovalRequest {
  requestId: string;
  threadId: string;
  runId: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
  riskLevel?: "normal" | "dangerous";
  title?: string;
  displayName?: string;
  description?: string;
  createdAt: string;
}

export type BrevynAgentRuntimeEvent =
  | { type: "run_started"; runId: string; threadId: string; permissionMode?: AgentPermissionMode; createdAt: string }
  | { type: "run_completed"; runId: string; threadId: string; resultSubtype?: string; createdAt: string }
  | { type: "run_stopped"; runId: string; threadId: string; reason?: string; createdAt: string }
  | { type: "run_failed"; runId: string; threadId: string; error: string; createdAt: string }
  | { type: "run_interrupted"; runId: string; threadId: string; reason: string; createdAt: string }
  | { type: "plan_mode_entered"; runId: string; threadId: string; createdAt: string }
  | { type: "exit_plan_requested"; request: AgentExitPlanRequest; createdAt: string }
  | { type: "exit_plan_resolved"; runId: string; threadId: string; requestId: string; decision: AgentExitPlanDecision; feedback?: string; createdAt: string }
  | { type: "approval_requested"; request: AgentApprovalRequest; createdAt: string }
  | { type: "approval_resolved"; runId: string; threadId: string; requestId: string; decision: AgentApprovalDecision; createdAt: string }
  | { type: "ask_user_requested"; request: AgentAskUserRequest; createdAt: string }
  | { type: "ask_user_resolved"; runId: string; threadId: string; requestId: string; answers: Record<string, string>; createdAt: string };

export type BrevynAgentSessionRecord = SDKMessage;

export type BrevynAgentTimelineRecord =
  | BrevynAgentSessionRecord
  | { kind: "runtime"; event: BrevynAgentRuntimeEvent };

export type BrevynAgentEvent =
  | { kind: "sdk_message"; threadId: string; message: SDKMessage }
  | { kind: "brevyn_event"; event: BrevynAgentRuntimeEvent };

export interface AgentRunResult {
  runId: string;
}

export interface BrevynAPI {
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
    listArchived: (scope?: ArchivedCourseScope) => Promise<Course[]>;
    create: (input: CreateCourseInput) => Promise<Course>;
    update: (input: UpdateCourseInput) => Promise<Course>;
    archive: (courseId: string) => Promise<Course>;
    restore: (courseId: string) => Promise<Course>;
    delete: (courseId: string) => Promise<boolean>;
  };
  tasks: {
    list: (courseId: string) => Promise<BrevynTask[]>;
    create: (input: CreateTaskInput) => Promise<BrevynTask>;
    update: (input: UpdateTaskInput) => Promise<BrevynTask>;
    delete: (taskId: string) => Promise<boolean>;
  };
  threads: {
    list: (courseId?: string) => Promise<Thread[]>;
    listArchived: (scope?: ArchivedThreadScope) => Promise<Thread[]>;
    create: (input: CreateThreadInput) => Promise<Thread>;
    rename: (input: RenameThreadInput) => Promise<Thread>;
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
    indexActiveSemester: () => Promise<IndexActiveSemesterResult>;
    indexingJobs: (courseId?: string) => Promise<IndexingJob[]>;
    cancelIndexing: (jobId: string) => Promise<IndexingJob | null>;
    open: (fileId: string) => Promise<void>;
    rename: (input: { fileId: string; name: string }) => Promise<{ courseId: string; tree: WorkspaceFileNode[] }>;
    delete: (fileId: string) => Promise<{ courseId: string; tree: WorkspaceFileNode[] }>;
    reveal: (fileId: string) => Promise<void>;
    onChanged: (callback: () => void) => () => void;
  };
  providers: {
    list: () => Promise<ModelProviderConfig[]>;
    save: (input: ProviderDraftInput) => Promise<ProviderSaveResult>;
    delete: (providerId: string) => Promise<boolean>;
    decryptApiKey: (providerId: string) => Promise<string>;
    models: (providerId: string) => Promise<ProviderModel[]>;
    test: (providerId: string) => Promise<ProviderTestResult>;
  };
  timetable: {
    range: (query: TimetableRangeQuery) => Promise<TimetableEvent[]>;
  };
  agent: {
    messages: (threadId: string) => Promise<BrevynAgentTimelineRecord[]>;
    run: (input: AgentRunInput) => Promise<AgentRunResult>;
    stop: (threadId: string) => Promise<boolean>;
    approve: (input: AgentApprovalInput) => Promise<boolean>;
    reject: (input: AgentApprovalInput) => Promise<boolean>;
    answerQuestion: (input: AgentAskUserResponseInput) => Promise<boolean>;
    resolveExitPlan: (input: AgentExitPlanResponseInput) => Promise<boolean>;
    onEvent: (callback: (event: BrevynAgentEvent) => void) => () => void;
  };
  attachments: {
    pick: (threadId: string) => Promise<AgentAttachment[]>;
    list: (threadId: string) => Promise<WorkspaceFileNode[]>;
    savePaths: (input: { threadId: string; paths: string[] }) => Promise<AgentAttachment[]>;
    saveData: (input: AgentAttachmentDataInput) => Promise<AgentAttachment>;
    delete: (input: { threadId: string; path: string }) => Promise<boolean>;
    pathForFile: (file: File) => string;
  };
  app: {
    openExternal: (url: string) => Promise<void>;
    openWorkspacePath: (input: { threadId: string; path: string }) => Promise<void>;
    previewWorkspacePath: (input: { threadId: string; path: string }) => Promise<FilePreview | null>;
  };
}
