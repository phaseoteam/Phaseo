import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { workspaceRuntimeSettingsSchema } from "@/pipeline/before/workspaceRuntimeSnapshot";

const state = vi.hoisted(() => ({ rpc: vi.fn(), get: vi.fn(), put: vi.fn(), background: [] as Promise<unknown>[] }));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true", GATEWAY_WORKSPACE_RUNTIME_ENABLED: "true",
        GATEWAY_PUBLISHED_CATALOG_ENABLED: "true", GATEWAY_PUBLIC_BASE_URL: "https://staging.example" }),
    getSupabaseAdmin: () => ({ rpc: state.rpc }),
    getCache: () => ({ get: state.get, put: state.put }),
    dispatchBackground: (work: Promise<unknown>) => { state.background.push(work); },
}));
const workspaceId = "10000000-0000-4000-8000-000000000001";
const apiKeyId = "20000000-0000-4000-8000-000000000001";
const targets = JSON.stringify([{ model: "lab/model", endpoint: "responses" }]);
const catalog = () => ({ version: 1, model: "lab/model", resolvedModel: "lab/model", endpoints: ["text.generate", "responses"],
    checkedAt: Date.now(), expiresAt: Date.now() + 300_000, providerRows: [], routeModes: [],
    variants: ["text.generate", "responses"].map(endpoint => ({ endpoint, pricing: {},
        providers: [{ provider_id: "test", api_model_id: "lab/model", byok_meta: [] }] })),
});
function newRegion() {
    const values = new Map<string, string>();
    vi.stubGlobal("caches", { default: {
        match: async (key: string) => values.has(key) ? new Response(values.get(key)) : undefined,
        put: async (key: string, value: Response) => { values.set(key, await value.text()); },
    } });
}
beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const values = new Map<string, string>(); state.background = [];
    state.get.mockReset().mockImplementation(async key => values.has(key) ? new Response(values.get(key)).body : null);
    state.put.mockReset().mockImplementation(async (key, value) => { values.set(key, value); });
    state.rpc.mockReset().mockImplementation(name => {
        if (name !== "gateway_fetch_public_catalog") throw new Error(`unexpected_source:${name}`);
        return { abortSignal: () => Promise.resolve({ data: catalog(), error: null }) };
    });
    newRegion();
});
afterEach(async () => { await Promise.all(state.background); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("publishes through the scheduler and composes in a cold region without any inference source calls or KV writes", async () => {
    const { publishConfiguredPublicCatalog } = await import("./public-catalog");
    expect(await publishConfiguredPublicCatalog(targets)).toMatchObject({ targets: 1, published: 1, failed: 0 });
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.put).toHaveBeenCalledTimes(1);
    expect(state.put.mock.calls[0][0]).toMatch(/^gateway:published-catalog:v1:/);
    const { workspaceRuntimeCache } = await import("@/pipeline/before/workspaceRuntime");
    expect(await workspaceRuntimeCache.publish({ version: 1, workspaceId, checkedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
        configuredTier: "basic", billingMode: "wallet", byok: {},
        settings: Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])),
    }, workspaceId, "v1")).toBe(true);
    // Retain shared KV, but discard all publisher isolate memory and edge cache.
    vi.resetModules(); newRegion(); state.rpc.mockClear(); state.get.mockClear(); state.put.mockClear();
    state.rpc.mockImplementation(() => { throw new Error("inference_must_not_fetch_source"); });
    const { loadTextContextBundle } = await import("@/pipeline/before/contextBundle");
    const args = { workspaceId, apiKeyId, model: "lab/model", endpoint: "responses", workspaceVersionToken: "v1",
        cachedAdmission: { apiKeyId, expiresAtMs: Date.now() + 30_000, value: {
            workspaceId, key: { ok: false, reason: "blocked" }, keyLimit: { ok: false }, credit: { ok: false },
        } } };
    const cold = await loadTextContextBundle(args);
    expect(cold.cacheStatus).toBe("hit"); expect(cold.workspaceCacheStatus).toBe("hit");
    expect(cold.admission?.value.key.ok).toBe(false);
    expect(cold.catalog).toEqual(catalog());
    expect(state.get).toHaveBeenCalledTimes(2); // One public snapshot, one private workspace snapshot.
    await Promise.all(state.background);
    for (let i = 0; i < 100; i++) expect((await loadTextContextBundle(args)).catalog).toEqual(cold.catalog);
    expect(state.get).toHaveBeenCalledTimes(2);
    expect(state.put).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
});

it("does not report publication when the shared store rejects a write", async () => {
    state.put.mockRejectedValue(new Error("KV unavailable"));
    const { publishConfiguredPublicCatalog } = await import("./public-catalog");
    expect(await publishConfiguredPublicCatalog(targets)).toMatchObject({ published: 0, skipped: 1 });
});

it("reports confirmed shared publication even when the disposable edge cache fails", async () => {
    vi.stubGlobal("caches", { default: { put: async () => { throw new Error("edge unavailable"); } } });
    const { publishConfiguredPublicCatalog } = await import("./public-catalog");
    expect(await publishConfiguredPublicCatalog(targets)).toMatchObject({ published: 1, failed: 0 });
    expect(state.put).toHaveBeenCalledTimes(1);
});
