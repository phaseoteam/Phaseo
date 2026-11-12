import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getBalance, getChatPrivacyReview, getCredits, getCreditTransactions, getKeys, getTeam, getUsageOverview } from "@/lib/api/account";
import { getStatus } from "@/lib/api/help";
import { supabase, useAuth } from "@/providers/AuthProvider";
import { usageRange, weekSpendNanos } from "./usage";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The keys several screens share, so a change on one (a revoked key, a saved privacy switch) shows on the others. */
export const accountKeys = {
  balance: (workspaceId: string) => ["account", workspaceId, "balance"] as const,
  keys: (workspaceId: string) => ["account", workspaceId, "keys"] as const,
  team: (workspaceId: string) => ["account", workspaceId, "team"] as const,
  week: (workspaceId: string) => ["account", workspaceId, "usage-week"] as const,
  credits: (workspaceId: string) => ["account", workspaceId, "credits"] as const,
  transactions: (workspaceId: string) => ["account", workspaceId, "transactions"] as const,
  /** Shared with chat's privacy review sheet. */
  privacy: (workspaceId: string | null) => ["account", workspaceId, "chat-privacy"] as const,
};

export const useBalance = (workspaceId: string | null) => useQuery({ queryKey: accountKeys.balance(workspaceId ?? ""), queryFn: () => getBalance(workspaceId!), enabled: Boolean(workspaceId), staleTime: 60_000 });
export const useKeys = (workspaceId: string | null) => useQuery({ queryKey: accountKeys.keys(workspaceId ?? ""), queryFn: () => getKeys(workspaceId!), enabled: Boolean(workspaceId) });
export const useTeam = (workspaceId: string | null) => useQuery({ queryKey: accountKeys.team(workspaceId ?? ""), queryFn: () => getTeam(workspaceId!), enabled: Boolean(workspaceId) });
export const useCredits = (workspaceId: string) => useQuery({ queryKey: accountKeys.credits(workspaceId), queryFn: () => getCredits(workspaceId), staleTime: 60_000 });
export const useTransactions = (workspaceId: string) => useQuery({ queryKey: accountKeys.transactions(workspaceId), queryFn: () => getCreditTransactions(workspaceId), staleTime: 60_000 });
export const usePrivacy = (workspaceId: string | null) => useQuery({ queryKey: accountKeys.privacy(workspaceId), queryFn: () => getChatPrivacyReview(workspaceId), enabled: Boolean(workspaceId) });

/** Spend over the last 7 days, from the same overview the Usage screen reads (its `recent` window). */
export function useWeekSpend(workspaceId: string | null) {
  // A stable range for the query; the cached figure is refreshed after five minutes.
  const [now] = useState(() => new Date(Math.floor(Date.now() / 60_000) * 60_000));
  const range = useMemo(() => usageRange("7d", now), [now]);
  const query = useQuery({ queryKey: accountKeys.week(workspaceId ?? ""), queryFn: () => getUsageOverview(workspaceId!, range, timeZone), enabled: Boolean(workspaceId), staleTime: 5 * 60_000 });
  return { ...query, nanos: weekSpendNanos(query.data) };
}

/** Whether the signed-in user has a verified authenticator app (Supabase's own record; no Phaseo request). */
export function useTwoFactor() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["account", session?.user.id ?? "", "two-factor"],
    enabled: Boolean(session && supabase),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []).some((factor) => factor.status === "verified");
    },
  });
}

/** phaseo.app's status (the status page behind phaseo.app/status), checked every minute while shown. */
export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: getStatus, staleTime: 30_000, refetchInterval: 60_000 });
