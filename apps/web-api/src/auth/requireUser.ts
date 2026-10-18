import { createClient } from "@supabase/supabase-js";
import type { Env } from "@/env";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  createdAt: string;
  appMetadata: Record<string, unknown>;
  factors: Array<{
    id: string;
    factor_type: string;
    status: string;
  }>;
  userMetadata: Record<string, unknown>;
};

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization")?.trim();
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

/** The session's authenticator assurance level from the access token, which getUser has already verified. */
export function tokenAssuranceLevel(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

export async function requireUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const anonKey = (env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!token || !url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // An account with a verified second factor must have used it in this session. The
  // website enforces this by redirecting pages to /auth/verify-mfa, which doesn't cover
  // direct API calls, so a password-only (aal1) session is treated as signed out here.
  const hasVerifiedFactor = (data.user.factors ?? []).some((factor) => factor.status === "verified");
  if (hasVerifiedFactor && tokenAssuranceLevel(token) !== "aal2") return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    createdAt: data.user.created_at,
    appMetadata:
      data.user.app_metadata && typeof data.user.app_metadata === "object"
        ? data.user.app_metadata
        : {},
    factors: (data.user.factors ?? []).map((factor) => ({
      id: factor.id,
      factor_type: factor.factor_type,
      status: factor.status,
    })),
    userMetadata:
      data.user.user_metadata && typeof data.user.user_metadata === "object"
        ? data.user.user_metadata
        : {},
  };
}
