import { dispatchBackground, getBindings, getCache } from "@/runtime/env";
import type { Endpoint } from "@core/types";
import type { ProviderHealth } from "./health";
import {
    emptyHealth, reduceHealth, healthPoolName, healthSnapshotKey, HEALTH_SNAPSHOT_MAX_AGE_MS,
    type HealthEvidence, type HealthObservation, type HealthSnapshot,
} from "./health-evidence";

type LocalEvidence = { health: HealthEvidence; observedAt: number; acceptedVersion?: number };
type CachedPool = { snapshot?: HealthSnapshot; refreshAfter: number; pending?: Promise<void>;
    local: Map<string, LocalEvidence> };
const pools = new Map<string, CachedPool>();
const MAX_CACHED_POOLS = 256;
export function coordinatedHealthEnabled(): boolean {
    try { return Boolean(getBindings().ROUTING_HEALTH); } catch { return false; }
}
function pool(endpoint: Endpoint, model: string): CachedPool {
    const key = healthPoolName(endpoint, model);
    let value = pools.get(key);
    if (!value) {
        if (pools.size >= MAX_CACHED_POOLS) pools.delete(pools.keys().next().value!);
        value = { refreshAfter: 0, local: new Map() };
        pools.set(key, value);
    }
    return value;
}
function refresh(endpoint: Endpoint, model: string, cached: CachedPool): Promise<void> {
    if (cached.pending) return cached.pending;
    const cache = getCache();
    cached.refreshAfter = Date.now() + 30_000;
    cached.pending = (async () => {
        try {
            const raw = await cache.get(healthSnapshotKey(endpoint, model), { type: "text", cacheTtl: 30 });
            const snapshot = raw ? JSON.parse(raw) as HealthSnapshot : undefined;
            if (snapshot && Number.isFinite(snapshot.version) && Number.isFinite(snapshot.publishedAt) && snapshot.providers &&
                snapshot.version >= (cached.snapshot?.version ?? 0)) {
                cached.snapshot = snapshot;
                for (const [provider, local] of cached.local) {
                    // Wall-clock publication time cannot establish inclusion:
                    // a slow report may arrive after a newer snapshot was built.
                    if (local.acceptedVersion !== undefined && snapshot.version >= local.acceptedVersion) cached.local.delete(provider);
                }
            }
        } catch {
            cached.refreshAfter = Date.now() + 5_000;
            console.warn("routing_health_refresh_failed", { endpoint, model });
        } finally { cached.pending = undefined; }
    })();
    return cached.pending;
}
export function coordinatedHealthMany(endpoint: Endpoint, model: string, providers: string[]): Record<string, ProviderHealth> {
    const cached = pool(endpoint, model);
    if (cached.refreshAfter <= Date.now()) dispatchBackground(refresh(endpoint, model, cached));
    const fresh = cached.snapshot && Date.now() - cached.snapshot.publishedAt < HEALTH_SNAPSHOT_MAX_AGE_MS;
    return Object.fromEntries(providers.map(provider => {
        const local = cached.local.get(provider);
        if (local && Date.now() - local.observedAt >= HEALTH_SNAPSHOT_MAX_AGE_MS) cached.local.delete(provider);
        return [provider, cached.local.get(provider)?.health ?? (fresh ? cached.snapshot?.providers[provider] : undefined) ?? emptyHealth(endpoint, model, provider)];
    }));
}
export async function coordinatedHealthRead(endpoint: Endpoint, model: string, providers: string[]) {
    const cached = pool(endpoint, model);
    if (cached.refreshAfter <= Date.now()) await refresh(endpoint, model, cached);
    return coordinatedHealthMany(endpoint, model, providers);
}
export function reportCoordinatedHealth(event: HealthObservation): void {
    const namespace = getBindings().ROUTING_HEALTH;
    if (!namespace) return;
    const cached = pool(event.endpoint, event.model);
    const current = coordinatedHealthMany(event.endpoint, event.model, [event.provider])[event.provider] as HealthEvidence;
    const local: LocalEvidence = { health: reduceHealth(current, event), observedAt: event.observedAt };
    cached.local.set(event.provider, local);
    dispatchBackground((async () => {
        // Reuse the event ID on ambiguous RPC failure. A new stub permits retry
        // after a broken RPC connection. Delivery remains explicitly best effort.
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const stub = namespace.get(namespace.idFromName(healthPoolName(event.endpoint, event.model)));
                const result = await stub.observe(event);
                if (result && cached.local.get(event.provider) === local) {
                    if (cached.snapshot && cached.snapshot.version >= result.version && Date.now() - cached.snapshot.publishedAt < HEALTH_SNAPSHOT_MAX_AGE_MS) {
                        cached.local.delete(event.provider);
                    } else {
                        local.health = result.health;
                        local.acceptedVersion = result.version;
                    }
                }
                if (!result) console.warn("routing_health_report_rejected", { endpoint: event.endpoint, model: event.model, provider: event.provider });
                return;
            } catch {
                if (attempt === 1) console.warn("routing_health_report_failed", { endpoint: event.endpoint, model: event.model, provider: event.provider });
            }
        }
    })());
}
export function resetCoordinatedHealthForTests(): void { pools.clear(); }
