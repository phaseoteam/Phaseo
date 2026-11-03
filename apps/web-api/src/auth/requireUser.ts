import { betterAuthJwtConfigFromEnv, databaseClaims, needsSecondFactor, readBetterAuthIdentity, verifyBetterAuthJwt, type AuthSchemaReader } from "@phaseo/db/jwt";
import { createClient } from "@supabase/supabase-js";
import { authProvider } from "@/data/providers";
import { requireDataScope } from "@/data/scope";
import { rememberVerifiedClaims } from "@/data/supabase";
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

// Phaseo's own OAuth clients, as in the gateway's lib/oauth/clientIds.ts: the CLI (current and legacy IDs) and
// the desktop app.
const FIRST_PARTY_OAUTH_CLIENT_IDS = new Set(["phaseo_cli", "aistats_cli", "phaseo_desktop"]);

function tokenClaims(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as unknown;
    return claims && typeof claims === "object" ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The session's authenticator assurance level from the access token, which getUser has already verified. */
export function tokenAssuranceLevel(token: string): string | null {
  const aal = tokenClaims(token)?.aal;
  return typeof aal === "string" ? aal : null;
}

/**
 * Whether the auth provider issued the access token to a third-party app (its OAuth server puts the app's
 * client_id in the token). Such a token is the app acting for the person, not the person signed in to
 * Phaseo. A client_id that isn't Phaseo's own app's, even an empty one, counts.
 */
export function isThirdPartyAppToken(token: string): boolean {
  const clientId = tokenClaims(token)?.client_id;
  if (clientId === undefined || clientId === null) return false;
  return !FIRST_PARTY_OAUTH_CLIENT_IDS.has(String(clientId).trim());
}

const objectOr = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * AUTH_PROVIDER=better-auth: the Bearer value is a Better Auth JWT (jwt plugin; apps get one from
 * GET /api/auth/token). Its signature, issuer, audience and expiry are checked against the JWKS, then the
 * session and user rows are read so a signed-out session or a banned user stops working at once rather than
 * when the 15-minute token expires (what Supabase's getUser gave us).
 */
async function requireBetterAuthUser(token: string, env: Env): Promise<AuthenticatedUser | null> {
  const config = betterAuthJwtConfigFromEnv(env);
  if (!config) {
    console.error("[auth] AUTH_PROVIDER=better-auth needs BETTER_AUTH_JWT_ISSUER or BETTER_AUTH_URL");
    return null;
  }
  const verified = await verifyBetterAuthJwt(token, config);
  if (!verified.ok) {
    if (verified.reason === "jwks_unavailable") console.error("[auth] Better Auth JWKS unavailable", config.jwksUrl);
    return null;
  }
  const claims = verified.claims;
  if (isThirdPartyAppToken(token)) return null;

  // Service role on the auth schema: authenticated/anon have no grants there (0001_auth.sql). Typed
  // structurally: checking the full postgrest-js client type against AuthSchemaReader is too deep for tsc.
  const authSchema = requireDataScope().db.client({ role: "service_role", schemas: ["auth"] }) as unknown as AuthSchemaReader;
  const identity = await readBetterAuthIdentity(authSchema, claims);
  if (!identity) return null;
  const { user, session } = identity;

  // Same rule as the website (aal.ts): 2FA on (now, or when the token was minted) needs an aal2 session.
  const aal = session.aal ?? claims.aal;
  if (needsSecondFactor({
    two_factor_enabled: Boolean(user.two_factor_enabled || claims.two_factor_enabled),
    mfa_reenrollment_required: Boolean(user.mfa_reenrollment_required || claims.mfa_reenrollment_required),
    aal,
  })) return null;

  rememberVerifiedClaims(token, databaseClaims({ ...claims, aal }));
  return {
    id: user.id,
    email: user.email ?? claims.email ?? null,
    createdAt: user.created_at,
    appMetadata: objectOr(user.raw_app_meta_data),
    // Supabase kept name/avatar in user_metadata; Better Auth has columns. Imported metadata wins.
    userMetadata: {
      ...(user.name ? { name: user.name, full_name: user.name } : {}),
      ...(user.image ? { avatar_url: user.image } : {}),
      ...objectOr(user.raw_user_meta_data),
    },
    factors: user.two_factor_enabled ? [{ id: "better-auth-totp", factor_type: "totp", status: "verified" }] : [],
  };
}

export async function requireUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  if (token && authProvider(env) === "better-auth") return requireBetterAuthUser(token, env);
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const anonKey = (env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!token || !url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // Account routes act as the person, so an app that signs in with Phaseo can't use them with its token,
  // whatever it was granted. Phaseo's own apps (CLI, desktop) keep working.
  if (isThirdPartyAppToken(token)) return null;

  // An account with a verified second factor must have used it in this session. The
  // website enforces this by redirecting pages to /auth/verify-mfa, which doesn't cover
  // direct API calls, so a password-only (aal1) session is treated as signed out here.
  const hasVerifiedFactor = (data.user.factors ?? []).some((factor) => factor.status === "verified");
  if (hasVerifiedFactor && tokenAssuranceLevel(token) !== "aal2") return null;

  // DATABASE_PROVIDER=planetscale with Supabase Auth: getUser has verified this token, so its claims can act
  // as the user for getAuthenticatedDataClient (no-op under DATABASE_PROVIDER=supabase).
  rememberVerifiedClaims(token, databaseClaims({ ...(tokenClaims(token) ?? {}), sub: data.user.id }));

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
