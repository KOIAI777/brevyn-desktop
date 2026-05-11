import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import mammoth from "mammoth";
import type {
  CourseFileSection,
  FileImportInput,
  FileImportResult,
  FilePreview,
  FileStats,
  IndexActiveSemesterResult,
  IndexingJob,
  ModelProviderConfig,
  RagSearchResult,
  WorkspaceFileKind,
  WorkspaceFileNode,
} from "../../types/domain";
import type { IndexingTaskInsert, IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import type { SQLiteBusinessStore } from "../storage";
import { recordCleanupFailure, type CleanupFailure } from "./cleanup-log";
import type { ProviderService } from "./provider-service";
import type { RagIndexService, RagSearchOptions } from "./rag-index-service";
import {
  cloneFile,
  cloneFiles,
  ensureCourseFolderInTree,
  ensureFolderChild,
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
  taskBucketLabel,
  taskWorkspaceDirForTask,
  taskTypeLabel,
} from "./workspace-paths";
import {
  activeCourseScopeOrThrow,
  archivedCourseIdsForSemester,
  currentActiveSemester,
  currentActiveSemesterId,
  isCourseArchived,
  isCurrentSemesterArchived,
  taskInCourseOrThrow,
} from "./workspace-state";

const now = () => new Date().toISOString();
const INDEXING_INGEST_LOCK_MS = 5 * 60_000;
const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

export interface FileServiceOptions {
  rootDataDir: string;
  businessStore: SQLiteBusinessStore;
  providers: ProviderService;
  ragIndex: RagIndexService;
}

export class FileService {
  constructor(private readonly options: FileServiceOptions) {}

  async searchRag(query: string, courseId?: string, options: RagSearchOptions & { limit?: number } = {}): Promise<RagSearchResult[]> {
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
        options.limit,
        archivedCourseIds,
        options,
      );
    } catch (error) {
      console.warn("[rag] Search failed", error);
      throw error;
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

  async previewFile(fileId: string): Promise<FilePreview | null> {
    const { file, semesterId } = this.guardFileAccess(fileId, "accessing");
    if (file.kind === "folder") return null;
    this.assertFileSourceInsideWorkspace(file, semesterId);
    const fileUrl = file.sourcePath && existsSync(file.sourcePath) ? pathToFileURL(file.sourcePath).toString() : undefined;
    const common = {
      id: file.id,
      title: file.name,
      path: file.path,
      kind: file.kind,
      fileUrl,
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
        summary: fileUrl ? "Previewing the original PDF file from this workspace." : "PDF source is not available for preview.",
      };
    }
    if (file.kind === "pptx") {
      const extracted = await previewPptxText(file.sourcePath);
      return {
        ...common,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        summary: extracted.summary,
        content: extracted.content,
        pages: extracted.pages,
      };
    }
    if (file.kind === "docx") {
      const extracted = await previewDocxHtml(file.sourcePath);
      return {
        ...common,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        summary: extracted.summary,
        content: extracted.content,
        html: extracted.html,
      };
    }
    if (file.kind === "image") {
      return {
        ...common,
        mimeType: "image/png",
        summary: fileUrl ? "Previewing the original image file from this workspace." : "Image source is not available for preview.",
      };
    }
    return {
      ...common,
      summary: "Preview not available for this file type yet.",
    };
  }

  async importFiles(input: FileImportInput): Promise<FileImportResult> {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    activeCourseScopeOrThrow(this.options.businessStore, input.courseId, semesterId);
    const sourcePaths = input.sourcePaths || [];
    if (sourcePaths.length === 0) {
      return { files: [], tree: this.listFiles(input.courseId), indexingJob: null };
    }

    const importSources = await this.statImportSources(sourcePaths);
    const timestamp = now();
    const roots = this.writableCourseRoots(input.courseId, semesterId);
    const root = roots[0];
    if (!root) throw new Error("Course file tree is not available.");
    const task = input.targetSection === "task" ? taskInCourseOrThrow(this.options.businessStore, input.taskId, input.courseId, semesterId) : undefined;
    const targetFolder = ensureTargetFolderInTree(root, input, task, timestamp);
    const managedTargetDir = this.ensureImportTargetDir(input);
    const copiedPaths: string[] = [];
    try {
      const importedFiles: WorkspaceFileNode[] = [];
      for (const source of importSources) {
        const sourcePath = source.sourcePath;
        const managedPath = uniqueFilePath(managedTargetDir, basename(sourcePath));
        await copyFile(sourcePath, managedPath);
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
          sizeLabel: formatSize(source.size),
          updatedAt: timestamp,
        };
        targetFolder.children = [...(targetFolder.children || []), file];
        importedFiles.push(file);
      }

      this.persistWorkspaceFilesForCourse(input.courseId, roots, semesterId);
      const sectionId = this.sectionIdForImport(input);
      let indexingJob: IndexingJob | null = null;
      let indexingError: string | undefined;
      try {
        indexingJob = this.indexCourseFiles(input.courseId, sectionId);
      } catch (error) {
        indexingError = errorMessage(error);
        console.warn("[indexing] Failed to create indexing job after import", error);
      }
      return {
        files: cloneFiles(importedFiles),
        tree: this.listFiles(input.courseId),
        indexingJob,
        indexingError,
      };
    } catch (error) {
      for (const copiedPath of copiedPaths) this.safeRm(copiedPath, `[files] Failed to clean copied file ${copiedPath}`);
      throw error;
    }
  }

  fileSourcePath(fileId: string): string | undefined {
    const { file, semesterId } = this.guardFileAccess(fileId, "accessing");
    this.assertFileSourceInsideWorkspace(file, semesterId);
    return file.sourcePath;
  }

  async renameFile(fileId: string, nextName: string): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    const { file, semesterId } = this.guardFileAccess(fileId, "renaming");
    const sourcePath = this.mutableSourcePath(file, semesterId, "rename");
    if (file.kind !== "folder" && this.options.businessStore.hasActiveFileIndexing(fileId)) {
      throw new Error("Wait for indexing to finish before renaming this file.");
    }
    const safeName = sanitizeFsSegment(nextName);
    if (safeName !== nextName.trim()) throw new Error("File name contains unsupported characters.");
    const targetPath = join(dirname(sourcePath), safeName);
    if (targetPath === sourcePath) return { courseId: file.courseId, tree: this.listFiles(file.courseId) };
    if (existsSync(targetPath)) throw new Error(`"${safeName}" already exists.`);
    renameSync(sourcePath, targetPath);
    if (file.kind !== "folder") await this.deleteRagChunksForFile(fileId);
    this.syncManagedDiskFiles(file.courseId, semesterId);
    return { courseId: file.courseId, tree: this.listFiles(file.courseId) };
  }

  async deleteFile(fileId: string): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    const { file, semesterId } = this.guardFileAccess(fileId, "deleting");
    if (file.kind !== "folder" && this.options.businessStore.hasActiveFileIndexing(fileId)) {
      throw new Error("Wait for indexing to finish before deleting this file.");
    }
    const courseId = file.courseId;
    const sourcePath = this.mutableSourcePath(file, semesterId, "delete");

    const roots = this.loadCourseRoots(courseId, semesterId);
    removeFileFromTree(roots, fileId);
    this.persistWorkspaceFilesForCourse(courseId, roots, semesterId);

    if (sourcePath && existsSync(sourcePath)) {
      this.safeRm(sourcePath, `[files] Failed to remove source ${sourcePath}`, {
        scope: "file",
        operation: "delete_file_source",
        targetId: fileId,
        path: sourcePath,
      });
    }
    await this.deleteRagChunksForFile(fileId);
    return { courseId, tree: this.listFiles(courseId) };
  }

  private mutableSourcePath(file: WorkspaceFileNode, semesterId: string, operation: "delete" | "rename"): string {
    if (!file.sourcePath) throw new Error(`This workspace folder is managed by Brevyn and cannot be ${operation === "delete" ? "deleted" : "renamed"} here.`);
    if (!existsSync(file.sourcePath)) throw new Error("File source path not available.");
    const allowedRoot = file.courseId === SEMESTER_HOME_COURSE_ID
      ? join(semesterWorkspaceDir(this.options.rootDataDir, semesterId), "Semester shared")
      : courseWorkspaceDir(this.options.rootDataDir, semesterId, file.courseId);
    this.assertFileSourceInsideWorkspace(file, semesterId, allowedRoot);
    return file.sourcePath;
  }

  private guardFileAccess(fileId: string, operation: string): { file: WorkspaceFileNode; semesterId: string } {
    const file = this.options.businessStore.getWorkspaceFile(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId || file.semesterId !== semesterId) {
      throw new Error(`Select this file's semester before ${operation} it.`);
    }
    activeCourseScopeOrThrow(this.options.businessStore, file.courseId, semesterId);
    return { file, semesterId };
  }

  private assertFileSourceInsideWorkspace(file: WorkspaceFileNode, semesterId: string, allowedRoot = this.allowedSourceRoot(file.courseId, semesterId)): void {
    if (file.sourcePath && existsSync(file.sourcePath) && !isPathInside(file.sourcePath, allowedRoot)) {
      throw new Error(`Refusing to access file outside the workspace: ${file.sourcePath}`);
    }
  }

  private allowedSourceRoot(courseId: string, semesterId: string): string {
    return courseId === SEMESTER_HOME_COURSE_ID
      ? join(semesterWorkspaceDir(this.options.rootDataDir, semesterId), "Semester shared")
      : courseWorkspaceDir(this.options.rootDataDir, semesterId, courseId);
  }

  private async statImportSources(sourcePaths: string[]): Promise<Array<{ sourcePath: string; size: number }>> {
    const sources: Array<{ sourcePath: string; size: number }> = [];
    for (const sourcePath of sourcePaths) {
      const stats = await stat(sourcePath);
      if (!stats.isFile()) {
        throw new Error(`"${basename(sourcePath)}" is not a regular file.`);
      }
      if (stats.size > MAX_IMPORT_FILE_BYTES) {
        throw new Error(`"${basename(sourcePath)}" is ${formatSize(stats.size)}. File imports are limited to ${formatSize(MAX_IMPORT_FILE_BYTES)} per file.`);
      }
      sources.push({ sourcePath, size: stats.size });
    }
    return sources;
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
    const lectureSection: CourseFileSection = {
      id: `${courseId}:lecture`,
      courseId,
      kind: "lecture",
      title: "Lecture",
      indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:lecture`),
      embeddingModel,
      files: lectureFiles,
    };
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
      lectureSection,
      ...taskSections,
    ];
  }

  indexCourseFiles(courseId: string, sectionId?: string): IndexingJob {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("Select a semester before indexing files.");
    activeCourseScopeOrThrow(this.options.businessStore, courseId, semesterId);
    const activeJob = this.options.businessStore.activeIndexingJobForSection(semesterId, courseId, sectionId);
    if (activeJob) return { ...activeJob };
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

  async reindexCourseFiles(courseId: string, sectionId?: string): Promise<IndexingJob> {
    await this.options.ragIndex.rebuildOutdatedSchemaForExplicitReindex();
    return this.indexCourseFiles(courseId, sectionId);
  }

  async indexActiveSemesterCourses(): Promise<IndexActiveSemesterResult> {
    await this.options.ragIndex.rebuildOutdatedSchemaForExplicitReindex();
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("Select a semester before indexing files.");
    const courses = new Map<string, string>([[SEMESTER_HOME_COURSE_ID, "Home"]]);
    for (const course of this.options.businessStore.listCourses(semesterId)) {
      if (course.id !== SEMESTER_HOME_COURSE_ID && !course.archivedAt) courses.set(course.id, course.name || course.code || course.id);
    }
    const jobs: IndexingJob[] = [];
    const failures: IndexActiveSemesterResult["failures"] = [];
    for (const [courseId, courseName] of courses) {
      try {
        jobs.push(this.indexCourseFiles(courseId));
      } catch (error) {
        failures.push({ courseId, courseName, message: errorMessage(error) });
      }
    }
    return { jobs, failures };
  }

  listIndexingJobs(courseId?: string): IndexingJob[] {
    if (isCurrentSemesterArchived(this.options.businessStore)) return [];
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return [];
    const archivedCourseIds = new Set(archivedCourseIdsForSemester(this.options.businessStore, semesterId));
    return latestIndexingJobsByScope(this.options.businessStore.listIndexingJobs(semesterId, courseId).filter((job) => !archivedCourseIds.has(job.courseId)));
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    const job = this.options.businessStore.cancelIndexingJob(jobId);
    return job ? { ...job } : null;
  }

  claimNextIndexingTask(workerId: string, lockMs: number): IndexingTaskRecord | null {
    return this.options.businessStore.claimNextIndexingTask(workerId, lockMs);
  }

  recoverExpiredIndexingTasks(currentWorkerId?: string): void {
    this.options.businessStore.recoverExpiredIndexingTasks(currentWorkerId);
  }

  async completeIndexingTask(taskId: string, result: IndexingWorkerResult, workerId?: string, lockedUntil?: string): Promise<IndexingJob | null> {
    let task = this.options.businessStore.getIndexingTask(taskId);
    if (!task) return null;
    let lease = workerId ? { workerId, lockedUntil } : undefined;
    if (lease && (task.status !== "running" || task.lockedBy !== lease.workerId || task.lockedUntil !== lease.lockedUntil)) {
      return this.options.businessStore.getIndexingJob(task.jobId);
    }
    const job = this.options.businessStore.getIndexingJob(task.jobId);
    if (job?.status === "cancelled") {
      return this.options.businessStore.completeIndexingTask(taskId, result, lease);
    }
    if (lease) {
      const extendedTask = this.options.businessStore.extendIndexingTaskLease(taskId, lease, INDEXING_INGEST_LOCK_MS);
      if (!extendedTask?.lockedBy || !extendedTask.lockedUntil) return this.options.businessStore.getIndexingJob(task.jobId);
      task = extendedTask;
      lease = { workerId: extendedTask.lockedBy, lockedUntil: extendedTask.lockedUntil };
    }
    const leaseCurrent = () => !lease || this.options.businessStore.isIndexingTaskLeaseCurrent(taskId, lease);
    let ingested: boolean;
    try {
      ingested = await this.options.ragIndex.ingestTask(task, result, leaseCurrent);
    } catch (error) {
      return this.options.businessStore.failIndexingTask(taskId, errorMessage(error), lease);
    }
    if (!ingested || !leaseCurrent()) return this.options.businessStore.getIndexingJob(task.jobId);
    return this.options.businessStore.completeIndexingTask(taskId, result, lease);
  }

  failIndexingTask(taskId: string, message: string, workerId?: string, lockedUntil?: string): IndexingJob | null {
    return this.options.businessStore.failIndexingTask(taskId, message, workerId ? { workerId, lockedUntil } : undefined);
  }

  syncActiveSemesterDiskFiles(): boolean {
    if (isCurrentSemesterArchived(this.options.businessStore)) return false;
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return false;
    let changed = this.syncManagedDiskFiles(SEMESTER_HOME_COURSE_ID, semesterId);
    for (const course of this.options.businessStore.listCourses(semesterId)) {
      if (course.id === SEMESTER_HOME_COURSE_ID || course.archivedAt) continue;
      changed = this.syncManagedDiskFiles(course.id, semesterId) || changed;
    }
    return changed;
  }

  private viewCourseRoots(courseId: string, semesterId: string): WorkspaceFileNode[] {
    const roots = this.loadCourseRoots(courseId, semesterId);
    const semester = this.options.businessStore.getSemester(semesterId);
    const course = courseId === SEMESTER_HOME_COURSE_ID ? undefined : this.options.businessStore.getCourse(courseId);
    if (!semester || (courseId !== SEMESTER_HOME_COURSE_ID && (!course || course.semesterId !== semesterId))) return [];
    return roots;
  }

  private writableCourseRoots(courseId: string, semesterId: string): WorkspaceFileNode[] {
    const roots = this.loadCourseRoots(courseId, semesterId);
    const semester = this.options.businessStore.getSemester(semesterId);
    const course = courseId === SEMESTER_HOME_COURSE_ID ? undefined : this.options.businessStore.getCourse(courseId);
    if (!semester || (courseId !== SEMESTER_HOME_COURSE_ID && (!course || course.semesterId !== semesterId))) return [];
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

  private syncManagedDiskFiles(courseId: string, semesterId: string): boolean {
    const roots = this.writableCourseRoots(courseId, semesterId);
    const root = roots[0];
    if (!root) return false;
    const before = JSON.stringify(roots);
    const timestamp = now();
    let changed = false;

    if (courseId === SEMESTER_HOME_COURSE_ID) {
      const sharedFolder = ensureTargetFolderInTree(root, { courseId, targetSection: "course_shared" }, undefined, timestamp);
      changed = this.syncDiskFolder(sharedFolder, join(semesterWorkspaceDir(this.options.rootDataDir, semesterId), "Semester shared"), {
        courseId,
        sectionKind: "course_shared",
      }, timestamp) || changed;
    } else {
      const courseDir = courseWorkspaceDir(this.options.rootDataDir, semesterId, courseId);
      changed = this.syncDiskFolder(
        ensureTargetFolderInTree(root, { courseId, targetSection: "course_shared" }, undefined, timestamp),
        join(courseDir, "Course shared"),
        { courseId, sectionKind: "course_shared" },
        timestamp,
      ) || changed;
      changed = this.syncDiskFolder(
        ensureTargetFolderInTree(root, { courseId, targetSection: "lecture" }, undefined, timestamp),
        join(courseDir, "Lecture"),
        { courseId, sectionKind: "lecture" },
        timestamp,
      ) || changed;
      for (const task of this.options.businessStore.listTasks(semesterId, courseId)) {
        const taskDir = taskWorkspaceDirForTask(courseDir, task);
        for (const bucket of ["materials", "drafts", "submitted"] as const) {
          const bucketFolder = ensureTargetFolderInTree(root, {
            courseId,
            targetSection: "task",
            taskId: task.id,
            taskFileBucket: bucket,
          }, task, timestamp);
          changed = this.syncDiskFolder(bucketFolder, join(taskDir, taskBucketLabel(bucket)), {
            courseId,
            taskId: task.id,
            taskType: task.taskType,
            taskFileBucket: bucket,
            sectionKind: "task",
          }, timestamp) || changed;
        }
      }
    }

    changed = changed || before !== JSON.stringify(roots);
    if (changed) this.persistWorkspaceFilesForCourse(courseId, roots, semesterId);
    return changed;
  }

  private syncDiskFolder(
    parent: WorkspaceFileNode,
    dir: string,
    metadata: Pick<WorkspaceFileNode, "courseId" | "taskId" | "taskType" | "taskFileBucket" | "sectionKind">,
    timestamp: string,
  ): boolean {
    if (!existsSync(dir)) return false;
    let changed = false;
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const visibleEntries = entries
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
    const visibleNames = new Set(visibleEntries.map((entry) => entry.name));
    parent.children ||= [];
    for (let index = parent.children.length - 1; index >= 0; index -= 1) {
      const child = parent.children[index];
      if (!visibleNames.has(child.name)) {
        parent.children.splice(index, 1);
        changed = true;
      }
    }
    for (const entry of visibleEntries) {
      if (entry.name.startsWith(".")) continue;
      const sourcePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const childCount = parent.children.length;
        const folder = ensureFolderChild(parent, entry.name, { ...metadata, sourcePath }, timestamp);
        changed = parent.children.length !== childCount || this.syncDiskFolder(folder, sourcePath, metadata, timestamp) || changed;
        continue;
      }
      if (!entry.isFile()) continue;
      let size = 0;
      let updatedAt = timestamp;
      try {
        const stats = statSync(sourcePath);
        size = stats.size;
        updatedAt = stats.mtime.toISOString();
      } catch {
        // Best effort: if stat races with an external write, keep the file visible and let preview handle errors.
      }
      const existing = parent.children.find((child) => child.kind !== "folder" && (child.sourcePath === sourcePath || child.name === entry.name));
      const next = {
        semesterId: parent.semesterId,
        ...metadata,
        sourcePath,
        name: entry.name,
        path: `${parent.path}/${entry.name}`,
        kind: kindForPath(sourcePath),
        sizeLabel: formatSize(size),
        updatedAt,
      };
      if (existing) {
        const before = JSON.stringify(existing);
        Object.assign(existing, next);
        changed = before !== JSON.stringify(existing) || changed;
      } else {
        parent.children.push({
          id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          ...next,
        });
        changed = true;
      }
    }
    return changed;
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
      recordCleanupFailure(this.options.rootDataDir, {
        scope: "rag",
        operation: "delete_chunks_by_file",
        targetId: fileId,
        message: errorMessage(error),
      });
    }
  }

  private safeRm(path: string, message: string, failure?: Omit<CleanupFailure, "message">): void {
    if (!existsSync(path)) return;
    try {
      rmSync(path, { recursive: true, force: true });
    } catch (error) {
      console.warn(message, error);
      if (failure) {
        recordCleanupFailure(this.options.rootDataDir, {
          ...failure,
          message: errorMessage(error),
        });
      }
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

async function previewDocxHtml(sourcePath?: string): Promise<{ summary: string; content: string; html?: string }> {
  if (!sourcePath || !existsSync(sourcePath)) {
    return { summary: "DOCX source is not available for preview.", content: "" };
  }
  if (extname(sourcePath).toLowerCase() === ".doc") {
    return {
      summary: "Legacy .doc files need to be opened in Word/WPS/Office for full preview.",
      content: "",
    };
  }
  try {
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ path: sourcePath }, {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
        ],
      }),
      mammoth.extractRawText({ path: sourcePath }),
    ]);
    const warning = [...htmlResult.messages, ...textResult.messages].map((message) => message.message).filter(Boolean).join("; ");
    const html = htmlResult.value.trim();
    return {
      summary: warning ? `Rendered DOCX as HTML. ${warning}` : "Rendered DOCX as an HTML document preview.",
      content: truncatePreviewText(normalizePreviewText(textResult.value), 24000) || "(No extractable text found.)",
      html: html || undefined,
    };
  } catch (error) {
    return {
      summary: `DOCX preview failed: ${errorMessage(error)}`,
      content: "",
    };
  }
}

async function previewPptxText(sourcePath?: string): Promise<{ summary: string; content: string; pages?: string[] }> {
  if (!sourcePath || !existsSync(sourcePath)) {
    return { summary: "PPTX source is not available for preview.", content: "" };
  }
  if (extname(sourcePath).toLowerCase() === ".ppt") {
    return {
      summary: "Legacy .ppt files need to be opened in PowerPoint/WPS/Office for full preview.",
      content: "",
    };
  }
  try {
    const zip = await JSZip.loadAsync(readFileSync(sourcePath));
    const slideFiles = Object.values(zip.files)
      .filter((file) => !file.dir && /^ppt\/slides\/slide\d+\.xml$/.test(file.name))
      .sort((a, b) => numberFromXmlPath(a.name) - numberFromXmlPath(b.name));
    const pages: string[] = [];
    for (const file of slideFiles) {
      const text = extractPptxPreviewText(await file.async("string"));
      pages.push(text || "(No text on this slide.)");
    }
    const content = pages.map((page, index) => `Slide ${index + 1}\n${page}`).join("\n\n");
    return {
      summary: `Extracted text from ${slideFiles.length} slide${slideFiles.length === 1 ? "" : "s"}.`,
      content: truncatePreviewText(content, 24000) || "(No extractable slide text found.)",
      pages,
    };
  } catch (error) {
    return {
      summary: `PPTX preview failed: ${errorMessage(error)}`,
      content: "",
    };
  }
}

function extractPptxPreviewText(xml: string): string {
  const fragments: string[] = [];
  const tagPattern = /<(?:a|m):t\b[^>]*>([\s\S]*?)<\/(?:a|m):t>/g;
  for (const match of xml.matchAll(tagPattern)) {
    const value = decodePreviewXml(match[1] || "").trim();
    if (value) fragments.push(value);
  }
  return normalizePreviewText(fragments.join("\n"));
}

function decodePreviewXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizePreviewText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function numberFromXmlPath(path: string): number {
  const match = path.match(/(\d+)(?=\.xml$)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function latestIndexingJobsByScope(jobs: IndexingJob[]): IndexingJob[] {
  const latest = new Map<string, IndexingJob>();
  for (const job of jobs) {
    const key = job.sectionId || `course:${job.courseId}:all`;
    const current = latest.get(key);
    if (!current || Date.parse(job.updatedAt) > Date.parse(current.updatedAt)) {
      latest.set(key, job);
    }
  }
  return Array.from(latest.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown cleanup failure");
}
