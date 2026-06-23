import { cacheLife, cacheTag } from "next/cache";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";
import { normalizeQuantizationScheme } from "@/lib/quantization";
import { extractSupportedParameters } from "@/lib/fetchers/models/table-view/helpers";
import { createAdminClient } from "@/utils/supabase/admin";

export interface GatewayProviderDetails {
    api_provider_id: string;
    api_provider_name: string;
    provider_family_id?: string | null;
    offer_label?: string | null;
    offer_scope?: "global" | "regional" | "specialized" | null;
    link?: string | null;
    country_code?: string | null;
	residency_mode?:
		| "unknown"
		| "provider_managed"
		| "customer_selectable"
		| "account_selected"
		| null;
	default_execution_regions?: string[] | null;
	default_data_regions?: string[] | null;
	zero_data_retention?:
		| "unknown"
		| "unsupported"
		| "optional"
		| "default"
		| null;
	residency_source_url?: string | null;
	residency_notes?: string | null;
	regional_pricing_mode?:
		| "unknown"
		| "same_as_global"
		| "uplift"
		| "source_region_rates"
		| "offer_specific"
		| null;
	regional_pricing_uplift_percent?: number | null;
	pricing_source_url?: string | null;
	regional_pricing_notes?: string | null;
	prompt_training_policy?: string | null;
	prompt_training_notes?: string | null;
	prompt_training_source_url?: string | null;
	data_policy_tier?: string | null;
	data_policy_confidence?: string | null;
	data_policy_contract_mode?: string | null;
	data_policy_contract_notes?: string | null;
	user_identifier_policy?: string | null;
	user_identifier_notes?: string | null;
	privacy_policy_url?: string | null;
	terms_of_service_url?: string | null;
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

export interface GatewaySupportedParameter {
	param_id: string;
	provider_count_supported: number;
	provider_count_total: number;
	support_level: "all_providers" | "some_providers";
	providers: Array<{
		api_provider_id: string;
		api_provider_name: string;
		supported: boolean;
	}>;
}

export interface ModelGatewayMetadata {
    modelId: string;
    aliases: string[];
    apiModelIds: string[];
    primaryModelIdentifier: string;
    acceptedModelIdentifiers: string[];
    primaryModelIdentifierByEndpoint: Record<string, string>;
    acceptedModelIdentifiersByEndpoint: Record<string, string[]>;
	supportedParametersByEndpoint: Record<string, GatewaySupportedParameter[]>;
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

const normalizeQuickstartEndpointValue = (value: string | null | undefined): string =>
	String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/^\//, "")
		.replace(/\//g, ".");

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

function isInternalTestingStatus(value: unknown): boolean {
	return normalizeStatusValue(value) === "internal_testing";
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
    includeHidden: boolean,
	includeInternal = false
): Promise<ModelGatewayMetadata> {
    const supabase = createAdminClient();

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

	const { data: caps, error: capsError } = await supabase
		.from("data_api_provider_model_capabilities")
		.select(
			"provider_api_model_id, capability_id, params, status, max_input_tokens, max_output_tokens"
		)
		.in("provider_api_model_id", providerModelIds);

    if (capsError) {
        throw new Error(capsError.message ?? "Failed to load gateway capabilities");
    }

	const visibleCaps = includeInternal
		? (caps ?? [])
		: (caps ?? []).filter((cap) => !isInternalTestingStatus(cap.status));
	const visibleProviderModelIds = new Set(
		visibleCaps
			.map((cap) => String(cap.provider_api_model_id ?? "").trim())
			.filter(Boolean),
	);
	const visibleProviderModels = (providerModels ?? []).filter((row) =>
		visibleProviderModelIds.has(String(row.provider_api_model_id ?? "").trim()),
	);

    const apiModelStats = new Map<
        string,
        { activeCount: number; totalCount: number }
    >();
    for (const row of visibleProviderModels) {
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

    const providerIds = Array.from(
        new Set(visibleProviderModels.map((row) => row.provider_id).filter(Boolean))
    );
	const providerSelect =
		"api_provider_id, api_provider_name, provider_family_id, offer_label, offer_scope, link, country_code, status, routing_status, residency_mode, default_execution_regions, default_data_regions, zero_data_retention, residency_source_url, residency_notes, regional_pricing_mode, regional_pricing_uplift_percent, pricing_source_url, regional_pricing_notes, prompt_training_policy, prompt_training_notes, prompt_training_source_url, data_policy_tier, data_policy_confidence, data_policy_contract_mode, data_policy_contract_notes, user_identifier_policy, user_identifier_notes, privacy_policy_url, terms_of_service_url";
	const providerSelectLegacy =
		"api_provider_id, api_provider_name, link, country_code, status, routing_status";
	let providersData: any[] | null = null;
	{
		const res = await supabase
			.from("data_api_providers")
			.select(providerSelect)
			.in("api_provider_id", providerIds);
		if (
			res.error &&
			(String(res.error.code ?? "").toUpperCase() === "PGRST204" ||
				String(res.error.code ?? "").toUpperCase() === "42703" ||
				/could not find.*column|does not exist|schema cache/i.test(
					String(res.error.message ?? ""),
				))
		) {
			const legacyRes = await supabase
				.from("data_api_providers")
				.select(providerSelectLegacy)
				.in("api_provider_id", providerIds);
			if (legacyRes.error) {
				throw new Error(
					legacyRes.error.message ?? "Failed to load gateway providers",
				);
			}
			providersData = legacyRes.data ?? [];
		} else if (res.error) {
			throw new Error(res.error.message ?? "Failed to load gateway providers");
		} else {
			providersData = res.data ?? [];
		}
	}

    const providerMap = new Map<string, GatewayProviderDetails & {
		status?: string | null;
		routing_status?: string | null;
	}>();
    for (const provider of providersData ?? []) {
        if (!provider.api_provider_id) continue;
        providerMap.set(provider.api_provider_id, {
            api_provider_id: provider.api_provider_id,
            api_provider_name: provider.api_provider_name ?? provider.api_provider_id,
            provider_family_id: provider.provider_family_id ?? provider.api_provider_id,
            offer_label: provider.offer_label ?? null,
            offer_scope: provider.offer_scope ?? "global",
            link: provider.link ?? null,
            country_code: provider.country_code ?? null,
			residency_mode: provider.residency_mode ?? null,
			default_execution_regions: Array.isArray(provider.default_execution_regions)
				? provider.default_execution_regions
				: null,
			default_data_regions: Array.isArray(provider.default_data_regions)
				? provider.default_data_regions
				: null,
			zero_data_retention: provider.zero_data_retention ?? null,
			residency_source_url: provider.residency_source_url ?? null,
			residency_notes: provider.residency_notes ?? null,
			regional_pricing_mode: provider.regional_pricing_mode ?? null,
			regional_pricing_uplift_percent:
				provider.regional_pricing_uplift_percent ?? null,
			pricing_source_url: provider.pricing_source_url ?? null,
			regional_pricing_notes: provider.regional_pricing_notes ?? null,
			prompt_training_policy: provider.prompt_training_policy ?? null,
			prompt_training_notes: provider.prompt_training_notes ?? null,
			prompt_training_source_url:
				provider.prompt_training_source_url ?? null,
			data_policy_tier: provider.data_policy_tier ?? null,
			data_policy_confidence:
				provider.data_policy_confidence ?? null,
			data_policy_contract_mode:
				provider.data_policy_contract_mode ?? null,
			data_policy_contract_notes:
				provider.data_policy_contract_notes ?? null,
			user_identifier_policy: provider.user_identifier_policy ?? null,
			user_identifier_notes: provider.user_identifier_notes ?? null,
			privacy_policy_url: provider.privacy_policy_url ?? null,
			terms_of_service_url: provider.terms_of_service_url ?? null,
			status: provider.status ?? null,
			routing_status: provider.routing_status ?? null,
        });
    }

	const providerModelMap = new Map<string, ProviderModelRow>();
	for (const row of visibleProviderModels) {
		if (!row.provider_api_model_id) continue;
		providerModelMap.set(row.provider_api_model_id, row);
	}

	const providers: GatewayProviderModel[] = [];
	const parameterSupportByEndpoint = new Map<
		string,
		{
			providers: Map<
				string,
				{
					api_provider_id: string;
					api_provider_name: string;
				}
			>;
			parameters: Map<string, Set<string>>;
		}
	>();
	const now = new Date();
	for (const cap of visibleCaps) {
		const pm = providerModelMap.get(cap.provider_api_model_id);
		if (!pm || !cap.capability_id) continue;
		const providerDetails = providerMap.get(pm.provider_id) ?? null;
		const providerStatus = normalizeStatusValue(providerDetails?.status ?? null);
		const providerRoutingStatus = normalizeStatusValue(
			providerDetails?.routing_status ?? null
		);
		const modelRoutingStatus = normalizeStatusValue(pm.routing_status ?? null);
		const capabilityStatus = normalizeStatusValue(cap.status ?? null);
		const availabilityStatus = resolveAvailabilityStatus({
			isActiveGateway: Boolean(pm.is_active_gateway),
			providerStatus,
			providerRoutingStatus,
			modelRoutingStatus,
			capabilityStatus,
			effectiveFrom: pm.effective_from,
			effectiveTo: pm.effective_to,
			now,
		});

		if (availabilityStatus === "active" && pm.provider_api_model_id) {
			const providerId = String(providerDetails?.api_provider_id ?? pm.provider_id);
			const providerName = String(
				providerDetails?.api_provider_name ?? providerId
			);
			const routeKeys =
				capabilityToEndpoints[String(cap.capability_id)]?.map((endpointPath) =>
					normalizeQuickstartEndpointValue(endpointPath),
				) ?? [normalizeQuickstartEndpointValue(String(cap.capability_id))];

			for (const endpointKey of routeKeys.filter(Boolean)) {
				const endpointBucket =
					parameterSupportByEndpoint.get(endpointKey) ??
					{
						providers: new Map(),
						parameters: new Map<string, Set<string>>(),
					};

				endpointBucket.providers.set(providerId, {
					api_provider_id: providerId,
					api_provider_name: providerName,
				});

				for (const paramId of extractSupportedParameters(cap.params)) {
					const supportedProviders =
						endpointBucket.parameters.get(paramId) ?? new Set<string>();
					supportedProviders.add(providerId);
					endpointBucket.parameters.set(paramId, supportedProviders);
				}

				parameterSupportByEndpoint.set(endpointKey, endpointBucket);
			}
		}

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
			availability_status: availabilityStatus,
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

	const supportedParametersByEndpoint = Object.fromEntries(
		Array.from(parameterSupportByEndpoint.entries()).map(
			([endpoint, { providers, parameters }]) => {
				const orderedProviders = Array.from(providers.values()).sort((a, b) =>
					a.api_provider_name.localeCompare(b.api_provider_name),
				);
				const providerCountTotal = orderedProviders.length;
				const rows = Array.from(parameters.entries())
					.map(([paramId, supportedProviders]) => {
						const providerRows = orderedProviders
							.map((provider) => ({
								...provider,
								supported: supportedProviders.has(provider.api_provider_id),
							}))
							.sort((a, b) => {
								if (a.supported !== b.supported) {
									return a.supported ? -1 : 1;
								}
								return a.api_provider_name.localeCompare(
									b.api_provider_name,
								);
							});

						return {
							param_id: paramId,
							provider_count_supported: supportedProviders.size,
							provider_count_total: providerCountTotal,
							support_level:
								supportedProviders.size === providerCountTotal
									? ("all_providers" as const)
									: ("some_providers" as const),
							providers: providerRows,
						};
					})
					.sort((a, b) => {
						if (a.provider_count_supported !== b.provider_count_supported) {
							return b.provider_count_supported - a.provider_count_supported;
						}
						return a.param_id.localeCompare(b.param_id);
					});

				return [endpoint, rows];
			},
		),
	);

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
		supportedParametersByEndpoint,
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
    includeHidden: boolean,
	includeInternal = false
): Promise<ModelGatewayMetadata> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag(`model:api:${modelId}`);
    cacheTag("data:data_api_provider_models");
    cacheTag("data:model_aliases");
    cacheTag("frontend:model-gateway-metadata");

    console.log("[fetch] HIT DB for model gateway metadata", modelId);
    return getModelGatewayMetadata(modelId, includeHidden, includeInternal);
}
