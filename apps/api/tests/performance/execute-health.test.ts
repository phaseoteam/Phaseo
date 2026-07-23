import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEALTH_KEYS } from "@/pipeline/execute/health.config";

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const backgroundTasks: Promise<unknown>[] = [];
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
		backgroundTasks,
		setGetDelay: (ms: number) => {
			getDelayMs = ms;
		},
	};
});

vi.mock("@/runtime/env", () => ({
	dispatchBackground: (promise: Promise<unknown>) => {
		runtime.backgroundTasks.push(promise.catch(() => undefined));
	},
	getCache: () => runtime.cache as unknown as KVNamespace,
	getSupabaseAdmin: () => ({
		from: () => ({
			upsert: async () => ({ error: null }),
		}),
	}),
}));

const { readHealth, readHealthMany, readHealthManyOptimistic, resetHealthStateForTests } = await import(
	"@/pipeline/execute/health"
);

describe("execute health cache performance", () => {
	beforeEach(() => {
		runtime.store.clear();
		runtime.backgroundTasks.length = 0;
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
		runtime.cache.delete.mockClear();
		runtime.setGetDelay(0);
		resetHealthStateForTests();
	});

	afterEach(() => {
		resetHealthStateForTests();
	});

	it("deduplicates concurrent cold reads to one KV fetch", async () => {
		const endpoint = "responses";
		const model = "openai/gpt-5-nano";
		const provider = "openai";
		runtime.setGetDelay(15);
		runtime.store.set(
			HEALTH_KEYS.health(endpoint, model),
			JSON.stringify({
				[`${provider}::inflight`]: "3",
				[`${provider}::current_load`]: "0.2",
				[`${provider}::last_updated`]: "1700000000000",
			}),
		);

		const [a, b, c] = await Promise.all([
			readHealth(endpoint, provider, model),
			readHealth(endpoint, provider, model),
			readHealthMany(endpoint, model, [provider]),
		]);

		expect(a.inflight).toBe(3);
		expect(b.inflight).toBe(3);
		expect(c[provider]?.inflight).toBe(3);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});

	it("does not await KV on an optimistic cold routing read", async () => {
		const endpoint = "responses";
		const model = "openai/gpt-5-nano";
		const provider = "openai";
		runtime.setGetDelay(25);
		runtime.store.set(
			HEALTH_KEYS.health(endpoint, model),
			JSON.stringify({
				[`${provider}::lat_ewma_60s`]: "120",
				[`${provider}::last_updated`]: "1700000000000",
			}),
		);

		const started = performance.now();
		const cold = readHealthManyOptimistic(endpoint, model, [provider]);
		const elapsed = performance.now() - started;

		expect(cold[provider]?.lat_ewma_60s).toBe(800);
		expect(elapsed).toBeLessThan(5);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);

		await Promise.allSettled(runtime.backgroundTasks.splice(0));
		const warm = readHealthManyOptimistic(endpoint, model, [provider]);
		expect(warm[provider]?.lat_ewma_60s).toBe(120);
	});

	it("reuses warm L1 cache across repeated reads", async () => {
		const endpoint = "responses";
		const model = "openai/gpt-5-nano";
		const provider = "openai";
		runtime.store.set(
			HEALTH_KEYS.health(endpoint, model),
			JSON.stringify({
				[`${provider}::inflight`]: "5",
				[`${provider}::current_load`]: "0.4",
				[`${provider}::last_updated`]: "1700000000000",
			}),
		);

		const first = await readHealth(endpoint, provider, model);
		const second = await readHealth(endpoint, provider, model);
		const third = await readHealthMany(endpoint, model, [provider]);

		expect(first.inflight).toBe(5);
		expect(second.inflight).toBe(5);
		expect(third[provider]?.inflight).toBe(5);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});

	it("reuses warm empty-state cache across repeated misses", async () => {
		const endpoint = "responses";
		const model = "openai/missing-health";
		const provider = "openai";

		const first = await readHealth(endpoint, provider, model);
		const second = await readHealth(endpoint, provider, model);
		const third = await readHealthMany(endpoint, model, [provider]);

		expect(first.inflight).toBe(0);
		expect(second.inflight).toBe(0);
		expect(third[provider]?.inflight).toBe(0);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});

	it("keeps warm-cache health reads under 2ms p95 in test runtime", async () => {
		const endpoint = "responses";
		const model = "openai/gpt-5-nano";
		const provider = "openai";
		runtime.store.set(
			HEALTH_KEYS.health(endpoint, model),
			JSON.stringify({
				[`${provider}::inflight`]: "2",
				[`${provider}::current_load`]: "0.1",
				[`${provider}::last_updated`]: "1700000000000",
			}),
		);

		await readHealth(endpoint, provider, model);

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			await readHealth(endpoint, provider, model);
			samples.push(performance.now() - started);
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][execute-health] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(2);
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
	});
});
