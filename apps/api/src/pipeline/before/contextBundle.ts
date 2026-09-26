import { z } from "zod";
import { dispatchBackground, getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { publicCatalogSchema as catalogSchema, isPublicCatalogFresh as fresh, type PublicCatalogSnapshot } from "./publicCatalogSnapshot";
import { PublicCatalogCache, publicCatalogEndpoints } from "./publicCatalogCache";
export { publicCatalogEndpoints, publicCatalogKey } from "./publicCatalogCache";
export { PUBLIC_CATALOG_MAX_AGE_MS, type PublicCatalogSnapshot } from "./publicCatalogSnapshot";

const record = z.record(z.string(), z.unknown());
export type ContextBundle = {
    variants: { endpoint: string; payload: Record<string, unknown> }[];
    catalog: PublicCatalogSnapshot;
    settings: Record<string, unknown>;
    billingMode: string;
    cacheStatus: "hit" | "miss" | "bypass";
    catalogReadMs: number;
    rpcMs: number;
};
const publicCatalog = new PublicCatalogCache(
    () => typeof caches === "undefined" ? undefined : caches.default,
    () => getBindingsIfConfigured()?.GATEWAY_PUBLIC_BASE_URL,
);

export function contextBundleEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_CONTEXT_BUNDLE_ENABLED === "true";
}

export async function publishPublicCatalog(input: unknown, expected?: { model: string; endpoints: string[] }): Promise<boolean> {
    return publicCatalog.publish(input, expected);
}

export async function loadTextContextBundle(args: {
    workspaceId: string; apiKeyId: string; model: string; endpoint: string; disableCache?: boolean;
    /** Diagnostics: exercise Cache API without reusing this isolate's snapshot. */
    skipCatalogMemoryCache?: boolean;
}): Promise<ContextBundle> {
    const endpoints = publicCatalogEndpoints(args.endpoint);
    const cacheStarted = performance.now();
    let catalog = args.disableCache ? null : await publicCatalog.read(args.model, endpoints, args.skipCatalogMemoryCache);
    const catalogReadMs = performance.now() - cacheStarted;
    const cacheStatus = args.disableCache ? "bypass" : catalog ? "hit" : "miss";
    const rpcStarted = performance.now();
    const { data, error } = await getSupabaseAdmin().rpc("gateway_fetch_request_context_bundle", {
        workspace_id: args.workspaceId, api_key_id: args.apiKeyId, model: args.model,
        endpoint: args.endpoint, include_catalog: !catalog,
    });
    if (error) throw new Error(`gateway_context_bundle_error:${error.message ?? "unknown"}`);
    let rpcMs = performance.now() - rpcStarted;
    const bundle = z.object({
        context: record, byok: z.record(z.string(), z.array(record)), settings: record,
        billingMode: z.enum(["wallet", "invoice"]), catalog: catalogSchema.nullable(),
    }).parse(data);
    if (bundle.context.workspace_id !== args.workspaceId) throw new Error("gateway_context_bundle_workspace_mismatch");
    // Alias edits or a deadline crossed while loading access require a fresh
    // catalog. Never use another model's routes or re-age a stale snapshot.
    if (!catalog || !fresh(catalog, args.model, endpoints) || catalog.resolvedModel !== bundle.context.resolved_model) {
        if (bundle.catalog && fresh(bundle.catalog, args.model, endpoints)) catalog = bundle.catalog;
        else {
            const refreshStarted = performance.now();
            const refreshed = await getSupabaseAdmin().rpc("gateway_fetch_public_catalog", { p_model: args.model, p_endpoints: endpoints });
            rpcMs += performance.now() - refreshStarted;
            if (refreshed.error) throw new Error("gateway_public_catalog_refresh_failed");
            catalog = catalogSchema.parse(refreshed.data);
        }
        if (!fresh(catalog, args.model, endpoints) || catalog.resolvedModel !== bundle.context.resolved_model) {
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
        if (!args.disableCache) dispatchBackground(publishPublicCatalog(catalog).catch(() => false));
    }
    return {
        catalog, settings: bundle.settings, billingMode: bundle.billingMode, cacheStatus, catalogReadMs, rpcMs,
        variants: catalog.variants.map(variant => ({ endpoint: variant.endpoint, payload: {
            ...bundle.context, pricing: structuredClone(variant.pricing),
            providers: variant.providers.map(provider => ({
                ...structuredClone(provider),
                byok_meta: structuredClone(bundle.byok[String(provider.provider_id)] ?? []),
            })),
        } })),
    };
}
