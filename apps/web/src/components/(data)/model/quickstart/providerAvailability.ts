import type {
	GatewayProviderModel,
	ModelGatewayMetadata,
} from "@/lib/fetchers/models/getModelGatewayMetadata";
import type {
	ResidencyMode,
	ZeroDataRetentionMode,
} from "@/lib/providers/providerResidency";
import type { RegionalPricingMode } from "@/lib/providers/providerPricingPolicy";
import {
	formatProviderOfferVariantLabel,
	inferProviderFamilyIdFromSiblings,
	inferProviderFamilyName,
	isGlobalProviderOffer,
	resolveProviderLogoId,
} from "@/lib/providers/providerOffers";

export type ProviderStateKey =
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
	| "provider_not_ready"
	| "provider_disabled"
	| "model_disabled"
	| "capability_disabled"
	| "provider_inactive"
	| "inactive"
	| "retired";

export type ProviderState = {
	key: ProviderStateKey;
	label: string;
	description: string;
	availability: "active" | "coming_soon" | "inactive";
};

export type GroupedProvider = {
	providerId: string;
	providerIds: Set<string>;
	logoProviderId: string;
	providerName: string;
	offerLabels: Set<string>;
	endpoints: Set<string>;
	modelSlugs: Set<string>;
	quantizationScheme: string | null;
	executionRegions: Set<string>;
	dataRegions: Set<string>;
	zeroDataRetention: ZeroDataRetentionMode | "mixed" | null;
	residencyMode: ResidencyMode | "mixed" | null;
	residencyNotes: Set<string>;
	residencySourceUrls: Set<string>;
	residency: Array<{
		residencyMode?: ResidencyMode | null;
		executionRegions?: string[] | null;
		dataRegions?: string[] | null;
		zeroDataRetention?: ZeroDataRetentionMode | null;
		notes?: string | null;
		sourceUrl?: string | null;
	}>;
	promptTraining: Array<{
		policy?: string | null;
		notes?: string | null;
		sourceUrl?: string | null;
		userIdentifierPolicy?: string | null;
		userIdentifierNotes?: string | null;
		privacyPolicyUrl?: string | null;
		termsOfServiceUrl?: string | null;
		isOverride?: boolean;
	}>;
	regionalPricingMode: RegionalPricingMode | null;
	regionalPricingUpliftPercent: number | null;
	pricingSourceUrl: string | null;
	regionalPricingNotes: string | null;
	activeEndpointCount: number;
	comingSoonEndpointCount: number;
	inactiveEndpointCount: number;
	state: ProviderState;
};

function mergeSingleResidencyValue<T extends string>(
	current: T | "mixed" | null,
	next: T | null | undefined,
): T | "mixed" | null {
	if (!next) return current;
	if (!current) return next;
	if (current === next) return current;
	return "mixed";
}

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

function describeRoutingDerank(level: string): ProviderState {
	if (level === "deranked_lvl3") {
		return {
			key: "deranked_lvl3",
			label: "Deranked L3",
			description: "Publicly routable, but heavily deprioritized by routing health.",
			availability: "active",
		};
	}
	if (level === "deranked_lvl2") {
		return {
			key: "deranked_lvl2",
			label: "Deranked L2",
			description: "Publicly routable, but currently deprioritized by routing health.",
			availability: "active",
		};
	}
	return {
		key: "deranked_lvl1",
		label: "Deranked L1",
		description: "Publicly routable, but slightly deprioritized by routing health.",
		availability: "active",
	};
}

function describeKnownInactiveProviderState(
	key:
		| "gated"
		| "access_limited"
		| "region_limited"
		| "project_limited"
		| "paused"
		| "soft_blocked",
): ProviderState {
	switch (key) {
		case "gated":
			return {
				key,
				label: "Gated Access",
				description: "The provider/model mapping exists, but access is currently gated behind an allowlist or private rollout.",
				availability: "inactive",
			};
		case "access_limited":
			return {
				key,
				label: "Access Limited",
				description: "The provider/model mapping exists, but it currently requires additional provider-side access.",
				availability: "inactive",
			};
		case "region_limited":
			return {
				key,
				label: "Region Limited",
				description: "The provider/model mapping exists, but it is limited to specific regions right now.",
				availability: "inactive",
			};
		case "project_limited":
			return {
				key,
				label: "Project Limited",
				description: "The provider/model mapping exists, but it is limited to specific projects or workspaces.",
				availability: "inactive",
			};
		case "paused":
			return {
				key,
				label: "Paused",
				description: "The provider/model mapping exists, but it is temporarily paused for routing.",
				availability: "inactive",
			};
		case "soft_blocked":
			return {
				key,
				label: "Soft Blocked",
				description: "The provider/model mapping exists, but it is temporarily soft-blocked for routing.",
				availability: "inactive",
			};
	}
}

function stateFromAvailabilityReason(
	reason: GatewayProviderModel["availability_reason"],
): ProviderState | null {
	if (!reason) return null;
	if (
		reason === "deranked_lvl1" ||
		reason === "deranked_lvl2" ||
		reason === "deranked_lvl3"
	) {
		return describeRoutingDerank(reason);
	}
	if (reason === "retired") {
		return {
			key: "retired",
			label: "Retired",
			description: "This provider mapping is past its effective window.",
			availability: "inactive",
		};
	}
	if (reason === "scheduled") {
		return {
			key: "scheduled",
			label: "Scheduled",
			description: "Configured in the catalog, but not active until a future date.",
			availability: "coming_soon",
		};
	}
	if (reason === "preview_only") {
		return {
			key: "preview_only",
			label: "Preview Only",
			description: "This provider/model mapping is known in the catalog, but only staged for preview rollout.",
			availability: "coming_soon",
		};
	}
	if (reason === "provider_not_ready") {
		return {
			key: "provider_not_ready",
			label: "Provider Not Ready",
			description: "The provider mapping exists in the catalog, but it is not ready for public gateway routing yet.",
			availability: "inactive",
		};
	}
	if (
		reason === "gated" ||
		reason === "access_limited" ||
		reason === "region_limited" ||
		reason === "project_limited" ||
		reason === "paused" ||
		reason === "soft_blocked"
	) {
		return describeKnownInactiveProviderState(reason);
	}
	if (reason === "provider_inactive") {
		return {
			key: "provider_inactive",
			label: "Provider Inactive",
			description: "The provider exists in the catalog, but it is not active.",
			availability: "inactive",
		};
	}
	if (reason === "provider_disabled") {
		return {
			key: "provider_disabled",
			label: "Provider Disabled",
			description: "The provider is currently disabled for gateway routing.",
			availability: "inactive",
		};
	}
	if (reason === "model_disabled") {
		return {
			key: "model_disabled",
			label: "Model Disabled",
			description: "This provider/model mapping is currently disabled for routing.",
			availability: "inactive",
		};
	}
	if (reason === "capability_disabled") {
		return {
			key: "capability_disabled",
			label: "Capability Disabled",
			description: "This endpoint is known, but disabled for public use.",
			availability: "inactive",
		};
	}
	if (reason === "internal_testing") {
		return {
			key: "internal_testing",
			label: "Internal Testing",
			description: "Known in the catalog, but currently limited to internal testing.",
			availability: "coming_soon",
		};
	}
	if (reason === "coming_soon") {
		return {
			key: "coming_soon",
			label: "Coming Soon",
			description: "Known in the catalog, but not publicly routable yet.",
			availability: "coming_soon",
		};
	}
	if (reason === "inactive") {
		return {
			key: "inactive",
			label: "Inactive",
			description: "Configured in data, but not currently routable in the gateway.",
			availability: "inactive",
		};
	}
	return {
		key: "active",
		label: "Active",
		description: "Publicly routable in the gateway.",
		availability: "active",
	};
}

export function resolveProviderState(
	providerModel: GatewayProviderModel,
	now: Date = new Date()
): ProviderState {
	const explicitReasonState = stateFromAvailabilityReason(
		providerModel.availability_reason,
	);
	if (explicitReasonState) {
		return explicitReasonState;
	}

	if (isExpiredEffectiveWindow(providerModel.effective_to, now)) {
		return {
			key: "retired",
			label: "Retired",
			description: "This provider mapping is past its effective window.",
			availability: "inactive",
		};
	}

	if (isFutureEffectiveWindow(providerModel.effective_from, now)) {
		return {
			key: "scheduled",
			label: "Scheduled",
			description: "Configured in the catalog, but not active until a future date.",
			availability: "coming_soon",
		};
	}

	if (providerModel.provider_status && providerModel.provider_status !== "active") {
		if (providerModel.provider_status === "beta" || providerModel.provider_status === "alpha") {
			return {
				key: "preview_only",
				label: "Preview Only",
				description: "This provider/model mapping is known in the catalog, but only staged for preview rollout.",
				availability: "coming_soon",
			};
		}
		if (providerModel.provider_status === "not_ready") {
			return {
				key: "provider_not_ready",
				label: "Provider Not Ready",
				description: "The provider mapping exists in the catalog, but it is not ready for public gateway routing yet.",
				availability: "inactive",
			};
		}
		if (
			providerModel.provider_status === "gated" ||
			providerModel.provider_status === "access_limited" ||
			providerModel.provider_status === "region_limited" ||
			providerModel.provider_status === "project_limited" ||
			providerModel.provider_status === "paused" ||
			providerModel.provider_status === "soft_blocked"
		) {
			return describeKnownInactiveProviderState(providerModel.provider_status);
		}
		return {
			key: "provider_inactive",
			label: "Provider Inactive",
			description: "The provider exists in the catalog, but it is not active.",
			availability: "inactive",
		};
	}

	if (providerModel.provider_routing_status === "disabled") {
		return {
			key: "provider_disabled",
			label: "Provider Disabled",
			description: "The provider is currently disabled for gateway routing.",
			availability: "inactive",
		};
	}

	if (providerModel.model_routing_status === "disabled") {
		return {
			key: "model_disabled",
			label: "Model Disabled",
			description: "This provider/model mapping is currently disabled for routing.",
			availability: "inactive",
		};
	}

	if (providerModel.capability_status === "disabled") {
		return {
			key: "capability_disabled",
			label: "Capability Disabled",
			description: "This endpoint is known, but disabled for public use.",
			availability: "inactive",
		};
	}

	if (
		providerModel.provider_routing_status === "deranked_lvl1" ||
		providerModel.provider_routing_status === "deranked_lvl2" ||
		providerModel.provider_routing_status === "deranked_lvl3"
	) {
		return describeRoutingDerank(providerModel.provider_routing_status);
	}

	if (
		providerModel.model_routing_status === "deranked_lvl1" ||
		providerModel.model_routing_status === "deranked_lvl2" ||
		providerModel.model_routing_status === "deranked_lvl3"
	) {
		return describeRoutingDerank(providerModel.model_routing_status);
	}

	if (providerModel.capability_status === "internal_testing") {
		return {
			key: "internal_testing",
			label: "Internal Testing",
			description: "Known in the catalog, but currently limited to internal testing.",
			availability: "coming_soon",
		};
	}

	if (providerModel.availability_status === "coming_soon") {
		return {
			key: "coming_soon",
			label: "Coming Soon",
			description: "Known in the catalog, but not publicly routable yet.",
			availability: "coming_soon",
		};
	}

	if (!providerModel.is_active_gateway || providerModel.availability_status === "inactive") {
		return {
			key: "inactive",
			label: "Inactive",
			description: "Configured in data, but not currently routable in the gateway.",
			availability: "inactive",
		};
	}

	return {
		key: "active",
		label: "Active",
		description: "Publicly routable in the gateway.",
		availability: "active",
	};
}

function chooseState(states: ProviderState[]): ProviderState {
	const activeStates = states.filter((state) => state.availability === "active");
	if (activeStates.length > 0) {
		return (
			activeStates.find((state) => state.key === "deranked_lvl3") ??
			activeStates.find((state) => state.key === "deranked_lvl2") ??
			activeStates.find((state) => state.key === "deranked_lvl1") ??
			activeStates[0]
		);
	}

	const previewStates = states.filter(
		(state) => state.availability === "coming_soon"
	);
	if (previewStates.length > 0) {
		return (
			previewStates.find((state) => state.key === "internal_testing") ??
			previewStates.find((state) => state.key === "scheduled") ??
			previewStates.find((state) => state.key === "preview_only") ??
			previewStates[0]
		);
	}

	return (
		states.find((state) => state.key === "provider_not_ready") ??
		states.find((state) => state.key === "gated") ??
		states.find((state) => state.key === "access_limited") ??
		states.find((state) => state.key === "region_limited") ??
		states.find((state) => state.key === "project_limited") ??
		states.find((state) => state.key === "paused") ??
		states.find((state) => state.key === "soft_blocked") ??
		states.find((state) => state.key === "provider_disabled") ??
		states.find((state) => state.key === "model_disabled") ??
		states.find((state) => state.key === "capability_disabled") ??
		states.find((state) => state.key === "provider_inactive") ??
		states[0] ?? {
			key: "inactive",
			label: "Inactive",
			description: "Configured in data, but not currently routable in the gateway.",
			availability: "inactive",
		}
	);
}

export function groupProviders(metadata: ModelGatewayMetadata): GroupedProvider[] {
	const grouped = new Map<string, GroupedProvider>();
	const now = new Date();
	const knownProviderIds = metadata.providers.map((item) => item.api_provider_id);
	for (const item of metadata.providers) {
		const providerId = item.api_provider_id;
		if (!providerId) continue;
		const providerFamilyId = String(
			item.provider?.provider_family_id ?? "",
		).trim();
		const familyId =
			(providerFamilyId && providerFamilyId !== providerId
				? providerFamilyId
				: inferProviderFamilyIdFromSiblings({
						providerId,
						knownProviderIds,
				  })) || providerFamilyId || providerId;

		const state = resolveProviderState(item, now);
		const residencyMetadata = {
			residencyMode: item.provider?.residency_mode ?? null,
			executionRegions: item.provider?.default_execution_regions ?? null,
			dataRegions: item.provider?.default_data_regions ?? null,
			zeroDataRetention: item.provider?.zero_data_retention ?? null,
			residencyNotes: item.provider?.residency_notes ?? null,
			residencySourceUrl: item.provider?.residency_source_url ?? null,
			regionalPricingMode: item.provider?.regional_pricing_mode ?? null,
			regionalPricingUpliftPercent:
				item.provider?.regional_pricing_uplift_percent ?? null,
			pricingSourceUrl: item.provider?.pricing_source_url ?? null,
			regionalPricingNotes: item.provider?.regional_pricing_notes ?? null,
		};
		const promptTrainingMetadata = {
			policy: item.provider?.prompt_training_policy ?? null,
			notes: item.provider?.prompt_training_notes ?? null,
			sourceUrl: item.provider?.prompt_training_source_url ?? null,
			userIdentifierPolicy: item.provider?.user_identifier_policy ?? null,
			userIdentifierNotes: item.provider?.user_identifier_notes ?? null,
			privacyPolicyUrl: item.provider?.privacy_policy_url ?? null,
			termsOfServiceUrl: item.provider?.terms_of_service_url ?? null,
			isOverride: false,
		};
		const current = grouped.get(familyId);
		const offerLabel = formatProviderOfferVariantLabel({
			offerLabel: item.provider?.offer_label ?? null,
			offerScope: item.provider?.offer_scope ?? null,
			providerId,
		});
		const isRepresentativeOffer =
			providerId === familyId ||
			isGlobalProviderOffer({
				offerLabel: item.provider?.offer_label ?? null,
				offerScope: item.provider?.offer_scope ?? null,
			});

		if (current) {
			if (item.endpoint) current.endpoints.add(item.endpoint);
			current.providerIds.add(providerId);
			current.offerLabels.add(offerLabel);
			if (item.provider_model_slug) current.modelSlugs.add(item.provider_model_slug);
			if (!current.quantizationScheme && item.quantization_scheme) {
				current.quantizationScheme = item.quantization_scheme;
			}
			if (isRepresentativeOffer && current.providerId !== providerId) {
				current.providerId = providerId;
				current.providerName =
					item.provider?.api_provider_name ??
					inferProviderFamilyName({
						providerName: item.provider?.api_provider_name ?? providerId,
						offerLabel: item.provider?.offer_label ?? null,
						offerScope: item.provider?.offer_scope ?? null,
					});
			}
			if (state.availability === "active") current.activeEndpointCount += 1;
			else if (state.availability === "coming_soon") current.comingSoonEndpointCount += 1;
			else current.inactiveEndpointCount += 1;
			for (const region of residencyMetadata.executionRegions ?? []) {
				current.executionRegions.add(region);
			}
			for (const region of residencyMetadata.dataRegions ?? []) {
				current.dataRegions.add(region);
			}
			if (residencyMetadata.residencyNotes) {
				current.residencyNotes.add(residencyMetadata.residencyNotes);
			}
			if (residencyMetadata.residencySourceUrl) {
				current.residencySourceUrls.add(residencyMetadata.residencySourceUrl);
			}
			current.zeroDataRetention = mergeSingleResidencyValue(
				current.zeroDataRetention,
				residencyMetadata.zeroDataRetention,
			);
			current.residencyMode = mergeSingleResidencyValue(
				current.residencyMode,
				residencyMetadata.residencyMode,
			);
			current.residency.push({
				residencyMode: residencyMetadata.residencyMode,
				executionRegions: residencyMetadata.executionRegions,
				dataRegions: residencyMetadata.dataRegions,
				zeroDataRetention: residencyMetadata.zeroDataRetention,
				notes: residencyMetadata.residencyNotes,
				sourceUrl: residencyMetadata.residencySourceUrl,
			});
			current.promptTraining.push(promptTrainingMetadata);
			if (!current.regionalPricingMode && residencyMetadata.regionalPricingMode) {
				current.regionalPricingMode = residencyMetadata.regionalPricingMode;
			}
			if (
				current.regionalPricingUpliftPercent == null &&
				typeof residencyMetadata.regionalPricingUpliftPercent === "number"
			) {
				current.regionalPricingUpliftPercent =
					residencyMetadata.regionalPricingUpliftPercent;
			}
			if (!current.pricingSourceUrl && residencyMetadata.pricingSourceUrl) {
				current.pricingSourceUrl = residencyMetadata.pricingSourceUrl;
			}
			if (!current.regionalPricingNotes && residencyMetadata.regionalPricingNotes) {
				current.regionalPricingNotes = residencyMetadata.regionalPricingNotes;
			}
			current.state = chooseState([current.state, state]);
			continue;
		}

		const endpoints = new Set<string>();
		const modelSlugs = new Set<string>();
		const executionRegions = new Set<string>(residencyMetadata.executionRegions ?? []);
		const dataRegions = new Set<string>(residencyMetadata.dataRegions ?? []);
		const residencyNotes = new Set<string>();
		const residencySourceUrls = new Set<string>();
		if (item.endpoint) endpoints.add(item.endpoint);
		if (item.provider_model_slug) modelSlugs.add(item.provider_model_slug);
		if (residencyMetadata.residencyNotes) {
			residencyNotes.add(residencyMetadata.residencyNotes);
		}
		if (residencyMetadata.residencySourceUrl) {
			residencySourceUrls.add(residencyMetadata.residencySourceUrl);
		}

		grouped.set(familyId, {
			providerId,
			providerIds: new Set([providerId]),
			logoProviderId: resolveProviderLogoId({
				providerId,
				providerFamilyId: familyId,
			}),
			providerName:
				(isRepresentativeOffer
					? item.provider?.api_provider_name
					: null) ??
				inferProviderFamilyName({
					providerName:
						item.provider?.api_provider_name ?? item.api_provider_id,
					offerLabel: item.provider?.offer_label ?? null,
					offerScope: item.provider?.offer_scope ?? null,
				}),
			offerLabels: new Set([offerLabel]),
			endpoints,
			modelSlugs,
			quantizationScheme: item.quantization_scheme ?? null,
			executionRegions,
			dataRegions,
			zeroDataRetention: residencyMetadata.zeroDataRetention,
			residencyMode: residencyMetadata.residencyMode,
			residencyNotes,
			residencySourceUrls,
			residency: [
				{
					residencyMode: residencyMetadata.residencyMode,
					executionRegions: residencyMetadata.executionRegions,
					dataRegions: residencyMetadata.dataRegions,
					zeroDataRetention: residencyMetadata.zeroDataRetention,
					notes: residencyMetadata.residencyNotes,
					sourceUrl: residencyMetadata.residencySourceUrl,
				},
			],
			promptTraining: [promptTrainingMetadata],
			regionalPricingMode: residencyMetadata.regionalPricingMode,
			regionalPricingUpliftPercent:
				residencyMetadata.regionalPricingUpliftPercent,
			pricingSourceUrl: residencyMetadata.pricingSourceUrl,
			regionalPricingNotes: residencyMetadata.regionalPricingNotes,
			activeEndpointCount: state.availability === "active" ? 1 : 0,
			comingSoonEndpointCount: state.availability === "coming_soon" ? 1 : 0,
			inactiveEndpointCount: state.availability === "inactive" ? 1 : 0,
			state,
		});
	}

	return Array.from(grouped.values()).sort((a, b) => {
		const availabilityPriority = (value: GroupedProvider["state"]["availability"]) => {
			if (value === "active") return 0;
			if (value === "coming_soon") return 1;
			return 2;
		};

		const aPriority = availabilityPriority(a.state.availability);
		const bPriority = availabilityPriority(b.state.availability);
		if (aPriority !== bPriority) return aPriority - bPriority;
		return a.providerName.localeCompare(b.providerName);
	});
}
