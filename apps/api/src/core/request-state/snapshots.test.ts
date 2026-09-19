import { beforeEach, describe, expect, it, vi } from "vitest";
import { digest, loadSnapshot, openSnapshot, resetSnapshotMemoryForTests, sealSnapshot } from "./snapshots";
import { validateSnapshot, type CompiledRequestSnapshot } from "./contracts";

const secret = btoa("a".repeat(32));
function fixture() {
    return { version: 1, workspaceId: "staging:a", apiKeyId: "key", model: "model", endpoint: "text.generate",
        testingMode: false, validUntil: Date.now() + 60_000, policy: {},
        context: { workspaceId: "staging:a", providers: [{ byokMeta: [{ key: "private-provider-credential" }] }], pricing: {} },
    } as unknown as CompiledRequestSnapshot;
}

describe("immutable request snapshots", () => {
    beforeEach(resetSnapshotMemoryForTests);
    it("encrypts private configuration and detects tampering or wrong encryption keys", async () => {
        const value = fixture();
        const raw = await sealSnapshot(value, secret);
        expect(raw).not.toContain("private-provider-credential");
        expect(await openSnapshot(raw, secret)).toEqual(value);
        await expect(openSnapshot(raw, btoa("b".repeat(32)))).rejects.toThrow();
        const corrupt = JSON.parse(raw); corrupt.ciphertext = "a" + corrupt.ciphertext.slice(1);
        // Corrupt the authentication tag deterministically.
        corrupt.ciphertext = corrupt.ciphertext.slice(0, -4) + "AAAA";
        await expect(openSnapshot(JSON.stringify(corrupt), secret)).rejects.toThrow();
    });
    it("covers KV replication lag from the durable publication copy, then uses memory", async () => {
        const value = fixture();
        const raw = await sealSnapshot(value, secret);
        const kv = { get: vi.fn().mockResolvedValue(null) } as unknown as KVNamespace;
        const fallback = vi.fn().mockResolvedValue(raw);
        const reference = { key: "immutable", digest: await digest(raw), validUntil: value.validUntil, revision: 1 };
        const args = { kv, reference, secret, durableFallback: fallback, waitUntil: vi.fn() };
        expect((await loadSnapshot(args)).source).toBe("durable");
        expect((await loadSnapshot(args)).source).toBe("memory");
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(kv.get).toHaveBeenCalledTimes(1);
    });
    it("never extends a publication deadline because a local cache still contains it", async () => {
        const value = fixture();
        const raw = await sealSnapshot(value, secret);
        const args = { reference: { key: "immutable", digest: await digest(raw), validUntil: Date.now() - 1, revision: 1 },
            kv: { get: vi.fn() } as unknown as KVNamespace, secret, durableFallback: vi.fn(), waitUntil: vi.fn() };
        await expect(loadSnapshot(args)).rejects.toThrow("request_snapshot_expired");
        expect(args.kv.get).not.toHaveBeenCalled();
    });
    it("rejects another workspace, key, model, endpoint or testing-mode snapshot", () => {
        const value = fixture();
        const identity = { workspaceId: value.workspaceId, apiKeyId: value.apiKeyId, model: value.model,
            endpoint: value.endpoint, testingMode: false };
        expect(() => validateSnapshot(value, identity)).not.toThrow();
        for (const field of ["workspaceId", "apiKeyId", "model", "endpoint"] as const) {
            expect(() => validateSnapshot(value, { ...identity, [field]: "other" })).toThrow();
        }
        expect(() => validateSnapshot(value, { ...identity, testingMode: true })).toThrow();
    });
});
