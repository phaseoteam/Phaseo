import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "@/pipeline/before/types";
const mocks = vi.hoisted(() => ({ finish: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindingsIfConfigured: () => ({ FREE_MODEL_QUOTA: { getByName: () => ({ finishIncluded: mocks.finish }) } }) }));
vi.mock("@/runtime/request-operations", () => ({ countOperation: vi.fn() }));
import { registerIncludedQuota, markIncludedQuota, finishIncludedQuota } from "./free-model-included";
beforeEach(() => { vi.clearAllMocks(); mocks.finish.mockResolvedValue({ settled: true }); });
const context = () => ({ workspaceOwnerUserId: "owner" } as PipelineContext);
describe("included successful request quota", () => {
    it("settles successful completion only once across concurrent finalizers", async () => {
        const ctx = context(); registerIncludedQuota(ctx, "reservation"); markIncludedQuota(ctx, true);
        await Promise.all(Array.from({ length: 16 }, () => finishIncludedQuota(ctx, true)));
        await finishIncludedQuota(ctx, false);
        expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("reservation", true);
    });
    it.each(["failed", "empty", "cancelled"])("releases %s and never upgrades it during usage recovery", async mode => {
        const ctx = context(); registerIncludedQuota(ctx, "reservation");
        if (mode === "cancelled") markIncludedQuota(ctx, true);
        await finishIncludedQuota(ctx, mode === "empty");
        markIncludedQuota(ctx, true); await finishIncludedQuota(ctx, true);
        expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("reservation", false);
    });
    it("retries ambiguous acknowledgement with identical identity and decision", async () => {
        const ctx = context(); registerIncludedQuota(ctx, "reservation"); markIncludedQuota(ctx, true);
        mocks.finish.mockRejectedValueOnce(new Error("lost acknowledgement"));
        await finishIncludedQuota(ctx, true);
        expect(mocks.finish.mock.calls).toEqual([["reservation", true], ["reservation", true]]);
    });
    it("bounds failed attempts and retains its terminal decision", async () => {
        const ctx = context(); registerIncludedQuota(ctx, "reservation"); markIncludedQuota(ctx, true);
        mocks.finish.mockRejectedValue(new Error("offline"));
        await expect(finishIncludedQuota(ctx, true)).rejects.toThrow("offline");
        expect(mocks.finish).toHaveBeenCalledTimes(3);
        mocks.finish.mockResolvedValue({ settled: true }); await finishIncludedQuota(ctx, false);
        expect(mocks.finish).toHaveBeenLastCalledWith("reservation", true);
    });
});
