import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A request for a model this key has not used yet: the workspace and key data are cached, only
// the model's routes and prices are not. The workspace RPC must not run again for it.

const state = vi.hoisted(() => ({
    rpc: vi.fn(), from: vi.fn(), store: new Map<string, string>(),
    puts: [] as Array<{ key: string; ttl: number | undefined }>,
    background: [] as Promise<unknown>[],
    wallet: { balance_nanos: 9_000_000_000, reserved_nanos: 0 },
}));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true" }),
    getCache: () => ({
        get: async (key: string | string[]) => Array.isArray(key)
            ? new Map(key.flatMap(entry => state.store.has(entry) ? [[entry, state.store.get(entry)!] as const] : []))
            : state.store.get(key) ?? null,
        put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
            state.puts.push({ key, ttl: options?.expirationTtl });
            state.store.set(key, value);
        },
        delete: async (key: string) => { state.store.delete(key); },
    }),
    getSupabaseAdmin: () => ({ rpc: state.rpc, from: state.from }),
    dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise.catch(() => undefined)); },
}));
vi.mock("./privateModelCache", () => ({ loadPrivateRouteRow: async () => null }));
vi.mock("@pipeline/pricing", () => ({ loadPriceCard: async () => null }));
vi.mock("@pipeline/byok/decrypt", () => ({
    decryptBYOK: async () => new TextEncoder().encode("test-secret"),
    bytesToString: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));

const WORKSPACE = "workspace-a";
const KEY = "key-a";
const call = (model: string, overrides: Record<string, unknown> = {}) =>
    ({ workspaceId: WORKSPACE, apiKeyId: KEY, model, endpoint: "responses", ...overrides });

function snapshot(model: string, at: number) {
    const provider = model.split("/")[0];
    return {
        version: 1, model, resolvedModel: model, endpoints: ["text.generate", "responses"],
        checkedAt: at, expiresAt: at + 300_000,
        variants: ["text.generate", "responses"].map(endpoint => ({
            endpoint,
            pricing: { [provider]: { provider, model, endpoint, effective_from: null, effective_to: null, currency: "USD", version: "v1", rules: [] } },
            providers: [{
                provider_id: provider, api_model_id: model, provider_model_slug: "upstream", pricing_key: provider,
                model_status: "active", capability_status: "active", input_modalities: ["text"], output_modalities: ["text"],
                capability_params: {}, supports_endpoint: true, base_weight: 1, byok_meta: [],
            }],
        })),
        providerRows: [{ provider_slug: provider, status: "active", routing_enabled: true, zero_data_retention: true }],
        routeModes: [{ provider_slug: provider, credential_mode: "managed_and_byok" }],
        revision: "r1", boundaryAt: null,
    };
}

let keyLimit: Record<string, unknown> = { ok: true, reason: null, buckets: null };
function bundle(params: Record<string, any>) {
    return { data: {
        context: {
            workspace_id: params.workspace_id, resolved_model: params.model,
            key_ok: { ok: true }, key_limit_ok: keyLimit,
            credit_ok: { ok: true, balance_nanos: 9_000_000_000 },
            team_enrichment: null, key_enrichment: null,
            providers: [], pricing: {},
        },
        byok: { anthropic: [{ id: "byok-1", fingerprint_sha256: "fp", key_version: 1 }] },
        settings: { routing_mode: "price", privacy_zdr_only: false },
        billingMode: "wallet", catalog: null,
    }, error: null };
}

const rpcCalls = (name: string) => state.rpc.mock.calls.filter(entry => entry[0] === name);
async function drain() {
    while (state.background.length) await Promise.all(state.background.splice(0));
}

beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    state.store.clear(); state.puts = []; state.background = [];
    state.store.set(`gateway:keyver:id:${KEY}`, "1");
    keyLimit = { ok: true, reason: null, buckets: null };
    state.rpc.mockReset().mockImplementation(async (name: string, params: Record<string, any>) => {
        if (name === "gateway_fetch_request_context_bundle") return bundle(params);
        if (name === "gateway_fetch_public_catalog_at") return { data: snapshot(params.p_model, Date.parse(params.p_at)), error: null };
        throw new Error(`Unexpected RPC: ${name}`);
    });
    state.from.mockReset().mockImplementation((table: string) => {
        if (table === "wallets") {
            const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.wallet, error: null }) };
            return query;
        }
        if (table === "byok_keys") {
            // BYOK hydration of the key ids in the (cached or loaded) metadata.
            const result = { data: [{ id: "byok-1", provider_id: "anthropic", fingerprint_sha256: "fp", key_version: 1, enabled: true }], error: null };
            const query: any = { select: () => query, eq: () => query, in: () => query, then: (resolve: (value: unknown) => unknown) => resolve(result) };
            return query;
        }
        throw new Error(`Unexpected table: ${table}`);
    });
});
afterEach(() => { vi.useRealTimers(); });

describe("context for a model the key has not used yet", () => {
    it("loads only the model's catalogue entry, not the workspace RPC", async () => {
        const { fetchGatewayContext } = await import("./context");
        const first = await fetchGatewayContext(call("openai/model-a"));
        await drain();
        expect(first.contextTelemetry?.cacheStatus).toBe("miss");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(1);

        const second = await fetchGatewayContext(call("anthropic/model-b"));
        await drain();
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(1);
        expect(rpcCalls("gateway_fetch_public_catalog_at").map(entry => entry[1].p_model)).toEqual(["openai/model-a", "anthropic/model-b"]);
        expect(second.contextTelemetry?.cacheStatus).toBe("model_miss");
        expect(second.resolvedModel).toBe("anthropic/model-b");
        expect(second.providers.map(provider => provider.providerId)).toEqual(["anthropic"]);
        // Workspace data: BYOK metadata from the cached workspace part, settings and account data from the cached entries.
        expect(second.providers[0].byokMeta).toEqual([expect.objectContaining({ id: "byok-1" })]);
        expect(second.teamSettings?.routingMode).toBe("price");
        expect(second.key).toEqual(first.key);
        expect(second.keyLimit).toEqual(first.keyLimit);
        expect(second.credit).toEqual(first.credit);
        expect(second.keyEnrichment).toEqual(first.keyEnrichment);

        // The model's routes are cached now: a full hit.
        const third = await fetchGatewayContext(call("anthropic/model-b"));
        expect(third.contextTelemetry?.cacheStatus).toBe("hit");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(1);
    });

    it("gives the same context as a full load of that model", async () => {
        let mod = await import("./context");
        await mod.fetchGatewayContext(call("openai/model-a")); await drain();
        const viaMiss = await mod.fetchGatewayContext(call("anthropic/model-b")); await drain();
        expect(viaMiss.contextTelemetry?.cacheStatus).toBe("model_miss");

        vi.resetModules(); state.store.clear(); state.store.set(`gateway:keyver:id:${KEY}`, "1");
        mod = await import("./context");
        const full = await mod.fetchGatewayContext(call("anthropic/model-b")); await drain();
        expect(full.contextTelemetry?.cacheStatus).toBe("miss");
        const strip = ({ contextTelemetry: _telemetry, endpoint: _endpoint, ...rest }: any) => rest;
        const comparable = (value: any) => ({ ...strip(value), teamSettings: undefined });
        expect(comparable(viaMiss)).toEqual(comparable(full));
        // A cache hit uses the cached dynamic entry's settings too; those match the full load's.
        expect(viaMiss.teamSettings).toMatchObject({ routingMode: full.teamSettings?.routingMode, billingMode: full.teamSettings?.billingMode });
    });

    it("loads everything again after a key or workspace version bump", async () => {
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(call("openai/model-a")); await drain();
        state.store.set(`gateway:keyver:id:${KEY}`, "2");
        vi.setSystemTime(Date.now() + 31_000); // past the isolate copy of the key version
        const next = await fetchGatewayContext(call("anthropic/model-b"));
        expect(next.contextTelemetry?.cacheStatus).toBe("miss");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(2);
    });

    it("never uses it for a key with a spend cap or a workspace budget", async () => {
        const bucket = (requestsLimit: number) => ({ window_start: "2026-11-04T00:00:00Z", requests_used: 0, requests_limit: requestsLimit, cost_used_nanos: 0, cost_limit_nanos: 0 });
        keyLimit = { ok: true, reason: null, buckets: { daily: bucket(10), weekly: bucket(0), monthly: bucket(0) } };
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(call("openai/model-a")); await drain();
        expect([...state.store.keys()].some(key => key.startsWith("gateway:workspace-bundle:"))).toBe(false);
        const next = await fetchGatewayContext(call("anthropic/model-b"));
        expect(next.contextTelemetry?.cacheStatus).toBe("miss");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(2);
    });

    it("refreshes a missing credit snapshot from the wallet, as a cache hit does", async () => {
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(call("openai/model-a")); await drain();
        state.store.delete(`gateway:credit:${WORKSPACE}`);
        state.wallet = { balance_nanos: 50_000_000, reserved_nanos: 0 };
        const next = await fetchGatewayContext(call("anthropic/model-b"));
        expect(next.contextTelemetry?.cacheStatus).toBe("model_miss");
        expect(next.credit).toMatchObject({ ok: false, reason: "insufficient_funds" });
        expect(state.from).toHaveBeenCalledWith("wallets");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(1);
        state.wallet = { balance_nanos: 9_000_000_000, reserved_nanos: 0 };
    });

    it("stops using the workspace part a minute before it expires, and caps the routes' lifetime by it", async () => {
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(call("openai/model-a")); await drain();
        const workspacePut = state.puts.find(entry => entry.key.startsWith("gateway:workspace-bundle:v1:default:workspace-a:key-a:"));
        expect(workspacePut?.ttl).toBe(300);

        vi.setSystemTime(Date.now() + 200_000);
        await fetchGatewayContext(call("anthropic/model-b")); await drain();
        const staticPut = state.puts.find(entry => entry.key.includes(":responses:anthropic/model-b"));
        expect(staticPut?.ttl).toBe(100);

        vi.setSystemTime(Date.now() + 41_000);
        const late = await fetchGatewayContext(call("google/model-c"));
        expect(late.contextTelemetry?.cacheStatus).toBe("miss");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(2);
    });

    it("is not used when the request bypasses the cache", async () => {
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(call("openai/model-a")); await drain();
        const bypass = await fetchGatewayContext(call("anthropic/model-b", { disableCache: true }));
        expect(bypass.contextTelemetry?.cacheStatus).toBe("bypass");
        expect(rpcCalls("gateway_fetch_request_context_bundle")).toHaveLength(2);
    });
});
