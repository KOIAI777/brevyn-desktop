import type { Course, SemesterWorkspace } from "../../types/domain";
import type { SQLiteBusinessStore } from "../storage";
import { SEMESTER_HOME_COURSE_ID } from "./workspace-paths";

export function currentActiveSemester(businessStore: SQLiteBusinessStore): SemesterWorkspace | null {
  const currentId = businessStore.currentSemesterId() || "";
  if (!currentId) return null;
  const current = businessStore.getSemester(currentId);
  return current && !current.archivedAt ? current : null;
}

export function currentActiveSemesterId(businessStore: SQLiteBusinessStore): string {
  return currentActiveSemester(businessStore)?.id || "";
}

export function isSemesterArchived(businessStore: SQLiteBusinessStore, semesterId?: string): boolean {
  if (!semesterId) return false;
  return Boolean(businessStore.getSemester(semesterId)?.archivedAt);
}

export function isCurrentSemesterArchived(businessStore: SQLiteBusinessStore): boolean {
  const semesterId = businessStore.currentSemesterId() || "";
  return isSemesterArchived(businessStore, semesterId);
}

export function isCourseArchived(businessStore: SQLiteBusinessStore, courseId: string): boolean {
  if (courseId === SEMESTER_HOME_COURSE_ID) return isCurrentSemesterArchived(businessStore);
  const course = businessStore.getCourse(courseId);
  if (!course) return false;
  return Boolean(course.archivedAt || isSemesterArchived(businessStore, course.semesterId));
}

export function archivedCourseIdsForSemester(businessStore: SQLiteBusinessStore, semesterId: string): string[] {
  if (!semesterId) return [];
  return businessStore.listCourses(semesterId)
    .filter((course) => Boolean(course.archivedAt))
    .map((course) => course.id);
}

export function activeCourseOrThrow(businessStore: SQLiteBusinessStore, courseId: string): Course {
  const course = businessStore.getCourse(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);
  if (course.archivedAt || isSemesterArchived(businessStore, course.semesterId)) {
    throw new Error("Restore this course before using it.");
  }
  return course;
}
