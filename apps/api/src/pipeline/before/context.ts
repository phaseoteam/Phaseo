// lib/gateway/before/context.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Calls RPC/SQL to fetch provider, pricing, and gating context.

import { getSupabaseAdmin, getCache } from "@/runtime/env";
import { getProviderResidencyMetadata } from "@/lib/config/providerResidency";
import { keyVersionToken } from "@/core/kv";
import { contextSchema } from "./schemas";
import { loadPriceCard } from "@pipeline/pricing";
import { getContextCapabilityCandidates } from "./context.capability-aliases";
import {
	applyNebiusRegionalModelAllowlist,
	splitProviderScopedModel,
} from "./context.nebius";
import { applyExplicitProviderModelRouting } from "./context.provider-offers";
import {
	clampTtl,
	cloneGatewayContextData,
	computeAdaptiveTtlForDynamic,
	computeStaticTtl,
	isDynamicContextLike,
	isStaticContextLike,
	isWithinEffectiveWindow,
	mergeCachedContext,
	normalizeCapabilityStatus,
	normalizeProviderStatus,
	normalizeRoutingStatus,
	parseModalities,
	ROUTABLE_CAPABILITY_STATUSES,
	ROUTABLE_CAPABILITY_STATUSES_WITH_TESTING,
	round3,
	splitContextForCache,
	supportsEndpointViaModalities,
	toMillis,
	trackContextInflight,
} from "./context.shared";
import type {
    ByokKeyMeta,
    CapabilityRoutingStatus,
    ContextFetchTelemetry,
    GatewayContextData,
    GatewayProviderSnapshot,
    ProviderRolloutStatus,
    RoutingStatus,
} from "./types";

export { getContextCapabilityCandidates } from "./context.capability-aliases";
export { applyNebiusRegionalModelAllowlist } from "./context.nebius";
export { computeBalanceAwareTtlSeconds } from "./context.shared";

const CONTEXT_CACHE_PREFIX = "gateway:context";

// Multi-tier caching constants (respecting Cloudflare KV 60s minimum)
const STATIC_CACHE_PREFIX = "gateway:static";
const DYNAMIC_CACHE_PREFIX = "gateway:dynamic";
const PRESET_CACHE_PREFIX = "gateway:preset";

const PRESET_TTL = 120;      // 2 minutes
const CONTEXT_INFLIGHT_MAX_ENTRIES = 512;
const CONTEXT_KEY_VERSION_L1_TTL_MS = 5_000;

const contextInflight = new Map<string, Promise<GatewayContextData>>();

type ProviderScopedModelRow = {
    provider_api_model_id: string | null;
    api_model_id: string | null;
    effective_from: string | null;
    effective_to: string | null;
};

function setToArrayOrNull(value: Set<string>): string[] | null {
    const list = Array.from(value).filter(Boolean);
    return list.length ? list : null;
}

type ProviderModalitiesRow = {
    provider_id: string | null;
    provider_model_slug: string | null;
    input_modalities: unknown;
    output_modalities: unknown;
    effective_from: string | null;
    effective_to: string | null;
};

function getProviderSnapshotMergeKey(provider: GatewayProviderSnapshot): string {
    const providerId = String(provider.providerId ?? "").trim().toLowerCase();
    const providerModelSlug = String(provider.providerModelSlug ?? "").trim().toLowerCase();
    const apiModelId = String(provider.apiModelId ?? "").trim().toLowerCase();
    return `${providerId}::${providerModelSlug || apiModelId || "*"}`;
}

function mergeGatewayContextVariants(
    base: GatewayContextData,
    variants: GatewayContextData[],
): GatewayContextData {
    if (!variants.length) return base;

    const mergedProviders = [...(Array.isArray(base.providers) ? base.providers : [])];
    const providerIndex = new Map<string, number>();
    for (let index = 0; index < mergedProviders.length; index += 1) {
        providerIndex.set(getProviderSnapshotMergeKey(mergedProviders[index]), index);
    }

    for (const variant of variants) {
        for (const provider of Array.isArray(variant.providers) ? variant.providers : []) {
            const key = getProviderSnapshotMergeKey(provider);
            const existingIndex = providerIndex.get(key);
            if (existingIndex === undefined) {
                providerIndex.set(key, mergedProviders.length);
                mergedProviders.push(provider);
                continue;
            }

            const existing = mergedProviders[existingIndex];
            mergedProviders[existingIndex] = {
                ...existing,
                ...provider,
                supportsEndpoint:
                    Boolean(existing.supportsEndpoint) ||
                    Boolean(provider.supportsEndpoint),
                inputModalities:
                    existing.inputModalities?.length
                        ? existing.inputModalities
                        : provider.inputModalities,
                outputModalities:
                    existing.outputModalities?.length
                        ? existing.outputModalities
                        : provider.outputModalities,
                capabilityParams:
                    existing.capabilityParams &&
                    Object.keys(existing.capabilityParams).length > 0
                        ? existing.capabilityParams
                        : provider.capabilityParams,
                maxInputTokens:
                    existing.maxInputTokens ?? provider.maxInputTokens ?? null,
                maxOutputTokens:
                    existing.maxOutputTokens ?? provider.maxOutputTokens ?? null,
            };
        }
    }

    return {
        ...base,
        providers: mergedProviders,
        pricing: Object.assign(
            {},
            base.pricing ?? {},
            ...variants.map((variant) => variant.pricing ?? {}),
        ),
    };
}

function getTextContextCapabilitiesToLoad(
    capabilityCandidates: string[],
): string[] | null {
    if (!capabilityCandidates.includes("text.generate")) return null;
    const requestedSurface = capabilityCandidates.find(
        candidate =>
            candidate === "responses" ||
            candidate === "chat.completions" ||
            candidate === "messages",
    );
    return requestedSurface
        ? ["text.generate", requestedSurface]
        : ["text.generate"];
}

async function backfillProviderModalities(args: {
    parsed: GatewayContextData;
    requestedModel: string;
}): Promise<GatewayContextData> {
    const parsed = args.parsed;
    const providers = Array.isArray(parsed.providers) ? parsed.providers : [];
    if (!providers.length) return parsed;

    const needsBackfill = providers.some((provider) => {
        const hasInput = Array.isArray(provider.inputModalities) && provider.inputModalities.length > 0;
        const hasOutput = Array.isArray(provider.outputModalities) && provider.outputModalities.length > 0;
        return !hasInput || !hasOutput;
    });
    if (!needsBackfill) return parsed;

    const modelCandidates = Array.from(
        new Set(
            [parsed.resolvedModel, args.requestedModel]
                .map((value) => String(value ?? "").trim())
                .filter(Boolean)
        )
    );
    if (!modelCandidates.length) return parsed;

    const providerIds = Array.from(
        new Set(
            providers
                .map((provider) => provider.providerId)
                .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
    );
    if (!providerIds.length) return parsed;

    const supabase = getSupabaseAdmin();
    const nowMs = Date.now();
    const byApiModelResult = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_id,provider_model_slug,input_modalities,output_modalities,effective_from,effective_to"
        )
        .eq("is_active_gateway", true)
        .in("provider_id", providerIds)
        .in("api_model_id", modelCandidates);

    if (byApiModelResult.error) return parsed;

    const rows = (byApiModelResult.data ?? []) as ProviderModalitiesRow[];
    if (!rows.length) return parsed;

    const rowsByProviderId = new Map<string, ProviderModalitiesRow[]>();
    for (const row of rows) {
        const providerId = row.provider_id;
        if (typeof providerId !== "string" || !providerId.length) continue;
        if (!isWithinEffectiveWindow(row.effective_from, row.effective_to, nowMs)) continue;
        const list = rowsByProviderId.get(providerId) ?? [];
        list.push(row);
        rowsByProviderId.set(providerId, list);
    }

    if (!rowsByProviderId.size) return parsed;

    for (const [providerId, rows] of rowsByProviderId.entries()) {
        rows.sort((a, b) => toMillis(b.effective_from) - toMillis(a.effective_from));
        rowsByProviderId.set(providerId, rows);
    }

    const hydratedProviders = providers.map((provider) => {
        const hasInput = Array.isArray(provider.inputModalities) && provider.inputModalities.length > 0;
        const hasOutput = Array.isArray(provider.outputModalities) && provider.outputModalities.length > 0;
        if (hasInput && hasOutput) return provider;

        const rows = rowsByProviderId.get(provider.providerId) ?? [];
        if (!rows.length) return provider;

        const targetSlug = provider.providerModelSlug ?? null;
        const match =
            rows.find((row) => (row.provider_model_slug ?? null) === targetSlug) ??
            rows.find((row) => row.provider_model_slug == null) ??
            rows[0];
        if (!match) return provider;

        const backfilledInput = setToArrayOrNull(parseModalities(match.input_modalities));
        const backfilledOutput = setToArrayOrNull(parseModalities(match.output_modalities));

        return {
            ...provider,
            inputModalities: hasInput ? provider.inputModalities : backfilledInput,
            outputModalities: hasOutput ? provider.outputModalities : backfilledOutput,
        };
    });

    return {
        ...parsed,
        providers: hydratedProviders,
    };
}

async function resolveProviderScopedModelToApiModel(args: {
    model: string;
    endpoint: string;
}): Promise<string | null> {
    const split = splitProviderScopedModel(args.model);
    if (!split) return null;

    const supabase = getSupabaseAdmin();
    const nowMs = Date.now();
    const { data: rows, error } = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id,api_model_id,effective_from,effective_to")
        .eq("provider_id", split.providerId)
        .eq("provider_model_slug", split.providerModelSlug)
        .eq("is_active_gateway", true);
    if (error || !rows?.length) return null;

    const inWindow = (rows as ProviderScopedModelRow[])
        .filter((row) => typeof row.provider_api_model_id === "string" && typeof row.api_model_id === "string")
        .filter((row) => isWithinEffectiveWindow(row.effective_from, row.effective_to, nowMs));
    if (!inWindow.length) return null;

    const providerApiModelIds = Array.from(
        new Set(
            inWindow
                .map((row) => row.provider_api_model_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
    );
    if (!providerApiModelIds.length) return null;

    const capabilityCandidates = getContextCapabilityCandidates(
        args.endpoint,
        args.model,
    );
    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id")
        .in("capability_id", capabilityCandidates)
        .in("status", [...ROUTABLE_CAPABILITY_STATUSES])
        .in("provider_api_model_id", providerApiModelIds);
    if (capabilityError || !capabilityRows?.length) return null;

    const supportedIds = new Set(
        capabilityRows
            .map((row: any) => row?.provider_api_model_id)
            .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    );

    const candidates = inWindow
        .filter((row) => row.provider_api_model_id && supportedIds.has(row.provider_api_model_id))
        .sort((a, b) => toMillis(b.effective_from) - toMillis(a.effective_from));
    if (!candidates.length) return null;

    return candidates[0]?.api_model_id ?? null;
}

async function fetchTestingProviderSnapshots(args: {
    workspaceId: string;
    model: string;
    requestedModel: string;
    endpoint: string;
    existingProviders: GatewayProviderSnapshot[];
}): Promise<GatewayProviderSnapshot[]> {
    const supabase = getSupabaseAdmin();
    const nowMs = Date.now();
    const existingSupportByKey = new Map<string, boolean>();
    for (const provider of args.existingProviders) {
        const key = `${provider.providerId}::${provider.providerModelSlug ?? ""}`;
        const previous = existingSupportByKey.get(key) ?? false;
        existingSupportByKey.set(key, previous || Boolean(provider.supportsEndpoint));
    }

    const modelCandidates = Array.from(
        new Set(
            [args.model, args.requestedModel]
                .map((value) => String(value ?? "").trim())
                .filter(Boolean)
        )
    );
    if (!modelCandidates.length) return [];

    const byApiModelResult = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id,provider_id,provider_model_slug,is_active_gateway,routing_status,effective_from,effective_to,input_modalities,output_modalities"
        )
        .in("api_model_id", modelCandidates);

    if (byApiModelResult.error) return [];

    const providerRowById = new Map<string, any>();
    for (const row of byApiModelResult.data ?? []) {
        const key = typeof row?.provider_api_model_id === "string" ? row.provider_api_model_id : null;
        if (!key) continue;
        providerRowById.set(key, row);
    }
    const providerRows = Array.from(providerRowById.values());
    if (!providerRows.length) return [];

    const inWindowRows = providerRows.filter((row: any) =>
        isWithinEffectiveWindow(row?.effective_from, row?.effective_to, nowMs)
    );
    if (!inWindowRows.length) return [];

    const providerModelIds = Array.from(
        new Set(
            inWindowRows
                .map((row: any) => row?.provider_api_model_id)
                .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
        )
    );
    if (!providerModelIds.length) return [];

    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select(
            "provider_api_model_id,params,max_input_tokens,max_output_tokens,status,updated_at,created_at"
        )
        .in("capability_id", getContextCapabilityCandidates(args.endpoint, args.model))
        .in("status", [...ROUTABLE_CAPABILITY_STATUSES_WITH_TESTING])
        .in("provider_api_model_id", providerModelIds);
    if (capabilityError) return [];

    const latestCapabilityByProviderModel = new Map<
        string,
        {
            params: Record<string, any>;
            maxInputTokens: number | null;
            maxOutputTokens: number | null;
            status: CapabilityRoutingStatus;
            sortTs: number;
        }
    >();
    for (const row of (capabilityRows ?? []) as any[]) {
        const providerApiModelId = row?.provider_api_model_id;
        if (typeof providerApiModelId !== "string" || !providerApiModelId.length) continue;
        const ts = Math.max(toMillis(row?.updated_at), toMillis(row?.created_at));
        const prev = latestCapabilityByProviderModel.get(providerApiModelId);
        if (prev && prev.sortTs > ts) continue;
        latestCapabilityByProviderModel.set(providerApiModelId, {
            params: (row?.params && typeof row.params === "object" ? row.params : {}) as Record<string, any>,
            maxInputTokens:
                row?.max_input_tokens === null || row?.max_input_tokens === undefined
                    ? null
                    : Number(row.max_input_tokens),
            maxOutputTokens:
                row?.max_output_tokens === null || row?.max_output_tokens === undefined
                    ? null
                    : Number(row.max_output_tokens),
            status: normalizeCapabilityStatus(row?.status),
            sortTs: ts,
        });
    }

    const providerIds = Array.from(
        new Set(
            inWindowRows
                .map((row: any) => row?.provider_id)
                .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
        )
    );
    const byokByProvider = new Map<string, ByokKeyMeta[]>();
    if (providerIds.length) {
        const { data: byokRows, error: byokError } = await supabase
            .from("byok_keys")
            .select("id,provider_id,fingerprint_sha256,key_version,always_use")
            .eq("workspace_id", args.workspaceId)
            .eq("enabled", true)
            .in("provider_id", providerIds);
        if (!byokError && byokRows?.length) {
            for (const row of byokRows as any[]) {
                if (!row?.id || !row?.provider_id || !row?.fingerprint_sha256) continue;
                const entry: ByokKeyMeta = {
                    id: String(row.id),
                    providerId: String(row.provider_id),
                    fingerprintSha256: String(row.fingerprint_sha256),
                    keyVersion:
                        row.key_version === undefined || row.key_version === null
                            ? null
                            : String(row.key_version),
                    alwaysUse: Boolean(row.always_use),
                };
                const list = byokByProvider.get(entry.providerId) ?? [];
                list.push(entry);
                byokByProvider.set(entry.providerId, list);
            }
        }
    }

    const testingProviders: GatewayProviderSnapshot[] = [];
    for (const row of inWindowRows as any[]) {
        const providerApiModelId = row?.provider_api_model_id;
        const providerId = row?.provider_id;
        if (typeof providerApiModelId !== "string" || typeof providerId !== "string") continue;
        const cap = latestCapabilityByProviderModel.get(providerApiModelId);
        const inferredSupport = supportsEndpointViaModalities({
            endpoint: args.endpoint,
            inputModalities: parseModalities(row?.input_modalities),
            outputModalities: parseModalities(row?.output_modalities),
        });
        if (!cap && !inferredSupport) continue;
        const providerModelSlug =
            row?.provider_model_slug === null || row?.provider_model_slug === undefined
                ? null
                : String(row.provider_model_slug);
        const providerKey = `${providerId}::${providerModelSlug ?? ""}`;
        const alreadySupported = existingSupportByKey.get(providerKey) ?? false;
        if (alreadySupported) continue;
        const residency = getProviderResidencyMetadata({
            providerId,
            providerModelSlug,
        });
        testingProviders.push({
            providerId,
            providerStatus: "active",
            providerRoutingStatus: "active",
            modelRoutingStatus: normalizeRoutingStatus(row?.routing_status),
            capabilityStatus: cap?.status ?? "active",
            residencyMode: residency.residencyMode,
            executionRegions: residency.executionRegions,
            dataRegions: residency.dataRegions,
            zeroDataRetention: residency.zeroDataRetention,
            supportsEndpoint: true,
            baseWeight: 1,
            byokMeta: byokByProvider.get(providerId) ?? [],
            providerModelSlug,
            capabilityParams: cap?.params ?? {},
            maxInputTokens:
                cap?.maxInputTokens !== null && Number.isFinite(cap?.maxInputTokens)
                    ? cap.maxInputTokens
                    : null,
            maxOutputTokens:
                cap?.maxOutputTokens !== null && Number.isFinite(cap?.maxOutputTokens)
                    ? cap.maxOutputTokens
                    : null,
        });
    }

    return testingProviders;
}

export async function fetchGatewayContext(args: {
    workspaceId: string;
    model: string;
    endpoint: string;
    apiKeyId: string;
    includeTestingMode?: boolean;
    disableCache?: boolean;
}): Promise<GatewayContextData> {
    const supabase = getSupabaseAdmin();
    const cache = getCache();
    const fetchStartedAt = performance.now();
    const telemetry: ContextFetchTelemetry = {
        cacheStatus: args.disableCache ? "bypass" : "miss",
        totalMs: 0,
        keyVersionMs: null,
        cacheReadMs: null,
        rpcMs: null,
        enrichMs: null,
        cacheWriteMs: null,
        fallbackRemap: false,
    };
    // Check if model is a preset
    const isPreset = args.model.startsWith("@");
    const shouldUseCache = !args.disableCache;
    const needsVersionToken = shouldUseCache;
    let versionToken = "v0";
    if (needsVersionToken) {
        const keyVersionStartedAt = performance.now();
        versionToken = await keyVersionToken("id", args.apiKeyId, {
            useL1Cache: true,
            l1TtlMs: CONTEXT_KEY_VERSION_L1_TTL_MS,
        });
        telemetry.keyVersionMs = round3(performance.now() - keyVersionStartedAt);
    }
    const testingModeCacheSegment = args.includeTestingMode ? "testing" : "default";
    const dynamicCacheKey = `${DYNAMIC_CACHE_PREFIX}:${testingModeCacheSegment}:${args.workspaceId}:${args.apiKeyId}:${versionToken}`;
    const staticCacheKey = isPreset
        ? `${PRESET_CACHE_PREFIX}:${testingModeCacheSegment}:${args.workspaceId}:${args.model}:${args.endpoint}`
        : `${STATIC_CACHE_PREFIX}:${testingModeCacheSegment}:${args.workspaceId}:${args.endpoint}:${args.model}`;
    const compositionCacheKey = `${CONTEXT_CACHE_PREFIX}:compose:${testingModeCacheSegment}:${args.workspaceId}:${args.apiKeyId}:${versionToken}:${args.endpoint}:${args.model}`;

    // Try split cache first (parallel read of dynamic and static segments).
    if (shouldUseCache) {
        const cacheReadStartedAt = performance.now();
        try {
            const [dynamicCachedRaw, staticCachedRaw] = await Promise.all([
                cache.get(dynamicCacheKey, "text"),
                cache.get(staticCacheKey, "text"),
            ]);
            telemetry.cacheReadMs = round3(performance.now() - cacheReadStartedAt);
            if (dynamicCachedRaw && staticCachedRaw) {
                const dynamicParsed = JSON.parse(dynamicCachedRaw);
                const staticParsed = JSON.parse(staticCachedRaw);
                if (isDynamicContextLike(dynamicParsed) && isStaticContextLike(staticParsed)) {
                    const merged = mergeCachedContext({
                        dynamic: dynamicParsed,
                        static: staticParsed,
                        endpoint: args.endpoint,
                    });
                    return {
                        ...merged,
                        contextTelemetry: {
                            ...telemetry,
                            cacheStatus: "hit",
                            totalMs: round3(performance.now() - fetchStartedAt),
                        },
                    };
                }
            }
        } catch {
            telemetry.cacheReadMs = round3(performance.now() - cacheReadStartedAt);
            // ignore cache read failures
        }
    }

    const inflightKey = shouldUseCache ? compositionCacheKey : null;
    if (inflightKey) {
        const inflight = contextInflight.get(inflightKey);
        if (inflight) {
            return inflight.then((value) => cloneGatewayContextData(value));
        }
    }

    const dbLoader = (async (): Promise<GatewayContextData> => {
        async function fetchParsedContext(model: string, endpointCapability: string): Promise<GatewayContextData> {
            const rpcArgs = {
                workspace_id: args.workspaceId,
                model,
                endpoint: endpointCapability,
                api_key_id: args.apiKeyId,
            };

            const { data, error } = await supabase.rpc(
                "gateway_fetch_request_context_with_reservations",
                rpcArgs,
            );
            if (error) throw new Error(`gateway_context_rpc_error:${error.message ?? "unknown"}`);
            const payload = Array.isArray(data) ? (data.length ? data[0] : null) : data;
            if (!payload) throw new Error("gateway_context_rpc_empty");

            try {
                return contextSchema.parse(payload);
            } catch (e) {
                console.error("[context.ts] Zod parsing error:", e);
                throw e;
            }
        }

        let rpcTotalMs = 0;
        const fetchParsedContextMeasured = async (model: string, endpointCapability: string) => {
            const rpcStartedAt = performance.now();
            const value = await fetchParsedContext(model, endpointCapability);
            rpcTotalMs += performance.now() - rpcStartedAt;
            return value;
        };

        const contextCapabilityCandidates = getContextCapabilityCandidates(
            args.endpoint,
            args.model,
        );
        const textContextCapabilities = getTextContextCapabilitiesToLoad(
            contextCapabilityCandidates,
        );
        let contextCapability = contextCapabilityCandidates[0] ?? args.endpoint;
        let parsed: GatewayContextData;

        if (textContextCapabilities) {
            const variants = await Promise.all(
                textContextCapabilities.map(async (candidateCapability) => ({
                    candidateCapability,
                    parsed: await fetchParsedContextMeasured(
                        args.model,
                        candidateCapability,
                    ),
                })),
            );
            const nonEmptyVariants = variants.filter(
                (variant) => (variant.parsed.providers ?? []).length > 0,
            );
            const preferredVariant =
                nonEmptyVariants[0] ?? variants[0] ?? null;
            if (!preferredVariant) {
                throw new Error("gateway_context_rpc_empty");
            }
            contextCapability = preferredVariant.candidateCapability;
            parsed =
                nonEmptyVariants.length > 1
                    ? mergeGatewayContextVariants(
                        preferredVariant.parsed,
                        nonEmptyVariants
                            .filter((variant) => variant !== preferredVariant)
                            .map((variant) => variant.parsed),
                    )
                    : preferredVariant.parsed;
        } else {
            contextCapability = contextCapabilityCandidates[0] ?? args.endpoint;
            parsed = await fetchParsedContextMeasured(args.model, contextCapability);

            if ((parsed.providers ?? []).length === 0 && contextCapabilityCandidates.length > 1) {
                for (const candidateCapability of contextCapabilityCandidates.slice(1)) {
                    const fallbackParsed = await fetchParsedContextMeasured(args.model, candidateCapability);
                    if ((fallbackParsed.providers ?? []).length > 0) {
                        parsed = fallbackParsed;
                        contextCapability = candidateCapability;
                        break;
                    }
                }
            }
        }

        // Fallback path for provider-scoped model slugs (e.g. mistral/mistral-medium-2508):
        // if RPC returned no providers and did not resolve the model, remap via provider_model_slug.
        const noProviders = (parsed.providers ?? []).length === 0;
        const unresolved = (parsed.resolvedModel ?? args.model) === args.model;
        if (noProviders && unresolved) {
            const remappedModel = await resolveProviderScopedModelToApiModel({
                model: args.model,
                endpoint: contextCapability,
            });
            if (remappedModel && remappedModel !== args.model) {
                telemetry.fallbackRemap = true;
                parsed = await fetchParsedContextMeasured(remappedModel, contextCapability);
            }
        }

        parsed = applyNebiusRegionalModelAllowlist({
            parsed,
            requestedModel: args.model,
        });
        parsed = applyExplicitProviderModelRouting({
            parsed,
            requestedModel: args.model,
        });

        const resolvedModelForPricing = parsed.resolvedModel ?? args.model;
        if ((parsed.providers ?? []).length > 0) {
            const pricingByProvider: Record<string, any> = {
                ...(parsed.pricing ?? {}),
            };
            const pricingCapabilityCandidates = Array.from(
                new Set<string>([
                    ...getContextCapabilityCandidates(
                        args.endpoint,
                        resolvedModelForPricing,
                    ),
                    ...getContextCapabilityCandidates(
                        contextCapability,
                        resolvedModelForPricing,
                    ),
                ]),
            );
            const missingProviders = Array.from(
                new Set(
                    (parsed.providers ?? [])
                        .map((provider) => provider.providerId)
                        .filter((providerId) => {
                            if (!providerId) return false;
                            if (!pricingByProvider[providerId]) return true;
                            return contextCapability !== args.endpoint;
                        })
                )
            );

            if (missingProviders.length > 0) {
                await Promise.all(
                    missingProviders.map(async (providerId) => {
                        for (const capabilityCandidate of pricingCapabilityCandidates) {
                            const card = await loadPriceCard(
                                providerId,
                                resolvedModelForPricing,
                                capabilityCandidate,
                            );
                            if (card) {
                                pricingByProvider[providerId] = card;
                                break;
                            }
                        }
                    })
                );
                parsed.pricing = pricingByProvider;
            }
        }

        telemetry.rpcMs = round3(rpcTotalMs);
        const enrichStartedAt = performance.now();
        parsed = await backfillProviderModalities({
            parsed,
            requestedModel: args.model,
        });

        if (args.includeTestingMode) {
            try {
                const testingProviders = await fetchTestingProviderSnapshots({
                    workspaceId: args.workspaceId,
                    model: parsed.resolvedModel ?? args.model,
                    requestedModel: args.model,
                    endpoint: args.endpoint,
                    existingProviders: parsed.providers ?? [],
                });
                if (testingProviders.length) {
                    parsed.providers = [...(parsed.providers ?? []), ...testingProviders];
                }
            } catch {
                // Keep public provider list if testing-mode enrichment fails.
            }
        }

        // Testing-mode enrichment appends providers after initial pricing hydration.
        // Re-run pricing lookup so newly added providers are not dropped as pricing_missing.
        if ((parsed.providers ?? []).length > 0) {
            const pricingByProvider: Record<string, any> = {
                ...(parsed.pricing ?? {}),
            };
            const resolvedModelForPricing = parsed.resolvedModel ?? args.model;
            const pricingCapabilityCandidates = Array.from(
                new Set<string>([
                    ...getContextCapabilityCandidates(
                        args.endpoint,
                        resolvedModelForPricing,
                    ),
                    ...getContextCapabilityCandidates(
                        contextCapability,
                        resolvedModelForPricing,
                    ),
                ]),
            );
            const missingProviders = Array.from(
                new Set(
                    (parsed.providers ?? [])
                        .map((provider) => provider.providerId)
                        .filter((providerId) => providerId && !pricingByProvider[providerId])
                )
            );
            if (missingProviders.length > 0) {
                await Promise.all(
                    missingProviders.map(async (providerId) => {
                        for (const capabilityCandidate of pricingCapabilityCandidates) {
                            const card = await loadPriceCard(
                                providerId,
                                resolvedModelForPricing,
                                capabilityCandidate,
                            );
                            if (card) {
                                pricingByProvider[providerId] = card;
                                break;
                            }
                        }
                    })
                );
                parsed.pricing = pricingByProvider;
            }
        }

        parsed = applyNebiusRegionalModelAllowlist({
            parsed,
            requestedModel: args.model,
        });
        parsed = applyExplicitProviderModelRouting({
            parsed,
            requestedModel: args.model,
        });

        // Enrich with team settings + provider rollout statuses.
        parsed.teamSettings = {
            routingMode: null,
            byokFallbackEnabled: null,
            betaChannelEnabled: false,
            alphaChannelEnabled: false,
            cacheAwareRoutingEnabled: null,
            billingMode: "wallet",
        };

        try {
            const providerIds = Array.from(
                new Set(
                    (parsed.providers ?? [])
                        .map((provider) => provider.providerId)
                        .filter((id): id is string => Boolean(id))
                )
            );

            const providerStatusQuery = providerIds.length
                ? supabase
                      .from("data_api_providers")
                      .select("api_provider_id,status,routing_status,provider_family_id,offer_scope,offer_label")
                      .in("api_provider_id", providerIds)
                : Promise.resolve({ data: [], error: null } as any);

            const [settingsResult, providerStatusResult, teamResult] = await Promise.all([
                supabase
                    .from("workspace_settings")
                    .select("routing_mode,byok_fallback_enabled,beta_channel_enabled,alpha_channel_enabled,cache_aware_routing_enabled")
                    .eq("workspace_id", args.workspaceId)
                    .maybeSingle(),
                providerStatusQuery,
                supabase
                    .from("workspaces")
                    .select("billing_mode")
                    .eq("id", args.workspaceId)
                    .maybeSingle(),
            ]);

            if (!settingsResult?.error) {
                const rawBillingMode = String(teamResult?.data?.billing_mode ?? "wallet")
                    .trim()
                    .toLowerCase();
                const billingMode =
                    rawBillingMode === "invoice" ? "invoice" : "wallet";
                parsed.teamSettings = {
                    routingMode: settingsResult.data?.routing_mode ?? null,
                    byokFallbackEnabled:
                        settingsResult.data?.byok_fallback_enabled ?? null,
                    betaChannelEnabled:
                        settingsResult.data?.beta_channel_enabled ?? false,
                    alphaChannelEnabled:
                        settingsResult.data?.alpha_channel_enabled ?? false,
                    cacheAwareRoutingEnabled:
                        settingsResult.data?.cache_aware_routing_enabled ?? null,
                    billingMode,
                };
            }

            const rolloutStatusByProvider = new Map<string, ProviderRolloutStatus>();
            const routingStatusByProvider = new Map<string, RoutingStatus>();
            const providerFamilyByProvider = new Map<string, string | null>();
            const offerScopeByProvider = new Map<string, GatewayProviderSnapshot["offerScope"]>();
            const offerLabelByProvider = new Map<string, string | null>();
            if (!providerStatusResult?.error) {
                for (const row of providerStatusResult.data ?? []) {
                    if (!row?.api_provider_id) continue;
                    rolloutStatusByProvider.set(
                        row.api_provider_id,
                        normalizeProviderStatus(row.status),
                    );
                    routingStatusByProvider.set(
                        row.api_provider_id,
                        normalizeRoutingStatus(row.routing_status),
                    );
                    providerFamilyByProvider.set(
                        row.api_provider_id,
                        typeof row.provider_family_id === "string" && row.provider_family_id.trim().length > 0
                            ? row.provider_family_id
                            : null,
                    );
                    offerScopeByProvider.set(
                        row.api_provider_id,
                        row.offer_scope === "global" || row.offer_scope === "regional" || row.offer_scope === "specialized"
                            ? row.offer_scope
                            : null,
                    );
                    offerLabelByProvider.set(
                        row.api_provider_id,
                        typeof row.offer_label === "string" && row.offer_label.trim().length > 0
                            ? row.offer_label
                            : null,
                    );
                }
            }

            parsed.providers = (parsed.providers ?? []).map((provider) => {
                const residency = getProviderResidencyMetadata({
                    providerId: provider.providerId,
                    providerModelSlug: provider.providerModelSlug,
                });
                return {
                    ...provider,
                    providerFamilyId:
                        providerFamilyByProvider.get(provider.providerId) ??
                        provider.providerFamilyId ??
                        null,
                    offerScope:
                        offerScopeByProvider.get(provider.providerId) ??
                        provider.offerScope ??
                        null,
                    offerLabel:
                        offerLabelByProvider.get(provider.providerId) ??
                        provider.offerLabel ??
                        null,
                    providerStatus:
                        rolloutStatusByProvider.get(provider.providerId) ??
                        normalizeProviderStatus(provider.providerStatus) ??
                        "active",
                    providerRoutingStatus:
                        routingStatusByProvider.get(provider.providerId) ??
                        normalizeRoutingStatus(provider.providerRoutingStatus) ??
                        "active",
                    modelRoutingStatus:
                        normalizeRoutingStatus(provider.modelRoutingStatus) ??
                        "active",
                    capabilityStatus:
                        normalizeCapabilityStatus(provider.capabilityStatus) ??
                        "active",
                    residencyMode:
                        provider.residencyMode ?? residency.residencyMode,
                    executionRegions:
                        provider.executionRegions ?? residency.executionRegions,
                    dataRegions: provider.dataRegions ?? residency.dataRegions,
                    zeroDataRetention:
                        provider.zeroDataRetention ?? residency.zeroDataRetention,
                };
            });
        } catch {
            // Keep defaults if enrichment fails, never block request path.
        }
        parsed.testingMode = Boolean(args.includeTestingMode);
        telemetry.enrichMs = round3(performance.now() - enrichStartedAt);

        parsed.endpoint = args.endpoint as any;

        // Compute adaptive TTLs and write split cache entries.
        if (shouldUseCache) {
            const cacheWriteStartedAt = performance.now();
            try {
                const split = splitContextForCache(parsed);
                const dynamicTtl = clampTtl(computeAdaptiveTtlForDynamic(parsed));
                const staticTtl = clampTtl(isPreset ? PRESET_TTL : computeStaticTtl());
                await Promise.all([
                    cache.put(dynamicCacheKey, JSON.stringify(split.dynamic), { expirationTtl: dynamicTtl }),
                    cache.put(staticCacheKey, JSON.stringify(split.static), { expirationTtl: staticTtl }),
                ]);
            } catch {
                // ignore cache write failures
            } finally {
                telemetry.cacheWriteMs = round3(performance.now() - cacheWriteStartedAt);
            }
        }

        telemetry.totalMs = round3(performance.now() - fetchStartedAt);
        parsed.contextTelemetry = telemetry;
        return parsed;
    })();

    if (inflightKey) {
        trackContextInflight({
            cacheKey: inflightKey,
            promise: dbLoader,
            contextInflight,
            maxEntries: CONTEXT_INFLIGHT_MAX_ENTRIES,
        });
    }

    try {
        return await dbLoader;
    } finally {
        if (inflightKey && contextInflight.get(inflightKey) === dbLoader) {
            contextInflight.delete(inflightKey);
        }
    }
}













