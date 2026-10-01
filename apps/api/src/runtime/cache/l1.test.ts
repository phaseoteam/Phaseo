import { describe, expect, it, vi } from "vitest";
import { CacheCapacityError, CacheInvalidatedError, L1Cache, type CacheValue } from "./l1";

function setup(options = {}) {
    let now = 100;
    const cache = new L1Cache<string | null>({ namespace: "test", maxEntries: 3, maxBytes: 30, maxEntryBytes: 20, maxPending: 2, sizeOf: (value, key) => key.length + (value?.length ?? 1), now: () => now, ...options });
    return { cache, time: (value: number) => { now = value; } };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const entry = (value: string | null, expiresAtMs = 200): CacheValue<string | null> => ({ value, expiresAtMs });

describe("bounded isolate L1", () => {
    it("does not allow a caller to extend the retained envelope deadline", () => {
        const { cache, time } = setup();
        const envelope = entry("value", 110);
        cache.set("a", envelope);
        envelope.expiresAtMs = 1000;
        time(110);
        expect(cache.get("a")).toBeUndefined();
    });
    it("touches LRU without extending absolute expiration and caches null", () => {
        const { cache, time } = setup();
        cache.set("a", entry("a")); cache.set("b", entry(null)); cache.set("c", entry("c"));
        expect(cache.get("a")).toBe("a"); cache.set("d", entry("d"));
        expect(cache.get("b")).toBeUndefined();
        cache.set("b", entry(null)); expect(cache.get("b")).toBeNull();
        time(199); expect(cache.get("b")).toBeNull();
        time(200); expect(cache.get("b")).toBeUndefined();
        expect(cache.stats().evictions).toBe(2);
    });

    it("bounds bytes and oversized entries without evicting unrelated data", () => {
        const { cache } = setup();
        cache.set("a", entry("x".repeat(15))); cache.set("b", entry("y".repeat(15)));
        expect(cache.get("a")).toBeUndefined();
        cache.set("large", entry("x".repeat(100)));
        expect(cache.get("b")).toBe("y".repeat(15));
        expect(cache.stats()).toMatchObject({ bytes: 16, entries: 1, rejectedEntries: 1 });
    });

    it("coalesces 100 callers and consumes no I/O on subsequent warm reads", async () => {
        const { cache } = setup();
        const task = deferred<CacheValue<string | null>>();
        const load = vi.fn(() => task.promise);
        const calls = Array.from({ length: 100 }, () => cache.getOrLoad("key", load));
        task.resolve(entry("value"));
        expect(await Promise.all(calls)).toEqual(Array(100).fill("value"));
        expect(await cache.getOrLoad("key", load)).toBe("value");
        expect(load).toHaveBeenCalledTimes(1);
        expect(cache.stats()).toMatchObject({ pending: 0, loads: 1, coalesced: 99, hits: 1 });
    });

    it.each(["invalidate", "clear", "set"] as const)("%s prevents stale refill resurrection and delivery", async (operation) => {
        const { cache } = setup();
        const old = deferred<CacheValue<string | null>>();
        const first = cache.getOrLoad("key", () => old.promise);
        const rejected = expect(first).rejects.toBeInstanceOf(CacheInvalidatedError);
        if (operation === "set") cache.set("key", entry("new"));
        else if (operation === "clear") cache.clear();
        else cache.invalidate("key");
        const next = cache.getOrLoad("key", async () => entry("new"));
        old.resolve(entry("old"));
        await rejected;
        expect(await next).toBe("new");
        expect(cache.get("key")).toBe("new");
        expect(cache.stats().pending).toBe(0);
    });

    it("old finally does not remove a newer in-flight refill", async () => {
        const { cache } = setup();
        const old = deferred<CacheValue<string | null>>(), next = deferred<CacheValue<string | null>>();
        const rejected = expect(cache.getOrLoad("key", () => old.promise)).rejects.toBeInstanceOf(CacheInvalidatedError);
        cache.invalidate("key");
        const pending = cache.getOrLoad("key", () => next.promise);
        old.resolve(entry("old")); await rejected;
        const unexpected = vi.fn(async () => entry("wrong"));
        const joined = cache.getOrLoad("key", unexpected);
        next.resolve(entry("new"));
        expect(await pending).toBe("new"); expect(await joined).toBe("new");
        expect(unexpected).not.toHaveBeenCalled();
    });

    it("bounds outstanding work even across invalidation and clear", async () => {
        const { cache } = setup({ maxPending: 1 });
        const work = deferred<CacheValue<string | null>>();
        const rejected = expect(cache.getOrLoad("a", () => work.promise)).rejects.toBeInstanceOf(CacheInvalidatedError);
        cache.clear();
        await expect(cache.getOrLoad("b", async () => entry("b"))).rejects.toBeInstanceOf(CacheCapacityError);
        work.resolve(entry("old")); await rejected;
        expect(await cache.getOrLoad("b", async () => entry("b"))).toBe("b");
    });

    it.each([true, false])("does not cache errors, including synchronous throws (%s)", async (sync) => {
        const { cache } = setup();
        await expect(cache.getOrLoad("a", () => {
            if (sync) throw new Error("failure");
            return Promise.reject(new Error("failure"));
        })).rejects.toThrow("failure");
        expect(await cache.getOrLoad("a", async () => entry("a"))).toBe("a");
        expect(cache.stats()).toMatchObject({ pending: 0, errors: 1, loads: 2 });
    });

    it("SWR is opt-in, attaches one coalesced refresh, and never extends maximum age on failure", async () => {
        const { cache, time } = setup();
        cache.set("a", { ...entry("old", 110), staleUntilMs: 120 });
        time(110);
        expect(cache.get("a")).toBeUndefined();
        const work = deferred<CacheValue<string | null>>();
        const load = vi.fn(() => work.promise);
        const background: Promise<unknown>[] = [];
        const options = { staleWhileRevalidate: true as const, defer: (promise: Promise<unknown>) => { background.push(promise); } };
        expect(await cache.getOrLoad("a", load, options)).toBe("old");
        expect(await cache.getOrLoad("a", load, options)).toBe("old");
        expect(load).toHaveBeenCalledTimes(1);
        work.reject(new Error("offline")); await Promise.all(background);
        time(120);
        expect(await cache.getOrLoad("a", async () => entry("fresh"), options)).toBe("fresh");
        expect(cache.stats()).toMatchObject({ staleHits: 2, errors: 1 });
    });

    it("strict readers await refill rather than consuming advisory stale data", async () => {
        const { cache, time } = setup();
        cache.set("a", { ...entry("old", 110), staleUntilMs: 120 }); time(110);
        expect(await cache.getOrLoad("a", async () => entry("new"))).toBe("new");
    });

    it("rejects expired, infinite, malformed and over-budget admissions", () => {
        const { cache } = setup();
        for (const expiresAtMs of [100, NaN, Infinity]) cache.set("a", entry("a", expiresAtMs));
        cache.set("a", { ...entry("a"), staleUntilMs: 150 });
        expect(cache.get("a")).toBeUndefined();
        expect(cache.stats().rejectedEntries).toBe(4);
        expect(() => setup({ maxPending: 0 })).toThrow(RangeError);
    });
});
