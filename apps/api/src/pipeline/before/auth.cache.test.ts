import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type KeyRow = {
    id: string;
    team_id: string;
    status: string;
    hash: string;
};

const runtime = vi.hoisted(() => {
    const store = new Map<string, string>();
    const backgroundTasks: Promise<unknown>[] = [];
    const dbRow = { value: null as KeyRow | null };

    const maybeSingle = vi.fn(async () => ({
        data: dbRow.value,
        error: null,
    }));
    const updateEq = vi.fn(async () => ({ error: null }));

    const cache = {
        get: vi.fn(async (key: string, type?: "text" | "json" | "arrayBuffer" | "stream") => {
            const value = store.get(key);
            if (value == null) return null;
            if (type === "json") return JSON.parse(value);
            return value;
        }),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
    };

    const supabase = {
        from: vi.fn((table: string) => {
            if (table !== "keys") {
                throw new Error(`Unexpected table: ${table}`);
            }
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle,
                    }),
                }),
                update: () => ({
                    eq: updateEq,
                }),
            };
        }),
    };

    return {
        store,
        backgroundTasks,
        dbRow,
        maybeSingle,
        updateEq,
        cache,
        supabase,
        bindings: {
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
            GATEWAY_CACHE: cache as unknown as KVNamespace,
            KEY_PEPPER: "pepper_test_value",
        },
    };
});

vi.mock("@/runtime/env", () => ({
    getBindings: () => runtime.bindings,
    getCache: () => runtime.cache as unknown as KVNamespace,
    getSupabaseAdmin: () => runtime.supabase,
    dispatchBackground: (promise: Promise<unknown>) => {
        runtime.backgroundTasks.push(promise.catch(() => undefined));
    },
    configureRuntime: () => undefined,
    clearRuntime: () => undefined,
}));

function buildRequest(token: string): Request {
    return new Request("https://example.com/v1/responses", {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
}

function hashSecret(secret: string): string {
    return createHmac("sha256", runtime.bindings.KEY_PEPPER).update(secret).digest("hex");
}

async function flushBackground(): Promise<void> {
    while (runtime.backgroundTasks.length) {
        const batch = runtime.backgroundTasks.splice(0);
        await Promise.allSettled(batch);
    }
}

describe("authenticate hot-path caching", () => {
    beforeEach(() => {
        runtime.store.clear();
        runtime.backgroundTasks.length = 0;
        runtime.dbRow.value = null;
        runtime.cache.get.mockClear();
        runtime.cache.put.mockClear();
        runtime.cache.delete.mockClear();
        runtime.supabase.from.mockClear();
        runtime.maybeSingle.mockClear();
        runtime.updateEq.mockClear();
        vi.resetModules();
    });

    it("reuses key-version and key-row L1 cache for back-to-back KV-backed auth checks", async () => {
        const kid = "KIDCACHE123";
        const secret = "secret_cache_hit";
        const hash = hashSecret(secret);
        const token = `aistats_v1_sk_${kid}_${secret}`;
        const row: KeyRow = {
            id: "key_1",
            team_id: "team_1",
            status: "active",
            hash,
        };

        await runtime.cache.put(`gateway:keyver:kid:${kid}`, "7");
        await runtime.cache.put(`gateway:key:${kid}:v7`, JSON.stringify(row));

        const { authenticate } = await import("./auth");
        const first = await authenticate(buildRequest(token), { useKvCache: true });
        const second = await authenticate(buildRequest(token), { useKvCache: true });
        await flushBackground();

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(runtime.maybeSingle).not.toHaveBeenCalled();
        expect(runtime.cache.get).toHaveBeenCalledTimes(2);
    });

    it("warms auth L1 from DB path and avoids duplicate DB lookups on immediate repeat", async () => {
        const kid = "KIDDBWARM123";
        const secret = "secret_db_path";
        const hash = hashSecret(secret);
        const token = `aistats_v1_sk_${kid}_${secret}`;
        runtime.dbRow.value = {
            id: "key_2",
            team_id: "team_2",
            status: "active",
            hash,
        };

        await runtime.cache.put(`gateway:keyver:kid:${kid}`, "0");

        const { authenticate } = await import("./auth");
        const first = await authenticate(buildRequest(token), { useKvCache: true });
        const second = await authenticate(buildRequest(token), { useKvCache: true });
        await flushBackground();

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
        expect(runtime.cache.get).toHaveBeenCalledTimes(2);
    });
});
