import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const background: Promise<unknown>[] = [];
	const cache = {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
	};
	return { store, background, cache };
});

vi.mock("@/runtime/env", () => ({
	getCache: () => runtime.cache as unknown as KVNamespace,
	getBindingsIfConfigured: () => null,
	dispatchBackground: (promise: Promise<unknown>) => {
		runtime.background.push(promise.catch(() => undefined));
	},
}));

import { __resetTieredCacheForTests, invalidateTieredL1, tieredRead, writeTiered } from "./tiered-cache";

async function drainBackground(): Promise<void> {
	while (runtime.background.length) {
		await Promise.all(runtime.background.splice(0));
	}
}

function envelope(value: unknown, at: number): string {
	return JSON.stringify({ v: value, at });
}

describe("tieredRead", () => {
	beforeEach(() => {
		__resetTieredCacheForTests();
		runtime.store.clear();
		runtime.background.length = 0;
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads once on a full miss, then serves from isolate memory", async () => {
		const loader = vi.fn(async () => ({ name: "alpha" }));
		const options = { key: "k:v1", loader, l1FreshMs: 30_000, l3: { freshS: 60 } } as const;

		expect(await tieredRead(options)).toEqual({ name: "alpha" });
		await drainBackground();
		expect(await tieredRead(options)).toEqual({ name: "alpha" });

		expect(loader).toHaveBeenCalledTimes(1);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
		expect(JSON.parse(runtime.store.get("k:v1")!).v).toEqual({ name: "alpha" });
	});

	it("shares one load between concurrent misses", async () => {
		let resolve!: (value: string) => void;
		const loader = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
		const options = { key: "k:shared", loader, l1FreshMs: 1000, l3: false } as const;

		const first = tieredRead(options);
		const second = tieredRead(options);
		await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
		resolve("value");

		expect(await first).toBe("value");
		expect(await second).toBe("value");
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it("loads itself when another request's load never settles", async () => {
		vi.useFakeTimers();
		// Another request's load whose I/O was cancelled with that request.
		const abandoned = { key: "k:abandoned", loader: () => new Promise<string>(() => {}), l1FreshMs: 1000, l2: false, l3: false } as const;
		void tieredRead(abandoned);
		const own = vi.fn(async () => "value");
		const read = tieredRead({ ...abandoned, loader: own });
		await vi.advanceTimersByTimeAsync(1_500);

		expect(await read).toBe("value");
		expect(own).toHaveBeenCalledTimes(1);
		// The fresh load replaced the abandoned one for later misses.
		expect(await tieredRead({ ...abandoned, loader: own })).toBe("value");
		expect(own).toHaveBeenCalledTimes(1);
	});

	it("prefers KV over the loader and does not block on a stale KV entry", async () => {
		runtime.store.set("k:kv", envelope("from-kv", Date.now() - 600_000));
		let finishLoad!: (value: string) => void;
		const loader = vi.fn(() => new Promise<string>((resolve) => { finishLoad = resolve; }));
		const options = { key: "k:kv", loader, l1FreshMs: 30_000, l3: { freshS: 60 } } as const;

		// Resolves from KV while the background reload is still pending.
		expect(await tieredRead(options)).toBe("from-kv");
		expect(loader).toHaveBeenCalledTimes(1);

		finishLoad("from-db");
		await drainBackground();
		expect(loader).toHaveBeenCalledTimes(1);
		expect(await tieredRead(options)).toBe("from-db");
	});

	it("serves stale isolate data immediately and revalidates in the background", async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		let finishRefresh!: (value: string) => void;
		const loader = vi.fn()
			.mockImplementationOnce(async () => "v1")
			.mockImplementationOnce(() => new Promise<string>((resolve) => { finishRefresh = resolve; }));
		const options = { key: "k:swr", loader, l1FreshMs: 1000, l3: false } as const;

		expect(await tieredRead(options)).toBe("v1");
		vi.setSystemTime(1_005_000);

		expect(await tieredRead(options)).toBe("v1");
		// A second stale read before the refresh lands must not queue another load.
		expect(await tieredRead(options)).toBe("v1");
		finishRefresh("v2");
		await drainBackground();
		expect(loader).toHaveBeenCalledTimes(2);
		expect(await tieredRead(options)).toBe("v2");
	});

	it("awaits the loader when data is older than maxStaleMs", async () => {
		runtime.store.set("k:bounded", envelope("ancient", Date.now() - 3_600_000));
		const loader = vi.fn(async () => "fresh");
		const options = { key: "k:bounded", loader, l1FreshMs: 1000, maxStaleMs: 60_000, l3: { freshS: 60 } } as const;

		expect(await tieredRead(options)).toBe("fresh");
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it("negative-caches missing values", async () => {
		const loader = vi.fn(async () => null);
		const options = { key: "k:missing", loader, l1FreshMs: 1000, negativeFreshMs: 30_000, l3: { freshS: 600 } } as const;

		expect(await tieredRead(options)).toBeNull();
		expect(await tieredRead(options)).toBeNull();
		await drainBackground();

		expect(loader).toHaveBeenCalledTimes(1);
		expect(runtime.cache.put).toHaveBeenCalledWith("k:missing", expect.any(String), { expirationTtl: 60 });
	});

	it("rejects malformed lower-layer values and falls through to the loader", async () => {
		runtime.store.set("k:bad", envelope({ wrong: true }, Date.now()));
		const loader = vi.fn(async () => ({ name: "ok" }));
		const validate = (value: unknown): value is { name: string } =>
			typeof (value as { name?: unknown })?.name === "string";

		expect(await tieredRead({ key: "k:bad", loader, l1FreshMs: 1000, l3: { freshS: 60 }, validate })).toEqual({ name: "ok" });
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it("does not let an in-flight load repopulate an invalidated key", async () => {
		let resolve!: (value: string) => void;
		const loader = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
		const options = { key: "k:race", loader, l1FreshMs: 60_000, l3: false } as const;

		const pending = tieredRead(options);
		await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
		invalidateTieredL1("k:race");
		resolve("stale");
		await pending;

		loader.mockImplementation(async () => "fresh");
		expect(await tieredRead(options)).toBe("fresh");
	});

	it("serves values written through by a publisher without calling the loader", async () => {
		await writeTiered({ key: "k:published", l3: { freshS: 60 } }, { revision: 7 });
		const loader = vi.fn(async () => ({ revision: 0 }));

		expect(await tieredRead({ key: "k:published", loader, l1FreshMs: 1000, l3: { freshS: 60 } })).toEqual({ revision: 7 });
		expect(loader).not.toHaveBeenCalled();
	});
});
