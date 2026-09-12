import { NextResponse } from "next/server";
import {
  defaultWorkingResources,
  sanitizeSuggestedResources,
} from "@/lib/learning-links";

export const runtime = "nodejs";

type SuggestMode = "description" | "outline" | "resources" | "full";

type SuggestBody = {
  name?: string;
  mode?: SuggestMode;
};

type Provider = "gemini" | "groq" | "openai";

function fallbackDescription(name: string): string {
  return `A practical learning path for "${name}" covering core concepts, hands-on practice, and a clear finish line so you can track progress from not started to completed.`;
}

function fallbackOutline(name: string): string[] {
  return [
    `Foundations of ${name}`,
    "Core concepts and vocabulary",
    "Hands-on practice project",
    "Common pitfalls and debugging",
    "Final review and next steps",
  ];
}

function resolveProvider(): { provider: Provider; apiKey: string } | null {
  if (process.env.GEMINI_API_KEY) {
    return { provider: "gemini", apiKey: process.env.GEMINI_API_KEY };
  }
  if (process.env.GROQ_API_KEY) {
    return { provider: "groq", apiKey: process.env.GROQ_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  return null;
}

function buildPrompt(name: string, mode: SuggestMode): string {
  if (mode === "outline") {
    return `Create a 5-item learning outline for a course named "${name}". Return ONLY a JSON array of short module title strings. Example: ["Intro","Practice","Project"]. No markdown.`;
  }
  if (mode === "resources") {
    return `Suggest 4-6 places to learn "${name}". Mix YouTube, freeCodeCamp, Coursera (for certificates when relevant), official documentation, and optionally books. Return ONLY valid JSON array like: [{"title":"...","provider":"YouTube|freeCodeCamp|Coursera|Documentation|Book|Other","note":"why useful","url":""}]. Do NOT invent deep course URLs. Leave url empty or use a platform search page. No markdown.`;
  }
  if (mode === "full") {
    return `For a course named "${name}", return ONLY valid JSON with this shape: {"description":"1-2 sentence learner-facing description","outline":["module 1","module 2","module 3","module 4","module 5"],"resources":[{"title":"...","provider":"YouTube|freeCodeCamp|Coursera|Documentation|Book|Other","note":"why useful","url":""}]}. Include 4-6 resources. Do NOT invent deep/fake URLs. Leave url empty. No markdown.`;
  }
  return `Write a short learner-facing course description for a course named "${name}". Return only the description text, 1-2 sentences, no quotes or markdown.`;
}

function parseOutline(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function parseResources(text: string, name: string) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return sanitizeSuggestedResources(name, undefined);
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return sanitizeSuggestedResources(name, undefined);
    return sanitizeSuggestedResources(name, parsed as Array<Record<string, string>>);
  } catch {
    return sanitizeSuggestedResources(name, undefined);
  }
}

function parseFull(text: string, name: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      description: fallbackDescription(name),
      outline: fallbackOutline(name),
      resources: defaultWorkingResources(name),
    };
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      description?: unknown;
      outline?: unknown;
      resources?: unknown;
    };
    const outline = Array.isArray(parsed.outline)
      ? parsed.outline.map((item) => String(item).trim()).filter(Boolean)
      : [];
    return {
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : fallbackDescription(name),
      outline: outline.length ? outline : fallbackOutline(name),
      resources: sanitizeSuggestedResources(
        name,
        Array.isArray(parsed.resources)
          ? (parsed.resources as Array<Record<string, string>>)
          : undefined,
      ),
    };
  } catch {
    return {
      description: fallbackDescription(name),
      outline: fallbackOutline(name),
      resources: defaultWorkingResources(name),
    };
  }
}

async function suggestWithGemini(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 3072,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini error (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function suggestWithOpenAICompatible(
  prompt: string,
  provider: "groq" | "openai",
  apiKey: string,
): Promise<string> {
  const endpoint =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

  const model =
    provider === "groq"
      ? process.env.GROQ_MODEL || "llama-3.1-8b-instant"
      : process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You help build learning courses and recommend reputable learning platforms. Follow instructions exactly.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${provider} error (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} returned an empty response.`);
  return text;
}

export async function POST(request: Request) {
  let body: SuggestBody;

  try {
    body = (await request.json()) as SuggestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const mode: SuggestMode = body.mode ?? "description";
  if (!name) {
    return NextResponse.json(
      { error: "Course name is required to suggest content." },
      { status: 400 },
    );
  }

  const resolved = resolveProvider();
  if (!resolved) {
    return NextResponse.json({
      description: fallbackDescription(name),
      outline: fallbackOutline(name),
      resources: defaultWorkingResources(name),
      source: "fallback",
      message:
        "No API key found. Using local templates. Add GEMINI_API_KEY for live AI.",
    });
  }

  try {
    const prompt = buildPrompt(name, mode);
    const text =
      resolved.provider === "gemini"
        ? await suggestWithGemini(prompt, resolved.apiKey)
        : await suggestWithOpenAICompatible(
            prompt,
            resolved.provider,
            resolved.apiKey,
          );

    if (mode === "outline") {
      const outline = parseOutline(text);
      return NextResponse.json({
        outline: outline.length ? outline : fallbackOutline(name),
        source: resolved.provider,
      });
    }

    if (mode === "resources") {
      return NextResponse.json({
        resources: parseResources(text, name),
        source: resolved.provider,
      });
    }

    if (mode === "full") {
      return NextResponse.json({
        ...parseFull(text, name),
        source: resolved.provider,
      });
    }

    return NextResponse.json({
      description: text.replace(/^["']|["']$/g, "").trim(),
      source: resolved.provider,
    });
  } catch (error) {
    return NextResponse.json({
      description: fallbackDescription(name),
      outline: fallbackOutline(name),
      resources: defaultWorkingResources(name),
      source: "fallback",
      message: "AI request failed. Using local templates instead.",
      error: error instanceof Error ? error.message : "Unknown AI error",
    });
  }
}
