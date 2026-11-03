import { Pool, type PoolConfig } from "pg";

/**
 * The seam between Better Auth and Postgres. Today it builds a `pg` Pool on `PLANETSCALE_DATABASE_URL`; once
 * `@phaseo/db` (packages/data/db) exports its Node connection, swap the body of `getAuthPool` for that and leave
 * the callers alone.
 *
 * Sizing follows database/planetscale/README.md: on Vercel one connection per instance, through PgBouncer (:6432).
 * Better Auth's statements are all simple extended-protocol queries without named prepared statements, so they work
 * through PgBouncer in transaction mode.
 */

type Env = Record<string, string | undefined>;

export function authPoolConfig(env: Env = process.env): PoolConfig {
	const raw = env.PLANETSCALE_DATABASE_URL?.trim();
	if (!raw) throw new Error("PLANETSCALE_DATABASE_URL is required for Better Auth");
	const url = new URL(raw);
	const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
	// node-postgres ignores libpq's sslrootcert handling; TLS is configured explicitly below instead.
	for (const param of ["sslmode", "sslrootcert", "sslnegotiation"]) url.searchParams.delete(param);
	return {
		connectionString: url.toString(),
		max: Number(env.AUTH_DATABASE_POOL_MAX ?? 1) || 1,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: 10_000,
		allowExitOnIdle: true,
		application_name: "phaseo-web-auth",
		ssl: local ? false : { rejectUnauthorized: true },
	};
}

let pool: Pool | undefined;

export function getAuthPool(env: Env = process.env): Pool {
	if (!pool) {
		pool = new Pool(authPoolConfig(env));
		// An idle client erroring (e.g. PgBouncer restart) must not crash the process.
		pool.on("error", (error) => console.error("[better-auth] idle Postgres client error", error.message));
	}
	return pool;
}
