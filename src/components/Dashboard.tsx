"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import AiQuotaBadge, { useAiQuota } from "@/components/AiQuotaBadge";
import { useAuth } from "@/components/AuthProvider";
import {
  createLocalCourse,
  deleteLocalCourse,
  loadLocalCourses,
  replaceLocalCourses,
  updateLocalCourse,
} from "@/lib/courses-local";
import {
  DEFAULT_CHAT_WELCOME,
  loadChatHistory,
} from "@/lib/chat-storage";
import type {
  Course,
  CourseInput,
  CourseModule,
  CoursePriority,
  CourseStatus,
  LearningResource,
  ResourceType,
} from "@/lib/types";
import {
  COURSE_PRIORITIES,
  COURSE_STATUSES,
  RESOURCE_TYPES,
  courseProgress,
  createClientId,
  isDueSoon,
  isOverdue,
} from "@/lib/types";

type SortKey = "updated" | "due" | "priority" | "progress" | "name";
type ViewFilter = "All" | CourseStatus | "Overdue" | "Due soon";

const emptyForm: CourseInput = {
  name: "",
  description: "",
  target_date: "",
  status: "Not Started",
  priority: "Medium",
  notes: "",
  tags: [],
  modules: [],
  resources: [],
};

const priorityWeight: Record<CoursePriority, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusClass(status: CourseStatus): string {
  switch (status) {
    case "Completed":
      return "badge badge-completed";
    case "In Progress":
      return "badge badge-progress";
    default:
      return "badge badge-not-started";
  }
}

function priorityClass(priority: CoursePriority): string {
  switch (priority) {
    case "High":
      return "badge badge-high";
    case "Low":
      return "badge badge-low";
    default:
      return "badge badge-medium";
  }
}

export default function Dashboard() {
  const { persistWorkspace, user } = useAuth();
  const { quota, refresh: refreshQuota, setQuota } = useAiQuota();
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<CourseInput>(emptyForm);
  const [tagDraft, setTagDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = courses.length;
    const completed = courses.filter((c) => c.status === "Completed").length;
    const inProgress = courses.filter((c) => c.status === "In Progress").length;
    const overdue = courses.filter((c) => isOverdue(c)).length;
    const dueSoon = courses.filter((c) => isDueSoon(c)).length;
    const avgProgress =
      total === 0
        ? 0
        : Math.round(
            courses.reduce((sum, course) => sum + courseProgress(course), 0) /
              total,
          );
    return { total, completed, inProgress, overdue, dueSoon, avgProgress };
  }, [courses]);

  const visibleCourses = useMemo(() => {
    let list = [...courses];

    if (filter === "Overdue") list = list.filter((c) => isOverdue(c));
    else if (filter === "Due soon") list = list.filter((c) => isDueSoon(c));
    else if (filter !== "All") list = list.filter((c) => c.status === filter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((course) => {
        const haystack = [
          course.name,
          course.description,
          course.notes,
          ...course.tags,
          ...course.modules.map((m) => m.title),
          ...course.resources.map((r) => `${r.title} ${r.provider}`),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "due":
          return a.target_date.localeCompare(b.target_date);
        case "priority":
          return priorityWeight[b.priority] - priorityWeight[a.priority];
        case "progress":
          return courseProgress(b) - courseProgress(a);
        default:
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
      }
    });

    return list;
  }, [courses, filter, search, sortKey]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedId) ?? null,
    [courses, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedId]);

  async function syncWorkspace(nextCourses: Course[]) {
    setCourses(nextCourses);
    await persistWorkspace({
      courses: nextCourses,
      chat_messages: loadChatHistory([DEFAULT_CHAT_WELCOME]),
    });
  }

  function loadCourses() {
    setLoading(true);
    setError(null);
    try {
      setCourses(loadLocalCourses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
    function onReload() {
      setCourses(loadLocalCourses());
    }
    window.addEventListener("codecrafthub:workspace-reloaded", onReload);
    return () => {
      window.removeEventListener("codecrafthub:workspace-reloaded", onReload);
    };
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setTagDraft("");
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const result = editingId
        ? updateLocalCourse(editingId, form)
        : createLocalCourse(form);
      if (result.error) throw new Error(result.error);
      if ("notFound" in result && result.notFound) {
        throw new Error("Course not found.");
      }
      setMessage(
        editingId
          ? "Course updated on this device."
          : "Course added on this device.",
      );
      resetForm();
      await syncWorkspace(loadLocalCourses());
      if (user) setMessage((prev) => `${prev} Synced to your account.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(course: Course) {
    setSelectedId(null);
    setEditingId(course.id);
    setForm({
      name: course.name,
      description: course.description,
      target_date: course.target_date,
      status: course.status,
      priority: course.priority,
      notes: course.notes,
      tags: course.tags,
      modules: course.modules,
      resources: course.resources,
    });
    setTagDraft("");
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this course? This cannot be undone.")) return;
    setError(null);
    setMessage(null);
    try {
      const result = deleteLocalCourse(id);
      if (result.notFound) throw new Error("Course not found.");
      setMessage("Course removed.");
      if (editingId === id) resetForm();
      if (selectedId === id) setSelectedId(null);
      await syncWorkspace(loadLocalCourses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function runAi(
    mode: "description" | "outline" | "resources" | "full",
  ) {
    if (!form.name.trim()) {
      setError("Enter a course name first, then use AI suggestions.");
      return;
    }

    setAiBusy(mode);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, mode }),
      });
      const data = await response.json();
      if (data.quota) setQuota(data.quota);
      else void refreshQuota();
      if (!response.ok) throw new Error(data.error || "AI suggestion failed.");

      setForm((prev) => {
        const next = { ...prev };
        if (typeof data.description === "string" && data.description.trim()) {
          next.description = data.description.trim();
        }
        if (Array.isArray(data.outline) && data.outline.length) {
          next.modules = data.outline.map((title: string) => ({
            id: createClientId("mod"),
            title: String(title),
            done: false,
          }));
          if (next.status === "Not Started") next.status = "In Progress";
        }
        if (Array.isArray(data.resources) && data.resources.length) {
          next.resources = data.resources.map(
            (resource: {
              title: string;
              url: string;
              provider: ResourceType;
              note?: string;
            }) => ({
              id: createClientId("res"),
              title: resource.title,
              url: resource.url,
              provider: resource.provider,
              note: resource.note,
            }),
          );
        }
        return next;
      });

      const label =
        mode === "full"
          ? "AI filled description, outline, and where to learn."
          : mode === "resources"
            ? "AI suggested where to learn."
            : mode === "outline"
              ? "AI suggested a learning outline."
              : "AI description suggested.";

      setMessage(
        data.source === "fallback"
          ? data.message || "Used local templates."
          : label,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI suggestion failed.");
    } finally {
      setAiBusy(null);
    }
  }

  function addTag() {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags : [...prev.tags, tag],
    }));
    setTagDraft("");
  }

  function addModule() {
    setForm((prev) => ({
      ...prev,
      modules: [
        ...prev.modules,
        { id: createClientId("mod"), title: "New module", done: false },
      ],
    }));
  }

  function updateModule(id: string, patch: Partial<CourseModule>) {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.map((module) =>
        module.id === id ? { ...module, ...patch } : module,
      ),
    }));
  }

  function removeModule(id: string) {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.filter((module) => module.id !== id),
    }));
  }

  function addResource() {
    setForm((prev) => ({
      ...prev,
      resources: [
        ...prev.resources,
        {
          id: createClientId("res"),
          title: "New resource",
          url: "https://",
          provider: "Other",
        },
      ],
    }));
  }

  function updateResource(id: string, patch: Partial<LearningResource>) {
    setForm((prev) => ({
      ...prev,
      resources: prev.resources.map((resource) =>
        resource.id === id ? { ...resource, ...patch } : resource,
      ),
    }));
  }

  function removeResource(id: string) {
    setForm((prev) => ({
      ...prev,
      resources: prev.resources.filter((resource) => resource.id !== id),
    }));
  }

  function exportCourses() {
    const blob = new Blob([JSON.stringify(courses, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `codecrafthub-courses-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Exported courses JSON.");
  }

  async function importCourses(file: File) {
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Course[];
      const result = replaceLocalCourses(parsed);
      if (result.error) throw new Error(result.error);
      setMessage(`Imported ${result.courses.length} courses on this device.`);
      resetForm();
      await syncWorkspace(result.courses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    }
  }

  async function toggleModuleDone(course: Course, moduleId: string) {
    const modules = course.modules.map((module) =>
      module.id === moduleId ? { ...module, done: !module.done } : module,
    );
    const allDone = modules.length > 0 && modules.every((module) => module.done);
    const anyDone = modules.some((module) => module.done);
    const payload: CourseInput = {
      name: course.name,
      description: course.description,
      target_date: course.target_date,
      status: allDone ? "Completed" : anyDone ? "In Progress" : "Not Started",
      priority: course.priority,
      notes: course.notes,
      tags: course.tags,
      modules,
      resources: course.resources,
    };

    const result = updateLocalCourse(course.id, payload);
    if (result.error || result.notFound) {
      setError(result.error || "Could not update module.");
      return;
    }
    await syncWorkspace(loadLocalCourses());
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">IBM GenAI · Portfolio Project</p>
        <h1>CodeCraftHub</h1>
        <p className="subtitle">Your Learning Management Platform</p>
        <p className="credit">by Rafael Susano</p>
        <p className="lede">
          Plan courses, track progress, and let AI draft descriptions, outlines,
          and where to learn — YouTube, freeCodeCamp, Coursera certificates, docs,
          and more.
        </p>
        <p className="guest-tip">
          Guests can try everything on this browser. Use <strong>Sign in</strong>{" "}
          (top right) to save courses & chat to your account.
        </p>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="stat-card">
          <span>In progress</span>
          <strong>{stats.inProgress}</strong>
        </article>
        <article className="stat-card">
          <span>Completed</span>
          <strong>{stats.completed}</strong>
        </article>
        <article className="stat-card warn">
          <span>Overdue</span>
          <strong>{stats.overdue}</strong>
        </article>
        <article className="stat-card">
          <span>Due soon</span>
          <strong>{stats.dueSoon}</strong>
        </article>
        <article className="stat-card">
          <span>Avg progress</span>
          <strong>{stats.avgProgress}%</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{editingId ? "Edit course" : "Add a course"}</h2>
          <div className="head-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportCourses}>
              Export JSON
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => importRef.current?.click()}
            >
              Import JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importCourses(file);
                e.target.value = "";
              }}
            />
            {editingId ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <div className="ai-bar">
          <AiQuotaBadge quota={quota} />
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={Boolean(aiBusy)}
            onClick={() => void runAi("description")}
          >
            {aiBusy === "description" ? "Working…" : "Suggest description"}
          </button>
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={Boolean(aiBusy)}
            onClick={() => void runAi("outline")}
          >
            {aiBusy === "outline" ? "Working…" : "Suggest outline"}
          </button>
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={Boolean(aiBusy)}
            onClick={() => void runAi("resources")}
          >
            {aiBusy === "resources" ? "Working…" : "Suggest where to learn"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={Boolean(aiBusy)}
            onClick={() => void runAi("full")}
          >
            {aiBusy === "full" ? "Working…" : "Generate full plan"}
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Course name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Next.js fundamentals"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What will you learn?"
              rows={4}
              required
            />
          </label>

          <div className="grid-3">
            <label>
              Target date
              <input
                type="date"
                value={form.target_date}
                onChange={(e) =>
                  setForm({ ...form, target_date: e.target.value })
                }
                required
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as CourseStatus })
                }
              >
                {COURSE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({
                    ...form,
                    priority: e.target.value as CoursePriority,
                  })
                }
              >
                {COURSE_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Personal reminders, blockers, certificate goals…"
              rows={3}
            />
          </label>

          <div className="stack-block">
            <div className="block-head">
              <h3>Tags</h3>
            </div>
            <div className="tag-row">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Add tag (frontend, cert, etc.)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={addTag}>
                Add tag
              </button>
            </div>
            <div className="chip-row">
              {form.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="chip"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      tags: prev.tags.filter((t) => t !== tag),
                    }))
                  }
                >
                  #{tag} ×
                </button>
              ))}
            </div>
          </div>

          <div className="stack-block">
            <div className="block-head">
              <h3>Learning outline</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addModule}>
                Add module
              </button>
            </div>
            {form.modules.length === 0 ? (
              <p className="hint">Use AI outline or add modules manually.</p>
            ) : (
              <div className="module-list">
                {form.modules.map((module) => (
                  <div key={module.id} className="module-row">
                    <input
                      type="checkbox"
                      checked={module.done}
                      onChange={(e) =>
                        updateModule(module.id, { done: e.target.checked })
                      }
                    />
                    <input
                      value={module.title}
                      onChange={(e) =>
                        updateModule(module.id, { title: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeModule(module.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stack-block">
            <div className="block-head">
              <h3>Where to learn</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addResource}>
                Add resource
              </button>
            </div>
            <p className="hint">
              Links are verified working search/official pages (YouTube,
              freeCodeCamp, Coursera, docs). Fake/deep AI URLs are replaced
              automatically.
            </p>
            {form.resources.length === 0 ? (
              <p className="hint">No resources yet.</p>
            ) : (
              <div className="resource-list">
                {form.resources.map((resource) => (
                  <div key={resource.id} className="resource-editor">
                    <input
                      value={resource.title}
                      onChange={(e) =>
                        updateResource(resource.id, { title: e.target.value })
                      }
                      placeholder="Resource title"
                    />
                    <input
                      value={resource.url}
                      onChange={(e) =>
                        updateResource(resource.id, { url: e.target.value })
                      }
                      placeholder="https://"
                    />
                    <select
                      value={resource.provider}
                      onChange={(e) =>
                        updateResource(resource.id, {
                          provider: e.target.value as ResourceType,
                        })
                      }
                    >
                      {RESOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <input
                      value={resource.note ?? ""}
                      onChange={(e) =>
                        updateResource(resource.id, { note: e.target.value })
                      }
                      placeholder="Why this resource?"
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeResource(resource.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update course" : "Add course"}
          </button>
        </form>

        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-head wrap">
          <h2>Your courses</h2>
          <div className="toolbar">
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses, tags, resources…"
            />
            <select
              className="filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as ViewFilter)}
            >
              <option value="All">All</option>
              {COURSE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
              <option value="Overdue">Overdue</option>
              <option value="Due soon">Due soon</option>
            </select>
            <select
              className="filter"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="updated">Sort: updated</option>
              <option value="due">Sort: due date</option>
              <option value="priority">Sort: priority</option>
              <option value="progress">Sort: progress</option>
              <option value="name">Sort: name</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="empty">Loading courses…</p>
        ) : visibleCourses.length === 0 ? (
          <p className="empty">
            No courses match. Add one above or clear filters.
          </p>
        ) : (
          <div className="course-list" role="list">
            {visibleCourses.map((course) => {
              const progress = courseProgress(course);
              const overdue = isOverdue(course);
              const dueSoon = isDueSoon(course);
              const shortDescription =
                course.description.trim().length > 110
                  ? `${course.description.trim().slice(0, 107).trimEnd()}…`
                  : course.description.trim();
              return (
                <button
                  key={course.id}
                  type="button"
                  role="listitem"
                  className="course-row"
                  onClick={() => setSelectedId(course.id)}
                >
                  <div className="course-row-main">
                    <div className="course-row-title">
                      <h3>{course.name}</h3>
                      <div className="badge-row">
                        <span className={statusClass(course.status)}>
                          {course.status}
                        </span>
                        <span className={priorityClass(course.priority)}>
                          {course.priority}
                        </span>
                        {overdue ? (
                          <span className="badge badge-overdue">Overdue</span>
                        ) : null}
                        {dueSoon ? (
                          <span className="badge badge-soon">Due soon</span>
                        ) : null}
                      </div>
                    </div>
                    {shortDescription ? (
                      <p className="course-row-desc">{shortDescription}</p>
                    ) : null}
                    <p className="course-row-meta">
                      Due {formatDate(course.target_date)}
                      {course.modules.length
                        ? ` · ${course.modules.filter((m) => m.done).length}/${course.modules.length} modules`
                        : ""}
                      {course.resources.length
                        ? ` · ${course.resources.length} resources`
                        : ""}
                    </p>
                  </div>
                  <div className="course-row-side">
                    <div className="progress-wrap compact">
                      <div className="progress-label">
                        <span>Progress</span>
                        <strong>{progress}%</strong>
                      </div>
                      <div className="progress-bar">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <span className="course-row-open">View</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedCourse ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="course-modal-title">{selectedCourse.name}</h2>
                <div className="badge-row">
                  <span className={statusClass(selectedCourse.status)}>
                    {selectedCourse.status}
                  </span>
                  <span className={priorityClass(selectedCourse.priority)}>
                    {selectedCourse.priority}
                  </span>
                  {isOverdue(selectedCourse) ? (
                    <span className="badge badge-overdue">Overdue</span>
                  ) : null}
                  {isDueSoon(selectedCourse) ? (
                    <span className="badge badge-soon">Due soon</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </div>

            <div className="modal-body">
              <p>{selectedCourse.description}</p>

              <div className="progress-wrap">
                <div className="progress-label">
                  <span>Progress</span>
                  <strong>{courseProgress(selectedCourse)}%</strong>
                </div>
                <div className="progress-bar">
                  <span
                    style={{ width: `${courseProgress(selectedCourse)}%` }}
                  />
                </div>
              </div>

              <div className="meta">
                <span>Target: {formatDate(selectedCourse.target_date)}</span>
                <span>Updated: {formatDate(selectedCourse.updated_at)}</span>
              </div>

              {selectedCourse.tags.length ? (
                <div className="chip-row">
                  {selectedCourse.tags.map((tag) => (
                    <span key={tag} className="chip static">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {selectedCourse.modules.length ? (
                <div className="mini-list">
                  <h4>Outline</h4>
                  {selectedCourse.modules.map((module) => (
                    <label key={module.id} className="check-row">
                      <input
                        type="checkbox"
                        checked={module.done}
                        onChange={() =>
                          void toggleModuleDone(selectedCourse, module.id)
                        }
                      />
                      <span className={module.done ? "done" : ""}>
                        {module.title}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}

              {selectedCourse.resources.length ? (
                <div className="mini-list">
                  <h4>Where to learn</h4>
                  {selectedCourse.resources.map((resource) => (
                    <a
                      key={resource.id}
                      className="resource-link"
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{resource.provider}</strong>
                      <span>{resource.title}</span>
                      {resource.note ? <em>{resource.note}</em> : null}
                    </a>
                  ))}
                </div>
              ) : null}

              {selectedCourse.notes ? (
                <p className="notes">
                  <strong>Notes:</strong> {selectedCourse.notes}
                </p>
              ) : null}
            </div>

            <div className="course-actions modal-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => startEdit(selectedCourse)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger delete-btn btn-sm"
                onClick={() => void handleDelete(selectedCourse.id)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
