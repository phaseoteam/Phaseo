import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ bump: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/pipeline/before/workspacePolicy", () => ({ bumpWorkspacePolicyVersion: state.bump }));
vi.mock("@/pipeline/before/privateModelCache", () => ({ invalidatePrivateRoutes: state.invalidate }));
import { publishWorkspaceMutation } from "./workspace-publication";
beforeEach(() => { state.bump.mockReset().mockResolvedValue(4); state.invalidate.mockReset().mockResolvedValue(undefined); });
it("uses one generation for policy and context, independent of key count", async () => {
    expect(await publishWorkspaceMutation("workspace-a")).toEqual({ contextVersion: 4, policyVersion: 4 });
    expect(state.bump).toHaveBeenCalledExactlyOnceWith("workspace-a");
    expect(state.invalidate).toHaveBeenCalledExactlyOnceWith("workspace-a", { requirePublication: true });
});
it.each(["bump", "invalidate"] as const)("does not acknowledge a failed %s", async operation => {
    state[operation].mockRejectedValue(new Error("private upstream detail"));
    await expect(publishWorkspaceMutation("workspace-a")).rejects.toThrow("workspace_publication_failed");
});
it("finishes the other publication before returning a failure", async () => {
    let release!: () => void;
    state.bump.mockRejectedValue(new Error("failed"));
    state.invalidate.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    let settled = false;
    const result = publishWorkspaceMutation("workspace-a").catch(error => { settled = true; return error; });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(settled).toBe(false);
    release();
    expect((await result).message).toBe("workspace_publication_failed");
});
