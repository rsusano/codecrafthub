import type { LearningResource, ResourceType } from "@/lib/types";
import { RESOURCE_TYPES } from "@/lib/types";
import { createClientId } from "@/lib/types";

export type SuggestedResourceInput = {
  title?: string;
  url?: string;
  provider?: string;
  note?: string;
};

const OFFICIAL_DOC_HINTS: Array<{ match: RegExp; url: string; title: string }> = [
  {
    match: /openai|chatgpt|gpt/i,
    url: "https://platform.openai.com/docs",
    title: "OpenAI API documentation",
  },
  {
    match: /langchain/i,
    url: "https://docs.langchain.com/",
    title: "LangChain documentation",
  },
  {
    match: /next\.?js/i,
    url: "https://nextjs.org/docs",
    title: "Next.js documentation",
  },
  {
    match: /react/i,
    url: "https://react.dev/learn",
    title: "React documentation",
  },
  {
    match: /python/i,
    url: "https://docs.python.org/3/",
    title: "Python documentation",
  },
  {
    match: /zapier/i,
    url: "https://help.zapier.com/",
    title: "Zapier help center",
  },
  {
    match: /make\.com|integromat/i,
    url: "https://www.make.com/en/help",
    title: "Make.com help center",
  },
  {
    match: /n8n/i,
    url: "https://docs.n8n.io/",
    title: "n8n documentation",
  },
];

const KNOWN_GOOD_URLS = new Set(OFFICIAL_DOC_HINTS.map((item) => item.url));

/** Live Google Search grounding redirects are allowed; invented deep paths are not. */
const GROUNDING_HOST_ALLOW = [
  "vertexaisearch.cloud.google.com",
  "www.google.com",
  "google.com",
];

/**
 * Only keep AI URLs that are platform search pages, known-good doc roots,
 * or Google grounding redirects. Deep course/video paths are rejected.
 */
export function isSafeWorkingUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const normalizedPath =
      url.origin + url.pathname.replace(/\/$/, "") + (url.pathname.endsWith("/") ? "/" : "");
    if (KNOWN_GOOD_URLS.has(normalizedPath) || KNOWN_GOOD_URLS.has(value) || KNOWN_GOOD_URLS.has(`${value}/`)) {
      return true;
    }

    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (GROUNDING_HOST_ALLOW.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      if (host.includes("google.com") && (path.startsWith("/search") || path.startsWith("/url"))) {
        return true;
      }
      if (host.includes("vertexaisearch.cloud.google.com")) return true;
    }

    if ((host === "youtube.com" || host === "www.youtube.com") && path.startsWith("/results")) {
      return true;
    }
    if ((host === "coursera.org" || host === "www.coursera.org") && path.startsWith("/search")) {
      return true;
    }
    if (
      (host === "freecodecamp.org" || host === "www.freecodecamp.org") &&
      path.includes("/search")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeProvider(value: unknown): ResourceType {
  const raw = String(value ?? "Other");
  const found = RESOURCE_TYPES.find(
    (type) => type.toLowerCase() === raw.toLowerCase(),
  );
  return found ?? "Other";
}

function inferProviderFromText(blob: string): ResourceType {
  if (/youtube|youtu\.be/i.test(blob)) return "YouTube";
  if (/freecodecamp|free code camp/i.test(blob)) return "freeCodeCamp";
  if (/coursera/i.test(blob)) return "Coursera";
  if (/docs?|documentation|api reference|developer guide/i.test(blob)) {
    return "Documentation";
  }
  if (/book|oreilly| O’Reilly|paperback/i.test(blob)) return "Book";
  return "Other";
}

function topicFromLabel(label: string, topicHint: string): string {
  const cleaned = label
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\[\]\(\)]/g, " ")
    .replace(/\b(click here|link|here|website|site)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 90) || topicHint.trim() || "learning";
}

/** Rewrite one URL to a known-working search/official page. */
export function rewriteToWorkingUrl(
  url: string,
  label: string,
  topicHint: string,
): string {
  if (isSafeWorkingUrl(url)) return url;
  const blob = `${label} ${topicHint} ${url}`;
  const provider = inferProviderFromText(blob);
  return buildWorkingResourceUrl(
    provider,
    topicFromLabel(label, topicHint),
    undefined,
  );
}

/**
 * Replace invented/broken http(s) links in assistant markdown with working
 * search or official documentation URLs.
 */
export function sanitizeAssistantReplyLinks(
  text: string,
  topicHint = "learning",
): string {
  if (!text) return text;
  let next = text;

  // Markdown links: [label](url)
  next = next.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (_full, label: string, url: string) => {
      const safe = rewriteToWorkingUrl(url, label, topicHint);
      return `[${label}](${safe})`;
    },
  );

  // Bare URLs (avoid ones already inside markdown we just rewrote)
  next = next.replace(
    /(?<!\]\()https?:\/\/[^\s<>)"']+/gi,
    (url) => rewriteToWorkingUrl(url, topicHint, topicHint),
  );

  return next;
}

export function buildWorkingResourceUrl(
  provider: ResourceType,
  topic: string,
  preferredUrl?: string,
): string {
  const q = encodeURIComponent(topic.trim() || "programming");

  if (isSafeWorkingUrl(preferredUrl)) {
    return preferredUrl!;
  }

  switch (provider) {
    case "YouTube":
      return `https://www.youtube.com/results?search_query=${q}+tutorial`;
    case "freeCodeCamp":
      return `https://www.freecodecamp.org/news/search/?query=${q}`;
    case "Coursera":
      return `https://www.coursera.org/search?query=${q}`;
    case "Documentation": {
      const blob = `${topic} ${preferredUrl ?? ""}`;
      const hint = OFFICIAL_DOC_HINTS.find((item) => item.match.test(blob));
      if (hint) return hint.url;
      return `https://www.google.com/search?q=${q}+official+documentation`;
    }
    case "Book":
      return `https://www.google.com/search?q=${q}+book+site%3Aoreilly.com+OR+site%3Aamazon.com`;
    default:
      return `https://www.google.com/search?q=${q}+learn+course+OR+certification`;
  }
}

export function defaultWorkingResources(topic: string): Array<{
  title: string;
  url: string;
  provider: ResourceType;
  note: string;
}> {
  const name = topic.trim() || "this topic";
  const docHint = OFFICIAL_DOC_HINTS.find((item) => item.match.test(name));

  return [
    {
      provider: "YouTube",
      title: `${name} tutorials on YouTube`,
      url: buildWorkingResourceUrl("YouTube", name),
      note: "Free video walkthroughs and beginner playlists.",
    },
    {
      provider: "freeCodeCamp",
      title: `${name} on freeCodeCamp`,
      url: buildWorkingResourceUrl("freeCodeCamp", name),
      note: "Free articles and full courses.",
    },
    {
      provider: "Coursera",
      title: `${name} courses & certificates on Coursera`,
      url: buildWorkingResourceUrl("Coursera", name),
      note: "Certificate tracks for job-ready proof.",
    },
    {
      provider: "Documentation",
      title: docHint?.title || `${name} official docs / references`,
      url: buildWorkingResourceUrl("Documentation", name),
      note: "Authoritative reference material.",
    },
  ];
}

export function sanitizeSuggestedResources(
  topic: string,
  incoming: SuggestedResourceInput[] | undefined,
): Array<{
  title: string;
  url: string;
  provider: ResourceType;
  note?: string;
}> {
  const topicName = topic.trim() || "learning";
  const source =
    Array.isArray(incoming) && incoming.length
      ? incoming
      : defaultWorkingResources(topicName);

  const cleaned = source
    .map((item) => {
      const provider = normalizeProvider(item.provider);
      const title = item.title?.trim() || `${topicName} on ${provider}`;
      const note = item.note?.trim();
      // Search links use course name; docs also match title/note for OpenAI/LangChain roots
      const linkTopic =
        provider === "Documentation"
          ? `${topicName} ${title} ${note ?? ""}`
          : topicName;
      const url = buildWorkingResourceUrl(
        provider,
        linkTopic,
        item.url?.trim(),
      );

      return {
        title,
        url,
        provider,
        ...(note ? { note } : {}),
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, 8);

  return cleaned.length ? cleaned : defaultWorkingResources(topicName);
}

export function toLearningResources(
  topic: string,
  incoming: SuggestedResourceInput[] | undefined,
): LearningResource[] {
  return sanitizeSuggestedResources(topic, incoming).map((item) => ({
    id: createClientId("res"),
    title: item.title,
    url: item.url,
    provider: item.provider,
    ...(item.note ? { note: item.note } : {}),
  }));
}
