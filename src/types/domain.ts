import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BrevynCloudEnvironment } from "./cloud-config";

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
  source: "manual" | "filesystem" | "vision";
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

export interface ArchivedTaskScope {
  semesterId?: string;
  courseId?: string;
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
export type ThreadTitleSource = "default" | "auto" | "manual";

export interface BrevynTask {
  id: string;
  semesterId?: string;
  courseId: string;
  title: string;
  taskType: TaskType;
  status: TaskStatus;
  dueAt?: string;
  summary: string;
  archivedAt?: string;
}

export interface Thread {
  id: string;
  semesterId?: string;
  courseId: string;
  taskId?: string;
  threadType: "semester_home" | "task";
  title: string;
  titleSource?: ThreadTitleSource;
  titleGeneratedAt?: string;
  sdkSessionId?: string;
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
  /**
   * Only files explicitly imported or user-approved for course knowledge should
   * enter RAG. Disk-discovered / Agent-created files can still be visible.
   */
  ragEligible?: boolean;
  sourceKind?: "user_import" | "disk_discovered" | "agent_generated" | "system";
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
  sourcePath?: string;
  kind: WorkspaceFileKind;
  mimeType?: string;
  fileUrl?: string;
  previewUrl?: string;
  content?: string;
  html?: string;
  summary?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface OpenPathOption {
  id: string;
  label: string;
  kind: "default" | "finder" | "terminal" | "editor" | "office" | "viewer" | "application";
  appPath?: string;
  iconDataUrl?: string;
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
export type TimetableEventKind = "course_session" | "deadline" | "school_week" | "school_event";
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

export type VisionRecognitionKind = "academic_calendar" | "course_timetable";
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface VisionRecognitionInput {
  sourcePath: string;
  apply?: boolean;
  providerId?: string;
  modelId?: string;
}

export interface RecognizedCalendarEvent {
  title: string;
  startsAt: string;
  endsAt?: string;
  notes?: string;
  confidence?: number;
}

export interface RecognizedAcademicCalendar {
  kind: "academic_calendar";
  sourcePath: string;
  providerName: string;
  modelId: string;
  semester?: CreateSemesterInput;
  events: RecognizedCalendarEvent[];
  warnings: string[];
  applied?: {
    semester?: SemesterWorkspace;
    events: TimetableEvent[];
  };
}

export interface RecognizedCourseSession {
  dayOfWeek: WeekdayKey;
  startTime: string;
  endTime: string;
  room?: string;
  weeks?: string;
  confidence?: number;
}

export interface RecognizedCourseSchedule {
  code: string;
  name: string;
  section?: string;
  category?: string;
  instructor?: string;
  units?: number;
  sessions: RecognizedCourseSession[];
  confidence?: number;
}

export interface RecognizedCourseTimetable {
  kind: "course_timetable";
  sourcePath: string;
  providerName: string;
  modelId: string;
  semesterLabel?: string;
  courses: RecognizedCourseSchedule[];
  warnings: string[];
  applied?: {
    courses: Course[];
    events: TimetableEvent[];
  };
}

export type CourseFileSectionKind = "course_shared" | "lecture" | "task";
export type IndexingStatus = "idle" | "queued" | "indexing" | "indexed" | "failed" | "cancelled";
export type FileIndexingStatus = IndexingStatus | "partial" | "warning" | "skipped";

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
  embeddingProviderFingerprint?: string;
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
  indexingNotice?: string;
}

export type ProviderPurpose = "agent" | "embedding" | "vision";
export type AgentProtocol = "anthropic_messages" | "openai_responses";
export type EmbeddingProtocol = "openai_compatible";
export type VisionProtocol = "anthropic_messages" | "openai_compatible" | "openai_responses";
export type ProviderProtocol = AgentProtocol | EmbeddingProtocol | VisionProtocol;
export type ProviderAdapterKind = "anthropic" | "openai_embedding" | "openai_chat_completions" | "openai_responses";
export type AgentProviderKind = "anthropic" | "deepseek" | "bailian-anthropic" | "kimi-api" | "kimi-coding" | "custom-anthropic" | "openai-responses-agent";
export type EmbeddingProviderKind = "openai" | "qwen" | "doubao" | "zhipu" | "minimax" | "custom-openai";
export type VisionProviderKind = "vision-bailian-openai" | "vision-custom-openai" | "vision-custom-anthropic" | "vision-openai-responses" | "vision-custom-openai-responses";
export type ProviderKind = AgentProviderKind | EmbeddingProviderKind | VisionProviderKind;
export type ProviderAuthMode = "api_key" | "auth_token" | "bearer";

export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
  supportsVision?: boolean;
  contextWindowTokens?: number;
  contextWindowSource?: "provider" | "user" | "inferred";
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
  "bailian-anthropic": {
    kind: "bailian-anthropic",
    purpose: "agent",
    label: "Bailian Anthropic",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic/v1",
    authMode: "api_key",
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
  "openai-responses-agent": {
    kind: "openai-responses-agent",
    purpose: "agent",
    label: "OpenAI Responses",
    adapterKind: "openai_responses",
    protocol: "openai_responses",
    baseUrl: "https://api.openai.com/v1",
    authMode: "bearer",
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

export const VISION_PROVIDER_PRESETS = {
  "vision-bailian-openai": {
    kind: "vision-bailian-openai",
    purpose: "vision",
    label: "Bailian OpenAI Vision",
    adapterKind: "openai_chat_completions",
    protocol: "openai_compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    authMode: "bearer",
  },
  "vision-custom-openai": {
    kind: "vision-custom-openai",
    purpose: "vision",
    label: "Custom OpenAI-compatible Vision",
    adapterKind: "openai_chat_completions",
    protocol: "openai_compatible",
    baseUrl: "",
    authMode: "bearer",
  },
  "vision-custom-anthropic": {
    kind: "vision-custom-anthropic",
    purpose: "vision",
    label: "Custom Anthropic Vision",
    adapterKind: "anthropic",
    protocol: "anthropic_messages",
    baseUrl: "",
    authMode: "api_key",
  },
  "vision-openai-responses": {
    kind: "vision-openai-responses",
    purpose: "vision",
    label: "OpenAI Responses Vision",
    adapterKind: "openai_responses",
    protocol: "openai_responses",
    baseUrl: "https://api.openai.com/v1",
    authMode: "bearer",
  },
  "vision-custom-openai-responses": {
    kind: "vision-custom-openai-responses",
    purpose: "vision",
    label: "Custom OpenAI Responses Vision",
    adapterKind: "openai_responses",
    protocol: "openai_responses",
    baseUrl: "",
    authMode: "bearer",
  },
} as const satisfies Record<VisionProviderKind, ProviderPreset>;

export const PROVIDER_PRESETS = {
  ...AGENT_PROVIDER_PRESETS,
  ...EMBEDDING_PROVIDER_PRESETS,
  ...VISION_PROVIDER_PRESETS,
} as const satisfies Record<ProviderKind, ProviderPreset>;

export const DEFAULT_AUTO_COMPACT_THRESHOLD_PERCENT = 77.5;
export const MIN_AUTO_COMPACT_THRESHOLD_PERCENT = 50;
export const MAX_AUTO_COMPACT_THRESHOLD_PERCENT = 95;

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
  autoCompactThresholdPercent?: number;
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
  autoCompactThresholdPercent?: number;
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

export type AgentPermissionMode = "auto" | "bypassPermissions" | "plan";

export type BrevynUsageProviderProtocol = "anthropic_messages" | "openai_responses";
export type BrevynUsageContextWindowSource = "model_config" | "provider" | "user" | "inferred" | "unknown";

export interface BrevynUsageMetadata {
  providerProtocol: BrevynUsageProviderProtocol;
  providerId?: string;
  modelId?: string;
  inputTokens: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  contextInputTokens?: number;
  contextWindow?: number;
  contextWindowSource?: BrevynUsageContextWindowSource;
  raw?: unknown;
}

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
  pending?: boolean;
  sourcePath?: string;
  persistedFromPending?: boolean;
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
  uuid?: string;
  permissionMode?: AgentPermissionMode;
  providerId?: string;
  modelId?: string;
  attachments?: AgentAttachment[];
  mentionedSkills?: string[];
}

export interface AgentQueueMessageInput {
  threadId: string;
  prompt: string;
  uuid?: string;
  interrupt?: boolean;
  attachments?: AgentAttachment[];
  mentionedSkills?: string[];
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
  | { type: "run_started"; runId: string; threadId: string; permissionMode?: AgentPermissionMode; providerId?: string; modelId?: string; providerProtocol?: AgentProtocol; createdAt: string }
  | { type: "run_retrying"; runId: string; threadId: string; retryAttempt: number; maxRetries: number; reason: string; delayMs: number; createdAt: string }
  | { type: "run_retry_cleared"; runId: string; threadId: string; createdAt: string }
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
  | { kind: "brevyn_event"; event: BrevynAgentRuntimeEvent }
  | { kind: "thread_updated"; thread: Thread };

export interface AgentRunResult {
  runId: string;
}

export interface UpdaterDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface GitHubReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
}

export interface GitHubReleaseListOptions {
  perPage?: number;
  page?: number;
  includePrerelease?: boolean;
}

export type UpdaterStatus =
  | { status: "idle"; currentVersion: string; supported: boolean }
  | { status: "unsupported"; currentVersion: string; supported: false; reason: string }
  | { status: "checking"; currentVersion: string; supported: boolean }
  | { status: "available"; currentVersion: string; supported: boolean; version: string; releaseNotes?: string }
  | { status: "downloading"; currentVersion: string; supported: boolean; version: string; progress: UpdaterDownloadProgress }
  | { status: "downloaded"; currentVersion: string; supported: boolean; version: string; dismissed?: boolean }
  | { status: "not-available"; currentVersion: string; supported: boolean }
  | { status: "error"; currentVersion: string; supported: boolean; error: string };

export interface AppSettings {
  agentGateway: {
    openAiResponsesEnabled: boolean;
  };
  profile: UserProfileSettings;
}

export interface UserProfileSettings {
  displayName: string;
  avatarId: string;
}

export interface UserProfileUpdateInput {
  displayName?: string;
  avatarId?: string;
}

export interface AgentGatewayStatus {
  enabled: boolean;
  state: "disabled" | "starting" | "running" | "stopping" | "failed";
  url?: string;
  activeRuns: number;
  error?: string;
}

export interface CloudUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
}

export interface CloudTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface CloudWallet {
  balance: number;
}

export interface CloudGatewayAccount {
  provider: string;
  externalUserId: number;
  externalEmail: string;
  defaultGroupId: number;
  concurrency: number;
  status: string;
  lastSyncedAt: string | null;
}

export type CloudOfficialCapability = "embedding" | "vision";

export interface CloudOfficialPurposeConfig {
  modelIds: string[];
  defaultModelId: string;
}

export interface CloudOfficialModelConfig {
  embedding: CloudOfficialPurposeConfig;
  vision: CloudOfficialPurposeConfig;
}

export interface CloudGatewayGroup {
  externalGroupId: number;
  name: string;
  description: string;
  platform: string;
  subscriptionType: string;
  rateMultiplier: number;
  dailyLimitUsd?: number;
  weeklyLimitUsd?: number;
  monthlyLimitUsd?: number;
  defaultValidityDays: number;
  rpmLimit: number;
  status: string;
  modelCount: number;
  source?: string;
  isCurrent: boolean;
  officialModelConfig?: CloudOfficialModelConfig;
  officialCapabilities?: CloudOfficialCapability[];
}

export interface CloudEntitlementWallet {
  source: string;
  scope: string;
  remaining: number;
  unit: string;
  status: string;
}

export interface CloudQuotaWindow {
  limit: number;
  used: number;
  remaining: number;
  unit: string;
  windowStart?: string | null;
}

export interface CloudBalanceGroupEntitlement {
  externalGroupId: number;
  name: string;
  description?: string;
  platform: string;
  billingKind: "balance";
  subscriptionType: "standard";
  balanceScope: string;
  limit: number;
  used: number;
  remaining: number;
  unit: string;
  rateMultiplier: number;
  status: string;
  groupStatus?: string;
  modelCount: number;
  source?: string;
  isCurrent: boolean;
  officialModelConfig?: CloudOfficialModelConfig;
  officialCapabilities?: CloudOfficialCapability[];
}

export interface CloudSubscriptionGroupEntitlement {
  externalGroupId: number;
  name: string;
  description?: string;
  platform: string;
  billingKind: "subscription";
  subscriptionType: "subscription";
  rateMultiplier: number;
  status: string;
  groupStatus?: string;
  modelCount: number;
  source?: string;
  isCurrent: boolean;
  subscriptionId?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  remaining: number;
  unit: string;
  unlimited: boolean;
  constrainingWindow?: string;
  depletedWindow?: string;
  daily?: CloudQuotaWindow;
  weekly?: CloudQuotaWindow;
  monthly?: CloudQuotaWindow;
  defaultValidityDays: number;
  officialModelConfig?: CloudOfficialModelConfig;
  officialCapabilities?: CloudOfficialCapability[];
}

export type CloudGatewayEntitlementGroup = CloudBalanceGroupEntitlement | CloudSubscriptionGroupEntitlement;

export interface CloudGatewayEntitlements {
  externalUserId: number;
  wallet: CloudEntitlementWallet;
  balanceGroups: CloudBalanceGroupEntitlement[];
  subscriptionGroups: CloudSubscriptionGroupEntitlement[];
  updatedAt: string;
  stale: boolean;
  refreshLimited?: boolean;
  nextRefreshAfterSeconds?: number;
}

export interface CloudRefreshInput {
  forceEntitlements?: boolean;
  reason?: string;
}

export interface CloudModelCatalogInput {
  externalGroupId?: number;
}

export interface CloudProviderModel {
  id: string;
  name: string;
  displayName: string;
  providerFamily: string;
  platform?: string;
  externalGroupId?: number;
  groupName?: string;
  billingMode?: string;
  capabilities: string[];
  supportsVision: boolean;
  supportsStreaming: boolean;
  enabled: boolean;
}

export interface CloudProviderConfig {
  purpose: string;
  providerKind: string;
  adapterKind: string;
  protocol: string;
  name: string;
  baseUrl: string;
  authMode: string;
  apiKey: string;
  selectedModel: string;
  enabled: boolean;
  models: CloudProviderModel[];
}

export interface CloudModelCatalogResult {
  items: CloudProviderModel[];
  total: number;
  externalGroupId: number;
}

export interface CloudAPIKey {
  id: string;
  provider: string;
  externalKeyId: number;
  externalGroupId: number;
  groupName?: string;
  groupType?: string;
  platform?: string;
  maskedApiKey: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CloudAPIError {
  code: string;
  message: string;
}

export interface CloudRedemption {
  id: string;
  codeId: string;
  productName: string;
  kind: string;
  value: number;
  validityDays: number;
  externalUserId: number;
  externalGroupId: number;
  gatewayOperation: string;
  status: string;
  errorMessage: string;
  errorCode: string;
  errorClass: string;
  errorStage: string;
  errorRetryable: boolean;
  errorDetail: string;
  createdAt: string;
}

export interface CloudRedeemResult {
  redemption: CloudRedemption;
  wallet: CloudWallet;
  gateway: CloudGatewayAccount;
  apiKey?: CloudAPIKey;
}

export interface CloudOfficialProviderRef {
  providerId: string;
  purpose?: ProviderPurpose;
  externalGroupId: number;
  groupName: string;
  selectedModel: string;
  modelCount: number;
  syncedAt: string;
}

export interface CloudAccountStatus {
  baseUrl: string;
  defaultBaseUrl: string;
  environment: BrevynCloudEnvironment;
  baseUrlEditable: boolean;
  shopUrl: string;
  authenticated: boolean;
  user: CloudUser | null;
  wallet: CloudWallet | null;
  gateway: CloudGatewayAccount | null;
  currentGroup: CloudGatewayGroup | null;
  groups: CloudGatewayGroup[];
  entitlements: CloudGatewayEntitlements | null;
  providerRefs: CloudOfficialProviderRef[];
  lastSyncedAt?: string;
  lastError?: string;
}

export type CloudAuthMode = "login" | "register";

export interface CloudAuthInput {
  baseUrl?: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface CloudSyncOfficialProviderInput {
  externalGroupId?: number;
}

export interface CloudActivateOfficialProviderInput {
  externalGroupId: number;
}

export interface CloudRedeemCodeInput {
  code: string;
}

export interface CloudOfficialProviderSyncResult {
  status: "synced" | "provisioning";
  detail?: string;
  retryAfterSeconds?: number;
  provider?: ModelProviderConfig;
  providers?: ModelProviderConfig[];
  cloud: CloudAccountStatus;
}

export interface CloudRedeemCodeResult {
  status: string;
  error?: CloudAPIError;
  result: CloudRedeemResult;
  cloud: CloudAccountStatus;
  provider?: ModelProviderConfig;
  providers?: ModelProviderConfig[];
  providerSyncStatus?: "synced" | "provisioning" | "failed";
  providerSyncDetail?: string;
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
    listForArchive: (scope?: ArchivedCourseScope) => Promise<Course[]>;
    listArchived: (scope?: ArchivedCourseScope) => Promise<Course[]>;
    create: (input: CreateCourseInput) => Promise<Course>;
    update: (input: UpdateCourseInput) => Promise<Course>;
    archive: (courseId: string) => Promise<Course>;
    restore: (courseId: string) => Promise<Course>;
    delete: (courseId: string) => Promise<boolean>;
  };
  tasks: {
    list: (courseId: string) => Promise<BrevynTask[]>;
    listArchived: (scope?: ArchivedTaskScope) => Promise<BrevynTask[]>;
    create: (input: CreateTaskInput) => Promise<BrevynTask>;
    update: (input: UpdateTaskInput) => Promise<BrevynTask>;
    archive: (taskId: string) => Promise<BrevynTask>;
    restore: (taskId: string) => Promise<BrevynTask>;
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
    retryIndex: (fileId: string) => Promise<IndexingJob>;
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
    models: (input: string | ProviderDraftInput) => Promise<ProviderModel[]>;
    test: (input: string | ProviderDraftInput) => Promise<ProviderTestResult>;
    embeddingMutable: () => Promise<boolean>;
  };
  vision: {
    pickImage: () => Promise<string | null>;
    previewImage: (sourcePath: string) => Promise<string>;
    recognizeAcademicCalendar: (input: VisionRecognitionInput) => Promise<RecognizedAcademicCalendar>;
    recognizeCourseTimetable: (input: VisionRecognitionInput) => Promise<RecognizedCourseTimetable>;
    importAcademicCalendar: (input: RecognizedAcademicCalendar) => Promise<RecognizedAcademicCalendar>;
    importCourseTimetable: (input: RecognizedCourseTimetable) => Promise<RecognizedCourseTimetable>;
  };
  timetable: {
    range: (query: TimetableRangeQuery) => Promise<TimetableEvent[]>;
  };
  agent: {
    messages: (threadId: string) => Promise<BrevynAgentTimelineRecord[]>;
    run: (input: AgentRunInput) => Promise<AgentRunResult>;
    queueMessage: (input: AgentQueueMessageInput) => Promise<string>;
    stop: (threadId: string) => Promise<boolean>;
    approve: (input: AgentApprovalInput) => Promise<boolean>;
    reject: (input: AgentApprovalInput) => Promise<boolean>;
    answerQuestion: (input: AgentAskUserResponseInput) => Promise<boolean>;
    resolveExitPlan: (input: AgentExitPlanResponseInput) => Promise<boolean>;
    onEvent: (callback: (event: BrevynAgentEvent) => void) => () => void;
  };
  agentGateway: {
    status: () => Promise<AgentGatewayStatus>;
    setEnabled: (enabled: boolean) => Promise<AgentGatewayStatus>;
  };
  cloud: {
    status: () => Promise<CloudAccountStatus>;
    login: (input: CloudAuthInput) => Promise<CloudOfficialProviderSyncResult>;
    register: (input: CloudAuthInput) => Promise<CloudOfficialProviderSyncResult>;
    refresh: (input?: CloudRefreshInput) => Promise<CloudAccountStatus>;
    refreshEntitlements: (input?: CloudRefreshInput) => Promise<CloudAccountStatus>;
    modelsCatalog: (input?: CloudModelCatalogInput) => Promise<CloudModelCatalogResult>;
    syncOfficialProvider: (input?: CloudSyncOfficialProviderInput) => Promise<CloudOfficialProviderSyncResult>;
    activateOfficialProvider: (input: CloudActivateOfficialProviderInput) => Promise<CloudOfficialProviderSyncResult>;
    redeemCode: (input: CloudRedeemCodeInput) => Promise<CloudRedeemCodeResult>;
    logout: () => Promise<CloudAccountStatus>;
  };
  attachments: {
    pick: (threadId: string) => Promise<AgentAttachment[]>;
    list: (threadId: string) => Promise<WorkspaceFileNode[]>;
    savePaths: (input: { threadId: string; paths: string[] }) => Promise<AgentAttachment[]>;
    saveData: (input: AgentAttachmentDataInput) => Promise<AgentAttachment>;
    delete: (input: { threadId: string; path: string }) => Promise<boolean>;
    pathForFile: (file: File) => string;
  };
  updater: {
    checkForUpdates: () => Promise<void>;
    getStatus: () => Promise<UpdaterStatus>;
    listReleases: (options?: GitHubReleaseListOptions) => Promise<GitHubRelease[]>;
    getReleaseByTag: (tag: string) => Promise<GitHubRelease | null>;
    onStatusChanged: (callback: (status: UpdaterStatus) => void) => () => void;
    dismissDownloaded: () => Promise<UpdaterStatus>;
    quitAndInstall: () => Promise<void>;
  };
  app: {
    profile: () => Promise<UserProfileSettings>;
    updateProfile: (input: UserProfileUpdateInput) => Promise<UserProfileSettings>;
    openExternal: (url: string) => Promise<void>;
    revealPath: (path: string) => Promise<void>;
    openPathWith: (input: { path: string; optionId: string; appPath?: string }) => Promise<void>;
    openPathOptions: (path: string) => Promise<OpenPathOption[]>;
    openWorkspacePath: (input: { threadId: string; path: string }) => Promise<void>;
    previewWorkspacePath: (input: { threadId: string; path: string }) => Promise<FilePreview | null>;
  };
}
