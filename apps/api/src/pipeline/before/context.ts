// lib/gateway/before/context.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Calls RPC/SQL to fetch provider, pricing, and gating context.

import { getSupabaseAdmin, getCache } from "@/runtime/env";
import { keyVersionToken } from "@/core/kv";
import { contextSchema } from "./schemas";
import type {
    ByokKeyMeta,
    CapabilityRoutingStatus,
    GatewayContextData,
    GatewayProviderSnapshot,
    ProviderRolloutStatus,
    RoutingStatus,
} from "./types";

const CONTEXT_CACHE_PREFIX = "gateway:context";

// Multi-tier caching constants (respecting Cloudflare KV 60s minimum)
const STATIC_CACHE_PREFIX = "gateway:static";
const DYNAMIC_CACHE_PREFIX = "gateway:dynamic";
const PRESET_CACHE_PREFIX = "gateway:preset";

const STATIC_TTL_MIN = 300;  // 5 minutes
const STATIC_TTL_MAX = 900;  // 15 minutes
const DYNAMIC_TTL_MIN = 60;  // 1 minute (KV minimum)
const DYNAMIC_TTL_MAX = 180; // 3 minutes
const PRESET_TTL = 120;      // 2 minutes

const MIN_TTL_SECONDS = 60;  // Cloudflare KV minimum
const MAX_TTL_SECONDS = 900; // 15 minutes

/**
 * Clamp TTL to valid range for Cloudflare Workers KV
 * Minimum: 60s (KV requirement)
 * Maximum: 900s (15 minutes)
 */
function clampTtl(value: number): number {
    return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(value)));
}

function toUnixSeconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
}

function parseWindowEnd(bucket: "daily" | "weekly" | "monthly", windowStart?: string | null): number | null {
    if (!windowStart) return null;
    const start = new Date(windowStart);
    if (!Number.isFinite(start.getTime())) return null;
    const end = new Date(start);
    if (bucket === "daily") {
        end.setUTCDate(start.getUTCDate() + 1);
    } else if (bucket === "weekly") {
        end.setUTCDate(start.getUTCDate() + 7);
    } else {
        end.setUTCMonth(start.getUTCMonth() + 1);
    }
    return toUnixSeconds(end);
}

function bucketPressureScore(bucket?: {
    requestsUsed: number;
    requestsLimit: number;
    costUsedNanos: number;
    costLimitNanos: number;
} | null): number {
    if (!bucket) return 0;
    const ratios: number[] = [];
    if (bucket.requestsLimit > 0) ratios.push(bucket.requestsUsed / bucket.requestsLimit);
    if (bucket.costLimitNanos > 0) ratios.push(bucket.costUsedNanos / bucket.costLimitNanos);
    return ratios.length ? Math.max(...ratios) : 0;
}

/**
 * Compute adaptive TTL for dynamic data (key limits, buckets)
 * Respects Cloudflare KV 60s minimum TTL
 */
function computeAdaptiveTtlForDynamic(context: GatewayContextData): number {
    let ttl = DYNAMIC_TTL_MAX;

    // If key or limits are not OK, use shorter TTL
    if (!context.key.ok || !context.keyLimit.ok) {
        return DYNAMIC_TTL_MIN;
    }

    const buckets = context.keyLimit.buckets ?? null;
    const nowSec = context.keyLimit.now ? toUnixSeconds(new Date(context.keyLimit.now)) : toUnixSeconds(new Date());
    const bucketEntries: Array<["daily" | "weekly" | "monthly", any]> = [
        ["daily", buckets?.daily ?? null],
        ["weekly", buckets?.weekly ?? null],
        ["monthly", buckets?.monthly ?? null],
    ];

    for (const [bucketName, bucket] of bucketEntries) {
        if (!bucket) continue;
        const pressure = bucketPressureScore(bucket);

        // High pressure = shorter TTL (but respect 60s minimum)
        if (pressure >= 0.95) ttl = Math.min(ttl, 60);
        else if (pressure >= 0.9) ttl = Math.min(ttl, 75);
        else if (pressure >= 0.8) ttl = Math.min(ttl, 90);
        else if (pressure >= 0.6) ttl = Math.min(ttl, 120);
        else ttl = Math.min(ttl, 180);

        const windowEnd = parseWindowEnd(bucketName, bucket.windowStart);
        if (windowEnd) {
            const secondsToReset = windowEnd - nowSec;
            if (secondsToReset > 0 && secondsToReset >= MIN_TTL_SECONDS) {
                ttl = Math.min(ttl, secondsToReset);
            }
        }
    }

    return clampTtl(ttl);
}

/**
 * Compute TTL for static data (providers, pricing)
 * Uses longer TTL since this data changes infrequently
 */
function computeStaticTtl(): number {
    // Static data can be cached for 5-15 minutes
    // Use 10 minutes as default for good balance
    return 600; // 10 minutes
}

function isContextLike(value: unknown): value is GatewayContextData {
    if (!value || typeof value !== "object") return false;
    const ctx = value as GatewayContextData;
    return Boolean(ctx.teamId && ctx.key && ctx.keyLimit && ctx.credit && ctx.providers);
}

function normalizeProviderStatus(
    value: unknown
): ProviderRolloutStatus {
    const status = String(value ?? "").trim().toLowerCase();
    if (status === "active") return "active";
    if (status === "beta") return "beta";
    if (status === "alpha") return "alpha";
    if (status === "notready" || status === "not_ready" || status === "not ready") {
        return "not_ready";
    }
    return "active";
}

function normalizeRoutingStatus(value: unknown): RoutingStatus {
    const status = String(value ?? "").trim().toLowerCase();
    if (status === "active") return "active";
    if (status === "deranked" || status === "deranked_lvl1" || status === "deranked-lvl1") {
        return "deranked_lvl1";
    }
    if (status === "deranked_lvl2" || status === "deranked-lvl2") return "deranked_lvl2";
    if (status === "deranked_lvl3" || status === "deranked-lvl3") return "deranked_lvl3";
    if (status === "disabled") return "disabled";
    if (status === "notready" || status === "not_ready" || status === "not ready") return "disabled";
    return "active";
}

function normalizeCapabilityStatus(value: unknown): CapabilityRoutingStatus {
    const status = String(value ?? "").trim().toLowerCase();
    if (
        status === "internal_testing" ||
        status === "internal-testing" ||
        status === "internaltesting"
    ) {
        return "internal_testing";
    }
    return normalizeRoutingStatus(status);
}

const ROUTABLE_CAPABILITY_STATUSES = [
    "active",
    "deranked",
    "deranked_lvl1",
    "deranked_lvl2",
    "deranked_lvl3",
] as const;

const ROUTABLE_CAPABILITY_STATUSES_WITH_TESTING = [
    ...ROUTABLE_CAPABILITY_STATUSES,
    "internal_testing",
] as const;

function parseModalities(value: unknown): Set<string> {
    if (Array.isArray(value)) {
        return new Set(
            value
                .map((entry) => String(entry ?? "").trim().toLowerCase())
                .filter(Boolean)
        );
    }
    if (typeof value === "string") {
        return new Set(
            value
                .split(",")
                .map((entry) => entry.trim().toLowerCase())
                .filter(Boolean)
        );
    }
    return new Set<string>();
}

function supportsEndpointViaModalities(args: {
    endpoint: string;
    inputModalities: Set<string>;
    outputModalities: Set<string>;
}): boolean {
    const endpoint = String(args.endpoint ?? "").trim().toLowerCase();
    const input = args.inputModalities;
    const output = args.outputModalities;

    const hasInput = (...values: string[]) => values.some((value) => input.has(value));
    const hasOutput = (...values: string[]) => values.some((value) => output.has(value));

    switch (endpoint) {
        case "audio.speech":
            return hasInput("text") && hasOutput("audio");
        case "audio.transcription":
        case "audio.translations":
            return hasInput("audio") && hasOutput("text");
        case "images.generations":
            return hasInput("text", "image") && hasOutput("image");
        case "images.edits":
            return hasInput("image", "text") && hasOutput("image");
        case "video.generation":
        case "video.generate":
            return hasInput("text", "image", "video") && hasOutput("video");
        case "music.generate":
            return hasInput("text") && hasOutput("audio");
        case "ocr":
            return hasInput("image") && hasOutput("text");
        default:
            return false;
    }
}

function toMillis(value: string | null | undefined): number {
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
}

function isWithinEffectiveWindow(
    effectiveFrom: string | null | undefined,
    effectiveTo: string | null | undefined,
    nowMs: number
): boolean {
    const startMs = effectiveFrom ? Date.parse(effectiveFrom) : null;
    const endMs = effectiveTo ? Date.parse(effectiveTo) : null;
    if (startMs !== null && Number.isFinite(startMs) && startMs > nowMs) return false;
    if (endMs !== null && Number.isFinite(endMs) && nowMs >= endMs) return false;
    return true;
}

function splitProviderScopedModel(model: string): { providerId: string; providerModelSlug: string } | null {
    const value = String(model ?? "").trim();
    const slash = value.indexOf("/");
    if (slash <= 0 || slash === value.length - 1) return null;
    const providerId = value.slice(0, slash).trim().toLowerCase();
    const providerModelSlug = value.slice(slash + 1).trim();
    if (!providerId || !providerModelSlug) return null;
    return { providerId, providerModelSlug };
}

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
    const [byApiModelResult, byInternalModelResult] = await Promise.all([
        supabase
            .from("data_api_provider_models")
            .select(
                "provider_id,provider_model_slug,input_modalities,output_modalities,effective_from,effective_to"
            )
            .eq("is_active_gateway", true)
            .in("provider_id", providerIds)
            .in("api_model_id", modelCandidates),
        supabase
            .from("data_api_provider_models")
            .select(
                "provider_id,provider_model_slug,input_modalities,output_modalities,effective_from,effective_to"
            )
            .eq("is_active_gateway", true)
            .in("provider_id", providerIds)
            .in("internal_model_id", modelCandidates),
    ]);

    if (byApiModelResult.error && byInternalModelResult.error) return parsed;

    const rows = [
        ...(byApiModelResult.data ?? []),
        ...(byInternalModelResult.data ?? []),
    ] as ProviderModalitiesRow[];
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

    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id")
        .eq("capability_id", args.endpoint)
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
    teamId: string;
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

    const [byApiModelResult, byInternalModelResult] = await Promise.all([
        supabase
            .from("data_api_provider_models")
            .select(
                "provider_api_model_id,provider_id,provider_model_slug,is_active_gateway,routing_status,effective_from,effective_to,input_modalities,output_modalities"
            )
            .in("api_model_id", modelCandidates),
        supabase
            .from("data_api_provider_models")
            .select(
                "provider_api_model_id,provider_id,provider_model_slug,is_active_gateway,routing_status,effective_from,effective_to,input_modalities,output_modalities"
            )
            .in("internal_model_id", modelCandidates),
    ]);

    if (byApiModelResult.error && byInternalModelResult.error) return [];

    const providerRowById = new Map<string, any>();
    for (const row of byApiModelResult.data ?? []) {
        const key = typeof row?.provider_api_model_id === "string" ? row.provider_api_model_id : null;
        if (!key) continue;
        providerRowById.set(key, row);
    }
    for (const row of byInternalModelResult.data ?? []) {
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
        .eq("capability_id", args.endpoint)
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
            .eq("team_id", args.teamId)
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
        testingProviders.push({
            providerId,
            providerStatus: "active",
            providerRoutingStatus: "active",
            modelRoutingStatus: normalizeRoutingStatus(row?.routing_status),
            capabilityStatus: cap?.status ?? "active",
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
    teamId: string;
    model: string;
    endpoint: string;
    apiKeyId: string;
    includeTestingMode?: boolean;
    disableCache?: boolean;
}): Promise<GatewayContextData> {
    const supabase = getSupabaseAdmin();
    const cache = getCache();
    const versionToken = await keyVersionToken("id", args.apiKeyId);

    // Check if model is a preset
    const isPreset = args.model.startsWith("@");
    const testingModeCacheSegment = args.includeTestingMode ? "testing" : "default";
    const cacheKey = isPreset
        ? `${PRESET_CACHE_PREFIX}:${testingModeCacheSegment}:${args.teamId}:${args.model}:${args.endpoint}`
        : `${CONTEXT_CACHE_PREFIX}:${testingModeCacheSegment}:${args.teamId}:${args.apiKeyId}:${versionToken}:${args.endpoint}:${args.model}`;

    // Try cache first
    if (!args.disableCache) {
        try {
            const cached = await cache.get(cacheKey, "text");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (isContextLike(parsed)) {
                    return parsed;
                }
            }
        } catch {
            // ignore cache read failures
        }
    }

    async function fetchParsedContext(model: string): Promise<GatewayContextData> {
        const { data, error } = await supabase.rpc("gateway_fetch_request_context", {
            team_id: args.teamId,
            model,
            endpoint: args.endpoint,
            api_key_id: args.apiKeyId,
        });

        if (error) throw new Error(`gateway_context_rpc_error:${error.message ?? "unknown"}`);
        const payload = Array.isArray(data) ? (data.length ? data[0] : null) : data;
        if (!payload) throw new Error("gateway_context_rpc_empty");

        try {
            return contextSchema.parse(payload);
        } catch (e) {
            console.error("[context.ts] Zod parsing error:", e);
            console.error("[context.ts] Payload that failed:", payload);
            throw e;
        }
    }

    let parsed = await fetchParsedContext(args.model);

    // Fallback path for provider-scoped model slugs (e.g. mistral/mistral-medium-2508):
    // if RPC returned no providers and did not resolve the model, remap via provider_model_slug.
    const noProviders = (parsed.providers ?? []).length === 0;
    const unresolved = (parsed.resolvedModel ?? args.model) === args.model;
    if (noProviders && unresolved) {
        const remappedModel = await resolveProviderScopedModelToApiModel({
            model: args.model,
            endpoint: args.endpoint,
        });
        if (remappedModel && remappedModel !== args.model) {
            parsed = await fetchParsedContext(remappedModel);
        }
    }

    parsed = await backfillProviderModalities({
        parsed,
        requestedModel: args.model,
    });

    if (args.includeTestingMode) {
        try {
            const testingProviders = await fetchTestingProviderSnapshots({
                teamId: args.teamId,
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

    // Enrich with team settings + provider rollout statuses.
    parsed.teamSettings = {
        routingMode: null,
        byokFallbackEnabled: null,
        betaChannelEnabled: false,
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
                  .select("api_provider_id,status,routing_status")
                  .in("api_provider_id", providerIds)
            : Promise.resolve({ data: [], error: null } as any);

        const modelCandidates = Array.from(
            new Set(
                [parsed.resolvedModel, args.model]
                    .map((value) => String(value ?? "").trim())
                    .filter(Boolean)
            )
        );

        const modelStatusByKey = new Map<string, { status: RoutingStatus; sortTs: number }>();
        const setModelStatus = (row: any) => {
            const providerId = typeof row?.provider_id === "string" ? row.provider_id : null;
            if (!providerId) return;
            const providerModelSlug =
                row?.provider_model_slug === null || row?.provider_model_slug === undefined
                    ? ""
                    : String(row.provider_model_slug);
            const key = `${providerId}::${providerModelSlug}`;
            const sortTs = toMillis(row?.effective_from);
            const existing = modelStatusByKey.get(key);
            if (existing && existing.sortTs > sortTs) return;
            modelStatusByKey.set(key, {
                status: normalizeRoutingStatus(row?.routing_status),
                sortTs,
            });
        };

        const modelStatusQueries =
            providerIds.length && modelCandidates.length
                ? await Promise.all([
                      supabase
                          .from("data_api_provider_models")
                          .select("provider_api_model_id,provider_id,provider_model_slug,routing_status,effective_from,effective_to")
                          .in("provider_id", providerIds)
                          .in("api_model_id", modelCandidates),
                      supabase
                          .from("data_api_provider_models")
                          .select("provider_api_model_id,provider_id,provider_model_slug,routing_status,effective_from,effective_to")
                          .in("provider_id", providerIds)
                          .in("internal_model_id", modelCandidates),
                  ])
                : ([
                      { data: [], error: null },
                      { data: [], error: null },
                  ] as const);

        const modelStatusNowMs = Date.now();
        for (const result of modelStatusQueries) {
            if (result?.error) continue;
            for (const row of result.data ?? []) {
                if (!isWithinEffectiveWindow(row?.effective_from, row?.effective_to, modelStatusNowMs)) continue;
                setModelStatus(row);
            }
        }

        const providerModelById = new Map<string, { providerId: string; providerModelSlug: string }>();
        for (const result of modelStatusQueries) {
            if (result?.error) continue;
            for (const row of result.data ?? []) {
                const providerApiModelId = typeof row?.provider_api_model_id === "string" ? row.provider_api_model_id : null;
                const providerId = typeof row?.provider_id === "string" ? row.provider_id : null;
                if (!providerApiModelId || !providerId) continue;
                if (!isWithinEffectiveWindow(row?.effective_from, row?.effective_to, modelStatusNowMs)) continue;
                providerModelById.set(providerApiModelId, {
                    providerId,
                    providerModelSlug:
                        row?.provider_model_slug === null || row?.provider_model_slug === undefined
                            ? ""
                            : String(row.provider_model_slug),
                });
            }
        }

        const capabilityStatusByKey = new Map<string, { status: CapabilityRoutingStatus; sortTs: number }>();
        const providerApiModelIds = Array.from(providerModelById.keys());
        if (providerApiModelIds.length) {
            const { data: capabilityRows, error: capabilityError } = await supabase
                .from("data_api_provider_model_capabilities")
                .select("provider_api_model_id,status,updated_at,created_at")
                .eq("capability_id", args.endpoint)
                .in("status", [...ROUTABLE_CAPABILITY_STATUSES_WITH_TESTING])
                .in("provider_api_model_id", providerApiModelIds);
            if (!capabilityError) {
                for (const row of capabilityRows ?? []) {
                    const providerApiModelId = typeof row?.provider_api_model_id === "string" ? row.provider_api_model_id : null;
                    if (!providerApiModelId) continue;
                    const providerModel = providerModelById.get(providerApiModelId);
                    if (!providerModel) continue;
                    const key = `${providerModel.providerId}::${providerModel.providerModelSlug}`;
                    const sortTs = Math.max(toMillis(row?.updated_at), toMillis(row?.created_at));
                    const existing = capabilityStatusByKey.get(key);
                    if (existing && existing.sortTs > sortTs) continue;
                    capabilityStatusByKey.set(key, {
                        status: normalizeCapabilityStatus(row?.status),
                        sortTs,
                    });
                }
            }
        }

        const [settingsResult, providerStatusResult, teamResult] = await Promise.all([
            supabase
                .from("team_settings")
                .select("routing_mode,byok_fallback_enabled,beta_channel_enabled,cache_aware_routing_enabled")
                .eq("team_id", args.teamId)
                .maybeSingle(),
            providerStatusQuery,
            supabase
                .from("teams")
                .select("billing_mode")
                .eq("id", args.teamId)
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
                cacheAwareRoutingEnabled:
                    settingsResult.data?.cache_aware_routing_enabled ?? null,
                billingMode,
            };
        }

        const rolloutStatusByProvider = new Map<string, ProviderRolloutStatus>();
        const routingStatusByProvider = new Map<string, RoutingStatus>();
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
            }
        }

        parsed.providers = (parsed.providers ?? []).map((provider) => {
            const modelKey = `${provider.providerId}::${provider.providerModelSlug ?? ""}`;
            const capabilityStatus = capabilityStatusByKey.get(modelKey)?.status ?? normalizeCapabilityStatus(provider.capabilityStatus);
            return {
                ...provider,
                providerStatus: rolloutStatusByProvider.get(provider.providerId) ?? "active",
                providerRoutingStatus:
                    routingStatusByProvider.get(provider.providerId) ??
                    normalizeRoutingStatus(provider.providerRoutingStatus) ??
                    "active",
                modelRoutingStatus:
                    modelStatusByKey.get(modelKey)?.status ??
                    normalizeRoutingStatus(provider.modelRoutingStatus) ??
                    "active",
                capabilityStatus,
            };
        });
    } catch {
        // Keep defaults if enrichment fails, never block request path.
    }
    parsed.testingMode = Boolean(args.includeTestingMode);

    // Compute adaptive TTL based on data characteristics
    if (!args.disableCache) {
        try {
            let ttl: number;

        if (isPreset) {
            // Presets: use fixed TTL (config changes infrequently)
            ttl = PRESET_TTL;
        } else {
            // Regular models: compute adaptive TTL for dynamic data
            // Static data (providers/pricing) would ideally be cached separately
            // but for now we use adaptive TTL that favors longer caching
            const dynamicTtl = computeAdaptiveTtlForDynamic(parsed);

            // If limits are healthy, use longer TTL closer to static tier
            // If limits are stressed, use shorter TTL for more frequent updates
            if (!parsed.keyLimit.ok) {
                ttl = DYNAMIC_TTL_MIN;
            } else {
                const buckets = parsed.keyLimit.buckets;
                const maxPressure = Math.max(
                    bucketPressureScore(buckets?.daily),
                    bucketPressureScore(buckets?.weekly),
                    bucketPressureScore(buckets?.monthly)
                );

                // Low pressure -> cache longer (providers/pricing don't change often)
                // High pressure -> cache shorter (limits need frequent updates)
                if (maxPressure < 0.3) {
                    ttl = Math.min(STATIC_TTL_MIN, dynamicTtl * 3);
                } else {
                    ttl = dynamicTtl;
                }
            }
        }

            ttl = clampTtl(ttl);
            await cache.put(cacheKey, JSON.stringify(parsed), { expirationTtl: ttl });
        } catch {
            // ignore cache write failures
        }
    }

    return parsed;
}













