import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), enabled: false, bump: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => ({ rpc: state.rpc }),
    getBindingsIfConfigured: () => ({ GATEWAY_WORKSPACE_PUBLICATION_ENABLED: String(state.enabled) }),
}));
vi.mock("@/pipeline/before/workspacePolicy", () => ({ bumpWorkspacePolicyVersion: state.bump }));
vi.mock("@/pipeline/before/privateModelCache", () => ({ invalidatePrivateRoutes: state.invalidate }));
vi.mock("@/pipeline/before/workspaceRuntime", () => ({ workspaceRuntimeEnabled: () => false, publishWorkspaceRuntime: vi.fn() }));
import { drainWorkspacePublications, publishDurableWorkspaceMutation } from "./workspace-publication-outbox";
import { publishWorkspaceMutation } from "./workspace-publication";
const workspace = "10000000-0000-4000-8000-000000000001";
const row = { workspace_id: workspace, revision: "20000000-0000-4000-8000-000000000001", lease_id: "30000000-0000-4000-8000-000000000001" };
beforeEach(() => {
    state.enabled = false;
    state.bump.mockReset().mockResolvedValue(7);
    state.invalidate.mockReset().mockResolvedValue(undefined);
    state.rpc.mockReset().mockImplementation(async name => ({ data: name === "gateway_claim_workspace_publications" ? [row] : "completed", error: null }));
});

describe("durable workspace publication", () => {
    it("adds no database operation when disabled", async () => {
        expect(await publishWorkspaceMutation(workspace)).toEqual({ contextVersion: 7, policyVersion: 7 });
        expect(state.rpc).not.toHaveBeenCalled();
    });
    it("claims, publishes, then acknowledges the exact lease and revision", async () => {
        state.enabled = true;
        const events: string[] = [];
        state.rpc.mockImplementation(async name => { events.push(name); return { data: name === "gateway_claim_workspace_publications" ? [row] : "completed", error: null }; });
        state.bump.mockImplementation(async () => { events.push("marker"); return 7; });
        state.invalidate.mockImplementation(async () => { events.push("private"); });
        expect(await publishWorkspaceMutation(workspace)).toEqual({ contextVersion: 7, policyVersion: 7 });
        expect(events[0]).toBe("gateway_claim_workspace_publications");
        expect(events.at(-1)).toBe("gateway_finish_workspace_publication");
        expect(state.rpc).toHaveBeenLastCalledWith("gateway_finish_workspace_publication", {
            p_workspace_id: workspace, p_revision: row.revision, p_lease_id: row.lease_id, p_success: true,
        });
    });
    it("never acknowledges success while a dependent write is pending", async () => {
        let release!: () => void;
        const publish = () => new Promise<void>(resolve => { release = resolve; });
        const work = publishDurableWorkspaceMutation(workspace, publish);
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        expect(state.rpc).toHaveBeenCalledTimes(1);
        release(); await work;
        expect(state.rpc.mock.calls[1][1].p_success).toBe(true);
    });
    it("leaves a failed publication retryable without leaking the cause", async () => {
        state.rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: "retry", error: null });
        await expect(publishDurableWorkspaceMutation(workspace, async () => { throw new Error("private provider secret"); })).rejects.toThrow("workspace_publication_pending");
        expect(state.rpc.mock.calls[1][1].p_success).toBe(false);
    });
    it.each(["superseded", "lost"])("does not report an acknowledged current version on %s", async result => {
        state.rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: result, error: null });
        await expect(publishDurableWorkspaceMutation(workspace, async () => 7)).rejects.toThrow("workspace_publication_pending");
    });
    it("preserves intent after acknowledgement failure", async () => {
        state.rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: { message: "private database detail" } });
        await expect(publishDurableWorkspaceMutation(workspace, async () => 7)).rejects.toThrow("workspace_publication_ack_failed");
        expect(state.rpc).toHaveBeenCalledTimes(2);
    });
    it("does not publish when another worker owns the lease", async () => {
        state.rpc.mockResolvedValue({ data: [], error: null });
        const publish = vi.fn();
        await expect(publishDurableWorkspaceMutation(workspace, publish)).rejects.toThrow("workspace_publication_pending");
        expect(publish).not.toHaveBeenCalled();
    });
    it.each([null, [{ ...row, lease_id: "bad" }], [{ ...row, workspace_id: "10000000-0000-4000-8000-000000000002" }], [row, row]])("rejects malformed or cross-workspace claims", async data => {
        state.rpc.mockResolvedValue({ data, error: null });
        const publish = vi.fn();
        await expect(publishDurableWorkspaceMutation(workspace, publish)).rejects.toThrow("workspace_publication_claim_invalid");
        expect(publish).not.toHaveBeenCalled();
    });
    it("does no cache work when the durable queue is empty", async () => {
        state.rpc.mockResolvedValue({ data: [], error: null });
        const publish = vi.fn();
        expect(await drainWorkspacePublications(publish)).toEqual({ claimed: 0, published: 0, pending: 0, failed: 0, exhausted: 0 });
        expect(publish).not.toHaveBeenCalled();
        expect(state.rpc).toHaveBeenCalledExactlyOnceWith("gateway_claim_workspace_publications", { p_limit: 25, p_workspace_id: null });
    });
    it("bounds a batch at 25 records and four concurrent publications", async () => {
        const rows = Array.from({ length: 25 }, (_, i) => ({ ...row, workspace_id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
        state.rpc.mockImplementation(async name => ({ data: name === "gateway_claim_workspace_publications" ? rows : "completed", error: null }));
        let active = 0, peak = 0;
        const result = await drainWorkspacePublications(async () => {
            peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 1)); active--;
        });
        expect(peak).toBe(4);
        expect(result).toEqual({ claimed: 25, published: 25, pending: 0, failed: 0, exhausted: 0 });
        expect(state.rpc).toHaveBeenCalledTimes(26);
    });
    it("continues the bounded batch when one publication or acknowledgement fails", async () => {
        state.rpc.mockResolvedValueOnce({ data: [row, { ...row, workspace_id: "10000000-0000-4000-8000-000000000002" }], error: null })
            .mockResolvedValueOnce({ data: "exhausted", error: null }).mockResolvedValueOnce({ data: null, error: { message: "private" } });
        const result = await drainWorkspacePublications(async () => { throw new Error("private"); });
        expect(result).toEqual({ claimed: 2, published: 0, pending: 0, failed: 2, exhausted: 1 });
    });
});
