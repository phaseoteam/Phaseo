import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fromCalls: 0 }));

// Every query builder method chains; awaiting it yields an empty catalogue.
function emptyQuery(): any {
	return new Proxy({}, {
		get(_target, property) {
			if (property === "then") return (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
			return () => emptyQuery();
		},
	});
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ from: () => { state.fromCalls += 1; return emptyQuery(); }, rpc: () => emptyQuery() }),
	getCache: () => ({ get: async () => null, put: async () => undefined }),
	getBindingsIfConfigured: () => null,
	dispatchBackground: () => undefined,
}));

import { __resetTieredCacheForTests } from "@core/tiered-cache";
import { fetchCatalogue } from "./models.catalogue";

describe("fetchCatalogue cache", () => {
	beforeEach(() => {
		__resetTieredCacheForTests();
		state.fromCalls = 0;
	});

	it("serves a repeat request for the same filters without querying the database", async () => {
		const first = await fetchCatalogue({ availability: "active", endpoints: ["text.generate", "embeddings"] });
		const queries = state.fromCalls;
		expect(queries).toBeGreaterThan(0);
		// Equivalent filters in a different order share the cached entry.
		const second = await fetchCatalogue({ endpoints: ["embeddings", "text.generate"], availability: "active", modelIds: [] });
		expect(state.fromCalls).toBe(queries);
		expect(second).toEqual(first);
	});

	it("returns a copy, so a caller that mutates its list cannot change the cache", async () => {
		const first = await fetchCatalogue({ availability: "all" });
		first.push({ model_id: "injected" } as any);
		expect(await fetchCatalogue({ availability: "all" })).toEqual([]);
	});

	it("keeps different filters apart", async () => {
		await fetchCatalogue({ availability: "active" });
		const queries = state.fromCalls;
		await fetchCatalogue({ availability: "active", region: "eu", textOnly: true });
		expect(state.fromCalls).toBeGreaterThan(queries);
	});
});
