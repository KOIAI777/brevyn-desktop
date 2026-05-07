import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type {
  Course,
  IndexingJob,
  ModelProviderConfig,
  SemesterWorkspace,
  TaskStatus,
  TaskType,
  Thread,
  TimetableEvent,
  TimetableEventKind,
  TimetableEventSource,
  UclawTask,
  WorkspaceFileKind,
  WorkspaceFileNode,
} from "../../types/domain";
import type { IndexingTaskInsert, IndexingTaskRecord, IndexingWorkerResult } from "../indexing";

type SQLiteStatementSync = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

type SQLiteDatabaseSync = {
  close: () => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => SQLiteStatementSync;
};

type SQLiteModule = {
  DatabaseSync: new (path: string) => SQLiteDatabaseSync;
};

export interface BusinessStoreStatus {
  dbPath: string;
  schemaVersion: number;
}

export interface BusinessSnapshot {
  semester: SemesterWorkspace;
  semesters: SemesterWorkspace[];
  currentSemesterId: string;
  courses: Course[];
  tasks: UclawTask[];
  threads: Thread[];
  files: WorkspaceFileNode[];
  timetableEvents: TimetableEvent[];
  providers: ModelProviderConfig[];
  indexingJobs: IndexingJob[];
}

type Row = Record<string, unknown>;

const require = createRequire(__filename);
const BUSINESS_SCHEMA_VERSION = 4;
const now = () => new Date().toISOString();

export class SQLiteBusinessStore {
  private readonly db: SQLiteDatabaseSync;

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = openDatabase(dbPath);
    this.db.exec("pragma journal_mode = wal; pragma busy_timeout = 5000;");
    this.migrate();
  }

  status(): BusinessStoreStatus {
    return {
      dbPath: this.dbPath,
      schemaVersion: this.schemaVersion(),
    };
  }

  hasBusinessData(): boolean {
    const row = this.db.prepare("select count(*) as count from semesters").get() as { count?: number } | undefined;
    return Number(row?.count || 0) > 0;
  }

  loadSnapshot(): BusinessSnapshot | null {
    if (!this.hasBusinessData()) return null;

    const appState = this.loadAppState();
    const semesters = this.all("select * from semesters order by starts_at desc, recognized_at desc").map(rowToSemester);
    const currentSemesterId = appState.currentSemesterId || semesters[0]?.id || "";
    const semester = semesters.find((item) => item.id === currentSemesterId) || semesters[0];
    if (!semester) return null;

    return {
      semester,
      semesters,
      currentSemesterId: semester.id,
      courses: this.all("select * from courses order by name").map(rowToCourse),
      tasks: this.all("select * from tasks order by updated_at desc").map(rowToTask),
      threads: this.all("select * from threads order by updated_at desc").map(rowToThread),
      files: rowsToFileTree(this.all("select * from workspace_files order by path, name")),
      timetableEvents: this.all("select * from timetable_events order by starts_at").map(rowToTimetableEvent),
      providers: this.all("select * from providers order by updated_at desc").map(rowToProvider),
      indexingJobs: this.all("select * from indexing_jobs order by updated_at desc").map(rowToIndexingJob),
    };
  }

  saveSnapshot(snapshot: BusinessSnapshot): void {
    this.db.exec("begin immediate;");
    try {
      this.db.exec(`
        delete from timetable_events;
        delete from workspace_files;
        delete from threads;
        delete from tasks;
        delete from courses;
        delete from semesters;
        delete from providers;
        delete from app_state;
      `);

      this.run("insert into app_state(key, value, updated_at) values (?, ?, ?)", "current_semester_id", snapshot.currentSemesterId, now());

      for (const semester of snapshot.semesters) this.insertSemester(semester);
      for (const course of snapshot.courses) this.insertCourse(course);
      for (const task of snapshot.tasks) this.insertTask(task);
      for (const thread of snapshot.threads) this.insertThread(thread);
      for (const file of flattenFileTree(snapshot.files)) this.insertFile(file.node, file.parentId);
      for (const event of snapshot.timetableEvents) this.insertTimetableEvent(event);
      for (const provider of snapshot.providers) this.insertProvider(provider);

      this.db.exec("commit;");
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  listIndexingJobs(semesterId?: string, courseId?: string): IndexingJob[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (semesterId) {
      where.push("semester_id = ?");
      params.push(semesterId);
    }
    if (courseId) {
      where.push("course_id = ?");
      params.push(courseId);
    }
    const sql = `select * from indexing_jobs${where.length ? ` where ${where.join(" and ")}` : ""} order by updated_at desc`;
    return this.all(sql, ...params).map(rowToIndexingJob);
  }

  createIndexingJob(job: IndexingJob, tasks: IndexingTaskInsert[]): IndexingJob {
    this.db.exec("begin immediate;");
    try {
      this.insertIndexingJob({
        ...job,
        totalFiles: job.totalFiles ?? tasks.length,
        indexedFiles: job.indexedFiles ?? 0,
        completedFiles: job.completedFiles ?? 0,
        progress: tasks.length > 0 ? job.progress : 100,
        stage: job.stage || (tasks.length > 0 ? "queued" : "empty"),
      });
      for (const task of tasks) this.insertIndexingTask(task);
      this.db.exec("commit;");
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
    return this.getIndexingJob(job.id) || job;
  }

  getIndexingTask(taskId: string): IndexingTaskRecord | null {
    const row = this.db.prepare("select * from indexing_tasks where id = ?").get(taskId) as Row | undefined;
    return row ? rowToIndexingTask(row) : null;
  }

  claimNextIndexingTask(workerId: string, lockMs: number): IndexingTaskRecord | null {
    const timestamp = now();
    const lockedUntil = new Date(Date.now() + lockMs).toISOString();
    this.db.exec("begin immediate;");
    try {
      const row = this.db
        .prepare(
          `select indexing_tasks.*
           from indexing_tasks
           join indexing_jobs on indexing_jobs.id = indexing_tasks.job_id
           where indexing_tasks.status = 'queued'
             and indexing_tasks.next_run_at <= ?
             and indexing_jobs.status in ('queued', 'indexing')
           order by indexing_tasks.next_run_at asc, indexing_tasks.created_at asc
           limit 1`,
        )
        .get(timestamp) as Row | undefined;
      if (!row) {
        this.db.exec("commit;");
        return null;
      }
      this.run(
        `update indexing_tasks
         set status = 'running',
             attempts = attempts + 1,
             locked_by = ?,
             locked_until = ?,
             progress = 5,
             updated_at = ?
         where id = ?`,
        workerId,
        lockedUntil,
        timestamp,
        stringValue(row.id),
      );
      this.run(
        `update indexing_jobs
         set status = 'indexing',
             stage = ?,
             updated_at = ?
         where id = ? and status != 'cancelled'`,
        stringValue(row.kind),
        timestamp,
        stringValue(row.job_id),
      );
      const task = this.getIndexingTask(stringValue(row.id));
      this.db.exec("commit;");
      return task;
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  recoverExpiredIndexingTasks(): void {
    const timestamp = now();
    this.db.exec("begin immediate;");
    try {
      this.run(
        `update indexing_tasks
         set status = 'queued',
             locked_by = null,
             locked_until = null,
             progress = 0,
             updated_at = ?
         where status = 'running' and locked_until is not null and locked_until < ?`,
        timestamp,
        timestamp,
      );
      this.run(
        `update indexing_jobs
         set status = 'queued',
             stage = 'recovered',
             updated_at = ?
         where status = 'indexing'
           and exists (
             select 1 from indexing_tasks
             where indexing_tasks.job_id = indexing_jobs.id
               and indexing_tasks.status = 'queued'
           )`,
        timestamp,
      );
      this.db.exec("commit;");
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  completeIndexingTask(taskId: string, result: IndexingWorkerResult): IndexingJob | null {
    const timestamp = now();
    this.db.exec("begin immediate;");
    try {
      const task = this.getIndexingTask(taskId);
      if (!task) {
        this.db.exec("commit;");
        return null;
      }
      const job = this.getIndexingJob(task.jobId);
      if (job?.status === "cancelled") {
        this.run(
          `update indexing_tasks
           set status = 'cancelled', locked_by = null, locked_until = null, updated_at = ?
           where id = ?`,
          timestamp,
          taskId,
        );
        this.db.exec("commit;");
        return this.getIndexingJob(task.jobId);
      }
      this.run(
        `update indexing_tasks
         set status = 'done',
             locked_by = null,
             locked_until = null,
             progress = 100,
             error = null,
             payload_json = ?,
             updated_at = ?
         where id = ?`,
        json({
          ...task.payload,
          result: {
            fileId: result.fileId,
            sourcePath: result.sourcePath,
            chunkCount: result.chunkCount,
            charCount: result.charCount,
            byteCount: result.byteCount,
            sample: result.sample,
            warnings: result.warnings,
            metadata: result.metadata,
          },
        }),
        timestamp,
        taskId,
      );
      this.run("update workspace_files set indexed_at = ?, updated_at = ? where id = ?", timestamp, timestamp, task.fileId);
      const updated = this.refreshIndexingJob(task.jobId);
      this.db.exec("commit;");
      return updated;
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  failIndexingTask(taskId: string, message: string): IndexingJob | null {
    const timestamp = now();
    this.db.exec("begin immediate;");
    try {
      const task = this.getIndexingTask(taskId);
      if (!task) {
        this.db.exec("commit;");
        return null;
      }
      const retry = task.attempts < task.maxAttempts;
      const backoffMs = Math.min(120_000, 10_000 * Math.max(1, 2 ** Math.max(0, task.attempts - 1)));
      this.run(
        `update indexing_tasks
         set status = ?,
             locked_by = null,
             locked_until = null,
             next_run_at = ?,
             progress = 0,
             error = ?,
             updated_at = ?
         where id = ?`,
        retry ? "queued" : "failed",
        retry ? new Date(Date.now() + backoffMs).toISOString() : timestamp,
        message,
        timestamp,
        taskId,
      );
      const updated = this.refreshIndexingJob(task.jobId);
      this.db.exec("commit;");
      return updated;
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  cancelIndexingJob(jobId: string): IndexingJob | null {
    const timestamp = now();
    this.db.exec("begin immediate;");
    try {
      this.run(
        `update indexing_jobs
         set status = 'cancelled',
             stage = 'cancelled',
             updated_at = ?
         where id = ?`,
        timestamp,
        jobId,
      );
      this.run(
        `update indexing_tasks
         set status = 'cancelled',
             locked_by = null,
             locked_until = null,
             updated_at = ?
         where job_id = ? and status in ('queued', 'running')`,
        timestamp,
        jobId,
      );
      const job = this.getIndexingJob(jobId);
      this.db.exec("commit;");
      return job;
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  private all(sql: string, ...params: unknown[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  private run(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...params);
  }

  private loadAppState(): { currentSemesterId?: string } {
    const rows = this.all("select key, value from app_state");
    const values = Object.fromEntries(rows.map((row) => [stringValue(row.key), stringValue(row.value)]));
    return { currentSemesterId: values.current_semester_id };
  }

  private insertSemester(semester: SemesterWorkspace): void {
    const timestamp = semester.recognizedAt || now();
    this.run(
      `insert into semesters(id, semester_no, term, folder_name, starts_at, ends_at, recognized_at, source, raw_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      semester.id,
      semester.semesterNo,
      semester.term,
      semester.folderName,
      semester.startsAt ?? null,
      semester.endsAt ?? null,
      semester.recognizedAt ?? null,
      semester.source,
      json(semester),
      timestamp,
      timestamp,
    );
  }

  private insertCourse(course: Course): void {
    const timestamp = now();
    this.run(
      `insert into courses(id, semester_id, code, name, instructor, schedule_json, folder_name, workspace_kind, raw_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      course.id,
      course.semesterId ?? "",
      course.code,
      course.name,
      course.instructor ?? null,
      json({ meetingTime: course.meetingTime, location: course.location }),
      course.name,
      course.workspaceKind ?? "course",
      json(course),
      timestamp,
      timestamp,
    );
  }

  private insertTask(task: UclawTask): void {
    const timestamp = now();
    this.run(
      `insert into tasks(id, semester_id, course_id, title, task_type, due_at, workspace_path, status, raw_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      task.id,
      task.semesterId ?? "",
      task.courseId,
      task.title,
      task.taskType,
      task.dueAt ?? null,
      `Task/${task.taskType}/${task.title}`,
      task.status,
      json(task),
      timestamp,
      timestamp,
    );
  }

  private insertThread(thread: Thread): void {
    this.run(
      `insert into threads(id, semester_id, course_id, task_id, title, jsonl_path, status, raw_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      thread.id,
      thread.semesterId ?? "",
      thread.courseId,
      thread.taskId ?? null,
      thread.title,
      `semesters/${thread.semesterId || "unknown"}/threads/${thread.id}.jsonl`,
      thread.latestRunStatus,
      json(thread),
      thread.createdAt,
      thread.updatedAt,
    );
  }

  private insertFile(file: WorkspaceFileNode, parentId?: string): void {
    const raw = { ...file, children: undefined };
    this.run(
      `insert into workspace_files(id, semester_id, course_id, task_id, parent_id, name, path, kind, mime_type, size_bytes, section_kind, week_number, task_file_bucket, source_path, indexed_at, raw_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      file.id,
      file.semesterId ?? "",
      file.courseId,
      file.taskId ?? null,
      parentId ?? null,
      file.name,
      file.path,
      file.kind,
      null,
      null,
      file.sectionKind ?? null,
      file.weekNumber ?? null,
      file.taskFileBucket ?? null,
      file.sourcePath ?? null,
      null,
      json(raw),
      file.updatedAt,
      file.updatedAt,
    );
  }

  private insertTimetableEvent(event: TimetableEvent): void {
    const timestamp = now();
    this.run(
      `insert into timetable_events(id, semester_id, course_id, task_id, title, kind, source, starts_at, ends_at, location, notes, raw_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.semesterId ?? "",
      event.courseId ?? null,
      event.taskId ?? null,
      event.title,
      event.kind,
      event.source,
      event.startsAt,
      event.endsAt ?? null,
      event.location ?? null,
      event.notes ?? null,
      json(event),
      timestamp,
      timestamp,
    );
  }

  private insertProvider(provider: ModelProviderConfig): void {
    this.run(
      `insert into providers(id, name, protocol, base_url, api_key_masked, api_key_secret_ref, chat_model, embedding_model, multimodal_model, enabled, embedding_enabled, config_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      provider.id,
      provider.name,
      provider.protocol,
      provider.baseUrl,
      provider.apiKeyMasked,
      provider.apiKeySecretRef ?? null,
      provider.chatModel ?? null,
      provider.embeddingModel ?? null,
      provider.multimodalModel ?? null,
      intBool(provider.enabled),
      intBool(Boolean(provider.embeddingEnabled)),
      json({ agentTools: provider.agentTools }),
      provider.createdAt,
      provider.updatedAt,
    );
  }

  private insertIndexingJob(job: IndexingJob): void {
    this.run(
      `insert or replace into indexing_jobs(id, semester_id, course_id, section_id, status, stage, embedding_model, indexed_files, total_files, completed_files, progress, error, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      job.id,
      job.semesterId ?? "",
      job.courseId,
      job.sectionId ?? null,
      job.status,
      job.stage ?? null,
      job.embeddingModel,
      job.indexedFiles,
      job.totalFiles ?? job.indexedFiles ?? 0,
      job.completedFiles ?? job.indexedFiles ?? 0,
      job.progress,
      job.error ?? null,
      job.createdAt,
      job.updatedAt,
    );
  }

  private insertIndexingTask(task: IndexingTaskInsert): void {
    const timestamp = now();
    this.run(
      `insert into indexing_tasks(id, job_id, semester_id, course_id, section_id, file_id, kind, status, attempts, max_attempts, locked_by, locked_until, next_run_at, progress, error, payload_json, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, null, null, ?, 0, null, ?, ?, ?)`,
      task.id,
      task.jobId,
      task.semesterId ?? "",
      task.courseId,
      task.sectionId ?? null,
      task.fileId,
      task.kind,
      task.maxAttempts ?? 3,
      task.nextRunAt ?? timestamp,
      json(task.payload),
      timestamp,
      timestamp,
    );
  }

  getIndexingJob(jobId: string): IndexingJob | null {
    const row = this.db.prepare("select * from indexing_jobs where id = ?").get(jobId) as Row | undefined;
    return row ? rowToIndexingJob(row) : null;
  }

  private refreshIndexingJob(jobId: string): IndexingJob | null {
    const current = this.getIndexingJob(jobId);
    if (!current) return null;
    if (current.status === "cancelled") return current;

    const row = this.db
      .prepare(
        `select
           count(*) as total,
           sum(case when status = 'done' then 1 else 0 end) as done,
           sum(case when status = 'failed' then 1 else 0 end) as failed,
           sum(case when status = 'running' then 1 else 0 end) as running,
           sum(case when status = 'queued' then 1 else 0 end) as queued
         from indexing_tasks
         where job_id = ?`,
      )
      .get(jobId) as Row | undefined;
    const total = numberValue(row?.total) || 0;
    const done = numberValue(row?.done) || 0;
    const failed = numberValue(row?.failed) || 0;
    const running = numberValue(row?.running) || 0;
    const queued = numberValue(row?.queued) || 0;
    const status: IndexingJob["status"] =
      total === 0 ? "indexed" : failed > 0 && running === 0 && queued === 0 ? "failed" : done >= total ? "indexed" : running > 0 ? "indexing" : "queued";
    const progress = total === 0 ? 100 : Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    const failedRow = failed > 0 ? (this.db.prepare("select error from indexing_tasks where job_id = ? and status = 'failed' order by updated_at desc limit 1").get(jobId) as Row | undefined) : undefined;
    const timestamp = now();
    this.run(
      `update indexing_jobs
       set status = ?,
           stage = ?,
           indexed_files = ?,
           completed_files = ?,
           total_files = ?,
           progress = ?,
           error = ?,
           updated_at = ?
       where id = ?`,
      status,
      status === "indexed" ? "completed" : status === "failed" ? "failed" : running > 0 ? "parse_chunk" : "queued",
      done,
      done,
      total,
      progress,
      status === "failed" ? nullableString(failedRow?.error) ?? current.error ?? null : null,
      timestamp,
      jobId,
    );
    return this.getIndexingJob(jobId);
  }

  private schemaVersion(): number {
    const row = this.db.prepare("select max(version) as version from schema_migrations").get() as { version?: number } | undefined;
    return row?.version ?? 0;
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists schema_migrations (
        version integer primary key,
        name text not null,
        applied_at text not null
      );

      create table if not exists app_state (
        key text primary key,
        value text not null,
        updated_at text not null
      );
    `);

    if (this.schemaVersion() === 0) {
      this.db.exec(`
        begin;

        create table if not exists semesters (
          id text primary key,
          semester_no text not null,
          term text not null,
          folder_name text not null,
          starts_at text,
          ends_at text,
          recognized_at text,
          source text not null,
          raw_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists courses (
          id text primary key,
          semester_id text not null references semesters(id) on delete cascade,
          code text not null,
          name text not null,
          instructor text,
          schedule_json text not null default '[]',
          folder_name text not null,
          workspace_kind text not null default 'course',
          raw_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists tasks (
          id text primary key,
          semester_id text not null references semesters(id) on delete cascade,
          course_id text not null references courses(id) on delete cascade,
          title text not null,
          task_type text not null,
          due_at text,
          workspace_path text not null,
          status text not null default 'active',
          raw_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists threads (
          id text primary key,
          semester_id text not null references semesters(id) on delete cascade,
          course_id text not null,
          task_id text,
          title text not null,
          jsonl_path text not null,
          status text not null default 'idle',
          raw_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists skills (
          id text primary key,
          name text not null,
          description text not null,
          enabled integer not null default 0,
          scope text not null default 'global',
          config_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists workspace_files (
          id text primary key,
          semester_id text not null references semesters(id) on delete cascade,
          course_id text not null,
          task_id text,
          parent_id text,
          name text not null,
          path text not null,
          kind text not null,
          mime_type text,
          size_bytes integer,
          section_kind text,
          week_number integer,
          task_file_bucket text,
          source_path text,
          indexed_at text,
          raw_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists timetable_events (
          id text primary key,
          semester_id text not null references semesters(id) on delete cascade,
          course_id text,
          task_id text,
          title text not null,
          kind text not null,
          source text not null,
          starts_at text not null,
          ends_at text,
          location text,
          notes text,
          raw_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists providers (
          id text primary key,
          name text not null,
          protocol text not null,
          base_url text not null,
          api_key_masked text not null default '',
          api_key_secret_ref text,
          chat_model text,
          embedding_model text,
          multimodal_model text,
          enabled integer not null default 0,
          embedding_enabled integer not null default 0,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists indexing_jobs (
          id text primary key,
          semester_id text not null references semesters(id) on delete cascade,
          course_id text not null,
          section_id text,
          status text not null,
          stage text,
          embedding_model text not null,
          indexed_files integer not null default 0,
          total_files integer not null default 0,
          completed_files integer not null default 0,
          progress integer not null default 0,
          error text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists indexing_tasks (
          id text primary key,
          job_id text not null references indexing_jobs(id) on delete cascade,
          semester_id text not null,
          course_id text not null,
          section_id text,
          file_id text not null,
          kind text not null,
          status text not null,
          attempts integer not null default 0,
          max_attempts integer not null default 3,
          locked_by text,
          locked_until text,
          next_run_at text not null,
          progress integer not null default 0,
          error text,
          payload_json text not null default '{}',
          created_at text not null,
          updated_at text not null
        );

        create index if not exists idx_courses_semester on courses(semester_id);
        create index if not exists idx_tasks_course on tasks(course_id);
        create index if not exists idx_threads_scope on threads(semester_id, course_id, task_id);
        create index if not exists idx_files_scope on workspace_files(semester_id, course_id, task_id, section_kind);
        create index if not exists idx_timetable_range on timetable_events(semester_id, starts_at, ends_at);
        create index if not exists idx_indexing_jobs_scope on indexing_jobs(semester_id, course_id, status);
        create index if not exists idx_indexing_tasks_ready on indexing_tasks(status, next_run_at, locked_until);
        create index if not exists idx_indexing_tasks_job on indexing_tasks(job_id, status);

        insert into schema_migrations(version, name, applied_at)
        values (1, 'business_metadata_v1', datetime('now'));

        commit;
      `);
    }

    this.ensureColumn("threads", "raw_json", "text not null default '{}'");
    this.ensureColumn("indexing_jobs", "stage", "text");
    this.ensureColumn("indexing_jobs", "total_files", "integer not null default 0");
    this.ensureColumn("indexing_jobs", "completed_files", "integer not null default 0");
    this.ensureColumn("providers", "config_json", "text not null default '{}'");
    this.db.exec(`
      create table if not exists indexing_tasks (
        id text primary key,
        job_id text not null references indexing_jobs(id) on delete cascade,
        semester_id text not null,
        course_id text not null,
        section_id text,
        file_id text not null,
        kind text not null,
        status text not null,
        attempts integer not null default 0,
        max_attempts integer not null default 3,
        locked_by text,
        locked_until text,
        next_run_at text not null,
        progress integer not null default 0,
        error text,
        payload_json text not null default '{}',
        created_at text not null,
        updated_at text not null
      );
      create index if not exists idx_indexing_tasks_ready on indexing_tasks(status, next_run_at, locked_until);
      create index if not exists idx_indexing_tasks_job on indexing_tasks(job_id, status);
    `);

    if (this.schemaVersion() < BUSINESS_SCHEMA_VERSION) {
      this.run(
        "insert or ignore into schema_migrations(version, name, applied_at) values (?, ?, datetime('now'))",
        BUSINESS_SCHEMA_VERSION,
        "provider_agent_tools_v4",
      );
    }
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.all(`pragma table_info(${tableName})`).map((row) => stringValue(row.name));
    if (!columns.includes(columnName)) {
      this.db.exec(`alter table ${tableName} add column ${columnName} ${definition};`);
    }
  }
}

function rowToSemester(row: Row): SemesterWorkspace {
  return {
    ...rawJson<SemesterWorkspace>(row.raw_json, {}),
    id: stringValue(row.id),
    semesterNo: stringValue(row.semester_no),
    term: stringValue(row.term),
    folderName: stringValue(row.folder_name),
    startsAt: nullableString(row.starts_at),
    endsAt: nullableString(row.ends_at),
    source: stringValue(row.source) as SemesterWorkspace["source"],
    recognizedAt: nullableString(row.recognized_at),
  };
}

function rowToCourse(row: Row): Course {
  const schedule = rawJson<{ meetingTime?: string; location?: string }>(row.schedule_json, {});
  const raw = rawJson<Course>(row.raw_json, {});
  return {
    term: "",
    color: "#111827",
    description: "",
    ...raw,
    id: stringValue(row.id),
    semesterId: stringValue(row.semester_id),
    code: stringValue(row.code),
    name: stringValue(row.name),
    instructor: stringValue(row.instructor),
    workspaceKind: stringValue(row.workspace_kind) as Course["workspaceKind"],
    meetingTime: schedule.meetingTime,
    location: schedule.location,
  };
}

function rowToTask(row: Row): UclawTask {
  const raw = rawJson<UclawTask>(row.raw_json, {});
  return {
    summary: "",
    ...raw,
    id: stringValue(row.id),
    semesterId: stringValue(row.semester_id),
    courseId: stringValue(row.course_id),
    title: stringValue(row.title),
    taskType: stringValue(row.task_type) as TaskType,
    dueAt: nullableString(row.due_at),
    status: stringValue(row.status) as TaskStatus,
  };
}

function rowToThread(row: Row): Thread {
  const raw = rawJson<Thread>(row.raw_json, {});
  return {
    threadType: "course_home",
    latestEventSeq: 0,
    pendingApprovalCount: 0,
    ...raw,
    id: stringValue(row.id),
    semesterId: stringValue(row.semester_id),
    courseId: stringValue(row.course_id),
    taskId: nullableString(row.task_id),
    title: stringValue(row.title),
    latestRunStatus: stringValue(row.status) as Thread["latestRunStatus"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function rowsToFileTree(rows: Row[]): WorkspaceFileNode[] {
  const entries = rows.map((row) => {
    const raw = rawJson<WorkspaceFileNode>(row.raw_json, {});
    const node: WorkspaceFileNode = {
      ...raw,
      id: stringValue(row.id),
      semesterId: stringValue(row.semester_id),
      courseId: stringValue(row.course_id),
      taskId: nullableString(row.task_id),
      taskFileBucket: nullableString(row.task_file_bucket) as WorkspaceFileNode["taskFileBucket"],
      sectionKind: nullableString(row.section_kind) as WorkspaceFileNode["sectionKind"],
      weekNumber: numberValue(row.week_number),
      sourcePath: nullableString(row.source_path),
      name: stringValue(row.name),
      path: stringValue(row.path),
      kind: stringValue(row.kind) as WorkspaceFileKind,
      updatedAt: stringValue(row.updated_at),
      children: stringValue(row.kind) === "folder" ? [] : undefined,
    };
    return { node, parentId: nullableString(row.parent_id) };
  });
  const byId = new Map(entries.map((entry) => [entry.node.id, entry.node]));
  const roots: WorkspaceFileNode[] = [];
  for (const entry of entries) {
    const parent = entry.parentId ? byId.get(entry.parentId) : undefined;
    if (parent) {
      parent.children ||= [];
      parent.children.push(entry.node);
    } else {
      roots.push(entry.node);
    }
  }
  return roots;
}

function rowToTimetableEvent(row: Row): TimetableEvent {
  return {
    ...rawJson<TimetableEvent>(row.raw_json, {}),
    id: stringValue(row.id),
    semesterId: stringValue(row.semester_id),
    courseId: nullableString(row.course_id),
    taskId: nullableString(row.task_id),
    title: stringValue(row.title),
    kind: stringValue(row.kind) as TimetableEventKind,
    source: stringValue(row.source) as TimetableEventSource,
    startsAt: stringValue(row.starts_at),
    endsAt: nullableString(row.ends_at),
    location: nullableString(row.location),
    notes: nullableString(row.notes),
  };
}

function rowToProvider(row: Row): ModelProviderConfig {
  const config = rawJson<{ agentTools?: ModelProviderConfig["agentTools"] }>(row.config_json, {});
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    protocol: stringValue(row.protocol) as ModelProviderConfig["protocol"],
    baseUrl: stringValue(row.base_url),
    apiKeyMasked: stringValue(row.api_key_masked),
    apiKeySecretRef: nullableString(row.api_key_secret_ref),
    chatModel: nullableString(row.chat_model),
    embeddingModel: nullableString(row.embedding_model),
    multimodalModel: nullableString(row.multimodal_model),
    enabled: boolValue(row.enabled),
    embeddingEnabled: boolValue(row.embedding_enabled),
    agentTools: config.agentTools,
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function rowToIndexingJob(row: Row): IndexingJob {
  return {
    id: stringValue(row.id),
    semesterId: stringValue(row.semester_id),
    courseId: stringValue(row.course_id),
    sectionId: nullableString(row.section_id),
    status: stringValue(row.status) as IndexingJob["status"],
    stage: nullableString(row.stage),
    embeddingModel: stringValue(row.embedding_model),
    indexedFiles: numberValue(row.indexed_files) || 0,
    totalFiles: numberValue(row.total_files) || 0,
    completedFiles: numberValue(row.completed_files) || 0,
    progress: numberValue(row.progress) || 0,
    error: nullableString(row.error),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function rowToIndexingTask(row: Row): IndexingTaskRecord {
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id),
    semesterId: stringValue(row.semester_id),
    courseId: stringValue(row.course_id),
    sectionId: nullableString(row.section_id),
    fileId: stringValue(row.file_id),
    kind: stringValue(row.kind) as IndexingTaskRecord["kind"],
    status: stringValue(row.status) as IndexingTaskRecord["status"],
    attempts: numberValue(row.attempts) || 0,
    maxAttempts: numberValue(row.max_attempts) || 3,
    lockedBy: nullableString(row.locked_by),
    lockedUntil: nullableString(row.locked_until),
    nextRunAt: stringValue(row.next_run_at),
    progress: numberValue(row.progress) || 0,
    error: nullableString(row.error),
    payload: rawJson<IndexingTaskRecord["payload"]>(row.payload_json, {}) as IndexingTaskRecord["payload"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function flattenFileTree(files: WorkspaceFileNode[], parentId?: string): Array<{ node: WorkspaceFileNode; parentId?: string }> {
  return files.flatMap((node) => [
    { node, parentId },
    ...flattenFileTree(node.children || [], node.id),
  ]);
}

function rawJson<T>(value: unknown, fallback: Partial<T>): Partial<T> {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as Partial<T>;
  } catch {
    return fallback;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function nullableString(value: unknown): string | undefined {
  const text = stringValue(value);
  return text ? text : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function intBool(value: boolean): number {
  return value ? 1 : 0;
}

function boolValue(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

function openDatabase(dbPath: string): SQLiteDatabaseSync {
  try {
    const sqlite = require("node:sqlite") as SQLiteModule;
    return new sqlite.DatabaseSync(dbPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`node:sqlite is unavailable in this Electron runtime: ${detail}`);
  }
}
