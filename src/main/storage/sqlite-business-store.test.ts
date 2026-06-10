import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrevynTask, Course, IndexingJob, SemesterWorkspace, Thread } from "../../types/domain";
import type { IndexingTaskInsert } from "../indexing";
import { SQLiteBusinessStore } from "./sqlite-business-store";

const tempDir = mkdtempSync(join(tmpdir(), "brevyn-business-store-"));
const store = new SQLiteBusinessStore(join(tempDir, "business.sqlite"));

try {
  store.saveSemester(testSemester());
  store.saveCourse(testCourse());
  const task = testTask();
  store.saveTask(task);

  assert.equal(store.listTasks("semester_test", "course_test").length, 1);
  const archivedTask = store.archiveTask(task.id, "2026-05-25T00:00:00.000Z");
  assert.equal(archivedTask?.archivedAt, "2026-05-25T00:00:00.000Z");
  assert.equal(store.listTasks("semester_test", "course_test").length, 0);
  assert.equal(store.listArchivedTasks("semester_test", "course_test").length, 1);
  const restoredTask = store.restoreTask(task.id);
  assert.equal(restoredTask?.archivedAt, undefined);
  assert.equal(store.listTasks("semester_test", "course_test").length, 1);
  const renamedTask = store.updateTask({ id: task.id, title: "Final Essay", taskType: "Essay" });
  assert.equal(renamedTask?.id, task.id);
  assert.equal(renamedTask?.title, "Final Essay");
  assert.equal(renamedTask?.taskType, "Essay");
  assert.equal(store.getTask(task.id)?.title, "Final Essay");

  const thread = testThread();
  store.saveThread(thread);
  store.recordThreadMessage(thread.id, "2026-05-25T00:00:01.000Z");
  store.recordThreadMessage(thread.id, "2026-05-25T00:00:02.000Z");

  assert.equal(store.renameThreadAutomatically(thread.id, "Should Not Apply"), null);

  const updated = store.renameThreadAutomatically(thread.id, "宏观经济研读", "2026-05-25T00:00:03.000Z", {
    allowAfterFirstMessage: true,
  });
  assert.equal(updated?.title, "宏观经济研读");
  assert.equal(updated?.titleSource, "auto");
  const withSdkSession = store.updateThreadSdkSessionId(thread.id, "sdk-session-123");
  assert.equal(withSdkSession?.sdkSessionId, "sdk-session-123");
  assert.equal(store.getThread(thread.id)?.sdkSessionId, "sdk-session-123");
  const clearedSdkSession = store.updateThreadSdkSessionId(thread.id, undefined);
  assert.equal(clearedSdkSession?.sdkSessionId, undefined);
  assert.equal(store.getThread(thread.id)?.sdkSessionId, undefined);

  const manualThread = testThread("thread_manual");
  store.saveThread(manualThread);
  store.renameThread(manualThread.id, "用户自定义标题");
  assert.equal(
    store.renameThreadAutomatically(manualThread.id, "Should Not Override", "2026-05-25T00:00:04.000Z", {
      allowAfterFirstMessage: true,
    }),
    null,
  );

  const indexingJob = testIndexingJob();
  store.createIndexingJob(indexingJob, [testIndexingTask("idx-task-1", indexingJob.id, "file-a")]);
  const appendedJob = store.appendIndexingTasksToJob(indexingJob.id, [
    testIndexingTask("idx-task-duplicate-existing", indexingJob.id, "file-a"),
    testIndexingTask("idx-task-2", indexingJob.id, "file-b"),
    testIndexingTask("idx-task-duplicate-incoming", indexingJob.id, "file-b"),
  ]);
  assert.equal(appendedJob?.totalFiles, 2);
} finally {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("sqlite-business-store tests passed");

function testThread(id = "thread_title_race"): Thread {
  return {
    id,
    semesterId: "semester_test",
    courseId: "course_test",
    threadType: "task",
    title: "学期会话",
    titleSource: "default",
    isDraft: true,
    messageCount: 1,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}

function testSemester(): SemesterWorkspace {
  return {
    id: "semester_test",
    semesterNo: "test",
    term: "Test Term",
    folderName: "Test Term",
    source: "manual",
  };
}

function testCourse(): Course {
  return {
    id: "course_test",
    semesterId: "semester_test",
    name: "Test Course",
    code: "TEST100",
    term: "Test Term",
    instructor: "",
    color: "#d8c7a1",
    description: "",
  };
}

function testTask(): BrevynTask {
  return {
    id: "task_test",
    semesterId: "semester_test",
    courseId: "course_test",
    title: "Reading response",
    taskType: "作业",
    status: "not_started",
    summary: "",
  };
}

function testIndexingJob(): IndexingJob {
  return {
    id: "index_test",
    semesterId: "semester_test",
    courseId: "course_test",
    sectionId: "course_test:shared",
    status: "queued",
    stage: "queued",
    embeddingModel: "text-embedding-test",
    indexedFiles: 0,
    totalFiles: 1,
    completedFiles: 0,
    progress: 0,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}

function testIndexingTask(id: string, jobId: string, fileId: string): IndexingTaskInsert {
  return {
    id,
    jobId,
    semesterId: "semester_test",
    courseId: "course_test",
    sectionId: "course_test:shared",
    fileId,
    kind: "parse_chunk",
    payload: {
      semesterId: "semester_test",
      courseId: "course_test",
      sectionId: "course_test:shared",
      fileId,
      name: `${fileId}.pdf`,
      path: `/course/${fileId}.pdf`,
      sourcePath: `/tmp/${fileId}.pdf`,
      kind: "pdf",
    },
  };
}
