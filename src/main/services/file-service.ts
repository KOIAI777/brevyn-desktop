import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { posix as pathPosix } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
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
  removeTaskFromTree,
} from "./workspace-file-tree";
import {
  SEMESTER_HOME_COURSE_ID,
  courseWorkspaceDir,
  ensureSemesterSharedDirs,
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

const require = createRequire(__filename);
const now = () => new Date().toISOString();
const INDEXING_INGEST_LOCK_MS = 5 * 60_000;
const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PREVIEW_FILE_BYTES = 50 * 1024 * 1024;
const PREVIEW_CACHE_DIR = ".preview-cache";
export const WORKSPACE_FILE_PREVIEW_PROTOCOL = "brevyn-file";

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
      const visibleCourseRoots = cloneFiles(courseRoots);
      this.hideArchivedTaskNodes(visibleCourseRoots, semesterId);
      return [
        {
          ...semesterClone,
          children: [...(semesterClone.children || []), ...visibleCourseRoots],
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
        spreadsheet: 0,
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
    return this.previewSourcePath({
      id: file.id,
      title: file.name,
      displayPath: file.path,
      sourcePath: file.sourcePath,
      kind: file.kind,
      metadata: {
        size: file.sizeLabel || "unknown",
        updated: file.updatedAt,
        courseId: file.courseId,
      },
    });
  }

  async previewWorkspacePath(sourcePath: string, displayPath = sourcePath): Promise<FilePreview | null> {
    if (!existsSync(sourcePath) || statSync(sourcePath).isDirectory()) return null;
    return this.previewSourcePath({
      id: sourcePath,
      title: basename(sourcePath),
      displayPath,
      sourcePath,
      kind: kindForPath(sourcePath),
      metadata: {
        size: formatSize(statSync(sourcePath).size),
        updated: statSync(sourcePath).mtime.toISOString(),
      },
    });
  }

  private async previewSourcePath(input: {
    id: string;
    title: string;
    displayPath: string;
    sourcePath?: string;
    kind: WorkspaceFileKind;
    metadata: Record<string, string | number | boolean>;
  }): Promise<FilePreview> {
    const fileUrl = input.sourcePath && existsSync(input.sourcePath) ? workspaceFilePreviewUrl(input.sourcePath) : undefined;
    const common = {
      id: input.id,
      title: input.title,
      path: input.displayPath,
      sourcePath: input.sourcePath,
      kind: input.kind,
      fileUrl,
      metadata: input.metadata,
    };
    if (input.kind === "markdown") {
      const content = readPreviewSource(input.sourcePath);
      return {
        ...common,
        mimeType: "text/markdown",
        summary: "Loaded from a Markdown source file.",
        content: content || `# ${input.title.replace(/\.md$/i, "")}\n\n（没有可用内容。）`,
      };
    }
    if (input.kind === "code") {
      const content = readPreviewSource(input.sourcePath);
      return {
        ...common,
        mimeType: "text/typescript",
        summary: "已从代码源文件加载。",
        content: content || `// 没有可用的代码内容。`,
      };
    }
    if (input.kind === "text") {
      const content = readPreviewSource(input.sourcePath);
      return {
        ...common,
        mimeType: "text/plain",
        summary: "已从文本源文件加载。",
        content: content || "（没有可用的文本内容。）",
      };
    }
    if (input.kind === "pdf") {
      const preview = preparePdfCanvasPreview(this.options.rootDataDir, input.sourcePath, input.title);
      return {
        ...common,
        mimeType: "application/pdf",
        previewUrl: preview.previewUrl,
        summary: preview.summary,
      };
    }
    if (input.kind === "pptx") {
      const extracted = await previewPptxHtml(input.sourcePath);
      return {
        ...common,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        summary: extracted.summary,
        content: extracted.content,
        html: extracted.html,
      };
    }
    if (input.kind === "docx") {
      const extracted = await previewDocxHtml(input.sourcePath);
      return {
        ...common,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        summary: extracted.summary,
        content: extracted.content,
        html: extracted.html,
      };
    }
    if (input.kind === "spreadsheet") {
      const extracted = previewSpreadsheetHtml(input.sourcePath);
      return {
        ...common,
        mimeType: spreadsheetMimeType(input.sourcePath),
        summary: extracted.summary,
        content: extracted.content,
        html: extracted.html,
      };
    }
    if (input.kind === "image") {
      return {
        ...common,
        mimeType: "image/png",
        summary: fileUrl ? "正在预览工作区中的原始图片文件。" : "图片源文件不可用于预览。",
      };
    }
    return {
      ...common,
      summary: "暂不支持预览此文件类型。",
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
    if (!root) throw new Error("课程文件树不可用。");
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
    if (!existsSync(file.sourcePath)) throw new Error("文件源路径不可用。");
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
    if (!semesterId) throw new Error("请先选择学期，再索引文件。");
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
      error = "这个分区没有可用于索引的本地源文件。";
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
    if (!semesterId) throw new Error("请先选择学期，再索引文件。");
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
    if (courseId === SEMESTER_HOME_COURSE_ID) ensureSemesterSharedDirs(this.options.rootDataDir, semesterId);
    const before = JSON.stringify(roots);
    ensureCourseFolderInTree({
      roots,
      courseId,
      semester,
      course,
      tasks: courseId === SEMESTER_HOME_COURSE_ID ? [] : this.options.businessStore.listTasks(semesterId, courseId),
      timestamp: now(),
    });
    if (before !== JSON.stringify(roots)) this.persistWorkspaceFilesForCourse(courseId, roots, semesterId);
    this.hideArchivedTaskNodes(roots, semesterId, courseId);
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

  private hideArchivedTaskNodes(roots: WorkspaceFileNode[], semesterId: string, courseId?: string): void {
    const courseIds = courseId
      ? [courseId]
      : Array.from(new Set(roots.map((root) => root.courseId).filter((id): id is string => Boolean(id && id !== SEMESTER_HOME_COURSE_ID))));
    for (const id of courseIds) {
      for (const task of this.options.businessStore.listArchivedTasks(semesterId, id)) {
        removeTaskFromTree(roots, task.id);
      }
    }
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
  return `${value.slice(0, maxLength)}\n\n[已截断至 ${maxLength} 个字符]`;
}

async function previewDocxHtml(sourcePath?: string): Promise<{ summary: string; content: string; html?: string }> {
  if (!sourcePath || !existsSync(sourcePath)) {
    return { summary: "DOCX 源文件不可用于预览。", content: "" };
  }
  if (extname(sourcePath).toLowerCase() === ".doc") {
    return {
      summary: "旧版 .doc 文件需要用 Word/WPS/Office 打开才能完整预览。",
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
      summary: warning ? `已将 DOCX 渲染为 HTML。${warning}` : "已将 DOCX 渲染为 HTML 文档预览。",
      content: truncatePreviewText(normalizePreviewText(textResult.value), 24000) || "（未找到可提取文本。）",
      html: html || undefined,
    };
  } catch (error) {
    return {
      summary: `DOCX 预览失败：${errorMessage(error)}`,
      content: "",
    };
  }
}

function preparePdfCanvasPreview(rootDataDir: string, sourcePath?: string, title = "PDF"): { summary: string; previewUrl?: string } {
  if (!sourcePath || !existsSync(sourcePath)) {
    return { summary: "PDF 源文件不可用于预览。" };
  }
  try {
    const stats = statSync(sourcePath);
    if (stats.size > MAX_PREVIEW_FILE_BYTES) {
      return { summary: `PDF 文件过大（${formatSize(stats.size)}），请用外部应用打开。` };
    }
    const assets = ensurePdfPreviewAssets(rootDataDir);
    const html = pdfCanvasPreviewDocument({
      title,
      fileUrl: workspaceFilePreviewUrl(sourcePath),
      pdfScriptUrl: workspaceFilePreviewUrl(assets.pdfScriptPath),
      pdfWorkerUrl: workspaceFilePreviewUrl(assets.pdfWorkerPath),
      standardFontDataUrl: `${workspaceFilePreviewUrl(assets.standardFontsDir)}/`,
    });
    return {
      summary: "已生成 PDF 画布预览。",
      previewUrl: writePreviewHtml(rootDataDir, html),
    };
  } catch (error) {
    return {
      summary: `PDF 预览失败：${errorMessage(error)}`,
    };
  }
}

function ensurePdfPreviewAssets(rootDataDir: string): { pdfScriptPath: string; pdfWorkerPath: string; standardFontsDir: string } {
  const assetsDir = join(rootDataDir, PREVIEW_CACHE_DIR, "pdfjs");
  const standardFontsDir = join(assetsDir, "standard_fonts");
  const bundledAssetsDir = join(__dirname, "pdfjs");
  mkdirSync(assetsDir, { recursive: true });
  const pdfScriptPath = join(assetsDir, "pdf.min.mjs");
  const pdfWorkerPath = join(assetsDir, "pdf.worker.min.mjs");
  if (!existsSync(pdfScriptPath)) copyFileSync(resolvePdfPreviewAsset(bundledAssetsDir, "pdf.min.mjs", "pdfjs-dist/build/pdf.min.mjs"), pdfScriptPath);
  if (!existsSync(pdfWorkerPath)) copyFileSync(resolvePdfPreviewAsset(bundledAssetsDir, "pdf.worker.min.mjs", "pdfjs-dist/build/pdf.worker.min.mjs"), pdfWorkerPath);
  if (!existsSync(standardFontsDir)) {
    const bundledFontsDir = join(bundledAssetsDir, "standard_fonts");
    const sourceFontsDir = existsSync(bundledFontsDir)
      ? bundledFontsDir
      : join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts");
    cpSync(sourceFontsDir, standardFontsDir, { recursive: true });
  }
  return { pdfScriptPath, pdfWorkerPath, standardFontsDir };
}

function resolvePdfPreviewAsset(bundledAssetsDir: string, bundledName: string, packagePath: string): string {
  const bundledPath = join(bundledAssetsDir, bundledName);
  return existsSync(bundledPath) ? bundledPath : require.resolve(packagePath);
}

function writePreviewHtml(rootDataDir: string, html: string): string {
  const previewDir = join(rootDataDir, PREVIEW_CACHE_DIR, "html");
  mkdirSync(previewDir, { recursive: true });
  const hash = createHash("sha256").update(html).digest("hex").slice(0, 20);
  const htmlPath = join(previewDir, `preview-${hash}.html`);
  if (!existsSync(htmlPath)) writeFileSync(htmlPath, html, "utf8");
  return workspaceFilePreviewUrl(htmlPath);
}

function pdfCanvasPreviewDocument(input: {
  title: string;
  fileUrl: string;
  pdfScriptUrl: string;
  pdfWorkerUrl: string;
  standardFontDataUrl: string;
}): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapePreviewHtml(input.title)}</title>
    <style>
      * { box-sizing: border-box; }
      :root { color-scheme: light; font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif; background: #f5f2ec; color: #1f2933; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 18% 0%, rgba(255,255,255,.92), transparent 28rem), #f5f2ec; }
      .toolbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid rgba(31,41,51,.1); background: rgba(250,248,242,.86); backdrop-filter: blur(14px); }
      .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 650; }
      .controls { display: flex; align-items: center; gap: 6px; color: #667085; font-size: 11px; }
      button { height: 26px; min-width: 28px; border: 1px solid rgba(31,41,51,.14); border-radius: 8px; background: #fffdf8; color: #1f2933; font: inherit; cursor: pointer; }
      button:hover { background: #f0ebe2; }
      #pages { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 16px; min-width: 100%; }
      canvas { display: block; max-width: none; border-radius: 4px; background: white; box-shadow: 0 18px 48px rgba(31,41,51,.16), 0 1px 0 rgba(31,41,51,.08); }
      .loading, .error, .page-info { width: 100%; padding: 34px 18px; text-align: center; color: #667085; font-size: 12px; line-height: 1.6; }
      .error { color: #b42318; }
      .page-info { padding-top: 0; font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div class="title">${escapePreviewHtml(input.title)}</div>
      <div class="controls">
        <button id="zoomOut" title="缩小">-</button>
        <span id="zoom">100%</span>
        <button id="zoomIn" title="放大">+</button>
      </div>
    </div>
    <main id="pages"><div class="loading">正在加载 PDF...</div></main>
    <script type="module">
      const pages = document.getElementById("pages");
      const zoomLabel = document.getElementById("zoom");
      const steps = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      let stepIndex = 2;
      let pdfDoc = null;
      function setZoomLabel() { zoomLabel.textContent = Math.round(steps[stepIndex] * 100) + "%"; }
      async function renderAll() {
        if (!pdfDoc) return;
        pages.innerHTML = "";
        const dpr = window.devicePixelRatio || 1;
        const scale = steps[stepIndex];
        for (let index = 1; index <= pdfDoc.numPages; index += 1) {
          const page = await pdfDoc.getPage(index);
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = (viewport.width / dpr) + "px";
          canvas.style.height = (viewport.height / dpr) + "px";
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          pages.appendChild(canvas);
        }
        const info = document.createElement("div");
        info.className = "page-info";
        info.textContent = "共 " + pdfDoc.numPages + " 页";
        pages.appendChild(info);
        setZoomLabel();
      }
      document.getElementById("zoomOut").addEventListener("click", () => {
        if (stepIndex <= 0) return;
        stepIndex -= 1;
        void renderAll();
      });
      document.getElementById("zoomIn").addEventListener("click", () => {
        if (stepIndex >= steps.length - 1) return;
        stepIndex += 1;
        void renderAll();
      });
      try {
        const pdfjsLib = await import(${JSON.stringify(input.pdfScriptUrl)});
        pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(input.pdfWorkerUrl)};
        pdfDoc = await pdfjsLib.getDocument({
          url: ${JSON.stringify(input.fileUrl)},
          standardFontDataUrl: ${JSON.stringify(input.standardFontDataUrl)},
        }).promise;
        await renderAll();
      } catch (error) {
        pages.innerHTML = '<div class="error">PDF 加载失败：' + (error?.message || String(error)) + '</div>';
      }
    </script>
  </body>
</html>`;
}

async function previewPptxHtml(sourcePath?: string): Promise<{ summary: string; content: string; html?: string }> {
  if (!sourcePath || !existsSync(sourcePath)) {
    return { summary: "PPTX 源文件不可用于预览。", content: "" };
  }
  if (extname(sourcePath).toLowerCase() === ".ppt") {
    return {
      summary: "旧版 .ppt 文件需要用 PowerPoint/WPS/Office 打开才能完整预览。",
      content: "",
    };
  }
  try {
    const zip = new AdmZip(sourcePath);
    const slidePaths = getPptxSlidePaths(zip);
    const visibleSlidePaths = slidePaths.slice(0, MAX_PPTX_SLIDES);
    const pages = visibleSlidePaths.map((slidePath) => getPptxSlideText(zip, slidePath).join("\n") || "（此幻灯片没有文本。）");
    const content = pages.map((page, index) => `幻灯片 ${index + 1}\n${page}`).join("\n\n");
    const truncated = slidePaths.length > visibleSlidePaths.length;
    const html = renderPptxPreviewHtml(basename(sourcePath), pages, truncated);
    return {
      summary: `已生成 ${visibleSlidePaths.length} / ${slidePaths.length} 张幻灯片的 HTML 预览。${truncated ? ` 仅显示前 ${MAX_PPTX_SLIDES} 张。` : ""}`,
      content: truncatePreviewText(content, 24000) || "（未找到可提取的幻灯片文本。）",
      html,
    };
  } catch (error) {
    return {
      summary: `PPTX 预览失败：${errorMessage(error)}`,
      content: "",
    };
  }
}

const SPREADSHEET_MAX_SHEETS = 8;
const SPREADSHEET_MAX_ROWS = 120;
const SPREADSHEET_MAX_COLUMNS = 40;
const MAX_PPTX_SLIDES = 80;

function previewSpreadsheetHtml(sourcePath?: string): { summary: string; content: string; html?: string } {
  if (!sourcePath || !existsSync(sourcePath)) {
    return { summary: "表格源文件不可用于预览。", content: "" };
  }
  try {
    const zip = new AdmZip(sourcePath);
    const workbookXml = readZipText(zip, "xl/workbook.xml");
    if (!workbookXml) throw new Error("Invalid XLSX: workbook.xml missing");

    const workbookDoc = parsePreviewXml(workbookXml);
    const relationships = parsePreviewRelationships(zip, "xl/_rels/workbook.xml.rels", "xl");
    const sharedStrings = parseXlsxSharedStrings(zip);
    const dateStyleIndexes = parseXlsxDateStyleIndexes(zip);
    const workbookSheets = getPreviewElementsByLocalName(workbookDoc, "sheet");
    const sheets = workbookSheets.slice(0, SPREADSHEET_MAX_SHEETS).flatMap((sheet, index) => {
      const name = sheet.getAttribute("name") || `Sheet ${index + 1}`;
      const relationshipId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
      const sheetPath = relationshipId ? relationships.get(relationshipId) : undefined;
      if (!sheetPath) return [];
      const parsed = parseXlsxSheetRows(zip, sheetPath, sharedStrings, dateStyleIndexes);
      const totalColumns = Math.max(...parsed.rows.map((row) => row.length), 0);
      return {
        name,
        rows: parsed.rows,
        totalRows: parsed.totalRows,
        totalColumns,
        truncated: parsed.truncatedRows || parsed.truncatedColumns,
      };
    });
    if (sheets.length === 0) throw new Error("Invalid XLSX: no worksheet data resolved");
    const truncatedWorkbook = workbookSheets.length > sheets.length;
    const content = sheets.map((sheet) => [
      `工作表：${sheet.name}`,
      ...sheet.rows.map((row) => row.map((cell) => cell == null ? "" : String(cell)).join("\t")),
    ].join("\n")).join("\n\n");
    const summary = [
      `正在预览 ${sheets.length} / ${workbookSheets.length} 个工作表。`,
      truncatedWorkbook ? `仅显示前 ${SPREADSHEET_MAX_SHEETS} 个工作表。` : "",
      "当前以 Proma 式 OOXML HTML 表格预览，不完全等同于 Excel 原始版式。",
    ].filter(Boolean).join(" ");
    return {
      summary,
      content: truncatePreviewText(content, 24000),
      html: renderSpreadsheetPreviewHtml(basename(sourcePath), sheets),
    };
  } catch (error) {
    return {
      summary: `表格预览失败：${errorMessage(error)}`,
      content: "",
    };
  }
}

function renderPptxPreviewHtml(title: string, pages: string[], truncated = false): string {
  const slides = pages.map((page, index) => {
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    const slideTitle = lines[0] || "（无标题）";
    const body = lines.length > 1
      ? `<ul>${lines.slice(1).map((line) => `<li>${escapePreviewHtml(line)}</li>`).join("")}</ul>`
      : `<div class="office-empty">这页没有更多可提取文本</div>`;
    return `<section class="office-slide"><div class="office-slide-index">幻灯片 ${index + 1}</div><h3>${escapePreviewHtml(slideTitle)}</h3>${body}</section>`;
  }).join("");
  const notice = truncated ? `<div class="office-preview-notice">仅显示前 ${MAX_PPTX_SLIDES} 张幻灯片</div>` : "";
  return `<div class="office-preview office-preview-presentation"><div class="office-preview-title">${escapePreviewHtml(title)}</div>${notice}${slides || `<div class="office-empty">这个 PPTX 没有可提取的文本内容</div>`}</div>`;
}

function renderSpreadsheetPreviewHtml(
  title: string,
  sheets: Array<{ name: string; rows: string[][]; totalRows: number; totalColumns: number; truncated: boolean }>,
): string {
  const sheetHtml = sheets.map((sheet) => {
    const columnCount = Math.max(sheet.totalColumns, ...sheet.rows.map((row) => row.length), 1);
    const visibleColumnCount = Math.min(columnCount, SPREADSHEET_MAX_COLUMNS);
    const headerCells = Array.from({ length: visibleColumnCount }, (_, index) => `<th>${spreadsheetColumnName(index)}</th>`).join("");
    const rows = sheet.rows.map((row, rowIndex) => {
      const cells = Array.from({ length: visibleColumnCount }, (_, columnIndex) => {
        const value = row[columnIndex];
        return `<td>${escapePreviewHtml(value == null ? "" : String(value))}</td>`;
      }).join("");
      return `<tr><th class="office-row-heading">${rowIndex + 1}</th>${cells}</tr>`;
    }).join("");
    const table = rows
      ? `<div class="office-table-wrap"><table><thead><tr><th></th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="office-empty">这个工作表没有可预览的数据</div>`;
    const notice = sheet.truncated ? `<div class="office-preview-notice">仅显示前 ${SPREADSHEET_MAX_ROWS} 行 × ${SPREADSHEET_MAX_COLUMNS} 列</div>` : "";
    return `<section class="office-sheet"><h3>${escapePreviewHtml(sheet.name)}</h3><div class="office-sheet-meta">${sheet.totalRows} 行 × ${sheet.totalColumns} 列</div>${notice}${table}</section>`;
  }).join("");
  return `<div class="office-preview office-preview-spreadsheet"><div class="office-preview-title">${escapePreviewHtml(title)}</div>${sheetHtml || `<div class="office-empty">这个表格没有可预览的数据</div>`}</div>`;
}

function spreadsheetColumnName(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function spreadsheetMimeType(sourcePath?: string): string {
  const extension = extname(sourcePath || "").toLowerCase();
  if (extension === ".csv") return "text/csv";
  if (extension === ".tsv") return "text/tab-separated-values";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function parsePreviewXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function getPreviewElementsByLocalName(root: Node, localName: string): Element[] {
  const result: Element[] = [];
  function walk(node: Node): void {
    const children = node.childNodes;
    if (!children) return;
    for (let index = 0; index < children.length; index += 1) {
      const child = children.item(index);
      if (child.nodeType === 1) {
        const element = child as Element;
        if (element.localName === localName || element.nodeName === localName) result.push(element);
      }
      walk(child);
    }
  }
  walk(root);
  return result;
}

function getPreviewDirectChildElementsByLocalName(root: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const children = root.childNodes;
  if (!children) return result;
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    if (element.localName === localName || element.nodeName === localName) result.push(element);
  }
  return result;
}

function getPreviewFirstTextByLocalName(root: Element, localName: string): string {
  return getPreviewElementsByLocalName(root, localName)[0]?.textContent || "";
}

function readZipText(zip: AdmZip, path: string): string | null {
  const entry = zip.getEntry(path);
  return entry ? entry.getData().toString("utf8") : null;
}

function normalizeZipTarget(baseDir: string, target: string): string {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (normalizedTarget.startsWith("/")) return normalizedTarget.slice(1);
  return pathPosix.normalize(pathPosix.join(baseDir, normalizedTarget));
}

function parsePreviewRelationships(zip: AdmZip, relsPath: string, baseDir: string): Map<string, string> {
  const relsXml = readZipText(zip, relsPath);
  const rels = new Map<string, string>();
  if (!relsXml) return rels;
  const relsDoc = parsePreviewXml(relsXml);
  for (const rel of getPreviewElementsByLocalName(relsDoc, "Relationship")) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target) continue;
    rels.set(id, normalizeZipTarget(baseDir, target));
  }
  return rels;
}

function parseXlsxSharedStrings(zip: AdmZip): string[] {
  const sharedXml = readZipText(zip, "xl/sharedStrings.xml");
  if (!sharedXml) return [];
  const doc = parsePreviewXml(sharedXml);
  return getPreviewElementsByLocalName(doc, "si").map((si) => (
    getPreviewElementsByLocalName(si, "t").map((node) => node.textContent || "").join("")
  ));
}

function isDateNumFmtId(numFmtId: number): boolean {
  return (
    (numFmtId >= 14 && numFmtId <= 22) ||
    (numFmtId >= 27 && numFmtId <= 36) ||
    (numFmtId >= 45 && numFmtId <= 47) ||
    (numFmtId >= 50 && numFmtId <= 58)
  );
}

function isDateFormatCode(formatCode: string): boolean {
  const normalized = formatCode
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*]/g, "")
    .toLowerCase();
  return /[ymdhHsS]/.test(normalized);
}

function parseXlsxDateStyleIndexes(zip: AdmZip): Set<number> {
  const stylesXml = readZipText(zip, "xl/styles.xml");
  const dateStyleIndexes = new Set<number>();
  if (!stylesXml) return dateStyleIndexes;

  const doc = parsePreviewXml(stylesXml);
  const customFormats = new Map<number, string>();
  for (const numFmt of getPreviewElementsByLocalName(doc, "numFmt")) {
    const id = Number(numFmt.getAttribute("numFmtId"));
    const code = numFmt.getAttribute("formatCode") || "";
    if (Number.isFinite(id) && code) customFormats.set(id, code);
  }

  const cellXfs = getPreviewElementsByLocalName(doc, "cellXfs")[0];
  if (!cellXfs) return dateStyleIndexes;

  getPreviewDirectChildElementsByLocalName(cellXfs, "xf").forEach((xf, index) => {
    const numFmtId = Number(xf.getAttribute("numFmtId"));
    if (!Number.isFinite(numFmtId)) return;
    const customFormatCode = customFormats.get(numFmtId);
    if (isDateNumFmtId(numFmtId) || (customFormatCode && isDateFormatCode(customFormatCode))) {
      dateStyleIndexes.add(index);
    }
  });
  return dateStyleIndexes;
}

function formatExcelSerialDate(rawValue: string): string {
  const serial = Number(rawValue);
  if (!Number.isFinite(serial)) return rawValue;
  const millis = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return rawValue;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 9999) return rawValue;
  const pad = (value: number) => String(value).padStart(2, "0");
  const dateText = `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const hasTime = Math.abs(serial - Math.floor(serial)) > 0.000001;
  if (!hasTime) return dateText;
  return `${dateText} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function columnIndexFromCellRef(cellRef: string): number {
  const letters = cellRef.match(/[A-Za-z]+/)?.[0]?.toUpperCase();
  if (!letters) return 0;
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function getXlsxCellText(cell: Element, sharedStrings: string[], dateStyleIndexes: Set<number>): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return getPreviewElementsByLocalName(cell, "t").map((node) => node.textContent || "").join("");
  }

  const value = getPreviewFirstTextByLocalName(cell, "v");
  if (!value) return "";
  if (type === "s") {
    const sharedIndex = Number(value);
    return Number.isInteger(sharedIndex) ? sharedStrings[sharedIndex] || "" : "";
  }
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";

  const styleIndex = Number(cell.getAttribute("s"));
  if (!type && Number.isInteger(styleIndex) && dateStyleIndexes.has(styleIndex)) {
    return formatExcelSerialDate(value);
  }
  return value;
}

function parseXlsxSheetRows(
  zip: AdmZip,
  sheetPath: string,
  sharedStrings: string[],
  dateStyleIndexes: Set<number>,
): { rows: string[][]; totalRows: number; truncatedRows: boolean; truncatedColumns: boolean } {
  const sheetXml = readZipText(zip, sheetPath);
  if (!sheetXml) return { rows: [], totalRows: 0, truncatedRows: false, truncatedColumns: false };

  const doc = parsePreviewXml(sheetXml);
  const allRows = getPreviewElementsByLocalName(doc, "row");
  const rows: string[][] = [];
  let truncatedRows = false;
  let truncatedColumns = false;

  for (const row of allRows) {
    if (rows.length >= SPREADSHEET_MAX_ROWS) {
      truncatedRows = true;
      break;
    }
    const values: string[] = [];
    for (const cell of getPreviewDirectChildElementsByLocalName(row, "c")) {
      const cellRef = cell.getAttribute("r") || "";
      const columnIndex = columnIndexFromCellRef(cellRef);
      if (columnIndex >= SPREADSHEET_MAX_COLUMNS) {
        truncatedColumns = true;
        continue;
      }
      values[columnIndex] = getXlsxCellText(cell, sharedStrings, dateStyleIndexes);
    }
    while (values.length > 0 && !values[values.length - 1]) values.pop();
    if (values.some((value) => value.trim().length > 0)) rows.push(values);
  }
  return { rows, totalRows: allRows.length, truncatedRows, truncatedColumns };
}

function getPptxSlidePaths(zip: AdmZip): string[] {
  const presentationXml = readZipText(zip, "ppt/presentation.xml");
  const relationships = parsePreviewRelationships(zip, "ppt/_rels/presentation.xml.rels", "ppt");
  if (presentationXml) {
    const doc = parsePreviewXml(presentationXml);
    const slidePaths = getPreviewElementsByLocalName(doc, "sldId")
      .map((slide) => slide.getAttribute("r:id") || slide.getAttribute("id"))
      .map((relationshipId) => relationshipId ? relationships.get(relationshipId) : undefined)
      .filter((path): path is string => Boolean(path));
    if (slidePaths.length > 0) return slidePaths;
  }

  return zip.getEntries()
    .map((entry) => entry.entryName)
    .filter((entryName) => /^ppt\/slides\/slide\d+\.xml$/.test(entryName))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0));
}

function getPptxSlideText(zip: AdmZip, slidePath: string): string[] {
  const slideXml = readZipText(zip, slidePath);
  if (!slideXml) return [];
  const doc = parsePreviewXml(slideXml);
  return getPreviewElementsByLocalName(doc, "p")
    .map((paragraph) => getPreviewElementsByLocalName(paragraph, "t").map((node) => node.textContent || "").join("").trim())
    .filter(Boolean);
}

function normalizePreviewText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapePreviewHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export function workspaceFilePreviewUrl(sourcePath: string): string {
  return `${WORKSPACE_FILE_PREVIEW_PROTOCOL}://workspace/${encodeURIComponent(sourcePath)}`;
}
