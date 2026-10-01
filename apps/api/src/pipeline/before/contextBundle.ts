import { z } from "zod";
import { dispatchBackground, getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { publicCatalogSchema as catalogSchema, isPublicCatalogFresh as fresh, type PublicCatalogSnapshot } from "./publicCatalogSnapshot";
import { PublicCatalogCache, publicCatalogEndpoints, publicCatalogKey } from "./publicCatalogCache";
import { fetchWorkspaceRuntime, refillWorkspaceRuntime, workspaceRuntimeCache, workspaceRuntimeEnabled } from "./workspaceRuntime";
import { isWorkspaceRuntimeFresh, workspaceRuntimeSchema, type WorkspaceRuntimeSnapshot } from "./workspaceRuntimeSnapshot";
import { getWorkspacePolicyVersionToken } from "./workspacePolicy";
import { contextSchema, providerSchema, priceCardSchema } from "./schemas";
import { hasConfiguredKeyLimits } from "./context.shared";
import type { GatewayContextData } from "./types";
export { publicCatalogEndpoints, publicCatalogKey } from "./publicCatalogCache";
export { PUBLIC_CATALOG_MAX_AGE_MS, type PublicCatalogSnapshot } from "./publicCatalogSnapshot";

const record = z.record(z.string(), z.unknown());
/** Request-owned admission already read from the key/version cache. Never
 * published with the catalog, and never renewed by a public/workspace refill. */
export type CachedContextAdmission = {
    apiKeyId: string;
    expiresAtMs: number;
    value: Pick<GatewayContextData, "workspaceId" | "key" | "keyLimit" | "credit" | "teamEnrichment" | "keyEnrichment">;
};
export type ContextBundle = {
    variants: { endpoint: string; payload: Record<string, unknown> }[];
    catalog: PublicCatalogSnapshot;
    settings: Record<string, unknown>;
    billingMode: string;
    cacheStatus: "hit" | "miss" | "bypass";
    catalogReadMs: number;
    rpcMs: number;
    workspaceRuntimeExpiresAt?: number;
    /** Request-owned source data; never embedded in cached compositions. */
    workspaceRuntime?: WorkspaceRuntimeSnapshot;
    workspaceCacheStatus?: "hit" | "miss" | "bypass";
    workspaceReadMs?: number;
    admission?: CachedContextAdmission;
};
const publicCatalog = new PublicCatalogCache(
    () => typeof caches === "undefined" ? undefined : caches.default,
    () => getBindingsIfConfigured()?.GATEWAY_PUBLIC_BASE_URL,
);
// Only read-through refills join this map. A mutation publication must never
// join an older source read. Resolved data lives only in the bounded cache.
const catalogRefills = new Map<string, Promise<PublicCatalogSnapshot>>();

async function refillPublicCatalog(model: string, endpoints: string[], disableCache?: boolean): Promise<PublicCatalogSnapshot> {
    const load = async () => {
        const result = await getSupabaseAdmin().rpc("gateway_fetch_public_catalog", { p_model: model, p_endpoints: endpoints });
        if (result.error) throw new Error("gateway_public_catalog_refresh_failed");
        const catalog = catalogSchema.parse(result.data);
        if (!fresh(catalog, model, endpoints)) throw new Error("gateway_public_catalog_changed_during_request");
        if (!disableCache) dispatchBackground(publishPublicCatalog(catalog).catch(() => false));
        return catalog;
    };
    if (disableCache) return load();
    const key = publicCatalogKey(model, endpoints);
    let pending = catalogRefills.get(key);
    if (!pending) {
        if (catalogRefills.size >= 32) throw new Error("gateway_public_catalog_refill_capacity");
        pending = load().finally(() => { if (catalogRefills.get(key) === pending) catalogRefills.delete(key); });
        catalogRefills.set(key, pending);
    }
    return structuredClone(await pending);
}

export function contextBundleEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_CONTEXT_BUNDLE_ENABLED === "true";
}

export async function publishPublicCatalog(input: unknown, expected?: { model: string; endpoints: string[] }): Promise<boolean> {
    return publicCatalog.publish(input, expected);
}

export function parseContextBundleVariant(bundle: ContextBundle, variant: ContextBundle["variants"][number]): GatewayContextData {
    if (!bundle.admission) return contextSchema.parse(variant.payload);
    if (bundle.admission.expiresAtMs <= Date.now()) throw new Error("cached_admission_expired");
    // Parse only public routing fields; never synthesize permissive gate checks
    // or round-trip transformed admission through a source-wire schema.
    return {
        ...structuredClone(bundle.admission.value), resolvedModel: bundle.catalog.resolvedModel, preset: null,
        providers: z.array(providerSchema).parse(variant.payload.providers),
        pricing: z.record(z.string(), priceCardSchema).parse(variant.payload.pricing),
    };
}

export async function loadTextContextBundle(args: {
    workspaceId: string; apiKeyId: string; model: string; endpoint: string; disableCache?: boolean;
    /** Diagnostics: exercise Cache API without reusing this isolate's snapshot. */
    skipCatalogMemoryCache?: boolean;
    /** Reuse the context/policy marker already read by the caller. Unknown skips caching. */
    workspaceVersionToken?: string | null;
    cachedAdmission?: CachedContextAdmission;
}): Promise<ContextBundle> {
    const useWorkspaceRuntime = workspaceRuntimeEnabled();
    const workspaceVersion = !useWorkspaceRuntime || args.disableCache ? null
        : args.workspaceVersionToken !== undefined ? args.workspaceVersionToken
            : await getWorkspacePolicyVersionToken(args.workspaceId).catch(() => null);
    const admission = args.cachedAdmission;
    if (admission && (!useWorkspaceRuntime || args.disableCache || workspaceVersion === null ||
        admission.apiKeyId !== args.apiKeyId || admission.value.workspaceId !== args.workspaceId ||
        !Number.isFinite(admission.expiresAtMs) || admission.expiresAtMs <= Date.now() ||
        hasConfiguredKeyLimits(admission.value.keyLimit))) throw new Error("cached_admission_invalid");
    const endpoints = publicCatalogEndpoints(args.endpoint);
    const cacheStarted = performance.now();
    let catalogReadMs = 0;
    let workspaceReadMs = 0;
    let [catalog, workspace] = await Promise.all([
        (args.disableCache ? Promise.resolve(null) : publicCatalog.read(args.model, endpoints, args.skipCatalogMemoryCache))
            .then(value => { catalogReadMs = performance.now() - cacheStarted; return value; }),
        (workspaceVersion === null ? Promise.resolve(null) : workspaceRuntimeCache.read(args.workspaceId, workspaceVersion))
            .then(value => { workspaceReadMs = performance.now() - cacheStarted; return value; }),
    ]);
    const cacheStatus = args.disableCache ? "bypass" : catalog ? "hit" : "miss";
    const rpcStarted = performance.now();
    const workspaceCacheStatus = workspaceVersion === null ? "bypass" : workspace ? "hit" : "miss";
    const { data, error } = admission ? { data: null, error: null } : await getSupabaseAdmin().rpc(useWorkspaceRuntime ? "gateway_fetch_request_context_bundle_v2" : "gateway_fetch_request_context_bundle", {
        workspace_id: args.workspaceId, api_key_id: args.apiKeyId, model: args.model,
        endpoint: args.endpoint, include_catalog: !catalog,
        ...(useWorkspaceRuntime ? { include_workspace: !workspace } : {}),
    });
    if (error) throw new Error(`gateway_context_bundle_error:${error.message ?? "unknown"}`);
    let rpcMs = performance.now() - rpcStarted;
    const legacySchema = z.object({
        context: record, byok: z.record(z.string(), z.array(record)), settings: record,
        billingMode: z.enum(["wallet", "invoice"]), catalog: catalogSchema.nullable(),
    });
    let bundle: z.infer<typeof legacySchema>;
    if (useWorkspaceRuntime) {
        const value = admission
            ? { context: { workspace_id: args.workspaceId } as Record<string, unknown>, workspaceRuntime: null, catalog: null }
            : z.object({ context: record, workspaceRuntime: workspaceRuntimeSchema.nullable(), catalog: catalogSchema.nullable() }).parse(data);
        if (value.context.workspace_id !== args.workspaceId) throw new Error("gateway_context_bundle_workspace_mismatch");
        if (!workspace || !isWorkspaceRuntimeFresh(workspace, args.workspaceId)) {
            if (value.workspaceRuntime && isWorkspaceRuntimeFresh(value.workspaceRuntime, args.workspaceId)) workspace = value.workspaceRuntime;
            else {
                const started = performance.now();
                workspace = workspaceVersion === null ? await fetchWorkspaceRuntime(args.workspaceId)
                    : await refillWorkspaceRuntime(args.workspaceId, workspaceVersion);
                rpcMs += performance.now() - started;
            }
            if (workspaceVersion !== null) dispatchBackground(workspaceRuntimeCache.publish(workspace, args.workspaceId, workspaceVersion).catch(() => false));
        }
        bundle = { context: value.context, catalog: value.catalog, settings: workspace.settings, billingMode: workspace.billingMode, byok: workspace.byok };
    } else bundle = legacySchema.parse(data);
    if (bundle.context.workspace_id !== args.workspaceId) throw new Error("gateway_context_bundle_workspace_mismatch");
    // Alias edits or a deadline crossed while loading access require a fresh
    // catalog. Never use another model's routes or re-age a stale snapshot.
    if (!catalog || !fresh(catalog, args.model, endpoints) || (!admission && catalog.resolvedModel !== bundle.context.resolved_model)) {
        let publish = false;
        if (bundle.catalog && fresh(bundle.catalog, args.model, endpoints)) { catalog = bundle.catalog; publish = true; }
        else {
            const refreshStarted = performance.now();
            catalog = await refillPublicCatalog(args.model, endpoints, args.disableCache);
            rpcMs += performance.now() - refreshStarted;
        }
        if (!fresh(catalog, args.model, endpoints) || (!admission && catalog.resolvedModel !== bundle.context.resolved_model)) {
            console.warn("gateway_public_catalog_rejected", {
                checkedAgeMs: Date.now() - catalog.checkedAt,
                remainingMs: catalog.expiresAt - Date.now(),
                lifetimeMs: catalog.expiresAt - catalog.checkedAt,
                modelMatches: catalog.model === args.model,
                resolvedModelMatches: catalog.resolvedModel === bundle.context.resolved_model,
                endpointsMatch: JSON.stringify(catalog.endpoints) === JSON.stringify(endpoints),
                variantsMatch: catalog.variants.length === endpoints.length && catalog.variants.every((variant, index) => variant.endpoint === endpoints[index]),
            });
            throw new Error("gateway_public_catalog_changed_during_request");
        }
        if (publish && !args.disableCache) dispatchBackground(publishPublicCatalog(catalog).catch(() => false));
    }
    if (useWorkspaceRuntime && (!workspace || !isWorkspaceRuntimeFresh(workspace, args.workspaceId))) {
        throw new Error("workspace_runtime_changed_during_request");
    }
    if (admission && admission.expiresAtMs <= Date.now()) throw new Error("cached_admission_expired");
    return {
        ...(admission ? { admission } : {}),
        catalog, settings: bundle.settings, billingMode: bundle.billingMode, cacheStatus, catalogReadMs, rpcMs,
        ...(useWorkspaceRuntime && workspace ? { workspaceRuntime: workspace, workspaceRuntimeExpiresAt: workspace.expiresAtMs, workspaceCacheStatus, workspaceReadMs } : {}),
        variants: catalog.variants.map(variant => ({ endpoint: variant.endpoint, payload: {
            ...bundle.context, pricing: structuredClone(variant.pricing),
            providers: variant.providers.map(provider => ({
                ...structuredClone(provider),
                byok_meta: structuredClone(bundle.byok[String(provider.provider_id)] ?? []),
            })),
        } })),
    };
}
