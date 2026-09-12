export type CourseStatus = "Not Started" | "In Progress" | "Completed";
export type CoursePriority = "Low" | "Medium" | "High";

export type ResourceType =
  | "YouTube"
  | "freeCodeCamp"
  | "Coursera"
  | "Documentation"
  | "Book"
  | "Other";

export type LearningResource = {
  id: string;
  title: string;
  url: string;
  provider: ResourceType;
  note?: string;
};

export type CourseModule = {
  id: string;
  title: string;
  done: boolean;
};

export type Course = {
  id: string;
  name: string;
  description: string;
  target_date: string;
  status: CourseStatus;
  priority: CoursePriority;
  notes: string;
  tags: string[];
  modules: CourseModule[];
  resources: LearningResource[];
  created_at: string;
  updated_at: string;
};

export type CourseInput = {
  name: string;
  description: string;
  target_date: string;
  status: CourseStatus;
  priority: CoursePriority;
  notes: string;
  tags: string[];
  modules: CourseModule[];
  resources: LearningResource[];
};

export const COURSE_STATUSES: CourseStatus[] = [
  "Not Started",
  "In Progress",
  "Completed",
];

export const COURSE_PRIORITIES: CoursePriority[] = ["Low", "Medium", "High"];

export const RESOURCE_TYPES: ResourceType[] = [
  "YouTube",
  "freeCodeCamp",
  "Coursera",
  "Documentation",
  "Book",
  "Other",
];

export function courseProgress(course: Course): number {
  if (!course.modules.length) return 0;
  const done = course.modules.filter((module) => module.done).length;
  return Math.round((done / course.modules.length) * 100);
}

export function isOverdue(course: Course, today = new Date()): boolean {
  if (course.status === "Completed" || !course.target_date) return false;
  const target = new Date(`${course.target_date}T23:59:59`);
  return target.getTime() < today.getTime();
}

export function isDueSoon(
  course: Course,
  today = new Date(),
  days = 7,
): boolean {
  if (
    course.status === "Completed" ||
    !course.target_date ||
    isOverdue(course, today)
  ) {
    return false;
  }
  const target = new Date(`${course.target_date}T23:59:59`);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return target.getTime() <= limit.getTime();
}

export function createClientId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
