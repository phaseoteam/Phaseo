import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";
import { readLocationCache, writeLocationCache } from "@core/tiered-cache";
import { bumpWorkspacePolicyVersion, getWorkspacePolicyVersionToken } from "./workspacePolicy";

// This is routing metadata, not caller authorization. Credentials stay encrypted.
//
// Snapshots are stored under the workspace cache version. Every write to
// workspace_private_models queues a workspace publication (database trigger), whose drain
// bumps that version, and the control routes bump it directly, so a copy can never outlive
// an edit and can live for a day. Without it, a fixed 60 s bound sent every request after a
// quiet minute back to KV or the database (45-68 ms measured on 2026-11-04).
export const PRIVATE_ROUTE_MAX_AGE_MS = 86_400_000;
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
type Snapshot = { version: 2; workspaceId: string; workspaceVersion: string; checkedAt: number; rows: PrivateRouteRow[] };
type Entry = { snapshot?: Snapshot; pending?: Promise<Snapshot | null> };
const entries = new Map<string, Entry>();
export const privateRouteCacheKey = (workspaceId: string, workspaceVersion: string) =>
    `gateway:private-routes:v2:${workspaceId}:${workspaceVersion}`;

function fresh(snapshot: Snapshot, workspaceId: string, workspaceVersion: string): boolean {
    const age = Date.now() - snapshot.checkedAt;
    return snapshot.version === 2 && snapshot.workspaceId === workspaceId &&
        snapshot.workspaceVersion === workspaceVersion && Number.isFinite(age) &&
        age >= 0 && age < PRIVATE_ROUTE_MAX_AGE_MS && Array.isArray(snapshot.rows) &&
        snapshot.rows.length <= MAX_ROWS && snapshot.rows.every(row => row.workspace_id === workspaceId &&
            typeof row.id === "string" && typeof row.model_id === "string" && typeof row.enc_value === "string");
}

// Most workspaces have no private models. That empty snapshot holds no credentials,
// so it alone is shared per location (Workers Cache): a fresh isolate then skips the
// KV read. Snapshots with rows carry encrypted credentials and stay in isolate memory
// and KV.
const emptyLocationKey = (workspaceId: string, workspaceVersion: string) =>
    `${privateRouteCacheKey(workspaceId, workspaceVersion)}:empty`;

function rememberIfEmpty(snapshot: Snapshot, entry: Entry): void {
    if (snapshot.rows.length !== 0 || entries.get(snapshot.workspaceId) !== entry) return;
    const remainingS = Math.floor((PRIVATE_ROUTE_MAX_AGE_MS - (Date.now() - snapshot.checkedAt)) / 1000);
    if (remainingS <= 0) return;
    void writeLocationCache(emptyLocationKey(snapshot.workspaceId, snapshot.workspaceVersion), JSON.stringify(snapshot), remainingS)
        .catch(() => undefined);
}

async function readSnapshot(workspaceId: string, workspaceVersion: string, entry: Entry): Promise<Snapshot | null> {
    const cache = getCache();
    try {
        const raw = await readLocationCache(emptyLocationKey(workspaceId, workspaceVersion));
        if (raw && raw.length <= MAX_BYTES) {
            const value = JSON.parse(raw) as Snapshot;
            if (fresh(value, workspaceId, workspaceVersion) && value.rows.length === 0) return value;
        }
    } catch { /* Fall through to KV. */ }
    try {
        const raw = await cache.get(privateRouteCacheKey(workspaceId, workspaceVersion), { type: "text", cacheTtl: 30 });
        if (raw && raw.length <= MAX_BYTES) {
            const value = JSON.parse(raw) as Snapshot;
            if (fresh(value, workspaceId, workspaceVersion)) {
                rememberIfEmpty(value, entry);
                return value;
            }
        }
    } catch { /* A cache failure requires an authoritative read, never an absent result. */ }
    // The version was read before this listing, so the listing includes every change that
    // version reflects; a later change bumps past it.
    const checkedAt = Date.now();
    const { data, error, count } = await getSupabaseAdmin().from("workspace_private_models")
        .select(PRIVATE_ROUTE_COLUMNS, { count: "exact" }).eq("workspace_id", workspaceId)
        .eq("enabled", true).limit(MAX_ROWS);
    if (error || !data) throw new Error("private_model_lookup_unavailable");
    // Large/incomplete listings use an exact lookup; they cannot prove absence.
    if (count !== data.length) return null;
    const columns = PRIVATE_ROUTE_COLUMNS.split(",");
    const snapshot: Snapshot = { version: 2, workspaceId, workspaceVersion, checkedAt,
        rows: data.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))) as PrivateRouteRow[] };
    if (!fresh(snapshot, workspaceId, workspaceVersion)) throw new Error("private_model_snapshot_invalid");
    const raw = JSON.stringify(snapshot);
    if (raw.length > MAX_BYTES) return null;
    if (entries.get(workspaceId) === entry) {
        dispatchBackground(cache.put(privateRouteCacheKey(workspaceId, workspaceVersion), raw, {
            expirationTtl: Math.floor(PRIVATE_ROUTE_MAX_AGE_MS / 1000),
        }).catch(() => undefined));
        rememberIfEmpty(snapshot, entry);
    }
    return snapshot;
}

export async function loadPrivateRouteRow(args: { workspaceId: string; model: string; disableCache?: boolean }): Promise<PrivateRouteRow | null> {
    // An unreadable workspace version means any cached copy may predate an edit.
    const workspaceVersion = args.disableCache ? null : await getWorkspacePolicyVersionToken(args.workspaceId);
    if (workspaceVersion) {
        let entry = entries.get(args.workspaceId);
        if (!entry) {
            if (entries.size >= MAX_WORKSPACES) entries.delete(entries.keys().next().value!);
            entry = {};
            entries.set(args.workspaceId, entry);
        }
        if (!entry.snapshot || !fresh(entry.snapshot, args.workspaceId, workspaceVersion)) {
            entry.pending ??= readSnapshot(args.workspaceId, workspaceVersion, entry);
            try { entry.snapshot = (await entry.pending) ?? undefined; }
            finally { entry.pending = undefined; }
        }
        if (entries.get(args.workspaceId) !== entry) {
            // An edit invalidated this read while it was in flight.
            return loadPrivateRouteRow({ ...args, disableCache: true });
        }
        if (entry.snapshot && fresh(entry.snapshot, args.workspaceId, workspaceVersion)) {
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

/**
 * Drops this isolate's copy and, by default, bumps the workspace cache version so every
 * location and isolate reloads at once. Pass `bumpVersion: false` when the caller has just
 * bumped it (the publication drain), or for a key-level invalidation, which must not clear
 * every cached context of the workspace; private-model edits still bump through the trigger.
 */
export async function invalidatePrivateRoutes(workspaceId: string, options: { bumpVersion?: boolean } = {}): Promise<void> {
    entries.delete(workspaceId);
    if (options.bumpVersion === false) return;
    await bumpWorkspacePolicyVersion(workspaceId);
}
