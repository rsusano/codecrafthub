import type {
  Course,
  CourseInput,
  CourseModule,
  LearningResource,
  ResourceType,
} from "@/lib/types";
import {
  COURSE_PRIORITIES,
  COURSE_STATUSES,
  RESOURCE_TYPES,
  createClientId,
} from "@/lib/types";
import { buildWorkingResourceUrl } from "@/lib/learning-links";

export const COURSES_STORAGE_KEY = "codecrafthub.courses.v1";

function normalizeModules(modules: unknown): CourseModule[] {
  if (!Array.isArray(modules)) return [];
  return modules
    .map((module) => {
      const item = module as Partial<CourseModule>;
      if (!item?.title?.trim()) return null;
      return {
        id: item.id?.trim() || createClientId("mod"),
        title: item.title.trim(),
        done: Boolean(item.done),
      };
    })
    .filter((module): module is CourseModule => module !== null);
}

function normalizeResources(
  resources: unknown,
  courseName = "",
): LearningResource[] {
  if (!Array.isArray(resources)) return [];
  const normalized: LearningResource[] = [];
  for (const resource of resources) {
    const item = resource as Partial<LearningResource>;
    if (!item?.title?.trim()) continue;
    const provider = RESOURCE_TYPES.includes(item.provider as ResourceType)
      ? (item.provider as ResourceType)
      : "Other";
    const note = item.note?.trim();
    const title = item.title.trim();
    const linkTopic =
      provider === "Documentation"
        ? `${courseName} ${title} ${note ?? ""}`
        : courseName || title;
    normalized.push({
      id: item.id?.trim() || createClientId("res"),
      title,
      url: buildWorkingResourceUrl(provider, linkTopic, item.url?.trim()),
      provider,
      ...(note ? { note } : {}),
    });
  }
  return normalized;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((tag) => tag.toLowerCase()),
    ),
  ];
}

export function normalizeCourse(
  raw: Partial<Course> & { id?: string },
): Course | null {
  if (!raw?.name?.trim()) return null;
  const now = new Date().toISOString();
  return {
    id: raw.id?.trim() || createClientId("course"),
    name: String(raw.name).trim(),
    description: String(raw.description ?? "").trim(),
    target_date: String(raw.target_date ?? ""),
    status: COURSE_STATUSES.includes(raw.status as Course["status"])
      ? (raw.status as Course["status"])
      : "Not Started",
    priority: COURSE_PRIORITIES.includes(raw.priority as Course["priority"])
      ? (raw.priority as Course["priority"])
      : "Medium",
    notes: String(raw.notes ?? ""),
    tags: normalizeTags(raw.tags),
    modules: normalizeModules(raw.modules),
    resources: normalizeResources(raw.resources, String(raw.name ?? "")),
    created_at: String(raw.created_at ?? now),
    updated_at: String(raw.updated_at ?? raw.created_at ?? now),
  };
}

function validateInput(input: CourseInput): string | null {
  if (!input.name?.trim()) return "Course name is required.";
  if (!input.description?.trim()) return "Description is required.";
  if (!input.target_date) return "Target date is required.";
  if (!COURSE_STATUSES.includes(input.status)) return "Invalid status.";
  if (!COURSE_PRIORITIES.includes(input.priority)) return "Invalid priority.";
  return null;
}

function toCourseFields(input: CourseInput) {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    target_date: input.target_date,
    status: input.status,
    priority: input.priority,
    notes: input.notes?.trim() ?? "",
    tags: normalizeTags(input.tags),
    modules: normalizeModules(input.modules),
    resources: normalizeResources(input.resources, input.name),
  };
}

export function loadLocalCourses(): Course[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COURSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeCourse(item as Partial<Course>))
      .filter((course): course is Course => course !== null)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
  } catch {
    return [];
  }
}

export function saveLocalCourses(courses: Course[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COURSES_STORAGE_KEY,
      JSON.stringify(courses),
    );
  } catch {
    // Ignore quota / private mode
  }
}

export function createLocalCourse(
  input: CourseInput,
): { course?: Course; error?: string } {
  const error = validateInput(input);
  if (error) return { error };
  const now = new Date().toISOString();
  const course: Course = {
    id: createClientId("course"),
    ...toCourseFields(input),
    created_at: now,
    updated_at: now,
  };
  const courses = loadLocalCourses();
  courses.unshift(course);
  saveLocalCourses(courses);
  return { course };
}

export function updateLocalCourse(
  id: string,
  input: CourseInput,
): { course?: Course; error?: string; notFound?: boolean } {
  const error = validateInput(input);
  if (error) return { error };
  const courses = loadLocalCourses();
  const index = courses.findIndex((course) => course.id === id);
  if (index === -1) return { notFound: true };
  const updated: Course = {
    ...courses[index],
    ...toCourseFields(input),
    updated_at: new Date().toISOString(),
  };
  courses[index] = updated;
  saveLocalCourses(courses);
  return { course: updated };
}

export function deleteLocalCourse(
  id: string,
): { ok?: boolean; notFound?: boolean } {
  const courses = loadLocalCourses();
  const next = courses.filter((course) => course.id !== id);
  if (next.length === courses.length) return { notFound: true };
  saveLocalCourses(next);
  return { ok: true };
}

export function replaceLocalCourses(
  incoming: CourseInput[] | Course[],
): { courses: Course[]; error?: string } {
  if (!Array.isArray(incoming)) {
    return { courses: [], error: "Import payload must be an array." };
  }
  const now = new Date().toISOString();
  const courses: Course[] = [];
  for (const item of incoming) {
    const candidate = normalizeCourse({
      ...(item as Course),
      id: (item as Course).id || createClientId("course"),
      created_at: (item as Course).created_at || now,
      updated_at: now,
    });
    if (!candidate?.name?.trim() || !candidate.description?.trim()) {
      return {
        courses: [],
        error: "Each imported course needs at least a name and description.",
      };
    }
    if (!candidate.target_date) {
      return {
        courses: [],
        error: "Each imported course needs a target_date (YYYY-MM-DD).",
      };
    }
    courses.push(candidate);
  }
  saveLocalCourses(courses);
  return { courses };
}
