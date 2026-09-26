import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeSettingsSchema } from "./workspaceRuntimeSnapshot";
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), get: vi.fn(), put: vi.fn(), multi: vi.fn(), version: vi.fn(), background: [] as Promise<unknown>[] }));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true", GATEWAY_WORKSPACE_RUNTIME_ENABLED: "true", GATEWAY_PUBLIC_BASE_URL: "https://staging.example" }),
    getCache: () => ({ get: state.get, put: state.put }),
    getSupabaseAdmin: () => ({ rpc: state.rpc, from: state.from }),
    dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
}));
vi.mock("./workspacePolicy", () => ({ getWorkspacePolicyVersionToken: state.version }));
vi.mock("./privateModelCache", () => ({loadPrivateRouteRow:async () => null}));
vi.mock("@/core/kv", () => ({keyVersionToken:async () => "v0",getTextMany:state.multi}));
vi.mock("@pipeline/pricing", () => ({loadPriceCard:async () => ({provider:"test",model:"lab/model",endpoint:"text.generate",effective_from:null,effective_to:null,currency:"USD",version:"v1",rules:[]})}));
const workspaceId = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const args = { workspaceId, apiKeyId: "20000000-0000-4000-8000-000000000001", model: "lab/model", endpoint: "responses" };
function runtime(id = workspaceId) {
    return { version: 1, workspaceId: id, checkedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
        configuredTier: "basic", billingMode: "wallet",
        settings: { ...Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])), routing_mode: "balanced" },
        byok: { test: [{ provider_id: "test", id: "60000000-0000-4000-8000-000000000001", fingerprint_sha256: `fingerprint-${id}`, key_version: 1, always_use: true }] },
    };
}
function response(id = workspaceId, include = true, model = "lab/model") {
    return { data: { context: { workspace_id: id, resolved_model: model, key_ok:{ok:true}, credit_ok: {ok:true,balance_nanos:7}, key_limit_ok:{ok:true} },
        workspaceRuntime: include ? runtime(id) : null,
        catalog: { version:1, model, resolvedModel:model, checkedAt:Date.now(), expiresAt:Date.now()+300_000,
            endpoints:["text.generate","responses"], providerRows:[{provider_slug:"test",status:"active",routing_enabled:true}], routeModes:[],
            variants:["text.generate","responses"].map(endpoint => ({ endpoint, pricing:{}, providers:[{provider_id:"test", api_model_id:model,
                provider_model_slug:"upstream",pricing_key:"test",model_status:"active",capability_status:"active",
                input_modalities:["text"],output_modalities:["text"],supports_endpoint:true,base_weight:1,byok_meta:[]}] })),
        } }, error: null };
}
beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    state.get.mockReset().mockResolvedValue(null); state.put.mockReset().mockResolvedValue(undefined);
    state.multi.mockReset().mockResolvedValue({});
    state.version.mockReset().mockResolvedValue("v1"); state.background = [];
    state.from.mockReset().mockImplementation(() => {throw new Error("Unexpected separate enrichment query");});
    state.rpc.mockReset().mockImplementation(async (name, params) => name === "gateway_fetch_workspace_runtime"
        ? {data:runtime(params.p_workspace_id),error:null} : response(params.workspace_id,params.include_workspace,params.model));
});
afterEach(async () => { await Promise.all(state.background); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("workspace snapshot bundle reader", () => {
    it("records overlapping cold L2 reads and the subsequent source wait without changing dispatch order", async () => {
        let now = 0;
        const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
        function deferred<T>() {
            let resolve!: (value: T) => void;
            const promise = new Promise<T>(done => { resolve = done; });
            return { promise, resolve };
        }
        const catalog = deferred<undefined>(), workspace = deferred<null>();
        const catalogStarted = deferred<void>(), workspaceStarted = deferred<void>(), sourceStarted = deferred<void>();
        const source = deferred<ReturnType<typeof response>>();
        vi.stubGlobal("caches", { default: {
            match: () => { catalogStarted.resolve(); return catalog.promise; },
            put: async () => undefined,
        } });
        state.get.mockImplementation(() => { workspaceStarted.resolve(); return workspace.promise; });
        state.rpc.mockImplementation(() => { sourceStarted.resolve(); return source.promise; });
        try {
            const { RequestOperations, withRequestOperations } = await import("@/runtime/request-operations");
            const { loadTextContextBundle } = await import("./contextBundle");
            const metrics = new RequestOperations();
            const result = withRequestOperations(metrics, () => loadTextContextBundle({ ...args, workspaceVersionToken: "v1" }));
            await Promise.all([catalogStarted.promise, workspaceStarted.promise]);
            expect(state.rpc).not.toHaveBeenCalled();
            now = 10; workspace.resolve(null);
            now = 20; catalog.resolve(undefined);
            await sourceStarted.promise;
            expect(state.rpc).toHaveBeenCalledTimes(1);
            now = 40; source.resolve(response());
            expect((await result).catalog.resolvedModel).toBe(args.model);
            const timings = metrics.snapshot().dispatchTimings;
            expect(timings.map(timing => timing.stage)).toEqual(["catalog.cache", "workspace.cache", "context.source"]);
            expect(timings[0].startMs).toBe(0);
            expect(timings[1].startMs).toBe(0);
            expect(timings[2]).toMatchObject({ startMs: 20, endMs: 40, state: "fulfilled" });
            expect(timings.slice(0, 2).every(timing => timing.endMs! <= timings[2].startMs)).toBe(true);
        } finally { clock.mockRestore(); }
    });
    function cachedPipeline() {
        const store = new Map<string, string>();
        const publicStore = new Map<string, string>();
        vi.stubGlobal("caches", { default: {
            match: async (key: string) => publicStore.has(key) ? new Response(publicStore.get(key)) : undefined,
            put: async (key: string, value: Response) => { publicStore.set(key, await value.text()); },
        } });
        state.put.mockImplementation(async (key, value) => { store.set(key, value); });
        state.get.mockImplementation(async key => {
            const raw = store.get(key);
            return raw ? new Response(raw).body : null;
        });
        state.multi.mockImplementation(async keys => Object.fromEntries(keys.map((key: string) => [key, store.get(key) ?? null])));
        state.rpc.mockImplementation(async (name, params) => {
            if (name === "gateway_fetch_public_catalog") return { data: response(workspaceId, false, params.p_model).data.catalog, error: null };
            if (name === "gateway_fetch_workspace_runtime") {
                const snapshot = runtime(params.p_workspace_id);
                snapshot.byok = {} as never;
                snapshot.settings.routing_mode = "throughput";
                return { data: snapshot, error: null };
            }
            const value = response(params.workspace_id, params.include_workspace, params.model);
            if (value.data.workspaceRuntime) value.data.workspaceRuntime.byok = {} as never;
            value.data.context.credit_ok.balance_nanos = 25_000_000_000;
            return value;
        });
        return store;
    }

    it("stores no workspace configuration in per-key/model segments and serves immediate repeats without external reads", async () => {
        const store = cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        const first = await fetchGatewayContext(args);
        await Promise.all(state.background);
        const segments = [...store].filter(([key]) => key.startsWith("gateway:dynamic:") || key.startsWith("gateway:static:"));
        expect(segments).toHaveLength(1);
        for (const [key, raw] of segments) {
            expect(key).toContain(":runtime-v3:");
            const data = JSON.parse(raw);
            expect(data).not.toHaveProperty("workspaceRuntimeExpiresAt");
            expect(data).not.toHaveProperty("teamSettings");
            expect((data.providers ?? []).every((provider: any) => provider.byokMeta.length === 0)).toBe(true);
        }
        state.get.mockClear(); state.multi.mockClear(); state.rpc.mockClear(); state.put.mockClear();
        const next = await fetchGatewayContext(args);
        expect(next.teamSettings).toEqual(first.teamSettings);
        expect(next.providers).toEqual(first.providers);
        expect(next.contextTelemetry?.cacheStatus).toBe("hit");
        expect(next.contextTelemetry?.workspaceCacheStatus).toBe("hit");
        expect(state.get).not.toHaveBeenCalled(); expect(state.multi).not.toHaveBeenCalled();
        expect(state.rpc).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
    });

    it("refreshes expired workspace settings without rebuilding admission, catalog or per-key/model segments", async () => {
        cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockClear(); state.put.mockClear();
        vi.setSystemTime(Date.now() + 61_000);
        const next = await fetchGatewayContext(args); await Promise.all(state.background);
        expect(next.teamSettings?.routingMode).toBe("throughput");
        expect(next.contextTelemetry?.cacheStatus).toBe("hit");
        expect(next.workspaceRuntimeExpiresAt).toBe(Date.now() + 60_000);
        expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["gateway_fetch_workspace_runtime"]);
        expect(state.put).toHaveBeenCalledTimes(1);
        expect(state.put.mock.calls[0][0]).toContain("gateway:workspace-runtime:");
        expect(state.from).not.toHaveBeenCalled();
    });

    it("loads a new model without rewriting or renewing the existing admission and credit", async () => {
        const store = cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        const admission = [...store].find(([key]) => key.startsWith("gateway:dynamic:"))!;
        state.rpc.mockClear(); state.put.mockClear();
        vi.setSystemTime(Date.now() + 1000);
        const next = await fetchGatewayContext({ ...args, model: "lab/second" }); await Promise.all(state.background);
        expect(next.resolvedModel).toBe("lab/second");
        expect(next.providers[0].apiModelId).toBe("lab/second");
        expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["gateway_fetch_public_catalog"]);
        expect(state.put).not.toHaveBeenCalled();
        expect(store.get(admission[0])).toBe(admission[1]);
        expect([...store.keys()].some(key => key.startsWith("gateway:static:"))).toBe(false);
    });

    it("shares a model catalog across workspaces but never shares their admission", async () => {
        cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockClear();
        const next = await fetchGatewayContext({ ...args, workspaceId: other, apiKeyId: "another-key" });
        expect(next.workspaceId).toBe(other);
        expect(state.rpc.mock.calls).toEqual([["gateway_fetch_request_context_bundle_v2", expect.objectContaining({
            workspace_id: other, api_key_id: "another-key", include_catalog: false, include_workspace: true,
        })]]);
    });

    it("coalesces public source refills without sharing request-owned provider or admission objects", async () => {
        cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockClear(); state.put.mockClear();
        let resolve!: (value: unknown) => void;
        state.rpc.mockImplementation(() => new Promise(done => { resolve = done; }));
        const pending = Array.from({ length: 24 }, () => fetchGatewayContext({ ...args, model: "lab/second" }));
        await vi.waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(1));
        resolve({ data: response(workspaceId, false, "lab/second").data.catalog, error: null });
        const values = await Promise.all(pending);
        values[0].providers[0].baseWeight = 100;
        values[0].key.ok = false;
        expect(values[1].providers[0].baseWeight).toBe(1);
        expect(values[1].key.ok).toBe(true);
        expect(state.put).not.toHaveBeenCalled();
    });

    it("rechecks source admission at its original expiry even under continuous model traffic", async () => {
        const store = cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        const raw = [...store].find(([key]) => key.startsWith("gateway:dynamic:"))![1];
        const expiresAt = JSON.parse(raw).cacheLease.expiresAtMs;
        vi.setSystemTime(expiresAt - 1000);
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockClear();
        vi.setSystemTime(expiresAt);
        await fetchGatewayContext(args);
        expect(state.rpc.mock.calls.some(call => call[0] === "gateway_fetch_request_context_bundle_v2")).toBe(true);
    });

    it("never caches admission when a workspace has a configured spending budget", async () => {
        const store = cachedPipeline();
        const source = state.rpc.getMockImplementation()!;
        state.rpc.mockImplementation(async (name, params) => {
            const result = await source(name, params);
            if (name === "gateway_fetch_request_context_bundle_v2") result.data.context.key_limit_ok = {
                ok: true, budgets: [{ id: "b", interval: "daily", limit_nanos: 100, usage_nanos: 1,
                    remaining_nanos: 99, projected_usage_nanos: 1, exceeded: false }],
            };
            return result;
        });
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockClear();
        await fetchGatewayContext(args);
        expect(state.rpc.mock.calls.some(call => call[0] === "gateway_fetch_request_context_bundle_v2")).toBe(true);
        expect([...store.keys()].some(key => key.startsWith("gateway:dynamic:"))).toBe(false);
    });

    it("preserves an independent credit invalidation and denied balance with warm public routing", async () => {
        const store = cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        const { creditAdmissionLeases } = await import("@/core/credit-admission-leases");
        vi.setSystemTime(Date.now() + 1);
        creditAdmissionLeases.invalidate(workspaceId);
        for (const key of store.keys()) if (key.includes("credit")) store.delete(key);
        const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: async () => ({ data: { balance_nanos: 0, reserved_nanos: 0 }, error: null }) };
        state.from.mockReturnValue(query); state.rpc.mockClear();
        const next = await fetchGatewayContext(args);
        expect(next.credit.ok).toBe(false);
        expect(next.credit.balanceNanos).toBe(0);
        expect(next.contextTelemetry?.cacheStatus).toBe("credit_refresh");
        expect(state.from).toHaveBeenCalledWith("wallets");
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it("follows an expired public alias without renewing the key admission", async () => {
        const store = cachedPipeline();
        const source = state.rpc.getMockImplementation()!;
        state.rpc.mockImplementation(async (name, params) => {
            const result = await source(name, params);
            if (name === "gateway_fetch_request_context_bundle_v2") result.data.catalog.expiresAt = Date.now() + 1000;
            if (name === "gateway_fetch_public_catalog") {
                result.data.resolvedModel = "lab/replacement";
                for (const variant of result.data.variants) variant.providers[0].api_model_id = "lab/replacement";
            }
            return result;
        });
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        const admission = [...store].find(([key]) => key.startsWith("gateway:dynamic:"))!;
        vi.setSystemTime(Date.now() + 1000); state.rpc.mockClear(); state.put.mockClear();
        const next = await fetchGatewayContext(args);
        expect(next.resolvedModel).toBe("lab/replacement");
        expect(next.providers[0].apiModelId).toBe("lab/replacement");
        expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["gateway_fetch_public_catalog"]);
        expect(store.get(admission[0])).toBe(admission[1]);
        expect(state.put).not.toHaveBeenCalled();
    });

    it("does not use stale public routing when a source refresh fails, and recovers on retry", async () => {
        cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
        await expect(fetchGatewayContext({ ...args, model: "lab/new" })).rejects.toThrow("gateway_public_catalog_refresh_failed");
        state.rpc.mockResolvedValue({ data: response(workspaceId, false, "lab/new").data.catalog, error: null });
        expect((await fetchGatewayContext({ ...args, model: "lab/new" })).resolvedModel).toBe("lab/new");
    });

    function admission(expiresAtMs = Date.now() + 5000) {
        return { apiKeyId: args.apiKeyId, expiresAtMs, value: {
            workspaceId, key: { ok: false, reason: "blocked" }, keyLimit: { ok: false }, credit: { ok: false },
        } };
    }

    it("never replaces cached denials with catalog or workspace data", async () => {
        cachedPipeline();
        const { loadTextContextBundle, parseContextBundleVariant } = await import("./contextBundle");
        const bundle = await loadTextContextBundle({ ...args, cachedAdmission: admission() });
        const value = parseContextBundleVariant(bundle, bundle.variants[0]);
        expect(value.key).toEqual({ ok: false, reason: "blocked" });
        expect(value.keyLimit.ok).toBe(false); expect(value.credit.ok).toBe(false);
        expect(state.rpc.mock.calls.some(call => call[0].includes("context_bundle"))).toBe(false);
    });

    it("rejects cross-key, cross-workspace, unknown-generation, bypassed and expired cached admission", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        for (const change of [
            { apiKeyId: "another-key" }, { workspaceId: other }, { workspaceVersionToken: null }, { disableCache: true },
        ]) await expect(loadTextContextBundle({ ...args, cachedAdmission: admission(), ...change })).rejects.toThrow("cached_admission_invalid");
        await expect(loadTextContextBundle({ ...args, cachedAdmission: admission(Date.now()) })).rejects.toThrow("cached_admission_invalid");
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it("rejects admission that expires while loading a public catalog", async () => {
        cachedPipeline();
        const source = state.rpc.getMockImplementation()!;
        state.rpc.mockImplementation(async (name, params) => {
            if (name === "gateway_fetch_public_catalog") vi.setSystemTime(Date.now() + 2000);
            return source(name, params);
        });
        const { loadTextContextBundle } = await import("./contextBundle");
        await expect(loadTextContextBundle({ ...args, cachedAdmission: admission(Date.now() + 1000) })).rejects.toThrow("cached_admission_expired");
    });

    it("fails closed when expired workspace source cannot be refreshed even with valid composition segments", async () => {
        cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        vi.setSystemTime(Date.now() + 61_000);
        state.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
        await expect(fetchGatewayContext(args)).rejects.toThrow("workspace_runtime_source_failed");
    });

    it("isolates composed context across workspace generation changes", async () => {
        cachedPipeline();
        const { fetchGatewayContext } = await import("./context");
        await fetchGatewayContext(args); await Promise.all(state.background);
        state.rpc.mockClear(); state.version.mockResolvedValue("v2");
        await fetchGatewayContext(args);
        expect(state.rpc.mock.calls[0]).toEqual(["gateway_fetch_request_context_bundle_v2", expect.objectContaining({ include_workspace: true })]);
    });

    it("coalesces 32 source refills with request-owned objects and releases failed work", async () => {
        const { refillWorkspaceRuntime } = await import("./workspaceRuntime");
        let complete!: (value: unknown) => void;
        state.rpc.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const requests = Array.from({ length: 32 }, () => refillWorkspaceRuntime(workspaceId, "v1"));
        expect(state.rpc).toHaveBeenCalledTimes(1);
        complete({ data: runtime(), error: null });
        const results = await Promise.all(requests);
        results[0].settings.routing_mode = "changed";
        expect(results[1].settings.routing_mode).toBe("balanced");
        state.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
        await expect(refillWorkspaceRuntime(workspaceId, "v1")).rejects.toThrow("source_failed");
        state.rpc.mockResolvedValue({ data: runtime(), error: null });
        await expect(refillWorkspaceRuntime(workspaceId, "v1")).resolves.toMatchObject({ workspaceId });
    });

    it("bounds source concurrency and never coalesces mutation publication with old reads", async () => {
        const { refillWorkspaceRuntime, publishWorkspaceRuntime } = await import("./workspaceRuntime");
        const completions: ((value: unknown) => void)[] = [];
        state.rpc.mockImplementation(() => new Promise(resolve => { completions.push(resolve); }));
        const pending = Array.from({ length: 32 }, (_, index) => refillWorkspaceRuntime(workspaceId, `v${index}`));
        await expect(refillWorkspaceRuntime(workspaceId, "v32")).rejects.toThrow("refill_capacity");
        const publish = publishWorkspaceRuntime(workspaceId, "v0");
        expect(state.rpc).toHaveBeenCalledTimes(33);
        completions.forEach(resolve => resolve({ data: runtime(), error: null }));
        await Promise.all([...pending, publish]);
        state.rpc.mockResolvedValue({ data: runtime(), error: null });
        await expect(refillWorkspaceRuntime(workspaceId, "v32")).resolves.toMatchObject({ workspaceId });
    });

    it("feeds the actual context pipeline with source deadlines and no separate enrichment reads", async () => {
        state.rpc.mockImplementation(async (_name,params) => {
            const value = response(params.workspace_id,true,params.model);
            value.data.workspaceRuntime!.byok = {} as never;
            return value;
        });
        const {fetchGatewayContext} = await import("./context");
        const value = await fetchGatewayContext({...args,disableCache:true});
        expect(value.providers).toHaveLength(1);
        expect(value.teamSettings?.routingMode).toBe("balanced");
        expect(value.workspaceRuntimeExpiresAt).toBe(Date.now()+60_000);
        expect(value.contextTelemetry?.workspaceCacheStatus).toBe("bypass");
        expect(state.from).not.toHaveBeenCalled();
        expect(state.rpc).toHaveBeenCalledTimes(1);
        expect(state.rpc.mock.calls[0][0]).toBe("gateway_fetch_request_context_bundle_v2");
    });
    it("shares workspace data between keys and models but always fetches admission", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const first = await loadTextContextBundle({ ...args, workspaceVersionToken:"v1" });
        await Promise.all(state.background);
        const next = await loadTextContextBundle({ ...args, apiKeyId:"other-key",model:"lab/other",workspaceVersionToken:"v1" });
        expect(state.version).not.toHaveBeenCalled();
        expect(state.get).toHaveBeenCalledTimes(1);
        expect(state.put).toHaveBeenCalledTimes(1);
        expect(state.rpc.mock.calls.map(call => [call[0],call[1].include_workspace])).toEqual([
            ["gateway_fetch_request_context_bundle_v2",true],["gateway_fetch_request_context_bundle_v2",false],
        ]);
        expect(first.workspaceCacheStatus).toBe("miss"); expect(next.workspaceCacheStatus).toBe("hit");
        expect(next.variants[0].payload.credit_ok).toEqual({ok:true,balance_nanos:7});
        expect(next.variants[0].payload.providers).toEqual([expect.objectContaining({byok_meta:runtime().byok.test})]);
        expect(next.workspaceRuntimeExpiresAt).toBe(1_060_000);
    });
    it("never shares a workspace snapshot with another tenant", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await Promise.all(state.background);
        const next = await loadTextContextBundle({...args,workspaceId:other});
        expect(state.rpc.mock.calls.map(call => call[1].include_workspace)).toEqual([true,true]);
        expect(JSON.stringify(next.variants[0].payload.providers)).toContain(`fingerprint-${other}`);
        expect(JSON.stringify(next.variants[0].payload.providers)).not.toContain(`fingerprint-${workspaceId}`);
    });
    it("uses source data on unknown marker, with no workspace cache reads or fills", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        const result = await loadTextContextBundle({...args,workspaceVersionToken:null});
        expect(result.workspaceCacheStatus).toBe("bypass");
        expect(state.get).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
        expect(state.version).not.toHaveBeenCalled();
    });
    it("disableCache bypasses both caches and marker reads", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle({...args,disableCache:true});
        expect(state.get).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
        expect(state.version).not.toHaveBeenCalled();
        expect(state.rpc.mock.calls[0][1]).toMatchObject({include_workspace:true,include_catalog:true});
    });
    it("falls back to source during KV outage without skipping admission", async () => {
        state.get.mockRejectedValue(new Error("KV unavailable")); state.put.mockRejectedValue(new Error("KV unavailable"));
        const { loadTextContextBundle } = await import("./contextBundle");
        expect((await loadTextContextBundle(args)).settings.routing_mode).toBe("balanced");
        expect(state.rpc).toHaveBeenCalledTimes(1);
    });
    it("does not allow a valid settings snapshot to authorize a failed context read", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await Promise.all(state.background);
        state.rpc.mockResolvedValue({data:null,error:{message:"api_key_inactive"}});
        await expect(loadTextContextBundle(args)).rejects.toThrow("api_key_inactive");
    });
    it("refreshes an expired source snapshot but does not re-age it", async () => {
        const expired = runtime(); expired.checkedAtMs -= 60_000; expired.expiresAtMs -= 60_000;
        state.rpc.mockImplementation(async name => name === "gateway_fetch_workspace_runtime"
            ? {data:runtime(),error:null} : {...response(),data:{...response().data,workspaceRuntime:expired}});
        const { loadTextContextBundle } = await import("./contextBundle");
        expect((await loadTextContextBundle(args)).workspaceRuntimeExpiresAt).toBe(Date.now()+60_000);
        expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["gateway_fetch_request_context_bundle_v2","gateway_fetch_workspace_runtime"]);
    });
    it("rechecks source when the cached workspace expires during context RPC", async () => {
        const { loadTextContextBundle } = await import("./contextBundle");
        await loadTextContextBundle(args); await Promise.all(state.background);
        state.rpc.mockImplementation(async (name, params) => {
            if (name === "gateway_fetch_workspace_runtime") return {data:runtime(),error:null};
            vi.setSystemTime(Date.now()+60_000);
            return response(workspaceId,params.include_workspace);
        });
        expect((await loadTextContextBundle(args)).workspaceRuntimeExpiresAt).toBe(1_120_000);
        expect(state.rpc.mock.calls.at(-1)?.[0]).toBe("gateway_fetch_workspace_runtime");
    });
    it("keeps oversized valid source settings functional without caching them", async () => {
        const big = runtime(); Object.assign(big.settings, {auto_routing_allowed_patterns:["x".repeat(256*1024)]});
        state.rpc.mockResolvedValue({...response(),data:{...response().data,workspaceRuntime:big}});
        const { loadTextContextBundle } = await import("./contextBundle");
        expect((await loadTextContextBundle(args)).settings.auto_routing_allowed_patterns).toEqual(big.settings.auto_routing_allowed_patterns);
        await Promise.all(state.background); expect(state.put).not.toHaveBeenCalled();
    });
    it("rejects wrong-workspace context before composing private snapshots", async () => {
        state.rpc.mockResolvedValue(response(other));
        const { loadTextContextBundle } = await import("./contextBundle");
        await expect(loadTextContextBundle(args)).rejects.toThrow("workspace_mismatch");
        expect(state.put).not.toHaveBeenCalled();
    });
    it("refreshes a mismatched workspace payload and fails closed if the source is still wrong", async () => {
        state.rpc.mockImplementation(async name => name === "gateway_fetch_workspace_runtime"
            ? {data:runtime(other),error:null} : {...response(),data:{...response().data,workspaceRuntime:runtime(other)}});
        const { loadTextContextBundle } = await import("./contextBundle");
        await expect(loadTextContextBundle(args)).rejects.toThrow("workspace_runtime_source_invalid");
        expect(state.put).not.toHaveBeenCalled();
    });
});
