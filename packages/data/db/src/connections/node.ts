/**
 * Vercel / Node -> PgBouncer (:6432) -> PlanetScale, using node-postgres.
 *
 * One small Pool per server instance (module scope), `max: 1` by default as
 * the design contract asks (serverless instances multiply; PgBouncer does the
 * pooling). TLS is verify-full: the certificate chain must validate and the
 * host name must match. PlanetScale serves publicly trusted certificates, so
 * Node's default CA store works; pass `ca` for a private CA.
 */
import { Pool, type PoolConfig } from "pg";
import { createCompatClient, type CompatClient, type CompatClientOptions } from "../client";
import { pgExecutor } from "../executor";

export type NodePoolOptions = {
	connectionString: string;
	/** Defaults to 1. */
	max?: number;
	/** PEM CA bundle when the server certificate is not publicly trusted. */
	ca?: string;
	/** Defaults to 10s. */
	idleTimeoutMillis?: number;
	/** Defaults to 10s. */
	connectionTimeoutMillis?: number;
	/** Shown in pg_stat_activity / Insights. */
	applicationName?: string;
};

/**
 * Strip libpq TLS parameters from the URL so they cannot override the `ssl`
 * object below (pg lets `sslmode=no-verify` in the string win).
 */
function withoutSslParams(connectionString: string): string {
	try {
		const url = new URL(connectionString);
		for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "sslaccept", "uselibpqcompat"]) url.searchParams.delete(key);
		return url.toString();
	} catch {
		return connectionString;
	}
}

export function createNodePool(options: NodePoolOptions): Pool {
	const config: PoolConfig = {
		connectionString: withoutSslParams(options.connectionString),
		max: options.max ?? 1,
		idleTimeoutMillis: options.idleTimeoutMillis ?? 10_000,
		connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
		application_name: options.applicationName,
		// verify-full: reject unknown CAs and check the host name (pg's default checkServerIdentity).
		ssl: { rejectUnauthorized: true, ...(options.ca ? { ca: options.ca } : {}) },
	};
	return new Pool(config);
}

export type NodeCompatOptions = Omit<CompatClientOptions, "sql">;

/** A PostgREST-compatible data client on an existing Pool (create the Pool once per instance). */
export function createNodeCompatClient<Database = any>(pool: Pool, options: NodeCompatOptions): CompatClient<Database> {
	return createCompatClient<Database>({ ...options, sql: pgExecutor(pool) });
}
