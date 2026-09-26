import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeSettingsSchema } from "@/pipeline/before/workspaceRuntimeSnapshot";
const state = vi.hoisted(() => ({get:vi.fn(),put:vi.fn(),rpc:vi.fn(),invalidate:vi.fn(),events:[] as string[]}));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({GATEWAY_WORKSPACE_RUNTIME_ENABLED:"true"}),
    getCache: () => ({get:state.get,put:state.put}), getSupabaseAdmin: () => ({rpc:state.rpc}), dispatchBackground:vi.fn(),
}));
vi.mock("@/pipeline/before/privateModelCache", () => ({invalidatePrivateRoutes:state.invalidate}));
const workspace = "10000000-0000-4000-8000-000000000001";
const snapshot = () => ({version:1,workspaceId:workspace,checkedAtMs:Date.now(),expiresAtMs:Date.now()+60_000,
    configuredTier:null,billingMode:"wallet",byok:{},
    settings:Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key,null])),
});
beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000); state.events=[];
    state.get.mockReset().mockResolvedValue("7");
    state.put.mockReset().mockImplementation(async key => {state.events.push(key.includes("runtime") ? "snapshot" : "marker");});
    state.rpc.mockReset().mockImplementation(async () => {state.events.push("source");return {data:snapshot(),error:null};});
    state.invalidate.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {vi.useRealTimers();});
describe("workspace data-before-version publication", () => {
    it("publishes shared data before advertising its generation without per-key fanout", async () => {
        const {publishWorkspaceMutation} = await import("./workspace-publication");
        expect(await publishWorkspaceMutation(workspace)).toEqual({contextVersion:8,policyVersion:8});
        expect(state.events).toEqual(["source","snapshot","marker"]);
        expect(state.get).toHaveBeenCalledTimes(1);
        expect(state.rpc).toHaveBeenCalledExactlyOnceWith("gateway_fetch_workspace_runtime",{p_workspace_id:workspace});
        expect(state.put.mock.calls[0][0]).toBe(`gateway:workspace-runtime:v1:${workspace}:v8`);
        expect(state.put.mock.calls[1]).toEqual([`gateway:workspace-policy-version:${workspace}`,"8"]);
        expect(state.invalidate).toHaveBeenCalledExactlyOnceWith(workspace,{requirePublication:true});
    });
    it("does not advertise a generation when its source read fails", async () => {
        state.rpc.mockResolvedValue({data:null,error:{message:"private DB detail"}});
        const {publishWorkspaceMutation} = await import("./workspace-publication");
        await expect(publishWorkspaceMutation(workspace)).rejects.toThrow("workspace_publication_failed");
        expect(state.put).not.toHaveBeenCalled();
    });
    it("does not advertise a generation when its snapshot write fails", async () => {
        state.put.mockRejectedValue(new Error("private KV detail"));
        const {publishWorkspaceMutation} = await import("./workspace-publication");
        await expect(publishWorkspaceMutation(workspace)).rejects.toThrow("workspace_publication_failed");
        expect(state.put).toHaveBeenCalledTimes(1);
        expect(state.put.mock.calls[0][0]).toContain("workspace-runtime");
    });
    it("surfaces marker failure and allows a subsequent source-backed retry", async () => {
        state.put.mockImplementation(async key => {if(key.includes("policy-version")) throw new Error("failed");});
        const {publishWorkspaceMutation} = await import("./workspace-publication");
        await expect(publishWorkspaceMutation(workspace)).rejects.toThrow("workspace_publication_failed");
        state.put.mockResolvedValue(undefined);
        vi.setSystemTime(Date.now()+1);
        await expect(publishWorkspaceMutation(workspace)).resolves.toEqual({contextVersion:8,policyVersion:8});
        expect(state.rpc).toHaveBeenCalledTimes(2);
    });
    it("keeps the old version unavailable locally during dependent publication", async () => {
        let finish!: (value: {data:ReturnType<typeof snapshot>;error:null}) => void;
        state.rpc.mockReturnValue(new Promise(resolve => {finish=resolve;}));
        const {publishWorkspaceMutation} = await import("./workspace-publication");
        const {getWorkspacePolicyVersionToken} = await import("@/pipeline/before/workspacePolicy");
        expect(await getWorkspacePolicyVersionToken(workspace)).toBe("v7");
        const work = publishWorkspaceMutation(workspace);
        await Promise.resolve();
        expect(await getWorkspacePolicyVersionToken(workspace)).toBeNull();
        finish({data:snapshot(),error:null}); await work;
        expect(await getWorkspacePolicyVersionToken(workspace)).toBe("v8");
    });
});
