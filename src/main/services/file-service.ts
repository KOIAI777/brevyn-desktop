import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type {
  CourseFileSection,
  FileImportInput,
  FileImportResult,
  FilePreview,
  FileStats,
  IndexingJob,
  ModelProviderConfig,
  RagSearchResult,
  WorkspaceFileKind,
  WorkspaceFileNode,
} from "../../types/domain";
import type { IndexingTaskInsert, IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import type { SQLiteBusinessStore } from "../storage";
import type { ProviderService } from "./provider-service";
import type { RagIndexService } from "./rag-index-service";
import {
  cloneFile,
  cloneFiles,
  ensureCourseFolderInTree,
  ensureTargetFolderInTree,
  flattenFiles,
  formatSize,
  kindForPath,
  removeFileFromTree,
} from "./workspace-file-tree";
import {
  SEMESTER_HOME_COURSE_ID,
  courseWorkspaceDir,
  ensureImportTargetDir,
  isPathInside,
  sanitizeFsSegment,
  semesterWorkspaceDir,
  taskTypeLabel,
} from "./workspace-paths";
import {
  archivedCourseIdsForSemester,
  currentActiveSemester,
  currentActiveSemesterId,
  isCourseArchived,
  isCurrentSemesterArchived,
} from "./workspace-state";

const now = () => new Date().toISOString();

export interface FileServiceOptions {
  rootDataDir: string;
  businessStore: SQLiteBusinessStore;
  providers: ProviderService;
  ragIndex: RagIndexService;
}

export class FileService {
  constructor(private readonly options: FileServiceOptions) {}

  async searchRag(query: string, courseId?: string): Promise<RagSearchResult[]> {
    try {
      if (isCurrentSemesterArchived(this.options.businessStore)) return [];
      if (courseId && courseId !== SEMESTER_HOME_COURSE_ID && isCourseArchived(this.options.businessStore, courseId)) return [];
      const semesterId = currentActiveSemesterId(this.options.businessStore);
      if (!semesterId) return [];
      const archivedCourseIds = archivedCourseIdsForSemester(this.options.businessStore, semesterId);
      return await this.options.ragIndex.search(
        query,
        semesterId,
        courseId && courseId !== SEMESTER_HOME_COURSE_ID ? courseId : undefined,
        undefined,
        archivedCourseIds,
      );
    } catch (error) {
      console.warn("[rag] Search failed", error);
      return [];
    }
  }

  listFiles(courseId?: string): WorkspaceFileNode[] {
    if (isCurrentSemesterArchived(this.options.businessStore)) return [];
    if (courseId && courseId !== SEMESTER_HOME_COURSE_ID && isCourseArchived(this.options.businessStore, courseId)) return [];
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return [];
    if (!courseId || courseId === SEMESTER_HOME_COURSE_ID) {
      const semesterRoots = this.viewCourseRoots(SEMESTER_HOME_COURSE_ID, semesterId);
      const semesterRoot = semesterRoots[0];
      if (!semesterRoot) return [];
      const semesterClone = cloneFile(semesterRoot);
      const archivedCourseIds = new Set(archivedCourseIdsForSemester(this.options.businessStore, semesterId));
      const courseRoots = this.options.businessStore.listWorkspaceFiles(semesterId)
        .filter((file) => file.courseId !== SEMESTER_HOME_COURSE_ID && !archivedCourseIds.has(file.courseId) && file.kind === "folder");
      return [
        {
          ...semesterClone,
          children: [...(semesterClone.children || []), ...cloneFiles(courseRoots)],
        },
      ];
    }
    return cloneFiles(this.viewCourseRoots(courseId, semesterId));
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
      semesterId: currentActiveSemesterId(this.options.businessStore),
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
    const file = this.options.businessStore.getWorkspaceFile(fileId);
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
    if (isCourseArchived(this.options.businessStore, input.courseId)) throw new Error("Restore this course before importing files.");
    const sourcePaths = input.sourcePaths || [];
    if (sourcePaths.length === 0) {
      return { files: [], tree: this.listFiles(input.courseId), indexingJob: null };
    }

    const timestamp = now();
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("Select a semester before importing files.");
    const roots = this.viewCourseRoots(input.courseId, semesterId);
    const root = roots[0];
    if (!root) throw new Error("Course file tree is not available.");
    const task = input.targetSection === "task" && input.taskId ? this.options.businessStore.getTask(input.taskId) || undefined : undefined;
    const targetFolder = ensureTargetFolderInTree(root, input, task, timestamp);
    const managedTargetDir = this.ensureImportTargetDir(input);
    const copiedPaths: string[] = [];
    try {
      const importedFiles = sourcePaths.map((sourcePath) => {
        const stats = statSync(sourcePath);
        const managedPath = uniqueFilePath(managedTargetDir, basename(sourcePath));
        copyFileSync(sourcePath, managedPath);
        copiedPaths.push(managedPath);
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
      let indexingJob: IndexingJob | null = null;
      try {
        indexingJob = this.indexCourseFiles(input.courseId, sectionId);
      } catch (error) {
        console.warn("[indexing] Failed to create indexing job after import", error);
      }
      return {
        files: cloneFiles(importedFiles),
        tree: this.listFiles(input.courseId),
        indexingJob,
      };
    } catch (error) {
      for (const copiedPath of copiedPaths) this.safeRm(copiedPath, `[files] Failed to clean copied file ${copiedPath}`);
      throw error;
    }
  }

  fileSourcePath(fileId: string): string | undefined {
    const file = this.options.businessStore.getWorkspaceFile(fileId);
    return file?.sourcePath;
  }

  async deleteFile(fileId: string): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    const file = this.options.businessStore.getWorkspaceFile(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    if (isCourseArchived(this.options.businessStore, file.courseId)) throw new Error("Restore this course before deleting files.");
    if (file.kind === "folder") throw new Error("Cannot delete folder via this action.");
    if (this.options.businessStore.hasActiveFileIndexing(fileId)) {
      throw new Error("Wait for indexing to finish before deleting this file.");
    }
    const courseId = file.courseId;
    const sourcePath = file.sourcePath;
    const semesterId = file.semesterId || currentActiveSemesterId(this.options.businessStore);
    const allowedRoot = courseId === SEMESTER_HOME_COURSE_ID
      ? join(semesterWorkspaceDir(this.options.rootDataDir, semesterId), "Semester shared")
      : courseWorkspaceDir(this.options.rootDataDir, semesterId, courseId);

    if (sourcePath && existsSync(sourcePath) && !isPathInside(sourcePath, allowedRoot)) {
      throw new Error(`Refusing to delete file outside the workspace: ${sourcePath}`);
    }

    const roots = this.loadCourseRoots(courseId, semesterId);
    removeFileFromTree(roots, fileId);
    this.persistWorkspaceFilesForCourse(courseId, roots, semesterId);

    if (sourcePath && existsSync(sourcePath)) {
      this.safeRm(sourcePath, `[files] Failed to remove source ${sourcePath}`);
    }
    await this.deleteRagChunksForFile(fileId);
    return { courseId, tree: this.listFiles(courseId) };
  }

  courseFileSections(courseId: string): CourseFileSection[] {
    if (isCurrentSemesterArchived(this.options.businessStore)) return [];
    if (courseId !== SEMESTER_HOME_COURSE_ID && isCourseArchived(this.options.businessStore, courseId)) return [];
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return [];
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
          indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:shared`),
          embeddingModel: provider?.selectedModel,
          files: leafFiles,
        },
      ];
    }

    const files = this.listFiles(courseId);
    const tasks = this.options.businessStore.listTasks(semesterId, courseId);
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
          indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:lecture`),
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
      indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:task-${task.id}`),
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
        indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:shared`),
        embeddingModel,
        files: sharedFiles,
      },
      ...lectureSections,
      ...taskSections,
    ];
  }

  indexCourseFiles(courseId: string, sectionId?: string): IndexingJob {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("Select a semester before indexing files.");
    if (isCourseArchived(this.options.businessStore, courseId)) throw new Error("Restore this course before indexing files.");
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
      error = "No embedding provider configured. Open Settings -> Providers and enable an OpenAI-compatible embedding provider.";
    } else {
      status = "queued";
      stage = "queued";
      progress = 0;
      error = undefined;
    }
    const job: IndexingJob = {
      id: `index-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      semesterId,
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
    const tasks: IndexingTaskInsert[] = status === "queued" ? localFiles.map((file, index) => {
      const fileCourseId = file.courseId || courseId;
      return {
        id: `idx-task-${job.id}-${index + 1}`,
        jobId: job.id,
        semesterId,
        courseId: fileCourseId,
        sectionId,
        fileId: file.id,
        kind: "parse_chunk",
        payload: {
          semesterId,
          courseId: fileCourseId,
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
      };
    }) : [];
    const created = this.options.businessStore.createIndexingJob(job, tasks);
    this.refreshIndexingJobs();
    return { ...created };
  }

  listIndexingJobs(courseId?: string): IndexingJob[] {
    if (isCurrentSemesterArchived(this.options.businessStore)) return [];
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return [];
    const archivedCourseIds = new Set(archivedCourseIdsForSemester(this.options.businessStore, semesterId));
    return this.options.businessStore.listIndexingJobs(semesterId, courseId).filter((job) => !archivedCourseIds.has(job.courseId));
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    const job = this.options.businessStore.cancelIndexingJob(jobId);
    return job ? { ...job } : null;
  }

  claimNextIndexingTask(workerId: string, lockMs: number): IndexingTaskRecord | null {
    return this.options.businessStore.claimNextIndexingTask(workerId, lockMs);
  }

  recoverExpiredIndexingTasks(): void {
    this.options.businessStore.recoverExpiredIndexingTasks();
  }

  async completeIndexingTask(taskId: string, result: IndexingWorkerResult): Promise<IndexingJob | null> {
    const task = this.options.businessStore.getIndexingTask(taskId);
    if (!task) return null;
    const job = this.options.businessStore.getIndexingJob(task.jobId);
    if (job?.status === "cancelled") {
      return this.options.businessStore.completeIndexingTask(taskId, result);
    }
    await this.options.ragIndex.ingestTask(task, result);
    return this.options.businessStore.completeIndexingTask(taskId, result);
  }

  failIndexingTask(taskId: string, message: string): IndexingJob | null {
    return this.options.businessStore.failIndexingTask(taskId, message);
  }

  private viewCourseRoots(courseId: string, semesterId: string): WorkspaceFileNode[] {
    const roots = this.loadCourseRoots(courseId, semesterId);
    const semester = this.options.businessStore.getSemester(semesterId);
    const course = courseId === SEMESTER_HOME_COURSE_ID ? undefined : this.options.businessStore.getCourse(courseId);
    if (!semester || (courseId !== SEMESTER_HOME_COURSE_ID && !course)) return roots;
    ensureCourseFolderInTree({
      roots,
      courseId,
      semester,
      course,
      tasks: courseId === SEMESTER_HOME_COURSE_ID ? [] : this.options.businessStore.listTasks(semesterId, courseId),
      timestamp: now(),
    });
    return roots;
  }

  private loadCourseRoots(courseId: string, semesterId: string): WorkspaceFileNode[] {
    return cloneFiles(this.options.businessStore.listWorkspaceFiles(semesterId, courseId).filter((file) => file.kind === "folder"));
  }

  private persistWorkspaceFilesForCourse(courseId: string, roots: WorkspaceFileNode[], semesterId = currentActiveSemesterId(this.options.businessStore)): void {
    if (!semesterId) return;
    this.options.businessStore.saveWorkspaceFilesForScope(semesterId, courseId, roots);
  }

  private ensureImportTargetDir(input: FileImportInput): string {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    return ensureImportTargetDir(this.options.rootDataDir, semesterId, input, (taskId) => this.options.businessStore.getTask(taskId) || undefined);
  }

  private sectionIdForImport(input: FileImportInput): string | undefined {
    if (input.targetSection === "course_shared") return `${input.courseId}:shared`;
    if (input.targetSection === "lecture") return `${input.courseId}:lecture`;
    if (input.targetSection === "task" && input.taskId) return `${input.courseId}:task-${input.taskId}`;
    return undefined;
  }

  private indexingStatusForSection(courseId: string, sectionId: string): IndexingJob["status"] {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return "idle";
    const job = this.options.businessStore.listIndexingJobs(semesterId, courseId).find((item) => item.sectionId === sectionId);
    if (job) return job.status;
    return "idle";
  }

  private embeddingProvider(): ModelProviderConfig | undefined {
    return this.options.providers.embeddingProvider();
  }

  private refreshIndexingJobs(): IndexingJob[] {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    return semesterId ? this.options.businessStore.listIndexingJobs(semesterId) : [];
  }

  private async deleteRagChunksForFile(fileId: string): Promise<void> {
    try {
      await this.options.ragIndex.deleteChunksByFile(fileId);
    } catch (error) {
      console.warn(`[rag] Failed to delete chunks for file ${fileId}`, error);
    }
  }

  private safeRm(path: string, message: string): void {
    if (!existsSync(path)) return;
    try {
      rmSync(path, { recursive: true, force: true });
    } catch (error) {
      console.warn(message, error);
    }
  }
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
