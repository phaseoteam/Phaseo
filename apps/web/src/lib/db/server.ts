/**
 * Server-side PlanetScale data clients for the website (DATABASE_PROVIDER=planetscale).
 *
 * One `pg` Pool per server instance, `max: 1` (database/planetscale/README.md: serverless instances multiply,
 * PgBouncer pools), on PLANETSCALE_DATABASE_URL (the PgBouncer :6432 URL). The clients are @phaseo/db's
 * PostgREST-compatible client, typed as SupabaseClient so call sites keep their `.from()`/`.rpc()` code;
 * `.auth`/`.storage` throw on them.
 *
 * Better Auth has its own pool (src/lib/auth/better-auth/database.ts), so an instance holds up to two
 * connections; they can be merged once that file moves onto @phaseo/db/node.
 *
 * Never import this from a client component: it pulls in `pg`.
 * Relative imports only: scripts/ load src/utils/supabase/admin.ts (which imports this) with tsx.
 */
import type { RelationshipMetadata } from "@phaseo/db";
import { createNodeCompatClient, createNodePool } from "@phaseo/db/node";
import relationships from "@phaseo/db/relationships.json";
import type { SupabaseClient } from "@supabase/supabase-js";

type Pool = ReturnType<typeof createNodePool>;

let pool: Pool | undefined;

export function getWebDbPool(env: Record<string, string | undefined> = process.env): Pool {
	if (!pool) {
		const connectionString = env.PLANETSCALE_DATABASE_URL?.trim();
		if (!connectionString) throw new Error("DATABASE_PROVIDER=planetscale needs PLANETSCALE_DATABASE_URL");
		pool = createNodePool({ connectionString, max: Number(env.WEB_DATABASE_POOL_MAX ?? 1) || 1, applicationName: "phaseo-web" });
		// An idle client erroring (PgBouncer restart) must not crash the process.
		// eslint-disable-next-line no-console
		pool.on("error", (error: Error) => console.error("[db] idle Postgres client error", error.message));
	}
	return pool;
}

/** Test seam. */
export function resetWebDbPoolForTests(): void {
	pool = undefined;
}

const COMPAT_OPTIONS = {
	tags: { app: "web" },
	relationships: relationships as RelationshipMetadata,
	maxRows: 1000,
} as const;

/** service_role: bypasses RLS, like the Supabase service-role key. Server code only. */
export function createServiceDataClient(): SupabaseClient {
	return createNodeCompatClient(getWebDbPool(), { ...COMPAT_OPTIONS, role: "service_role" }) as unknown as SupabaseClient;
}

/**
 * Acting as a user (RLS applies, `auth.uid()` = claims.sub), or as anon when `claims` is null. `claims` must
 * come from a verified session (getSessionUser); `role` is forced to "authenticated".
 */
export function createUserDataClient(claims: (Record<string, unknown> & { sub: string }) | null): SupabaseClient {
	if (!claims) return createNodeCompatClient(getWebDbPool(), { ...COMPAT_OPTIONS, role: "anon" }) as unknown as SupabaseClient;
	return createNodeCompatClient(getWebDbPool(), {
		...COMPAT_OPTIONS,
		role: "authenticated",
		claims: { ...claims, role: "authenticated" },
	}) as unknown as SupabaseClient;
}
