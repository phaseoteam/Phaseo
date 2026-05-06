import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	let getDelayMs = 0;

	const cache = {
		get: vi.fn(async (key: string) => {
			if (getDelayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, getDelayMs));
			}
			return store.get(key) ?? null;
		}),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	};

	return {
		store,
		cache,
		setGetDelay: (ms: number) => {
			getDelayMs = ms;
		},
	};
});

vi.mock("@/runtime/env", () => ({
	getCache: () => runtime.cache as unknown as KVNamespace,
}));

const {
	__resetKeyVersionL1ForTests,
	getKeyVersion,
	keyVersionToken,
	setKeyVersion,
} = await import("@/core/kv");

describe("key version cache performance", () => {
	beforeEach(() => {
		runtime.store.clear();
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
		runtime.cache.delete.mockClear();
		runtime.setGetDelay(0);
		__resetKeyVersionL1ForTests();
	});

	afterEach(() => {
		__resetKeyVersionL1ForTests();
	});

	it("deduplicates concurrent cold reads to one KV fetch", async () => {
		runtime.setGetDelay(15);
		runtime.store.set("gateway:keyver:kid:KID-PERF", "11");

		const [a, b, c] = await Promise.all([
			getKeyVersion("kid", "KID-PERF", { useL1Cache: true }),
			getKeyVersion("kid", "KID-PERF", { useL1Cache: true }),
			keyVersionToken("kid", "KID-PERF", { useL1Cache: true }),
		]);

		expect(a).toBe(11);
		expect(b).toBe(11);
		expect(c).toBe("v11");
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});

	it("reuses the warm L1 cache across repeated reads", async () => {
		runtime.store.set("gateway:keyver:id:key_perf", "5");

		const first = await getKeyVersion("id", "key_perf", { useL1Cache: true });
		const second = await getKeyVersion("id", "key_perf", { useL1Cache: true });
		const token = await keyVersionToken("id", "key_perf", { useL1Cache: true });

		expect(first).toBe(5);
		expect(second).toBe(5);
		expect(token).toBe("v5");
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});

	it("does not let an older inflight read overwrite a newer written version", async () => {
		runtime.store.set("gateway:keyver:kid:KID-RACE", "2");
		runtime.cache.get.mockImplementationOnce(async (key: string) => {
			const snapshot = runtime.store.get(key) ?? null;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return snapshot;
		});

		const staleRead = getKeyVersion("kid", "KID-RACE", { useL1Cache: true });
		await new Promise((resolve) => setTimeout(resolve, 5));
		await setKeyVersion("kid", "KID-RACE", 9);
		const staleValue = await staleRead;
		const freshValue = await getKeyVersion("kid", "KID-RACE", { useL1Cache: true });

		expect(staleValue).toBe(2);
		expect(freshValue).toBe(9);
	});

	it("keeps warm-cache key-version reads under 2ms p95 in test runtime", async () => {
		runtime.store.set("gateway:keyver:kid:KID-WARM", "17");

		await getKeyVersion("kid", "KID-WARM", { useL1Cache: true });

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			await getKeyVersion("kid", "KID-WARM", { useL1Cache: true });
			samples.push(performance.now() - started);
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][key-version] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(2);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});
});
