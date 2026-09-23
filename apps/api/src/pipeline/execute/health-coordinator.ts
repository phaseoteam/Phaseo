import { dispatchBackground, getBindings } from "@/runtime/env";
import { countOperation } from "@/runtime/request-operations";
import type { Endpoint } from "@core/types";
import type { ProviderHealth } from "./health";
import { healthBatcher } from "./health-batcher";
import {
    emptyHealth, reduceHealth, healthPoolName, HEALTH_SNAPSHOT_MAX_AGE_MS,
    type HealthEvidence, type HealthObservation, type HealthSnapshot,
} from "./health-evidence";

type LocalEvidence = { health: HealthEvidence; observedAt: number; acceptedVersion?: number; acceptedGeneration?: string };
type CachedPool = { snapshot?: HealthSnapshot; refreshAfter: number; pending?: Promise<void>;
    local: Map<string, LocalEvidence> };
const pools = new Map<string, CachedPool>();
const MAX_CACHED_POOLS = 128;
const MAX_LOCAL_PROVIDERS = 64;
let activeRefreshes = 0;
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
    const namespace = getBindings().ROUTING_HEALTH;
    if (!namespace || activeRefreshes >= 32) {
        cached.refreshAfter = Date.now() + 1000;
        return Promise.resolve();
    }
    activeRefreshes++;
    cached.refreshAfter = Date.now() + 30_000;
    cached.pending = Promise.resolve().then(async () => {
        try {
            countOperation("healthRpc");
            const snapshot = await namespace.get(namespace.idFromName(healthPoolName(endpoint, model))).getSnapshot();
            if (snapshot && Number.isFinite(snapshot.version) && Number.isFinite(snapshot.publishedAt) && snapshot.providers &&
                (snapshot.generation !== cached.snapshot?.generation || snapshot.version >= (cached.snapshot?.version ?? 0))) {
                cached.snapshot = { ...snapshot, providers: Object.fromEntries(Object.entries(snapshot.providers)
                    .sort((a, b) => b[1].last_updated - a[1].last_updated).slice(0, MAX_LOCAL_PROVIDERS)) };
                for (const [provider, local] of cached.local) {
                    // Wall-clock publication time cannot establish inclusion:
                    // a slow report may arrive after a newer snapshot was built.
                    if (local.acceptedVersion !== undefined && snapshot.generation === local.acceptedGeneration &&
                        snapshot.version >= local.acceptedVersion && cached.snapshot.providers[provider]) cached.local.delete(provider);
                }
            }
        } catch {
            cached.refreshAfter = Date.now() + 5_000;
            console.warn("routing_health_refresh_failed", { endpoint, model });
        } finally { cached.pending = undefined; activeRefreshes--; }
    });
    return cached.pending;
}
export function coordinatedHealthMany(endpoint: Endpoint, model: string, providers: string[]): Record<string, ProviderHealth> {
    const cached = pool(endpoint, model);
    if (cached.refreshAfter <= Date.now()) dispatchBackground(refresh(endpoint, model, cached));
    const fresh = cached.snapshot && Date.now() - cached.snapshot.publishedAt < HEALTH_SNAPSHOT_MAX_AGE_MS;
    return Object.fromEntries(providers.map(provider => {
        const local = cached.local.get(provider);
        if (local && Date.now() - local.observedAt >= HEALTH_SNAPSHOT_MAX_AGE_MS) cached.local.delete(provider);
        return [provider, { ...(cached.local.get(provider)?.health ?? (fresh ? cached.snapshot?.providers[provider] : undefined) ?? emptyHealth(endpoint, model, provider)) }];
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
    if (!cached.local.has(event.provider) && cached.local.size >= MAX_LOCAL_PROVIDERS) cached.local.delete(cached.local.keys().next().value!);
    cached.local.set(event.provider, local);
    dispatchBackground((async () => {
        try {
            const result = await healthBatcher.enqueue(healthPoolName(event.endpoint, event.model), event, async events => {
                // Recreate the stub in the flushing request's I/O context. Never
                // retain a request-owned stub across coalesced requests.
                // Retry the whole batch once, with the same observation IDs.
                for (let attempt = 0; ; attempt++) {
                    try {
                        countOperation("healthRpc");
                        return await namespace.get(namespace.idFromName(healthPoolName(event.endpoint, event.model))).observeBatch(events);
                    } catch (error) { if (attempt >= 1) throw error; }
                }
            });
            if (result === undefined) { countOperation("healthDropped"); return; }
            if (result && cached.local.get(event.provider) === local) {
                if (cached.snapshot && cached.snapshot.generation === result.generation && cached.snapshot.providers[event.provider] &&
                    cached.snapshot.version >= result.version && Date.now() - cached.snapshot.publishedAt < HEALTH_SNAPSHOT_MAX_AGE_MS) {
                    cached.local.delete(event.provider);
                } else {
                    local.health = result.health;
                    local.acceptedVersion = result.version;
                    local.acceptedGeneration = result.generation;
                }
            }
            if (!result) countOperation("healthDropped");
        } catch { countOperation("healthDropped"); }
    })());
}
export function resetCoordinatedHealthForTests(): void { pools.clear(); }
