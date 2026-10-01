import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";
import { CacheCapacityError, CacheInvalidatedError, L1Cache } from "@/runtime/cache/l1";

// This is routing metadata, not caller authorization. Credentials stay encrypted.
export const PRIVATE_ROUTE_MAX_AGE_MS = 60_000;
const MAX_WORKSPACES = 128;
const MAX_ROWS = 1_000;
const MAX_BYTES = 64_000;
export const PRIVATE_ROUTE_COLUMNS = "id,workspace_id,model_id,base_url,upstream_model_id,supports_responses,input_modalities,output_modalities,context_length,max_output_tokens,catalog_model_id,host_provider_id,custom_provider_name,routing_policy,provider_id,enc_value,enc_iv,enc_tag,key_version,enc_aad_version,fingerprint_sha256";
export type PrivateRouteRow = {
    id: string; workspace_id: string; model_id: string; base_url: string; upstream_model_id: string;
    supports_responses: boolean; input_modalities: string[] | null; output_modalities: string[] | null;
    context_length: number | null; max_output_tokens: number | null; catalog_model_id: string | null;
    host_provider_id: string | null; custom_provider_name: string | null;
    routing_policy: "preferred" | "balanced" | "fallback"; provider_id: string;
    enc_value: string; enc_iv: string; enc_tag: string; key_version: number;
    enc_aad_version: number; fingerprint_sha256: string;
};
type Snapshot = { version: 1; workspaceId: string; checkedAt: number; rows: PrivateRouteRow[] };
const entries = new L1Cache<string | null>({
    namespace: "private-routes", maxEntries: MAX_WORKSPACES, maxBytes: 4 * 1024 * 1024,
    maxEntryBytes: 132_000, maxPending: 32,
    sizeOf: (raw, key) => 128 + 2 * (key.length + (raw?.length ?? 0)),
});
const writes = new Map<string, Promise<void>>();
let epoch = 0, activeInvalidations = 0, bypassUntil = 0, exactReads = 0;
export const privateRouteCacheStats = () => ({ ...entries.stats(), writes: writes.size, exactReads });
export const privateRouteCacheKey = (workspaceId: string) => `gateway:private-routes:v1:${workspaceId}`;

function fresh(snapshot: Snapshot, workspaceId: string): boolean {
    if (!snapshot || typeof snapshot !== "object") return false;
    const age = Date.now() - snapshot.checkedAt;
    return snapshot.version === 1 && snapshot.workspaceId === workspaceId && Number.isFinite(age) &&
        age >= 0 && age < PRIVATE_ROUTE_MAX_AGE_MS && Array.isArray(snapshot.rows) &&
        snapshot.rows.length <= MAX_ROWS && snapshot.rows.every(row => row && row.workspace_id === workspaceId &&
            typeof row.id === "string" && typeof row.model_id === "string" && typeof row.enc_value === "string");
}

async function readSnapshot(workspaceId: string): Promise<{ value: string | null; expiresAtMs: number }> {
    const startedEpoch = epoch;
    const cache = getCache();
    try {
        const raw = await cache.get(privateRouteCacheKey(workspaceId), { type: "text", cacheTtl: 30 });
        if (raw && raw.length <= MAX_BYTES) {
            const value = JSON.parse(raw) as Snapshot;
            if (fresh(value, workspaceId)) return { value: raw, expiresAtMs: value.checkedAt + PRIVATE_ROUTE_MAX_AGE_MS };
        }
    } catch { /* A cache failure requires an authoritative read, never an absent result. */ }
    const checkedAt = Date.now();
    const { data, error, count } = await getSupabaseAdmin().from("workspace_private_models")
        .select(PRIVATE_ROUTE_COLUMNS, { count: "exact" }).eq("workspace_id", workspaceId)
        .eq("enabled", true).limit(MAX_ROWS);
    if (error || !data) throw new Error("private_model_lookup_unavailable");
    // Large/incomplete listings use an exact lookup; they cannot prove absence.
    if (count !== data.length) return { value: null, expiresAtMs: Date.now() };
    const columns = PRIVATE_ROUTE_COLUMNS.split(",");
    const snapshot: Snapshot = { version: 1, workspaceId, checkedAt,
        rows: data.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))) as PrivateRouteRow[] };
    if (!fresh(snapshot, workspaceId)) throw new Error("private_model_snapshot_invalid");
    const raw = JSON.stringify(snapshot);
    if (raw.length > MAX_BYTES) return { value: null, expiresAtMs: Date.now() };
    if (startedEpoch === epoch && !activeInvalidations && Date.now() >= bypassUntil && writes.size < 32 && !writes.has(workspaceId)) {
        // Track in-flight fills so a local delete cannot be undone by a late put.
        const write = Promise.resolve().then(() => {
            if (startedEpoch !== epoch) return;
            return cache.put(privateRouteCacheKey(workspaceId), raw, { expirationTtl: 60 });
        }).catch(() => undefined).finally(() => {
            if (writes.get(workspaceId) === write) writes.delete(workspaceId);
        });
        writes.set(workspaceId, write);
        dispatchBackground(write);
    }
    return { value: raw, expiresAtMs: checkedAt + PRIVATE_ROUTE_MAX_AGE_MS };
}

export async function loadPrivateRouteRow(args: { workspaceId: string; model: string; disableCache?: boolean }): Promise<PrivateRouteRow | null> {
    if (!args.disableCache && !activeInvalidations && Date.now() >= bypassUntil) {
        try {
            const raw = await entries.getOrLoad(args.workspaceId, () => readSnapshot(args.workspaceId));
            if (raw) {
                const snapshot = JSON.parse(raw) as Snapshot;
                if (fresh(snapshot, args.workspaceId)) return snapshot.rows.find(row => row.model_id === args.model) ?? null;
            }
        } catch (error) {
            // Only an invalidation race gets an exact source retry. Errors and
            // capacity exhaustion must not amplify database traffic.
            if (!(error instanceof CacheInvalidatedError)) throw error;
        }
    }
    if (exactReads >= 32) throw new CacheCapacityError();
    exactReads++;
    try {
    const { data, error } = await getSupabaseAdmin().from("workspace_private_models")
        .select(PRIVATE_ROUTE_COLUMNS).eq("workspace_id", args.workspaceId)
        .eq("model_id", args.model).eq("enabled", true).maybeSingle();
    if (error) throw new Error("private_model_lookup_unavailable");
    if (data && data.workspace_id !== args.workspaceId) throw new Error("private_model_snapshot_invalid");
    return data as PrivateRouteRow | null;
    } finally { exactReads--; }
}

export async function invalidatePrivateRoutes(workspaceId: string, options?: { requirePublication: boolean }): Promise<void> {
    epoch++;
    entries.invalidate(workspaceId);
    activeInvalidations++;
    // Other locations may retain a copy, but its absolute age is still enforced.
    try {
        await writes.get(workspaceId);
        await getCache().delete(privateRouteCacheKey(workspaceId));
    }
    catch {
        // An unsuccessful delete cannot make this isolate trust old KV data.
        // One bounded global deadline avoids a growing per-workspace failure map.
        bypassUntil = Math.max(bypassUntil, Date.now() + PRIVATE_ROUTE_MAX_AGE_MS);
        entries.clear();
        console.warn("private_route_cache_invalidation_failed", { workspaceId });
        if (options?.requirePublication) throw new Error("private_route_cache_invalidation_failed");
    } finally { activeInvalidations--; }
}
