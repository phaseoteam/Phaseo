/**
 * The website's switches for the Supabase -> PlanetScale + Better Auth move (database/planetscale/README.md).
 * Both default to "supabase", so a deployment without them behaves as before; rollback is an env change.
 *
 * Server-only values (no NEXT_PUBLIC_ prefix): the browser keeps using Supabase Auth's client until the
 * Better Auth client (src/lib/auth/better-auth/client.ts) replaces it; see MIGRATION-NOTES.md there.
 * Relative imports only: scripts/ load src/utils/supabase/admin.ts with tsx, without the @/ alias.
 */

export type DatabaseProvider = "supabase" | "planetscale";
export type AuthProvider = "supabase" | "better-auth";

type ProviderEnv = Record<string, string | undefined>;

const normalised = (value: string | undefined) => (value ?? "").trim().toLowerCase();

/** An unknown value is a configuration error, never a silent fallback to the other database. */
export function databaseProvider(env: ProviderEnv = process.env): DatabaseProvider {
	const value = normalised(env.DATABASE_PROVIDER);
	if (value === "" || value === "supabase") return "supabase";
	if (value === "planetscale") return "planetscale";
	throw new Error(`Unknown DATABASE_PROVIDER "${env.DATABASE_PROVIDER}" (expected supabase or planetscale)`);
}

/** Better Auth keeps its users and sessions in PlanetScale, so better-auth on the Supabase database is refused. */
export function authProvider(env: ProviderEnv = process.env): AuthProvider {
	const value = normalised(env.AUTH_PROVIDER);
	if (value === "" || value === "supabase") return "supabase";
	if (value === "better-auth" || value === "betterauth") {
		if (databaseProvider(env) !== "planetscale") throw new Error("AUTH_PROVIDER=better-auth needs DATABASE_PROVIDER=planetscale");
		return "better-auth";
	}
	throw new Error(`Unknown AUTH_PROVIDER "${env.AUTH_PROVIDER}" (expected supabase or better-auth)`);
}
