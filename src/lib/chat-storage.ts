import type { ChatRole } from "@/lib/chat-types";

export type StoredChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export const CHAT_STORAGE_KEY = "codecrafthub.chat.v1";
export const MAX_STORED_MESSAGES = 80;

export const DEFAULT_CHAT_WELCOME: StoredChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi — I’m Raf, your CodeCraftHub learning assistant with web-aware answers. Ask me anything about what to learn next, study plans, or where to learn. I’ll include clickable links for YouTube, freeCodeCamp, Coursera certificates, docs, and more.",
};

export function isValidStoredMessage(
  value: unknown,
): value is StoredChatMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredChatMessage>;
  return (
    typeof item.id === "string" &&
    (item.role === "user" || item.role === "assistant") &&
    typeof item.content === "string" &&
    item.content.trim().length > 0
  );
}

export function loadChatHistory(
  fallback: StoredChatMessage[],
): StoredChatMessage[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const messages = parsed.filter(isValidStoredMessage).slice(-MAX_STORED_MESSAGES);
    return messages.length ? messages : fallback;
  } catch {
    return fallback;
  }
}

export function saveChatHistory(messages: StoredChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages
      .filter(isValidStoredMessage)
      .slice(-MAX_STORED_MESSAGES);
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota / private-mode failures
  }
}

export function clearChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
