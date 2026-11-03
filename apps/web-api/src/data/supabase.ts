import { createClient } from "@supabase/supabase-js";
import type { Env } from "@/env";
import { databaseProvider } from "./providers";
import { currentDataScope, requireDataScope } from "./scope";

/**
 * The data clients, by DATABASE_PROVIDER (src/data/providers.ts):
 * - supabase (default): supabase-js over PostgREST, as before.
 * - planetscale: @phaseo/db's PostgREST-compatible client over this invocation's Hyperdrive connection
 *   (src/data/scope.ts). Same `.from()`/`.rpc()` API and the same SupabaseClient type for the call sites;
 *   `.auth`, `.storage` and `.functions` throw (supabase.auth.admin.* call sites are on the migration list).
 */
function createServiceSupabaseClient(url: string, serviceRoleKey: string) {
	return createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

export type DataClient = ReturnType<typeof createServiceSupabaseClient>;

export function getDataClient(env: Env): DataClient {
	if (databaseProvider(env) === "planetscale") {
		return requireDataScope().db.serviceClient() as unknown as DataClient;
	}

	const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !serviceRoleKey) {
		throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
	}

	return createServiceSupabaseClient(url, serviceRoleKey);
}

function bearerToken(request: Request): string {
	const authorization = request.headers.get("authorization")?.trim();
	return authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length).trim()
		: "";
}

/**
 * Record the `request.jwt.claims` for a Bearer token requireUser has verified, so getAuthenticatedDataClient
 * can act as that user. Only meaningful under DATABASE_PROVIDER=planetscale; a no-op otherwise.
 */
export function rememberVerifiedClaims(token: string, claims: Record<string, unknown>): void {
	currentDataScope()?.verifiedClaims.set(token, claims);
}

/**
 * A client acting as the signed-in user, so RLS applies.
 *
 * Under planetscale it runs as role `authenticated` with the claims requireUser recorded for this exact token
 * (every caller runs requireUser first). A token requireUser hasn't verified in this invocation gets null,
 * as a missing token does: getAuthenticatedDataClient stays synchronous and never trusts an unverified token.
 */
export function getAuthenticatedDataClient(env: Env, request: Request): DataClient | null {
	const token = bearerToken(request);
	if (databaseProvider(env) === "planetscale") {
		const scope = requireDataScope();
		const claims = token ? scope.verifiedClaims.get(token) : undefined;
		if (!claims) return null;
		let client = scope.userClients.get(token) as DataClient | undefined;
		if (!client) {
			client = scope.db.client({ role: "authenticated", claims }) as unknown as DataClient;
			scope.userClients.set(token, client);
		}
		return client;
	}

	const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
	const anonKey = (env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
	if (!url || !anonKey || !token) return null;

	return createClient(url, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: `Bearer ${token}` } },
	});
}
