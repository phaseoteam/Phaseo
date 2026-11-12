import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown>, rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindings: () => mocks.env, getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { backfillRoutingArchives, pruneDeletedRoutingArchives } from "./routing-archive-backfill";

const row = {
    id: "request-row", created_at: "2026-09-20T00:00:00Z", workspace_id: "w", request_id: "r", source_hash: "hash",
    routing_decisions: [{ selected: true, score: 0.5 }], routing_trace: { algorithm_version: "v2" },
    metadata: { routing_snapshot: [{ score: 0.5 }] },
};
let bucket: { put: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
let kv: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
describe("historical routing transfer", () => {
    beforeEach(() => {
        const objects = new Map<string, Uint8Array>();
        bucket = {
            put: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes); return {}; }),
            get: vi.fn(async (key: string) => {
                const bytes = objects.get(key);
                return bytes ? { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } : null;
            }),
        };
        kv = { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) };
        mocks.env = { GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF: "2026-10-01T00:00:00Z", GATEWAY_ROUTING_ARCHIVES_BUCKET: bucket, GATEWAY_CACHE: kv };
        mocks.rpc.mockReset().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValue({ data: true, error: null });
    });
    it("verifies the object before committing and advances only after success", async () => {
        expect(await backfillRoutingArchives()).toMatchObject({ archived: 1 });
        expect(bucket.get).toHaveBeenCalledOnce();
        expect(mocks.rpc.mock.calls[1]).toEqual(["gateway_commit_routing_archive", expect.objectContaining({ p_source_hash: "hash" })]);
        expect(JSON.parse(kv.put.mock.calls[0][1])).toEqual({ id: row.id, created_at: row.created_at, complete: false });
    });
    it("never removes SQL copies if object verification fails", async () => {
        bucket.get.mockResolvedValue(null);
        await expect(backfillRoutingArchives()).rejects.toThrow("verification_failed");
        expect(mocks.rpc).toHaveBeenCalledOnce();
        expect(kv.put).not.toHaveBeenCalled();
    });
    it("keeps the cursor unchanged when the source changed or SQL failed", async () => {
        mocks.rpc.mockReset().mockResolvedValueOnce({ data: [row] }).mockResolvedValueOnce({ data: false });
        await expect(backfillRoutingArchives()).rejects.toThrow("source_changed");
        expect(kv.put).not.toHaveBeenCalled();
    });
    it("does no work until an operator supplies a cutoff", async () => {
        delete mocks.env.GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF;
        expect(await backfillRoutingArchives()).toMatchObject({ archived: 0 });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("waits for the in-flight window before scanning or advancing", async () => {
        mocks.env.GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF = new Date().toISOString();
        expect(await backfillRoutingArchives()).toMatchObject({ archived: 0, waiting: true });
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(kv.put).not.toHaveBeenCalled();
    });
    it("does not start activation-mode transfer before the operator verifies all writers", async () => {
        mocks.env.GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF = "activation";
        expect(await backfillRoutingArchives()).toMatchObject({ archived: 0, complete: false });
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(kv.put).not.toHaveBeenCalled();
    });
    it("uses the verified activation boundary to include requests from the deployment gap", async () => {
        mocks.env.GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF = "activation";
        kv.get.mockResolvedValueOnce("2026-10-01T12:00:00Z").mockResolvedValueOnce(null);
        await backfillRoutingArchives();
        expect(mocks.rpc.mock.calls[0][1].p_cutoff).toBe("2026-10-01T12:00:00Z");
        expect(kv.get.mock.calls[0][0]).toBe("routing-archive-activation/v1");
    });
    it("does not rescan after a completed cursor", async () => {
        kv.get.mockResolvedValue({ complete: true });
        expect(await backfillRoutingArchives()).toMatchObject({ complete: true });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});

describe("routing archive retention", () => {
    const prefix = "workspaces/w/routing/v1/request-hash/";
    let list: ReturnType<typeof vi.fn>;
    let remove: ReturnType<typeof vi.fn>;
    let acknowledge: ReturnType<typeof vi.fn>;
    let queuedAt: number;
    let eligibleBefore: number;
    afterEach(() => { vi.useRealTimers(); });
    beforeEach(() => {
        list = vi.fn().mockResolvedValue({ objects: [{ key: `${prefix}current.json` }, { key: `${prefix}orphan.json` }], truncated: false });
        remove = vi.fn().mockResolvedValue(undefined);
        acknowledge = vi.fn().mockResolvedValue({ error: null });
        queuedAt = Date.now() - 2 * 60 * 60 * 1000;
        mocks.env = { GATEWAY_ROUTING_ARCHIVES_BUCKET: { list, delete: remove } };
        mocks.from.mockReset().mockReturnValue({
            select: () => ({ lt: (_field: string, value: string) => {
                eligibleBefore = Date.parse(value);
                return { order: () => ({ limit: async () => ({ data: queuedAt < eligibleBefore ? [{ object_prefix: prefix }] : [] }) }) };
            } }),
            delete: () => ({ eq: acknowledge }),
        });
    });
    it("removes all revisions and orphan uploads when their request is deleted", async () => {
        expect(await pruneDeletedRoutingArchives()).toBe(2);
        expect(list).toHaveBeenCalledWith({ prefix, limit: 1000 });
        expect(remove).toHaveBeenCalledWith([`${prefix}current.json`, `${prefix}orphan.json`]);
        expect(acknowledge).toHaveBeenCalledWith("object_prefix", prefix);
    });
    it("retains the durable queue entry after an object deletion fails", async () => {
        remove.mockRejectedValue(new Error("offline"));
        await expect(pruneDeletedRoutingArchives()).rejects.toThrow("offline");
        expect(acknowledge).not.toHaveBeenCalled();
    });
    it("keeps a paginated prefix queued for the next bounded tick", async () => {
        list.mockResolvedValue({ objects: [{ key: `${prefix}first.json` }], truncated: true });
        expect(await pruneDeletedRoutingArchives()).toBe(1);
        expect(acknowledge).not.toHaveBeenCalled();
    });
    it("keeps deletion queued while an upload can finish, then removes the late object", async () => {
        vi.useFakeTimers();
        queuedAt = Date.now();
        list.mockResolvedValue({ objects: [], truncated: false });
        expect(await pruneDeletedRoutingArchives()).toBe(0);
        expect(list).not.toHaveBeenCalled();
        expect(acknowledge).not.toHaveBeenCalled();
        // The already-started upload completes after the source was deleted.
        list.mockResolvedValue({ objects: [{ key: `${prefix}late.json` }], truncated: false });
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);
        expect(await pruneDeletedRoutingArchives()).toBe(1);
        expect(remove).toHaveBeenCalledWith([`${prefix}late.json`]);
        expect(acknowledge).toHaveBeenCalledOnce();
    });
});
