// Purpose: The gateway's DATABASE_PROVIDER / AUTH_PROVIDER switches and the PlanetScale data client.
// Why: Supabase -> PlanetScale + Better Auth (database/planetscale/README.md) with rollback as an env change.
// How: getSupabaseAdmin() (env.ts) asks here under DATABASE_PROVIDER=planetscale. Each Worker invocation
//      (fetch, cron, queue) runs in a database scope holding one Hyperdrive connection; the scope ends it via
//      ctx.waitUntil after the response body and all waitUntil work are done (@phaseo/db/hyperdrive-scope).
//      With DATABASE_PROVIDER=supabase (the default) runWithDatabaseScope calls straight through.

import { AsyncLocalStorage } from "node:async_hooks";
import type { RelationshipMetadata } from "@phaseo/db";
import { createHyperdriveCompatClient } from "@phaseo/db/hyperdrive";
import { createHyperdriveScope, type HyperdriveScope } from "@phaseo/db/hyperdrive-scope";
import type { AuthSchemaReader } from "@phaseo/db/jwt";
import relationships from "@phaseo/db/relationships.json";
import type { GatewayBindings } from "./env.types";

export type DatabaseProvider = "supabase" | "planetscale";
export type AuthProvider = "supabase" | "better-auth";

type ProviderBindings = Partial<Pick<GatewayBindings, "DATABASE_PROVIDER" | "AUTH_PROVIDER">>;

const normalised = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** An unknown value is a configuration error, never a silent fallback to the other database. */
export function databaseProvider(bindings: ProviderBindings | null | undefined): DatabaseProvider {
	const value = normalised(bindings?.DATABASE_PROVIDER);
	if (value === "" || value === "supabase") return "supabase";
	if (value === "planetscale") return "planetscale";
	throw new Error(`Unknown DATABASE_PROVIDER "${bindings?.DATABASE_PROVIDER}" (expected supabase or planetscale)`);
}

/** Better Auth's users and sessions live in PlanetScale, so better-auth on the Supabase database is refused. */
export function authProvider(bindings: ProviderBindings | null | undefined): AuthProvider {
	const value = normalised(bindings?.AUTH_PROVIDER);
	if (value === "" || value === "supabase") return "supabase";
	if (value === "better-auth" || value === "betterauth") {
		if (databaseProvider(bindings) !== "planetscale") throw new Error("AUTH_PROVIDER=better-auth needs DATABASE_PROVIDER=planetscale");
		return "better-auth";
	}
	throw new Error(`Unknown AUTH_PROVIDER "${bindings?.AUTH_PROVIDER}" (expected supabase or better-auth)`);
}

const COMPAT_OPTIONS = {
	tags: { app: "gateway" },
	relationships: relationships as RelationshipMetadata,
	maxRows: 1000,
} as const;

function hyperdriveBinding(bindings: Partial<GatewayBindings>) {
	const binding = bindings.HYPERDRIVE;
	if (!binding?.connectionString) throw new Error("DATABASE_PROVIDER=planetscale needs the HYPERDRIVE binding (wrangler.toml)");
	return binding;
}

const databaseScope = new AsyncLocalStorage<HyperdriveScope>();

export function currentDatabaseScope(): HyperdriveScope | undefined {
	return databaseScope.getStore();
}

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

/**
 * Run one invocation in a database scope. Under planetscale `handler` gets a ctx whose waitUntil is tracked,
 * a Response result is re-streamed so the scope outlives the body, and the connection is ended afterwards.
 */
export async function runWithDatabaseScope<Ctx extends WaitUntilCtx | undefined, Result>(
	bindings: Partial<GatewayBindings>,
	ctx: Ctx,
	handler: (ctx: Ctx) => Result | Promise<Result>,
	createScope: typeof createHyperdriveScope = createHyperdriveScope,
): Promise<Result> {
	if (databaseProvider(bindings) !== "planetscale") return handler(ctx);
	const scope = createScope(hyperdriveBinding(bindings), COMPAT_OPTIONS);
	const closer: WaitUntilCtx = ctx ?? { waitUntil: (promise) => void promise.catch(() => undefined) };
	try {
		const result = (await databaseScope.run(scope, () => handler((ctx ? scope.trackingContext(ctx) : ctx) as Ctx))) as Result;
		return (result instanceof Response ? scope.trackResponse(result) : result) as Result;
	} finally {
		scope.close(closer);
	}
}

let isolateFallback: { connectionString: string; client: unknown } | null = null;
let warnedFallback = false;

/**
 * The PlanetScale service_role client getSupabaseAdmin() returns under DATABASE_PROVIDER=planetscale: the
 * invocation's scope client, or, outside any scope (Durable Objects such as the realtime relay, which call
 * configureRuntime themselves), one client per isolate. Durable Objects may keep I/O across their own
 * requests; a plain Worker invocation must never reach the fallback, which is why every entry point in
 * index.ts runs in a scope.
 */
export function planetScaleServiceClient<Client>(bindings: Partial<GatewayBindings>): Client {
	const scope = databaseScope.getStore();
	if (scope) return scope.serviceClient() as Client;
	const binding = hyperdriveBinding(bindings);
	if (isolateFallback?.connectionString !== binding.connectionString) {
		if (!warnedFallback) {
			warnedFallback = true;
			console.warn("[db] PlanetScale client used outside a request scope; using the isolate client (expected only in Durable Objects)");
		}
		isolateFallback = { connectionString: binding.connectionString, client: createHyperdriveCompatClient(binding, { ...COMPAT_OPTIONS, role: "service_role" }).client };
	}
	return isolateFallback.client as Client;
}

/**
 * A service_role client on the `auth` schema (Better Auth's users/sessions) for this invocation. Only the
 * login role can read there (0001_auth.sql), so it must never be handed to user code.
 */
export function planetScaleAuthSchemaClient(): AuthSchemaReader {
	const scope = databaseScope.getStore();
	if (!scope) throw new Error("DATABASE_PROVIDER=planetscale: no database scope for this call (index.ts runs fetch in one)");
	// Typed structurally: checking the full postgrest-js client type against it is too deep for tsc.
	return scope.client({ role: "service_role", schemas: ["auth"] }) as unknown as AuthSchemaReader;
}

/**
 * A short-lived service_role client for one Durable Object operation (SpendLimitDurableObject's seed read):
 * call `close(ctx)` with the object's state when done.
 */
export function oneShotPlanetScaleClient(bindings: Partial<GatewayBindings>) {
	return createHyperdriveCompatClient(hyperdriveBinding(bindings), { ...COMPAT_OPTIONS, role: "service_role" });
}

/** Test seam. */
export function resetDatabaseFallbackForTests(): void {
	isolateFallback = null;
	warnedFallback = false;
}
