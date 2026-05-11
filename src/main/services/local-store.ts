import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
  Course,
  CourseFileSection,
  ArchivedCourseScope,
  ArchivedThreadScope,
  AgentApprovalInput,
  AgentAskUserResponseInput,
  AgentExitPlanResponseInput,
  AgentRunInput,
  AgentRunResult,
  BrevynAgentEvent,
  BrevynAgentTimelineRecord,
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  FileImportResult,
  FilePreview,
  FileStats,
  GitStatus,
  IndexActiveSemesterResult,
  IndexingJob,
  ModelProviderConfig,
  ProviderDraftInput,
  ProviderModel,
  ProviderSaveResult,
  ProviderTestResult,
  RagSearchResult,
  SemesterWorkspace,
  SkillImportInput,
  SkillItem,
  SkillUpdateInput,
  SkillWriteInput,
  TaskStatus,
  Thread,
  TimetableEvent,
  TimetableRangeQuery,
  BrevynTask,
  UpdateCourseInput,
  UpdateTaskInput,
  WorkspaceFileNode,
} from "../../types/domain";
import { AgentEventBus, AgentOrchestrator, AgentSessionStore, AskUserService, ClaudeSdkAdapter, ExitPlanService, PermissionService, PromptBuilder } from "../agent";
import type { IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import { SkillFileStore } from "../skills/skill-file-store";
import { BUILTIN_SKILL_BLUEPRINTS } from "../skills/skill-registry";
import { SQLiteBusinessStore } from "../storage";
import { FileService } from "./file-service";
import { ProviderConfigStore } from "./provider-config-store";
import { ProviderSecretStore } from "./provider-secret-store";
import { ProviderService, envApiKeyForProvider } from "./provider-service";
import { ProviderTransactionStore } from "./provider-transaction-store";
import { RagIndexService } from "./rag-index-service";
import { WorkspaceService } from "./workspace-service";
import { archivedCourseIdsForSemester, currentActiveSemesterId, isCurrentSemesterArchived } from "./workspace-state";
import { isPathInside, workspacePathForThread } from "./workspace-paths";

export { SEMESTER_HOME_COURSE_ID } from "./workspace-paths";

export class LocalStore {
  private readonly rootDataDir: string;
  private readonly ragIndex: RagIndexService;
  private readonly skillFiles: SkillFileStore;
  private readonly providers: ProviderService;
  private readonly workspace: WorkspaceService;
  private readonly files: FileService;
  private readonly agent: AgentOrchestrator;

  constructor(
    private readonly filePath: string,
    private readonly businessStore: SQLiteBusinessStore,
    providerConfigs: ProviderConfigStore,
    providerSecrets?: ProviderSecretStore,
  ) {
    this.rootDataDir = dirname(this.filePath);
    this.providers = new ProviderService(providerConfigs, providerSecrets, new ProviderTransactionStore(join(this.rootDataDir, "provider-transactions.json")));
    this.skillFiles = new SkillFileStore(this.rootDataDir);
    this.skillFiles.ensureDefaultSkillTemplates(BUILTIN_SKILL_BLUEPRINTS);
    this.ragIndex = new RagIndexService({
      dbPath: join(this.rootDataDir, "indexes", "rag"),
      resolveEmbeddingProvider: () => this.providers.embeddingProvider(),
      resolveApiKey: (provider) => this.providers.apiKey(provider.id) || envApiKeyForProvider(provider),
    });
    this.workspace = new WorkspaceService({
      rootDataDir: this.rootDataDir,
      businessStore,
      ragIndex: this.ragIndex,
    });
    this.files = new FileService({
      rootDataDir: this.rootDataDir,
      businessStore,
      providers: this.providers,
      ragIndex: this.ragIndex,
    });
    this.agent = new AgentOrchestrator({
      rootDataDir: this.rootDataDir,
      businessStore,
      providers: this.providers,
      skillFiles: this.skillFiles,
      sessions: new AgentSessionStore(this.rootDataDir),
      eventBus: new AgentEventBus(),
      promptBuilder: new PromptBuilder(),
      permissions: new PermissionService(),
      askUsers: new AskUserService(),
      exitPlans: new ExitPlanService(),
      sdk: new ClaudeSdkAdapter(),
    });
  }

  listSemesters(): SemesterWorkspace[] {
    return this.workspace.listSemesters();
  }

  listArchivedSemesters(): SemesterWorkspace[] {
    return this.workspace.listArchivedSemesters();
  }

  currentSemester(): SemesterWorkspace | null {
    return this.workspace.currentSemester();
  }

  createSemester(input: CreateSemesterInput): SemesterWorkspace {
    return this.workspace.createSemester(input);
  }

  selectSemester(semesterId: string): SemesterWorkspace {
    const semester = this.workspace.selectSemester(semesterId);
    this.syncActiveSemesterDiskFiles();
    return semester;
  }

  archiveSemester(semesterId: string): SemesterWorkspace {
    return this.workspace.archiveSemester(semesterId);
  }

  restoreSemester(semesterId: string): SemesterWorkspace {
    return this.workspace.restoreSemester(semesterId);
  }

  deleteSemester(semesterId: string): Promise<boolean> {
    return this.workspace.deleteSemester(semesterId);
  }

  listCourses(): Course[] {
    return this.workspace.listCourses();
  }

  listArchivedCourses(scope?: ArchivedCourseScope): Course[] {
    return this.workspace.listArchivedCourses(scope);
  }

  createCourse(input: CreateCourseInput): Course {
    return this.workspace.createCourse(input);
  }

  updateCourse(input: UpdateCourseInput): Course {
    return this.workspace.updateCourse(input);
  }

  archiveCourse(courseId: string): Course {
    return this.workspace.archiveCourse(courseId);
  }

  restoreCourse(courseId: string): Course {
    return this.workspace.restoreCourse(courseId);
  }

  deleteCourse(courseId: string): Promise<boolean> {
    return this.workspace.deleteCourse(courseId);
  }

  listTasks(courseId: string): BrevynTask[] {
    return this.workspace.listTasks(courseId);
  }

  createTask(input: CreateTaskInput): BrevynTask {
    return this.workspace.createTask(input);
  }

  updateTask(input: UpdateTaskInput): BrevynTask {
    return this.workspace.updateTask(input);
  }

  deleteTask(taskId: string): Promise<boolean> {
    return this.workspace.deleteTask(taskId);
  }

  listThreads(courseId?: string): Thread[] {
    return this.workspace.listThreads(courseId);
  }

  listArchivedThreads(scope?: ArchivedThreadScope): Thread[] {
    return this.workspace.listArchivedThreads(scope);
  }

  createThread(input: CreateThreadInput): Thread {
    return this.workspace.createThread(input);
  }

  archiveThread(threadId: string): boolean {
    return this.workspace.archiveThread(threadId);
  }

  restoreThread(threadId: string): Thread {
    return this.workspace.restoreThread(threadId);
  }

  deleteThread(threadId: string): boolean {
    return this.workspace.deleteThread(threadId);
  }

  gitStatus(): GitStatus {
    return this.workspace.gitStatus();
  }

  searchRag(query: string, courseId?: string): Promise<RagSearchResult[]> {
    return this.files.searchRag(query, courseId);
  }

  listFiles(courseId?: string): WorkspaceFileNode[] {
    return this.files.listFiles(courseId);
  }

  syncActiveSemesterDiskFiles(): boolean {
    return this.files.syncActiveSemesterDiskFiles();
  }

  fileStats(courseId?: string): FileStats {
    return this.files.fileStats(courseId);
  }

  previewFile(fileId: string): Promise<FilePreview | null> {
    return this.files.previewFile(fileId);
  }

  importFiles(input: FileImportInput): Promise<FileImportResult> {
    return this.files.importFiles(input);
  }

  fileSourcePath(fileId: string): string | undefined {
    return this.files.fileSourcePath(fileId);
  }

  renameFile(fileId: string, name: string): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    return this.files.renameFile(fileId, name);
  }

  deleteFile(fileId: string): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    return this.files.deleteFile(fileId);
  }

  courseFileSections(courseId: string): CourseFileSection[] {
    return this.files.courseFileSections(courseId);
  }

  indexCourseFiles(courseId: string, sectionId?: string): IndexingJob {
    return this.files.indexCourseFiles(courseId, sectionId);
  }

  reindexCourseFiles(courseId: string, sectionId?: string): Promise<IndexingJob> {
    return this.files.reindexCourseFiles(courseId, sectionId);
  }

  indexActiveSemesterCourses(): Promise<IndexActiveSemesterResult> {
    return this.files.indexActiveSemesterCourses();
  }

  listIndexingJobs(courseId?: string): IndexingJob[] {
    return this.files.listIndexingJobs(courseId);
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    return this.files.cancelIndexingJob(jobId);
  }

  claimNextIndexingTask(workerId: string, lockMs: number): IndexingTaskRecord | null {
    return this.files.claimNextIndexingTask(workerId, lockMs);
  }

  recoverExpiredIndexingTasks(currentWorkerId?: string): void {
    this.files.recoverExpiredIndexingTasks(currentWorkerId);
  }

  completeIndexingTask(taskId: string, result: IndexingWorkerResult, workerId?: string, lockedUntil?: string): Promise<IndexingJob | null> {
    return this.files.completeIndexingTask(taskId, result, workerId, lockedUntil);
  }

  failIndexingTask(taskId: string, message: string, workerId?: string, lockedUntil?: string): IndexingJob | null {
    return this.files.failIndexingTask(taskId, message, workerId, lockedUntil);
  }

  listSkills(): SkillItem[] {
    return mergeSkills(this.skillFiles.listSkills());
  }

  updateSkill(input: SkillUpdateInput): SkillItem {
    const skillId = requireNonEmptyString((input as Partial<SkillUpdateInput> | null | undefined)?.id, "Skill id");
    const fileSkill = this.skillFiles.toggleSkill(skillId, Boolean((input as Partial<SkillUpdateInput> | null | undefined)?.enabled));
    if (fileSkill) return fileSkill;
    throw new Error(`File skill not found: ${skillId}`);
  }

  readSkillContent(skillId: string): string {
    const id = requireNonEmptyString(skillId, "Skill id");
    const content = this.skillFiles.readSkillContent(id);
    if (content == null) throw new Error(`Skill content not found: ${id}`);
    return content;
  }

  writeSkillContent(input: SkillWriteInput): SkillItem {
    const skillId = requireNonEmptyString((input as Partial<SkillWriteInput> | null | undefined)?.id, "Skill id");
    const content = stringValue((input as Partial<SkillWriteInput> | null | undefined)?.content);
    if (!content.trim()) throw new Error("SKILL.md cannot be saved empty.");
    const updated = this.skillFiles.writeSkillContent(skillId, content);
    if (!updated) throw new Error(`Skill content not found: ${skillId}`);
    return updated;
  }

  importSkillFolder(input: SkillImportInput): SkillItem {
    if (!input.sourcePath?.trim()) throw new Error("Skill import requires a source folder.");
    return this.skillFiles.importSkillFolder(input.sourcePath, input.enabled ?? true);
  }

  skillFolderPath(skillId: string): string {
    const id = requireNonEmptyString(skillId, "Skill id");
    const dir = this.skillFiles.skillFolderPath(id);
    if (!dir) throw new Error(`Skill folder not found: ${id}`);
    return dir;
  }

  listProviders(): ModelProviderConfig[] {
    return this.providers.list().map((provider) => ({ ...provider }));
  }

  saveProvider(input: ProviderDraftInput): ProviderSaveResult {
    return this.providers.save(input);
  }

  deleteProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  providerModels(providerId: string): Promise<ProviderModel[]> {
    return this.providers.models(providerId);
  }

  testProvider(providerId: string): Promise<ProviderTestResult> {
    return this.providers.test(providerId);
  }

  providerApiKey(providerId: string): string | undefined {
    return this.providers.apiKey(providerId);
  }

  providerHasApiKey(providerId: string): boolean {
    return this.providers.hasApiKey(providerId);
  }

  providerSecretStorageAvailable(): boolean {
    return this.providers.secretStorageAvailable();
  }

  listTimetableEvents(query: TimetableRangeQuery): TimetableEvent[] {
    if (isCurrentSemesterArchived(this.businessStore)) return [];
    const semesterId = currentActiveSemesterId(this.businessStore);
    if (!semesterId) return [];
    const archivedCourseIds = new Set(archivedCourseIdsForSemester(this.businessStore, semesterId));
    const start = Date.parse(query.rangeStart);
    const end = Date.parse(query.rangeEnd);
    return this.businessStore.listTimetableEvents(semesterId)
      .filter((event) => {
        if (event.courseId && archivedCourseIds.has(event.courseId)) return false;
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

  agentMessages(threadId: string): BrevynAgentTimelineRecord[] {
    return this.agent.messages(threadId);
  }

  runAgent(input: AgentRunInput): Promise<AgentRunResult> {
    return this.agent.run(input);
  }

  stopAgent(threadId: string): boolean {
    return this.agent.stop(threadId);
  }

  stopAllAgents(): void {
    this.agent.stopAll();
  }

  approveAgent(input: AgentApprovalInput): boolean {
    return this.agent.approve(input);
  }

  rejectAgent(input: AgentApprovalInput): boolean {
    return this.agent.reject(input);
  }

  answerAgentQuestion(input: AgentAskUserResponseInput): boolean {
    return this.agent.answerQuestion(input);
  }

  resolveAgentExitPlan(input: AgentExitPlanResponseInput): boolean {
    return this.agent.resolveExitPlan(input);
  }

  onAgentEvent(listener: (event: BrevynAgentEvent) => void): () => void {
    return this.agent.onEvent(listener);
  }

  resolveThreadWorkspacePath(threadId: string, requestedPath: string): string {
    const thread = this.businessStore.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    const cwd = workspacePathForThread(this.rootDataDir, thread, (taskId) => this.businessStore.getTask(taskId) || undefined);
    const target = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(cwd, requestedPath);
    if (!isPathInside(target, cwd)) {
      throw new Error("File references can only open paths inside the current workspace.");
    }
    return target;
  }

  async close(): Promise<void> {
    let closeError: unknown;
    try {
      this.stopAllAgents();
    } catch (error) {
      closeError = error;
    }

    try {
      await this.ragIndex.close();
    } catch (error) {
      if (!closeError) closeError = error;
    }

    try {
      this.businessStore.close();
    } catch (error) {
      if (!closeError) {
        closeError = error;
      } else {
        console.warn("[local-store] Failed to close SQLite store after RAG close failure", error);
      }
    }

    if (closeError) throw closeError;
  }
}

function mergeSkills(skills: SkillItem[]): SkillItem[] {
  const seen = new Set<string>();
  const merged: SkillItem[] = [];
  for (const skill of skills) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    merged.push({ ...skill });
  }
  return merged;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const text = stringValue(value).trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function createLocalStore(rootDataPath: string): LocalStore {
  return new LocalStore(
    join(rootDataPath, "brevyn-state.json"),
    new SQLiteBusinessStore(join(rootDataPath, "indexes", "brevyn.sqlite")),
    new ProviderConfigStore(join(rootDataPath, "provider-profiles.json")),
    new ProviderSecretStore(join(rootDataPath, "provider-secrets.json")),
  );
}
