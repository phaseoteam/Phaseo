import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditAdmissionLeases } from "./credit-admission-leases";

const origin = 1_700_000_000_000;
function snapshot(workspaceId = "ws", balance = 20_000_000_000, checkedAtMs = Date.now(), expiresAtMs = checkedAtMs + 120_000) {
    return JSON.stringify({ workspaceId, credit: { ok: true, balanceNanos: balance }, cacheLease: { checkedAtMs, expiresAtMs } });
}
describe("credit admission serving leases", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(origin); });
    afterEach(() => vi.useRealTimers());

    it("coalesces 32 reads and serves the next warm read without external I/O", async () => {
        const cache = new CreditAdmissionLeases(), load = vi.fn(async () => snapshot());
        const result = await Promise.all(Array.from({ length: 32 }, () => cache.read("ws", load)));
        expect(new Set(result).size).toBe(1);
        await cache.read("ws", load);
        expect(load).toHaveBeenCalledTimes(1);
        vi.setSystemTime(origin + 5000);
        await cache.read("ws", load);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("never renews an expired source by copying it out of KV", async () => {
        const cache = new CreditAdmissionLeases(), load = vi.fn(async () => snapshot("ws", 20e9, origin - 119_000, origin + 1000));
        expect(await cache.read("ws", load)).not.toBeNull();
        vi.setSystemTime(origin + 1000);
        expect(await cache.read("ws", load)).toBeNull();
        expect(load).toHaveBeenCalledTimes(2);
    });

    it.each([0, 1e9, 5e9, 9_999_999_999, null, "20000000000"])("keeps low or ambiguous balance %s out of L1", async balance => {
        const cache = new CreditAdmissionLeases();
        const raw = JSON.stringify({ ...JSON.parse(snapshot()), credit: { ok: true, balanceNanos: balance } });
        const load = vi.fn(async () => raw);
        expect(await cache.read("ws", load)).toBe(raw);
        await cache.read("ws", load);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("rejects wrong-workspace, malformed, future, overlong and expired leases", async () => {
        const cache = new CreditAdmissionLeases();
        for (const raw of [snapshot("other"), "{", " ".repeat(17000), snapshot("ws", 20e9, origin + 1),
            snapshot("ws", 20e9, origin, origin + 7_200_001), snapshot("ws", 20e9, origin - 100, origin)]) {
            expect(await cache.read("ws", async () => raw)).toBeNull();
        }
    });

    it("retains legacy behavior without leasing legacy credit", async () => {
        const cache = new CreditAdmissionLeases(), legacy = JSON.stringify({ workspaceId: "ws", credit: { ok: true, balanceNanos: 20e9 } });
        const load = vi.fn(async () => legacy);
        await cache.read("ws", load); await cache.read("ws", load);
        expect(load).toHaveBeenCalledTimes(2);
        cache.invalidate("ws");
        expect(await cache.read("ws", load)).toBeNull();
    });

    it("fences late reads and pre-mutation publications; fresh source can refill", async () => {
        const cache = new CreditAdmissionLeases(), old = snapshot();
        let release!: (raw: string) => void;
        const read = cache.read("ws", () => new Promise<string>(resolve => { release = resolve; }));
        await Promise.resolve();
        cache.invalidate("ws");
        release(old);
        await expect(read).rejects.toThrow("Cache refill invalidated");
        expect(cache.canPublish("ws", origin)).toBe(false);
        cache.remember("ws", old);
        expect(await cache.read("ws", async () => old)).toBeNull();
        vi.setSystemTime(origin + 1);
        expect(await cache.read("ws", async () => snapshot())).not.toBeNull();
    });

    it("isolates workspaces and keeps entries, bytes, refills and tombstones bounded", async () => {
        const cache = new CreditAdmissionLeases();
        for (let n = 0; n < 600; n++) cache.remember(`ws${n}`, snapshot(`ws${n}`));
        expect(cache.stats().entries).toBeLessThanOrEqual(512);
        expect(cache.stats().bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
        for (let n = 0; n < 600; n++) cache.invalidate(`ws${n}`);
        expect(cache.stats().fences).toBe(512);
        expect(cache.canPublish("ws0", origin)).toBe(false);
        expect(await cache.read("ws0", async () => snapshot("ws0"))).toBeNull();
        vi.setSystemTime(origin + 1);
        expect(await cache.read("ws0", async () => snapshot("ws0"))).not.toBeNull();
        let release!: () => void;
        const blocked = new Promise<void>(resolve => { release = resolve; });
        const reads = Array.from({ length: 32 }, (_, n) => cache.read(`new${n}`, async () => { await blocked; return null; }));
        await expect(cache.read("overflow", async () => null)).rejects.toThrow("capacity");
        release(); await Promise.all(reads);
        expect(cache.stats().pending).toBe(0);
    });
});
