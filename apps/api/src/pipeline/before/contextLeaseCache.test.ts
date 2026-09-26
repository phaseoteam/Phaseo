import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextLeaseCache, encodeContextLease } from "./contextLeaseCache";

const dynamic = "gateway:dynamic:default:workspace:key:v1";
const staticKey = "gateway:static:v5:default:workspace:v1:responses:model";
const now = 1_000_000;
function setup() {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const cache = new ContextLeaseCache();
    const raw = encodeContextLease({ workspaceId: "workspace" }, 60, now);
    const read = vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(key => [key, raw])));
    return { cache, raw, read };
}
afterEach(() => { vi.useRealTimers(); });

describe("context segment leases", () => {
    it("coalesces cold reads and makes warm segment reads entirely local", async () => {
        const { cache, raw, read } = setup();
        const results = await Promise.all(Array.from({ length: 32 }, () => cache.read([dynamic, staticKey], read)));
        expect(read).toHaveBeenCalledTimes(1);
        results.forEach(value => expect(value).toEqual({ [dynamic]: raw, [staticKey]: raw }));
        for (let i = 0; i < 100; i++) await cache.read([dynamic, staticKey], read);
        expect(read).toHaveBeenCalledTimes(1);
        expect(cache.stats()).toMatchObject({ entries: 2, pending: 0 });
    });

    it("expires private data at five seconds and routing data at thirty without sliding reads", async () => {
        const { cache, read } = setup();
        await cache.read([dynamic, staticKey], read);
        vi.setSystemTime(now + 4999); await cache.read([dynamic, staticKey], read);
        expect(read).toHaveBeenCalledTimes(1);
        vi.setSystemTime(now + 5000); await cache.read([dynamic, staticKey], read);
        expect(read).toHaveBeenLastCalledWith([dynamic]);
        vi.setSystemTime(now + 30000); await cache.read([staticKey], read);
        expect(read).toHaveBeenLastCalledWith([staticKey]);
    });

    it("never extends a source or pricing deadline, even if KV retains the value", async () => {
        const { cache } = setup();
        const raw = encodeContextLease({ publicCatalogExpiresAt: now + 1000 }, 60, now);
        const read = vi.fn(async () => ({ [staticKey]: raw }));
        await cache.read([staticKey], read);
        vi.setSystemTime(now + 1000);
        expect(await cache.read([staticKey], read)).toEqual({ [staticKey]: null });
        const expired = encodeContextLease({}, 60, now - 60000);
        expect(await cache.read([dynamic], async () => ({ [dynamic]: expired }))).toEqual({ [dynamic]: null });
        expect(cache.stats().entries).toBe(0);
    });

    it("does not lease legacy entries, missing values or credit hints", async () => {
        const { cache } = setup();
        const legacy = JSON.stringify({ workspaceId: "workspace" });
        const read = vi.fn(async () => ({ [dynamic]: legacy, [staticKey]: null }));
        await cache.read([dynamic, staticKey], read); await cache.read([dynamic, staticKey], read);
        expect(read).toHaveBeenCalledTimes(2);
        const credit = "gateway:credit:workspace";
        cache.remember(credit, encodeContextLease({}, 60, now));
        expect(cache.stats().entries).toBe(0);
    });

    it("bounds both composed settings and BYOK references by their workspace source deadline", async () => {
        const { cache } = setup();
        const raw = encodeContextLease({ workspaceRuntimeExpiresAt: now + 1000 }, 7200, now);
        const read = vi.fn(async () => ({ [dynamic]: raw, [staticKey]: raw }));
        expect(await cache.read([dynamic, staticKey], read)).toEqual({[dynamic]:raw,[staticKey]:raw});
        vi.setSystemTime(now + 1000);
        expect(await cache.read([dynamic, staticKey], read)).toEqual({[dynamic]:null,[staticKey]:null});
        expect(cache.stats().entries).toBe(0);
    });

    it.each([
        { checkedAtMs: now + 1, expiresAtMs: now + 60000 },
        { checkedAtMs: now, expiresAtMs: now + 7200001 },
        { checkedAtMs: now, expiresAtMs: "tomorrow" },
        null,
    ])("rejects malformed lease %j", async cacheLease => {
        const { cache } = setup();
        expect(await cache.read([dynamic], async () => ({ [dynamic]: JSON.stringify({ cacheLease }) })))
            .toEqual({ [dynamic]: null });
    });

    it("fences invalidated in-flight reads and recovers after source failure", async () => {
        const { cache, raw, read } = setup();
        let release!: (value: Record<string, string>) => void;
        const pending = cache.read([dynamic], () => new Promise(resolve => { release = resolve; }));
        await Promise.resolve(); cache.invalidate(dynamic); release({ [dynamic]: raw });
        await expect(pending).rejects.toThrow("invalidated");
        await expect(cache.read([dynamic], async () => { throw new Error("source failed"); })).rejects.toThrow("source failed");
        expect(await cache.read([dynamic], read)).toEqual({ [dynamic]: raw });
    });

    it("bounds large values and retained memory", async () => {
        const { cache } = setup();
        expect(await cache.read([dynamic], async () => ({ [dynamic]: "x".repeat(256 * 1024) }))).toEqual({ [dynamic]: null });
        for (let i = 0; i < 1000; i++) cache.remember(`${dynamic}:${i}`, encodeContextLease({ data: "x".repeat(4096) }, 60, now));
        expect(cache.stats().entries).toBeLessThanOrEqual(512);
        expect(cache.stats().bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    });
});
