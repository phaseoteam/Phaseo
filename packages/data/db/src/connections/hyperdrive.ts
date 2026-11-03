/**
 * Cloudflare Workers -> Hyperdrive -> PlanetScale, using postgres.js.
 *
 * Follows Cloudflare's Hyperdrive + postgres.js guide (checked 2026-11-03):
 * - create the client per request; Hyperdrive owns the real pool, so this is cheap;
 * - `max: 5` (Workers' concurrent outbound connection limit is 6);
 * - `fetch_types: false` skips postgres.js's pg_type round trip. The compat
 *   client sends every parameter as text and reads JSON as text, so it never
 *   needs array type OIDs;
 * - prepared statements stay ON. Cloudflare's guide says "Do not use
 *   `prepare: false` with Postgres.js": without them postgres.js sends extra
 *   Describe messages that Hyperdrive's transaction pooling handles badly
 *   (hangs, intermittent failures). database/planetscale/README.md still says
 *   `prepare: false`; that predates this guidance;
 * - after the response, close with `ctx.waitUntil(sql.end())` so closing
 *   does not delay the response.
 *
 * Needs `compatibility_flags = ["nodejs_compat"]` and postgres >= 3.4.5.
 * Known issue: postgres.js on workerd logs one unhandled "Stream was
 * cancelled" rejection per `sql.end()` (porsager/postgres#1202).
 */
import postgres from "postgres";
import { createCompatClient, type CompatClient, type CompatClientOptions } from "../client";
import { postgresJsExecutor } from "../executor";

/** The part of a Hyperdrive binding this needs (structural, no workers-types dependency). */
export type HyperdriveBinding = { connectionString: string };
export type WaitUntilContext = { waitUntil(promise: Promise<unknown>): void };

export type HyperdriveSqlOptions = {
	/** Defaults to 5. */
	max?: number;
};

export type PostgresSql = ReturnType<typeof postgres>;

/** A request-scoped postgres.js client on a Hyperdrive binding. Close it with closeHyperdriveSql. */
export function createHyperdriveSql(binding: HyperdriveBinding, options: HyperdriveSqlOptions = {}): PostgresSql {
	return postgres(binding.connectionString, {
		max: options.max ?? 5,
		fetch_types: false,
		prepare: true,
	});
}

/**
 * End the client once in-flight queries finish, without delaying the
 * response. Call it when the request is done (e.g. after `await next()` in
 * Hono middleware); queries issued after this are rejected.
 */
export function closeHyperdriveSql(sql: PostgresSql, ctx: WaitUntilContext, timeoutSeconds = 5): void {
	ctx.waitUntil(sql.end({ timeout: timeoutSeconds }).catch(() => undefined));
}

export type HyperdriveCompatOptions = Omit<CompatClientOptions, "sql"> & HyperdriveSqlOptions;

/** Request-scoped postgres.js client + PostgREST-compatible data client; call `close(ctx)` when the request ends. */
export function createHyperdriveCompatClient<Database = any>(
	binding: HyperdriveBinding,
	options: HyperdriveCompatOptions,
): { client: CompatClient<Database>; sql: PostgresSql; close(ctx: WaitUntilContext): void } {
	const { max, ...rest } = options;
	const sql = createHyperdriveSql(binding, { max });
	return {
		client: createCompatClient<Database>({ ...rest, sql: postgresJsExecutor(sql) }),
		sql,
		close: (ctx) => closeHyperdriveSql(sql, ctx),
	};
}
