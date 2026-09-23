import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeSettingsSchema } from "./workspaceRuntimeSnapshot";
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), get: vi.fn(), put: vi.fn(), version: vi.fn(), background: [] as Promise<unknown>[] }));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true", GATEWAY_WORKSPACE_RUNTIME_ENABLED: "true" }),
    getCache: () => ({ get: state.get, put: state.put }),
    getSupabaseAdmin: () => ({ rpc: state.rpc, from: state.from }),
    dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
}));
vi.mock("./workspacePolicy", () => ({ getWorkspacePolicyVersionToken: state.version }));
vi.mock("./privateModelCache", () => ({loadPrivateRouteRow:async () => null}));
vi.mock("@/core/kv", () => ({keyVersionToken:async () => "v0",getTextMany:async () => ({})}));
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
    state.version.mockReset().mockResolvedValue("v1"); state.background = [];
    state.from.mockReset().mockImplementation(() => {throw new Error("Unexpected separate enrichment query");});
    state.rpc.mockReset().mockImplementation(async (name, params) => name === "gateway_fetch_workspace_runtime"
        ? {data:runtime(params.p_workspace_id),error:null} : response(params.workspace_id,params.include_workspace,params.model));
});
afterEach(async () => { await Promise.all(state.background); vi.useRealTimers(); });

describe("workspace snapshot bundle reader", () => {
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
