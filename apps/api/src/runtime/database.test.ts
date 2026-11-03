import { afterEach, describe, expect, it, vi } from "vitest";
import type { HyperdriveScope } from "@phaseo/db/hyperdrive-scope";
import { authProvider, databaseProvider, planetScaleAuthSchemaClient, resetDatabaseFallbackForTests, runWithDatabaseScope } from "./database";
import { clearRuntime, configureRuntime, dispatchBackground, getSupabaseAdmin, runWithRequestScope } from "./env";

const HYPERDRIVE = { connectionString: "postgres://hyperdrive.invalid/db" };
const supabaseEnv = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", GATEWAY_CACHE: {} } as any;
const planetscaleEnv = { ...supabaseEnv, DATABASE_PROVIDER: "planetscale", HYPERDRIVE } as any;

function fakeScopeFactory() {
	const service = { kind: "planetscale-service" };
	const db = {
		serviceClient: vi.fn(() => service),
		client: vi.fn((options: unknown) => ({ kind: "scoped", options })),
		trackingContext: vi.fn((ctx: unknown) => ctx),
		trackResponse: vi.fn((response: Response) => response),
		close: vi.fn(),
	};
	const createScope = vi.fn(() => db as unknown as HyperdriveScope);
	return { createScope, db, service };
}

afterEach(() => {
	clearRuntime();
	resetDatabaseFallbackForTests();
});

describe("provider switches", () => {
	it("default to supabase and reject unknown values", () => {
		expect(databaseProvider({})).toBe("supabase");
		expect(databaseProvider(null)).toBe("supabase");
		expect(authProvider({})).toBe("supabase");
		expect(databaseProvider({ DATABASE_PROVIDER: "PLANETSCALE" })).toBe("planetscale");
		expect(() => databaseProvider({ DATABASE_PROVIDER: "neon" })).toThrow(/Unknown DATABASE_PROVIDER/);
		expect(() => authProvider({ AUTH_PROVIDER: "better-auth" })).toThrow(/needs DATABASE_PROVIDER=planetscale/);
		expect(authProvider({ AUTH_PROVIDER: "better-auth", DATABASE_PROVIDER: "planetscale" })).toBe("better-auth");
	});
});

describe("runWithDatabaseScope", () => {
	it("is a straight call under supabase", async () => {
		const { createScope } = fakeScopeFactory();
		const ctx = { waitUntil: vi.fn() };
		const handler = vi.fn(async (received: unknown) => received);
		expect(await runWithDatabaseScope(supabaseEnv, ctx, handler, createScope)).toBe(ctx);
		expect(createScope).not.toHaveBeenCalled();
	});

	it("gives getSupabaseAdmin the invocation's PlanetScale client and closes it afterwards", async () => {
		const { createScope, db, service } = fakeScopeFactory();
		const ctx = { waitUntil: vi.fn() };
		configureRuntime(planetscaleEnv);
		const response = await runWithDatabaseScope(planetscaleEnv, ctx, async (scopedCtx) =>
			runWithRequestScope(scopedCtx.waitUntil.bind(scopedCtx), async () => {
				expect(getSupabaseAdmin()).toBe(service);
				dispatchBackground(Promise.resolve("billing"));
				return new Response("ok");
			}), createScope);
		expect(createScope).toHaveBeenCalledWith(HYPERDRIVE, expect.objectContaining({ tags: { app: "gateway" }, maxRows: 1000 }));
		expect(await response.text()).toBe("ok");
		expect(db.trackingContext).toHaveBeenCalledWith(ctx);
		expect(ctx.waitUntil).toHaveBeenCalled();
		expect(db.trackResponse).toHaveBeenCalled();
		expect(db.close).toHaveBeenCalledWith(ctx);
	});

	it("needs the Hyperdrive binding under planetscale", async () => {
		await expect(runWithDatabaseScope({ DATABASE_PROVIDER: "planetscale" }, undefined, () => 1)).rejects.toThrow(/HYPERDRIVE binding/);
	});
});

describe("getSupabaseAdmin outside a scope", () => {
	it("keeps the supabase-js client by default", () => {
		configureRuntime(supabaseEnv);
		expect(typeof getSupabaseAdmin().auth.admin.getUserById).toBe("function");
	});

	it("falls back to one isolate client under planetscale (Durable Objects)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		configureRuntime(planetscaleEnv);
		const client = getSupabaseAdmin();
		expect(getSupabaseAdmin()).toBe(client);
		expect(typeof client.from).toBe("function");
		expect(() => client.auth).toThrow(/not available on the PlanetScale client/);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("never builds an auth-schema client outside a scope", () => {
		expect(() => planetScaleAuthSchemaClient()).toThrow(/no database scope/);
	});
});
