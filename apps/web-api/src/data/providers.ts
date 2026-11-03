/**
 * The per-app switches for the Supabase -> PlanetScale + Better Auth move (database/planetscale/README.md).
 * Both default to "supabase", so an env without them behaves exactly as before; rolling back is an env change.
 */
import type { Env } from "@/env";

export type DatabaseProvider = "supabase" | "planetscale";
export type AuthProvider = "supabase" | "better-auth";

type ProviderEnv = Pick<Env, "DATABASE_PROVIDER" | "AUTH_PROVIDER">;

function normalised(value: string | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

/** An unknown value is a configuration error, not a silent fallback: it would point writes at the wrong database. */
export function databaseProvider(env: ProviderEnv): DatabaseProvider {
	const value = normalised(env.DATABASE_PROVIDER);
	if (value === "" || value === "supabase") return "supabase";
	if (value === "planetscale") return "planetscale";
	throw new Error(`Unknown DATABASE_PROVIDER "${env.DATABASE_PROVIDER}" (expected supabase or planetscale)`);
}

/**
 * Better Auth's users, sessions and the user-scoped (RLS) clients all live in PlanetScale, so
 * AUTH_PROVIDER=better-auth with DATABASE_PROVIDER=supabase can't work and is refused.
 */
export function authProvider(env: ProviderEnv): AuthProvider {
	const value = normalised(env.AUTH_PROVIDER);
	if (value === "" || value === "supabase") return "supabase";
	if (value === "better-auth" || value === "betterauth") {
		if (databaseProvider(env) !== "planetscale") throw new Error("AUTH_PROVIDER=better-auth needs DATABASE_PROVIDER=planetscale");
		return "better-auth";
	}
	throw new Error(`Unknown AUTH_PROVIDER "${env.AUTH_PROVIDER}" (expected supabase or better-auth)`);
}
