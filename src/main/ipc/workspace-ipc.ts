import { ipcMain } from "electron";
import type { ArchivedCourseScope, ArchivedThreadScope, CreateCourseInput, CreateSemesterInput, CreateTaskInput, CreateThreadInput, UpdateTaskInput } from "../../types/domain";
import { IPC_CHANNELS } from "../../types/ipc";
import type { IpcContext } from "./context";

export function registerWorkspaceIpc({ store }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.semesterList, () => store.listSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterListArchived, () => store.listArchivedSemesters());
  ipcMain.handle(IPC_CHANNELS.semesterCurrent, () => store.currentSemester());
  ipcMain.handle(IPC_CHANNELS.semesterCreate, (_event, input: CreateSemesterInput) => store.createSemester(input));
  ipcMain.handle(IPC_CHANNELS.semesterSelect, (_event, semesterId: string) => store.selectSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterArchive, (_event, semesterId: string) => store.archiveSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterRestore, (_event, semesterId: string) => store.restoreSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.semesterDelete, (_event, semesterId: string) => store.deleteSemester(semesterId));
  ipcMain.handle(IPC_CHANNELS.coursesList, () => store.listCourses());
  ipcMain.handle(IPC_CHANNELS.coursesListArchived, (_event, scope?: ArchivedCourseScope) => store.listArchivedCourses(scope));
  ipcMain.handle(IPC_CHANNELS.coursesCreate, (_event, input: CreateCourseInput) => store.createCourse(input));
  ipcMain.handle(IPC_CHANNELS.coursesArchive, (_event, courseId: string) => store.archiveCourse(courseId));
  ipcMain.handle(IPC_CHANNELS.coursesRestore, (_event, courseId: string) => store.restoreCourse(courseId));
  ipcMain.handle(IPC_CHANNELS.coursesDelete, (_event, courseId: string) => store.deleteCourse(courseId));
  ipcMain.handle(IPC_CHANNELS.tasksList, (_event, courseId: string) => store.listTasks(courseId));
  ipcMain.handle(IPC_CHANNELS.tasksCreate, (_event, input: CreateTaskInput) => store.createTask(input));
  ipcMain.handle(IPC_CHANNELS.tasksUpdate, (_event, input: UpdateTaskInput) => store.updateTask(input));
  ipcMain.handle(IPC_CHANNELS.tasksDelete, (_event, taskId: string) => store.deleteTask(taskId));
  ipcMain.handle(IPC_CHANNELS.threadsList, (_event, courseId?: string) => store.listThreads(courseId));
  ipcMain.handle(IPC_CHANNELS.threadsListArchived, (_event, scope?: ArchivedThreadScope) => store.listArchivedThreads(scope));
  ipcMain.handle(IPC_CHANNELS.threadsCreate, (_event, input: CreateThreadInput) => store.createThread(input));
  ipcMain.handle(IPC_CHANNELS.threadsArchive, (_event, threadId: string) => store.archiveThread(threadId));
  ipcMain.handle(IPC_CHANNELS.threadsRestore, (_event, threadId: string) => store.restoreThread(threadId));
  ipcMain.handle(IPC_CHANNELS.threadsDelete, (_event, threadId: string) => store.deleteThread(threadId));
  ipcMain.handle(IPC_CHANNELS.gitStatus, () => store.gitStatus());
}
