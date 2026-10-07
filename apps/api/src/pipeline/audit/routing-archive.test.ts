import { beforeEach, describe, expect, it, vi } from "vitest";
const bindings = vi.hoisted(() => ({ bucket: undefined as R2Bucket | undefined }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ GATEWAY_IO_LOGS_BUCKET: bindings.bucket, GATEWAY_ROUTING_ARCHIVE_WRITES_ENABLED: "true" }) }));
import { archiveRoutingMetadata, writeRoutingArchive } from "./routing-archive";

const input = {
    workspaceId: "workspace-a", requestId: "request/a", endpoint: "responses", model: "model/a",
    provider: "provider-a", providerModelSlug: "model-a",
    detailMetadata: {
        accounting_finalization: { settled: true },
        routing_snapshot: [{ provider_id: "provider-a", provider_model_slug: "model-a", score: 0.9, rank: 1,
            score_trace: { calculation: { finalScore: 0.9 } } }],
        routing_diagnostics: { algorithm: { version: "v2", seed: 123 }, finalCandidateCount: 1 },
    },
};

describe("routing archive writes", () => {
    beforeEach(() => { bindings.bucket = undefined; });
    it("moves all candidate detail into one private object while keeping accounting metadata", async () => {
        const put = vi.fn().mockResolvedValue({});
        bindings.bucket = { put } as unknown as R2Bucket;
        const compact = await archiveRoutingMetadata(input);
        expect(compact.accounting_finalization).toEqual({ settled: true });
        expect(compact).not.toHaveProperty("routing_snapshot");
        expect(compact).not.toHaveProperty("routing_diagnostics");
        const pointer = compact.routing_archive as Record<string, unknown>;
        expect(pointer.key).toMatch(/^workspaces\/workspace-a\/routing\/v1\/request%2Fa\/[a-f0-9]{64}\.json$/);
        const body = JSON.parse(new TextDecoder().decode(put.mock.calls[0][1]));
        expect(body.routing_decisions[0]).toMatchObject({ selected: true, provider_slug: "provider-a", score: 0.9 });
        expect(body.routing_trace).toMatchObject({ algorithm_version: "v2", random_seed: 123 });
        expect(body.metadata.routing_snapshot).toEqual(input.detailMetadata.routing_snapshot);
    });
    it.each(["missing", "error", "null"])("retains database detail when storage is %s", async kind => {
        if (kind !== "missing") bindings.bucket = { put: kind === "error"
            ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue(null) } as unknown as R2Bucket;
        expect(await archiveRoutingMetadata(input)).toEqual(input.detailMetadata);
    });
    it("does not trust a caller-supplied archive pointer", async () => {
        expect(await archiveRoutingMetadata({ ...input, detailMetadata: { routing_archive: { key: "other-tenant" } } }))
            .toEqual({});
    });
    it("bounds object size before issuing a write", async () => {
        const put = vi.fn();
        await expect(writeRoutingArchive({ put } as unknown as R2Bucket, "w", "r", { data: "x".repeat(1024 * 1024) }))
            .rejects.toThrow("too_large");
        expect(put).not.toHaveBeenCalled();
    });
    it("uses immutable content-addressed keys for retries and concurrent revisions", async () => {
        const bucket = { put: vi.fn().mockResolvedValue({}) } as unknown as R2Bucket;
        const first = await writeRoutingArchive(bucket, "w", "r", { score: 1 });
        expect(await writeRoutingArchive(bucket, "w", "r", { score: 1 })).toEqual(first);
        expect((await writeRoutingArchive(bucket, "w", "r", { score: 2 })).key).not.toEqual(first.key);
    });
});
