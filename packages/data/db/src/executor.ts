/**
 * The minimal driver surface the PostgREST translator needs. Every parameter
 * is sent as text (or NULL) with an unspecified type, like PostgREST's
 * `HE.unknown` encoder, so Postgres infers each one from its context.
 */
export type SqlParam = string | null;
export type SqlRow = Record<string, unknown>;

export interface SqlExecutor {
	query(text: string, params: readonly SqlParam[]): Promise<SqlRow[]>;
	/** Run `fn` in one transaction; a throw rolls it back and rethrows. Nested calls reuse the open transaction. */
	transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** Structural subset of a postgres.js `Sql` / `TransactionSql`. */
export type PostgresJsLike = {
	unsafe(query: string, params?: unknown[], options?: { prepare?: boolean }): PromiseLike<unknown>;
	begin?(fn: (tx: PostgresJsLike) => Promise<unknown>): Promise<unknown>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	options?: { serializers?: Record<number, (value: any) => unknown>; transform?: { column?: { from?: unknown }; value?: { from?: unknown } } };
};

function inTransaction(query: SqlExecutor["query"]): SqlExecutor {
	const scoped: SqlExecutor = { query, transaction: (fn) => fn(scoped) };
	return scoped;
}

/**
 * A parameter that must reach Postgres as the exact text given. postgres.js
 * Describes each prepared statement and then runs the *server-inferred*
 * type's serializer over the value: a string bound to a `json` parameter is
 * JSON.stringify'd again, and a `boolean` one becomes 'f' unless it is the JS
 * value `true` — which would silently invert `.eq("hidden", true)`.
 */
class RawText {
	constructor(readonly value: string) {}
	toString() {
		return this.value;
	}
}

const PATCHED = Symbol.for("@phaseo/db.rawTextSerializers");

/**
 * Make the client's serializers pass RawText through untouched. Other values
 * keep the client's normal behaviour, so the same client stays safe for
 * tagged-template queries. A Proxy also covers serializers postgres.js adds
 * later (array types).
 */
function installRawTextSerializers(sql: PostgresJsLike) {
	const options = sql.options;
	if (!options?.serializers) throw new Error("@phaseo/db: postgresJsExecutor needs a postgres.js client (sql.options.serializers is missing)");
	if (options.transform?.column?.from || options.transform?.value?.from) {
		throw new Error("@phaseo/db: postgresJsExecutor needs a postgres.js client without column/value transforms");
	}
	const current = options.serializers as unknown as Record<string | symbol, unknown>;
	if (current[PATCHED]) return;
	options.serializers = new Proxy(current, {
		get(target, key) {
			if (key === PATCHED) return true;
			const fn = target[key];
			if (typeof fn !== "function") return fn;
			return (x: unknown) => (x instanceof RawText ? x.value : (fn as (v: unknown) => string)(x));
		},
	}) as unknown as NonNullable<typeof options.serializers>;
}

/**
 * Wrap postgres.js. `prepare: true` is passed on every call: postgres.js's
 * `unsafe()` otherwise defaults to unnamed statements plus an extra Describe
 * round trip, which Cloudflare warns can hang or fail under Hyperdrive.
 */
export function postgresJsExecutor(sql: PostgresJsLike): SqlExecutor {
	installRawTextSerializers(sql);
	const runner = (target: PostgresJsLike) => async (text: string, params: readonly SqlParam[]) =>
		(await target.unsafe(
			text,
			params.map((p) => (p === null ? null : new RawText(p))),
			{ prepare: true },
		)) as SqlRow[];
	return {
		query: runner(sql),
		async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
			if (!sql.begin) throw new Error("postgres.js client cannot start a transaction");
			return (await sql.begin((tx) => fn(inTransaction(runner(tx))))) as T;
		},
	};
}

/** Structural subset of a node-postgres `Pool`. */
export type PgQueryable = {
	query(text: string, params?: unknown[]): Promise<{ rows: SqlRow[] }>;
};
export type PgPoolLike = PgQueryable & {
	connect(): Promise<PgQueryable & { release(err?: Error | boolean): void }>;
};

export function pgExecutor(pool: PgPoolLike): SqlExecutor {
	return {
		async query(text, params) {
			return (await pool.query(text, params as unknown[])).rows;
		},
		async transaction(fn) {
			const client = await pool.connect();
			let broken: Error | undefined;
			try {
				await client.query("BEGIN");
				try {
					const result = await fn(inTransaction(async (text, params) => (await client.query(text, params as unknown[])).rows));
					await client.query("COMMIT");
					return result;
				} catch (error) {
					try {
						await client.query("ROLLBACK");
					} catch (rollbackError) {
						broken = rollbackError as Error;
					}
					throw error;
				}
			} finally {
				client.release(broken);
			}
		},
	};
}
