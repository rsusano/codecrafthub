import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  Course,
  CourseInput,
  CourseModule,
  LearningResource,
  ResourceType,
} from "./types";
import { COURSE_PRIORITIES, COURSE_STATUSES, RESOURCE_TYPES } from "./types";
import { buildWorkingResourceUrl } from "./learning-links";

const BUNDLE_DIR = path.join(process.cwd(), "data");
const BUNDLE_FILE = path.join(BUNDLE_DIR, "courses.json");
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? "/tmp" : BUNDLE_DIR;
const DATA_FILE = IS_VERCEL
  ? path.join("/tmp", "codecrafthub-courses.json")
  : BUNDLE_FILE;

async function ensureStore(): Promise<void> {
  if (!IS_VERCEL) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.access(DATA_FILE);
  } catch {
    let seed = "[]";
    if (IS_VERCEL) {
      try {
        seed = await fs.readFile(BUNDLE_FILE, "utf8");
      } catch {
        seed = "[]";
      }
    }
    await fs.writeFile(DATA_FILE, seed, "utf8");
  }
}

function normalizeModules(modules: unknown): CourseModule[] {
  if (!Array.isArray(modules)) return [];
  return modules
    .map((module) => {
      const item = module as Partial<CourseModule>;
      if (!item?.title?.trim()) return null;
      return {
        id: item.id?.trim() || randomUUID(),
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
      id: item.id?.trim() || randomUUID(),
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

function normalizeCourse(raw: Partial<Course> & { id?: string }): Course | null {
  if (!raw?.id || !raw.name) return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    name: String(raw.name),
    description: String(raw.description ?? ""),
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

async function readCourses(): Promise<Course[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeCourse(item as Partial<Course>))
      .filter((course): course is Course => course !== null);
  } catch {
    return [];
  }
}

async function writeCourses(courses: Course[]): Promise<void> {
  await ensureStore();
  await fs.writeFile(DATA_FILE, JSON.stringify(courses, null, 2), "utf8");
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

export async function listCourses(): Promise<Course[]> {
  const courses = await readCourses();
  // Persist repaired resource URLs so older AI-invented links stay fixed on disk
  const needsWrite = courses.some((course) =>
    course.resources.some((resource) => {
      const fixed = buildWorkingResourceUrl(
        resource.provider,
        resource.provider === "Documentation"
          ? `${course.name} ${resource.title} ${resource.note ?? ""}`
          : course.name,
        resource.url,
      );
      return fixed !== resource.url;
    }),
  );
  if (needsWrite) {
    try {
      await writeCourses(courses);
    } catch {
      // Read-only / ephemeral hosts may block repair writes; still return courses.
    }
  }
  return courses.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export async function getCourse(id: string): Promise<Course | null> {
  const courses = await readCourses();
  return courses.find((course) => course.id === id) ?? null;
}

export async function createCourse(
  input: CourseInput,
): Promise<{ course?: Course; error?: string }> {
  const error = validateInput(input);
  if (error) return { error };

  const now = new Date().toISOString();
  const course: Course = {
    id: randomUUID(),
    ...toCourseFields(input),
    created_at: now,
    updated_at: now,
  };

  const courses = await readCourses();
  courses.push(course);
  await writeCourses(courses);
  return { course };
}

export async function updateCourse(
  id: string,
  input: CourseInput,
): Promise<{ course?: Course; error?: string; notFound?: boolean }> {
  const error = validateInput(input);
  if (error) return { error };

  const courses = await readCourses();
  const index = courses.findIndex((course) => course.id === id);
  if (index === -1) return { notFound: true };

  const updated: Course = {
    ...courses[index],
    ...toCourseFields(input),
    updated_at: new Date().toISOString(),
  };

  courses[index] = updated;
  await writeCourses(courses);
  return { course: updated };
}

export async function deleteCourse(
  id: string,
): Promise<{ ok?: boolean; notFound?: boolean }> {
  const courses = await readCourses();
  const next = courses.filter((course) => course.id !== id);
  if (next.length === courses.length) return { notFound: true };
  await writeCourses(next);
  return { ok: true };
}

export async function replaceCourses(
  incoming: CourseInput[] | Course[],
): Promise<{ courses: Course[]; error?: string }> {
  if (!Array.isArray(incoming)) {
    return { courses: [], error: "Import payload must be an array." };
  }

  const now = new Date().toISOString();
  const courses: Course[] = [];

  for (const item of incoming) {
    const candidate = normalizeCourse({
      ...(item as Course),
      id: (item as Course).id || randomUUID(),
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

  await writeCourses(courses);
  return { courses };
}
