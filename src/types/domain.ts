export type PermissionMode = "review" | "full";

export type RunStatus =
  | "idle"
  | "queued"
  | "starting"
  | "running"
  | "waiting_tool"
  | "waiting_approval"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

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
}

export interface SemesterWorkspace {
  id: string;
  semesterNo: string;
  term: string;
  folderName: string;
  startsAt?: string;
  endsAt?: string;
  source: "seed" | "multimodal_timetable" | "manual";
  recognizedAt?: string;
}

export interface SemesterImageAnalyzeInput {
  imageIds?: string[];
  imagePaths?: string[];
  instruction?: string;
}

export interface SemesterImageAnalyzeResult {
  id: string;
  status: "completed" | "failed";
  source: "multimodal_timetable";
  semester: SemesterWorkspace;
  createdEvents: TimetableEvent[];
  warnings: string[];
}

export interface CourseImageAnalyzeInput {
  imageIds?: string[];
  imagePaths?: string[];
  instruction?: string;
}

export interface CourseImageAnalyzeResult {
  id: string;
  status: "completed" | "failed";
  source: "multimodal_image";
  course: Course;
  confidence: number;
  warnings: string[];
}

export type TaskType = "assignment" | "project" | "exam" | "lecture";
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
  threadType: "semester_home" | "course_home" | "home" | "task";
  title: string;
  createdAt: string;
  updatedAt: string;
  latestRunStatus: RunStatus;
  latestEventSeq: number;
  pendingApprovalCount: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  timeline?: TaskAgentTimelineItem[];
}

export type UclawRunStreamItemType =
  | "turn_started"
  | "context_snapshot"
  | "attachments_loaded"
  | "assistant_message_delta"
  | "assistant_message_done"
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_approval_required"
  | "tool_approval_resolved"
  | "tool_output_delta"
  | "reasoning_summary_delta"
  | "reasoning_summary_done"
  | "context_compaction"
  | "response_metrics"
  | "run_status_changed"
  | "ask_user_requested"
  | "ask_user_resolved"
  | "error";

export interface ToolCallPayload {
  call_id: string;
  tool_name: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown>;
  output_delta?: {
    stream: "stdout" | "stderr";
    chunk: string;
  };
}

export interface ApprovalRequest {
  id: string;
  runId?: string;
  threadId?: string;
  title: string;
  detail: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface AskUserRequest {
  id: string;
  runId: string;
  threadId: string;
  title: string;
  question: string;
  detail?: string;
  placeholder?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
}

export interface AgentPendingRequests {
  approvals: ApprovalRequest[];
  askUsers: AskUserRequest[];
}

export interface AgentRuntimeStatus {
  configured: boolean;
  source: "env" | "provider_secret" | "none";
  title: string;
  detail: string;
  actionLabel?: string;
}

export interface UclawRunStreamItem {
  id: string;
  type: UclawRunStreamItemType;
  seq: number;
  runId: string;
  threadId: string;
  messageId?: string;
  status?: RunStatus;
  title?: string;
  detail?: string;
  delta?: string;
  content?: string;
  tool_call?: ToolCallPayload;
  approval?: ApprovalRequest;
  ask_user?: AskUserRequest;
  metrics?: Record<string, unknown>;
  context?: ContextWindowReport;
  createdAt: string;
}

export interface RunStreamEnvelope {
  event: "uclaw_run_item" | "uclaw_runtime_event" | "uclaw_runtime_ping";
  data: UclawRunStreamItem | RuntimeEvent;
}

export interface RuntimeEvent {
  id: string;
  type: "git_state_changed" | "context_report" | "run_state_changed";
  detail?: string;
  createdAt: string;
}

export interface TaskAgentTimelineItem {
  id: string;
  kind: string;
  phase?: string;
  title: string;
  detail: string;
  status?: string;
  tone: "context" | "thinking" | "tool" | "final" | "meta";
  toolCall?: ToolCallPayload;
  approval?: ApprovalRequest;
  askUser?: AskUserRequest;
  payload?: Record<string, unknown>;
}

export type TimelineActivityKind = "thinking" | "explore" | "skill" | "edit" | "run" | "approval" | "meta";

export type TimelineDisplayEntry =
  | { type: "item"; item: TaskAgentTimelineItem }
  | {
      type: "group";
      id: string;
      kind: TimelineActivityKind;
      title: string;
      detail: string;
      items: TaskAgentTimelineItem[];
      defaultOpen?: boolean;
    };

export interface ContextWindowReport {
  tokens: number;
  budget: number;
  percent: number;
  thresholdPercent: number;
  summaryMessageCount: number;
  compressedMessages: number;
  sections: string[];
  files: string[];
  tools: string[];
  skills: string[];
}

export interface SkillItem {
  id: string;
  name: string;
  enabled: boolean;
  scope: "default" | "course";
  description: string;
  version: string;
}

export interface SkillUpdateInput {
  id: string;
  enabled: boolean;
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
export type TimetableEventSource = "manual" | "course" | "school_calendar" | "multimodal_image";

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

export interface TimetableImageAnalyzeInput {
  courseId?: string;
  imageIds?: string[];
  imagePaths?: string[];
  instruction?: string;
}

export interface TimetableImageAnalyzeResult {
  id: string;
  status: "queued" | "completed" | "failed";
  source: "multimodal_image";
  createdEvents: TimetableEvent[];
  warnings: string[];
}

export interface AgentRunInput {
  threadId: string;
  message: string;
  permissionMode: PermissionMode;
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

export type CourseFileSectionKind = "course_shared" | "week" | "task";
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

export type ProviderProtocol = "openai_responses" | "anthropic_messages" | "openai_compatible" | "custom_http";

export interface ModelProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKeyMasked: string;
  apiKeySecretRef?: string;
  chatModel?: string;
  embeddingModel?: string;
  multimodalModel?: string;
  enabled: boolean;
  embeddingEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDraftInput {
  id?: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
  multimodalModel?: string;
  enabled?: boolean;
  embeddingEnabled?: boolean;
}

export interface ProviderModel {
  id: string;
  name: string;
  type: "chat" | "embedding" | "multimodal";
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface UclawAPI {
  semester: {
    list: () => Promise<SemesterWorkspace[]>;
    current: () => Promise<SemesterWorkspace>;
    select: (semesterId: string) => Promise<SemesterWorkspace>;
    analyzeImage: (input: SemesterImageAnalyzeInput) => Promise<SemesterImageAnalyzeResult>;
  };
  courses: {
    list: () => Promise<Course[]>;
    analyzeImage: (input: CourseImageAnalyzeInput) => Promise<CourseImageAnalyzeResult>;
  };
  tasks: {
    list: (courseId: string) => Promise<UclawTask[]>;
    create: (input: CreateTaskInput) => Promise<UclawTask>;
  };
  threads: {
    list: (courseId?: string) => Promise<Thread[]>;
    create: (input: CreateThreadInput) => Promise<Thread>;
    messages: (threadId: string) => Promise<ChatMessage[]>;
  };
  skills: {
    list: (courseId?: string) => Promise<SkillItem[]>;
    update: (input: SkillUpdateInput) => Promise<SkillItem>;
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
  };
  providers: {
    list: () => Promise<ModelProviderConfig[]>;
    save: (input: ProviderDraftInput) => Promise<ModelProviderConfig>;
    models: (providerId: string) => Promise<ProviderModel[]>;
    test: (providerId: string) => Promise<ProviderTestResult>;
  };
  timetable: {
    range: (query: TimetableRangeQuery) => Promise<TimetableEvent[]>;
    analyzeImage: (input: TimetableImageAnalyzeInput) => Promise<TimetableImageAnalyzeResult>;
  };
  context: {
    estimate: (threadId: string) => Promise<ContextWindowReport>;
  };
  agent: {
    runtimeStatus: () => Promise<AgentRuntimeStatus>;
    run: (input: AgentRunInput) => Promise<{ runId: string }>;
    stop: (runId: string) => Promise<void>;
    approve: (approvalId: string) => Promise<void>;
    reject: (approvalId: string) => Promise<void>;
    respondAskUser: (requestId: string, response: string) => Promise<void>;
    events: (threadId: string, afterSeq?: number) => Promise<UclawRunStreamItem[]>;
    pendingRequests: () => Promise<AgentPendingRequests>;
    onEvent: (handler: (envelope: RunStreamEnvelope) => void) => () => void;
  };
  app: {
    openExternal: (url: string) => Promise<void>;
  };
}
