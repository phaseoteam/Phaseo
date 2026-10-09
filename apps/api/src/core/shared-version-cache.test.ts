import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	kv: new Map<string, string>(),
	kvGets: [] as Array<{ key: string; options: unknown }>,
	located: new Map<string, string>(),
	background: [] as Promise<unknown>[],
	bindings: {} as Record<string, string>,
}));

vi.mock("@/runtime/env", () => ({
	getBindingsIfConfigured: () => state.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
	getCache: () => ({
		get: async (key: string, options: unknown) => {
			state.kvGets.push({ key, options });
			return state.kv.get(key) ?? null;
		},
	}),
}));

import { readSharedVersion, rememberSharedVersion, SHARED_VERSION_TTL_MS } from "./shared-version-cache";

const settle = async () => { await Promise.all(state.background.splice(0)); };

beforeEach(() => {
	vi.useFakeTimers({ now: 1_000_000 });
	state.kv.clear();
	state.kvGets.length = 0;
	state.located.clear();
	state.bindings = {};
	(globalThis as any).caches = {
		default: {
			match: async (request: Request) => {
				const body = state.located.get(request.url);
				return body ? new Response(body) : undefined;
			},
			put: async (request: Request, response: Response) => { state.located.set(request.url, await response.text()); },
		},
	};
});

afterEach(() => {
	delete (globalThis as any).caches;
	vi.useRealTimers();
});

describe("shared version cache", () => {
	it("reads KV once per location with the minimum edge cache, then serves the location copy", async () => {
		state.kv.set("gateway:keyver:kid:abc", "7");
		expect(await readSharedVersion("gateway:keyver:kid:abc")).toEqual({ value: 7, expiresAt: 1_000_000 + SHARED_VERSION_TTL_MS });
		await settle();
		expect(await readSharedVersion("gateway:keyver:kid:abc")).toMatchObject({ value: 7 });
		expect(state.kvGets).toEqual([{ key: "gateway:keyver:kid:abc", options: { type: "text", cacheTtl: 30 } }]);
	});

	it("never serves a location copy past its absolute expiry", async () => {
		state.kv.set("k", "1");
		await readSharedVersion("k");
		await settle();
		state.kv.set("k", "2");
		vi.setSystemTime(1_000_000 + SHARED_VERSION_TTL_MS);
		expect(await readSharedVersion("k")).toMatchObject({ value: 2 });
		expect(state.kvGets).toHaveLength(2);
	});

	it("publishes a local bump so this location sees it immediately", async () => {
		state.kv.set("k", "1");
		await readSharedVersion("k");
		await settle();
		rememberSharedVersion("k", 2);
		await settle();
		expect(await readSharedVersion("k")).toMatchObject({ value: 2 });
		expect(state.kvGets).toHaveLength(1);
	});

	it("falls back to KV when the location cache is disabled or unavailable", async () => {
		state.kv.set("k", "3");
		state.bindings = { GATEWAY_TIERED_CACHE_L2_ENABLED: "false" };
		await readSharedVersion("k");
		await readSharedVersion("k");
		delete (globalThis as any).caches;
		await readSharedVersion("k");
		expect(state.kvGets).toHaveLength(3);
		expect(state.background).toHaveLength(0);
	});

	it("treats missing or malformed counters as version 0", async () => {
		state.kv.set("bad", "-4");
		expect(await readSharedVersion("missing")).toMatchObject({ value: 0 });
		expect(await readSharedVersion("bad")).toMatchObject({ value: 0 });
	});
});
