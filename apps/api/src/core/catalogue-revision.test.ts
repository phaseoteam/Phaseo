import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	store: new Map<string, string>(),
	rpcResult: { data: "7" as unknown, error: null as unknown },
	background: [] as Promise<unknown>[],
}));

vi.mock("@/runtime/env", () => ({
	getCache: () => ({
		get: vi.fn(async (key: string) => state.store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => { state.store.set(key, value); }),
	}),
	getSupabaseAdmin: () => ({
		rpc: () => ({ abortSignal: async () => state.rpcResult }),
	}),
	dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
}));

import {
	__resetCatalogueRevisionForTests,
	CATALOGUE_REVISION_KEY,
	knownCatalogueRevision,
	publishCatalogueRevision,
} from "./catalogue-revision";

describe("catalogue revision", () => {
	beforeEach(() => {
		__resetCatalogueRevisionForTests();
		state.store.clear();
		state.background = [];
		state.rpcResult = { data: "7", error: null };
	});

	it("writes the revision to KV only when it changed", async () => {
		expect(await publishCatalogueRevision()).toEqual({ revision: "7", changed: true });
		expect(await publishCatalogueRevision()).toEqual({ revision: "7", changed: false });
		expect(state.store.get(CATALOGUE_REVISION_KEY)).toBe("7");
	});

	it("fails loudly when the database revision is unavailable", async () => {
		state.rpcResult = { data: null, error: { message: "down" } };
		await expect(publishCatalogueRevision()).rejects.toThrow("gateway_catalogue_revision_failed");
	});

	it("returns the last known revision without blocking and refreshes it in the background", async () => {
		state.store.set(CATALOGUE_REVISION_KEY, "12");
		expect(knownCatalogueRevision()).toBeNull();
		await Promise.all(state.background);
		expect(knownCatalogueRevision()).toBe("12");
	});
});
