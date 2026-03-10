import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
    const store = new Map<string, string>();

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

    const contextPayload = {
        team_id: "team_inflight",
        resolved_model: "resolved/openai-gpt-5-nano",
        key_ok: { ok: true, reason: null },
        key_limit_ok: { ok: true, reason: null },
        credit_ok: { ok: true, reason: null },
        providers: [],
        pricing: {},
    };

    const rpc = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { data: [contextPayload], error: null };
    });
    const from = vi.fn((table: string) => {
        if (table === "team_settings") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({
                            data: {
                                routing_mode: null,
                                byok_fallback_enabled: null,
                                beta_channel_enabled: false,
                                cache_aware_routing_enabled: true,
                            },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "teams") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({
                            data: { billing_mode: "wallet" },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "data_api_providers") {
            return {
                select: () => ({
                    in: async () => ({ data: [], error: null }),
                }),
            };
        }
        throw new Error(`Unexpected table: ${table}`);
    });

    return {
        store,
        cache,
        supabase: { rpc, from },
    };
});

vi.mock("@/runtime/env", () => ({
    getCache: () => runtime.cache as unknown as KVNamespace,
    getSupabaseAdmin: () => runtime.supabase,
}));

describe("fetchGatewayContext inflight dedupe", () => {
    beforeEach(() => {
        runtime.store.clear();
        runtime.cache.get.mockClear();
        runtime.cache.put.mockClear();
        runtime.cache.delete.mockClear();
        runtime.supabase.rpc.mockClear();
        runtime.supabase.from.mockClear();
        vi.resetModules();
    });

    it("dedupes concurrent cache misses for the same context key", async () => {
        await runtime.cache.put("gateway:keyver:id:key_inflight", "3");

        const { fetchGatewayContext } = await import("./context");
        const args = {
            teamId: "team_inflight",
            model: "openai/gpt-5-nano",
            endpoint: "text.generate",
            apiKeyId: "key_inflight",
            disableCache: false,
        };

        const [a, b, c] = await Promise.all([
            fetchGatewayContext(args),
            fetchGatewayContext(args),
            fetchGatewayContext(args),
        ]);

        expect(runtime.supabase.rpc).toHaveBeenCalledTimes(1);
        expect(a.teamId).toBe("team_inflight");
        expect(b.teamId).toBe("team_inflight");
        expect(c.teamId).toBe("team_inflight");
        expect(a).not.toBe(b);
        expect(b).not.toBe(c);
    });
});
