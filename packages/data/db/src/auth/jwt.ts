/**
 * Verify the JWTs Better Auth's jwt plugin issues (apps/web/src/lib/auth/better-auth/options.ts), for the
 * Workers: issuer = the web origin, audience "phaseo", 15-minute expiry, keys at `<origin>/api/auth/jwks`.
 *
 * The key set is fetched with jose's `createRemoteJWKSet` and kept per isolate (module scope), so a warm
 * isolate verifies without a network call. jose refetches when a token names an unknown `kid` (key rotation),
 * at most once per cooldown.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export type BetterAuthJwtConfig = {
	issuer: string;
	audience: string;
	jwksUrl: string;
	/** Seconds of clock skew allowed on exp/nbf/iat. Defaults to 5. */
	clockToleranceSeconds?: number;
};

/** The claims Phaseo's Better Auth puts in the token (definePayload in options.ts), plus the registered ones. */
export type BetterAuthClaims = JWTPayload & {
	sub: string;
	email?: string;
	email_verified?: boolean;
	sid?: string;
	aal?: string;
	/** Better Auth's admin-plugin role ("user" | "admin"), not a database role. */
	role?: string;
	two_factor_enabled?: boolean;
	mfa_reenrollment_required?: boolean;
	client_id?: string;
};

export type JwtRejection = "malformed" | "expired" | "issuer" | "audience" | "signature" | "unknown_key" | "algorithm" | "claims" | "jwks_unavailable";

/** Both arms name both fields so consumers compiled without strictNullChecks (the Workers) can read them. */
export type JwtVerification = { ok: true; claims: BetterAuthClaims; reason?: undefined } | { ok: false; reason: JwtRejection; claims?: undefined };

/** Asymmetric only: a JWKS never holds an HMAC secret, and allowing HS* would invite algorithm confusion. */
const ALGORITHMS = ["EdDSA", "Ed25519", "ES256", "ES384", "ES512", "RS256", "PS256"];

type EnvLike = Record<string, unknown>;

function stringFrom(env: EnvLike, key: string): string | undefined {
	const value = env[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function origin(value: string): string | null {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

/**
 * The verifier settings from Worker env. `BETTER_AUTH_JWT_ISSUER` (or `BETTER_AUTH_URL`) is required: it is the web
 * origin Better Auth signs as, and differs between production and staging, so it is never guessed.
 * `BETTER_AUTH_JWKS_URL` defaults to `<issuer>/api/auth/jwks`, `BETTER_AUTH_JWT_AUDIENCE` to "phaseo".
 */
export function betterAuthJwtConfigFromEnv(env: EnvLike): BetterAuthJwtConfig | null {
	const rawIssuer = stringFrom(env, "BETTER_AUTH_JWT_ISSUER") ?? stringFrom(env, "BETTER_AUTH_URL");
	const issuer = rawIssuer ? origin(rawIssuer) : null;
	if (!issuer) return null;
	return {
		issuer,
		audience: stringFrom(env, "BETTER_AUTH_JWT_AUDIENCE") ?? "phaseo",
		jwksUrl: stringFrom(env, "BETTER_AUTH_JWKS_URL") ?? `${issuer}/api/auth/jwks`,
	};
}

const keySets = new Map<string, JWTVerifyGetKey>();

/** The isolate's cached remote key set for a JWKS URL. */
export function remoteKeySet(jwksUrl: string): JWTVerifyGetKey {
	let keySet = keySets.get(jwksUrl);
	if (!keySet) {
		keySet = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
		keySets.set(jwksUrl, keySet);
	}
	return keySet;
}

/** Test seam: forget the cached key sets. */
export function resetRemoteKeySets(): void {
	keySets.clear();
}

function rejection(error: unknown): JwtRejection {
	const code = (error as { code?: unknown })?.code;
	const claim = (error as { claim?: unknown })?.claim;
	switch (code) {
		case "ERR_JWT_EXPIRED":
			return "expired";
		case "ERR_JWT_CLAIM_VALIDATION_FAILED":
			return claim === "iss" ? "issuer" : claim === "aud" ? "audience" : "claims";
		case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
			return "signature";
		case "ERR_JWKS_NO_MATCHING_KEY":
		case "ERR_JWKS_MULTIPLE_MATCHING_KEYS":
			return "unknown_key";
		case "ERR_JOSE_ALG_NOT_ALLOWED":
		case "ERR_JOSE_NOT_SUPPORTED":
			return "algorithm";
		case "ERR_JWKS_TIMEOUT":
		case "ERR_JWKS_INVALID":
			return "jwks_unavailable";
		case "ERR_JWS_INVALID":
		case "ERR_JWT_INVALID":
			return "malformed";
		default:
			// A failed JWKS fetch surfaces as a plain error (network) or a JOSEError without a known code.
			return "jwks_unavailable";
	}
}

/**
 * Verify signature, issuer, audience and expiry. `exp` and `sub` are required: a token without an expiry
 * would never stop working.
 */
export async function verifyBetterAuthJwt(token: string, config: BetterAuthJwtConfig, keySet: JWTVerifyGetKey = remoteKeySet(config.jwksUrl)): Promise<JwtVerification> {
	if (!token || token.split(".").length !== 3) return { ok: false, reason: "malformed" };
	try {
		const { payload } = await jwtVerify(token, keySet, {
			issuer: config.issuer,
			audience: config.audience,
			algorithms: ALGORITHMS,
			requiredClaims: ["exp", "sub"],
			clockTolerance: config.clockToleranceSeconds ?? 5,
		});
		if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, reason: "claims" };
		return { ok: true, claims: payload as BetterAuthClaims };
	} catch (error) {
		return { ok: false, reason: rejection(error) };
	}
}

export type BetterAuthUserRow = {
	id: string;
	email: string | null;
	name: string | null;
	image: string | null;
	created_at: string;
	two_factor_enabled: boolean | null;
	mfa_reenrollment_required: boolean | null;
	banned: boolean | null;
	ban_expires: string | null;
	raw_app_meta_data: Record<string, unknown> | null;
	raw_user_meta_data: Record<string, unknown> | null;
};

export type BetterAuthSessionRow = { id: string; user_id: string; expires_at: string; aal: string | null };

/** The slice of a compat client (on the `auth` schema) readBetterAuthIdentity uses. */
export type AuthSchemaReader = {
	from(table: string): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } } };
};

const USER_COLUMNS = "id,email,name,image,created_at,two_factor_enabled,mfa_reenrollment_required,banned,ban_expires,raw_app_meta_data,raw_user_meta_data";
// Never the session token.
const SESSION_COLUMNS = "id,user_id,expires_at,aal";

/**
 * The user and session rows behind verified claims, or null when the session was signed out or expired, belongs
 * to someone else, or the user is banned. This makes sign-out and bans take effect at once instead of when the
 * 15-minute JWT expires (Supabase's getUser checked the session too). `auth` must be a service_role compat client
 * on the `auth` schema: anon/authenticated have no grants there.
 */
export async function readBetterAuthIdentity(auth: AuthSchemaReader, claims: Pick<BetterAuthClaims, "sub" | "sid">, now = Date.now()): Promise<{ user: BetterAuthUserRow; session: BetterAuthSessionRow } | null> {
	if (typeof claims.sid !== "string" || !claims.sid) return null;
	const [userResult, sessionResult] = await Promise.all([
		auth.from("users").select(USER_COLUMNS).eq("id", claims.sub).maybeSingle(),
		auth.from("sessions").select(SESSION_COLUMNS).eq("id", claims.sid).maybeSingle(),
	]);
	const user = userResult.data as BetterAuthUserRow | null;
	const session = sessionResult.data as BetterAuthSessionRow | null;
	if (userResult.error || sessionResult.error || !user || !session || session.user_id !== user.id || user.id !== claims.sub) return null;
	if (!(Date.parse(session.expires_at) > now)) return null;
	if (user.banned && (!user.ban_expires || Date.parse(user.ban_expires) > now)) return null;
	return { user, session };
}

/**
 * Whether the session still owes a second factor, the same rule as apps/web's needsSecondFactor (aal.ts): an
 * account with 2FA on needs an aal2 session, and an account flagged for re-enrolment is held until it enrols.
 */
export function needsSecondFactor(claims: Pick<BetterAuthClaims, "two_factor_enabled" | "mfa_reenrollment_required" | "aal">): boolean {
	if (claims.mfa_reenrollment_required) return true;
	return Boolean(claims.two_factor_enabled) && claims.aal !== "aal2";
}

/**
 * `request.jwt.claims` for a user-scoped compat client, shaped like Supabase's access token so RLS policies,
 * `auth.uid()`, `auth.role()` and `auth.jwt()` read what they read today. `role` must be the database role
 * ("authenticated"); Better Auth's own `role` claim moves to `user_role`.
 */
export function databaseClaims(claims: Record<string, unknown> & { sub: string }): Record<string, unknown> {
	const { role: userRole, sid, ...rest } = claims;
	return {
		...rest,
		...(typeof sid === "string" && rest.session_id === undefined ? { session_id: sid } : {}),
		...(userRole !== undefined && userRole !== "authenticated" ? { user_role: userRole } : {}),
		role: "authenticated",
	};
}
