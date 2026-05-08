import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type {
  Course,
  CourseFileSection,
  CreateCourseInput,
  CreateSemesterInput,
  CreateTaskInput,
  CreateThreadInput,
  FileImportInput,
  FileImportResult,
  FileStats,
  GitStatus,
  FilePreview,
  IndexingJob,
  ModelProviderConfig,
  ProviderDraftInput,
  ProviderModel,
  ProviderTestResult,
  RagSearchResult,
  SemesterWorkspace,
  SkillItem,
  SkillImportInput,
  SkillWriteInput,
  SkillUpdateInput,
  TaskFileBucket,
  TaskType,
  TimetableEvent,
  TimetableRangeQuery,
  Thread,
  UclawTask,
  WorkspaceFileKind,
  WorkspaceFileNode,
} from "../../types/domain";
import type { IndexingTaskInsert, IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import { SQLiteBusinessStore, type BusinessData } from "../storage";
import { ProviderConfigStore } from "./provider-config-store";
import { ProviderSecretStore } from "./provider-secret-store";
import { ProviderService, envApiKeyForProvider } from "./provider-service";
import { RagIndexService } from "./rag-index-service";
import { SkillFileStore } from "../skills/skill-file-store";
import { BUILTIN_SKILL_BLUEPRINTS } from "../skills/skill-registry";
import {
  DEFAULT_TASK_TYPE,
  SEMESTER_HOME_COURSE_ID,
  TASK_FILE_BUCKETS,
  courseWorkspaceDir,
  ensureCourseWorkspaceDir,
  ensureImportTargetDir,
  ensureSemesterSharedDirs,
  ensureSemesterWorkspaceDir,
  ensureTaskWorkspaceDir,
  folderNameForCourse,
  sanitizeFsSegment,
  semesterWorkspaceDir,
  taskBucketLabel,
  taskFolderName,
  taskFolderPrefix,
  taskTypeLabel,
  taskWorkspaceDirForTask,
} from "./workspace-paths";

export { SEMESTER_HOME_COURSE_ID } from "./workspace-paths";

interface StoreShape {
  semester: SemesterWorkspace | null;
  semesters: SemesterWorkspace[];
  currentSemesterId: string | null;
  courses: Course[];
  tasks: UclawTask[];
  threads: Thread[];
  files: WorkspaceFileNode[];
  timetableEvents: TimetableEvent[];
  indexingJobs: IndexingJob[];
  indexingTasks: IndexingTaskRecord[];
}

const now = () => new Date().toISOString();
const LEGACY_SEED_IDS = {
  semester: new Set(["semester-2026-spring", "semester-2026-fall", "semester-current"]),
  courses: new Set(["course-ai-law", "course-evidence", "course-writing"]),
  tasks: new Set(["task-ai-policy-brief", "task-ai-case-map", "task-evidence-hearsay", "task-writing-memo"]),
  threads: new Set(["thread-semester-home", "thread-home", "thread-policy-brief"]),

  files: new Set([
    "folder-ai-law-materials",
    "file-ai-rubric",
    "file-ai-lecture",
    "file-ai-deck",
    "file-ai-diagram",
    "file-ai-agent-tool",
    "folder-evidence-materials",
    "file-evidence-hearsay",
    "file-evidence-outline",
    "folder-writing-materials",
    "file-writing-memo",
    "file-writing-citations",
  ]),
  timetableEvents: new Set([
    "tt-ai-law-mon",
    "tt-evidence-wed",
    "tt-writing-fri",
    "tt-ai-deadline",
    "tt-school-reading-week",
  ]),
};

function initialStore(): StoreShape {
  return {
    semester: null,
    semesters: [],
    currentSemesterId: null,
    courses: [],
    tasks: [],
    threads: [],
    files: [],
    timetableEvents: [],
    indexingJobs: [],
    indexingTasks: [],
  };
}

export class LocalStore {
  private readonly ragIndex: RagIndexService;
  private readonly skillFiles: SkillFileStore;
  private readonly providers: ProviderService;

  constructor(
    private readonly filePath: string,
    private readonly businessStore: SQLiteBusinessStore,
    private readonly providerConfigs: ProviderConfigStore,
    private readonly providerSecrets?: ProviderSecretStore,
  ) {
    this.providers = new ProviderService(providerConfigs, providerSecrets);
    this.initializeStorage();
    this.skillFiles = new SkillFileStore(dirname(this.filePath));
    this.skillFiles.ensureDefaultSkillTemplates(BUILTIN_SKILL_BLUEPRINTS);
    this.ragIndex = new RagIndexService({
      dbPath: join(dirname(this.filePath), "indexes", "rag"),
      resolveEmbeddingProvider: () => this.providers.embeddingProvider(),
      resolveApiKey: (provider) => this.providers.apiKey(provider.id) || envApiKeyForProvider(provider),
    });
    this.ensureActiveCurrentSemester();
  }

  listSemesters(): SemesterWorkspace[] {
    this.ensureActiveCurrentSemester();
    return this.businessStore.listSemesters()
      .filter((semester) => !semester.archivedAt)
      .map((semester) => ({ ...semester }))
      .sort((a, b) => Date.parse(b.startsAt || b.recognizedAt || "") - Date.parse(a.startsAt || a.recognizedAt || ""));
  }

  listArchivedSemesters(): SemesterWorkspace[] {
    this.ensureActiveCurrentSemester();
    return this.businessStore.listSemesters()
      .filter((semester) => Boolean(semester.archivedAt))
      .map((semester) => ({ ...semester }))
      .sort((a, b) => Date.parse(b.archivedAt || "") - Date.parse(a.archivedAt || ""));
  }

  currentSemester(): SemesterWorkspace | null {
    const semester = this.ensureActiveCurrentSemester();
    return semester ? { ...semester } : null;
  }

  createSemester(input: CreateSemesterInput): SemesterWorkspace {
    const timestamp = now();
    const term = input.term.trim() || "New Semester";
    const semester: SemesterWorkspace = {
      id: `semester-${Date.now().toString(36)}`,
      semesterNo: input.semesterNo?.trim() || term,
      term,
      folderName: sanitizeFsSegment(input.folderName?.trim() || term),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      source: "manual",
      recognizedAt: timestamp,
    };
    this.businessStore.saveSemester(semester, true);
    this.ensureSemesterHomeAssets(semester);
    ensureSemesterSharedDirs(this.rootDataDir(), semester.id);
    return { ...semester };
  }

  selectSemester(semesterId: string): SemesterWorkspace {
    const semester = this.businessStore.getSemester(semesterId);
    if (!semester) throw new Error(`Semester not found: ${semesterId}`);
    if (semester.archivedAt) throw new Error(`Semester is archived: ${semester.term}`);
    this.businessStore.setCurrentSemester(semester.id);
    this.ensureSemesterHomeAssets(semester);
    return { ...semester };
  }

  archiveSemester(semesterId: string): SemesterWorkspace {
    const selectedSemesterId = this.businessStore.currentSemesterId() || this.businessStore.currentSemester()?.id || "";
    const semester = this.businessStore.getSemester(semesterId);
    if (!semester) throw new Error(`Semester not found: ${semesterId}`);
    if (semester.archivedAt) return { ...semester };
    const archivedAt = now();
    const archived = this.businessStore.archiveSemester(semesterId, archivedAt) || semester;
    if (selectedSemesterId === semesterId) this.ensureActiveCurrentSemester();
    return { ...archived };
  }

  restoreSemester(semesterId: string): SemesterWorkspace {
    const semester = this.businessStore.getSemester(semesterId);
    if (!semester) throw new Error(`Semester not found: ${semesterId}`);
    const restored = this.businessStore.restoreSemester(semesterId) || semester;
    return { ...restored };
  }

  async deleteSemester(semesterId: string): Promise<boolean> {
    const selectedSemesterId = this.businessStore.currentSemesterId() || this.businessStore.currentSemester()?.id || "";
    const semester = this.businessStore.getSemester(semesterId);
    if (!semester) throw new Error(`Semester not found: ${semesterId}`);
    if (!semester.archivedAt) throw new Error("Archive the semester before deleting it permanently.");
    this.cancelIndexingJobsForSemester(semesterId);
    this.deleteSemesterDir(semesterId);
    await this.deleteRagChunksForSemester(semesterId);
    const deleted = this.businessStore.deleteSemesterDeep(semesterId);
    if (selectedSemesterId === semesterId) this.ensureActiveCurrentSemester();
    return deleted;
  }

  listCourses(): Course[] {
    const semester = this.ensureActiveCurrentSemester();
    return normalizeCourses(this.businessStore.listCourses(semester?.id), semester).filter((course) => course.id === SEMESTER_HOME_COURSE_ID || !course.archivedAt);
  }

  listArchivedCourses(): Course[] {
    const semester = this.ensureActiveCurrentSemester();
    if (!semester) return [];
    return normalizeCourses(this.businessStore.listCourses(semester.id), semester)
      .filter((course) => course.id !== SEMESTER_HOME_COURSE_ID && Boolean(course.archivedAt))
      .sort((a, b) => Date.parse(b.archivedAt || "") - Date.parse(a.archivedAt || ""));
  }

  listTasks(courseId: string): UclawTask[] {
    const semesterId = this.currentSemesterId();
    if (!semesterId || this.isCourseArchived(courseId) || this.isCurrentSemesterArchived()) return [];
    return this.businessStore.listTasks(semesterId, courseId);
  }

  createTask(input: CreateTaskInput): UclawTask {
    const semesterId = this.currentSemesterId();
    if (!semesterId) throw new Error("Select or recognize a semester before creating tasks.");
    if (this.isCourseArchived(input.courseId)) throw new Error("Restore this course before creating tasks.");
    const task: UclawTask = {
      id: `task-${Date.now().toString(36)}`,
      semesterId,
      courseId: input.courseId,
      title: input.title.trim() || "New Task",
      taskType: input.taskType?.trim() || DEFAULT_TASK_TYPE,
      status: "not_started",
      summary: "Custom task created locally.",
    };
    this.businessStore.saveTask(task);
    const roots = this.loadCourseRoots(input.courseId, semesterId);
    const root = this.ensureCourseFolder(input.courseId, roots, semesterId);
    this.ensureTargetFolder(root, { courseId: input.courseId, targetSection: "task", taskId: task.id });
    this.persistWorkspaceFilesForCourse(input.courseId, roots, semesterId);
    this.ensureTaskWorkspaceDir(task);
    return task;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const task = this.businessStore.getTask(taskId);
    if (!task) return false;
    if (this.isCourseArchived(task.courseId)) throw new Error("Restore this course before deleting tasks.");
    if (this.businessStore.hasActiveTaskIndexing(task.id, task.courseId)) {
      throw new Error("Wait for indexing to finish before deleting this task.");
    }
    const semesterId = task.semesterId || this.currentSemesterId();
    const roots = this.loadCourseRoots(task.courseId, semesterId);
    const taskFileIds = flattenFiles(roots).filter((file) => file.taskId === task.id).map((file) => file.id);
    removeTaskFromTree(roots, task.id);
    this.deleteTaskDir(task);
    await this.deleteRagChunksForTask(semesterId, task.courseId, task.id, taskFileIds);
    const deleted = this.businessStore.deleteTaskDeep(task.id);
    if (deleted) this.persistWorkspaceFilesForCourse(task.courseId, roots, semesterId);
    return deleted;
  }

  createCourse(input: CreateCourseInput): Course {
    const semester = this.ensureActiveCurrentSemester();
    if (!semester) {
      throw new Error("Select a semester before creating a course.");
    }
    const name = input.name?.trim();
    const code = input.code?.trim();
    if (!name) throw new Error("Course name is required.");
    if (!code) throw new Error("Course code is required.");

    const existingCourseCount = this.businessStore.countCourses(semester.id);
    const course: Course = {
      id: `course-${Date.now().toString(36)}`,
      semesterId: semester.id,
      name,
      code,
      term: semester.term,
      instructor: input.instructor?.trim() || "",
      workspaceKind: "course",
      meetingTime: input.meetingTime?.trim() || undefined,
      location: input.location?.trim() || undefined,
      color: input.color?.trim() || pickCourseColor(existingCourseCount),
      description: input.description?.trim() || "",
    };
    this.businessStore.saveCourse(course);
    const roots: WorkspaceFileNode[] = [];
    this.ensureCourseFolder(course.id, roots, semester.id);
    this.persistWorkspaceFilesForCourse(course.id, roots, semester.id);
    ensureCourseWorkspaceDir(this.rootDataDir(), semester.id, course.id);
    return course;
  }

  archiveCourse(courseId: string): Course {
    const course = this.businessStore.getCourse(courseId);
    if (!course) throw new Error(`Course not found: ${courseId}`);
    if (course.archivedAt) return { ...course };
    const archivedAt = now();
    const archived = this.businessStore.archiveCourse(courseId, archivedAt) || course;
    this.cancelIndexingJobsForCourse(courseId);
    return { ...archived };
  }

  restoreCourse(courseId: string): Course {
    const course = this.businessStore.getCourse(courseId);
    if (!course) throw new Error(`Course not found: ${courseId}`);
    const restored = this.businessStore.restoreCourse(courseId) || course;
    return { ...restored };
  }

  async deleteCourse(courseId: string): Promise<boolean> {
    const course = this.businessStore.getCourse(courseId);
    if (!course) throw new Error(`Course not found: ${courseId}`);
    if (!course.archivedAt) throw new Error("Archive the course before deleting it permanently.");
    const semesterId = course.semesterId || this.currentSemesterId();
    this.cancelIndexingJobsForCourse(courseId);
    this.deleteCourseDir(courseId, semesterId);
    await this.deleteRagChunksForCourse(semesterId, courseId);
    const deleted = this.businessStore.deleteCourseDeep(courseId);
    return deleted;
  }

  listThreads(courseId?: string): Thread[] {
    if (this.isCurrentSemesterArchived()) return [];
    const semesterId = this.currentSemesterId();
    return this.businessStore.listThreads(semesterId, courseId)
      .filter((thread) => !thread.archivedAt && !this.isCourseArchived(thread.courseId))
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  listArchivedThreads(courseId?: string): Thread[] {
    if (this.isCurrentSemesterArchived()) return [];
    const semesterId = this.currentSemesterId();
    return this.businessStore.listArchivedThreads(semesterId, courseId)
      .filter((thread) => !this.isCourseArchived(thread.courseId))
      .sort((a, b) => Date.parse(b.archivedAt || b.updatedAt) - Date.parse(a.archivedAt || a.updatedAt));
  }

  createThread(input: CreateThreadInput): Thread {
    const semesterId = this.currentSemesterId();
    const isSemesterHome = input.courseId === SEMESTER_HOME_COURSE_ID;
    const course = isSemesterHome ? semesterHomeCourse(this.businessStore.getSemester(semesterId) || this.businessStore.currentSemester()) : this.businessStore.getCourse(input.courseId);
    if (!course) throw new Error(`Course not found: ${input.courseId}`);
    if (!isSemesterHome && course.semesterId !== semesterId) throw new Error("Cannot create a session outside the current semester.");
    if (this.isCourseArchived(input.courseId)) throw new Error("Restore this course before creating sessions.");

    const task = input.taskId ? this.businessStore.getTask(input.taskId) : null;
    if (input.taskId) {
      if (!task) throw new Error(`Task not found: ${input.taskId}`);
      if (task.courseId !== input.courseId) throw new Error("Task does not belong to this course.");
      if (!task.semesterId || task.semesterId !== semesterId) throw new Error("Task does not belong to the current semester.");
    }
    const thread: Thread = {
      id: `thread-${Date.now().toString(36)}`,
      semesterId,
      courseId: input.courseId,
      taskId: input.taskId,
      threadType: input.taskId ? "task" : "home",
      title: input.title || (task ? `${task.title} thread` : "New Home Thread"),
      createdAt: now(),
      updatedAt: now(),
    };
    this.businessStore.saveThread(thread);
    return thread;
  }

  archiveThread(threadId: string): boolean {
    const thread = this.businessStore.getThread(threadId);
    if (!thread || thread.archivedAt) return false;
    return Boolean(this.businessStore.archiveThread(threadId, now()));
  }

  restoreThread(threadId: string): Thread {
    const restored = this.businessStore.restoreThread(threadId);
    if (!restored) throw new Error(`Thread not found: ${threadId}`);
    return { ...restored };
  }

  deleteThread(threadId: string): boolean {
    const thread = this.businessStore.getThread(threadId);
    if (!thread) return false;
    if (this.isSystemThread(thread)) throw new Error("System workspace threads cannot be deleted.");
    if (!thread.archivedAt) throw new Error("Archive the thread before deleting it permanently.");
    return this.businessStore.deleteThread(threadId);
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

  async searchRag(query: string, courseId?: string): Promise<RagSearchResult[]> {
    try {
      if (this.isCurrentSemesterArchived()) return [];
      if (courseId && courseId !== SEMESTER_HOME_COURSE_ID && this.isCourseArchived(courseId)) return [];
      const archivedCourseIds = this.archivedCourseIdsForCurrentSemester();
      return await this.ragIndex.search(
        query,
        this.currentSemesterId(),
        courseId && courseId !== SEMESTER_HOME_COURSE_ID ? courseId : undefined,
        undefined,
        archivedCourseIds,
      );
    } catch (error) {
      console.warn("[rag] Search failed", error);
      return [];
    }
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
    if (this.isCurrentSemesterArchived()) return [];
    if (courseId && courseId !== SEMESTER_HOME_COURSE_ID && this.isCourseArchived(courseId)) return [];
    const semesterId = this.currentSemesterId();
    if (!courseId || courseId === SEMESTER_HOME_COURSE_ID) {
      const semesterRoots = this.loadCourseRoots(SEMESTER_HOME_COURSE_ID, semesterId);
      const semesterRoot = this.ensureCourseFolder(SEMESTER_HOME_COURSE_ID, semesterRoots, semesterId);
      this.persistWorkspaceFilesForCourse(SEMESTER_HOME_COURSE_ID, semesterRoots, semesterId);
      const semesterClone = cloneFile(semesterRoot);
      const archivedCourseIds = new Set(this.archivedCourseIdsForCurrentSemester());
      const courseRoots = this.businessStore.listWorkspaceFiles(semesterId).filter((file) => file.courseId !== SEMESTER_HOME_COURSE_ID && !archivedCourseIds.has(file.courseId) && file.kind === "folder");
      return [
        {
          ...semesterClone,
          children: [...(semesterClone.children || []), ...cloneFiles(courseRoots)],
        },
      ];
    }
    const roots = this.loadCourseRoots(courseId, semesterId);
    this.ensureCourseFolder(courseId, roots, semesterId);
    this.persistWorkspaceFilesForCourse(courseId, roots, semesterId);
    return cloneFiles(roots);
  }

  fileStats(courseId?: string): FileStats {
    const scope: FileStats["scope"] = !courseId || courseId === SEMESTER_HOME_COURSE_ID ? "semester" : "course";
    const effectiveCourseId = scope === "course" ? courseId : undefined;
    const files = scope === "semester" ? this.listFiles(SEMESTER_HOME_COURSE_ID) : this.listFiles(effectiveCourseId);
    const leafFiles = flattenFiles(files);
    const sections = this.courseFileSections(scope === "semester" ? SEMESTER_HOME_COURSE_ID : courseId || SEMESTER_HOME_COURSE_ID);
    const byKind: Record<WorkspaceFileKind, number> = leafFiles.reduce(
      (counts, file) => {
        counts[file.kind] = (counts[file.kind] || 0) + 1;
        return counts;
      },
      {
        folder: 0,
        pdf: 0,
        docx: 0,
        pptx: 0,
        image: 0,
        markdown: 0,
        code: 0,
        text: 0,
        unknown: 0,
      },
    );
    return {
      semesterId: this.currentSemesterId(),
      courseId: effectiveCourseId,
      scope,
      totalFiles: leafFiles.length,
      sectionCount: sections.length,
      sections: sections.map((section) => ({
        id: section.id,
        kind: section.kind,
        title: section.title,
        fileCount: section.files.length,
      })),
      byKind,
    };
  }

  previewFile(fileId: string): FilePreview | null {
    const file = this.businessStore.getWorkspaceFile(fileId);
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
      const content = readPreviewSource(file.sourcePath);
      return {
        ...common,
        mimeType: "text/markdown",
        summary: "Loaded from the imported Markdown source file.",
        content: content || `# ${file.name.replace(/\.md$/i, "")}\n\n(No content available.)`,
      };
    }
    if (file.kind === "code") {
      const content = readPreviewSource(file.sourcePath);
      return {
        ...common,
        mimeType: "text/typescript",
        summary: "Loaded from the imported code source file.",
        content: content || `// No code content available.`,
      };
    }
    if (file.kind === "text") {
      const content = readPreviewSource(file.sourcePath);
      return {
        ...common,
        mimeType: "text/plain",
        summary: "Loaded from the imported text source file.",
        content: content || "(No text content available.)",
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
    if (this.isCourseArchived(input.courseId)) throw new Error("Restore this course before importing files.");
    const sourcePaths = input.sourcePaths || [];
    if (sourcePaths.length === 0) {
      return { files: [], tree: this.listFiles(input.courseId), indexingJob: null };
    }

    const timestamp = now();
    const semesterId = this.currentSemesterId();
    const roots = this.loadCourseRoots(input.courseId, semesterId);
    const root = this.ensureCourseFolder(input.courseId, roots, semesterId);
    const targetFolder = this.ensureTargetFolder(root, input);
    const managedTargetDir = this.ensureImportTargetDir(input);
    const task = input.targetSection === "task" && input.taskId ? this.businessStore.getTask(input.taskId) : undefined;
    const importedFiles = sourcePaths.map((sourcePath) => {
      const stats = statSync(sourcePath);
      const managedPath = uniqueFilePath(managedTargetDir, basename(sourcePath));
      copyFileSync(sourcePath, managedPath);
      const name = basename(managedPath);
      const file: WorkspaceFileNode = {
        id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        semesterId,
        courseId: input.courseId,
        taskId: input.targetSection === "task" ? input.taskId : undefined,
        taskType: input.targetSection === "task" ? task?.taskType : undefined,
        taskFileBucket: input.targetSection === "task" ? input.taskFileBucket || "materials" : undefined,
        sectionKind: input.targetSection,
        sourcePath: managedPath,
        name,
        path: `${targetFolder.path}/${name}`,
        kind: kindForPath(managedPath),
        sizeLabel: formatSize(stats.size),
        updatedAt: timestamp,
      };
      targetFolder.children = [...(targetFolder.children || []), file];
      return file;
    });

    this.persistWorkspaceFilesForCourse(input.courseId, roots, semesterId);
    const sectionId = this.sectionIdForImport(input);
    const indexingJob = this.indexCourseFiles(input.courseId, sectionId);
    return {
      files: cloneFiles(importedFiles),
      tree: this.listFiles(input.courseId),
      indexingJob,
    };
  }

  fileSourcePath(fileId: string): string | undefined {
    const file = this.businessStore.getWorkspaceFile(fileId);
    return file?.sourcePath;
  }

  deleteFile(fileId: string): { courseId: string; tree: WorkspaceFileNode[] } {
    const file = this.businessStore.getWorkspaceFile(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    if (this.isCourseArchived(file.courseId)) throw new Error("Restore this course before deleting files.");
    if (file.kind === "folder") throw new Error("Cannot delete folder via this action.");
    const courseId = file.courseId;
    const sourcePath = file.sourcePath;

    const roots = this.loadCourseRoots(courseId, file.semesterId || this.currentSemesterId());
    removeFileFromTree(roots, fileId);

    // Trash the managed file copy (recoverable from system trash).
    if (sourcePath && existsSync(sourcePath)) {
      try {
        rmSync(sourcePath, { force: true });
      } catch (error) {
        console.warn(`[files] Failed to remove source ${sourcePath}`, error);
      }
    }

    this.persistWorkspaceFilesForCourse(courseId, roots, file.semesterId || this.currentSemesterId());
    return { courseId, tree: this.listFiles(courseId) };
  }

  courseFileSections(courseId: string): CourseFileSection[] {
    if (this.isCurrentSemesterArchived()) return [];
    if (courseId !== SEMESTER_HOME_COURSE_ID && this.isCourseArchived(courseId)) return [];
    this.refreshIndexingJobs();
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
          indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:shared`, leafFiles.length > 0),
          embeddingModel: provider?.selectedModel,
          files: leafFiles,
        },
      ];
    }

    const files = this.listFiles(courseId);
    const tasks = this.listTasks(courseId);
    const provider = this.embeddingProvider();
    const embeddingModel = provider?.selectedModel;
    const leafFiles = flattenFiles(files);
    const lectureFiles = leafFiles.filter((file) => file.sectionKind === "lecture");
    const lectureSections: CourseFileSection[] = lectureFiles.length > 0
      ? [{
          id: `${courseId}:lecture`,
          courseId,
          kind: "lecture",
          title: "Lecture",
          indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:lecture`, lectureFiles.length > 0),
          embeddingModel,
          files: lectureFiles,
        }]
      : [];
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
    const sharedFiles = leafFiles.filter((file) => file.sectionKind === "course_shared" || (!file.taskId && file.sectionKind !== "lecture"));

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
      ...lectureSections,
      ...taskSections,
    ];
  }

  indexCourseFiles(courseId: string, sectionId?: string): IndexingJob {
    if (this.isCourseArchived(courseId)) throw new Error("Restore this course before indexing files.");
    const sections = this.courseFileSections(courseId);
    const files = sectionId ? sections.find((section) => section.id === sectionId)?.files || [] : sections.flatMap((section) => section.files);
    const provider = this.embeddingProvider();
    const localFiles = flattenFiles(files).filter((file) => Boolean(file.sourcePath));
    const timestamp = now();
    const hasFiles = localFiles.length > 0;
    const hasProvider = Boolean(provider?.selectedModel);
    let status: IndexingJob["status"];
    let stage: string;
    let progress: number;
    let error: string | undefined;
    if (!hasFiles) {
      status = "idle";
      stage = "empty";
      progress = 0;
      error = "No local source files are available for indexing in this section.";
    } else if (!hasProvider) {
      status = "failed";
      stage = "no_provider";
      progress = 0;
      error = "No embedding provider configured. Open Settings → Providers and enable an OpenAI-compatible embedding provider.";
    } else {
      status = "queued";
      stage = "queued";
      progress = 0;
      error = undefined;
    }
    const job: IndexingJob = {
      id: `index-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      semesterId: this.currentSemesterId(),
      courseId,
      sectionId,
      status,
      stage,
      embeddingModel: provider?.selectedModel || "(none)",
      indexedFiles: 0,
      totalFiles: localFiles.length,
      completedFiles: 0,
      progress,
      error,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const tasks: IndexingTaskInsert[] = status === "queued" ? localFiles.map((file, index) => ({
      id: `idx-task-${job.id}-${index + 1}`,
      jobId: job.id,
      semesterId: this.currentSemesterId(),
      courseId,
      sectionId,
      fileId: file.id,
      kind: "parse_chunk",
      payload: {
        semesterId: this.currentSemesterId(),
        courseId,
        sectionId,
        fileId: file.id,
        taskId: file.taskId,
        name: file.name,
        path: file.path,
        sourcePath: file.sourcePath,
        kind: file.kind,
        weekNumber: file.weekNumber,
        taskFileBucket: file.taskFileBucket,
      },
    })) : [];
    const created = this.businessStore.createIndexingJob(job, tasks);
    this.refreshIndexingJobs();
    return { ...created };
  }

  listIndexingJobs(courseId?: string): IndexingJob[] {
    if (this.isCurrentSemesterArchived()) return [];
    const archivedCourseIds = new Set(this.archivedCourseIdsForCurrentSemester());
    return this.businessStore.listIndexingJobs(this.currentSemesterId(), courseId).filter((job) => !archivedCourseIds.has(job.courseId));
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    const job = this.businessStore.cancelIndexingJob(jobId);
    return job ? { ...job } : null;
  }

  claimNextIndexingTask(workerId: string, lockMs: number): IndexingTaskRecord | null {
    return this.businessStore.claimNextIndexingTask(workerId, lockMs);
  }

  recoverExpiredIndexingTasks(): void {
    this.businessStore.recoverExpiredIndexingTasks();
  }

  async completeIndexingTask(taskId: string, result: IndexingWorkerResult): Promise<IndexingJob | null> {
    const task = this.businessStore.getIndexingTask(taskId);
    if (!task) return null;
    const job = this.businessStore.getIndexingJob(task.jobId);
    if (job?.status === "cancelled") {
      const cancelled = this.businessStore.completeIndexingTask(taskId, result);
      return cancelled;
    }
    await this.ragIndex.ingestTask(task, result);
    const completed = this.businessStore.completeIndexingTask(taskId, result);
    return completed;
  }

  failIndexingTask(taskId: string, message: string): IndexingJob | null {
    return this.businessStore.failIndexingTask(taskId, message);
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
    if (this.isCurrentSemesterArchived()) return [];
    const archivedCourseIds = new Set(this.archivedCourseIdsForCurrentSemester());
    const start = Date.parse(query.rangeStart);
    const end = Date.parse(query.rangeEnd);
    return this.businessStore.listTimetableEvents(this.currentSemesterId())
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

  private ensureActiveCurrentSemester(): SemesterWorkspace | null {
    const currentId = this.businessStore.currentSemesterId() || "";
    const current = currentId ? this.businessStore.getSemester(currentId) : this.businessStore.currentSemester();
    if (current && !current.archivedAt) {
      this.businessStore.setCurrentSemester(current.id);
      this.ensureSemesterHomeAssets(current);
      return current;
    }

    const next = this.businessStore.firstActiveSemester();
    if (next) {
      this.businessStore.setCurrentSemester(next.id);
      this.ensureSemesterHomeAssets(next);
      return next;
    }

    return this.seedDefaultSemester();
  }

  private isCurrentSemesterArchived(): boolean {
    const semesterId = this.businessStore.currentSemesterId() || this.businessStore.currentSemester()?.id || "";
    return this.isSemesterArchived(semesterId);
  }

  private isSemesterArchived(semesterId?: string): boolean {
    if (!semesterId) return false;
    return Boolean(this.businessStore.getSemester(semesterId)?.archivedAt);
  }

  private isCourseArchived(courseId: string): boolean {
    if (courseId === SEMESTER_HOME_COURSE_ID) return this.isCurrentSemesterArchived();
    const course = this.businessStore.getCourse(courseId);
    if (!course) return false;
    return Boolean(course.archivedAt || this.isSemesterArchived(course.semesterId));
  }

  private archivedCourseIdsForCurrentSemester(): string[] {
    const semesterId = this.currentSemesterId();
    return this.businessStore.listCourses(semesterId)
      .filter((course) => Boolean(course.archivedAt))
      .map((course) => course.id);
  }

  private cancelIndexingJobsForCourse(courseId: string): void {
    for (const job of this.businessStore.listIndexingJobs(undefined, courseId)) {
      if (job.status === "queued" || job.status === "indexing") this.businessStore.cancelIndexingJob(job.id);
    }
  }

  private cancelIndexingJobsForSemester(semesterId: string): void {
    for (const job of this.businessStore.listIndexingJobs(semesterId)) {
      if (job.status === "queued" || job.status === "indexing") this.businessStore.cancelIndexingJob(job.id);
    }
  }

  private deleteCourseDir(courseId: string, semesterId?: string): void {
    if (!semesterId) return;
    const dir = courseWorkspaceDir(this.rootDataDir(), semesterId, courseId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  private deleteTaskDir(task: UclawTask): void {
    const semesterId = task.semesterId || this.currentSemesterId();
    if (!semesterId) return;
    const courseDir = courseWorkspaceDir(this.rootDataDir(), semesterId, task.courseId);
    const dir = taskWorkspaceDirForTask(courseDir, task);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  private deleteSemesterDir(semesterId: string): void {
    const dir = semesterWorkspaceDir(this.rootDataDir(), semesterId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  private async deleteRagChunksForCourse(semesterId: string, courseId: string): Promise<void> {
    try {
      await this.ragIndex.deleteChunksByCourse(semesterId, courseId);
    } catch (error) {
      console.warn(`[rag] Failed to delete chunks for course ${courseId}`, error);
    }
  }

  private async deleteRagChunksForSemester(semesterId: string): Promise<void> {
    try {
      await this.ragIndex.deleteChunksBySemester(semesterId);
    } catch (error) {
      console.warn(`[rag] Failed to delete chunks for semester ${semesterId}`, error);
    }
  }

  private async deleteRagChunksForTask(semesterId: string, courseId: string, taskId: string, fileIds: string[]): Promise<void> {
    try {
      await this.ragIndex.deleteChunksByTask(semesterId, courseId, taskId, fileIds);
    } catch (error) {
      console.warn(`[rag] Failed to delete chunks for task ${taskId}`, error);
    }
  }

  private isSystemThread(thread: Thread): boolean {
    return thread.threadType === "semester_home" || thread.courseId === SEMESTER_HOME_COURSE_ID;
  }

  private ensureSemesterHomeAssets(semester: SemesterWorkspace): void {
    ensureSemesterSharedDirs(this.rootDataDir(), semester.id);
    const threadId = `thread-semester-home-${semester.id}`;
    if (!this.businessStore.getThread(threadId)) {
      const timestamp = now();
      this.businessStore.saveThread({
        id: threadId,
        semesterId: semester.id,
        courseId: SEMESTER_HOME_COURSE_ID,
        threadType: "semester_home",
        title: "Home",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    const roots = this.loadCourseRoots(SEMESTER_HOME_COURSE_ID, semester.id);
    this.ensureCourseFolder(SEMESTER_HOME_COURSE_ID, roots, semester.id);
    this.persistWorkspaceFilesForCourse(SEMESTER_HOME_COURSE_ID, roots, semester.id);
  }

  private persistWorkspaceFilesForCourse(courseId: string, roots: WorkspaceFileNode[], semesterId = this.currentSemesterId()): void {
    if (!semesterId) return;
    this.businessStore.saveWorkspaceFilesForScope(semesterId, courseId, roots);
  }

  private ensureTaskWorkspaceDir(task: UclawTask): void {
    const semesterId = task.semesterId || this.currentSemesterId();
    if (!semesterId) return;
    ensureTaskWorkspaceDir(this.rootDataDir(), semesterId, task);
  }

  private initializeStorage(): void {
    const businessData = this.businessStore.loadData();
    if (businessData) {
      const rawData: StoreShape = { ...businessData };
      let data = repairBusinessDataForSQLite(stripLegacySeedData(rawData));
      if (data.semesters.length === 0) data = this.seedDefaultSemesterData(data);
      if (businessDataChanged(rawData, data)) this.businessStore.replaceBusinessData(toBusinessData(data));
      return;
    }

    const legacyData = stripLegacySeedData(this.loadLegacyJsonStore() || initialStore());
    let data = repairBusinessDataForSQLite(legacyData);
    if (data.semesters.length === 0) {
      data = this.seedDefaultSemesterData(data);
    }
    this.businessStore.replaceBusinessData(toBusinessData(data));
  }

  private seedDefaultSemester(): SemesterWorkspace {
    const businessData = this.businessStore.loadData();
    const next = this.seedDefaultSemesterData({ ...(businessData || initialStore()) });
    this.businessStore.replaceBusinessData(toBusinessData(next));
    const semester = next.semester as SemesterWorkspace;
    this.ensureSemesterHomeAssets(semester);
    return semester;
  }

  private seedDefaultSemesterData(data: StoreShape): StoreShape {
    const timestamp = now();
    const id = data.semesters.some((semester) => semester.id === "semester-default") ? `semester-default-${Date.now().toString(36)}` : "semester-default";
    const semester: SemesterWorkspace = {
      id,
      semesterNo: "DEFAULT",
      term: "My Semester",
      folderName: "My Semester",
      source: "manual",
      recognizedAt: timestamp,
    };
    const next = repairBusinessDataForSQLite({
      ...data,
      semester,
      semesters: upsertSemester(data.semesters, semester),
      currentSemesterId: semester.id,
    });
    return next;
  }

  private loadLegacyJsonStore(): StoreShape | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<StoreShape>;
      const initial = initialStore();
      return {
        ...initial,
        ...parsed,
        courses: parsed.courses ?? initial.courses,
        semester: parsed.semester ?? initial.semester,
        semesters: parsed.semesters ?? (parsed.semester ? [parsed.semester] : initial.semesters),
        currentSemesterId: parsed.currentSemesterId ?? parsed.semester?.id ?? initial.currentSemesterId,
        tasks: parsed.tasks ?? initial.tasks,
        threads: parsed.threads ?? initial.threads,
        files: parsed.files ?? initial.files,
        timetableEvents: parsed.timetableEvents ?? initial.timetableEvents,
        indexingJobs: parsed.indexingJobs ?? initial.indexingJobs,
        indexingTasks: initial.indexingTasks,
      };
    } catch (error) {
      console.warn("[store] Failed to migrate legacy JSON store; using SQLite seed data", error);
      return null;
    }
  }

  private currentSemesterId(): string {
    const semesterId = this.businessStore.currentSemesterId() || this.businessStore.currentSemester()?.id || "";
    if (this.isSemesterArchived(semesterId)) return this.ensureActiveCurrentSemester()?.id || "";
    return semesterId;
  }

  private embeddingProvider(): ModelProviderConfig | undefined {
    return this.providers.embeddingProvider();
  }

  private refreshIndexingJobs(): IndexingJob[] {
    return this.businessStore.listIndexingJobs(this.currentSemesterId());
  }

  private loadCourseRoots(courseId: string, semesterId = this.currentSemesterId()): WorkspaceFileNode[] {
    return cloneFiles(this.businessStore.listWorkspaceFiles(semesterId, courseId).filter((file) => file.kind === "folder"));
  }

  private ensureCourseFolder(courseId: string, roots: WorkspaceFileNode[] = this.loadCourseRoots(courseId), semesterId = this.currentSemesterId()): WorkspaceFileNode {
    const semester = this.businessStore.getSemester(semesterId) || this.businessStore.currentSemester();
    const course =
      courseId === SEMESTER_HOME_COURSE_ID
        ? semesterHomeCourse(semester)
        : this.businessStore.getCourse(courseId);
    const folderName = course ? folderNameForCourse(course, semester || undefined) : "Course";
    let root = roots.find((file) => file.courseId === courseId && file.semesterId === semesterId && file.kind === "folder");
    if (!root) {
      root = {
        id: `folder-${semesterId}-${courseId}`,
        semesterId,
        courseId,
        name: folderName,
        path: folderName,
        kind: "folder",
        updatedAt: now(),
        children: [],
      };
      roots.push(root);
    }
    root.name = folderName;
    root.path = folderName;
    root.children ||= [];
    if (courseId === SEMESTER_HOME_COURSE_ID) {
      ensureFolderPath(root, [{ name: "Semester shared", extra: { sectionKind: "course_shared" } }], now());
    } else {
      ensureFolderPath(root, [{ name: "Course shared", extra: { sectionKind: "course_shared" } }], now());
      ensureFolderPath(root, [{ name: "Lecture", extra: { sectionKind: "lecture" } }], now());
      const courseTasks = this.businessStore.listTasks(semesterId, courseId);
      for (const task of courseTasks) {
        const taskFolder = ensureTaskWorkspace(root, task, now());
        ensureTaskBucketFolders(taskFolder, courseId, task.id, task.taskType, now());
      }
    }
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
    if (input.targetSection === "lecture") {
      return ensureFolderPath(root, [{ name: "Lecture", extra: { sectionKind: "lecture" } }], timestamp);
    }

    const task = input.taskId ? this.businessStore.getTask(input.taskId) : undefined;
    if (!task) throw new Error("Select a task before importing into a task workspace.");
    const taskType = task.taskType || DEFAULT_TASK_TYPE;
    const taskFolder = ensureTaskWorkspace(root, task, timestamp);
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
    if (input.targetSection === "lecture") return `${input.courseId}:lecture`;
    if (input.targetSection === "task" && input.taskId) return `${input.courseId}:task-${input.taskId}`;
    return undefined;
  }

  private indexingStatusForSection(courseId: string, sectionId: string, _hasFiles: boolean): IndexingJob["status"] {
    const job = this.businessStore.listIndexingJobs(this.currentSemesterId(), courseId).find((item) => item.sectionId === sectionId);
    if (job) return job.status;
    return "idle";
  }

  private rootDataDir(): string {
    return dirname(this.filePath);
  }

  private ensureSemesterWorkspaceDir(semesterId: string): string {
    return ensureSemesterWorkspaceDir(this.rootDataDir(), semesterId);
  }

  private ensureCourseWorkspaceDir(courseId: string, semesterId = this.currentSemesterId()): string {
    return ensureCourseWorkspaceDir(this.rootDataDir(), semesterId, courseId);
  }

  private ensureImportTargetDir(input: FileImportInput): string {
    const semesterId = this.currentSemesterId();
    return ensureImportTargetDir(this.rootDataDir(), semesterId, input, (taskId) => {
      return this.businessStore.getTask(taskId) || undefined;
    });
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

function removeFileFromTree(files: WorkspaceFileNode[], fileId: string): boolean {
  for (const file of files) {
    if (!file.children) continue;
    const index = file.children.findIndex((child) => child.id === fileId);
    if (index >= 0) {
      file.children.splice(index, 1);
      return true;
    }
    if (removeFileFromTree(file.children, fileId)) return true;
  }
  return false;
}

function removeTaskFromTree(files: WorkspaceFileNode[], taskId: string): boolean {
  let changed = false;
  for (let index = files.length - 1; index >= 0; index--) {
    const file = files[index];
    if (file.taskId === taskId) {
      files.splice(index, 1);
      changed = true;
      continue;
    }
    if (!file.children || file.children.length === 0) continue;
    if (removeTaskFromTree(file.children, taskId)) changed = true;
    if (file.sectionKind === "task" && !file.taskId && file.children.length === 0) {
      files.splice(index, 1);
      changed = true;
    }
  }
  return changed;
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

function semesterHomeCourse(semester?: SemesterWorkspace | null): Course {
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

function normalizeCourses(courses: Course[], semester?: SemesterWorkspace | null): Course[] {
  const realCourses = courses
    .filter((course) => course.id !== SEMESTER_HOME_COURSE_ID)
    .filter((course) => !semester?.id || course.semesterId === semester.id)
    .map((course) => ({ ...course, semesterId: course.semesterId || semester?.id, workspaceKind: course.workspaceKind || "course" }));
  if (!semester) return realCourses;
  const home = semesterHomeCourse(semester);
  return [{ ...home, code: semester.semesterNo || home.code, term: semester.term || home.term, workspaceKind: "semester_home" }, ...realCourses];
}

function normalizeSemesters(semesters: SemesterWorkspace[] | undefined, current?: SemesterWorkspace | null): SemesterWorkspace[] {
  const normalized = semesters ? semesters.slice() : [];
  if (!current) return normalized;
  return upsertSemester(normalized, current);
}

function upsertSemester(semesters: SemesterWorkspace[], semester: SemesterWorkspace): SemesterWorkspace[] {
  const existing = semesters.findIndex((item) => item.id === semester.id);
  if (existing >= 0) {
    return semesters.map((item, index) => (index === existing ? { ...item, ...semester } : item));
  }
  return [...semesters, semester];
}

function repairBusinessDataForSQLite(data: StoreShape): StoreShape {
  const semesters = normalizeSemesters(data.semesters, data.semester);
  const currentSemesterId = data.currentSemesterId && semesters.some((item) => item.id === data.currentSemesterId)
    ? data.currentSemesterId
    : data.semester?.id || semesters[0]?.id || null;
  const semester = semesters.find((item) => item.id === currentSemesterId) || null;
  if (!semester) {
    return {
      ...data,
      semester: null,
      semesters,
      currentSemesterId,
      courses: data.courses.filter((course) => course.id !== SEMESTER_HOME_COURSE_ID),
      tasks: data.tasks.filter((task) => !task.semesterId || task.semesterId === currentSemesterId || !currentSemesterId),
      threads: data.threads.filter((thread) => thread.courseId !== SEMESTER_HOME_COURSE_ID),
      files: data.files.filter((file) => file.courseId !== SEMESTER_HOME_COURSE_ID),
      timetableEvents: data.timetableEvents.filter((event) => !event.semesterId || event.semesterId === currentSemesterId || !currentSemesterId),
      indexingJobs: data.indexingJobs || [],
      indexingTasks: data.indexingTasks || [],
    };
  }
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
        title: "Home",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }
  const timetableEvents = data.timetableEvents.map((event) => ({
    ...event,
    semesterId: event.semesterId || courseSemester.get(event.courseId || "") || semester.id,
  }));
  const indexingJobs = (data.indexingJobs || []).map((job) => ({
    ...job,
    semesterId: job.semesterId || courseSemester.get(job.courseId) || semester.id,
  }));
  const indexingTasks = (data.indexingTasks || []).map((task) => ({
    ...task,
    semesterId: task.semesterId || courseSemester.get(task.courseId) || semester.id,
  }));
  const files = repairFileTreeForSQLite(data.files, courseSemester, semester.id);
  return {
    ...data,
    semester,
    semesters,
    currentSemesterId: semester.id,
    courses,
    tasks,
    threads,
    files,
    timetableEvents,
    indexingJobs,
    indexingTasks,
  };
}

function repairFileTreeForSQLite(
  files: WorkspaceFileNode[],
  courseSemester: Map<string, string | undefined>,
  defaultSemesterId: string,
  parent?: Pick<WorkspaceFileNode, "semesterId" | "courseId">,
): WorkspaceFileNode[] {
  return files.map((file) => {
    const courseId = file.courseId || parent?.courseId || SEMESTER_HOME_COURSE_ID;
    const semesterId = file.semesterId || parent?.semesterId || courseSemester.get(courseId) || defaultSemesterId;
    return {
      ...file,
      semesterId,
      courseId,
      children: file.children ? repairFileTreeForSQLite(file.children, courseSemester, defaultSemesterId, { semesterId, courseId }) : undefined,
    };
  });
}

function ensureTaskWorkspace(root: WorkspaceFileNode, task: UclawTask, timestamp: string): WorkspaceFileNode {
  const taskRoot = ensureFolderPath(root, [{ name: "Task", extra: { sectionKind: "task" } }], timestamp);
  return ensureFolderChild(
    taskRoot,
    resolveTaskFolderName(taskRoot, task),
    { sectionKind: "task", taskId: task.id, taskType: task.taskType },
    timestamp,
  );
}

function resolveTaskFolderName(taskRoot: WorkspaceFileNode, task: UclawTask): string {
  const preferredName = taskFolderName(task);
  const prefix = taskFolderPrefix(task.id);
  const existingNames = (taskRoot.children || [])
    .filter((child) => child.kind === "folder" && child.name.startsWith(prefix))
    .map((child) => child.name)
    .sort();
  return existingNames.includes(preferredName) ? preferredName : existingNames[0] || preferredName;
}

function ensureTaskBucketFolders(
  taskFolder: WorkspaceFileNode,
  courseId: string,
  taskId: string | undefined,
  taskType: TaskType,
  timestamp: string,
): void {
  TASK_FILE_BUCKETS.forEach((bucket) => {
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

function rebaseChildPaths(folder: WorkspaceFileNode): void {
  for (const child of folder.children || []) {
    child.path = `${folder.path}/${child.name}`;
    if (child.kind === "folder") rebaseChildPaths(child);
  }
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
}

function uniqueFilePath(dir: string, fileName: string): string {
  const safeName = sanitizeFsSegment(fileName);
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

function stripLegacySeedData(data: StoreShape): StoreShape {
  const currentSemester =
    data.semester && !LEGACY_SEED_IDS.semester.has(data.semester.id) && !isPlaceholderSemester(data.semester) ? data.semester : null;
  const semesters = data.semesters.filter((semester) => !LEGACY_SEED_IDS.semester.has(semester.id) && !isPlaceholderSemester(semester));
  const currentSemesterId = currentSemester?.id && semesters.some((semester) => semester.id === currentSemester.id) ? currentSemester.id : null;
  return {
    ...data,
    semester: currentSemester,
    semesters,
    currentSemesterId,
    courses: data.courses.filter((course) => !LEGACY_SEED_IDS.courses.has(course.id)),
    tasks: data.tasks.filter((task) => !LEGACY_SEED_IDS.tasks.has(task.id)),
    threads: data.threads.filter((thread) => !LEGACY_SEED_IDS.threads.has(thread.id)),
    files: data.files.filter((file) => !LEGACY_SEED_IDS.files.has(file.id)),
    timetableEvents: data.timetableEvents.filter((event) => !LEGACY_SEED_IDS.timetableEvents.has(event.id)),
  };
}

function isPlaceholderSemester(semester: SemesterWorkspace): boolean {
  return semester.id === "semester-current" || (!semester.semesterNo && semester.term === "Current Semester");
}

function readPreviewSource(sourcePath?: string): string {
  if (!sourcePath || !existsSync(sourcePath)) return "";
  try {
    const content = readFileSync(sourcePath, "utf8");
    return truncatePreviewText(content, 12000);
  } catch {
    return "";
  }
}

function truncatePreviewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n[truncated at ${maxLength} chars]`;
}

const COURSE_COLOR_PALETTE = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#059669", // emerald
  "#dc2626", // red
  "#d97706", // amber
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
];

function pickCourseColor(index: number): string {
  return COURSE_COLOR_PALETTE[index % COURSE_COLOR_PALETTE.length];
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

function businessDataChanged(before: StoreShape, after: StoreShape): boolean {
  return JSON.stringify(toBusinessData(before)) !== JSON.stringify(toBusinessData(after));
}

function toBusinessData(data: StoreShape): BusinessData {
  return {
    semester: data.semester,
    semesters: data.semesters,
    currentSemesterId: data.currentSemesterId,
    courses: data.courses,
    tasks: data.tasks,
    threads: data.threads,
    files: data.files,
    timetableEvents: data.timetableEvents,
    indexingJobs: data.indexingJobs,
    indexingTasks: data.indexingTasks,
  };
}

export function createLocalStore(userDataPath: string): LocalStore {
  return new LocalStore(
    join(userDataPath, "uclaw-state.json"),
    new SQLiteBusinessStore(join(userDataPath, "indexes", "uclaw.sqlite")),
    new ProviderConfigStore(join(userDataPath, "provider-profiles.json")),
    new ProviderSecretStore(join(userDataPath, "provider-secrets.json")),
  );
}
