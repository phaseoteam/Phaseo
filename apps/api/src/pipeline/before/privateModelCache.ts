import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";

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
type Entry = { snapshot?: Snapshot; pending?: Promise<Snapshot | null> };
const entries = new Map<string, Entry>();
export const privateRouteCacheKey = (workspaceId: string) => `gateway:private-routes:v1:${workspaceId}`;

function fresh(snapshot: Snapshot, workspaceId: string): boolean {
    const age = Date.now() - snapshot.checkedAt;
    return snapshot.version === 1 && snapshot.workspaceId === workspaceId && Number.isFinite(age) &&
        age >= 0 && age < PRIVATE_ROUTE_MAX_AGE_MS && Array.isArray(snapshot.rows) &&
        snapshot.rows.length <= MAX_ROWS && snapshot.rows.every(row => row.workspace_id === workspaceId &&
            typeof row.id === "string" && typeof row.model_id === "string" && typeof row.enc_value === "string");
}

async function readSnapshot(workspaceId: string, entry: Entry): Promise<Snapshot | null> {
    const cache = getCache();
    try {
        const raw = await cache.get(privateRouteCacheKey(workspaceId), { type: "text", cacheTtl: 30 });
        if (raw && raw.length <= MAX_BYTES) {
            const value = JSON.parse(raw) as Snapshot;
            if (fresh(value, workspaceId)) return value;
        }
    } catch { /* A cache failure requires an authoritative read, never an absent result. */ }
    const checkedAt = Date.now();
    const { data, error, count } = await getSupabaseAdmin().from("workspace_private_models")
        .select(PRIVATE_ROUTE_COLUMNS, { count: "exact" }).eq("workspace_id", workspaceId)
        .eq("enabled", true).limit(MAX_ROWS);
    if (error || !data) throw new Error("private_model_lookup_unavailable");
    // Large/incomplete listings use an exact lookup; they cannot prove absence.
    if (count !== data.length) return null;
    const columns = PRIVATE_ROUTE_COLUMNS.split(",");
    const snapshot: Snapshot = { version: 1, workspaceId, checkedAt,
        rows: data.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))) as PrivateRouteRow[] };
    if (!fresh(snapshot, workspaceId)) throw new Error("private_model_snapshot_invalid");
    const raw = JSON.stringify(snapshot);
    if (raw.length > MAX_BYTES) return null;
    if (entries.get(workspaceId) === entry) {
        dispatchBackground(cache.put(privateRouteCacheKey(workspaceId), raw, { expirationTtl: 60 })
            .catch(() => undefined));
    }
    return snapshot;
}

export async function loadPrivateRouteRow(args: { workspaceId: string; model: string; disableCache?: boolean }): Promise<PrivateRouteRow | null> {
    if (!args.disableCache) {
        let entry = entries.get(args.workspaceId);
        if (!entry) {
            if (entries.size >= MAX_WORKSPACES) entries.delete(entries.keys().next().value!);
            entry = {};
            entries.set(args.workspaceId, entry);
        }
        if (!entry.snapshot || !fresh(entry.snapshot, args.workspaceId)) {
            entry.pending ??= readSnapshot(args.workspaceId, entry);
            try { entry.snapshot = (await entry.pending) ?? undefined; }
            finally { entry.pending = undefined; }
        }
        if (entries.get(args.workspaceId) !== entry) {
            // An edit invalidated this read while it was in flight.
            return loadPrivateRouteRow({ ...args, disableCache: true });
        }
        if (entry.snapshot && fresh(entry.snapshot, args.workspaceId)) {
            const row = entry.snapshot.rows.find(row => row.model_id === args.model);
            return row ? structuredClone(row) : null;
        }
    }
    const { data, error } = await getSupabaseAdmin().from("workspace_private_models")
        .select(PRIVATE_ROUTE_COLUMNS).eq("workspace_id", args.workspaceId)
        .eq("model_id", args.model).eq("enabled", true).maybeSingle();
    if (error) throw new Error("private_model_lookup_unavailable");
    if (data && data.workspace_id !== args.workspaceId) throw new Error("private_model_snapshot_invalid");
    return data as PrivateRouteRow | null;
}

export async function invalidatePrivateRoutes(workspaceId: string): Promise<void> {
    entries.delete(workspaceId);
    // Other locations may retain a copy, but its absolute age is still enforced.
    try { await getCache().delete(privateRouteCacheKey(workspaceId)); }
    catch { console.warn("private_route_cache_invalidation_failed", { workspaceId }); }
}
