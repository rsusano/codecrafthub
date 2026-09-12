import { NextResponse } from "next/server";
import {
  generateAssistantReply,
  type ChatMessage,
} from "@/lib/ai";
import { consumeAiQuota, formatResetIn } from "@/lib/ai-rate-limit";

export const runtime = "nodejs";

type ChatBody = {
  messages?: ChatMessage[];
};

export async function POST(request: Request) {
  const quota = await consumeAiQuota(request);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: quota.message || "AI limit reached.",
        quota,
        resetIn: formatResetIn(quota.resetInMs),
      },
      { status: 429 },
    );
  }

  let body: ChatBody;

  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cleaned = messages
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? "").trim(),
    }))
    .filter((message) => message.content)
    .slice(-16) as ChatMessage[];

  if (!cleaned.length) {
    return NextResponse.json(
      { error: "Send at least one message." },
      { status: 400 },
    );
  }

  if (cleaned[cleaned.length - 1]?.role !== "user") {
    return NextResponse.json(
      { error: "The latest message must be from the user." },
      { status: 400 },
    );
  }

  try {
    const result = await generateAssistantReply(cleaned);
    return NextResponse.json({
      reply: result.reply,
      source: result.source,
      grounded: Boolean(result.grounded),
      quota,
    });
  } catch (error) {
    // Last-resort safety net — UI should still get a helpful answer.
    return NextResponse.json({
      reply:
        "I hit a temporary AI issue. Try again in a moment, or ask with a simpler topic like “AI automation beginner plan”.",
      source: "fallback",
      grounded: false,
      quota,
      error:
        error instanceof Error ? error.message : "Assistant request failed.",
    });
  }
}
