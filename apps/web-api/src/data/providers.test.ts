import { describe, expect, it, vi } from "vitest";
import type { HyperdriveScope } from "@phaseo/db/hyperdrive-scope";
import type { Env } from "@/env";
import { authProvider, databaseProvider } from "./providers";
import { createDataScope, runWithDataScope, type DataScope } from "./scope";
import { getAuthenticatedDataClient, getDataClient, rememberVerifiedClaims } from "./supabase";

const supabaseEnv = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_ANON_KEY: "anon" } as Env;
const planetscaleEnv = { ...supabaseEnv, DATABASE_PROVIDER: "planetscale", HYPERDRIVE: { connectionString: "postgres://hyperdrive.invalid/db" } } as unknown as Env;

function fakeScope() {
	const service = { kind: "service" };
	const db = {
		serviceClient: vi.fn(() => service),
		client: vi.fn((options: unknown) => ({ kind: "user", options })),
		trackingContext: vi.fn((ctx: unknown) => ctx),
		trackResponse: vi.fn((response: Response) => response),
		close: vi.fn(),
	};
	const scope: DataScope = { db: db as unknown as HyperdriveScope, verifiedClaims: new Map(), userClients: new Map() };
	return { scope, db, service };
}

const ctx = { waitUntil: vi.fn() };
const bearer = (token: string) => new Request("https://phaseo.app/api/account/x", { headers: { authorization: `Bearer ${token}` } });

describe("provider switches", () => {
	it("default to supabase and accept only known values", () => {
		expect(databaseProvider({})).toBe("supabase");
		expect(authProvider({})).toBe("supabase");
		expect(databaseProvider({ DATABASE_PROVIDER: " PlanetScale " })).toBe("planetscale");
		expect(() => databaseProvider({ DATABASE_PROVIDER: "planet" })).toThrow(/Unknown DATABASE_PROVIDER/);
		expect(() => authProvider({ AUTH_PROVIDER: "clerk" })).toThrow(/Unknown AUTH_PROVIDER/);
	});

	it("refuses Better Auth on the Supabase database", () => {
		expect(() => authProvider({ AUTH_PROVIDER: "better-auth" })).toThrow(/needs DATABASE_PROVIDER=planetscale/);
		expect(authProvider({ AUTH_PROVIDER: "better-auth", DATABASE_PROVIDER: "planetscale" })).toBe("better-auth");
	});
});

describe("getDataClient", () => {
	it("returns supabase-js by default, with no scope involved", async () => {
		const handler = vi.fn(async () => getDataClient(supabaseEnv));
		const client = await runWithDataScope(supabaseEnv, ctx, handler);
		expect(handler).toHaveBeenCalledWith(ctx);
		expect(typeof client.auth.getUser).toBe("function");
	});

	it("returns the invocation's PlanetScale service client and closes the scope afterwards", async () => {
		const { scope, db, service } = fakeScope();
		const response = await runWithDataScope(planetscaleEnv, ctx, async () => {
			expect(getDataClient(planetscaleEnv)).toBe(service);
			return new Response("ok");
		}, scope);
		expect(await response.text()).toBe("ok");
		expect(db.trackingContext).toHaveBeenCalledWith(ctx);
		expect(db.trackResponse).toHaveBeenCalled();
		expect(db.close).toHaveBeenCalledWith(ctx);
	});

	it("closes the scope when the handler throws", async () => {
		const { scope, db } = fakeScope();
		await expect(runWithDataScope(planetscaleEnv, ctx, async () => { throw new Error("boom"); }, scope)).rejects.toThrow("boom");
		expect(db.close).toHaveBeenCalledWith(ctx);
	});

	it("fails loudly outside a scope or without the Hyperdrive binding", () => {
		expect(() => getDataClient(planetscaleEnv)).toThrow(/no database scope/);
		expect(() => createDataScope({ DATABASE_PROVIDER: "planetscale" } as Env)).toThrow(/HYPERDRIVE binding/);
	});
});

describe("getAuthenticatedDataClient under planetscale", () => {
	it("acts only for a token requireUser verified in this invocation", async () => {
		const { scope, db } = fakeScope();
		await runWithDataScope(planetscaleEnv, ctx, async () => {
			expect(getAuthenticatedDataClient(planetscaleEnv, bearer("unverified"))).toBeNull();
			expect(getAuthenticatedDataClient(planetscaleEnv, new Request("https://phaseo.app/"))).toBeNull();
			rememberVerifiedClaims("verified", { sub: "user-1", role: "authenticated" });
			const client = getAuthenticatedDataClient(planetscaleEnv, bearer("verified"));
			expect(client).toEqual({ kind: "user", options: { role: "authenticated", claims: { sub: "user-1", role: "authenticated" } } });
			expect(getAuthenticatedDataClient(planetscaleEnv, bearer("verified"))).toBe(client);
		}, scope);
		expect(db.client).toHaveBeenCalledTimes(1);
	});

	it("keeps the supabase-js user client by default", () => {
		expect(getAuthenticatedDataClient(supabaseEnv, bearer("token"))).not.toBeNull();
		expect(getAuthenticatedDataClient(supabaseEnv, new Request("https://phaseo.app/"))).toBeNull();
	});
});
