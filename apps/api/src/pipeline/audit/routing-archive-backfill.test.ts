import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown>, rpc: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindings: () => mocks.env, getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { backfillRoutingArchives } from "./routing-archive-backfill";

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
        mocks.env = { GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF: "2026-10-01T00:00:00Z", GATEWAY_IO_LOGS_BUCKET: bucket, GATEWAY_CACHE: kv };
        mocks.rpc.mockReset().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValue({ data: true, error: null });
    });
    it("verifies the object before committing and advances only after success", async () => {
        expect(await backfillRoutingArchives()).toMatchObject({ archived: 1 });
        expect(bucket.get).toHaveBeenCalledOnce();
        expect(mocks.rpc.mock.calls[1]).toEqual(["gateway_commit_routing_archive", expect.objectContaining({ p_source_hash: "hash" })]);
        expect(kv.put.mock.calls[0][1]).toEqual(JSON.stringify({ id: row.id, created_at: row.created_at }));
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
    it("does not rescan after a completed cursor", async () => {
        kv.get.mockResolvedValue({ complete: true });
        expect(await backfillRoutingArchives()).toMatchObject({ complete: true });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});
