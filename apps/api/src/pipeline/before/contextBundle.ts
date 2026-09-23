import { z } from "zod";
import { dispatchBackground, getBindingsIfConfigured, getCache, getSupabaseAdmin } from "@/runtime/env";
import { publicCatalogSchema as catalogSchema, isPublicCatalogFresh as fresh, type PublicCatalogSnapshot } from "./publicCatalogSnapshot";
export { PUBLIC_CATALOG_MAX_AGE_MS, type PublicCatalogSnapshot } from "./publicCatalogSnapshot";

const MAX_ENTRIES = 32;
const MAX_BYTES = 256_000;
const REFRESH_AFTER_MS = 60_000;
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
const entries = new Map<string, { value: PublicCatalogSnapshot; refreshAfter: number }>();
export const publicCatalogEndpoints = (endpoint: string): string[] =>
    endpoint === "text.generate" ? [endpoint] : ["text.generate", endpoint];
export const publicCatalogKey = (model: string, endpoints: string[]) =>
    `gateway:public-catalog:v1:${JSON.stringify([model, endpoints])}`;

export function contextBundleEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_CONTEXT_BUNDLE_ENABLED === "true";
}

function remember(key: string, value: PublicCatalogSnapshot): void {
    if (JSON.stringify(value).length > MAX_BYTES) return;
    const existing = entries.get(key);
    // An older replica or delayed refresh must not replace a newer snapshot.
    if (existing && existing.value.checkedAt > value.checkedAt) return;
    if (!entries.has(key) && entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    entries.set(key, { value: structuredClone(value), refreshAfter: Date.now() + REFRESH_AFTER_MS });
}

async function readCatalogFromKv(cache: KVNamespace, model: string, endpoints: string[]): Promise<PublicCatalogSnapshot | null> {
    const key = publicCatalogKey(model, endpoints);
    try {
        const raw = await cache.get(key, { type: "text", cacheTtl: 30 });
        if (!raw || raw.length > MAX_BYTES) return null;
        const parsed = catalogSchema.safeParse(JSON.parse(raw));
        if (!parsed.success || !fresh(parsed.data, model, endpoints)) return null;
        remember(key, parsed.data);
        return parsed.data;
    } catch { return null; }
}

async function readCatalog(model: string, endpoints: string[]): Promise<PublicCatalogSnapshot | null> {
    const key = publicCatalogKey(model, endpoints);
    const local = entries.get(key);
    if (local && fresh(local.value, model, endpoints)) {
        if (Date.now() >= local.refreshAfter) {
            local.refreshAfter = Date.now() + REFRESH_AFTER_MS;
            // Capture the binding before the request runtime is released. Never
            // share a request's I/O promise with another Worker invocation.
            dispatchBackground(readCatalogFromKv(getCache(), model, endpoints));
        }
        return structuredClone(local.value);
    }
    entries.delete(key);
    return readCatalogFromKv(getCache(), model, endpoints);
}

export async function publishPublicCatalog(input: unknown, expected?: { model: string; endpoints: string[] }): Promise<boolean> {
    const parsed = catalogSchema.safeParse(input);
    if (!parsed.success) return false;
    const value = parsed.data;
    if (!fresh(value, expected?.model ?? value.model, expected?.endpoints ?? value.endpoints)) return false;
    // Unknown/hidden models can be workspace-private identifiers. Avoid putting
    // their names into a shared negative cache; private-route lookup stays scoped.
    if (value.variants.every(variant => variant.providers.length === 0)) return false;
    const raw = JSON.stringify(value);
    if (raw.length > MAX_BYTES) return false;
    const key = publicCatalogKey(value.model, value.endpoints);
    remember(key, value);
    // Absolute expiresAt is checked on every read, including deadlines below
    // KV's 60-second minimum expiration TTL and replicas with stale values.
    await getCache().put(key, raw, {
        expirationTtl: Math.max(60, Math.ceil((value.expiresAt - Date.now()) / 1000)),
    });
    return true;
}

export async function loadTextContextBundle(args: {
    workspaceId: string; apiKeyId: string; model: string; endpoint: string; disableCache?: boolean;
    /** Diagnostics: exercise shared KV without reusing this isolate's snapshot. */
    skipCatalogMemoryCache?: boolean;
}): Promise<ContextBundle> {
    const endpoints = publicCatalogEndpoints(args.endpoint);
    const cacheStarted = performance.now();
    let catalog = args.disableCache ? null : args.skipCatalogMemoryCache
        ? await readCatalogFromKv(getCache(), args.model, endpoints)
        : await readCatalog(args.model, endpoints);
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
