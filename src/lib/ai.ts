import { sanitizeAssistantReplyLinks } from "@/lib/learning-links";

type Provider = "gemini" | "groq" | "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function resolveAiProvider():
  | { provider: Provider; apiKey: string }
  | null {
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

export const LEARNING_ASSISTANT_SYSTEM = `You are Raf, the CodeCraftHub learning assistant created by Rafael Susano. You are a friendly and practical learning coach inside a learning management dashboard.

When introducing yourself, you may say you are Raf from CodeCraftHub by Rafael Susano.

Your job:
- Help learners plan what to study and how to study it
- Use web search when available to find current, real learning resources
- Suggest concrete places to learn: YouTube tutorials/playlists, freeCodeCamp, Coursera (especially for certificates), official documentation, books, and reputable blogs
- CRITICAL LINK RULES: Never invent deep/course/video/certification path URLs. They often 404.
- When recommending resources, ONLY use these working URL patterns:
  - YouTube search: https://www.youtube.com/results?search_query=TOPIC+tutorial
  - freeCodeCamp search: https://www.freecodecamp.org/news/search/?query=TOPIC
  - Coursera search: https://www.coursera.org/search?query=TOPIC
  - Google search: https://www.google.com/search?q=TOPIC+official+documentation
- Prefer actionable steps (1-2 week plans, beginner→advanced paths, practice projects)
- Be concise but useful; use short sections and bullet lists
- Always return a visible text answer for the learner (never an empty response)
- If the user asks something unrelated to learning/tech careers, briefly answer then steer back to learning help when useful
- Never invent that you enrolled them or completed a certificate; you only advise

Always try to include at least one free option (YouTube/freeCodeCamp/docs) and one certificate-oriented option (Coursera or similar) when recommending where to learn.`;

function finalizeReply(reply: string, topicHint: string): string {
  return sanitizeAssistantReplyLinks(reply, topicHint);
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
  promptFeedback?: { blockReason?: string };
};

function extractGeminiText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const visible = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean);

  if (visible.length) return visible.join("\n\n").trim();

  // Some models only return thought text — use it rather than failing hard.
  return parts
    .map((part) => part.text?.trim() || "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractGroundingLinks(
  data: GeminiResponse,
): Array<{ uri: string; title: string }> {
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
    .map((web) => ({
      uri: web.uri,
      title: web.title?.trim() || web.uri,
    }))
    .slice(0, 8);
}

function appendGroundingSources(reply: string, data: GeminiResponse): string {
  const links = extractGroundingLinks(data);
  if (!links.length) return reply;

  const alreadyHas = links.every((link) => reply.includes(link.uri));
  if (alreadyHas) return reply;

  const lines = links.map((link) => `- [${link.title}](${link.uri})`);
  return `${reply.trim()}\n\n**Sources**\n${lines.join("\n")}`;
}

function replyFromGroundingOnly(
  topicHint: string,
  data: GeminiResponse,
): string | null {
  const links = extractGroundingLinks(data);
  if (!links.length) return null;

  const lines = links.map((link) => `- [${link.title}](${link.uri})`);
  return [
    `Here’s a practical starting plan for **${topicHint || "your topic"}**:`,
    "",
    "1. Skim one beginner overview (video or article).",
    "2. Follow a free hands-on path (projects > theory).",
    "3. Add a certificate track if you need proof for jobs.",
    "4. Build one small automation project and document it.",
    "",
    "**Where to learn (from web search):**",
    ...lines,
    "",
    "If you want, tell me your level (beginner/intermediate) and I’ll turn this into a week-by-week plan.",
  ].join("\n");
}

function localLearningFallback(topicHint: string): string {
  const topic = topicHint.trim() || "your topic";
  const q = encodeURIComponent(topic);
  return [
    `Here’s a solid starter path for **${topic}**:`,
    "",
    "### Steps",
    "1. Learn the basics (what it is + common tools).",
    "2. Follow one free beginner project tutorial end-to-end.",
    "3. Practice by building a tiny real workflow.",
    "4. Optional: take a Coursera certificate track for credibility.",
    "",
    "### Where to learn",
    `- [YouTube tutorials for ${topic}](https://www.youtube.com/results?search_query=${q}+tutorial)`,
    `- [freeCodeCamp articles/courses for ${topic}](https://www.freecodecamp.org/news/search/?query=${q})`,
    `- [Coursera courses/certificates for ${topic}](https://www.coursera.org/search?query=${q})`,
    `- [Docs / references search](https://www.google.com/search?q=${q}+official+documentation)`,
    "",
    "Tell me your experience level and goal (hobby, job, freelancing) and I’ll customize this.",
  ].join("\n");
}

function latestUserTopic(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((message) => message.role === "user");
  if (!last) return "learning";

  const cleaned = last.content
    .replace(/https?:\/\/\S+/g, "")
    .replace(
      /\b(i want to learn|teach me|help me learn|send me|steps?|links?|where can i learn|how to learn)\b/gi,
      " ",
    )
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 80) || last.content.slice(0, 80);
}

async function callGemini(
  messages: ChatMessage[],
  apiKey: string,
  withSearch: boolean,
  model: string,
): Promise<{ reply: string; grounded: boolean }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  const generationConfig: Record<string, unknown> = {
    temperature: 0.7,
    maxOutputTokens: 8192,
  };

  // Helps avoid empty visible replies on thinking-capable models.
  generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const payload: Record<string, unknown> = {
    systemInstruction: {
      parts: [{ text: LEARNING_ASSISTANT_SYSTEM }],
    },
    contents,
    generationConfig,
  };

  if (withSearch) {
    payload.tools = [{ google_search: {} }];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini error (${response.status} / ${model}): ${(await response.text()).slice(0, 400)}`,
    );
  }

  const data = (await response.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt (${data.promptFeedback.blockReason}).`);
  }

  let reply = extractGeminiText(data);
  if (!reply) {
    reply = replyFromGroundingOnly(latestUserTopic(messages), data) || "";
  }

  if (!reply) {
    throw new Error(
      `Gemini returned an empty reply on ${model}${data.candidates?.[0]?.finishReason ? ` (${data.candidates[0].finishReason})` : ""}.`,
    );
  }

  return {
    reply: appendGroundingSources(reply, data),
    grounded: withSearch && extractGroundingLinks(data).length > 0,
  };
}

async function callGeminiWithFallback(
  messages: ChatMessage[],
  apiKey: string,
  withSearch: boolean,
): Promise<{ reply: string; grounded: boolean }> {
  const models = [
    process.env.GEMINI_MODEL || "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ];

  let lastError: Error | null = null;
  for (const model of [...new Set(models)]) {
    try {
      return await callGemini(messages, apiKey, withSearch, model);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini failed.");
    }
  }
  throw lastError || new Error("Gemini failed.");
}

export async function generateAssistantReply(
  messages: ChatMessage[],
): Promise<{ reply: string; source: Provider | "fallback"; grounded?: boolean }> {
  const topicHint = latestUserTopic(messages);
  const resolved = resolveAiProvider();
  if (!resolved) {
    return {
      source: "fallback",
      reply: finalizeReply(localLearningFallback(topicHint), topicHint),
    };
  }

  if (resolved.provider === "gemini") {
    try {
      const grounded = await callGeminiWithFallback(
        messages,
        resolved.apiKey,
        true,
      );
      return {
        reply: finalizeReply(grounded.reply, topicHint),
        source: "gemini",
        grounded: grounded.grounded,
      };
    } catch {
      try {
        const plain = await callGeminiWithFallback(
          messages,
          resolved.apiKey,
          false,
        );
        return {
          reply: finalizeReply(plain.reply, topicHint),
          source: "gemini",
          grounded: false,
        };
      } catch {
        return {
          reply: finalizeReply(localLearningFallback(topicHint), topicHint),
          source: "fallback",
          grounded: false,
        };
      }
    }
  }

  const endpoint =
    resolved.provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
  const model =
    resolved.provider === "groq"
      ? process.env.GROQ_MODEL || "llama-3.1-8b-instant"
      : process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: LEARNING_ASSISTANT_SYSTEM },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `${resolved.provider} error (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error(`${resolved.provider} returned an empty reply.`);
    return {
      reply: finalizeReply(reply, topicHint),
      source: resolved.provider,
      grounded: false,
    };
  } catch {
    return {
      reply: finalizeReply(localLearningFallback(topicHint), topicHint),
      source: "fallback",
      grounded: false,
    };
  }
}
