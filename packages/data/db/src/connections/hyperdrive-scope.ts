/**
 * One Worker invocation's database scope: a lazily opened postgres.js client on Hyperdrive, shared by every
 * compat client the invocation makes, and closed once the invocation's work is done.
 *
 * Why not just `ctx.waitUntil(sql.end())` after the handler returns: the apps keep using the database after
 * that point, in `waitUntil` work (billing, audit) and while a streamed body is still being written. `sql.end()`
 * rejects queries issued after it, so the scope first waits for that tracked work, then ends the client.
 *
 * - `trackingContext(ctx)`: a ctx whose `waitUntil` also registers the promise with the scope;
 * - `trackResponse(response)`: re-streams the body so the scope knows when it has been fully sent;
 * - `close(ctx)`: `ctx.waitUntil(drain tracked work, then sql.end())`.
 *
 * The postgres.js client is created when the first compat client is asked for (postgres.js itself connects on
 * the first query), so invocations that never touch the database cost nothing.
 * A postgres.js client must not be shared across Worker requests (its socket belongs to the request that
 * opened it), which is why this is per invocation and not per isolate.
 */
import { createCompatClient, type CompatClient, type CompatClientOptions, type CompatRole } from "../client";
import { postgresJsExecutor } from "../executor";
import { createHyperdriveSql, type HyperdriveBinding, type HyperdriveSqlOptions, type PostgresSql, type WaitUntilContext } from "./hyperdrive";

type SqlLike = Pick<PostgresSql, "end">;

export type HyperdriveScopeOptions = Omit<CompatClientOptions, "sql" | "role" | "claims"> &
	HyperdriveSqlOptions & {
		/** Seconds `sql.end()` waits for in-flight queries. Defaults to 5. */
		endTimeoutSeconds?: number;
		/** Test seam: build the postgres.js client. Defaults to createHyperdriveSql. */
		createSql?: (binding: HyperdriveBinding, options: HyperdriveSqlOptions) => PostgresSql;
	};

export type ScopedClientOptions = Partial<Omit<CompatClientOptions, "sql" | "role">> & { role: CompatRole };

export type HyperdriveScope = {
	/** Whether this scope created its postgres.js client. */
	readonly opened: boolean;
	/** The scope's service_role client (memoised). */
	serviceClient<Database = any>(): CompatClient<Database>;
	/** Another compat client on the scope's connection (authenticated/anon with claims, other schemas…). */
	client<Database = any>(options: ScopedClientOptions): CompatClient<Database>;
	/** Keep the connection open until `work` settles. */
	track(work: Promise<unknown>): void;
	/** `ctx` with `waitUntil` also tracked; everything else forwards to the real ctx. */
	trackingContext<T extends WaitUntilContext>(ctx: T): T;
	/** The same response, with its body re-streamed so the scope stays open until it has been sent. */
	trackResponse(response: Response): Response;
	/** Drain tracked work, then end the connection, without delaying the response. Idempotent. */
	close(ctx: WaitUntilContext): void;
	/** What `close` hands to `waitUntil`. */
	drainAndEnd(): Promise<void>;
};

export function createHyperdriveScope(binding: HyperdriveBinding, options: HyperdriveScopeOptions = {}): HyperdriveScope {
	const { max, endTimeoutSeconds = 5, createSql = createHyperdriveSql, ...clientDefaults } = options;
	const pending = new Set<Promise<unknown>>();
	let sql: PostgresSql | null = null;
	let service: CompatClient | null = null;
	let ended = false;
	let closing: Promise<void> | null = null;

	const connection = (): PostgresSql => {
		if (ended) throw new Error("@phaseo/db: this request's database scope has already ended");
		sql ??= createSql(binding, { max });
		return sql;
	};
	let executor: ReturnType<typeof postgresJsExecutor> | null = null;
	const make = <Database>(clientOptions: ScopedClientOptions): CompatClient<Database> => {
		executor ??= postgresJsExecutor(connection());
		return createCompatClient<Database>({ ...clientDefaults, ...clientOptions, sql: executor });
	};

	const track = (work: Promise<unknown>) => {
		const settled = work.then(
			() => undefined,
			() => undefined,
		);
		pending.add(settled);
		void settled.then(() => pending.delete(settled));
	};

	const drainAndEnd = async () => {
		while (pending.size) await Promise.all([...pending]);
		ended = true;
		const opened = sql as SqlLike | null;
		if (opened) await opened.end({ timeout: endTimeoutSeconds }).catch(() => undefined);
	};

	return {
		get opened() {
			return sql !== null;
		},
		serviceClient<Database = any>() {
			service ??= make({ role: "service_role" });
			return service as CompatClient<Database>;
		},
		client: make,
		track,
		trackingContext<T extends WaitUntilContext>(ctx: T): T {
			return new Proxy(ctx, {
				get(target, property) {
					if (property === "waitUntil") {
						return (work: Promise<unknown>) => {
							track(work);
							target.waitUntil(work);
						};
					}
					const value = Reflect.get(target, property, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
			});
		},
		trackResponse(response: Response): Response {
			// 101 responses carry a WebSocket, which `new Response()` would drop.
			if (!response.body || response.status === 101 || (response as { webSocket?: unknown }).webSocket) return response;
			const { readable, writable } = new TransformStream();
			track(response.body.pipeTo(writable));
			return new Response(readable, response);
		},
		close(ctx: WaitUntilContext) {
			closing ??= drainAndEnd();
			ctx.waitUntil(closing);
		},
		drainAndEnd() {
			closing ??= drainAndEnd();
			return closing;
		},
	};
}
