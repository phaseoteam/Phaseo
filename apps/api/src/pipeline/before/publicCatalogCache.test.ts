import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicCatalogCache } from "./publicCatalogCache";
import { createPublicRoutingSnapshot } from "./publicCatalogSnapshot";
import { RequestOperations, withRequestOperations } from "@/runtime/request-operations";

function fixture(model = "lab/model", lifetime = 300_000) {
    return { version: 1, model, resolvedModel: model, endpoints: ["text.generate"],
        checkedAt: Date.now(), expiresAt: Date.now() + lifetime,
        variants: [{ endpoint: "text.generate", providers: [{ provider_id: "test", api_model_id: model, byok_meta: [] }], pricing: {} }],
        providerRows: [], routeModes: [],
    };
}
function setup() {
    const values = new Map<string, string>();
    const match = vi.fn(async (key: string) => values.has(key) ? new Response(values.get(key)) : undefined);
    const put = vi.fn(async (key: string, response: Response) => { values.set(key, await response.text()); });
    const storage = { match, put } as unknown as Cache;
    const cache = new PublicCatalogCache(() => storage, () => "https://staging.example");
    return { cache, storage, values, match, put };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());

describe("public catalogue L1 and Cache API", () => {
    it("uses no KV and no external operations during the 30-second warm lease", async () => {
        const { cache, match, put } = setup();
        const operations = new RequestOperations();
        await withRequestOperations(operations, async () => {
            await cache.publish(fixture());
            for (let i = 0; i < 100; i++) expect(await cache.read("lab/model", ["text.generate"])).toEqual(fixture());
        });
        expect(match).not.toHaveBeenCalled(); expect(put).toHaveBeenCalledTimes(1);
        expect(operations.total).toEqual({ cacheWrite: 1 });
        expect(put.mock.calls[0][1].headers.get("cache-tag")).toBe("gateway-public-catalog-v2");
    });
    it("shares public data across isolates through L2 without a database binding", async () => {
        const { cache, storage, match } = setup(); await cache.publish(fixture());
        const other = new PublicCatalogCache(() => storage, () => "https://staging.example");
        expect(await other.read("lab/model", ["text.generate"])).toEqual(fixture());
        expect(match).toHaveBeenCalledTimes(1);
        expect(await other.read("lab/model", ["text.generate"])).toEqual(fixture());
        expect(match).toHaveBeenCalledTimes(1);
    });
    it("coalesces concurrent L2 refills and shares only fully consumed immutable data", async () => {
        const { cache, match } = setup();
        const snapshot = await createPublicRoutingSnapshot(fixture());
        let finish!: (value: Response) => void;
        match.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
        const reads = Array.from({ length: 50 }, () => cache.read("lab/model", ["text.generate"]));
        await Promise.resolve(); expect(match).toHaveBeenCalledTimes(1);
        finish(Response.json(snapshot));
        const results = await Promise.all(reads);
        expect(results.every(value => value?.model === "lab/model")).toBe(true);
        results[0]!.variants[0].providers[0].provider_id = "mutated";
        expect(results[1]!.variants[0].providers[0].provider_id).toBe("test");
        expect(cache.stats().pending).toBe(0);
    });
    it("rechecks L2 after exactly 30 seconds and never extends source expiry", async () => {
        const { cache, match } = setup(); const value = fixture(); await cache.publish(value);
        vi.setSystemTime(129_999); await cache.read(value.model, value.endpoints); expect(match).not.toHaveBeenCalled();
        vi.setSystemTime(130_000); await cache.read(value.model, value.endpoints); expect(match).toHaveBeenCalledTimes(1);
        vi.setSystemTime(value.expiresAt); expect(await cache.read(value.model, value.endpoints)).toBeNull();
    });
    it("uses a lower TTL for imminent price deadlines, without rounding up", async () => {
        const { cache, put } = setup(); const value = fixture("lab/model", 2_500);
        await cache.publish(value); expect(put.mock.calls[0][1].headers.get("cache-control")).toBe("public, max-age=2");
        vi.setSystemTime(value.expiresAt); expect(await cache.read(value.model, value.endpoints)).toBeNull();
    });
    it("does not cache unknown/private models or use a request-selected origin", async () => {
        const { cache, match, put, storage } = setup();
        const value = fixture(); value.variants[0].providers = [];
        expect(await cache.publish(value)).toBe(false);
        expect(await cache.publish(fixture("@private"))).toBe(false);
        expect(await cache.read("@private", ["text.generate"])).toBeNull();
        const unconfigured = new PublicCatalogCache(() => storage, () => undefined);
        expect(await unconfigured.publish(fixture())).toBe(false);
        expect(await unconfigured.read("lab/model", ["text.generate"])).toBeNull();
        expect(match).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
    });
    it("isolates staging and production cache identities", async () => {
        const { cache, storage } = setup(); await cache.publish(fixture());
        const prod = new PublicCatalogCache(() => storage, () => "https://prod.example");
        expect(await prod.read("lab/model", ["text.generate"])).toBeNull();
    });
    it("fails to source on malformed, oversized, expired or corrupt envelopes", async () => {
        const { cache, match } = setup(); const value = await createPublicRoutingSnapshot(fixture());
        for (const raw of ["not json", "x".repeat(300_000), JSON.stringify({ ...value, revision: "bad" }),
            JSON.stringify({ ...value, version: 1 }), JSON.stringify({ ...value, catalog: { ...value.catalog, expiresAt: Date.now() } }),
            JSON.stringify({ ...value, catalog: { ...value.catalog, providerRows: [{ provider_slug: "x", api_key: "private" }] } })]) {
            match.mockImplementationOnce(async () => new Response(raw));
            expect(await cache.read("lab/model", ["text.generate"])).toBeNull();
        }
        expect(cache.stats().entries).toBe(0);
    });
    it("does not negatively cache L2 misses or failures", async () => {
        const { cache, match } = setup();
        expect(await cache.read("lab/model", ["text.generate"])).toBeNull();
        match.mockRejectedValueOnce(new Error("offline"));
        expect(await cache.read("lab/model", ["text.generate"])).toBeNull();
        expect(await cache.read("lab/model", ["text.generate"])).toBeNull();
        expect(match).toHaveBeenCalledTimes(3);
    });
    it("a failed L2 publication retains a checked local value, but not beyond its lease", async () => {
        const { cache, put } = setup(); put.mockRejectedValueOnce(new Error("offline"));
        await expect(cache.publish(fixture())).rejects.toThrow("offline");
        expect((await cache.read("lab/model", ["text.generate"]))?.model).toBe("lab/model");
        vi.setSystemTime(130_000); expect(await cache.read("lab/model", ["text.generate"])).toBeNull();
    });
    it("invalidation fences late reads and a newer local publication wins", async () => {
        const { cache, match } = setup(); const old = await createPublicRoutingSnapshot(fixture());
        let finish!: (value: Response) => void;
        match.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
        const pending = cache.read("lab/model", ["text.generate"]); await Promise.resolve();
        vi.setSystemTime(110_000); const newer = fixture(); await cache.publish(newer);
        finish(Response.json(old));
        expect((await pending)?.checkedAt).toBe(newer.checkedAt);
        expect(await cache.publish(old.catalog)).toBe(false);
    });
    it("invalidation without a replacement does not resurrect or deliver a late read", async () => {
        const { cache, match } = setup(); const value = await createPublicRoutingSnapshot(fixture());
        let finish!: (value: Response) => void;
        match.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
        const pending = cache.read("lab/model", ["text.generate"]); await Promise.resolve();
        cache.invalidate("lab/model", ["text.generate"]); finish(Response.json(value));
        expect(await pending).toBeNull(); expect(cache.stats().entries).toBe(0);
    });
    it("bounds key cardinality and outstanding refill work", async () => {
        const { cache, match } = setup();
        let finish!: (value: undefined) => void;
        match.mockReturnValue(new Promise<undefined>(resolve => { finish = resolve; }));
        const reads = Array.from({ length: 100 }, (_, i) => cache.read(`lab/${i}`, ["text.generate"]));
        await Promise.resolve(); expect(match).toHaveBeenCalledTimes(32);
        expect(cache.stats().rejectedRefills).toBe(68); finish(undefined); await Promise.all(reads);
        for (let i = 0; i < 160; i++) await cache.publish(fixture(`lab/${i}`));
        expect(cache.stats().entries).toBe(128); expect(cache.stats().bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    });
    it("bounds outstanding publications and releases capacity after completion", async () => {
        const { cache, put } = setup();
        let finish!: () => void;
        put.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        const writes = Array.from({ length: 64 }, (_, i) => cache.publish(fixture(`lab/${i}`)));
        await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(32));
        expect(cache.stats().publications).toBe(32);
        finish();
        const results = await Promise.all(writes);
        expect(results.filter(Boolean)).toHaveLength(32);
        expect(cache.stats().publications).toBe(0);
    });
});
