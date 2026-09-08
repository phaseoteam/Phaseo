import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ version: "v1", result: {} as any, query: vi.fn() }));
vi.mock("@/core/kv", () => ({ keyVersionToken: async () => state.version }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ from: state.query }) }));

describe("private model index", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        state.version = "v1";
        state.result = { data: [], count: 0, error: null };
        state.query.mockReset().mockImplementation(() => {
            const query = { select: vi.fn(() => query), eq: vi.fn(() => query), limit: vi.fn(async () => state.result) };
            return query;
        });
    });
    afterEach(() => vi.useRealTimers());
    const args = { workspaceId: "workspace-a", apiKeyId: "key-a", model: "openai/example" };

    it("coalesces concurrent empty-index reads and skips subsequent database lookups", async () => {
        const { mayHavePrivateModel } = await import("./privateModelIndex");
        expect(await Promise.all(Array.from({ length: 20 }, () => mayHavePrivateModel(args)))).toEqual(Array(20).fill(false));
        expect(await mayHavePrivateModel({ ...args, model: "another/model" })).toBe(false);
        expect(state.query).toHaveBeenCalledTimes(1);
        const query = state.query.mock.results[0].value;
        expect(query.select).toHaveBeenCalledWith("model_id", { count: "exact" });
        expect(query.eq).toHaveBeenCalledWith("workspace_id", args.workspaceId);
        expect(query.eq).toHaveBeenCalledWith("enabled", true);
    });

    it("keeps public-slug attachments on the fresh credential lookup path", async () => {
        state.result = { data: [{ model_id: args.model }], count: 1, error: null };
        const { mayHavePrivateModel } = await import("./privateModelIndex");
        expect(await mayHavePrivateModel(args)).toBe(true);
        expect(await mayHavePrivateModel(args)).toBe(true);
        expect(await mayHavePrivateModel({ ...args, model: "unrelated/model" })).toBe(false);
    });

    it("refreshes creation and rename after invalidation and removal after expiry", async () => {
        const { mayHavePrivateModel } = await import("./privateModelIndex");
        expect(await mayHavePrivateModel(args)).toBe(false);
        state.result = { data: [{ model_id: args.model }], count: 1, error: null };
        state.version = "v2";
        expect(await mayHavePrivateModel(args)).toBe(true);
        state.result = { data: [{ model_id: "renamed/model" }], count: 1, error: null };
        state.version = "v3";
        expect(await mayHavePrivateModel(args)).toBe(false);
        expect(await mayHavePrivateModel({ ...args, model: "renamed/model" })).toBe(true);
        state.result = { data: [], count: 0, error: null };
        vi.advanceTimersByTime(5_001);
        expect(await mayHavePrivateModel({ ...args, model: "renamed/model" })).toBe(false);
    });

    it("does not share negative results between workspaces", async () => {
        const { mayHavePrivateModel } = await import("./privateModelIndex");
        expect(await mayHavePrivateModel(args)).toBe(false);
        state.result = { data: [{ model_id: args.model }], count: 1, error: null };
        expect(await mayHavePrivateModel({ ...args, workspaceId: "workspace-b" })).toBe(true);
    });

    it.each([
        { data: [], count: 1, error: null },
        { data: null, count: null, error: { message: "unavailable" } },
        { data: [], count: null, error: null },
    ])("never caches incomplete or failed results: %j", async (result) => {
        state.result = result;
        const { mayHavePrivateModel } = await import("./privateModelIndex");
        expect(await mayHavePrivateModel(args)).toBe(true);
        state.result = { data: [], count: 0, error: null };
        expect(await mayHavePrivateModel(args)).toBe(false);
        expect(state.query).toHaveBeenCalledTimes(2);
    });
});
