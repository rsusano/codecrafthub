import { NextResponse } from "next/server";
import { getAiQuota } from "@/lib/ai-rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const quota = await getAiQuota(request);
  const response = NextResponse.json({ quota });

  // Stable guest id cookie so limits follow the browser, not only shared IPs
  const cookie = request.headers.get("cookie") || "";
  if (!/(?:^|;\s*)cch_guest_id=/.test(cookie)) {
    const guestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `g_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    response.cookies.set("cch_guest_id", guestId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
