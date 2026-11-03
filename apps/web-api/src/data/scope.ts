/**
 * The per-invocation database scope for DATABASE_PROVIDER=planetscale.
 *
 * getDataClient(env) is called synchronously from ~390 places without a ctx, so the request's Hyperdrive
 * connection lives in AsyncLocalStorage: index.ts runs every fetch and cron invocation inside
 * runWithDataScope, which opens nothing until a client is asked for and ends the connection (via
 * ctx.waitUntil) after the response body and every waitUntil task have finished. See
 * @phaseo/db/hyperdrive-scope for why the close has to wait for those.
 *
 * With DATABASE_PROVIDER=supabase (the default) runWithDataScope calls the handler directly: no store, no
 * wrapping, no change.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { RelationshipMetadata } from "@phaseo/db";
import { createHyperdriveScope, type HyperdriveScope } from "@phaseo/db/hyperdrive-scope";
import relationships from "@phaseo/db/relationships.json";
import type { Env } from "@/env";
import { databaseProvider } from "./providers";

export type DataScope = {
	db: HyperdriveScope;
	/** Bearer token -> `request.jwt.claims`, recorded by requireUser once it has verified the token. */
	verifiedClaims: Map<string, Record<string, unknown>>;
	userClients: Map<string, unknown>;
};

const storage = new AsyncLocalStorage<DataScope>();

export function currentDataScope(): DataScope | undefined {
	return storage.getStore();
}

export function requireDataScope(): DataScope {
	const scope = storage.getStore();
	if (!scope) throw new Error("DATABASE_PROVIDER=planetscale: no database scope for this call (wrap the entry point in runWithDataScope)");
	return scope;
}

/** Test seam and entry point: create the scope for an invocation. */
export function createDataScope(env: Env, createScope: typeof createHyperdriveScope = createHyperdriveScope): DataScope {
	if (!env.HYPERDRIVE?.connectionString) throw new Error("DATABASE_PROVIDER=planetscale needs the HYPERDRIVE binding (wrangler.toml)");
	return {
		db: createScope(env.HYPERDRIVE, {
			tags: { app: "web-api" },
			relationships: relationships as RelationshipMetadata,
			maxRows: 1000,
		}),
		verifiedClaims: new Map(),
		userClients: new Map(),
	};
}

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

export async function runWithDataScope<Ctx extends WaitUntilCtx, Result>(
	env: Env,
	ctx: Ctx,
	handler: (ctx: Ctx) => Result | Promise<Result>,
	scope?: DataScope,
): Promise<Result> {
	if (databaseProvider(env) !== "planetscale") return handler(ctx);
	const dataScope = scope ?? createDataScope(env);
	// app.request() in tests passes no ctx: close in the background instead.
	const closer: WaitUntilCtx = ctx ?? { waitUntil: (promise) => void promise.catch(() => undefined) };
	try {
		const result = (await storage.run(dataScope, () => handler(ctx ? dataScope.db.trackingContext(ctx) : ctx))) as Result;
		return (result instanceof Response ? dataScope.db.trackResponse(result) : result) as Result;
	} finally {
		dataScope.db.close(closer);
	}
}
