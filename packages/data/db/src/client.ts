/**
 * createCompatClient: a supabase-js-shaped data client (`.from()`, `.rpc()`,
 * `.schema()`) backed by plain Postgres. The query builder is
 * @supabase/postgrest-js itself; only its `fetch` is replaced.
 */
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SqlExecutor } from "./executor";
import { type CompatFetchOptions, createCompatFetch, type QueryEvent, type SessionRunner } from "./postgrest/fetch";
import { EMPTY_METADATA, type RelationshipMetadata } from "./relationships";
import { type QueryTags, tagStatement } from "./tags";
import type { UnsupportedFeatureError } from "./errors";

export type CompatRole = "service_role" | "authenticated" | "anon";

export type CompatClientOptions = {
	/** Where statements run: postgresJsExecutor(sql), pgExecutor(pool), or your own. */
	sql: SqlExecutor;
	role: CompatRole;
	/** JWT claims for `request.jwt.claims` (auth.uid() reads `sub`). `role` is filled in if missing. */
	claims?: Record<string, unknown>;
	/** sqlcommenter tags: at least `app` and `route`; `table` is added per statement. */
	tags?: QueryTags & { app?: string; route?: string };
	onQuery?: (event: QueryEvent) => void;
	/** Static relationship + function metadata (src/generated/relationships.json). Needed for embeds, RPC and upsert-without-onConflict. */
	relationships?: RelationshipMetadata;
	/** PostgREST `db-max-rows`. Supabase's default (and Phaseo's) is 1000; null disables. */
	maxRows?: number | null;
	/** Exposed schemas (PostgREST `db-schemas`); the first is the default profile. */
	schemas?: string[];
	/**
	 * service_role only: when to set `request.jwt.claims = {"role":"service_role"}`
	 * for the statement (Supabase does on every request; some triggers check
	 * `auth.role()`). "writes" wraps POST/PATCH/DELETE and RPC in a transaction
	 * that sets it; "always" also wraps reads; "never" skips it (use when the
	 * login role already has it as a default via ALTER ROLE ... SET).
	 */
	serviceRoleClaims?: "writes" | "always" | "never";
	/** Retry GET/HEAD on 503 like supabase-js does (postgrest-js `retry`). Default true. */
	retry?: boolean;
	onStatement?: CompatFetchOptions["onStatement"];
	onUnsupported?: (error: UnsupportedFeatureError) => void;
};

const NOT_AVAILABLE = ["auth", "storage", "functions", "realtime", "channel", "removeChannel", "removeAllChannels", "getChannels"] as const;

type WithoutInternal<Database> = Omit<Database, "__InternalSupabase">;
/** Same defaults SupabaseClient uses for the PostgrestClient behind .from()/.rpc(). */
export type CompatClientOptionsOf<Database> = Database extends { __InternalSupabase: { PostgrestVersion: string } } ? Database["__InternalSupabase"] : { PostgrestVersion: "12" };
export type DefaultSchemaName<Database> = "public" extends keyof WithoutInternal<Database> ? "public" : string & keyof WithoutInternal<Database>;

/**
 * The data API of `SupabaseClient<Database>` (`from`, `rpc`, `schema`), typed exactly as
 * supabase-js types it. `auth`/`storage`/`functions`/`realtime` exist only to throw.
 */
export type CompatClient<Database = any, SchemaName extends string & keyof WithoutInternal<Database> = DefaultSchemaName<Database>> = PostgrestClient<
	Database,
	CompatClientOptionsOf<Database>,
	SchemaName
> & {
	readonly auth: never;
	readonly storage: never;
	readonly functions: never;
	readonly realtime: never;
};

const SETUP_SQL = "select set_config('request.jwt.claims', $1, true), set_config('request.method', $2, true), set_config('request.path', $3, true)";
const SETUP_ROLE_SQL = `${SETUP_SQL}, set_config('role', $4, true)`;

/**
 * Build the session runner: for anon/authenticated every request is one
 * transaction that first does PostgREST's
 * `select set_config('request.jwt.claims', …, true), …, set_config('role', …, true)`
 * (set_config('role', x, true) is exactly SET LOCAL ROLE x). The setup and
 * the statement are issued back to back so postgres.js can pipeline them.
 */
export function createSessionRunner(options: Pick<CompatClientOptions, "sql" | "role" | "claims" | "tags" | "serviceRoleClaims">): SessionRunner {
	const { sql: executor, role } = options;
	if (role !== "service_role" && role !== "authenticated" && role !== "anon") throw new Error(`@phaseo/db: unknown role ${String(role)}`);
	const claims = JSON.stringify({ ...(options.claims ?? {}), role: (options.claims?.role as string | undefined) ?? role });
	const serviceClaims = options.serviceRoleClaims ?? "writes";
	return async (request, fn) => {
		const userScoped = role !== "service_role";
		const setClaims = userScoped || serviceClaims === "always" || (serviceClaims === "writes" && (request.kind !== "select"));
		if (!setClaims) return request.transactional ? executor.transaction(fn) : fn(executor);
		const setupSql = tagStatement(userScoped ? SETUP_ROLE_SQL : SETUP_SQL, { ...(options.tags ?? {}), table: request.table });
		const setupParams = userScoped ? [claims, request.method, request.path, role] : [claims, request.method, request.path];
		return executor.transaction(async (tx) => {
			// Issue both before awaiting either: the connection runs them in order,
			// and postgres.js pipelines them into one round trip.
			const setup = tx.query(setupSql, setupParams);
			const main = fn(tx);
			main.catch(() => undefined); // if setup fails, main fails too; report setup's error
			await setup;
			return await main;
		});
	};
}

export function createCompatClient<Database = any, SchemaName extends string & keyof WithoutInternal<Database> = DefaultSchemaName<Database>>(
	options: CompatClientOptions,
): CompatClient<Database, SchemaName> {
	const schemas = options.schemas ?? ["public"];
	const compatFetch = createCompatFetch({
		meta: options.relationships ?? EMPTY_METADATA,
		maxRows: options.maxRows === undefined ? 1000 : options.maxRows,
		schemas,
		tags: options.tags ?? {},
		authenticated: options.role === "authenticated",
		run: createSessionRunner(options),
		onQuery: options.onQuery,
		onStatement: options.onStatement,
		onUnsupported: options.onUnsupported,
	});
	const client = new PostgrestClient<Database, CompatClientOptionsOf<Database>, SchemaName>("http://phaseo-db.invalid", {
		fetch: compatFetch,
		schema: schemas[0] as never,
		retry: options.retry ?? true,
	});
	for (const member of NOT_AVAILABLE) {
		Object.defineProperty(client, member, {
			get() {
				throw new Error(`@phaseo/db: supabase.${member} is not available on the PlanetScale client (data API only: .from(), .rpc(), .schema()).`);
			},
			enumerable: false,
		});
	}
	return client as CompatClient<Database, SchemaName>;
}
