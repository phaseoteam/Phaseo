import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    rpc: vi.fn(), from: vi.fn(), get: vi.fn(), put: vi.fn(), background: [] as Promise<unknown>[],
}));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true" }),
    getCache: () => ({ get: state.get, put: state.put }),
    getSupabaseAdmin: () => ({ rpc: state.rpc, from: state.from }),
    dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
}));
vi.mock("./privateModelCache", () => ({ loadPrivateRouteRow: async () => null }));
vi.mock("@/core/kv", () => ({ keyVersionToken: async () => "v0", getTextMany: async () => ({}) }));
vi.mock("@pipeline/pricing", () => ({ loadPriceCard: async () => ({
    provider: "test", model: "lab/model", endpoint: "text.generate", effective_from: null,
    effective_to: null, currency: "USD", version: "v1", rules: [],
}) }));

function catalog(expiresAt = Date.now() + 300_000) {
    return { version: 1, model: "lab/model", resolvedModel: "lab/model", endpoints: ["text.generate", "responses"],
        checkedAt: Date.now(), expiresAt,
        variants: ["text.generate", "responses"].map(endpoint => ({ endpoint, pricing: {}, providers: [{
            provider_id: "test", api_model_id: "lab/model", provider_model_slug: "upstream", pricing_key: "test",
            model_status: "active", capability_status: "active", input_modalities: ["text"], output_modalities: ["text"],
            capability_params: endpoint === "responses" ? { tools: true } : { temperature: true },
            supports_endpoint: true, base_weight: 1, byok_meta: [],
        }] })),
        providerRows: [{ provider_slug: "test", status: "active", routing_enabled: true, zero_data_retention: true }],
        routeModes: [{ provider_slug: "test", credential_mode: "managed_and_byok" }],
    };
}
const args = { workspaceId: "workspace-a", apiKeyId: "key-a", model: "lab/model", endpoint: "responses" };
function result(ws = args.workspaceId, include = true, byok = true) {
    return { data: {
        context: { workspace_id: ws, resolved_model: "lab/model", key_ok: { ok: true }, key_limit_ok: { ok: true }, credit_ok: { ok: true }, providers: [], pricing: {} },
        byok: byok ? { test: [{ id: `${ws}-key`, fingerprint_sha256: `${ws}-fingerprint`, key_version: 1 }] } : {},
        settings: { routing_mode: ws === "workspace-a" ? "balanced" : "price", privacy_zdr_only: true },
        billingMode: "wallet", catalog: include ? catalog() : null,
    }, error: null };
}
beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    state.get.mockReset().mockResolvedValue(null); state.put.mockReset().mockResolvedValue(undefined);
    state.rpc.mockReset().mockImplementation(async (_name, params) => result(params.workspace_id, params.include_catalog));
    state.from.mockReset().mockImplementation((table: string) => { throw new Error(`Unexpected table: ${table}`); });
    state.background = [];
});
afterEach(() => { vi.useRealTimers(); });

describe("shared public catalog and private context composition", () => {
    it("refreshes a valid local snapshot without waiting and uses the replacement after the old deadline", async () => {
        const old = catalog();
        const { loadTextContextBundle } = await import("./contextBundle");
        state.get.mockResolvedValue(JSON.stringify(old));
        await loadTextContextBundle(args);
        vi.setSystemTime(Date.now() + 120_000);
        const replacement = catalog();
        let finish!: (value: string) => void;
        state.get.mockReturnValue(new Promise<string>(resolve => { finish = resolve; }));
        expect((await loadTextContextBundle(args)).catalog.checkedAt).toBe(old.checkedAt);
        await loadTextContextBundle(args);
        expect(state.get).toHaveBeenCalledTimes(2);
        finish(JSON.stringify(replacement)); await Promise.all(state.background);
        vi.setSystemTime(old.expiresAt + 1);
        state.get.mockResolvedValue(JSON.stringify(replacement));
        expect((await loadTextContextBundle(args)).catalog.checkedAt).toBe(replacement.checkedAt);
        expect(state.rpc.mock.calls.every(call => call[1].include_catalog === false)).toBe(true);
    });

    it("does not serve expired data after a failed background refresh", async () => {
        const old = catalog();
        const { loadTextContextBundle } = await import("./contextBundle");
        state.get.mockResolvedValue(JSON.stringify(old));
        await loadTextContextBundle(args);
        vi.setSystemTime(Date.now() + 60_000);
        state.get.mockRejectedValue(new Error("KV unavailable"));
        await loadTextContextBundle(args); await Promise.all(state.background);
        vi.setSystemTime(old.expiresAt);
        await loadTextContextBundle(args);
        expect(state.rpc.mock.calls.map(call => call[1].include_catalog)).toEqual([false, false, true]);
    });

    it("does not roll a fresh local publication back to an older KV replica", async () => {
        const old = catalog();
        const { loadTextContextBundle, publishPublicCatalog } = await import("./contextBundle");
        await publishPublicCatalog(old);
        vi.setSystemTime(Date.now() + 60_000);
        let finish!: (value: string) => void;
        state.get.mockReturnValue(new Promise<string>(resolve => { finish = resolve; }));
        await loadTextContextBundle(args);
        const replacement = catalog();
        await publishPublicCatalog(replacement);
        finish(JSON.stringify(old)); await Promise.all(state.background);
        expect((await loadTextContextBundle(args)).catalog.checkedAt).toBe(replacement.checkedAt);
    });

    it("uses one RPC on a cold request and shares only public data with another workspace", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const a = await loadTextContextBundle(args);
        const b = await loadTextContextBundle({ ...args, workspaceId: "workspace-b", apiKeyId: "key-b" });
        expect(state.rpc.mock.calls.map(call => call[1].include_catalog)).toEqual([true, false]);
        expect(a.variants[0].payload.providers).toEqual(expect.arrayContaining([expect.objectContaining({ byok_meta: [expect.objectContaining({ id: "workspace-a-key" })] })]));
        expect(b.variants[0].payload.providers).toEqual(expect.arrayContaining([expect.objectContaining({ byok_meta: [expect.objectContaining({ id: "workspace-b-key" })] })]));
        expect(b.settings.routing_mode).toBe("price");
        const published = state.put.mock.calls.find(call => call[0].startsWith("gateway:public-catalog"))![1];
        expect(published).not.toContain("workspace-a"); expect(published).not.toContain("fingerprint"); expect(published).not.toContain("key-a");
        expect(state.rpc).toHaveBeenCalledTimes(2);
    });

    it("does not let one request mutate the public snapshot used by later requests", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const first = await loadTextContextBundle(args);
        (first.variants[0].payload.providers as { provider_id: string }[])[0].provider_id = "mutated";
        const next = await loadTextContextBundle(args);
        expect((next.variants[0].payload.providers as { provider_id: string }[])[0].provider_id).toBe("test");
    });

    it("rejects stale KV copies and re-age attempts after absolute expiry", async () => {
        const stale = catalog(Date.now() + 1000);
        const { loadTextContextBundle } = await import("./contextBundle");
        state.get.mockResolvedValue(JSON.stringify(stale));
        await loadTextContextBundle(args);
        vi.setSystemTime(Date.now() + 1001);
        await loadTextContextBundle(args);
        expect(state.rpc.mock.calls.map(call => call[1].include_catalog)).toEqual([false, true]);
    });

    it("bypasses both caches when disableCache is requested", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle({ ...args, disableCache: true });
        expect(state.get).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
        expect(state.rpc.mock.calls[0][1].include_catalog).toBe(true);
    });

    it("does not publish unknown or private model names into the shared catalog cache", async () => {
        state.rpc.mockImplementation(async () => {
            const r = result();
            for (const variant of r.data.catalog!.variants) variant.providers = [];
            return r;
        });
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args);
        await loadTextContextBundle(args);
        expect(state.put).not.toHaveBeenCalled();
        expect(state.rpc.mock.calls.map(call => call[1].include_catalog)).toEqual([true, true]);
    });

    it("ignores cache entries containing private provider data", async () => {
        const value = catalog(); value.variants[0].providers[0].byok_meta = [{ id: "other-workspace" }] as never[];
        state.get.mockResolvedValue(JSON.stringify(value));
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args);
        expect(state.rpc.mock.calls[0][1].include_catalog).toBe(true);
    });

    it("fails closed on workspace mismatch and database failure", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        state.rpc.mockResolvedValueOnce(result("wrong-workspace"));
        await expect(loadTextContextBundle(args)).rejects.toThrow("workspace_mismatch");
        state.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
        await expect(loadTextContextBundle(args)).rejects.toThrow("bundle_error");
        expect(state.put).not.toHaveBeenCalled();
    });

    it("checks pricing deadlines even when they are below the KV TTL minimum", async () => {
        state.rpc.mockImplementationOnce(async () => { const r = result(); r.data.catalog = catalog(Date.now() + 2000); return r; });
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args);
        expect(state.put.mock.calls[0][2].expirationTtl).toBe(60);
        vi.setSystemTime(Date.now() + 2001);
        await loadTextContextBundle(args);
        expect(state.rpc.mock.calls[1][1].include_catalog).toBe(true);
    });

    it("does not wait for catalog persistence before returning a checked result", async () => {
        let finish!: () => void;
        state.put.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        const { loadTextContextBundle } = await import("./contextBundle");
        expect((await loadTextContextBundle(args)).variants).toHaveLength(2);
        expect(state.background).toHaveLength(1);
        finish(); await Promise.all(state.background);
    });

    it("does not extend an expired public snapshot through the workspace cache", async () => {
        const { isStaticContextLike, splitContextForCache } = await import("./context.shared");
        const deadline = Date.now() + 1000;
        const value = { workspaceId: "workspace-a", providers: [], pricing: {}, publicCatalogExpiresAt: deadline };
        expect(isStaticContextLike(value)).toBe(true);
        vi.setSystemTime(deadline);
        expect(isStaticContextLike(value)).toBe(false);
        expect(splitContextForCache({ ...value, key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } }).static.publicCatalogExpiresAt).toBe(deadline);
    });

    it("refreshes a snapshot when alias resolution changes during account lookup", async () => {
        state.get.mockResolvedValue(JSON.stringify(catalog()));
        state.rpc.mockImplementation(async name => {
            if (name === "gateway_fetch_request_context_bundle") {
                const r = result(args.workspaceId, false); r.data.context.resolved_model = "lab/replacement"; return r;
            }
            const replacement = catalog(); replacement.resolvedModel = "lab/replacement";
            return { data: replacement, error: null };
        });
        const { loadTextContextBundle } = await import("./contextBundle");
        expect((await loadTextContextBundle(args)).catalog.resolvedModel).toBe("lab/replacement");
        expect(state.rpc).toHaveBeenCalledTimes(2);
    });

    it("feeds the actual context pipeline without separate enrichment HTTP reads", async () => {
        state.rpc.mockImplementation(async (_name, params) => result(params.workspace_id, params.include_catalog, false));
        const { fetchGatewayContext } = await import("./context");
        const context = await fetchGatewayContext({ ...args, disableCache: true });
        expect(state.rpc).toHaveBeenCalledTimes(1);
        expect(state.from).not.toHaveBeenCalled();
        expect(context.providers).toHaveLength(1);
        // Preserve the existing canonical-capability precedence when both
        // variants describe the same provider route.
        expect(context.providers[0].capabilityParams).toEqual({ temperature: true });
        expect(context.teamSettings?.routingMode).toBe("balanced");
        expect(context.publicCatalogExpiresAt).toBe(Date.now() + 300_000);
    });
});
