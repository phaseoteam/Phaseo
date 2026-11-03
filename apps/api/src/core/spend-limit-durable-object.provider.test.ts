import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
	rpc: vi.fn(async () => ({ data: { seeded: "planetscale" }, error: null })),
	close: vi.fn(),
	createClient: vi.fn(() => ({ rpc: vi.fn(async () => ({ data: { seeded: "supabase" }, error: null })) })),
}));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", () => ({ dispatchBackground: () => undefined, getBindingsIfConfigured: () => null }));
vi.mock("@supabase/supabase-js", () => ({ createClient: db.createClient }));
vi.mock("@phaseo/db/hyperdrive", () => ({
	createHyperdriveCompatClient: vi.fn(() => ({ client: { rpc: db.rpc }, close: db.close })),
}));

import { SpendLimitDurableObject } from "./spend-limit-durable-object";

class Probe extends SpendLimitDurableObject {
	seedFor() {
		return this.loadSeed("workspace-1", ["key-1"], []);
	}
}

const state = {
	blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
	waitUntil: vi.fn(),
	storage: { sql: { exec: () => ({ toArray: () => [], one: () => undefined }) } },
} as unknown as DurableObjectState;

beforeEach(() => vi.clearAllMocks());

describe("SpendLimitDurableObject seed read by DATABASE_PROVIDER", () => {
	it("uses supabase-js by default", async () => {
		const probe = new Probe(state, { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" } as never);
		expect(await probe.seedFor()).toEqual({ seeded: "supabase" });
		expect(db.rpc).not.toHaveBeenCalled();
	});

	it("reads through a one-shot Hyperdrive client under planetscale and closes it with the object's ctx", async () => {
		const probe = new Probe(state, { DATABASE_PROVIDER: "planetscale", HYPERDRIVE: { connectionString: "postgres://h/db" } } as never);
		expect(await probe.seedFor()).toEqual({ seeded: "planetscale" });
		expect(db.rpc).toHaveBeenCalledWith("gateway_spend_limit_seed", { p_workspace_id: "workspace-1", p_key_ids: ["key-1"], p_exclude_request_ids: [] });
		expect(db.close).toHaveBeenCalledWith(state);
		expect(db.createClient).not.toHaveBeenCalled();
	});

	it("still closes the client when the read fails", async () => {
		db.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } } as never);
		const probe = new Probe(state, { DATABASE_PROVIDER: "planetscale", HYPERDRIVE: { connectionString: "postgres://h/db" } } as never);
		await expect(probe.seedFor()).rejects.toThrow("spend_limit_seed_failed:boom");
		expect(db.close).toHaveBeenCalledTimes(1);
	});
});
