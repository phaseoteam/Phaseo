import { z } from "zod";
import { getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { knownCatalogueRevision } from "@core/catalogue-revision";
import { invalidateTieredL1, tieredReadDetailed, writeTiered } from "@core/tiered-cache";

/**
 * Model catalogue data is always served from cache, stale-while-revalidate.
 * A snapshot stays usable until the next scheduled catalogue boundary (route,
 * capability or price activation/expiry). When a boundary is near, the loader
 * also fetches the post-boundary snapshot so readers switch exactly on time
 * without a database read. Catalogue edits are picked up in the background by
 * comparing the snapshot revision with the published catalogue revision.
 */
const NEXT_SNAPSHOT_PREFETCH_MS = 15 * 60_000;
// Used only when no catalogue revision has been published (staging).
const UNPUBLISHED_REVISION_REFRESH_S = 300;
const MAX_ENTRY_BYTES = 512_000;
const CATALOG_KEY_PREFIX = "gateway:public-catalog:v2:";
const record = z.record(z.string(), z.unknown());
const publicProvider = record.refine(row =>
    typeof row.provider_id === "string" && typeof row.api_model_id === "string" &&
    Array.isArray(row.byok_meta) && row.byok_meta.length === 0 &&
    !["workspace_id", "private_endpoint", "key", "api_key", "enc_value"].some(key => key in row),
"Public catalog contains invalid or private provider data");
const catalogSchema = z.object({
    version: z.literal(1), model: z.string(), resolvedModel: z.string(), endpoints: z.array(z.string()).min(1).max(2),
    checkedAt: z.number().finite(), expiresAt: z.number().finite(),
    variants: z.array(z.object({ endpoint: z.string(), providers: z.array(publicProvider), pricing: record }).strict()).min(1).max(2),
    providerRows: z.array(record), routeModes: z.array(record),
    revision: z.string().nullable(),
    boundaryAt: z.number().finite().nullable(),
}).strict();
const entrySchema = z.object({ current: catalogSchema, next: catalogSchema.nullable() }).strict();
export type PublicCatalogSnapshot = z.infer<typeof catalogSchema>;
type CatalogEntry = z.infer<typeof entrySchema>;
export type ContextBundle = {
    variants: { endpoint: string; payload: Record<string, unknown> }[];
    catalog: PublicCatalogSnapshot;
    settings: Record<string, unknown>;
    billingMode: string;
    cacheStatus: "hit" | "miss" | "bypass";
    catalogReadMs: number;
    rpcMs: number;
};
export const publicCatalogEndpoints = (endpoint: string): string[] =>
    endpoint === "text.generate" ? [endpoint] : ["text.generate", endpoint];
export const publicCatalogKey = (model: string, endpoints: string[]) =>
    `${CATALOG_KEY_PREFIX}${JSON.stringify([model, endpoints])}`;

export function contextBundleEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_CONTEXT_BUNDLE_ENABLED === "true";
}

function matches(snapshot: PublicCatalogSnapshot, model: string, endpoints: string[]): boolean {
    return snapshot.model === model &&
        JSON.stringify(snapshot.endpoints) === JSON.stringify(endpoints) &&
        snapshot.variants.length === endpoints.length &&
        snapshot.variants.every((variant, index) => variant.endpoint === endpoints[index]);
}

function covers(snapshot: PublicCatalogSnapshot, now: number): boolean {
    return snapshot.checkedAt <= now && (snapshot.boundaryAt === null || now < snapshot.boundaryAt);
}

/** The snapshot valid at `now`, or `null` when a boundary passed without a prefetched successor. */
export function selectCatalogSnapshot(entry: CatalogEntry, now = Date.now()): PublicCatalogSnapshot | null {
    if (covers(entry.current, now)) return entry.current;
    if (entry.next && covers(entry.next, now)) return entry.next;
    return null;
}

function hasPublicProviders(entry: CatalogEntry | null): boolean {
    return Boolean(entry?.current.variants.some(variant => variant.providers.length > 0));
}

async function fetchSnapshot(model: string, endpoints: string[], at: number): Promise<PublicCatalogSnapshot> {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_fetch_public_catalog_at", {
        p_model: model, p_endpoints: endpoints, p_at: new Date(at).toISOString(),
    });
    if (error) throw new Error("gateway_public_catalog_refresh_failed");
    const snapshot = catalogSchema.parse(data);
    if (!matches(snapshot, model, endpoints)) throw new Error("gateway_public_catalog_mismatch");
    return snapshot;
}

export async function fetchCatalogEntry(model: string, endpoints: string[]): Promise<CatalogEntry> {
    const current = await fetchSnapshot(model, endpoints, Date.now());
    const next = current.boundaryAt !== null && current.boundaryAt - Date.now() <= NEXT_SNAPSHOT_PREFETCH_MS
        ? await fetchSnapshot(model, endpoints, current.boundaryAt)
        : null;
    return { current, next };
}

function catalogCacheOptions(model: string, endpoints: string[]) {
    return {
        key: publicCatalogKey(model, endpoints),
        loader: () => fetchCatalogEntry(model, endpoints),
        l1FreshMs: 30_000,
        l2: { freshS: 60, storeS: 86_400 },
        l3: { freshS: UNPUBLISHED_REVISION_REFRESH_S },
        validate: (value: unknown): value is CatalogEntry => {
            const parsed = entrySchema.safeParse(value);
            return parsed.success && matches(parsed.data.current, model, endpoints) &&
                JSON.stringify(parsed.data).length <= MAX_ENTRY_BYTES;
        },
        isUsable: (entry: CatalogEntry) => selectCatalogSnapshot(entry) !== null,
        isFreshInL3: (entry: CatalogEntry) => {
            const now = Date.now();
            if (selectCatalogSnapshot(entry, now) !== entry.current) return false;
            const boundaryAt = entry.current.boundaryAt;
            if (boundaryAt !== null && !entry.next && boundaryAt - now <= NEXT_SNAPSHOT_PREFETCH_MS) return false;
            const revision = knownCatalogueRevision();
            return revision === null ? undefined : entry.current.revision === revision;
        },
        // Unknown or hidden names can be workspace-private model identifiers;
        // keep them out of the shared layers.
        isShareable: (entry: CatalogEntry | null) => hasPublicProviders(entry),
    };
}

async function readCatalogEntry(model: string, endpoints: string[]): Promise<{ entry: CatalogEntry | null; loaded: boolean }> {
    // Starts (or reuses) the background revision refresh before freshness is checked.
    knownCatalogueRevision();
    const result = await tieredReadDetailed<CatalogEntry>(catalogCacheOptions(model, endpoints));
    return { entry: result.value, loaded: result.source === "loader" };
}

/** Replaces the cached entry everywhere after an authoritative reload. */
async function rememberCatalogEntry(model: string, endpoints: string[], entry: CatalogEntry): Promise<void> {
    const options = catalogCacheOptions(model, endpoints);
    invalidateTieredL1(options.key);
    if (!hasPublicProviders(entry)) return;
    await writeTiered({ key: options.key, l2: options.l2, l3: options.l3 }, entry);
}

export async function loadTextContextBundle(args: {
    workspaceId: string; apiKeyId: string; model: string; endpoint: string; disableCache?: boolean;
    /** Diagnostics: exercise shared layers without reusing this isolate's snapshot. */
    skipCatalogMemoryCache?: boolean;
}): Promise<ContextBundle> {
    const endpoints = publicCatalogEndpoints(args.endpoint);
    const cacheStarted = performance.now();
    if (args.skipCatalogMemoryCache) invalidateTieredL1(publicCatalogKey(args.model, endpoints));
    let catalogReadMs = 0;
    // The workspace-scoped RPC and the catalogue lookup are independent; on a
    // warm isolate the catalogue resolves from memory without any I/O.
    const catalogPromise = (args.disableCache
        ? fetchCatalogEntry(args.model, endpoints).then(entry => ({ entry, loaded: true }))
        : readCatalogEntry(args.model, endpoints)
    ).then(result => {
        catalogReadMs = performance.now() - cacheStarted;
        return result;
    });
    const rpcStarted = performance.now();
    const bundlePromise = getSupabaseAdmin().rpc("gateway_fetch_request_context_bundle", {
        workspace_id: args.workspaceId, api_key_id: args.apiKeyId, model: args.model,
        endpoint: args.endpoint, include_catalog: false,
    }).then(result => ({ ...result, ms: performance.now() - rpcStarted }));
    const [{ entry, loaded }, rpc] = await Promise.all([catalogPromise, bundlePromise]);
    if (rpc.error) throw new Error(`gateway_context_bundle_error:${rpc.error.message ?? "unknown"}`);
    let rpcMs = rpc.ms;
    const bundle = z.object({
        context: record, byok: z.record(z.string(), z.array(record)), settings: record,
        billingMode: z.enum(["wallet", "invoice"]), catalog: z.unknown(),
    }).parse(rpc.data);
    if (bundle.context.workspace_id !== args.workspaceId) throw new Error("gateway_context_bundle_workspace_mismatch");

    let catalog = entry ? selectCatalogSnapshot(entry) : null;
    const cacheStatus = args.disableCache ? "bypass" : catalog && !loaded ? "hit" : "miss";
    // An alias edit can move the model before the background revalidation
    // lands. Never use another model's routes: reload authoritatively.
    if (!catalog || catalog.resolvedModel !== bundle.context.resolved_model) {
        const refreshStarted = performance.now();
        const reloaded = await fetchCatalogEntry(args.model, endpoints);
        rpcMs += performance.now() - refreshStarted;
        catalog = selectCatalogSnapshot(reloaded);
        if (!catalog || catalog.resolvedModel !== bundle.context.resolved_model) {
            throw new Error("gateway_public_catalog_changed_during_request");
        }
        if (!args.disableCache) await rememberCatalogEntry(args.model, endpoints, reloaded).catch(() => undefined);
    }
    const selected = catalog;
    return {
        catalog: selected, settings: bundle.settings, billingMode: bundle.billingMode, cacheStatus, catalogReadMs, rpcMs,
        variants: selected.variants.map(variant => ({ endpoint: variant.endpoint, payload: {
            ...bundle.context, pricing: structuredClone(variant.pricing),
            providers: variant.providers.map(provider => ({
                ...structuredClone(provider),
                byok_meta: structuredClone(bundle.byok[String(provider.provider_id)] ?? []),
            })),
        } })),
    };
}
