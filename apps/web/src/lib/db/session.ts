/**
 * getSessionUser: the one server-side seam for "who is signed in", by AUTH_PROVIDER (src/lib/db/providers.ts).
 *
 * - supabase (default): @supabase/ssr's cookie-bound client, exactly what the proxy did before (getUser +
 *   getSession, plus the MFA level when asked). Refreshed auth cookies go through `cookies.setAll`.
 * - better-auth: `getAuth().api.getSession({ headers })`; a refreshed session cookie comes back in
 *   `setCookieHeaders` for the caller to append to its response. Workers get a Better Auth JWT from
 *   `workerToken()` (the jwt plugin's /token endpoint), minted only when asked for.
 *
 * `dataClient()` is the RLS-scoped data client for that user, by DATABASE_PROVIDER: the same Supabase client
 * under supabase, a PlanetScale compat client with the session's claims under planetscale.
 *
 * The dozens of other `supabase.auth.*` call sites are not routed here yet; MIGRATION-NOTES.md in
 * src/lib/auth/better-auth is the work list.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { needsSecondFactor } from "../auth/better-auth/aal";
import { authProvider, databaseProvider, type AuthProvider } from "./providers";

export type CookieToSet = { name: string; value: string; options?: CookieOptions };

export type SessionCookies = {
	getAll(): Array<{ name: string; value: string }>;
	setAll(cookies: CookieToSet[], headers?: Record<string, string>): void;
};

export type SessionUser = { id: string; email: string | null; mustVerifyMfa: boolean };

export type SessionLookup = {
	provider: AuthProvider;
	user: SessionUser | null;
	/** The request carried no session at all (rather than one that couldn't be read). */
	signedOut: boolean;
	/** A short-lived Bearer token apps/web-api and the gateway accept for this user, or null. */
	workerToken(): Promise<string | null>;
	/** RLS-scoped data client for this user (anon when signed out), per DATABASE_PROVIDER. */
	dataClient(): SupabaseClient;
	/** Supabase Auth only: the cookie-bound client the session was read with (for its `.auth` API). */
	supabase: SupabaseClient | null;
	/** Better Auth only: Set-Cookie values from a refreshed session, to append to the response. */
	setCookieHeaders: string[];
};

export type SessionRequest = {
	headers: Headers;
	cookies: SessionCookies;
	/** Work out `mustVerifyMfa` (two extra Supabase calls; free under Better Auth). */
	includeMfa?: boolean;
};

type Claims = Record<string, unknown> & { sub: string };

function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
	const payload = token?.split(".")[1];
	if (!payload) return {};
	try {
		const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
		const value = JSON.parse(json) as unknown;
		return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/**
 * dataClient() is sync for the call sites; the PlanetScale module is loaded here, on demand, so
 * DATABASE_PROVIDER=supabase never loads `pg`.
 */
async function dataClientFactory(supabase: SupabaseClient | null, claims: Claims | null): Promise<() => SupabaseClient> {
	if (databaseProvider() !== "planetscale") {
		if (!supabase) throw new Error("DATABASE_PROVIDER=supabase needs the Supabase client");
		return () => supabase;
	}
	const { createUserDataClient } = await import("./server");
	let client: SupabaseClient | undefined;
	return () => (client ??= createUserDataClient(claims));
}

async function supabaseSession(input: SessionRequest): Promise<SessionLookup> {
	const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
		cookies: {
			getAll: () => input.cookies.getAll(),
			setAll: (cookies: CookieToSet[], headers: Record<string, string> = {}) => input.cookies.setAll(cookies, headers),
		},
	});
	const [
		{ data: { user } },
		{ data: { session }, error: sessionError },
	] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

	let mustVerifyMfa = false;
	if (user && input.includeMfa) {
		const [{ data: factorsData }, { data: aalData }] = await Promise.all([
			supabase.auth.mfa.listFactors(),
			supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
		]);
		const hasVerifiedFactor = Object.values(factorsData ?? {}).some((factors) =>
			Array.isArray(factors) && factors.some((factor) => factor.status === "verified"));
		mustVerifyMfa = hasVerifiedFactor && aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2";
	}

	// getUser verified the session's access token with Supabase, so its claims can scope PlanetScale reads.
	const claims: Claims | null = user ? { ...decodeJwtPayload(session?.access_token), sub: user.id, role: "authenticated" } : null;
	return {
		provider: "supabase",
		user: user ? { id: user.id, email: user.email ?? null, mustVerifyMfa } : null,
		signedOut: !user && !session && !sessionError,
		workerToken: async () => session?.access_token ?? null,
		dataClient: await dataClientFactory(supabase, claims),
		supabase,
		setCookieHeaders: [],
	};
}

type BetterAuthSession = {
	session: { id: string; aal?: unknown } & Record<string, unknown>;
	user: { id: string; email?: string | null; twoFactorEnabled?: boolean | null; mfaReenrollmentRequired?: boolean | null; role?: unknown } & Record<string, unknown>;
};

/** The two endpoints used here, typed structurally so this file doesn't depend on the plugin inference. */
type BetterAuthSessionApi = {
	getSession(input: { headers: Headers; returnHeaders: true }): Promise<{ headers: Headers; response: BetterAuthSession | null }>;
	getToken(input: { headers: Headers }): Promise<{ token: string }>;
};

async function betterAuthApi(): Promise<BetterAuthSessionApi> {
	const { getAuth } = await import("../auth/better-auth/server");
	return getAuth().api as unknown as BetterAuthSessionApi;
}

async function betterAuthSession(input: SessionRequest): Promise<SessionLookup> {
	const api = await betterAuthApi();
	let found: BetterAuthSession | null = null;
	let setCookieHeaders: string[] = [];
	let failed = false;
	try {
		const result = await api.getSession({ headers: input.headers, returnHeaders: true });
		found = result.response;
		setCookieHeaders = result.headers?.getSetCookie?.() ?? [];
	} catch (error) {
		failed = true;
		// eslint-disable-next-line no-console
		console.warn("[auth] Better Auth getSession failed", error instanceof Error ? error.message : error);
	}
	const user = found?.user ?? null;
	const aal = found?.session.aal === "aal2" ? "aal2" : "aal1";
	const claims: Claims | null = found && user
		? {
			sub: user.id,
			email: user.email ?? undefined,
			role: "authenticated",
			aal,
			session_id: found.session.id,
			...(typeof user.role === "string" ? { user_role: user.role } : {}),
		}
		: null;
	return {
		provider: "better-auth",
		user: user
			? {
				id: user.id,
				email: user.email ?? null,
				mustVerifyMfa: needsSecondFactor({ twoFactorEnabled: user.twoFactorEnabled, mfaReenrollmentRequired: user.mfaReenrollmentRequired, aal }),
			}
			: null,
		signedOut: !found && !failed,
		workerToken: async () => {
			if (!user) return null;
			try {
				return (await api.getToken({ headers: input.headers })).token ?? null;
			} catch {
				return null;
			}
		},
		dataClient: await dataClientFactory(null, claims),
		supabase: null,
		setCookieHeaders,
	};
}

export async function getSessionUser(input: SessionRequest): Promise<SessionLookup> {
	return authProvider() === "better-auth" ? betterAuthSession(input) : supabaseSession(input);
}
