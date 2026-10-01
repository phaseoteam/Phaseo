import { readStreamTextWithLimit } from "@/core/bounded-stream";
import { L1Cache } from "@/runtime/cache/l1";
import { dispatchBackground, getBindingsIfConfigured } from "@/runtime/env";
import { countOperation } from "@/runtime/request-operations";

const MAX_AGE_MS = 300_000;
const MAX_BYTES = 1024 * 1024;
type DiscoveryKey = "pricing-models" | `providers:${number}:${number}`;
type Snapshot = { body: string; checkedAt: number; expiresAt: number };
type Source = { body: unknown; expiresAt?: number };

/** Only shared discovery data belongs here. Call AFTER auth and capability
 * checks. Never use for private models, policy, credentials or admission. */
export class SharedDiscoveryCache {
    private readonly local = new L1Cache<Snapshot>({
        namespace: "shared-discovery-v1", maxEntries: 64, maxBytes: 2 * MAX_BYTES,
        maxEntryBytes: MAX_BYTES, maxPending: 8,
        sizeOf: (value, key) => 2 * (value.body.length + key.length) + 128,
    });
    private writes = 0;

    constructor(
        private readonly cache: () => Cache | undefined,
        private readonly origin: () => string | undefined,
        private readonly defer: (work: Promise<unknown>) => void,
    ) {}

    private key(scope: DiscoveryKey): string | null {
        if (scope !== "pricing-models" && !/^providers:\d{1,3}:\d{1,16}$/.test(scope)) return null;
        try {
            const url = new URL(this.origin() ?? "");
            if (url.protocol !== "https:" || url.username || url.password) return null;
            return `${url.origin}/__gateway-cache/discovery/v1/${scope}`;
        } catch { return null; }
    }

    async response(scope: DiscoveryKey, produce: () => Promise<Source>): Promise<Response> {
        const key = this.key(scope);
        const load = async () => {
            const cached = key ? await this.readEdge(key) : null;
            const checkedAt = Date.now();
            const source = cached ? null : await produce();
            const value = cached ?? {
                body: JSON.stringify(source!.body), checkedAt,
                expiresAt: Math.min(checkedAt + MAX_AGE_MS, source!.expiresAt ?? Infinity),
            };
            if (!cached && key && value.expiresAt > Date.now() && 2 * value.body.length + key.length * 2 + 128 <= MAX_BYTES) {
                this.publish(key, value);
            }
            return { value, expiresAtMs: Math.min(Date.now() + 30_000, value.expiresAt) };
        };
        // Only immutable, fully consumed strings cross request boundaries.
        const snapshot = key ? await this.local.getOrLoad(key, load) : (await load()).value;
        const ttl = Math.max(0, Math.floor((snapshot.expiresAt - Date.now()) / 1000));
        return new Response(snapshot.body, { headers: {
            "Content-Type": "application/json",
            "Cache-Control": ttl > 0 ? `private, max-age=${ttl}` : "no-store",
            "Vary": "Authorization",
        } });
    }

    private async readEdge(key: string): Promise<Snapshot | null> {
        try {
            const cache = this.cache();
            if (!cache) return null;
            countOperation("cacheRead");
            const response = await cache.match(key);
            if (!response) return null;
            const checkedAt = Number(response.headers.get("x-phaseo-source-checked-at"));
            const expiresAt = Number(response.headers.get("x-phaseo-source-expires-at"));
            const now = Date.now();
            if (response.status !== 200 || !Number.isSafeInteger(checkedAt) || checkedAt <= 0 || checkedAt > now ||
                !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > checkedAt + MAX_AGE_MS) {
                await response.body?.cancel();
                return null;
            }
            const body = await readStreamTextWithLimit(response.body, MAX_BYTES);
            if (2 * (body.length + key.length) + 128 > MAX_BYTES) return null;
            const value = JSON.parse(body);
            if (!value || value.ok !== true || !Array.isArray(key.endsWith("/pricing-models") ? value.models : value.providers)) return null;
            if (expiresAt <= Date.now()) return null;
            return { body, checkedAt, expiresAt };
        } catch { return null; }
    }

    private publish(key: string, snapshot: Snapshot): void {
        let cache: Cache | undefined;
        try { cache = this.cache(); } catch { return; }
        const ttl = Math.floor((snapshot.expiresAt - Date.now()) / 1000);
        if (!cache || ttl <= 0 || this.writes >= 8) return;
        this.writes++;
        const write = Promise.resolve().then(async () => {
            countOperation("cacheWrite");
            await cache.put(key, new Response(snapshot.body, { headers: {
                "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}`,
                "Cache-Tag": "gateway-shared-discovery-v1",
                "x-phaseo-source-checked-at": String(snapshot.checkedAt),
                "x-phaseo-source-expires-at": String(snapshot.expiresAt),
            } }));
        }).catch(() => undefined).finally(() => { this.writes--; });
        this.defer(write);
    }

    clearMemory(): void { this.local.clear(); }
    stats() { return { ...this.local.stats(), writes: this.writes }; }
}

export const sharedDiscoveryCache = new SharedDiscoveryCache(
    () => typeof caches === "undefined" ? undefined : caches.default,
    () => getBindingsIfConfigured()?.GATEWAY_PUBLIC_BASE_URL,
    dispatchBackground,
);
