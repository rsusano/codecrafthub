import { promises as fs } from "fs";
import path from "path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  AI_GUEST_LIMIT,
  AI_USER_LIMIT,
  AI_WINDOW_MS,
  type AiQuotaResult,
} from "@/lib/ai-quota-shared";

export type { AiQuotaResult } from "@/lib/ai-quota-shared";
export {
  AI_GUEST_LIMIT,
  AI_USER_LIMIT,
  AI_WINDOW_MS,
  formatResetIn,
} from "@/lib/ai-quota-shared";

type Bucket = {
  count: number;
  resetAt: number;
};

const memory = new Map<string, Bucket>();
const STORE_FILE = path.join("/tmp", "codecrafthub-ai-limits.json");

function now() {
  return Date.now();
}

async function loadStore(): Promise<void> {
  if (memory.size) return;
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Bucket>;
    const t = now();
    for (const [key, bucket] of Object.entries(parsed)) {
      if (bucket?.resetAt > t) memory.set(key, bucket);
    }
  } catch {
    // First run / read-only — memory only
  }
}

async function persistStore(): Promise<void> {
  try {
    const payload: Record<string, Bucket> = {};
    const t = now();
    for (const [key, bucket] of memory.entries()) {
      if (bucket.resetAt > t) payload[key] = bucket;
    }
    await fs.writeFile(STORE_FILE, JSON.stringify(payload), "utf8");
  } catch {
    // Ignore persistence failures on restricted hosts
  }
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function getGuestId(request: Request): string {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)cch_guest_id=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return `ip:${getClientIp(request)}`;
}

async function resolveIdentity(
  request: Request,
): Promise<{ key: string; identity: "guest" | "user"; limit: number }> {
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        return {
          key: `user:${user.id}`,
          identity: "user",
          limit: AI_USER_LIMIT,
        };
      }
    } catch {
      // Fall through to guest
    }
  }

  return {
    key: `guest:${getGuestId(request)}`,
    identity: "guest",
    limit: AI_GUEST_LIMIT,
  };
}

function readBucket(key: string): Bucket {
  const t = now();
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= t) {
    const fresh = { count: 0, resetAt: t + AI_WINDOW_MS };
    memory.set(key, fresh);
    return fresh;
  }
  return existing;
}

export async function getAiQuota(request: Request): Promise<AiQuotaResult> {
  await loadStore();
  const { key, identity, limit } = await resolveIdentity(request);
  const bucket = readBucket(key);
  const used = bucket.count;
  const remaining = Math.max(0, limit - used);
  const resetInMs = Math.max(0, bucket.resetAt - now());

  return {
    ok: remaining > 0,
    limit,
    remaining,
    used,
    resetAt: bucket.resetAt,
    resetInMs,
    identity,
  };
}

export async function consumeAiQuota(
  request: Request,
): Promise<AiQuotaResult> {
  await loadStore();
  const { key, identity, limit } = await resolveIdentity(request);
  const bucket = readBucket(key);
  const resetInMs = Math.max(0, bucket.resetAt - now());

  if (bucket.count >= limit) {
    const hours = Math.max(1, Math.ceil(resetInMs / (60 * 60 * 1000)));
    return {
      ok: false,
      limit,
      remaining: 0,
      used: bucket.count,
      resetAt: bucket.resetAt,
      resetInMs,
      identity,
      message:
        identity === "guest"
          ? `Guest AI limit reached (${limit} uses / 2 hours). Sign in with email for a higher limit, or try again in about ${hours} hour${hours === 1 ? "" : "s"}.`
          : `Signed-in AI limit reached (${limit} uses / 2 hours). Try again in about ${hours} hour${hours === 1 ? "" : "s"}.`,
    };
  }

  bucket.count += 1;
  memory.set(key, bucket);
  await persistStore();

  return {
    ok: true,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    used: bucket.count,
    resetAt: bucket.resetAt,
    resetInMs,
    identity,
  };
}
