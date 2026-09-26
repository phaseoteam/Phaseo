import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PublishedPublicCatalog } from "./publishedPublicCatalog";
import { PublicCatalogCache } from "./publicCatalogCache";
import { createPublicRoutingSnapshot } from "./publicCatalogSnapshot";

const target = { model: "lab/model", endpoints: ["text.generate", "responses"] };
const fixture = () => ({ version: 1, ...target, resolvedModel: target.model, checkedAt: Date.now(), expiresAt: Date.now() + 300_000,
    variants: target.endpoints.map(endpoint => ({ endpoint, pricing: {}, providers: [{ provider_id: "test", api_model_id: target.model, byok_meta: [] }] })),
    providerRows: [], routeModes: [] });
function setup() {
    const data = new Map<string, string>();
    const get = vi.fn(async (key: string) => data.has(key) ? new Response(data.get(key)).body : null);
    const put = vi.fn(async (key: string, value: string) => { data.set(key, value); });
    const store = { get, put } as unknown as KVNamespace;
    return { data, get, put, store, publisher: new PublishedPublicCatalog(() => store) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
afterEach(() => vi.useRealTimers());

it("publishes once and serves an independent cold region with no source client or KV writes", async () => {
    const { publisher, store, get, put } = setup();
    const snapshot = fixture();
    expect(await publisher.publish(snapshot, target)).toBe(true);
    const reader = new PublishedPublicCatalog(() => store);
    const edge = new Map<string, string>(); const tasks: Promise<unknown>[] = [];
    const cache = { match: vi.fn(async (key: string) => edge.has(key) ? new Response(edge.get(key)) : undefined),
        put: vi.fn(async (key: string, value: Response) => { edge.set(key, await value.text()); }) } as unknown as Cache;
    const cold = new PublicCatalogCache(() => cache, () => "https://gateway.test", {
        read: (model, endpoints) => reader.read(model, endpoints), defer: work => tasks.push(work),
    });
    const results = await Promise.all(Array.from({ length: 32 }, () => cold.read(target.model, target.endpoints)));
    expect(results.every(value => value?.checkedAt === snapshot.checkedAt)).toBe(true);
    expect(get).toHaveBeenCalledTimes(1); expect(put).toHaveBeenCalledTimes(1);
    await Promise.all(tasks);
    for (let i = 0; i < 100; i++) expect(await cold.read(target.model, target.endpoints)).toEqual(snapshot);
    expect(get).toHaveBeenCalledTimes(1);
    const next = new PublicCatalogCache(() => cache, () => "https://gateway.test");
    expect(await next.read(target.model, target.endpoints)).toEqual(snapshot);
    expect(get).toHaveBeenCalledTimes(1);
    results[0]!.variants[0].providers[0].provider_id = "mutated";
    expect(results[1]!.variants[0].providers[0].provider_id).toBe("test");
});

it("rejects retained snapshots at source expiry, including short price deadlines", async () => {
    const { publisher, put } = setup(); const value = fixture(); value.expiresAt = Date.now() + 500;
    expect(await publisher.publish(value, target)).toBe(true);
    expect(put.mock.calls[0][2]).toEqual({ expirationTtl: 60 });
    expect(await publisher.read(target.model, target.endpoints)).toEqual(value);
    vi.setSystemTime(value.expiresAt);
    expect(await publisher.read(target.model, target.endpoints)).toBeNull();
});

it.each(["private", "wrong-model", "hidden", "expired", "oversized"])("refuses %s publication", async kind => {
    const { publisher, put } = setup(); const value: any = fixture();
    if (kind === "private") value.variants[0].providers[0].byok_meta = [{ api_key: "fixture-only" }];
    if (kind === "wrong-model") value.model = "lab/other";
    if (kind === "hidden") value.variants.forEach((variant: any) => { variant.providers = []; });
    if (kind === "expired") value.expiresAt = Date.now();
    if (kind === "oversized") value.variants[0].providers[0].capability_params = { description: "x".repeat(300_000) };
    expect(await publisher.publish(value, target)).toBe(false); expect(put).not.toHaveBeenCalled();
});

it("does no KV access for invalid/private targets", async () => {
    const { publisher, get } = setup();
    for (const model of ["", "@private", "x".repeat(513)]) expect(await publisher.read(model, target.endpoints)).toBeNull();
    expect(await publisher.read(target.model, ["not-supported"])).toBeNull();
    expect(get).not.toHaveBeenCalled();
});

it("rejects corrupt revisions, wrong endpoints and invalid JSON without serving them", async () => {
    const { publisher, get } = setup();
    const envelope = await createPublicRoutingSnapshot(fixture());
    for (const raw of ["{", JSON.stringify({ ...envelope, revision: "wrong" }), JSON.stringify({ ...envelope, version: 3 })]) {
        get.mockImplementation(async () => new Response(raw).body);
        expect(await publisher.read(target.model, target.endpoints)).toBeNull();
    }
    get.mockImplementation(async () => new Response(JSON.stringify(envelope)).body);
    expect(await publisher.read(target.model, ["text.generate"])).toBeNull();
});

it("bounds outstanding KV reads and returns safe misses on unavailable storage", async () => {
    const { publisher, get } = setup();
    let finish!: () => void;
    const stalled = new Promise<null>(resolve => { finish = () => resolve(null); });
    get.mockImplementation(() => stalled);
    const reads = Array.from({ length: 32 }, () => publisher.read(target.model, target.endpoints));
    expect(await publisher.read(target.model, target.endpoints)).toBeNull();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(32));
    finish(); await Promise.all(reads);
    get.mockRejectedValue(new Error("unavailable"));
    expect(await publisher.read(target.model, target.endpoints)).toBeNull();
});

it("serves a valid backing snapshot even if edge reads or writes fail", async () => {
    const { publisher } = setup(); const value = fixture(); await publisher.publish(value, target);
    const tasks: Promise<unknown>[] = [];
    const cache = new PublicCatalogCache(() => ({ match: async () => { throw new Error("edge"); },
        put: async () => { throw new Error("edge"); } }) as unknown as Cache, () => "https://gateway.test",
        { read: (model, endpoints) => publisher.read(model, endpoints), defer: work => tasks.push(work) });
    expect(await cache.read(target.model, target.endpoints)).toEqual(value);
    await Promise.all(tasks); expect(cache.stats().edgeWrites).toBe(0);
});
