import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function flushBackground() {
    while (runtime.backgroundTasks.length) {
        const batch = runtime.backgroundTasks.splice(0);
        await Promise.allSettled(batch);
    }
}

describe("execute health state", () => {
    beforeEach(() => {
        runtime.store.clear();
        runtime.backgroundTasks.length = 0;
        runtime.cache.get.mockClear();
        runtime.cache.put.mockClear();
        runtime.cache.delete.mockClear();
        runtime.setGetDelay(0);
        vi.resetModules();
    });

    it("serializes concurrent onCallStart updates for the same provider key", async () => {
        runtime.setGetDelay(15);
        const health = await import("./health");
        const endpoint = "responses";
        const provider = "openai";
        const model = "gpt-4o-mini";
        const requestCount = 20;

        await Promise.all(
            Array.from({ length: requestCount }, () =>
                health.onCallStart(endpoint, provider, model),
            ),
        );
        await flushBackground();

        const snapshot = await health.readHealth(endpoint, provider, model);
        expect(snapshot.inflight).toBe(requestCount);
        expect(snapshot.last_updated).toBeGreaterThan(0);
    });

    it("classifies only provider uptime failures as failures", async () => {
        const health = await import("./health");

		for (const upstreamStatus of [408, 429, 500, 502, 503]) {
			expect(health.classifyProviderHealthImpact({ upstreamStatus })).toBe("failure");
		}
		for (const upstreamStatus of [400, 403, 413, 422]) {
			expect(health.classifyProviderHealthImpact({ upstreamStatus })).toBe("neutral");
		}
		expect(health.classifyProviderHealthImpact({ errorCode: "rate_limit_exceeded" })).toBe("neutral");
		expect(health.classifyProviderHealthImpact({ errorCode: "rate_limit_exceeded", failureOrigin: "provider" })).toBe("failure");
		expect(health.classifyProviderHealthImpact({ upstreamStatus: 200, finishReason: "error" })).toBe("failure");
		expect(health.classifyProviderHealthImpact({ upstreamStatus: 200, midStreamError: true })).toBe("failure");
    });

	it("uses classified health impact instead of HTTP success for reliability", async () => {
		const health = await import("./health");
		await health.onCallEnd("responses", {
			provider: "openai",
			model: "gpt-5.4-nano",
			ok: true,
			healthImpact: "failure",
			latency_ms: 250,
		});
		await flushBackground();
		const snapshot = await health.readHealth("responses", "openai", "gpt-5.4-nano");
		expect(snapshot.err_ewma_60s).toBe(1);
		expect(snapshot.rec_ok_ew_60s).toBe(0);
		expect(snapshot.rec_tot_ew_60s).toBe(1);
	});

    it("initializes health EWMAs from the first failure", async () => {
        const health = await import("./health");
        const endpoint = "responses";
        const provider = "openai";
        const model = "gpt-5.4-nano";

        await health.onCallEnd(endpoint, {
            provider,
            model,
            ok: false,
            healthImpact: "failure",
            latency_ms: 250,
        });
        await flushBackground();

        const snapshot = await health.readHealth(endpoint, provider, model);
        expect(snapshot.err_ewma_10s).toBe(1);
        expect(snapshot.err_ewma_60s).toBe(1);
        expect(snapshot.err_ewma_300s).toBe(1);
        expect(snapshot.rate_60s).toBeGreaterThan(0);
    });

    it("treats aborted streams as health-neutral", async () => {
        const health = await import("./health");

        expect(
            health.classifyProviderHealthImpact({
                upstreamStatus: 200,
                aborted: true,
            }),
        ).toBe("neutral");
    });

    it("does not degrade provider health metrics for neutral outcomes", async () => {
        const health = await import("./health");
        const endpoint = "responses";
        const provider = "openai";
        const model = "gpt-5.4-nano";

        await health.onCallStart(endpoint, provider, model);
        await flushBackground();

        await health.onCallEnd(endpoint, {
            provider,
            model,
            ok: false,
            healthImpact: "neutral",
            latency_ms: 250,
        });
        await flushBackground();

        const snapshot = await health.readHealth(endpoint, provider, model);
        expect(snapshot.inflight).toBe(0);
        expect(snapshot.err_ewma_10s).toBe(0);
        expect(snapshot.err_ewma_60s).toBe(0);
        expect(snapshot.err_ewma_300s).toBe(0);
        expect(snapshot.rec_tot_ew_60s).toBe(0);
        expect(snapshot.breaker).toBe("closed");
    });
});
