"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import MarkdownMessage from "@/components/MarkdownMessage";
import {
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
  type StoredChatMessage,
} from "@/lib/chat-storage";
import type { ChatRole } from "@/lib/chat-types";

type UiMessage = StoredChatMessage;

const STARTER: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi — I’m Raf, your CodeCraftHub learning assistant with web-aware answers. Ask me anything about what to learn next, study plans, or where to learn. I’ll include clickable links for YouTube, freeCodeCamp, Coursera certificates, docs, and more.",
};

const QUICK_PROMPTS = [
  "Where should I learn Next.js for free and for a certificate?",
  "Make a 2-week plan to learn Python for beginners",
  "Best YouTube + freeCodeCamp path for SQL",
  "I want a Coursera cert in cloud — what should I take?",
];

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function LearningAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([STARTER]);
  const [ready, setReady] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadChatHistory([STARTER]));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveChatHistory(messages);
  }, [messages, ready]);

  useEffect(() => {
    if (!open) return;
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function sendMessage(raw: string) {
    const content = raw.trim();
    if (!content || busy) return;

    const userMessage: UiMessage = {
      id: createId(),
      role: "user" satisfies ChatRole,
      content,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.id !== "welcome")
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Assistant failed.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          content: String(data.reply ?? ""),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant failed.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function clearChat() {
    const hasHistory = messages.some((message) => message.id !== "welcome");
    if (
      hasHistory &&
      !confirm("Clear all saved chat history on this device? This cannot be undone.")
    ) {
      return;
    }
    clearChatHistory();
    setMessages([STARTER]);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        className={`assistant-fab ${open ? "hidden-fab" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Open learning assistant"
      >
        Ask AI
      </button>

      {open ? (
        <section className="assistant-panel" aria-label="Learning assistant chat">
          <header className="assistant-head">
            <div>
              <p className="assistant-kicker">Always-on coach · by Raf</p>
              <h2>Learning Assistant</h2>
              <p className="assistant-persist-hint">
                Chat is saved on this device. Use Clear to wipe it.
              </p>
            </div>
            <div className="assistant-head-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearChat}
                title="Clear saved chat history"
              >
                Clear history
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </header>

          <div className="assistant-quick">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => void sendMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="assistant-messages" ref={scrollerRef}>
            {messages.map((message) => (
              <article
                key={message.id}
                className={`assistant-bubble ${message.role}`}
              >
                <p className="assistant-role">
                  {message.role === "assistant" ? "Raf" : "You"}
                </p>
                <div className="assistant-content">
                  {message.role === "assistant" ? (
                    <MarkdownMessage text={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
              </article>
            ))}
            {busy ? (
              <article className="assistant-bubble assistant">
                <p className="assistant-role">Raf</p>
                <div className="assistant-content thinking">Thinking…</div>
              </article>
            ) : null}
          </div>

          {error ? <p className="notice error assistant-error">{error}</p> : null}

          <form className="assistant-form" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask where to learn, for a study plan, cert advice…"
              rows={3}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
