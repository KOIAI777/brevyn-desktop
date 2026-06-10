import { closeSync, copyFileSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
import {
  lectureWeekFolderName,
  lectureWeekNumberFromFolderName,
  normalizedWeekNumber,
  semesterWeekNumbers,
} from "../../shared/semester-weeks";
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
const MAX_TEXT_PREVIEW_BYTES = 256 * 1024;
const MAX_LECTURE_WEEK_FOLDERS = 30;
const PREVIEW_CACHE_DIR = ".preview-cache";
const AGENT_WORKSPACE_MEMORY_FILE = "CLAUDE.md";
export const WORKSPACE_FILE_PREVIEW_PROTOCOL = "brevyn-file";

export interface FileServiceOptions {
  rootDataDir: string;
  businessStore: SQLiteBusinessStore;
  providers: ProviderService;
  ragIndex: RagIndexService;
}

type ImportedIndexingResult = { job: IndexingJob | null; notice?: string; error?: string };

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
    const semester = this.options.businessStore.getSemester(semesterId);
    const allowedLectureWeeks = lectureWeekNumbersForFolders(semester);
    const weekNumber = input.targetSection === "lecture" ? normalizedWeekNumber(input.weekNumber, allowedLectureWeeks) : undefined;
    if (input.targetSection === "lecture" && input.weekNumber !== undefined && !weekNumber) {
      throw new Error("选择的课件周次不在当前学期范围内。请刷新后重新选择周次。");
    }
    const targetInput: FileImportInput = input.targetSection === "lecture" ? { ...input, weekNumber } : input;
    const targetFolder = ensureTargetFolderInTree(root, targetInput, task, timestamp);
    const managedTargetDir = this.ensureImportTargetDir(targetInput);
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
          sectionKind: targetInput.targetSection,
          weekNumber,
          sourcePath: managedPath,
          name,
          path: `${targetFolder.path}/${name}`,
          kind: kindForPath(managedPath),
          sizeLabel: formatSize(source.size),
          ragEligible: true,
          sourceKind: "user_import",
          updatedAt: timestamp,
        };
        targetFolder.children = [...(targetFolder.children || []), file];
        importedFiles.push(file);
      }
      this.persistWorkspaceFilesForCourse(input.courseId, roots, semesterId);
      const sectionId = this.sectionIdForImport(targetInput);
      let indexingJob: IndexingJob | null = null;
      let indexingError: string | undefined;
      let indexingNotice: string | undefined;
      try {
        const indexingResult = this.indexImportedFiles(input.courseId, sectionId, importedFiles);
        indexingJob = indexingResult.job;
        indexingError = indexingResult.error;
        indexingNotice = indexingResult.notice;
      } catch (error) {
        indexingError = errorMessage(error);
        console.warn("[indexing] Failed to create indexing job after import", error);
      }
      return {
        files: cloneFiles(importedFiles),
        tree: this.listFiles(input.courseId),
        indexingJob,
        indexingError,
        indexingNotice,
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
    const affectedFileIds = this.localFileIdsForMutation(file, semesterId);
    const sourcePath = this.mutableSourcePath(file, semesterId, "rename");
    if (affectedFileIds.some((id) => this.options.businessStore.hasActiveFileIndexing(id))) {
      throw new Error("Wait for indexing to finish before renaming this file.");
    }
    const safeName = sanitizeFsSegment(nextName);
    if (safeName !== nextName.trim()) throw new Error("File name contains unsupported characters.");
    const targetPath = join(dirname(sourcePath), safeName);
    if (targetPath === sourcePath) return { courseId: file.courseId, tree: this.listFiles(file.courseId) };
    if (existsSync(targetPath)) throw new Error(`"${safeName}" already exists.`);
    renameSync(sourcePath, targetPath);
    await this.deleteRagChunksForFiles(affectedFileIds);
    this.syncManagedDiskFiles(file.courseId, semesterId);
    return { courseId: file.courseId, tree: this.listFiles(file.courseId) };
  }

  async deleteFile(fileId: string): Promise<{ courseId: string; tree: WorkspaceFileNode[] }> {
    const { file, semesterId } = this.guardFileAccess(fileId, "deleting");
    const affectedFileIds = this.localFileIdsForMutation(file, semesterId);
    if (affectedFileIds.some((id) => this.options.businessStore.hasActiveFileIndexing(id))) {
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
    await this.deleteRagChunksForFiles(affectedFileIds);
    return { courseId, tree: this.listFiles(courseId) };
  }

  private localFileIdsForMutation(file: WorkspaceFileNode, semesterId: string): string[] {
    if (file.kind !== "folder") return [file.id];
    const roots = this.loadCourseRoots(file.courseId, semesterId);
    const folder = findFileNodeById(roots, file.id);
    if (!folder) return [];
    return flattenFiles([folder]).filter((child) => Boolean(child.sourcePath)).map((child) => child.id);
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
      const leafFiles = this.semesterSharedFiles(semesterId);
      const provider = this.embeddingProvider();
      return [
        {
          id: `${courseId}:shared`,
          courseId,
          kind: "course_shared",
          title: "学期资料",
          indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:shared`, leafFiles),
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
      indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:lecture`, lectureFiles),
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
      icon: task.icon,
      indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:task-${task.id}`, leafFiles.filter((file) => file.taskId === task.id)),
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
        indexingStatus: this.indexingStatusForSection(courseId, `${courseId}:shared`, sharedFiles),
        embeddingModel,
        files: sharedFiles,
      },
      lectureSection,
      ...taskSections,
    ];
  }

  private semesterSharedFiles(semesterId: string): WorkspaceFileNode[] {
    const root = this.viewCourseRoots(SEMESTER_HOME_COURSE_ID, semesterId)[0];
    if (!root) return [];
    const sharedFolder = (root.children || []).find((file) => file.kind === "folder" && file.sectionKind === "course_shared");
    return sharedFolder ? flattenFiles([sharedFolder]) : [];
  }

  indexCourseFiles(courseId: string, sectionId?: string): IndexingJob {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("请先选择学期，再索引文件。");
    activeCourseScopeOrThrow(this.options.businessStore, courseId, semesterId);
    const activeJob = this.activeIndexingJobForCourse(semesterId, courseId);
    if (activeJob) return { ...activeJob };
    const sections = this.courseFileSections(courseId);
    const files = sectionId ? sections.find((section) => section.id === sectionId)?.files || [] : sections.flatMap((section) => section.files);
    const provider = this.embeddingProvider();
    const localFiles = flattenFiles(files).filter(isIndexableWorkspaceFile);
    return this.createIndexingJobForFiles({
      semesterId,
      courseId,
      sectionId,
      files: localFiles,
      provider,
    });
  }

  private indexImportedFiles(courseId: string, sectionId: string | undefined, files: WorkspaceFileNode[]): ImportedIndexingResult {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("请先选择学期，再索引文件。");
    activeCourseScopeOrThrow(this.options.businessStore, courseId, semesterId);
    const provider = this.embeddingProvider();
    const localFiles = flattenFiles(files).filter(isIndexableWorkspaceFile);
    const activeJob = this.options.businessStore.activeIndexingJobForSection(semesterId, courseId, sectionId);
    if (activeJob) {
      if (localFiles.length === 0) {
        return {
          job: activeJob,
          notice: "这个分区已有索引任务在进行中；本次导入没有新的可索引文件。",
        };
      }
      if (embeddingJobMatchesProvider(activeJob, provider)) {
        const tasks = this.indexingTasksForFiles({
          jobId: activeJob.id,
          semesterId,
          courseId,
          sectionId,
          files: localFiles,
          provider,
        });
        const appendedJob = this.options.businessStore.appendIndexingTasksToJob(activeJob.id, tasks) || activeJob;
        return {
          job: appendedJob,
          notice: `这个分区已有索引任务在进行中，已把 ${localFiles.length} 个新文件追加到当前队列。`,
        };
      }
      return {
        job: activeJob,
        error: "这个分区已有索引任务在进行中，但当前选择的向量服务商或模型和该任务不一致。文件已导入，但不会自动排队；请等待当前任务完成后再重新索引。",
      };
    }
    const courseActiveJob = this.activeIndexingJobForCourse(semesterId, courseId);
    if (courseActiveJob) {
      return {
        job: courseActiveJob,
        error: "这门课已有其他索引任务在进行中。文件已导入，但不会自动排队；请等待当前任务完成后再重新索引。",
      };
    }
    return {
      job: this.createIndexingJobForFiles({
        semesterId,
        courseId,
        sectionId,
        files: localFiles,
        provider,
      }),
    };
  }

  private createIndexingJobForFiles(input: {
    semesterId: string;
    courseId: string;
    sectionId?: string;
    files: WorkspaceFileNode[];
    provider?: ModelProviderConfig;
  }): IndexingJob {
    const { semesterId, courseId, sectionId, provider } = input;
    const localFiles = input.files.filter(isIndexableWorkspaceFile);
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
      embeddingProviderFingerprint: provider ? embeddingProviderFingerprint(provider) : undefined,
      indexedFiles: 0,
      totalFiles: localFiles.length,
      completedFiles: 0,
      progress,
      error,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const tasks = status === "queued" ? this.indexingTasksForFiles({
      jobId: job.id,
      semesterId,
      courseId,
      sectionId,
      files: localFiles,
      provider,
    }) : [];
    const created = this.options.businessStore.createIndexingJob(job, tasks);
    this.refreshIndexingJobs();
    return { ...created };
  }

  private indexingTasksForFiles(input: {
    jobId: string;
    semesterId: string;
    courseId: string;
    sectionId?: string;
    files: WorkspaceFileNode[];
    provider?: ModelProviderConfig;
  }): IndexingTaskInsert[] {
    const { jobId, semesterId, courseId, sectionId, files, provider } = input;
    const timestamp = Date.now().toString(36);
    return files.map((file, index) => {
      const fileCourseId = file.courseId || courseId;
      return {
        id: `idx-task-${jobId}-${timestamp}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
        jobId,
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
          embeddingProvider: provider ? embeddingProviderSnapshot(provider) : undefined,
        },
      };
    });
  }

  async reindexCourseFiles(courseId: string, sectionId?: string): Promise<IndexingJob> {
    await this.options.ragIndex.rebuildOutdatedSchemaForExplicitReindex();
    return this.indexCourseFiles(courseId, sectionId);
  }

  retryIndexingFile(fileId: string): IndexingJob {
    const { file, semesterId } = this.guardFileAccess(fileId, "re-indexing");
    if (file.kind === "folder") throw new Error("Folders cannot be indexed directly. Choose a file instead.");
    if (!file.sourcePath) throw new Error("No local source path is available for this file. Re-import the file before indexing.");
    if (isAgentWorkspaceControlFile(file)) throw new Error("Brevyn workspace memory files are visible to the Agent but are not indexed by RAG.");
    if (!isRagEligibleWorkspaceFile(file)) throw new Error("这个文件还没有加入课程资料库，不能进入 RAG 索引。请通过上传入口导入，或先显式加入索引。");
    if (!existsSync(file.sourcePath)) throw new Error("文件源路径不可用。请重新导入这个文件。");
    this.assertFileSourceInsideWorkspace(file, semesterId);
    if (this.options.businessStore.hasActiveFileIndexing(file.id)) {
      throw new Error("This file is already being indexed.");
    }
    const provider = this.embeddingProvider();
    const sectionId = sectionIdForFile(file);
    const activeJob = this.options.businessStore.activeIndexingJobForSection(semesterId, file.courseId, sectionId);
    if (activeJob) {
      if (!embeddingJobMatchesProvider(activeJob, provider)) {
        throw new Error("这个分区已有索引任务在进行中，但当前选择的向量服务商或模型和该任务不一致。请等待当前任务完成后再重新索引。");
      }
      const tasks = this.indexingTasksForFiles({
        jobId: activeJob.id,
        semesterId,
        courseId: file.courseId,
        sectionId,
        files: [file],
        provider,
      });
      return this.options.businessStore.appendIndexingTasksToJob(activeJob.id, tasks) || activeJob;
    }
    const courseActiveJob = this.activeIndexingJobForCourse(semesterId, file.courseId);
    if (courseActiveJob) {
      throw new Error("这门课已有其他索引任务在进行中。请等待当前任务完成后再重新索引这个文件。");
    }
    return this.createIndexingJobForFiles({
      semesterId,
      courseId: file.courseId,
      sectionId,
      files: [file],
      provider,
    });
  }

  async indexActiveSemesterCourses(): Promise<IndexActiveSemesterResult> {
    await this.options.ragIndex.rebuildOutdatedSchemaForExplicitReindex();
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) throw new Error("请先选择学期，再索引文件。");
    const courses = new Map<string, string>([[SEMESTER_HOME_COURSE_ID, "学期总览"]]);
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
    if (courseId !== SEMESTER_HOME_COURSE_ID) this.pruneEmptyLectureWeekFolders(roots);
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
    if (courseId !== SEMESTER_HOME_COURSE_ID) this.pruneEmptyLectureWeekFolders(roots);
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
      this.ensureLectureWeekDirs(courseDir, semesterId);
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
        const taskFolder = findTaskFolderNode(root, task.id);
        if (taskFolder) {
          changed = this.syncAgentWorkspaceMemoryFile(taskFolder, join(taskDir, AGENT_WORKSPACE_MEMORY_FILE), {
            courseId,
            taskId: task.id,
            taskType: task.taskType,
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
    metadata: Pick<WorkspaceFileNode, "courseId" | "taskId" | "taskType" | "taskFileBucket" | "sectionKind" | "weekNumber">,
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
      .filter((entry) => !this.shouldHideEmptyLectureWeekDir(metadata, dir, entry))
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
        const childMetadata = this.metadataForDiskChild(metadata, entry.name);
        const folder = ensureFolderChild(parent, entry.name, { ...childMetadata, sourcePath }, timestamp);
        changed = parent.children.length !== childCount || this.syncDiskFolder(folder, sourcePath, childMetadata, timestamp) || changed;
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
          ragEligible: false,
          sourceKind: "disk_discovered",
        });
        changed = true;
      }
    }
    return changed;
  }

  private syncAgentWorkspaceMemoryFile(
    parent: WorkspaceFileNode,
    sourcePath: string,
    metadata: Pick<WorkspaceFileNode, "courseId" | "taskId" | "taskType" | "taskFileBucket" | "sectionKind" | "weekNumber">,
    timestamp: string,
  ): boolean {
    parent.children ||= [];
    const existingIndex = parent.children.findIndex((child) => child.kind !== "folder" && child.name === AGENT_WORKSPACE_MEMORY_FILE);
    if (!existsSync(sourcePath)) {
      if (existingIndex < 0) return false;
      parent.children.splice(existingIndex, 1);
      return true;
    }
    let size = 0;
    let updatedAt = timestamp;
    try {
      const stats = statSync(sourcePath);
      if (!stats.isFile()) return false;
      size = stats.size;
      updatedAt = stats.mtime.toISOString();
    } catch {
      return false;
    }
    const next = {
      semesterId: parent.semesterId,
      ...metadata,
      sourcePath,
      name: AGENT_WORKSPACE_MEMORY_FILE,
      path: `${parent.path}/${AGENT_WORKSPACE_MEMORY_FILE}`,
      kind: kindForPath(sourcePath),
      sizeLabel: formatSize(size),
      updatedAt,
    };
    if (existingIndex >= 0) {
      const existing = parent.children[existingIndex];
      const before = JSON.stringify(existing);
      Object.assign(existing, next);
      return before !== JSON.stringify(existing);
    }
    parent.children.push({
      id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ...next,
    });
    return true;
  }

  private metadataForDiskChild(
    metadata: Pick<WorkspaceFileNode, "courseId" | "taskId" | "taskType" | "taskFileBucket" | "sectionKind" | "weekNumber">,
    name: string,
  ): Pick<WorkspaceFileNode, "courseId" | "taskId" | "taskType" | "taskFileBucket" | "sectionKind" | "weekNumber"> {
    if (metadata.sectionKind !== "lecture" || metadata.weekNumber) return metadata;
    return { ...metadata, weekNumber: lectureWeekNumberFromFolderName(name) };
  }

  private shouldHideEmptyLectureWeekDir(
    metadata: Pick<WorkspaceFileNode, "courseId" | "taskId" | "taskType" | "taskFileBucket" | "sectionKind" | "weekNumber">,
    dir: string,
    entry: Dirent<string>,
  ): boolean {
    if (metadata.sectionKind !== "lecture" || metadata.weekNumber || !entry.isDirectory()) return false;
    if (!lectureWeekNumberFromFolderName(entry.name)) return false;
    return !hasVisibleDiskEntries(join(dir, entry.name));
  }

  private ensureLectureWeekDirs(courseDir: string, semesterId: string): void {
    const semester = this.options.businessStore.getSemester(semesterId);
    for (const weekNumber of lectureWeekNumbersForFolders(semester)) {
      mkdirSync(join(courseDir, "Lecture", lectureWeekFolderName(weekNumber)), { recursive: true });
    }
  }

  private pruneEmptyLectureWeekFolders(nodes: WorkspaceFileNode[], insideLectureRoot = false): boolean {
    let changed = false;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      const emptyLectureWeek = node.kind === "folder" &&
        insideLectureRoot &&
        Boolean(lectureWeekNumberFromFolderName(node.name)) &&
        (node.children?.length || 0) === 0;
      if (emptyLectureWeek) {
        nodes.splice(index, 1);
        changed = true;
        continue;
      }
      if (node.children && this.pruneEmptyLectureWeekFolders(node.children, node.sectionKind === "lecture" && !node.weekNumber)) changed = true;
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

  private indexingStatusForSection(courseId: string, sectionId: string, files: WorkspaceFileNode[] = []): IndexingJob["status"] {
    const semesterId = currentActiveSemesterId(this.options.businessStore);
    if (!semesterId) return "idle";
    const job = this.options.businessStore.listIndexingJobs(semesterId, courseId).find((item) => item.sectionId === sectionId);
    if (job && isActiveIndexingJob(job)) return job.status;
    const indexableFiles = flattenFiles(files).filter(isIndexableWorkspaceFile);
    if (indexableFiles.length === 0) return "idle";
    if (indexableFiles.every((file) => file.indexingStatus === "indexed" || Boolean(file.indexedAt))) return "indexed";
    if (indexableFiles.some((file) => file.indexingStatus === "failed")) return "failed";
    if (indexableFiles.some((file) => file.indexingStatus === "cancelled")) return "cancelled";
    if (job?.status === "failed" || job?.status === "cancelled") return job.status;
    return "idle";
  }

  private embeddingProvider(): ModelProviderConfig | undefined {
    return this.options.providers.embeddingProvider();
  }

  private activeIndexingJobForCourse(semesterId: string, courseId: string): IndexingJob | null {
    return this.options.businessStore.listIndexingJobs(semesterId, courseId).find(isActiveIndexingJob) || null;
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

  private async deleteRagChunksForFiles(fileIds: string[]): Promise<void> {
    for (const fileId of new Set(fileIds)) {
      await this.deleteRagChunksForFile(fileId);
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

function hasVisibleDiskEntries(dir: string): boolean {
  try {
    return readdirSync(dir, { withFileTypes: true }).some((entry) => !entry.name.startsWith("."));
  } catch {
    return false;
  }
}

function lectureWeekNumbersForFolders(semester: Parameters<typeof semesterWeekNumbers>[0]): number[] {
  return semesterWeekNumbers(semester).slice(0, MAX_LECTURE_WEEK_FOLDERS);
}

function findFileNodeById(nodes: WorkspaceFileNode[], fileId: string): WorkspaceFileNode | undefined {
  for (const node of nodes) {
    if (node.id === fileId) return node;
    const child = node.children ? findFileNodeById(node.children, fileId) : undefined;
    if (child) return child;
  }
  return undefined;
}

function findTaskFolderNode(root: WorkspaceFileNode, taskId: string): WorkspaceFileNode | undefined {
  if (root.kind === "folder" && root.taskId === taskId && root.sectionKind === "task" && !root.taskFileBucket) return root;
  for (const child of root.children || []) {
    const match = findTaskFolderNode(child, taskId);
    if (match) return match;
  }
  return undefined;
}

function isIndexableWorkspaceFile(file: WorkspaceFileNode): boolean {
  return Boolean(file.sourcePath) && isRagEligibleWorkspaceFile(file) && !isAgentWorkspaceControlFile(file);
}

function isActiveIndexingJob(job: IndexingJob): boolean {
  return job.status === "queued" || job.status === "indexing";
}

function isRagEligibleWorkspaceFile(file: WorkspaceFileNode): boolean {
  if (file.ragEligible === true) return true;
  if (file.ragEligible === false) return false;
  return Boolean(file.indexedAt || (file.indexingStatus && file.indexingStatus !== "idle"));
}

function isAgentWorkspaceControlFile(file: WorkspaceFileNode): boolean {
  const values = [file.name, file.path, file.sourcePath].filter((value): value is string => Boolean(value));
  if (values.some((value) => basename(value).toLowerCase() === AGENT_WORKSPACE_MEMORY_FILE.toLowerCase())) return true;
  return values.some((value) => {
    const segments = value.replace(/\\/g, "/").split("/").filter(Boolean);
    return segments.some((segment) => segment === ".brevyn" || segment === ".context" || segment === ".claude");
  });
}

function readPreviewSource(sourcePath?: string): string {
  if (!sourcePath || !existsSync(sourcePath)) return "";
  try {
    const stats = statSync(sourcePath);
    const bytesToRead = Math.min(stats.size, MAX_TEXT_PREVIEW_BYTES);
    const content = readFilePrefix(sourcePath, bytesToRead).toString("utf8");
    const preview = truncatePreviewText(content, 12000);
    return stats.size > MAX_TEXT_PREVIEW_BYTES
      ? `${preview}\n\n[仅预览前 ${formatSize(MAX_TEXT_PREVIEW_BYTES)}]`
      : preview;
  } catch {
    return "";
  }
}

function readFilePrefix(sourcePath: string, bytesToRead: number): Buffer {
  if (bytesToRead <= 0) return Buffer.alloc(0);
  const buffer = Buffer.allocUnsafe(bytesToRead);
  let fd: number | undefined;
  try {
    fd = openSync(sourcePath, "r");
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, 0);
    return bytesRead === bytesToRead ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    if (fd !== undefined) closeSync(fd);
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
        pages.textContent = "";
        const message = document.createElement("div");
        message.className = "error";
        message.textContent = "PDF 加载失败：" + (error?.message || String(error));
        pages.appendChild(message);
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

function embeddingProviderSnapshot(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    id: provider.id,
    purpose: provider.purpose,
    providerKind: provider.providerKind,
    adapterKind: provider.adapterKind,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKeyMasked: provider.apiKeyMasked,
    apiKeySecretRef: provider.apiKeySecretRef,
    authMode: provider.authMode,
    models: provider.models.filter((model) => model.id === provider.selectedModel),
    selectedModel: provider.selectedModel,
    enabled: provider.enabled,
    autoCompactThresholdPercent: provider.autoCompactThresholdPercent,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function embeddingProviderFingerprint(provider: ModelProviderConfig): string {
  return [
    provider.id,
    provider.adapterKind,
    provider.providerKind,
    provider.protocol,
    provider.baseUrl,
    provider.selectedModel,
  ].join("|");
}

function embeddingJobMatchesProvider(job: IndexingJob, provider?: ModelProviderConfig): provider is ModelProviderConfig {
  if (!provider?.selectedModel) return false;
  return job.embeddingProviderFingerprint === embeddingProviderFingerprint(provider);
}

function sectionIdForFile(file: WorkspaceFileNode): string | undefined {
  if (file.sectionKind === "course_shared") return `${file.courseId}:shared`;
  if (file.sectionKind === "lecture") return `${file.courseId}:lecture`;
  if (file.sectionKind === "task" && file.taskId) return `${file.courseId}:task-${file.taskId}`;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown cleanup failure");
}

export function workspaceFilePreviewUrl(sourcePath: string): string {
  return `${WORKSPACE_FILE_PREVIEW_PROTOCOL}://workspace/${encodeURIComponent(sourcePath)}`;
}
