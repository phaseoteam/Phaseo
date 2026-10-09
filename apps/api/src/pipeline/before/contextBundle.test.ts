import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    rpc: vi.fn(), from: vi.fn(), store: new Map<string, string>(), get: vi.fn(), put: vi.fn(),
    background: [] as Promise<unknown>[],
}));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true" }),
    getCache: () => ({ get: state.get, put: state.put }),
    getSupabaseAdmin: () => ({ rpc: state.rpc, from: state.from }),
    dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise.catch(() => undefined)); },
}));
vi.mock("./privateModelCache", () => ({ loadPrivateRouteRow: async () => null }));
vi.mock("@/core/kv", () => ({ keyVersionToken: async () => "v0", getTextMany: async () => ({}) }));
vi.mock("@pipeline/pricing", () => ({ loadPriceCard: async () => ({
    provider: "test", model: "lab/model", endpoint: "text.generate", effective_from: null,
    effective_to: null, currency: "USD", version: "v1", rules: [],
}) }));

const REVISION_KEY = "gateway:catalogue:revision:v1";
const args = { workspaceId: "workspace-a", apiKeyId: "key-a", model: "lab/model", endpoint: "responses" };

function snapshot(options: { at?: number; boundaryAt?: number | null; revision?: string | null; providerId?: string; resolvedModel?: string } = {}) {
    const at = options.at ?? Date.now();
    const boundaryAt = options.boundaryAt === undefined ? null : options.boundaryAt;
    return { version: 1, model: "lab/model", resolvedModel: options.resolvedModel ?? "lab/model", endpoints: ["text.generate", "responses"],
        checkedAt: at, expiresAt: Math.min(at + 300_000, boundaryAt ?? Number.MAX_SAFE_INTEGER),
        variants: ["text.generate", "responses"].map(endpoint => ({ endpoint, pricing: {}, providers: [{
            provider_id: options.providerId ?? "test", api_model_id: "lab/model", provider_model_slug: "upstream", pricing_key: "test",
            model_status: "active", capability_status: "active", input_modalities: ["text"], output_modalities: ["text"],
            capability_params: endpoint === "responses" ? { tools: true } : { temperature: true },
            supports_endpoint: true, base_weight: 1, byok_meta: [],
        }] })),
        providerRows: [{ provider_slug: "test", status: "active", routing_enabled: true, zero_data_retention: true }],
        routeModes: [{ provider_slug: "test", credential_mode: "managed_and_byok" }],
        revision: options.revision === undefined ? "r1" : options.revision,
        boundaryAt,
    };
}

function bundle(ws = args.workspaceId, byok = true) {
    return { data: {
        context: { workspace_id: ws, resolved_model: "lab/model", key_ok: { ok: true }, key_limit_ok: { ok: true }, credit_ok: { ok: true }, providers: [], pricing: {} },
        byok: byok ? { test: [{ id: `${ws}-key`, fingerprint_sha256: `${ws}-fingerprint`, key_version: 1 }] } : {},
        settings: { routing_mode: ws === "workspace-a" ? "balanced" : "price", privacy_zdr_only: true },
        billingMode: "wallet", catalog: null,
    }, error: null };
}

let catalogAt: (at: number) => ReturnType<typeof snapshot> | Promise<ReturnType<typeof snapshot>>;

function catalogCalls() {
    return state.rpc.mock.calls.filter(call => call[0] === "gateway_fetch_public_catalog_at");
}

function storedCatalogKeys() {
    return [...state.store.keys()].filter(key => key.startsWith("gateway:public-catalog:"));
}

async function drain() {
    while (state.background.length) await Promise.all(state.background.splice(0));
}

beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    state.store.clear(); state.background = [];
    state.get.mockReset().mockImplementation(async (key: string) => state.store.get(key) ?? null);
    state.put.mockReset().mockImplementation(async (key: string, value: string) => { state.store.set(key, value); });
    catalogAt = (at) => snapshot({ at });
    state.rpc.mockReset().mockImplementation(async (name: string, params: Record<string, any>) => {
        if (name === "gateway_fetch_request_context_bundle") return bundle(params.workspace_id);
        if (name === "gateway_fetch_public_catalog_at") return { data: await catalogAt(Date.parse(params.p_at)), error: null };
        throw new Error(`Unexpected RPC: ${name}`);
    });
    state.from.mockReset().mockImplementation((table: string) => { throw new Error(`Unexpected table: ${table}`); });
});
afterEach(() => { vi.useRealTimers(); });

describe("stale-while-revalidate catalogue with private context composition", () => {
    it("loads the catalogue alongside the workspace RPC and shares only public data", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const a = await loadTextContextBundle(args);
        await drain();
        const b = await loadTextContextBundle({ ...args, workspaceId: "workspace-b", apiKeyId: "key-b" });

        expect(catalogCalls()).toHaveLength(1);
        expect(state.rpc.mock.calls.filter(call => call[0] === "gateway_fetch_request_context_bundle")
            .every(call => call[1].include_catalog === false)).toBe(true);
        expect(a.variants[0].payload.providers).toEqual(expect.arrayContaining([expect.objectContaining({ byok_meta: [expect.objectContaining({ id: "workspace-a-key" })] })]));
        expect(b.variants[0].payload.providers).toEqual(expect.arrayContaining([expect.objectContaining({ byok_meta: [expect.objectContaining({ id: "workspace-b-key" })] })]));
        expect(b.settings.routing_mode).toBe("price");
        const [published] = storedCatalogKeys().map(key => state.store.get(key)!);
        expect(published).toBeDefined();
        expect(published).not.toContain("workspace-a"); expect(published).not.toContain("fingerprint"); expect(published).not.toContain("key-a");
    });

    it("keeps serving a snapshot past its soft expiry and refreshes it in the background", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const first = await loadTextContextBundle(args);
        await drain();

        vi.setSystemTime(Date.now() + 10 * 60_000);
        let finish!: (value: ReturnType<typeof snapshot>) => void;
        catalogAt = () => new Promise(resolve => { finish = resolve; });
        // Served from cache while the refresh is still pending.
        expect((await loadTextContextBundle(args)).catalog.checkedAt).toBe(first.catalog.checkedAt);
        await vi.waitFor(() => expect(catalogCalls()).toHaveLength(2));

        const replacement = snapshot({ providerId: "refreshed" });
        finish(replacement); await drain();
        vi.setSystemTime(Date.now() + 31_000);
        await loadTextContextBundle(args); await drain();
        expect((await loadTextContextBundle(args)).catalog.checkedAt).toBe(replacement.checkedAt);
    });

    it("treats a snapshot as current while its revision matches the published revision", async () => {
        state.store.set(REVISION_KEY, "r1");
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await drain();

        vi.setSystemTime(Date.now() + 30 * 60_000);
        await loadTextContextBundle(args); await drain();
        vi.setSystemTime(Date.now() + 31_000);
        await loadTextContextBundle(args); await drain();
        expect(catalogCalls()).toHaveLength(1);

        state.store.set(REVISION_KEY, "r2");
        catalogAt = (at) => snapshot({ at, revision: "r2" });
        vi.setSystemTime(Date.now() + 31_000);
        await loadTextContextBundle(args); await drain();
        vi.setSystemTime(Date.now() + 31_000);
        await loadTextContextBundle(args); await drain();
        expect(catalogCalls()).toHaveLength(2);
    });

    it("prefetches the post-boundary snapshot and switches exactly at the boundary without a read", async () => {
        const boundaryAt = Date.now() + 10 * 60_000;
        catalogAt = (at) => at < boundaryAt
            ? snapshot({ at, boundaryAt, providerId: "before" })
            : snapshot({ at, providerId: "after" });
        const { loadTextContextBundle } = await import("./contextBundle");

        const before = await loadTextContextBundle(args);
        expect((before.variants[0].payload.providers as { provider_id: string }[])[0].provider_id).toBe("before");
        expect(catalogCalls().map(call => Date.parse(call[1].p_at))).toEqual([Date.now(), boundaryAt]);
        await drain();

        vi.setSystemTime(boundaryAt);
        // Rebuilding "current" after the switch happens in the background; the
        // request must not wait for it.
        catalogAt = () => new Promise(() => undefined);
        const after = await loadTextContextBundle(args);
        expect((after.variants[0].payload.providers as { provider_id: string }[])[0].provider_id).toBe("after");
        expect(after.cacheStatus).toBe("hit");
    });

    it("blocks on a reload only when a boundary passed without a prefetched successor", async () => {
        const boundaryAt = Date.now() + 20 * 60_000;
        catalogAt = (at) => snapshot({ at, boundaryAt: at < boundaryAt ? boundaryAt : null });
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await drain();
        expect(catalogCalls()).toHaveLength(1);

        vi.setSystemTime(boundaryAt + 1);
        const result = await loadTextContextBundle(args);
        expect(result.catalog.checkedAt).toBe(boundaryAt + 1);
        expect(result.cacheStatus).toBe("miss");
    });

    it("does not publish unknown or private model names into the shared catalogue cache", async () => {
        catalogAt = (at) => {
            const value = snapshot({ at });
            for (const variant of value.variants) variant.providers = [];
            return value;
        };
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await drain();
        await loadTextContextBundle(args); await drain();
        expect(storedCatalogKeys()).toHaveLength(0);
        expect(catalogCalls()).toHaveLength(1);
    });

    it("ignores cached entries containing private provider data", async () => {
        const { loadTextContextBundle, publicCatalogKey } = await import("./contextBundle");
        const poisoned = snapshot(); poisoned.variants[0].providers[0].byok_meta = [{ id: "other-workspace" }] as never[];
        state.store.set(publicCatalogKey("lab/model", ["text.generate", "responses"]), JSON.stringify({ v: { current: poisoned, next: null }, at: Date.now() }));
        await loadTextContextBundle(args);
        expect(catalogCalls()).toHaveLength(1);
    });

    it("does not let one request mutate the snapshot used by later requests", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const first = await loadTextContextBundle(args);
        (first.variants[0].payload.providers as { provider_id: string }[])[0].provider_id = "mutated";
        const next = await loadTextContextBundle(args);
        expect((next.variants[0].payload.providers as { provider_id: string }[])[0].provider_id).toBe("test");
    });

    it("bypasses the shared cache when disableCache is requested", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const result = await loadTextContextBundle({ ...args, disableCache: true });
        await drain();
        expect(result.cacheStatus).toBe("bypass");
        expect(state.get).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
        expect(catalogCalls()).toHaveLength(1);
    });

    it("fails closed on workspace mismatch and database failure", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        state.rpc.mockImplementationOnce(async () => bundle("wrong-workspace"));
        await expect(loadTextContextBundle(args)).rejects.toThrow("workspace_mismatch");
        state.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "unavailable" } }));
        await expect(loadTextContextBundle(args)).rejects.toThrow("bundle_error");
    });

    it("reloads a snapshot when alias resolution changes during account lookup", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await drain();
        state.rpc.mockImplementation(async (name: string, params: Record<string, any>) => {
            if (name === "gateway_fetch_request_context_bundle") {
                const r = bundle(params.workspace_id); r.data.context.resolved_model = "lab/replacement"; return r;
            }
            return { data: snapshot({ at: Date.parse(params.p_at), resolvedModel: "lab/replacement" }), error: null };
        });
        expect((await loadTextContextBundle(args)).catalog.resolvedModel).toBe("lab/replacement");
    });

    it("does not extend a scheduled boundary through the workspace cache", async () => {
        const { isStaticContextLike, splitContextForCache } = await import("./context.shared");
        const deadline = Date.now() + 1000;
        const value = { workspaceId: "workspace-a", providers: [], pricing: {}, publicCatalogExpiresAt: deadline };
        expect(isStaticContextLike(value)).toBe(true);
        vi.setSystemTime(deadline);
        expect(isStaticContextLike(value)).toBe(false);
        expect(splitContextForCache({ ...value, key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } }).static.publicCatalogExpiresAt).toBe(deadline);
    });

    it("feeds the actual context pipeline without separate enrichment HTTP reads", async () => {
        const boundaryAt = Date.now() + 3_600_000;
        catalogAt = (at) => snapshot({ at, boundaryAt });
        state.rpc.mockImplementation(async (name: string, params: Record<string, any>) => name === "gateway_fetch_request_context_bundle"
            ? bundle(params.workspace_id, false)
            : { data: await catalogAt(Date.parse(params.p_at)), error: null });
        const { fetchGatewayContext } = await import("./context");
        const context = await fetchGatewayContext({ ...args, disableCache: true });
        expect(state.rpc.mock.calls.map(call => call[0]).sort()).toEqual(["gateway_fetch_public_catalog_at", "gateway_fetch_request_context_bundle"]);
        expect(state.from).not.toHaveBeenCalled();
        expect(context.providers).toHaveLength(1);
        // Preserve the existing canonical-capability precedence when both
        // variants describe the same provider route.
        expect(context.providers[0].capabilityParams).toEqual({ temperature: true });
        expect(context.teamSettings?.routingMode).toBe("balanced");
        expect(context.publicCatalogExpiresAt).toBe(boundaryAt);
    });

    it("admits a cold bundled text request with 99 cents available", async () => {
        state.rpc.mockImplementation(async (name: string, params: Record<string, any>) => {
            if (name !== "gateway_fetch_request_context_bundle") return { data: await catalogAt(Date.parse(params.p_at)), error: null };
            const response = bundle(params.workspace_id, false) as any;
            response.data.context.credit_ok = {
                ok: false,
                reason: "insufficient_funds",
                balance_nanos: 999_745_298,
            };
            return response;
        });
        const { fetchGatewayContext } = await import("./context");
        const context = await fetchGatewayContext({ ...args, disableCache: true });
        expect(context.credit).toMatchObject({ ok: true, balanceNanos: 999_745_298 });
    });
});
