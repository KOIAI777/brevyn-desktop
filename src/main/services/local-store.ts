import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type {
  AgentAttachment,
  AgentAttachmentDataInput,
  Course,
  CourseFileSection,
  ArchivedCourseScope,
  ArchivedThreadScope,
  AgentApprovalInput,
  AgentAskUserResponseInput,
  AgentExitPlanResponseInput,
  AgentQueueMessageInput,
  AgentRunInput,
  AgentRunResult,
  AgentGatewayStatus,
  AppThemePreference,
  BrevynAgentEvent,
  BrevynAgentTimelineRecord,
  DeleteFileInput,
  CloudAccountStatus,
  CloudActivateConversationProviderInput,
  CloudActivateOfficialProviderInput,
  CloudAuthInput,
  CloudModelCatalogInput,
  CloudModelCatalogResult,
  CloudOfficialProviderSyncResult,
  CloudRedeemCodeInput,
  CloudRedeemCodeResult,
  CloudRefreshInput,
  CloudSyncConversationProviderInput,
  CloudSyncOfficialProviderInput,
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
  RecognizedAcademicCalendar,
  RecognizedCourseTimetable,
  RenameThreadInput,
  SemesterWorkspace,
  SkillImportInput,
  SkillItem,
  SkillUpdateInput,
  SkillWriteInput,
  TaskStatus,
  Thread,
  TimetableEvent,
  TimetableRangeQuery,
  UserProfileSettings,
  UserProfileUpdateInput,
  VisionRecognitionInput,
  BrevynTask,
  UpdateCourseInput,
  UpdateTaskInput,
  ArchivedTaskScope,
  WorkspaceFileNode,
} from "../../types/domain";
import {
  BREVYN_CLOUD_DEVELOPMENT_BASE_URL,
  BREVYN_CLOUD_PRODUCTION_BASE_URL,
  BREVYN_CLOUD_SHOP_URL,
  type BrevynCloudEnvironment,
} from "../../types/cloud-config";
import { AgentEventBus, AgentGatewayService, AgentOrchestrator, AgentSessionStore, AskUserService, ClaudeSdkAdapter, ExitPlanService, PermissionService, PromptBuilder } from "../agent";
import type { IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import { SkillFileStore } from "../skills/skill-file-store";
import { BUILTIN_SKILL_BLUEPRINTS } from "../skills/skill-registry";
import { SQLiteBusinessStore } from "../storage";
import { FileService } from "./file-service";
import { AppSettingsStore } from "./app-settings-store";
import { CloudAccountService } from "./cloud-account-service";
import { DocumentParseService } from "./document-parse-service";
import { ProviderConfigStore } from "./provider-config-store";
import { OcrRecognitionService } from "./ocr-recognition-service";
import { ProviderSecretStore } from "./provider-secret-store";
import { ProviderService, envApiKeyForProvider } from "./provider-service";
import { ProviderTransactionStore } from "./provider-transaction-store";
import { RagIndexService, type RagSearchOptions } from "./rag-index-service";
import { VisionRecognitionService } from "./vision-recognition-service";
import { WorkspaceService } from "./workspace-service";
import { archivedCourseIdsForSemester, currentActiveSemesterId, isCurrentSemesterArchived } from "./workspace-state";
import { ensureAgentProjectScaffold, isPathInside, sanitizeFsSegment, workspacePathForThread } from "./workspace-paths";
import { formatSize, kindForPath } from "./workspace-file-tree";

export { SEMESTER_HOME_COURSE_ID } from "./workspace-paths";

const MAX_AGENT_ATTACHMENT_DATA_BYTES = 100 * 1024 * 1024;
const CLOUD_ENTITLEMENTS_USAGE_REFRESH_DELAY_MS = 2_500;
const CLOUD_ENTITLEMENTS_FORCE_COOLDOWN_MS = 30_000;

interface LocalStoreOptions {
  isPackaged?: boolean;
}

export class LocalStore {
  private readonly rootDataDir: string;
  private readonly ragIndex: RagIndexService;
  private readonly skillFiles: SkillFileStore;
  private readonly providers: ProviderService;
  private readonly vision: VisionRecognitionService;
  private readonly workspace: WorkspaceService;
  private readonly files: FileService;
  readonly ocr: OcrRecognitionService;
  readonly documentParser: DocumentParseService;
  private readonly agent: AgentOrchestrator;
  private readonly appSettings: AppSettingsStore;
  private readonly agentGateway: AgentGatewayService;
  private readonly cloud: CloudAccountService;
  private cloudEntitlementsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private cloudEntitlementsRefreshInFlight = false;
  private cloudEntitlementsLastForceAt = 0;

  constructor(
    private readonly filePath: string,
    private readonly businessStore: SQLiteBusinessStore,
    providerConfigs: ProviderConfigStore,
    providerSecrets?: ProviderSecretStore,
    options: LocalStoreOptions = {},
  ) {
    this.rootDataDir = dirname(this.filePath);
    this.appSettings = new AppSettingsStore(join(this.rootDataDir, "app-settings.json"));
    this.agentGateway = new AgentGatewayService({
      enabled: this.appSettings.get().agentGateway.openAiResponsesEnabled,
    });
    this.providers = new ProviderService(providerConfigs, providerSecrets, new ProviderTransactionStore(join(this.rootDataDir, "provider-transactions.json")));
    const cloudConfig = resolveCloudRuntimeConfig(options);
    this.cloud = new CloudAccountService(join(this.rootDataDir, "cloud-account.json"), this.providers, {
      defaultBaseUrl: cloudConfig.defaultBaseUrl,
      environment: cloudConfig.environment,
      baseUrlEditable: cloudConfig.baseUrlEditable,
      shopUrl: cloudConfig.shopUrl,
    });
    this.skillFiles = new SkillFileStore(this.rootDataDir);
    this.skillFiles.ensureDefaultSkillTemplates(BUILTIN_SKILL_BLUEPRINTS);
    for (const dir of bundledDefaultSkillDirs()) {
      this.skillFiles.syncDefaultSkillFolders(dir);
    }
    this.skillFiles.ensureNativePluginManifest();
    this.ragIndex = new RagIndexService({
      dbPath: join(this.rootDataDir, "indexes", "rag"),
      resolveEmbeddingProvider: () => this.providers.embeddingProvider(),
      resolveApiKey: (provider) => this.providers.apiKey(provider.id) || envApiKeyForProvider(provider),
      textIndex: businessStore,
    });
    this.workspace = new WorkspaceService({
      rootDataDir: this.rootDataDir,
      businessStore,
      ragIndex: this.ragIndex,
    });
    this.vision = new VisionRecognitionService({
      rootDataDir: this.rootDataDir,
      businessStore,
      providers: this.providers,
    });
    this.files = new FileService({
      rootDataDir: this.rootDataDir,
      businessStore,
      providers: this.providers,
      ragIndex: this.ragIndex,
    });
    this.ocr = new OcrRecognitionService({
      providers: this.providers,
    });
    this.documentParser = new DocumentParseService({
      providers: this.providers,
    });
    const agentEventBus = new AgentEventBus();
    agentEventBus.on((event) => {
      if (isTerminalAgentRunEvent(event)) {
        this.scheduleCloudEntitlementsRefresh("agent_request_complete");
      }
    });
    this.agent = new AgentOrchestrator({
      rootDataDir: this.rootDataDir,
      businessStore,
      providers: this.providers,
      skillFiles: this.skillFiles,
      sessions: new AgentSessionStore(this.rootDataDir),
      eventBus: agentEventBus,
      promptBuilder: new PromptBuilder(),
      permissions: new PermissionService(),
      askUsers: new AskUserService(),
      exitPlans: new ExitPlanService(),
      sdk: new ClaudeSdkAdapter(),
      gateway: this.agentGateway,
      ragSearch: (input) => this.searchRag(input.query, input.courseId, input),
    });
    void this.agentGateway.syncConfiguredState().catch((error) => {
      console.warn("[agent-gateway] Failed to sync configured state", error);
    });
  }

  dataRoot(): string {
    return this.rootDataDir;
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

  listCoursesForArchive(scope?: ArchivedCourseScope): Course[] {
    return this.workspace.listCoursesForArchive(scope);
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

  listArchivedTasks(scope?: ArchivedTaskScope): BrevynTask[] {
    return this.workspace.listArchivedTasks(scope);
  }

  createTask(input: CreateTaskInput): BrevynTask {
    return this.workspace.createTask(input);
  }

  updateTask(input: UpdateTaskInput): BrevynTask {
    return this.workspace.updateTask(input);
  }

  archiveTask(taskId: string): BrevynTask {
    return this.workspace.archiveTask(taskId);
  }

  restoreTask(taskId: string): BrevynTask {
    return this.workspace.restoreTask(taskId);
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

  renameThread(input: RenameThreadInput): Thread {
    return this.workspace.renameThread(input.threadId, input.title);
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

  async searchRag(query: string, courseId?: string, options?: RagSearchOptions & { limit?: number }): Promise<RagSearchResult[]> {
    try {
      return await this.files.searchRag(query, courseId, options);
    } finally {
      this.scheduleCloudEntitlementsRefresh("embedding_search_complete");
    }
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

  async previewThreadWorkspacePath(threadId: string, requestedPath: string): Promise<FilePreview | null> {
    const targetPath = this.resolveThreadWorkspacePath(threadId, requestedPath);
    return this.files.previewWorkspacePath(targetPath, requestedPath);
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

  deleteFile(input: string | DeleteFileInput): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    return this.files.deleteFile(input);
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

  retryIndexingFile(fileId: string): IndexingJob {
    return this.files.retryIndexingFile(fileId);
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

  async completeIndexingTask(taskId: string, result: IndexingWorkerResult, workerId?: string, lockedUntil?: string): Promise<IndexingJob | null> {
    try {
      return await this.files.completeIndexingTask(taskId, result, workerId, lockedUntil);
    } finally {
      this.scheduleCloudEntitlementsRefresh("embedding_index_complete");
    }
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
    this.assertEmbeddingProviderMutable(input.purpose);
    return this.providers.save(input);
  }

  deleteProvider(providerId: string): boolean {
    const provider = this.providers.list().find((item) => item.id === providerId);
    this.assertEmbeddingProviderMutable(provider?.purpose);
    return this.providers.delete(providerId);
  }

  providerModels(providerId: string): Promise<ProviderModel[]> {
    return this.providers.models(providerId);
  }

  providerModelsFromDraft(input: ProviderDraftInput): Promise<ProviderModel[]> {
    return this.providers.modelsFromDraft(input);
  }

  testProvider(providerId: string): Promise<ProviderTestResult> {
    return this.providers.test(providerId);
  }

  testProviderDraft(input: ProviderDraftInput): Promise<ProviderTestResult> {
    return this.providers.testDraft(input);
  }

  hasActiveIndexingJobs(): boolean {
    const semesterId = currentActiveSemesterId(this.businessStore);
    return semesterId ? this.businessStore.hasActiveSemesterIndexing(semesterId) : false;
  }

  async recognizeAcademicCalendar(input: VisionRecognitionInput): Promise<RecognizedAcademicCalendar> {
    try {
      return await this.vision.recognizeAcademicCalendar(input);
    } finally {
      this.scheduleCloudEntitlementsRefresh("vision_request_complete");
    }
  }

  async recognizeCourseTimetable(input: VisionRecognitionInput): Promise<RecognizedCourseTimetable> {
    try {
      return await this.vision.recognizeCourseTimetable(input);
    } finally {
      this.scheduleCloudEntitlementsRefresh("vision_request_complete");
    }
  }

  importAcademicCalendar(input: RecognizedAcademicCalendar): RecognizedAcademicCalendar {
    return this.vision.importAcademicCalendar(input);
  }

  importCourseTimetable(input: RecognizedCourseTimetable): RecognizedCourseTimetable {
    return this.vision.importCourseTimetable(input);
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

  agentGatewayStatus(): AgentGatewayStatus {
    return this.agentGateway.getStatus();
  }

  async setAgentGatewayEnabled(enabled: boolean): Promise<AgentGatewayStatus> {
    this.appSettings.updateAgentGateway({ openAiResponsesEnabled: enabled });
    return await this.agentGateway.setEnabled(enabled);
  }

  profile(): UserProfileSettings {
    return this.appSettings.get().profile;
  }

  updateProfile(input: UserProfileUpdateInput): UserProfileSettings {
    return this.appSettings.updateProfile(input).profile;
  }

  themePreference(): AppThemePreference {
    return this.appSettings.get().appearance.themePreference;
  }

  updateThemePreference(preference: AppThemePreference): AppThemePreference {
    return this.appSettings.updateAppearance({ themePreference: preference }).appearance.themePreference;
  }

  cloudStatus(): CloudAccountStatus {
    return this.cloud.status();
  }

  cloudLogin(input: CloudAuthInput): Promise<CloudOfficialProviderSyncResult> {
    return this.cloud.login(input);
  }

  cloudRegister(input: CloudAuthInput): Promise<CloudOfficialProviderSyncResult> {
    return this.cloud.register(input);
  }

  cloudRefresh(input?: CloudRefreshInput): Promise<CloudAccountStatus> {
    return this.cloud.refresh(input);
  }

  cloudRefreshEntitlements(input?: CloudRefreshInput): Promise<CloudAccountStatus> {
    return this.cloud.refreshEntitlements(input);
  }

  private scheduleCloudEntitlementsRefresh(reason: string, delayMs = CLOUD_ENTITLEMENTS_USAGE_REFRESH_DELAY_MS): void {
    if (!this.cloud.status().authenticated) return;
    if (this.cloudEntitlementsRefreshTimer) clearTimeout(this.cloudEntitlementsRefreshTimer);
    this.cloudEntitlementsRefreshTimer = setTimeout(() => {
      this.cloudEntitlementsRefreshTimer = null;
      void this.refreshCloudEntitlementsAfterUsage(reason);
    }, delayMs);
  }

  private async refreshCloudEntitlementsAfterUsage(reason: string): Promise<void> {
    if (this.cloudEntitlementsRefreshInFlight) {
      this.scheduleCloudEntitlementsRefresh(reason, CLOUD_ENTITLEMENTS_FORCE_COOLDOWN_MS);
      return;
    }
    const now = Date.now();
    const remainingCooldown = CLOUD_ENTITLEMENTS_FORCE_COOLDOWN_MS - (now - this.cloudEntitlementsLastForceAt);
    if (remainingCooldown > 0) {
      this.scheduleCloudEntitlementsRefresh(reason, remainingCooldown);
      return;
    }
    this.cloudEntitlementsRefreshInFlight = true;
    this.cloudEntitlementsLastForceAt = now;
    try {
      await this.cloud.refreshEntitlements({ forceEntitlements: true, reason });
    } catch (error) {
      console.warn("[cloud] Usage-triggered entitlement refresh failed", error);
    } finally {
      this.cloudEntitlementsRefreshInFlight = false;
    }
  }

  cloudModelsCatalog(input?: CloudModelCatalogInput): Promise<CloudModelCatalogResult> {
    return this.cloud.modelsCatalog(input);
  }

  cloudSyncConversationProvider(input?: CloudSyncConversationProviderInput): Promise<CloudOfficialProviderSyncResult> {
    return this.cloud.syncConversationProvider(input);
  }

  cloudActivateConversationProvider(input: CloudActivateConversationProviderInput): Promise<CloudOfficialProviderSyncResult> {
    return this.cloud.activateConversationProvider(input);
  }

  cloudSyncOfficialProvider(input?: CloudSyncOfficialProviderInput): Promise<CloudOfficialProviderSyncResult> {
    return this.cloud.syncOfficialProvider(input);
  }

  cloudActivateOfficialProvider(input: CloudActivateOfficialProviderInput): Promise<CloudOfficialProviderSyncResult> {
    return this.cloud.activateOfficialProvider(input);
  }

  cloudRedeemCode(input: CloudRedeemCodeInput): Promise<CloudRedeemCodeResult> {
    return this.cloud.redeemCode(input);
  }

  cloudLogout(): Promise<CloudAccountStatus> {
    return this.cloud.logout();
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
        if ((event.kind === "school_event" || event.kind === "school_week") && query.includeSchoolEvents === false) return false;
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

  queueAgentMessage(input: AgentQueueMessageInput): Promise<string> {
    return this.agent.queueMessage(input);
  }

  async saveAgentAttachmentPaths(threadId: string, sourcePaths: string[]): Promise<AgentAttachment[]> {
    const targetDir = this.threadSessionDir(threadId);
    const attachments: AgentAttachment[] = [];
    for (const sourcePath of sourcePaths) {
      if (!existsSync(sourcePath) || statSync(sourcePath).isDirectory()) continue;
      const targetPath = uniqueAttachmentPath(targetDir, basename(sourcePath));
      await copyFile(sourcePath, targetPath);
      attachments.push(this.attachmentForPath(threadId, targetPath));
    }
    return attachments;
  }

  saveAgentAttachmentData(input: AgentAttachmentDataInput): AgentAttachment {
    const estimatedBytes = Math.floor(input.data.length * 0.75);
    if (estimatedBytes > MAX_AGENT_ATTACHMENT_DATA_BYTES) {
      throw new Error(`"${input.name}" is ${formatSize(estimatedBytes)}. Agent attachments are limited to ${formatSize(MAX_AGENT_ATTACHMENT_DATA_BYTES)} per file.`);
    }
    const targetDir = this.threadSessionDir(input.threadId);
    const targetPath = uniqueAttachmentPath(targetDir, input.name);
    writeFileSync(targetPath, Buffer.from(input.data, "base64"));
    return this.attachmentForPath(input.threadId, targetPath, input.mediaType);
  }

  deleteAgentAttachment(threadId: string, requestedPath: string): boolean {
    const targetPath = this.resolveThreadWorkspacePath(threadId, requestedPath);
    const attachmentDir = this.threadAttachmentDir(threadId);
    if (!isPathInside(targetPath, attachmentDir)) {
      throw new Error("Only current session attachments can be removed from the composer.");
    }
    if (!existsSync(targetPath)) return false;
    rmSync(targetPath, { force: true });
    return true;
  }

  listAgentSessionFiles(threadId: string): WorkspaceFileNode[] {
    const sessionDir = this.threadSessionDir(threadId);
    return listSessionFileNodes(sessionDir, sessionDir, this.requireThread(threadId));
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
    const thread = this.requireThread(threadId);
    const cwd = workspacePathForThread(this.rootDataDir, thread, (taskId) => this.businessStore.getTask(taskId) || undefined);
    const target = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(cwd, requestedPath);
    if (!isPathInside(target, cwd)) {
      throw new Error("File references can only open paths inside the current workspace.");
    }
    return target;
  }

  private requireThread(threadId: string): Thread {
    const thread = this.businessStore.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    return thread;
  }

  private assertEmbeddingProviderMutable(purpose?: string): void {
    if (purpose !== "embedding") return;
    if (this.hasActiveIndexingJobs()) {
      throw new Error("当前有向量索引任务正在进行。请等待完成或取消后，再切换、保存或删除 Embedding 配置。");
    }
  }

  private threadAttachmentDir(threadId: string): string {
    return this.threadSessionDir(threadId);
  }

  private threadSessionDir(threadId: string): string {
    const thread = this.requireThread(threadId);
    const cwd = workspacePathForThread(this.rootDataDir, thread, (taskId) => this.businessStore.getTask(taskId) || undefined);
    return ensureAgentProjectScaffold(cwd, thread.id).sessionDir;
  }

  private attachmentForPath(threadId: string, filePath: string, mediaType?: string): AgentAttachment {
    const stats = statSync(filePath);
    return {
      id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      threadId,
      name: basename(filePath),
      kind: kindForPath(filePath),
      mimeType: mediaType,
      size: stats.size,
      sizeLabel: formatSize(stats.size),
      path: filePath,
      createdAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    if (this.cloudEntitlementsRefreshTimer) {
      clearTimeout(this.cloudEntitlementsRefreshTimer);
      this.cloudEntitlementsRefreshTimer = null;
    }
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
      await this.agentGateway.close();
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

function bundledDefaultSkillDirs(): string[] {
  const dirs = [
    process.env.BREVYN_DEFAULT_SKILLS_DIR,
    join(process.resourcesPath || "", "default-skills"),
    join(process.cwd(), "default-skills"),
    join(__dirname, "default-skills"),
    join(__dirname, "resources", "default-skills"),
  ].filter((dir): dir is string => Boolean(dir));
  return Array.from(new Set(dirs.map((dir) => resolve(dir))));
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

function uniqueAttachmentPath(dir: string, fileName: string): string {
  mkdirSync(dir, { recursive: true });
  const safeName = sanitizeFsSegment(fileName || "attachment");
  const extension = extname(safeName);
  const baseName = extension ? safeName.slice(0, -extension.length) : safeName;
  let candidate = join(dir, safeName);
  let index = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${baseName} (${index})${extension}`);
    index += 1;
  }
  return candidate;
}

function isTerminalAgentRunEvent(event: BrevynAgentEvent): boolean {
  if (event.kind !== "brevyn_event") return false;
  return event.event.type === "run_completed" ||
    event.event.type === "run_stopped" ||
    event.event.type === "run_failed" ||
    event.event.type === "run_interrupted";
}

function listSessionFileNodes(dir: string, rootDir: string, thread: Thread): WorkspaceFileNode[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const sourcePath = join(dir, entry.name);
      const stats = statSync(sourcePath);
      const relativePath = sourcePath.slice(rootDir.length).replace(/^\/+/, "");
      const path = relativePath || entry.name;
      const common = {
        id: `session-file:${thread.id}:${path}`,
        semesterId: thread.semesterId || "",
        courseId: thread.courseId,
        taskId: thread.taskId,
        name: entry.name,
        displayName: entry.name,
        path,
        sourcePath,
        sizeLabel: entry.isDirectory() ? undefined : formatSize(stats.size),
        updatedAt: stats.mtime.toISOString(),
      };
      if (entry.isDirectory()) {
        return [{
          ...common,
          kind: "folder" as const,
          children: listSessionFileNodes(sourcePath, rootDir, thread),
        }];
      }
      return [{
        ...common,
        kind: kindForPath(sourcePath),
      }];
    });
}

export function createLocalStore(rootDataPath: string, options: LocalStoreOptions = {}): LocalStore {
  return new LocalStore(
    join(rootDataPath, "brevyn-state.json"),
    new SQLiteBusinessStore(join(rootDataPath, "indexes", "brevyn.sqlite")),
    new ProviderConfigStore(join(rootDataPath, "provider-profiles.json")),
    new ProviderSecretStore(join(rootDataPath, "provider-secrets.json")),
    options,
  );
}

function resolveCloudRuntimeConfig(options: LocalStoreOptions): {
  defaultBaseUrl: string;
  environment: BrevynCloudEnvironment;
  baseUrlEditable: boolean;
  shopUrl: string;
} {
  const environment: BrevynCloudEnvironment = options.isPackaged ? "production" : "development";
  const defaultBaseUrl = envString("BREVYN_CLOUD_BASE_URL")
    || (environment === "production" ? BREVYN_CLOUD_PRODUCTION_BASE_URL : BREVYN_CLOUD_DEVELOPMENT_BASE_URL);
  return {
    defaultBaseUrl,
    environment,
    baseUrlEditable: environment === "development" || envFlag("BREVYN_CLOUD_ALLOW_BASE_URL_EDIT"),
    shopUrl: envString("BREVYN_CLOUD_SHOP_URL") || BREVYN_CLOUD_SHOP_URL,
  };
}

function envString(name: string): string {
  return typeof process.env[name] === "string" ? process.env[name]!.trim() : "";
}

function envFlag(name: string): boolean {
  const value = envString(name).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
