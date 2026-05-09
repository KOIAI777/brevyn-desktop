import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";
import {
  normalizeArchivedCourseScope,
  normalizeArchivedThreadScope,
  normalizeCreateCourseInput,
  normalizeCreateSemesterInput,
  normalizeCreateTaskInput,
  normalizeCreateThreadInput,
  normalizeUpdateCourseInput,
  normalizeUpdateTaskInput,
  optionalString,
  requireString,
} from "./validation";

export function registerWorkspaceIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.semesterList, () => store.listSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterListArchived, () => store.listArchivedSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterCurrent, () => store.currentSemester());
  ipcMain.handle(IPC_CHANNELS.semesterCreate, (_event, input: unknown) => store.createSemester(normalizeCreateSemesterInput(input)));
  ipcMain.handle(IPC_CHANNELS.semesterSelect, (_event, semesterId: unknown) => store.selectSemester(requireString(semesterId, "Semester id")));
  ipcMain.handle(IPC_CHANNELS.semesterArchive, (_event, semesterId: unknown) => store.archiveSemester(requireString(semesterId, "Semester id")));
  ipcMain.handle(IPC_CHANNELS.semesterRestore, (_event, semesterId: unknown) => store.restoreSemester(requireString(semesterId, "Semester id")));
  ipcMain.handle(IPC_CHANNELS.semesterDelete, (_event, semesterId: unknown) => store.deleteSemester(requireString(semesterId, "Semester id")));
  ipcMain.handle(IPC_CHANNELS.coursesList, () => store.listCourses());
  ipcMain.handle(IPC_CHANNELS.coursesListArchived, (_event, scope?: unknown) => store.listArchivedCourses(normalizeArchivedCourseScope(scope)));
  ipcMain.handle(IPC_CHANNELS.coursesCreate, (_event, input: unknown) => store.createCourse(normalizeCreateCourseInput(input)));
  ipcMain.handle(IPC_CHANNELS.coursesUpdate, (_event, input: unknown) => store.updateCourse(normalizeUpdateCourseInput(input)));
  ipcMain.handle(IPC_CHANNELS.coursesArchive, (_event, courseId: unknown) => store.archiveCourse(requireString(courseId, "Course id")));
  ipcMain.handle(IPC_CHANNELS.coursesRestore, (_event, courseId: unknown) => store.restoreCourse(requireString(courseId, "Course id")));
  ipcMain.handle(IPC_CHANNELS.coursesDelete, (_event, courseId: unknown) => store.deleteCourse(requireString(courseId, "Course id")));
  ipcMain.handle(IPC_CHANNELS.tasksList, (_event, courseId: unknown) => store.listTasks(requireString(courseId, "Course id")));
  ipcMain.handle(IPC_CHANNELS.tasksCreate, (_event, input: unknown) => store.createTask(normalizeCreateTaskInput(input)));
  ipcMain.handle(IPC_CHANNELS.tasksUpdate, (_event, input: unknown) => store.updateTask(normalizeUpdateTaskInput(input)));
  ipcMain.handle(IPC_CHANNELS.tasksDelete, (_event, taskId: unknown) => store.deleteTask(requireString(taskId, "Task id")));
  ipcMain.handle(IPC_CHANNELS.threadsList, (_event, courseId?: unknown) => store.listThreads(optionalString(courseId)));
  ipcMain.handle(IPC_CHANNELS.threadsListArchived, (_event, scope?: unknown) => store.listArchivedThreads(normalizeArchivedThreadScope(scope)));
  ipcMain.handle(IPC_CHANNELS.threadsCreate, (_event, input: unknown) => store.createThread(normalizeCreateThreadInput(input)));
  ipcMain.handle(IPC_CHANNELS.threadsArchive, (_event, threadId: unknown) => store.archiveThread(requireString(threadId, "Thread id")));
  ipcMain.handle(IPC_CHANNELS.threadsRestore, (_event, threadId: unknown) => store.restoreThread(requireString(threadId, "Thread id")));
  ipcMain.handle(IPC_CHANNELS.threadsDelete, (_event, threadId: unknown) => store.deleteThread(requireString(threadId, "Thread id")));
  ipcMain.handle(IPC_CHANNELS.gitStatus, () => store.gitStatus());
}
