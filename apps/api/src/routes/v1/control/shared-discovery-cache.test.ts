import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedDiscoveryCache } from "./shared-discovery-cache";

function fixture(origin = "https://staging.example") {
    const stored = new Map<string, { text: string; headers: Headers }>();
    const storage = {
        match: vi.fn(async (key: string) => {
            const value = stored.get(key);
            return value ? new Response(value.text, { headers: value.headers }) : undefined;
        }),
        put: vi.fn(async (key: string, response: Response) => {
            stored.set(key, { text: await response.text(), headers: new Headers(response.headers) });
        }),
    };
    const writes: Promise<unknown>[] = [];
    const cache = new SharedDiscoveryCache(() => storage as Cache, () => origin, work => { writes.push(work); });
    const source = vi.fn(async () => ({ body: { ok: true, providers: [{ api_provider_id: "example" }] } }));
    return { cache, source, storage, stored, writes };
}

afterEach(() => { vi.useRealTimers(); });

describe("shared discovery cache", () => {
    it("coalesces 32 source requests and serves warm data without external operations", async () => {
        const f = fixture();
        const responses = await Promise.all(Array.from({ length: 32 }, () => f.cache.response("providers:50:0", f.source)));
        for (const response of responses) expect((await response.json()).ok).toBe(true);
        await Promise.all(f.writes);
        expect(f.source).toHaveBeenCalledTimes(1);
        expect(f.storage.match).toHaveBeenCalledTimes(1);
        expect(f.storage.put).toHaveBeenCalledTimes(1);
        await f.cache.response("providers:50:0", f.source);
        expect(f.source).toHaveBeenCalledTimes(1);
        expect(f.storage.match).toHaveBeenCalledTimes(1);
        expect(f.cache.stats().pending).toBe(0);
    });

    it("uses shared keys without credentials and keeps client responses private", async () => {
        const f = fixture();
        const response = await f.cache.response("providers:50:0", f.source);
        await Promise.all(f.writes);
        expect([...f.stored.keys()]).toEqual(["https://staging.example/__gateway-cache/discovery/v1/providers:50:0"]);
        expect(response.headers.get("Cache-Control")).toMatch(/^private, max-age=\d+$/);
        expect(response.headers.get("Vary")).toBe("Authorization");
        expect(response.headers.get("x-phaseo-source-checked-at")).toBeNull();
        expect([...f.stored.values()][0].headers.get("Cache-Control")).toMatch(/^public, max-age=/);
    });

    it("consumes edge bodies before sharing results and never extends the source deadline", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const f = fixture();
        await f.cache.response("providers:50:0", f.source);
        await Promise.all(f.writes);
        vi.setSystemTime(1_290_000);
        f.cache.clearMemory();
        const responses = await Promise.all(Array.from({ length: 32 }, () => f.cache.response("providers:50:0", f.source)));
        for (const response of responses) {
            expect((await response.json()).ok).toBe(true);
            expect(response.headers.get("Cache-Control")).toBe("private, max-age=10");
        }
        expect(f.source).toHaveBeenCalledTimes(1);
        expect(f.storage.match).toHaveBeenCalledTimes(2);
        vi.setSystemTime(1_300_001);
        await f.cache.response("providers:50:0", f.source);
        expect(f.source).toHaveBeenCalledTimes(2);
    });

    it("shortens pricing cache lifetime at the first active SKU expiry", async () => {
        vi.useFakeTimers(); vi.setSystemTime(1_000_000);
        const f = fixture();
        const source = vi.fn(async () => ({ body: { ok: true, models: [] }, expiresAt: Date.now() + 3_000 }));
        const response = await f.cache.response("pricing-models", source);
        expect(response.headers.get("Cache-Control")).toBe("private, max-age=3");
        await Promise.all(f.writes);
        vi.setSystemTime(1_003_001);
        await f.cache.response("pricing-models", source);
        expect(source).toHaveBeenCalledTimes(2);
    });

    it.each(["missing", "expired", "future", "too-long", "invalid-json", "wrong-kind", "oversized"])("rejects %s edge snapshots", async (kind) => {
        const f = fixture();
        const now = Date.now();
        const headers = new Headers({ "x-phaseo-source-checked-at": String(now), "x-phaseo-source-expires-at": String(now + 300_000) });
        let text = JSON.stringify({ ok: true, providers: [] });
        if (kind === "missing") headers.delete("x-phaseo-source-checked-at");
        if (kind === "expired") headers.set("x-phaseo-source-expires-at", String(now - 1));
        if (kind === "future") headers.set("x-phaseo-source-checked-at", String(now + 100_000));
        if (kind === "too-long") headers.set("x-phaseo-source-expires-at", String(now + 600_000));
        if (kind === "invalid-json") text = "not-json";
        if (kind === "wrong-kind") text = JSON.stringify({ ok: true, models: [] });
        if (kind === "oversized") text = "x".repeat(1024 * 1024 + 1);
        f.stored.set("https://staging.example/__gateway-cache/discovery/v1/providers:50:0", { text, headers });
        await f.cache.response("providers:50:0", f.source);
        expect(f.source).toHaveBeenCalledTimes(1);
        await Promise.all(f.writes);
    });

    it("survives Cache API read and write failures", async () => {
        const f = fixture();
        f.storage.match.mockRejectedValue(new Error("cache unavailable"));
        f.storage.put.mockRejectedValue(new Error("cache unavailable"));
        expect((await (await f.cache.response("providers:50:0", f.source)).json()).ok).toBe(true);
        await Promise.all(f.writes);
        expect(f.cache.stats().writes).toBe(0);
        await f.cache.response("providers:50:0", f.source);
        expect(f.source).toHaveBeenCalledTimes(1);
    });

    it("never caches failed source requests", async () => {
        const f = fixture();
        f.source.mockRejectedValueOnce(new Error("source failed"));
        await expect(f.cache.response("providers:50:0", f.source)).rejects.toThrow("source failed");
        await f.cache.response("providers:50:0", f.source);
        expect(f.source).toHaveBeenCalledTimes(2);
    });

    it("serves oversized valid responses without retaining or publishing them", async () => {
        const f = fixture();
        const source = vi.fn(async () => ({ body: { ok: true, providers: [{ description: "x".repeat(600_000) }] } }));
        const response = await f.cache.response("providers:50:0", source);
        expect((await response.json()).providers[0].description).toHaveLength(600_000);
        await f.cache.response("providers:50:0", source);
        expect(source).toHaveBeenCalledTimes(2);
        expect(f.storage.put).not.toHaveBeenCalled();
        expect(f.cache.stats().entries).toBe(0);
    });

    it("bounds distinct pending refills", async () => {
        const f = fixture();
        let release!: () => void;
        const wait = new Promise<void>(resolve => { release = resolve; });
        const source = async () => { await wait; return { body: { ok: true, providers: [] } }; };
        const pending = Array.from({ length: 8 }, (_, i) => f.cache.response(`providers:50:${i}`, source));
        await expect(f.cache.response("providers:50:9", source)).rejects.toThrow("capacity");
        expect(f.cache.stats().pending).toBe(8);
        release(); await Promise.all(pending); await Promise.all(f.writes);
        expect(f.cache.stats().pending).toBe(0);
    });

    it.each(["", "http://insecure.example", "https://user:password@example.com"])("bypasses cache for an invalid configured origin %s", async origin => {
        const f = fixture(origin);
        await f.cache.response("providers:50:0", f.source);
        expect(f.storage.match).not.toHaveBeenCalled();
        expect(f.storage.put).not.toHaveBeenCalled();
    });
});
