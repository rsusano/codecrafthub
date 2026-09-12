"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  AI_GUEST_LIMIT,
  AI_USER_LIMIT,
  formatResetIn,
  type AiQuotaResult,
} from "@/lib/ai-quota-shared";

export function useAiQuota() {
  const { user } = useAuth();
  const [quota, setQuota] = useState<AiQuotaResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/ai-quota", { cache: "no-store" });
      const data = await response.json();
      if (data.quota) setQuota(data.quota as AiQuotaResult);
    } catch {
      // Ignore — UI still works without the badge
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  return { quota, refresh, setQuota };
}

export default function AiQuotaBadge({
  quota,
}: {
  quota: AiQuotaResult | null;
}) {
  if (!quota) return null;

  const label =
    quota.identity === "user"
      ? `AI left: ${quota.remaining}/${AI_USER_LIMIT} (resets in ${formatResetIn(quota.resetInMs)})`
      : `Guest AI left: ${quota.remaining}/${AI_GUEST_LIMIT} (resets in ${formatResetIn(quota.resetInMs)}) · Sign in for more`;

  return (
    <p className={`ai-quota-badge ${quota.remaining === 0 ? "empty" : ""}`}>
      {label}
    </p>
  );
}
