import { L1Cache, type CacheValue } from "@/runtime/cache/l1";

const MAX_SOURCE_AGE_MS = 7_200_000;
const MAX_ENTRY_BYTES = 256 * 1024;
type ReadMany = (keys: string[]) => Promise<Record<string, string | null>>;

/** Private context data only. Credit/auth authority is deliberately not cached
 * here. Immutable JSON strings prevent per-request hydration mutating a lease. */
export class ContextLeaseCache {
    private readonly cache = new L1Cache<string | null>({
        namespace: "context-segments", maxEntries: 512, maxBytes: 4 * 1024 * 1024,
        maxEntryBytes: MAX_ENTRY_BYTES, maxPending: 32,
        sizeOf: (value, key) => 2 * ((value?.length ?? 0) + key.length) + 64,
    });

    private limit(key: string): number {
        if (key.startsWith("gateway:dynamic:")) return 5_000;
        if (key.startsWith("gateway:static:") || key.startsWith("gateway:preset:")) return 30_000;
        return 0;
    }

    private entry(key: string, raw: string | null): CacheValue<string | null> {
        const uncached = { value: raw, expiresAtMs: 0 };
        if (!raw || !this.limit(key)) return uncached;
        if (raw.length * 2 > MAX_ENTRY_BYTES) return { value: null, expiresAtMs: 0 };
        try {
            const value = JSON.parse(raw);
            const lease = value?.cacheLease;
            // Rolling deployment: legacy KV values retain their existing path,
            // but must not acquire a new L1 lifetime without source provenance.
            if (lease === undefined) return uncached;
            const now = Date.now();
            if (!Number.isSafeInteger(lease?.checkedAtMs) || !Number.isSafeInteger(lease?.expiresAtMs)
                || lease.checkedAtMs > now || lease.expiresAtMs <= now
                || lease.expiresAtMs <= lease.checkedAtMs
                || lease.expiresAtMs - lease.checkedAtMs > MAX_SOURCE_AGE_MS) {
                return { value: null, expiresAtMs: 0 };
            }
            const catalogDeadline = value.publicCatalogExpiresAt;
            const workspaceDeadline = value.workspaceRuntimeExpiresAt;
            if (workspaceDeadline !== undefined && (!Number.isFinite(workspaceDeadline) || workspaceDeadline <= now)) {
                return { value: null, expiresAtMs: 0 };
            }
            if (catalogDeadline !== undefined && (!Number.isFinite(catalogDeadline) || catalogDeadline <= now)) {
                return { value: null, expiresAtMs: 0 };
            }
            return { value: raw, expiresAtMs: Math.min(
                lease.expiresAtMs, catalogDeadline ?? Infinity, workspaceDeadline ?? Infinity, now + this.limit(key),
            ) };
        } catch { return { value: null, expiresAtMs: 0 }; }
    }

    async read(keys: string[], readMany: ReadMany): Promise<Record<string, string | null>> {
        const values: Record<string, string | null> = {};
        const missing: string[] = [];
        for (const key of new Set(keys)) {
            const value = this.cache.get(key);
            if (value === undefined) missing.push(key);
            else values[key] = value;
        }
        // Create I/O only inside the loader that wins single-flight. The source
        // consumes KV results in that request; other callers receive strings.
        let source: ReturnType<ReadMany> | undefined;
        await Promise.all(missing.map(async key => {
            values[key] = await this.cache.getOrLoad(key, async () => {
                source ??= readMany(missing);
                return this.entry(key, (await source)[key] ?? null);
            });
        }));
        return values;
    }

    remember(key: string, raw: string): void { this.cache.set(key, this.entry(key, raw)); }
    invalidate(key: string): void { this.cache.invalidate(key); }
    stats() { return this.cache.stats(); }
}

export const contextLeases = new ContextLeaseCache();

export function encodeContextLease(value: object, ttlSeconds: number, checkedAtMs: number): string {
    return JSON.stringify({ ...value, cacheLease: { checkedAtMs, expiresAtMs: checkedAtMs + ttlSeconds * 1000 } });
}
