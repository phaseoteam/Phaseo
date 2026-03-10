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
});
