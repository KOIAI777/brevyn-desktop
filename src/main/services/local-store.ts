import { dirname, join } from "node:path";
import type {
  Course,
  CourseFileSection,
  ArchivedCourseScope,
  ArchivedThreadScope,
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  FileImportResult,
  FilePreview,
  FileStats,
  GitStatus,
  IndexingJob,
  ModelProviderConfig,
  ProviderDraftInput,
  ProviderModel,
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
  UclawTask,
  UpdateTaskInput,
  WorkspaceFileNode,
} from "../../types/domain";
import type { IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import { SkillFileStore } from "../skills/skill-file-store";
import { BUILTIN_SKILL_BLUEPRINTS } from "../skills/skill-registry";
import { SQLiteBusinessStore } from "../storage";
import { FileService } from "./file-service";
import { ProviderConfigStore } from "./provider-config-store";
import { ProviderSecretStore } from "./provider-secret-store";
import { ProviderService, envApiKeyForProvider } from "./provider-service";
import { RagIndexService } from "./rag-index-service";
import { WorkspaceService } from "./workspace-service";
import { archivedCourseIdsForSemester, currentActiveSemesterId, isCurrentSemesterArchived } from "./workspace-state";

export { SEMESTER_HOME_COURSE_ID } from "./workspace-paths";

export class LocalStore {
  private readonly rootDataDir: string;
  private readonly ragIndex: RagIndexService;
  private readonly skillFiles: SkillFileStore;
  private readonly providers: ProviderService;
  private readonly workspace: WorkspaceService;
  private readonly files: FileService;

  constructor(
    private readonly filePath: string,
    private readonly businessStore: SQLiteBusinessStore,
    providerConfigs: ProviderConfigStore,
    providerSecrets?: ProviderSecretStore,
  ) {
    this.rootDataDir = dirname(this.filePath);
    this.providers = new ProviderService(providerConfigs, providerSecrets);
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
    return this.workspace.selectSemester(semesterId);
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

  archiveCourse(courseId: string): Course {
    return this.workspace.archiveCourse(courseId);
  }

  restoreCourse(courseId: string): Course {
    return this.workspace.restoreCourse(courseId);
  }

  deleteCourse(courseId: string): Promise<boolean> {
    return this.workspace.deleteCourse(courseId);
  }

  listTasks(courseId: string): UclawTask[] {
    return this.workspace.listTasks(courseId);
  }

  createTask(input: CreateTaskInput): UclawTask {
    return this.workspace.createTask(input);
  }

  updateTask(input: UpdateTaskInput): UclawTask {
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

  fileStats(courseId?: string): FileStats {
    return this.files.fileStats(courseId);
  }

  previewFile(fileId: string): FilePreview | null {
    return this.files.previewFile(fileId);
  }

  importFiles(input: FileImportInput): FileImportResult {
    return this.files.importFiles(input);
  }

  fileSourcePath(fileId: string): string | undefined {
    return this.files.fileSourcePath(fileId);
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

  listIndexingJobs(courseId?: string): IndexingJob[] {
    return this.files.listIndexingJobs(courseId);
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    return this.files.cancelIndexingJob(jobId);
  }

  claimNextIndexingTask(workerId: string, lockMs: number): IndexingTaskRecord | null {
    return this.files.claimNextIndexingTask(workerId, lockMs);
  }

  recoverExpiredIndexingTasks(): void {
    this.files.recoverExpiredIndexingTasks();
  }

  completeIndexingTask(taskId: string, result: IndexingWorkerResult): Promise<IndexingJob | null> {
    return this.files.completeIndexingTask(taskId, result);
  }

  failIndexingTask(taskId: string, message: string): IndexingJob | null {
    return this.files.failIndexingTask(taskId, message);
  }

  listSkills(): SkillItem[] {
    return mergeSkills(this.skillFiles.listSkills());
  }

  updateSkill(input: SkillUpdateInput): SkillItem {
    const fileSkill = this.skillFiles.toggleSkill(input.id, input.enabled);
    if (fileSkill) return fileSkill;
    throw new Error(`File skill not found: ${input.id}`);
  }

  readSkillContent(skillId: string): string {
    const content = this.skillFiles.readSkillContent(skillId);
    if (content == null) throw new Error(`Skill content not found: ${skillId}`);
    return content;
  }

  writeSkillContent(input: SkillWriteInput): SkillItem {
    const updated = this.skillFiles.writeSkillContent(input.id, input.content);
    if (!updated) throw new Error(`Skill content not found: ${input.id}`);
    return updated;
  }

  importSkillFolder(input: SkillImportInput): SkillItem {
    if (!input.sourcePath?.trim()) throw new Error("Skill import requires a source folder.");
    return this.skillFiles.importSkillFolder(input.sourcePath, input.enabled ?? true);
  }

  skillFolderPath(skillId: string): string {
    const dir = this.skillFiles.skillFolderPath(skillId);
    if (!dir) throw new Error(`Skill folder not found: ${skillId}`);
    return dir;
  }

  listProviders(): ModelProviderConfig[] {
    return this.providers.list().map((provider) => ({ ...provider }));
  }

  saveProvider(input: ProviderDraftInput): ModelProviderConfig {
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

  async close(): Promise<void> {
    await this.ragIndex.close();
    this.businessStore.close();
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

export function createLocalStore(userDataPath: string): LocalStore {
  return new LocalStore(
    join(userDataPath, "uclaw-state.json"),
    new SQLiteBusinessStore(join(userDataPath, "indexes", "uclaw.sqlite")),
    new ProviderConfigStore(join(userDataPath, "provider-profiles.json")),
    new ProviderSecretStore(join(userDataPath, "provider-secrets.json")),
  );
}
