import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { normalizeQuantizationScheme } from "@/lib/quantization";

export interface GatewayProviderDetails {
    api_provider_id: string;
    api_provider_name: string;
    link?: string | null;
    country_code?: string | null;
}

export interface GatewayProviderModel {
	id: string;
	api_provider_id: string;
	provider_model_slug?: string | null;
	quantization_scheme?: string | null;
	context_length?: number | null;
	model_id: string;
	endpoint: string;
	is_active_gateway: boolean;
	availability_status: "active" | "coming_soon" | "inactive";
	availability_reason?:
		| "active"
		| "preview_only"
		| "gated"
		| "access_limited"
		| "region_limited"
		| "project_limited"
		| "paused"
		| "soft_blocked"
		| "deranked_lvl1"
		| "deranked_lvl2"
		| "deranked_lvl3"
		| "internal_testing"
		| "scheduled"
		| "coming_soon"
		| "provider_disabled"
		| "model_disabled"
		| "capability_disabled"
		| "provider_not_ready"
		| "provider_inactive"
		| "inactive"
		| "retired";
	provider_status?: string | null;
	provider_routing_status?: string | null;
	model_routing_status?: string | null;
	capability_status?: string | null;
	input_modalities: string;
	output_modalities: string;
	max_input_tokens?: number | null;
	max_output_tokens?: number | null;
	effective_from?: string | null;
	effective_to?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	provider?: GatewayProviderDetails | null;
}

export interface ModelGatewayMetadata {
    modelId: string;
    aliases: string[];
    apiModelIds: string[];
    primaryModelIdentifier: string;
    acceptedModelIdentifiers: string[];
    primaryModelIdentifierByEndpoint: Record<string, string>;
    acceptedModelIdentifiersByEndpoint: Record<string, string[]>;
    providers: GatewayProviderModel[];
    activeProviders: GatewayProviderModel[];
    comingSoonProviders: GatewayProviderModel[];
    inactiveProviders: GatewayProviderModel[];
}

type ProviderModelRow = Record<string, any>;

const normalizeIdentifier = (value: string | null | undefined): string | null => {
    const normalized = value?.trim();
    return normalized ? normalized : null;
};

const dedupeIdentifiers = (values: Array<string | null | undefined>): string[] =>
    Array.from(
        new Set(
            values
                .map((value) => normalizeIdentifier(value))
                .filter((value): value is string => Boolean(value))
        )
    );

const sortApiModelIdsByRank = (
    ids: string[],
    rank: Map<string, number>
): string[] =>
    [...ids].sort((a, b) => {
        const aRank = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
        const bRank = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.localeCompare(b);
    });

function isFutureEffectiveWindow(
	effectiveFrom?: string | null,
	now: Date = new Date()
): boolean {
	if (!effectiveFrom) return false;
	const from = new Date(effectiveFrom);
	return Number.isFinite(from.getTime()) && now < from;
}

function isExpiredEffectiveWindow(
	effectiveTo?: string | null,
	now: Date = new Date()
): boolean {
	if (!effectiveTo) return false;
	const to = new Date(effectiveTo);
	return Number.isFinite(to.getTime()) && now >= to;
}

function normalizeStatusValue(value: unknown): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return normalized || null;
}

function isPublicRoutingStatus(status: string | null): boolean {
	return (
		status === null ||
		status === "active" ||
		status === "deranked_lvl1" ||
		status === "deranked_lvl2" ||
		status === "deranked_lvl3"
	);
}

function resolveAvailabilityStatus(args: {
	isActiveGateway: boolean;
	providerStatus: string | null;
	providerRoutingStatus: string | null;
	modelRoutingStatus: string | null;
	capabilityStatus: string | null;
	effectiveFrom?: string | null;
	effectiveTo?: string | null;
	now?: Date;
}): "active" | "coming_soon" | "inactive" {
	const now = args.now ?? new Date();

	if (isExpiredEffectiveWindow(args.effectiveTo, now)) return "inactive";
	if (isFutureEffectiveWindow(args.effectiveFrom, now)) return "coming_soon";
	if (args.providerStatus === "beta" || args.providerStatus === "alpha") {
		return "coming_soon";
	}
	if (!args.isActiveGateway) return "inactive";
	if (args.providerStatus && args.providerStatus !== "active") return "inactive";
	if (!isPublicRoutingStatus(args.providerRoutingStatus)) return "inactive";
	if (!isPublicRoutingStatus(args.modelRoutingStatus)) return "inactive";
	if (args.capabilityStatus === "internal_testing") return "coming_soon";
	if (args.capabilityStatus === "coming_soon") return "coming_soon";
	if (args.capabilityStatus && args.capabilityStatus !== "active") return "inactive";
	return "active";
}

function resolveAvailabilityReason(args: {
	isActiveGateway: boolean;
	providerStatus: string | null;
	providerRoutingStatus: string | null;
	modelRoutingStatus: string | null;
	capabilityStatus: string | null;
	effectiveFrom?: string | null;
	effectiveTo?: string | null;
	now?: Date;
}):
	| "active"
	| "preview_only"
	| "gated"
	| "access_limited"
	| "region_limited"
	| "project_limited"
	| "paused"
	| "soft_blocked"
	| "deranked_lvl1"
	| "deranked_lvl2"
	| "deranked_lvl3"
	| "internal_testing"
	| "scheduled"
	| "coming_soon"
	| "provider_disabled"
	| "model_disabled"
	| "capability_disabled"
	| "provider_not_ready"
	| "provider_inactive"
	| "inactive"
	| "retired" {
	const now = args.now ?? new Date();

	if (isExpiredEffectiveWindow(args.effectiveTo, now)) return "retired";
	if (isFutureEffectiveWindow(args.effectiveFrom, now)) return "scheduled";
	if (args.providerStatus === "beta" || args.providerStatus === "alpha")
		return "preview_only";
	if (args.providerStatus === "not_ready") return "provider_not_ready";
	if (args.providerStatus === "gated") return "gated";
	if (args.providerStatus === "access_limited") return "access_limited";
	if (args.providerStatus === "region_limited") return "region_limited";
	if (args.providerStatus === "project_limited") return "project_limited";
	if (args.providerStatus === "paused") return "paused";
	if (args.providerStatus === "soft_blocked") return "soft_blocked";
	if (args.providerStatus && args.providerStatus !== "active") return "provider_inactive";
	if (args.providerRoutingStatus === "disabled") return "provider_disabled";
	if (args.modelRoutingStatus === "disabled") return "model_disabled";
	if (args.capabilityStatus === "disabled") return "capability_disabled";
	if (
		args.providerRoutingStatus === "deranked_lvl1" ||
		args.providerRoutingStatus === "deranked_lvl2" ||
		args.providerRoutingStatus === "deranked_lvl3"
	) {
		return args.providerRoutingStatus;
	}
	if (
		args.modelRoutingStatus === "deranked_lvl1" ||
		args.modelRoutingStatus === "deranked_lvl2" ||
		args.modelRoutingStatus === "deranked_lvl3"
	) {
		return args.modelRoutingStatus;
	}
	if (args.capabilityStatus === "internal_testing") return "internal_testing";
	if (!args.isActiveGateway) return "inactive";
	if (args.capabilityStatus === "coming_soon") return "coming_soon";
	if (args.capabilityStatus && args.capabilityStatus !== "active") return "inactive";
	return "active";
}

export default async function getModelGatewayMetadata(
    modelId: string,
    includeHidden: boolean
): Promise<ModelGatewayMetadata> {
    const supabase = await createClient();

    const { data: modelRow, error: modelError } = await supabase
        .from("data_models")
        .select("hidden")
        .eq("model_id", modelId)
        .maybeSingle();

    if (modelError) {
        throw new Error(modelError.message ?? "Failed to load model metadata");
    }
    if (modelRow && !includeHidden && modelRow.hidden) {
        throw new Error("Model not found");
    }

	let providerModels: ProviderModelRow[] | null = null;
	let providerError: { message?: string } | null = null;
	{
		const [byInternalRes, byApiRes] = await Promise.all([
			supabase
				.from("data_api_provider_models")
				.select(
					"provider_api_model_id, provider_id, api_model_id, model_id, provider_model_slug, is_active_gateway, routing_status, input_modalities, output_modalities, quantization_scheme, context_length, effective_from, effective_to, created_at, updated_at"
				)
				.eq("model_id", modelId),
			supabase
				.from("data_api_provider_models")
				.select(
					"provider_api_model_id, provider_id, api_model_id, model_id, provider_model_slug, is_active_gateway, routing_status, input_modalities, output_modalities, quantization_scheme, context_length, effective_from, effective_to, created_at, updated_at"
				)
				.eq("api_model_id", modelId),
		]);

		if (byInternalRes.error && byApiRes.error) {
			providerError = byInternalRes.error;
			providerModels = null;
		} else {
			const byProviderApiModelId = new Map<string, ProviderModelRow>();
			for (const row of [...(byInternalRes.data ?? []), ...(byApiRes.data ?? [])]) {
				const key = String(row?.provider_api_model_id ?? "").trim();
				if (!key) continue;
				byProviderApiModelId.set(key, row);
			}
			providerModels = Array.from(byProviderApiModelId.values());
			providerError = byInternalRes.error ?? byApiRes.error ?? null;
		}
	}

    if (providerError) {
        throw new Error(providerError.message ?? "Failed to load gateway providers");
    }

    const providerModelIds = (providerModels ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    const apiModelStats = new Map<
        string,
        { activeCount: number; totalCount: number }
    >();
    for (const row of providerModels ?? []) {
        const apiModelId = row.api_model_id?.trim();
        if (!apiModelId) continue;
        const current = apiModelStats.get(apiModelId) ?? {
            activeCount: 0,
            totalCount: 0,
        };
        current.totalCount += 1;
        if (
            row.is_active_gateway &&
			!isFutureEffectiveWindow(row.effective_from) &&
			!isExpiredEffectiveWindow(row.effective_to)
        ) {
            current.activeCount += 1;
        }
        apiModelStats.set(apiModelId, current);
    }
    const apiModelIds = Array.from(apiModelStats.entries())
        .sort((a, b) => {
            if (a[1].activeCount !== b[1].activeCount) {
                return b[1].activeCount - a[1].activeCount;
            }
            if (a[1].totalCount !== b[1].totalCount) {
                return b[1].totalCount - a[1].totalCount;
            }
            return a[0].localeCompare(b[0]);
        })
        .map(([apiModelId]) => apiModelId);

	const { data: caps, error: capsError } = await supabase
		.from("data_api_provider_model_capabilities")
		.select(
			"provider_api_model_id, capability_id, params, status, max_input_tokens, max_output_tokens"
		)
		.in("provider_api_model_id", providerModelIds);

    if (capsError) {
        throw new Error(capsError.message ?? "Failed to load gateway capabilities");
    }

    const providerIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.provider_id).filter(Boolean))
    );
    const { data: providersData } = await supabase
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name, link, country_code, status, routing_status")
        .in("api_provider_id", providerIds);

    const providerMap = new Map<string, GatewayProviderDetails & {
		status?: string | null;
		routing_status?: string | null;
	}>();
    for (const provider of providersData ?? []) {
        if (!provider.api_provider_id) continue;
        providerMap.set(provider.api_provider_id, {
            api_provider_id: provider.api_provider_id,
            api_provider_name: provider.api_provider_name ?? provider.api_provider_id,
            link: provider.link ?? null,
            country_code: provider.country_code ?? null,
			status: provider.status ?? null,
			routing_status: provider.routing_status ?? null,
        });
    }

	const providerModelMap = new Map<string, ProviderModelRow>();
	for (const row of providerModels ?? []) {
		if (!row.provider_api_model_id) continue;
		providerModelMap.set(row.provider_api_model_id, row);
	}

	const providers: GatewayProviderModel[] = [];
	const now = new Date();
	for (const cap of caps ?? []) {
		const pm = providerModelMap.get(cap.provider_api_model_id);
		if (!pm || !cap.capability_id) continue;
		const providerDetails = providerMap.get(pm.provider_id) ?? null;
		const providerStatus = normalizeStatusValue(providerDetails?.status ?? null);
		const providerRoutingStatus = normalizeStatusValue(
			providerDetails?.routing_status ?? null
		);
		const modelRoutingStatus = normalizeStatusValue(pm.routing_status ?? null);
		const capabilityStatus = normalizeStatusValue(cap.status ?? null);
		providers.push({
			id: pm.provider_api_model_id,
			api_provider_id: pm.provider_id,
			provider_model_slug: pm.provider_model_slug,
			quantization_scheme: normalizeQuantizationScheme(
				pm.quantization_scheme ?? null
			),
			context_length: pm.context_length ?? null,
			model_id: pm.api_model_id,
			endpoint: cap.capability_id,
			is_active_gateway: pm.is_active_gateway,
			availability_status: resolveAvailabilityStatus({
				isActiveGateway: Boolean(pm.is_active_gateway),
				providerStatus,
				providerRoutingStatus,
				modelRoutingStatus,
				capabilityStatus,
				effectiveFrom: pm.effective_from,
				effectiveTo: pm.effective_to,
				now,
			}),
			availability_reason: resolveAvailabilityReason({
				isActiveGateway: Boolean(pm.is_active_gateway),
				providerStatus,
				providerRoutingStatus,
				modelRoutingStatus,
				capabilityStatus,
				effectiveFrom: pm.effective_from,
				effectiveTo: pm.effective_to,
				now,
			}),
			provider_status: providerStatus,
			provider_routing_status: providerRoutingStatus,
			model_routing_status: modelRoutingStatus,
			capability_status: capabilityStatus,
			input_modalities: Array.isArray(pm.input_modalities)
				? pm.input_modalities.join(",")
				: pm.input_modalities ?? "",
			output_modalities: Array.isArray(pm.output_modalities)
				? pm.output_modalities.join(",")
				: pm.output_modalities ?? "",
			max_input_tokens: cap.max_input_tokens ?? null,
			max_output_tokens: cap.max_output_tokens ?? null,
			effective_from: pm.effective_from,
			effective_to: pm.effective_to,
			created_at: pm.created_at,
			updated_at: pm.updated_at,
            provider: providerDetails,
        });
    }

    // console.log("[fetch] Fetching aliases for model", modelId);

    const aliasLookupIds = Array.from(new Set([modelId, ...apiModelIds]));
    const { data: aliasesResponse, error: aliasesError } = await supabase
        .from("data_api_model_aliases")
        .select("api_model_id, alias_slug")
        .in("api_model_id", aliasLookupIds)
        .eq("is_enabled", true)
        .order("api_model_id", { ascending: true })
        .order("alias_slug", { ascending: true });

    // console.log("[fetch] aliasesResponse:", JSON.stringify(aliasesResponse, null, 2));

    if (aliasesError) {
        throw new Error(aliasesError.message ?? "Failed to load model aliases");
    }

    const aliasRows = (aliasesResponse ?? []) as {
        api_model_id: string;
        alias_slug: string;
    }[];
    const activeProviders = providers.filter(
        (provider) => provider.availability_status === "active"
    );

    const comingSoonProviders = providers.filter(
		(provider) => provider.availability_status === "coming_soon"
	);

    const inactiveProviders = providers.filter(
        (provider) => provider.availability_status === "inactive"
    );

    const aliasRowsByApiModelId = new Map<string, string[]>();
    for (const alias of aliasRows) {
        const apiModelId = normalizeIdentifier(alias.api_model_id);
        const aliasSlug = normalizeIdentifier(alias.alias_slug);
        if (!apiModelId || !aliasSlug) continue;
        const current = aliasRowsByApiModelId.get(apiModelId) ?? [];
        current.push(aliasSlug);
        aliasRowsByApiModelId.set(apiModelId, current);
    }

    const apiModelRank = new Map(apiModelIds.map((id, index) => [id, index]));
    const activeApiModelIds = sortApiModelIdsByRank(
        dedupeIdentifiers(activeProviders.map((provider) => provider.model_id)),
        apiModelRank
    );

    const aliases = dedupeIdentifiers(
        activeApiModelIds.flatMap(
            (apiModelId) => aliasRowsByApiModelId.get(apiModelId) ?? []
        )
    );

    const acceptedModelIdentifiers = dedupeIdentifiers([
        ...activeApiModelIds,
        ...aliases,
    ]);

    const fallbackAcceptedIdentifiers = dedupeIdentifiers([
        ...apiModelIds,
        ...dedupeIdentifiers(aliasRows.map((alias) => alias.alias_slug)),
    ]);
    const normalizedAcceptedModelIdentifiers =
        acceptedModelIdentifiers.length > 0
            ? acceptedModelIdentifiers
            : fallbackAcceptedIdentifiers;

    const primaryModelIdentifier =
        normalizedAcceptedModelIdentifiers[0] ?? modelId;

    const acceptedModelIdentifiersByEndpoint: Record<string, string[]> = {};
    const primaryModelIdentifierByEndpoint: Record<string, string> = {};
    const endpointApiModelIds = new Map<string, string[]>();

    for (const provider of activeProviders) {
        const endpoint = normalizeIdentifier(provider.endpoint);
        const apiModelId = normalizeIdentifier(provider.model_id);
        if (!endpoint || !apiModelId) continue;
        const ids = endpointApiModelIds.get(endpoint) ?? [];
        ids.push(apiModelId);
        endpointApiModelIds.set(endpoint, ids);
    }

    for (const [endpoint, ids] of endpointApiModelIds.entries()) {
        const sortedIds = sortApiModelIdsByRank(
            dedupeIdentifiers(ids),
            apiModelRank
        );
        const endpointAliases = dedupeIdentifiers(
            sortedIds.flatMap(
                (apiModelId) => aliasRowsByApiModelId.get(apiModelId) ?? []
            )
        );
        const endpointAccepted = dedupeIdentifiers([
            ...sortedIds,
            ...endpointAliases,
        ]);
        const normalizedEndpointAccepted =
            endpointAccepted.length > 0
                ? endpointAccepted
                : normalizedAcceptedModelIdentifiers;
        acceptedModelIdentifiersByEndpoint[endpoint] = normalizedEndpointAccepted;
        primaryModelIdentifierByEndpoint[endpoint] =
            normalizedEndpointAccepted[0] ?? primaryModelIdentifier;
    }

    return {
        modelId,
        aliases,
        apiModelIds,
        primaryModelIdentifier,
        acceptedModelIdentifiers: normalizedAcceptedModelIdentifiers,
        primaryModelIdentifierByEndpoint,
        acceptedModelIdentifiersByEndpoint,
        providers,
        activeProviders,
        comingSoonProviders,
        inactiveProviders,
    };
}

/**
 * Cached version of getModelGatewayMetadata.
 *
 * Usage: await getModelGatewayMetadataCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelGatewayMetadataCached(
    modelId: string,
    includeHidden: boolean
): Promise<ModelGatewayMetadata> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag(`model:api:${modelId}`);
    cacheTag("data:data_api_provider_models");
    cacheTag("data:model_aliases");

    console.log("[fetch] HIT DB for model gateway metadata", modelId);
    return getModelGatewayMetadata(modelId, includeHidden);
}
