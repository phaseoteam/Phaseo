// lib/gateway/before/context.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Calls RPC/SQL to fetch provider, pricing, and gating context.

import { getSupabaseAdmin, getCache } from "@/runtime/env";
import { getProviderResidencyMetadata } from "@/lib/config/providerResidency";
import { getTextMany, keyVersionToken } from "@/core/kv";
import { gatewayCreditCacheKey } from "@/core/gateway-credit-cache";
import { bytesToString, decryptBYOK } from "@pipeline/byok/decrypt";
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
	computeCreditSnapshotTtlForContext,
	computeStaticTtl,
	isCreditContextLike,
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
export {
	computeBalanceAwareTtlSeconds,
	computeCreditSnapshotTtlSeconds,
} from "./context.shared";

const CONTEXT_CACHE_PREFIX = "gateway:context";

// Multi-tier caching constants (respecting Cloudflare KV 60s minimum)
const STATIC_CACHE_PREFIX = "gateway:static";
const DYNAMIC_CACHE_PREFIX = "gateway:dynamic";
const PRESET_CACHE_PREFIX = "gateway:preset";

const PRESET_TTL = 120;      // 2 minutes
const CONTEXT_INFLIGHT_MAX_ENTRIES = 512;
const CONTEXT_KEY_VERSION_L1_TTL_MS = 5_000;
const FREE_ROUTER_MODEL_ID = "phaseo/free";

const contextInflight = new Map<string, Promise<GatewayContextData>>();

async function hydrateByokKeys(
	context: GatewayContextData,
	workspaceId: string,
): Promise<GatewayContextData> {
	const providerIds = Array.from(new Set(
		(context.providers ?? []).map((provider) => provider.providerId).filter(Boolean),
	));
	if (!providerIds.length) return context;
	const keyIds = Array.from(new Set(
		(context.providers ?? []).flatMap((provider) =>
			(provider.byokMeta ?? []).map((key) => key.id).filter(Boolean),
		),
	));
	// The cached/RPC context contains only metadata. Avoid a Supabase read entirely
	// for the overwhelmingly common no-BYOK path.
	if (!keyIds.length) return context;

	const { data, error } = await getSupabaseAdmin()
		.from("byok_keys")
		.select("*")
		.eq("workspace_id", workspaceId)
		.eq("enabled", true)
		.in("id", keyIds)
		.in("provider_id", providerIds);
	if (error) {
		throw new Error(`byok_hydration_failed:${error.message ?? "unknown"}`);
	}
	if (!data?.length) {
		return {
			...context,
			providers: (context.providers ?? []).map((provider) => ({
				...provider,
				byokMeta: [],
			})),
		};
	}

	const decrypted = await Promise.all((data as any[]).map(async (row) => {
		try {
			const decryptedBytes = await decryptBYOK(row);
			let key: string;
			try {
				key = bytesToString(decryptedBytes);
			} finally {
				decryptedBytes.fill(0);
			}
			const legacyPriority = Boolean(row.always_use);
			return {
				id: String(row.id),
				providerId: String(row.provider_id),
				fingerprintSha256: String(row.fingerprint_sha256 ?? ""),
				keyVersion: row.key_version == null ? null : String(row.key_version),
				alwaysUse: legacyPriority,
				routingMode: row.routing_mode === "priority" || row.routing_mode === "fallback"
					? row.routing_mode
					: legacyPriority ? "priority" : "fallback",
				sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
				key,
				value: key,
			} satisfies ByokKeyMeta;
		} catch (cause) {
			console.error("[gateway] Failed to decrypt BYOK key", {
				workspaceId,
				providerId: row?.provider_id ?? null,
				keyId: row?.id ?? null,
				cause: cause instanceof Error ? cause.message : "unknown",
			});
			return null;
		}
	}));

	const byProvider = new Map<string, ByokKeyMeta[]>();
	for (const key of decrypted) {
		if (!key?.providerId) continue;
		const keys = byProvider.get(key.providerId) ?? [];
		keys.push(key);
		byProvider.set(key.providerId, keys);
	}
	for (const keys of byProvider.values()) {
		keys.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
	}

	return {
		...context,
		providers: (context.providers ?? []).map((provider) => ({
			...provider,
			byokMeta: byProvider.get(provider.providerId) ?? [],
		})),
	};
}

type ProviderScopedModelRow = {
    provider_api_model_id: string | null;
    api_model_id: string | null;
    effective_from: string | null;
    effective_to: string | null;
};

type FreeRouterProviderModelRow = {
    provider_api_model_id: string | null;
    provider_id: string | null;
    provider_model_slug: string | null;
    api_model_id: string | null;
    model_id?: string | null;
    routing_status: string | null;
    input_modalities: unknown;
    output_modalities: unknown;
    effective_from: string | null;
    effective_to: string | null;
};

function setToArrayOrNull(value: Set<string>): string[] | null {
    const list = Array.from(value).filter(Boolean);
    return list.length ? list : null;
}

function isFreeRouterModel(model: string): boolean {
    return model.trim().toLowerCase() === FREE_ROUTER_MODEL_ID;
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

function normalizePromptTrainingPolicy(value: unknown): GatewayProviderSnapshot["promptTrainingPolicy"] {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (
        normalized === "no_train" ||
        normalized === "may_train" ||
        normalized === "opt_out_available" ||
        normalized === "enterprise_no_train"
    ) {
        return normalized;
    }
    return "unknown";
}

function normalizeDataPolicyTier(value: unknown): GatewayProviderSnapshot["dataPolicyTier"] {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "private" || normalized === "logs" || normalized === "trains") {
        return normalized;
    }
    return "unknown";
}

function normalizeDataPolicyConfidence(value: unknown): GatewayProviderSnapshot["dataPolicyConfidence"] {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "confirmed" || normalized === "maybe") return normalized;
    return "unknown";
}

function normalizeDataPolicyContractMode(value: unknown): GatewayProviderSnapshot["dataPolicyContractMode"] {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "customer_agreement" || normalized === "enterprise_agreement") {
        return normalized;
    }
    return "none";
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
					routingMode: row.always_use ? "priority" : "fallback",
					sortOrder: 0,
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

async function fetchFreeRouterProviderPool(args: {
    endpoint: string;
}): Promise<Pick<GatewayContextData, "providers" | "pricing">> {
    const supabase = getSupabaseAdmin();
    const nowMs = Date.now();
    const { data: rows, error } = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id,provider_id,provider_model_slug,api_model_id,model_id,is_active_gateway,routing_status,effective_from,effective_to,input_modalities,output_modalities"
        )
        .eq("is_active_gateway", true)
        .like("api_model_id", "%:free");
    if (error || !rows?.length) return { providers: [], pricing: {} };

    const inWindowRows = (rows as FreeRouterProviderModelRow[])
        .filter((row) => typeof row.provider_api_model_id === "string" && row.provider_api_model_id.length > 0)
        .filter((row) => typeof row.provider_id === "string" && row.provider_id.length > 0)
        .filter((row) => typeof (row.api_model_id ?? row.model_id) === "string")
        .filter((row) => isWithinEffectiveWindow(row.effective_from, row.effective_to, nowMs));
    if (!inWindowRows.length) return { providers: [], pricing: {} };

    const modelIds = Array.from(
        new Set(
            inWindowRows
                .map((row) => row.api_model_id ?? row.model_id ?? null)
                .filter((modelId): modelId is string => typeof modelId === "string" && modelId.length > 0)
        )
    );
    if (!modelIds.length) return { providers: [], pricing: {} };

    const { data: modelRows, error: modelError } = await supabase
        .from("data_models")
        .select("model_id,hidden,status,deprecation_date,retirement_date")
        .in("model_id", modelIds);
    if (modelError) return { providers: [], pricing: {} };

    const activeModelIds = new Set(
        (modelRows ?? [])
            .filter((row: any) => row?.hidden !== true)
            .filter((row: any) => normalizeRoutingStatus(row?.status) === "active")
            .map((row: any) => row?.model_id)
            .filter((modelId: unknown): modelId is string => typeof modelId === "string" && modelId.length > 0)
    );
    if (!activeModelIds.size) return { providers: [], pricing: {} };

    const providerModelIds = Array.from(
        new Set(
            inWindowRows
                .map((row) => row.provider_api_model_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
    );
    const capabilityId = getContextCapabilityCandidates(args.endpoint, FREE_ROUTER_MODEL_ID)[0] ?? args.endpoint;
    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id,params,max_input_tokens,max_output_tokens,status,updated_at,created_at")
        .eq("capability_id", capabilityId)
        .in("status", [...ROUTABLE_CAPABILITY_STATUSES])
        .in("provider_api_model_id", providerModelIds);
    if (capabilityError) return { providers: [], pricing: {} };

    const capabilityByProviderModel = new Map<string, any>();
    for (const row of capabilityRows ?? []) {
        const providerApiModelId = row?.provider_api_model_id;
        if (typeof providerApiModelId !== "string" || !providerApiModelId.length) continue;
        capabilityByProviderModel.set(providerApiModelId, row);
    }

    const providerIds = Array.from(
        new Set(
            inWindowRows
                .map((row) => row.provider_id)
                .filter((providerId): providerId is string => typeof providerId === "string" && providerId.length > 0)
        )
    );
    const { data: providerRows, error: providerError } = await supabase
        .from("data_api_providers")
        .select("api_provider_id,status,routing_status")
        .in("api_provider_id", providerIds);
    if (providerError) return { providers: [], pricing: {} };

    const providerStatusById = new Map<string, { status: ProviderRolloutStatus; routingStatus: RoutingStatus }>();
    for (const row of providerRows ?? []) {
        const providerId = row?.api_provider_id;
        if (typeof providerId !== "string" || !providerId.length) continue;
        providerStatusById.set(providerId, {
            status: normalizeProviderStatus(row?.status),
            routingStatus: normalizeRoutingStatus(row?.routing_status),
        });
    }

    const providers: GatewayProviderSnapshot[] = [];
    const pricing: Record<string, any> = {};
    for (const row of inWindowRows) {
        const providerApiModelId = row.provider_api_model_id;
        const providerId = row.provider_id;
        const apiModelId = row.api_model_id ?? row.model_id ?? null;
        if (!providerApiModelId || !providerId || !apiModelId || !activeModelIds.has(apiModelId)) continue;

        const capability = capabilityByProviderModel.get(providerApiModelId);
        if (!capability) continue;

        const providerModelSlug =
            row.provider_model_slug === null || row.provider_model_slug === undefined
                ? null
                : String(row.provider_model_slug);
        const providerStatus = providerStatusById.get(providerId);
        const residency = getProviderResidencyMetadata({
            providerId,
            providerModelSlug,
        });
        const pricingKey = `${providerId}:${apiModelId}`;
        providers.push({
            providerId,
            providerStatus: providerStatus?.status ?? "not_ready",
            providerRoutingStatus: providerStatus?.routingStatus ?? "disabled",
            modelRoutingStatus: normalizeRoutingStatus(row.routing_status),
            capabilityStatus: normalizeCapabilityStatus(capability.status),
            residencyMode: residency.residencyMode,
            executionRegions: residency.executionRegions,
            dataRegions: residency.dataRegions,
            zeroDataRetention: residency.zeroDataRetention,
            supportsEndpoint: true,
            baseWeight: 1,
            byokMeta: [],
            providerModelSlug,
            apiModelId,
            pricingKey,
            capabilityParams: (capability.params && typeof capability.params === "object" ? capability.params : {}) as Record<string, any>,
            maxInputTokens:
                capability.max_input_tokens === null || capability.max_input_tokens === undefined
                    ? null
                    : Number(capability.max_input_tokens),
            maxOutputTokens:
                capability.max_output_tokens === null || capability.max_output_tokens === undefined
                    ? null
                    : Number(capability.max_output_tokens),
        });

        const card = await loadPriceCard(providerId, apiModelId, args.endpoint);
        if (card) {
            pricing[pricingKey] = card;
        }
    }

    return { providers, pricing };
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
    const creditCacheKey = gatewayCreditCacheKey(args.workspaceId);
    const staticCacheKey = isPreset
        ? `${PRESET_CACHE_PREFIX}:${testingModeCacheSegment}:${args.workspaceId}:${args.model}:${args.endpoint}`
        : `${STATIC_CACHE_PREFIX}:${testingModeCacheSegment}:${args.workspaceId}:${args.endpoint}:${args.model}`;
    const compositionCacheKey = `${CONTEXT_CACHE_PREFIX}:compose:${testingModeCacheSegment}:${args.workspaceId}:${args.apiKeyId}:${versionToken}:${args.endpoint}:${args.model}`;

    // Try split cache first (parallel read of dynamic and static segments).
    if (shouldUseCache) {
        const cacheReadStartedAt = performance.now();
        try {
            const cachedValues = await getTextMany([
                dynamicCacheKey,
                staticCacheKey,
                creditCacheKey,
            ]);
            const dynamicCachedRaw = cachedValues[dynamicCacheKey] ?? null;
            const staticCachedRaw = cachedValues[staticCacheKey] ?? null;
            const creditCachedRaw = cachedValues[creditCacheKey] ?? null;
            telemetry.cacheReadMs = round3(performance.now() - cacheReadStartedAt);
            if (dynamicCachedRaw && staticCachedRaw) {
                const dynamicParsed = JSON.parse(dynamicCachedRaw);
                const staticParsed = JSON.parse(staticCachedRaw);
                if (isDynamicContextLike(dynamicParsed) && isStaticContextLike(staticParsed)) {
                    const creditParsed = creditCachedRaw ? JSON.parse(creditCachedRaw) : null;
                    const creditContext = isCreditContextLike(creditParsed) ? creditParsed : null;
                    const merged = mergeCachedContext({
                        dynamic: dynamicParsed,
                        static: staticParsed,
                        credit: creditContext,
                        endpoint: args.endpoint,
                    });
					return hydrateByokKeys({
                        ...merged,
                        contextTelemetry: {
                            ...telemetry,
                            cacheStatus: "hit",
                            totalMs: round3(performance.now() - fetchStartedAt),
                        },
					}, args.workspaceId);
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
			return inflight.then((value) =>
				hydrateByokKeys(cloneGatewayContextData(value), args.workspaceId),
			);
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
        if (noProviders && unresolved && !isFreeRouterModel(args.model)) {
            const remappedModel = await resolveProviderScopedModelToApiModel({
                model: args.model,
                endpoint: contextCapability,
            });
            if (remappedModel && remappedModel !== args.model) {
                telemetry.fallbackRemap = true;
                parsed = await fetchParsedContextMeasured(remappedModel, contextCapability);
            }
        }
        if (noProviders && isFreeRouterModel(args.model)) {
            const freeRouterPool = await fetchFreeRouterProviderPool({
                endpoint: contextCapability,
            });
            if ((freeRouterPool.providers ?? []).length > 0) {
                parsed = {
                    ...parsed,
                    resolvedModel: FREE_ROUTER_MODEL_ID,
                    providers: freeRouterPool.providers ?? [],
                    pricing: {
                        ...(parsed.pricing ?? {}),
                        ...(freeRouterPool.pricing ?? {}),
                    },
                };
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
        if ((parsed.providers ?? []).length > 0 && !isFreeRouterModel(args.model)) {
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
        if (!isFreeRouterModel(args.model)) {
            parsed = await backfillProviderModalities({
                parsed,
                requestedModel: args.model,
            });
        }

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
        if ((parsed.providers ?? []).length > 0 && !isFreeRouterModel(args.model)) {
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
            byokFallbackEnabled: false,
            betaChannelEnabled: false,
            alphaChannelEnabled: false,
            cacheAwareRoutingEnabled: null,
            privacyZdrOnly: true,
            privacyEnablePaidMayTrain: false,
            privacyEnableFreeMayTrain: false,
            privacyEnableInputOutputLogging: false,
            ioLoggingEnabled: false,
            ioLoggingIncludeProviderPayloads: false,
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
                    .from("v2_providers")
                    .select("provider_slug,status,routing_enabled,provider_family_slug,offer_scope,offer_label,residency_mode,default_execution_regions,default_data_regions,zero_data_retention,prompt_training_policy,data_policy_tier,data_policy_confidence,data_policy_contract_mode,data_policy_variant,stream_cancellation_support,stream_cancellation_stops_provider_billing,stream_cancellation_usage_recovery,stream_cancellation_evidence_kind,stream_cancellation_source_url")
                    .in("provider_slug", providerIds)
                : Promise.resolve({ data: [], error: null } as any);

            const settingsQuery = (async () => {
                const columns = "routing_mode,byok_fallback_enabled,beta_channel_enabled,alpha_channel_enabled,privacy_zdr_only,privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_input_output_logging,io_logging_enabled,io_logging_include_provider_payloads";
                const withCacheAwareRouting = await supabase
                    .from("workspace_settings")
                    .select(`${columns},cache_aware_routing_enabled`)
                    .eq("workspace_id", args.workspaceId)
                    .maybeSingle();
                if (!withCacheAwareRouting.error) return withCacheAwareRouting;

                const code = String(withCacheAwareRouting.error.code ?? "").trim();
                const message = String(withCacheAwareRouting.error.message ?? "").toLowerCase();
                const isMissingCacheAwareRouting =
                    (code === "PGRST204" || code === "42703") &&
                    message.includes("cache_aware_routing_enabled");
                if (!isMissingCacheAwareRouting) return withCacheAwareRouting;

                return supabase
                    .from("workspace_settings")
                    .select(columns)
                    .eq("workspace_id", args.workspaceId)
                    .maybeSingle();
            })();

            const [settingsResult, providerStatusResult, teamResult] = await Promise.all([
                settingsQuery,
                providerStatusQuery,
                supabase
                    .from("workspaces")
                    .select("billing_mode")
                    .eq("id", args.workspaceId)
                    .maybeSingle(),
            ]);

            if (settingsResult?.error) {
                throw new Error(`workspace_settings_enrichment_failed:${settingsResult.error.message ?? "unknown"}`);
            }
            if (!settingsResult?.data) {
                throw new Error("workspace_settings_enrichment_missing");
            }
            if (providerStatusResult?.error) {
                throw new Error(`provider_status_enrichment_failed:${providerStatusResult.error.message ?? "unknown"}`);
            }
            if (teamResult?.error || !teamResult?.data) {
                throw new Error(`workspace_billing_enrichment_failed:${teamResult?.error?.message ?? "missing"}`);
            }

            const rawBillingMode = String(teamResult.data.billing_mode ?? "").trim().toLowerCase();
            if (rawBillingMode !== "wallet" && rawBillingMode !== "invoice") {
                throw new Error("workspace_billing_mode_invalid");
            }
            const cacheAwareRoutingEnabled = (
                settingsResult.data as Record<string, unknown>
            ).cache_aware_routing_enabled;
            parsed.teamSettings = {
                routingMode: settingsResult.data.routing_mode ?? null,
                byokFallbackEnabled: settingsResult.data.byok_fallback_enabled === true,
                betaChannelEnabled: settingsResult.data.beta_channel_enabled === true,
                alphaChannelEnabled: settingsResult.data.alpha_channel_enabled === true,
                cacheAwareRoutingEnabled:
                    typeof cacheAwareRoutingEnabled === "boolean"
                        ? cacheAwareRoutingEnabled
                        : null,
                privacyZdrOnly: settingsResult.data.privacy_zdr_only === true,
                privacyEnablePaidMayTrain:
                    settingsResult.data.privacy_enable_paid_may_train === true,
                privacyEnableFreeMayTrain:
                    settingsResult.data.privacy_enable_free_may_train === true,
                privacyEnableInputOutputLogging:
                    settingsResult.data.privacy_enable_input_output_logging === true,
                ioLoggingEnabled: settingsResult.data.io_logging_enabled === true,
                ioLoggingIncludeProviderPayloads:
                    settingsResult.data.io_logging_include_provider_payloads === true,
                billingMode: rawBillingMode,
            };

            const rolloutStatusByProvider = new Map<string, ProviderRolloutStatus>();
            const routingStatusByProvider = new Map<string, RoutingStatus>();
            const providerFamilyByProvider = new Map<string, string | null>();
            const offerScopeByProvider = new Map<string, GatewayProviderSnapshot["offerScope"]>();
            const offerLabelByProvider = new Map<string, string | null>();
			const dataPolicyVariantByProvider = new Map<string, GatewayProviderSnapshot["dataPolicyVariant"]>();
			const residencyModeByProvider = new Map<string, GatewayProviderSnapshot["residencyMode"]>();
			const executionRegionsByProvider = new Map<string, string[] | null>();
			const dataRegionsByProvider = new Map<string, string[] | null>();
			const zeroDataRetentionByProvider = new Map<string, GatewayProviderSnapshot["zeroDataRetention"]>();
            const promptTrainingPolicyByProvider = new Map<string, GatewayProviderSnapshot["promptTrainingPolicy"]>();
            const dataPolicyTierByProvider = new Map<string, GatewayProviderSnapshot["dataPolicyTier"]>();
            const dataPolicyConfidenceByProvider = new Map<string, GatewayProviderSnapshot["dataPolicyConfidence"]>();
            const dataPolicyContractModeByProvider = new Map<string, GatewayProviderSnapshot["dataPolicyContractMode"]>();
            const streamCancellationSupportByProvider = new Map<string, GatewayProviderSnapshot["streamCancellationSupport"]>();
            const streamCancellationStopsBillingByProvider = new Map<string, boolean | null>();
            const streamCancellationUsageRecoveryByProvider = new Map<string, GatewayProviderSnapshot["streamCancellationUsageRecovery"]>();
            const streamCancellationEvidenceKindByProvider = new Map<string, GatewayProviderSnapshot["streamCancellationEvidenceKind"]>();
            const streamCancellationSourceUrlByProvider = new Map<string, string | null>();
			const normalizeRegions = (value: unknown): string[] | null =>
				Array.isArray(value)
					? value.map(String).map((region) => region.trim().toLowerCase()).filter(Boolean)
					: null;
            if (!providerStatusResult?.error) {
                for (const row of providerStatusResult.data ?? []) {
                    const providerId = typeof row?.provider_slug === "string"
                        ? row.provider_slug
                        : null;
                    if (!providerId) continue;
                    rolloutStatusByProvider.set(
                        providerId,
                        normalizeProviderStatus(row.status),
                    );
                    routingStatusByProvider.set(
                        providerId,
                        row.routing_enabled === true ? "active" : "disabled",
                    );
                    providerFamilyByProvider.set(
                        providerId,
                        typeof row.provider_family_slug === "string" && row.provider_family_slug.trim().length > 0
                            ? row.provider_family_slug
                            : null,
                    );
                    offerScopeByProvider.set(
                        providerId,
                        row.offer_scope === "global" || row.offer_scope === "regional" || row.offer_scope === "specialized"
                            ? row.offer_scope
                            : null,
                    );
                    offerLabelByProvider.set(
                        providerId,
                        typeof row.offer_label === "string" && row.offer_label.trim().length > 0
                            ? row.offer_label
                            : null,
                    );
					dataPolicyVariantByProvider.set(
						providerId,
						row.data_policy_variant === "zdr" ? "zdr" : "standard",
					);
					residencyModeByProvider.set(
						providerId,
						row.residency_mode === "provider_managed" ||
						row.residency_mode === "customer_selectable" ||
						row.residency_mode === "account_selected"
							? row.residency_mode
							: "unknown",
					);
					executionRegionsByProvider.set(
						providerId,
						normalizeRegions(row.default_execution_regions),
					);
					dataRegionsByProvider.set(
						providerId,
						normalizeRegions(row.default_data_regions),
					);
					zeroDataRetentionByProvider.set(
						providerId,
						row.zero_data_retention === "unsupported" ||
						row.zero_data_retention === "optional" ||
						row.zero_data_retention === "default"
							? row.zero_data_retention
							: "unknown",
					);
                    promptTrainingPolicyByProvider.set(
                        providerId,
                        normalizePromptTrainingPolicy(row.prompt_training_policy),
                    );
                    dataPolicyTierByProvider.set(
                        providerId,
                        normalizeDataPolicyTier(row.data_policy_tier),
                    );
                    dataPolicyConfidenceByProvider.set(
                        providerId,
                        normalizeDataPolicyConfidence(row.data_policy_confidence),
                    );
                    dataPolicyContractModeByProvider.set(
                        providerId,
                        normalizeDataPolicyContractMode(row.data_policy_contract_mode),
                    );
                    streamCancellationSupportByProvider.set(
                        providerId,
                        row.stream_cancellation_support === "supported" || row.stream_cancellation_support === "unsupported"
                            ? row.stream_cancellation_support
                            : "unknown",
                    );
                    streamCancellationStopsBillingByProvider.set(
                        providerId,
                        typeof row.stream_cancellation_stops_provider_billing === "boolean"
                            ? row.stream_cancellation_stops_provider_billing
                            : null,
                    );
                    streamCancellationUsageRecoveryByProvider.set(
                        providerId,
                        row.stream_cancellation_usage_recovery === "authoritative" ? "authoritative" : "unknown",
                    );
                    streamCancellationEvidenceKindByProvider.set(
                        providerId,
                        row.stream_cancellation_evidence_kind === "provider" || row.stream_cancellation_evidence_kind === "aggregator"
                            ? row.stream_cancellation_evidence_kind
                            : "none",
                    );
                    streamCancellationSourceUrlByProvider.set(
                        providerId,
                        typeof row.stream_cancellation_source_url === "string" && row.stream_cancellation_source_url.trim()
                            ? row.stream_cancellation_source_url
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
					dataPolicyVariant:
						dataPolicyVariantByProvider.get(provider.providerId) ??
						provider.dataPolicyVariant ??
						"standard",
                    providerStatus:
                        rolloutStatusByProvider.get(provider.providerId) ??
                        (provider.providerStatus == null
                            ? "not_ready"
                            : normalizeProviderStatus(provider.providerStatus)),
                    providerRoutingStatus:
                        routingStatusByProvider.get(provider.providerId) ??
                        (provider.providerRoutingStatus == null
                            ? "disabled"
                            : normalizeRoutingStatus(provider.providerRoutingStatus)),
                    modelRoutingStatus:
                        provider.modelRoutingStatus == null
                            ? "disabled"
                            : normalizeRoutingStatus(provider.modelRoutingStatus),
                    capabilityStatus:
                        provider.capabilityStatus == null
                            ? "disabled"
                            : normalizeCapabilityStatus(provider.capabilityStatus),
                    residencyMode:
						residencyModeByProvider.get(provider.providerId) ??
						provider.residencyMode ??
						residency.residencyMode,
                    executionRegions:
						executionRegionsByProvider.get(provider.providerId) ??
						provider.executionRegions ??
						residency.executionRegions,
					dataRegions:
						dataRegionsByProvider.get(provider.providerId) ??
						provider.dataRegions ??
						residency.dataRegions,
                    zeroDataRetention:
						zeroDataRetentionByProvider.get(provider.providerId) ??
						provider.zeroDataRetention ??
						residency.zeroDataRetention,
                    promptTrainingPolicy:
                        promptTrainingPolicyByProvider.get(provider.providerId) ??
                        provider.promptTrainingPolicy ??
                        "unknown",
                    dataPolicyTier:
                        dataPolicyTierByProvider.get(provider.providerId) ??
                        provider.dataPolicyTier ??
                        "unknown",
                    dataPolicyConfidence:
                        dataPolicyConfidenceByProvider.get(provider.providerId) ??
                        provider.dataPolicyConfidence ??
                        "unknown",
                    dataPolicyContractMode:
                        dataPolicyContractModeByProvider.get(provider.providerId) ??
                        provider.dataPolicyContractMode ??
                        "none",
                    streamCancellationSupport:
                        streamCancellationSupportByProvider.get(provider.providerId) ??
                        provider.streamCancellationSupport ??
                        "unknown",
                    streamCancellationStopsProviderBilling:
                        streamCancellationStopsBillingByProvider.get(provider.providerId) ??
                        provider.streamCancellationStopsProviderBilling ??
                        null,
                    streamCancellationUsageRecovery:
                        streamCancellationUsageRecoveryByProvider.get(provider.providerId) ??
                        provider.streamCancellationUsageRecovery ??
                        "unknown",
                    streamCancellationEvidenceKind:
                        streamCancellationEvidenceKindByProvider.get(provider.providerId) ??
                        provider.streamCancellationEvidenceKind ??
                        "none",
                    streamCancellationSourceUrl:
                        streamCancellationSourceUrlByProvider.get(provider.providerId) ??
                        provider.streamCancellationSourceUrl ??
                        null,
                };
            });
        } catch (error) {
            console.error("[context] security enrichment failed", {
                workspaceId: args.workspaceId,
                model: args.model,
                endpoint: args.endpoint,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
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
                const creditTtl = clampTtl(computeCreditSnapshotTtlForContext(parsed));
                await Promise.all([
                    cache.put(dynamicCacheKey, JSON.stringify(split.dynamic), { expirationTtl: dynamicTtl }),
                    cache.put(staticCacheKey, JSON.stringify(split.static), { expirationTtl: staticTtl }),
                    cache.put(creditCacheKey, JSON.stringify(split.credit), { expirationTtl: creditTtl }),
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
		return await hydrateByokKeys(await dbLoader, args.workspaceId);
    } finally {
        if (inflightKey && contextInflight.get(inflightKey) === dbLoader) {
            contextInflight.delete(inflightKey);
        }
    }
}













