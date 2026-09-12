export const AI_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
export const AI_GUEST_LIMIT = 5;
export const AI_USER_LIMIT = 25;

export type AiQuotaResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  used: number;
  resetAt: number;
  resetInMs: number;
  identity: "guest" | "user";
  message?: string;
};

export function formatResetIn(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
