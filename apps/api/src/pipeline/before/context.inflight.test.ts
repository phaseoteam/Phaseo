import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
    const store = new Map<string, string>();
    const privateRows: any[] = [];

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
        workspace_id: "team_inflight",
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
        if (table === "workspace_private_models") {
            const query: any = { select: () => query, eq: () => query, limit: async () => ({ data: structuredClone(privateRows), count: privateRows.length, error: null }), maybeSingle: async () => ({ data: privateRows[0] ?? null, error: null }) };
            return query;
        }
        if (table === "workspace_settings") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({
                            data: {
                                routing_mode: null,
                                byok_fallback_enabled: null,
                                beta_channel_enabled: false,
                                alpha_channel_enabled: false,
                                cache_aware_routing_enabled: true,
                            },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "workspaces") {
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
        privateRows,
        cache,
        supabase: { rpc, from },
    };
});

vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => null,
    dispatchBackground: (p: Promise<unknown>) => { void p; },
    getCache: () => runtime.cache as unknown as KVNamespace,
    getSupabaseAdmin: () => runtime.supabase,
}));
vi.mock("@pipeline/byok/decrypt", () => ({
    decryptBYOK: async () => new TextEncoder().encode("private-plaintext-never-cache"),
    bytesToString: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));

describe("fetchGatewayContext inflight dedupe", () => {
    beforeEach(() => {
        runtime.store.clear();
        runtime.privateRows.length = 0;
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
            workspaceId: "team_inflight",
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

		// One shared loader fetches both text-capability variants. Without inflight
		// dedupe, the two concurrent callers would issue four RPCs.
		expect(runtime.supabase.rpc).toHaveBeenCalledTimes(2);
        expect(a.workspaceId).toBe("team_inflight");
        expect(b.workspaceId).toBe("team_inflight");
        expect(c.workspaceId).toBe("team_inflight");
        expect(a).not.toBe(b);
        expect(b).not.toBe(c);
    });

    it("fences every warmed key after one workspace version publication", async () => {
        const { fetchGatewayContext } = await import("./context");
        const { bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        const args = { workspaceId: "team_inflight", model: "openai/gpt-5-nano", endpoint: "text.generate" };
        for (const apiKeyId of ["key-a", "key-b"]) {
            await fetchGatewayContext({ ...args, apiKeyId });
            expect((await fetchGatewayContext({ ...args, apiKeyId })).contextTelemetry?.cacheStatus).toBe("hit");
        }
        const before = runtime.supabase.rpc.mock.calls.length;
        await bumpWorkspacePolicyVersion(args.workspaceId);
        for (const apiKeyId of ["key-a", "key-b"]) {
            expect((await fetchGatewayContext({ ...args, apiKeyId })).contextTelemetry?.cacheStatus).not.toBe("hit");
        }
        expect(runtime.supabase.rpc.mock.calls.length).toBeGreaterThan(before);
        expect(runtime.cache.put.mock.calls.filter(([, value]) => value === "1")).toHaveLength(1);
    });

    it("does not reuse or fill context caches when the workspace marker is malformed", async () => {
        const { fetchGatewayContext } = await import("./context");
        const args = { workspaceId: "team_inflight", apiKeyId: "unknown-marker", model: "model", endpoint: "text.generate" };
        await fetchGatewayContext(args);
        const markerKey = runtime.cache.get.mock.calls.find(([key]) => key.includes("policy-version"))?.[0];
        expect(markerKey).toBeDefined();
        runtime.store.set(markerKey!, "malformed");
        // A fresh isolate must not trust an old context under an unknown marker.
        vi.resetModules();
        runtime.supabase.rpc.mockClear(); runtime.cache.put.mockClear();
        const fresh = await import("./context");
        await fresh.fetchGatewayContext(args);
        await fresh.fetchGatewayContext(args);
        expect(runtime.supabase.rpc).toHaveBeenCalledTimes(4);
        expect(runtime.cache.put.mock.calls.filter(([key]) => /gateway:(dynamic|static|context)/.test(key))).toEqual([]);
    });

    it("caches the base context without private credentials and applies deletion on a cache hit", async () => {
        runtime.privateRows.push({ id: "private-1", workspace_id: "team_inflight", model_id: "acme/private", base_url: "https://customer.example/v1", upstream_model_id: "v1", supports_responses: true, routing_policy: "preferred", provider_id: "private-model", enc_value: "ciphertext", enc_iv: "iv", enc_tag: "tag", key_version: 1, fingerprint_sha256: "fingerprint" });
        const { fetchGatewayContext } = await import("./context");
        const { invalidatePrivateRoutes } = await import("./privateModelCache");
        const args = { workspaceId: "team_inflight", apiKeyId: "private-key", model: "acme/private", endpoint: "text.generate" };
        const first = await fetchGatewayContext(args);
        const second = await fetchGatewayContext(args);
        expect(second.contextTelemetry?.cacheStatus).toBe("hit");
        expect(first.providers[0].byokMeta[0].key).toBe("private-plaintext-never-cache");
        expect(second.providers).toHaveLength(1);
        expect([...runtime.store.values()].join("\n")).not.toContain("private-plaintext-never-cache");
        for (const [key, value] of runtime.store) {
            if (!key.startsWith("gateway:private-routes:")) expect(value).not.toContain("https://customer.example");
        }
        runtime.privateRows.length = 0;
        await invalidatePrivateRoutes(args.workspaceId);
        const deleted = await fetchGatewayContext(args);
        expect(deleted.contextTelemetry?.cacheStatus).toBe("hit");
        expect(deleted.providers).toHaveLength(0);
    });

    it("includes private-model lookup and hydration in total context timing", async () => {
        const pending: Array<() => void> = [];
        runtime.supabase.rpc.mockImplementation(async () => {
            await new Promise<void>((resolve) => pending.push(resolve));
            return { data: [{ workspace_id: "team_inflight", resolved_model: "model", key_ok: { ok: true, reason: null }, key_limit_ok: { ok: true, reason: null }, credit_ok: { ok: true, reason: null }, providers: [], pricing: {} }], error: null };
        });
        const { fetchGatewayContext } = await import("./context");
        const request = fetchGatewayContext({ workspaceId: "team_inflight", apiKeyId: "key_parallel", model: "model", endpoint: "text.generate" });
        try {
            await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));

        } finally {
            for (const resolve of pending) resolve();
        }
        const result = await request;
        expect(result.contextTelemetry?.totalMs).toBeGreaterThanOrEqual(result.contextTelemetry?.privateModelMs ?? 0);
        expect(result.contextTelemetry?.byokHydrationMs).toBeGreaterThanOrEqual(0);
    });
});
