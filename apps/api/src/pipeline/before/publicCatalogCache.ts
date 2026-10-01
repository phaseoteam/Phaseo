import { readStreamTextWithLimit } from "@/core/bounded-stream";
import { CacheInvalidatedError, L1Cache } from "@/runtime/cache/l1";
import { countOperation } from "@/runtime/request-operations";
import {
    createPublicRoutingSnapshot, isPublicCatalogFresh, PUBLIC_CATALOG_MAX_BYTES,
    publicCatalogSchema, type PublicCatalogSnapshot, type PublicRoutingSnapshot,
} from "./publicCatalogSnapshot";

export const PUBLIC_CATALOG_L1_MS = 30_000;
export const PUBLIC_CATALOG_CACHE_TAG = "gateway-public-catalog-v2";
export const publicCatalogEndpoints = (endpoint: string): string[] =>
    endpoint === "text.generate" ? [endpoint] : ["text.generate", endpoint];
export const publicCatalogKey = (model: string, endpoints: string[]) => JSON.stringify([model, endpoints]);

/** Cache API is a disposable per-datacenter L2, not publication authority. Misses
 * fall through to the source bundle; neither reads nor writes use Workers KV. */
export class PublicCatalogCache {
    private publications = 0;
    private readonly local = new L1Cache<PublicRoutingSnapshot | null>({
        namespace: "public-catalog-v2", maxEntries: 128, maxBytes: 4 * 1024 * 1024,
        maxEntryBytes: PUBLIC_CATALOG_MAX_BYTES + 4096, maxPending: 32,
        sizeOf: (value, key) => 2 * (JSON.stringify(value).length + key.length),
    });

    constructor(private readonly cache: () => Cache | undefined, private readonly origin: () => string | undefined) {}

    private key(model: string, endpoints: string[]): string | null {
        const origin = this.origin();
        if (!origin || model.startsWith("@") || !model || model.length > 512) return null;
        try {
            const url = new URL(origin);
            if (url.protocol !== "https:" || url.username || url.password) return null;
            // Origin is a configured Worker custom domain, never a request Host.
            return `${url.origin}/__gateway-cache/public-catalog/v2/${encodeURIComponent(publicCatalogKey(model, endpoints))}`;
        } catch { return null; }
    }

    private deadline(value: PublicRoutingSnapshot | null): number {
        return value ? Math.min(Date.now() + PUBLIC_CATALOG_L1_MS, value.catalog.expiresAt) : Date.now();
    }

    async read(model: string, endpoints: string[], skipMemory = false): Promise<PublicCatalogSnapshot | null> {
        const key = this.key(model, endpoints);
        if (!key) return null;
        try {
            const load = async () => {
                const value = await this.readEdge(key, model, endpoints);
                return { value, expiresAtMs: this.deadline(value), version: value?.revision };
            };
            const value = skipMemory ? (await load()).value : await this.local.getOrLoad(key, load);
            if (!value || !isPublicCatalogFresh(value.catalog, model, endpoints)) return null;
            return structuredClone(value.catalog);
        } catch (error) {
            if (error instanceof CacheInvalidatedError) {
                // A local publication overtook this read. Never deliver its old result.
                const newer = this.local.get(key);
                if (newer && isPublicCatalogFresh(newer.catalog, model, endpoints)) return structuredClone(newer.catalog);
            }
            // Cache outages/capacity misses never authorize or manufacture routes.
            return null;
        }
    }

    private async readEdge(key: string, model: string, endpoints: string[]): Promise<PublicRoutingSnapshot | null> {
        const cache = this.cache();
        if (!cache) return null;
        countOperation("cacheRead");
        const response = await cache.match(key);
        if (!response) return null;
        const raw = await readStreamTextWithLimit(response.body, PUBLIC_CATALOG_MAX_BYTES + 4096);
        const envelope = JSON.parse(raw);
        if (envelope?.version !== 2 || typeof envelope.revision !== "string") return null;
        const value = await createPublicRoutingSnapshot(envelope.catalog);
        if (value.revision !== envelope.revision || !isPublicCatalogFresh(value.catalog, model, endpoints) ||
            value.catalog.variants.every(variant => variant.providers.length === 0)) return null;
        return value;
    }

    async publish(input: unknown, expected?: { model: string; endpoints: string[] }): Promise<boolean> {
        // Hashing and Cache API writes are bounded too, not only L2 reads.
        if (this.publications >= 32) return false;
        this.publications++;
        try { return await this.publishChecked(input, expected); }
        finally { this.publications--; }
    }

    private async publishChecked(input: unknown, expected?: { model: string; endpoints: string[] }): Promise<boolean> {
        const parsed = publicCatalogSchema.safeParse(input);
        if (!parsed.success) return false;
        const catalog = parsed.data;
        if (!isPublicCatalogFresh(catalog, expected?.model ?? catalog.model, expected?.endpoints ?? catalog.endpoints) ||
            catalog.variants.every(variant => variant.providers.length === 0)) return false;
        const key = this.key(catalog.model, catalog.endpoints);
        if (!key || JSON.stringify(catalog).length * 2 > PUBLIC_CATALOG_MAX_BYTES) return false;
        const snapshot = await createPublicRoutingSnapshot(catalog);
        if (!isPublicCatalogFresh(snapshot.catalog, catalog.model, catalog.endpoints)) return false;
        const existing = this.local.get(key);
        if (existing && existing.catalog.checkedAt > catalog.checkedAt) return false;
        this.local.set(key, { value: snapshot, expiresAtMs: this.deadline(snapshot), version: snapshot.revision });
        const cache = this.cache();
        if (!cache) return false;
        const ttl = Math.floor((catalog.expiresAt - Date.now()) / 1000);
        // Sub-second deadlines are usable locally, but cannot become an HTTP TTL.
        if (ttl <= 0) return false;
        countOperation("cacheWrite");
        await cache.put(key, new Response(JSON.stringify(snapshot), { headers: {
            "content-type": "application/json", "cache-control": `public, max-age=${ttl}`,
            "cache-tag": PUBLIC_CATALOG_CACHE_TAG, etag: `"${snapshot.revision}"`,
        } }));
        return true;
    }

    invalidate(model: string, endpoints: string[]): void {
        const key = this.key(model, endpoints);
        if (key) this.local.invalidate(key);
    }

    stats() { return { ...this.local.stats(), publications: this.publications }; }
}
