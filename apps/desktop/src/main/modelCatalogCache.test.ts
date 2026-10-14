import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CATALOG_FRESH_MS, ModelCatalogCache } from "./modelCatalogCache";

const key = { endpoint: "https://api.phaseo.app/v1", accountId: "account" };
const first = [{ id: "owned/first", name: "First" }], second = [{ id: "owned/second", name: "Second" }];
let root = "";
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "phaseo-model-cache-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe("model catalog disk cache", () => {
	it("blocks on the network only when nothing is cached, then serves a fresh cache without fetching", async () => {
		let now = 1_000_000; const cache = new ModelCatalogCache(root, undefined, () => now);
		const fetchModels = vi.fn().mockResolvedValue(first);
		expect(await cache.get(key, fetchModels)).toEqual(first); expect(fetchModels).toHaveBeenCalledOnce();
		now += MODEL_CATALOG_FRESH_MS - 1;
		expect(await new ModelCatalogCache(root, undefined, () => now).get(key, fetchModels)).toEqual(first); expect(fetchModels).toHaveBeenCalledOnce();
		expect(readdirSync(root).filter(name => name.endsWith(".tmp"))).toEqual([]);
	});
	it("serves a stale cache at once and refreshes once in the background, reporting only a changed list", async () => {
		let now = 0; const onChange = vi.fn(); const cache = new ModelCatalogCache(root, onChange, () => now);
		await cache.refresh(key, async () => first); now = MODEL_CATALOG_FRESH_MS;
		let resolve!: (models: typeof second) => void; const fetchModels = vi.fn(() => new Promise<typeof second>(done => { resolve = done; }));
		expect(await cache.get(key, fetchModels)).toEqual(first); expect(await cache.get(key, fetchModels)).toEqual(first);
		expect(fetchModels).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled();
		resolve(second); await settle();
		expect(onChange).toHaveBeenCalledExactlyOnceWith(key); now += 1;
		expect(await cache.get(key, fetchModels)).toEqual(second);
		now += MODEL_CATALOG_FRESH_MS; await cache.get(key, async () => second); await settle();
		expect(onChange).toHaveBeenCalledOnce();
	});
	it("shares one in-flight refresh per account and keeps separate accounts apart", async () => {
		const cache = new ModelCatalogCache(root); let resolve!: (models: typeof first) => void;
		const fetchModels = vi.fn(() => new Promise<typeof first>(done => { resolve = done; }));
		const requests = [cache.get(key, fetchModels), cache.refresh(key, fetchModels), cache.get(key, fetchModels)];
		const other = cache.get({ ...key, accountId: "other" }, async () => second);
		await settle(); resolve(first);
		expect(await Promise.all(requests)).toEqual([first, first, first]); expect(await other).toEqual(second); expect(fetchModels).toHaveBeenCalledOnce();
		expect(cache.filename(key)).not.toBe(cache.filename({ ...key, accountId: "other" })); expect(cache.filename(key)).not.toBe(cache.filename({ ...key, endpoint: "https://example.test/v1" }));
	});
	it("keeps the stale cache when a background refresh fails and throws when there is no cache", async () => {
		let now = 0; const warn = vi.fn(); const cache = new ModelCatalogCache(root, undefined, () => now, warn);
		await expect(cache.get(key, async () => { throw new Error("Model discovery returned HTTP 401."); })).rejects.toThrow("HTTP 401");
		await cache.refresh(key, async () => first); now = MODEL_CATALOG_FRESH_MS * 2;
		expect(await cache.get(key, async () => { throw new Error("offline"); })).toEqual(first); await settle();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("offline")); expect(await cache.get(key, async () => second)).toEqual(first); await settle();
	});
	it.each([["corrupt JSON", "{"], ["an old version", JSON.stringify({ version: 0, ...key, fetchedAt: new Date().toISOString(), models: first })], ["another account", JSON.stringify({ version: 1, ...key, accountId: "other", fetchedAt: new Date().toISOString(), models: first })], ["malformed models", JSON.stringify({ version: 1, ...key, fetchedAt: new Date().toISOString(), models: [{ id: 1 }] })]])("ignores %s and fetches", async (_name, contents) => {
		const cache = new ModelCatalogCache(root); writeFileSync(cache.filename(key), contents);
		const fetchModels = vi.fn().mockResolvedValue(second);
		expect(await cache.get(key, fetchModels)).toEqual(second); expect(fetchModels).toHaveBeenCalledOnce(); expect((await cache.read(key))?.models).toEqual(second);
	});
	it("forces a refresh past a fresh cache and forgets a removed account, even mid-refresh", async () => {
		const onChange = vi.fn(); const cache = new ModelCatalogCache(root, onChange);
		await cache.refresh(key, async () => first);
		expect(await cache.refresh(key, async () => second)).toEqual(second); expect(onChange).toHaveBeenCalledOnce();
		let resolve!: (models: typeof first) => void; const pending = cache.refresh(key, () => new Promise(done => { resolve = done; }));
		await settle(); await cache.remove(key); resolve(first); await pending;
		expect(await cache.read(key)).toBeUndefined(); expect(onChange).toHaveBeenCalledOnce();
	});
	it("re-checks with saved validators and keeps the list when nothing changed", async () => {
		let now = 0; const onChange = vi.fn(); const cache = new ModelCatalogCache(root, onChange, () => now);
		await cache.refresh(key, async () => ({ models: first, validators: [{ offset: 0, etag: "\"v1\"" }] }));
		now = MODEL_CATALOG_FRESH_MS + 1;
		const fetchModels = vi.fn().mockResolvedValue({ notModified: true });
		expect(await cache.get(key, fetchModels)).toEqual(first); await settle();
		expect(fetchModels).toHaveBeenCalledWith([{ offset: 0, etag: "\"v1\"" }]); expect(onChange).not.toHaveBeenCalled();
		expect(await cache.read(key)).toMatchObject({ version: 2, models: first, validators: [{ offset: 0, etag: "\"v1\"" }], fetchedAt: new Date(now).toISOString() });
		expect(MODEL_CATALOG_FRESH_MS).toBe(15 * 60 * 1000);
	});
});
