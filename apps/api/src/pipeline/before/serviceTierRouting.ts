import { getSupabaseAdmin } from "@/runtime/env";
import { loadPriceCard } from "@pipeline/pricing";
import { requiresExplicitServiceTier } from "../pricing/service-tiers";
import { normalizeTextServiceTier, readRequestedServiceTier } from "@core/serviceTiers";
import type { PriceCard } from "../pricing/types";
import { getProviderPricingKey, ROUTABLE_CAPABILITY_STATUSES, isWithinEffectiveWindow } from "./context.shared";
import type { ProviderCandidate } from "./types";
import { parseRouteAvailabilityPolicy } from "@/lib/config/routeAvailability";
import { resolveEffectiveDataPolicy } from "./dataPolicy";

type ServiceTierPlan = "standard" | "priority" | "batch" | "flex";

type ServiceTierRoutingDiagnostics = {
    requestedTier: string | null;
    requestedPlan: ServiceTierPlan | null;
    beforeCount: number;
    afterCount: number;
    droppedProviders: Array<{
        providerId: string;
        apiModelId: string | null;
        providerModelSlug: string | null;
        reason: string;
    }>;
    remappedProviders: Array<{
        providerId: string;
        fromApiModelId: string | null;
        toApiModelId: string;
        reason: "priority_fast_sibling" | "flex_sibling";
    }>;
};

type TierSiblingProviderRow = {
    provider_model_id: string | null;
    provider_model_slug: string | null;
    routing_enabled?: boolean | null;
    effective_from: string | null;
    effective_to: string | null;
    metadata?: Record<string, unknown> | null;
};

type TierSiblingCapabilityRow = {
    provider_model_id: string | null;
    params: Record<string, any> | null;
    max_input_tokens: number | null;
    max_output_tokens: number | null;
    status: string | null;
    updated_at: string | null;
    created_at: string | null;
};

const PRIORITY_SIBLING_API_MODEL_IDS = new Map<string, string>([
    ["moonshotai/kimi-k2.7-code", "moonshotai/kimi-k2.7-code-highspeed"],
]);

const PRIORITY_HIDDEN_SAME_MODEL_KEYS = new Set([
    "crofai:deepseek/deepseek-v4-pro",
    "crofai:moonshotai/kimi-k2.5",
    "deepinfra:minimax/minimax-m2.7",
]);

const PRIORITY_SIBLING_VALUE_IDS = new Set(
    Array.from(PRIORITY_SIBLING_API_MODEL_IDS.values(), (value) =>
        value.trim().toLowerCase(),
    ),
);

function normalizeRequestedServiceTier(body: any): string | null {
    return normalizeTextServiceTier(readRequestedServiceTier(body).value) ?? null;
}

function normalizeRequestedPlan(tier: string | null): ServiceTierPlan | null {
    if (tier === "fast" || tier === "priority") return "priority";
    if (tier === "batch") return "batch";
    if (tier === "flex") return "flex";
    if (tier === "standard") return "standard";
    return null;
}

function hasPricingPlan(card: PriceCard | null, plan: ServiceTierPlan): boolean {
    if (!card || !Array.isArray(card.rules) || card.rules.length === 0) return false;
    return card.rules.some((rule) => String(rule.pricing_plan ?? "").trim().toLowerCase() === plan);
}

function isPriorityDedicatedOffer(candidate: ProviderCandidate): boolean {
    return (
        candidate.offerScope === "specialized" &&
        String(candidate.offerLabel ?? "").trim().toLowerCase() === "priority"
    );
}

function isTierDedicatedOffer(candidate: ProviderCandidate, requestedPlan: ServiceTierPlan): boolean {
    if (requestedPlan === "priority") return isPriorityDedicatedOffer(candidate);
    return (
        candidate.offerScope === "specialized" &&
        String(candidate.offerLabel ?? "").trim().toLowerCase() === requestedPlan
    );
}

function isTierSiblingModel(candidate: ProviderCandidate, requestedPlan: ServiceTierPlan): boolean {
    const apiModelId = String(candidate.apiModelId ?? "").trim().toLowerCase();
    if (requestedPlan === "priority") {
        return PRIORITY_SIBLING_VALUE_IDS.has(apiModelId);
    }
    if (requestedPlan === "flex") {
        const providerModelSlug = String(candidate.providerModelSlug ?? "").trim().toLowerCase();
        return apiModelId.endsWith("-flex") || providerModelSlug.endsWith("-flex");
    }
    return false;
}

function getTierSiblingApiModelId(
    apiModelId: string,
    requestedPlan: ServiceTierPlan,
): string | null {
    if (requestedPlan === "priority") {
        return PRIORITY_SIBLING_API_MODEL_IDS.get(apiModelId.trim().toLowerCase()) ?? `${apiModelId}-fast`;
    }
    if (requestedPlan === "flex") return `${apiModelId}-flex`;
    return null;
}

function getHiddenTierSiblingLookupApiModelId(
    providerId: string,
    apiModelId: string,
    requestedPlan: ServiceTierPlan,
): string | null {
    if (requestedPlan !== "priority") {
        return getTierSiblingApiModelId(apiModelId, requestedPlan);
    }

    const normalizedProviderId = providerId.trim().toLowerCase();
    const normalizedApiModelId = apiModelId.trim().toLowerCase();
    if (PRIORITY_HIDDEN_SAME_MODEL_KEYS.has(`${normalizedProviderId}:${normalizedApiModelId}`)) {
        return apiModelId;
    }

    return getTierSiblingApiModelId(apiModelId, requestedPlan);
}

function supportsRequestedTier(candidate: ProviderCandidate, requestedPlan: ServiceTierPlan): boolean {
    // Mistral publishes reference Priority pricing more broadly than it enables
    // model-specific Priority inference. Require an explicit route capability so
    // catalog-only price metadata cannot make a model routable on that tier.
    if (
        requestedPlan === "priority" &&
        (candidate.providerId === "mistral" || candidate.providerId === "mistral-eu") &&
        !("service_tier" in (candidate.capabilityParams ?? {}) || "serviceTier" in (candidate.capabilityParams ?? {}))
    ) {
        return false;
    }
    if (requestedPlan === "priority" || requestedPlan === "flex") {
        return (
            hasPricingPlan(candidate.pricingCard, requestedPlan) ||
            isTierDedicatedOffer(candidate, requestedPlan) ||
            isTierSiblingModel(candidate, requestedPlan)
        );
    }
    return hasPricingPlan(candidate.pricingCard, requestedPlan);
}

function hasConfiguredPricing(candidate: ProviderCandidate): boolean {
    return Boolean(
        candidate.pricingCard &&
        Array.isArray(candidate.pricingCard.rules) &&
        candidate.pricingCard.rules.length > 0,
    );
}

async function remapToTierSibling(
    candidate: ProviderCandidate,
    capability: string,
    requestedPlan: ServiceTierPlan,
): Promise<ProviderCandidate | null> {
    const apiModelId = String(candidate.apiModelId ?? "").trim();
    const siblingApiModelId = getTierSiblingApiModelId(apiModelId, requestedPlan);
    if (!apiModelId || !siblingApiModelId) return null;
    if (String(candidate.apiModelId ?? "").trim().toLowerCase() === siblingApiModelId.toLowerCase()) {
        return null;
    }

    const supabase = getSupabaseAdmin();
    const { data: providerRows, error: providerError } = await supabase
        .from("v2_model_provider_routes")
        .select("provider_model_id,provider_model_slug,routing_enabled,effective_from,effective_to,metadata")
        .eq("provider_slug", candidate.providerId)
        .or(`model_slug.eq.${siblingApiModelId},provider_model_slug.eq.${siblingApiModelId}`)
        .in("status", ["active", "degraded"])
        .eq("routing_enabled", true);
    if (providerError || !providerRows?.length) return null;

    const nowMs = Date.now();
    const activeProviderRows = (providerRows as TierSiblingProviderRow[])
        .filter((row) => typeof row.provider_model_id === "string" && row.provider_model_id.length > 0)
        .filter((row) => isWithinEffectiveWindow(row.effective_from, row.effective_to, nowMs))
        .sort((a, b) => {
            const aTs = a.effective_from ? new Date(a.effective_from).getTime() : 0;
            const bTs = b.effective_from ? new Date(b.effective_from).getTime() : 0;
            return bTs - aTs;
        });
    if (!activeProviderRows.length) return null;

    const providerApiModelIds = activeProviderRows
        .map((row) => row.provider_model_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (!providerApiModelIds.length) return null;

    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("v2_route_capabilities")
        .select("provider_model_id,params,max_input_tokens,max_output_tokens,status,updated_at,created_at")
        .eq("capability_id", capability)
        .in("status", [...ROUTABLE_CAPABILITY_STATUSES])
        .in("provider_model_id", providerApiModelIds);
    if (capabilityError || !capabilityRows?.length) return null;

    const capabilityByProviderModelId = new Map<string, TierSiblingCapabilityRow>();
    for (const row of capabilityRows as TierSiblingCapabilityRow[]) {
        const providerApiModelId = row.provider_model_id;
        if (typeof providerApiModelId !== "string" || !providerApiModelId.length) continue;
        const previous = capabilityByProviderModelId.get(providerApiModelId);
        const rowTs = Math.max(
            row.updated_at ? new Date(row.updated_at).getTime() : 0,
            row.created_at ? new Date(row.created_at).getTime() : 0,
        );
        const prevTs = previous
            ? Math.max(
                previous.updated_at ? new Date(previous.updated_at).getTime() : 0,
                previous.created_at ? new Date(previous.created_at).getTime() : 0,
            )
            : -1;
        if (!previous || rowTs >= prevTs) {
            capabilityByProviderModelId.set(providerApiModelId, row);
        }
    }

    const matchedProviderRow = activeProviderRows.find((row) =>
        row.provider_model_id && capabilityByProviderModelId.has(row.provider_model_id),
    );
    if (!matchedProviderRow?.provider_model_id) return null;

    const siblingPricingCard = await loadPriceCard(
        candidate.providerId,
        siblingApiModelId,
        capability,
    );
    if (!siblingPricingCard || !Array.isArray(siblingPricingCard.rules) || siblingPricingCard.rules.length === 0) {
        return null;
    }

    const siblingCapability = capabilityByProviderModelId.get(matchedProviderRow.provider_model_id) ?? null;
    const remappedProviderModelSlug = matchedProviderRow.provider_model_slug ?? candidate.providerModelSlug;
    const remapped: ProviderCandidate = {
        ...candidate,
        apiModelId: siblingApiModelId,
        pricingKey: getProviderPricingKey(candidate.providerId, siblingApiModelId, remappedProviderModelSlug),
        providerModelSlug: remappedProviderModelSlug,
        quantizationScheme:
			typeof matchedProviderRow.metadata?.quantization_scheme === "string"
				? matchedProviderRow.metadata.quantization_scheme
				: null,
        availabilityPolicy: parseRouteAvailabilityPolicy(matchedProviderRow.metadata?.availability),
        pricingCard: siblingPricingCard,
        capabilityParams:
            siblingCapability?.params && typeof siblingCapability.params === "object"
                ? siblingCapability.params
                : candidate.capabilityParams,
        maxInputTokens:
            siblingCapability?.max_input_tokens === null || siblingCapability?.max_input_tokens === undefined
                ? candidate.maxInputTokens
                : Number(siblingCapability.max_input_tokens),
        maxOutputTokens:
            siblingCapability?.max_output_tokens === null || siblingCapability?.max_output_tokens === undefined
                ? candidate.maxOutputTokens
                : Number(siblingCapability.max_output_tokens),
    };
	return {
		...remapped,
		effectiveDataPolicy: resolveEffectiveDataPolicy({ endpoint: capability, provider: remapped }),
	};
}

async function remapToHiddenTierSibling(
    candidate: ProviderCandidate,
    capability: string,
    requestedPlan: ServiceTierPlan,
): Promise<ProviderCandidate | null> {
    const apiModelId = String(candidate.apiModelId ?? "").trim();
    const siblingLookupApiModelId = getHiddenTierSiblingLookupApiModelId(
        candidate.providerId,
        apiModelId,
        requestedPlan,
    );
    if (!apiModelId || !siblingLookupApiModelId) return null;

    const supabase = getSupabaseAdmin();
    const { data: providerRows, error: providerError } = await supabase
        .from("v2_model_provider_routes")
        .select("provider_model_id,provider_model_slug,routing_enabled,effective_from,effective_to,metadata")
        .eq("provider_slug", candidate.providerId)
        .or(`model_slug.eq.${siblingLookupApiModelId},provider_model_slug.eq.${siblingLookupApiModelId}`)
        .eq("routing_enabled", false);
    if (providerError || !providerRows?.length) return null;

    const nowMs = Date.now();
    const hiddenProviderRows = (providerRows as TierSiblingProviderRow[])
        .filter((row) => row.routing_enabled === false)
        .filter((row) => typeof row.provider_model_id === "string" && row.provider_model_id.length > 0)
        .filter((row) => isWithinEffectiveWindow(row.effective_from, row.effective_to, nowMs))
        .sort((a, b) => {
            const aTs = a.effective_from ? new Date(a.effective_from).getTime() : 0;
            const bTs = b.effective_from ? new Date(b.effective_from).getTime() : 0;
            return bTs - aTs;
        });
    if (!hiddenProviderRows.length) return null;

    const providerApiModelIds = hiddenProviderRows
        .map((row) => row.provider_model_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (!providerApiModelIds.length) return null;

    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("v2_route_capabilities")
        .select("provider_model_id,params,max_input_tokens,max_output_tokens,status,updated_at,created_at")
        .eq("capability_id", capability)
        .in("status", [...ROUTABLE_CAPABILITY_STATUSES])
        .in("provider_model_id", providerApiModelIds);
    if (capabilityError || !capabilityRows?.length) return null;

    const capabilityByProviderModelId = new Map<string, TierSiblingCapabilityRow>();
    for (const row of capabilityRows as TierSiblingCapabilityRow[]) {
        const providerApiModelId = row.provider_model_id;
        if (typeof providerApiModelId !== "string" || !providerApiModelId.length) continue;
        const previous = capabilityByProviderModelId.get(providerApiModelId);
        const rowTs = Math.max(
            row.updated_at ? new Date(row.updated_at).getTime() : 0,
            row.created_at ? new Date(row.created_at).getTime() : 0,
        );
        const prevTs = previous
            ? Math.max(
                previous.updated_at ? new Date(previous.updated_at).getTime() : 0,
                previous.created_at ? new Date(previous.created_at).getTime() : 0,
            )
            : -1;
        if (!previous || rowTs >= prevTs) {
            capabilityByProviderModelId.set(providerApiModelId, row);
        }
    }

    const matchedProviderRow = hiddenProviderRows.find((row) =>
        row.provider_model_id && capabilityByProviderModelId.has(row.provider_model_id),
    );
    if (!matchedProviderRow?.provider_model_id) return null;

    const siblingCapability = capabilityByProviderModelId.get(matchedProviderRow.provider_model_id) ?? null;
    const remappedProviderModelSlug = matchedProviderRow.provider_model_slug ?? candidate.providerModelSlug;
    const remapped: ProviderCandidate = {
        ...candidate,
        pricingKey: getProviderPricingKey(candidate.providerId, candidate.apiModelId, remappedProviderModelSlug),
        providerModelSlug: remappedProviderModelSlug,
        quantizationScheme:
			typeof matchedProviderRow.metadata?.quantization_scheme === "string"
				? matchedProviderRow.metadata.quantization_scheme
				: null,
        availabilityPolicy: parseRouteAvailabilityPolicy(matchedProviderRow.metadata?.availability),
        capabilityParams:
            siblingCapability?.params && typeof siblingCapability.params === "object"
                ? siblingCapability.params
                : candidate.capabilityParams,
        maxInputTokens:
            siblingCapability?.max_input_tokens === null || siblingCapability?.max_input_tokens === undefined
                ? candidate.maxInputTokens
                : Number(siblingCapability.max_input_tokens),
        maxOutputTokens:
            siblingCapability?.max_output_tokens === null || siblingCapability?.max_output_tokens === undefined
                ? candidate.maxOutputTokens
                : Number(siblingCapability.max_output_tokens),
    };
	return {
		...remapped,
		effectiveDataPolicy: resolveEffectiveDataPolicy({ endpoint: capability, provider: remapped }),
	};
}

export async function applyServiceTierRouting(args: {
    candidates: ProviderCandidate[];
    body: any;
    capability: string;
	authorizeRemappedCandidate?: (candidate: ProviderCandidate) => boolean;
}): Promise<{
    candidates: ProviderCandidate[];
    diagnostics: ServiceTierRoutingDiagnostics;
}> {
    const requestedTier = normalizeRequestedServiceTier(args.body);
    const requestedPlan = normalizeRequestedPlan(requestedTier);
    if (!requestedPlan) {
		const candidates = args.candidates.filter((candidate) =>
			!isTierDedicatedOffer(candidate, "priority") && !isTierSiblingModel(candidate, "priority") &&
			!requiresExplicitServiceTier(candidate.pricingCard)
		);
        return {
            candidates,
            diagnostics: {
                requestedTier,
                requestedPlan,
                beforeCount: args.candidates.length,
                afterCount: candidates.length,
                droppedProviders: args.candidates.filter((candidate) => !candidates.includes(candidate)).map((candidate) => ({
					providerId: candidate.providerId,
					apiModelId: candidate.apiModelId ?? null,
					providerModelSlug: candidate.providerModelSlug ?? null,
					reason: isTierDedicatedOffer(candidate, "priority") || isTierSiblingModel(candidate, "priority")
						? "service_tier_priority_required" : "service_tier_standard_unsupported",
				})),
                remappedProviders: [],
            },
        };
    }

    const nextCandidates: ProviderCandidate[] = [];
    const droppedProviders: ServiceTierRoutingDiagnostics["droppedProviders"] = [];
    const remappedProviders: ServiceTierRoutingDiagnostics["remappedProviders"] = [];

    for (const candidate of args.candidates) {
		if (requestedPlan !== "priority" && (isTierDedicatedOffer(candidate, "priority") || isTierSiblingModel(candidate, "priority"))) {
			droppedProviders.push({
				providerId: candidate.providerId,
				apiModelId: candidate.apiModelId ?? null,
				providerModelSlug: candidate.providerModelSlug ?? null,
				reason: "service_tier_priority_required",
			});
			continue;
		}
        if (!hasConfiguredPricing(candidate)) {
            nextCandidates.push(candidate);
            continue;
        }

        const supportsPublicRequestedTier = supportsRequestedTier(candidate, requestedPlan);

        if (
            supportsPublicRequestedTier &&
            (requestedPlan === "priority" || requestedPlan === "flex")
        ) {
            const hiddenSiblingCandidate = await remapToHiddenTierSibling(
                candidate,
                args.capability,
                requestedPlan,
            );
            if (hiddenSiblingCandidate) {
				if (args.authorizeRemappedCandidate && !args.authorizeRemappedCandidate(hiddenSiblingCandidate)) {
					droppedProviders.push({
						providerId: hiddenSiblingCandidate.providerId,
						apiModelId: hiddenSiblingCandidate.apiModelId ?? null,
						providerModelSlug: hiddenSiblingCandidate.providerModelSlug ?? null,
						reason: "service_tier_remap_not_authorized",
					});
					continue;
				}
                const remappedApiModelId = candidate.apiModelId
                    ? getHiddenTierSiblingLookupApiModelId(
                        candidate.providerId,
                        candidate.apiModelId,
                        requestedPlan,
                    )
                    : null;
                nextCandidates.push(hiddenSiblingCandidate);
                remappedProviders.push({
                    providerId: candidate.providerId,
                    fromApiModelId: candidate.apiModelId ?? null,
                    toApiModelId: remappedApiModelId ?? "",
                    reason: requestedPlan === "priority" ? "priority_fast_sibling" : "flex_sibling",
                });
                continue;
            }
        }

        if (supportsPublicRequestedTier) {
            nextCandidates.push(candidate);
            continue;
        }

        if (requestedPlan === "priority") {
            const remappedCandidate = await remapToTierSibling(candidate, args.capability, requestedPlan);
            if (remappedCandidate) {
				if (args.authorizeRemappedCandidate && !args.authorizeRemappedCandidate(remappedCandidate)) {
					droppedProviders.push({
						providerId: remappedCandidate.providerId,
						apiModelId: remappedCandidate.apiModelId ?? null,
						providerModelSlug: remappedCandidate.providerModelSlug ?? null,
						reason: "service_tier_remap_not_authorized",
					});
					continue;
				}
                nextCandidates.push(remappedCandidate);
                remappedProviders.push({
                    providerId: candidate.providerId,
                    fromApiModelId: candidate.apiModelId ?? null,
                    toApiModelId: remappedCandidate.apiModelId ?? `${String(candidate.apiModelId ?? "").trim()}-fast`,
                    reason: "priority_fast_sibling",
                });
                continue;
            }
        }
        if (requestedPlan === "flex") {
            const remappedCandidate = await remapToTierSibling(candidate, args.capability, requestedPlan);
            if (remappedCandidate) {
				if (args.authorizeRemappedCandidate && !args.authorizeRemappedCandidate(remappedCandidate)) {
					droppedProviders.push({
						providerId: remappedCandidate.providerId,
						apiModelId: remappedCandidate.apiModelId ?? null,
						providerModelSlug: remappedCandidate.providerModelSlug ?? null,
						reason: "service_tier_remap_not_authorized",
					});
					continue;
				}
                nextCandidates.push(remappedCandidate);
                remappedProviders.push({
                    providerId: candidate.providerId,
                    fromApiModelId: candidate.apiModelId ?? null,
                    toApiModelId: remappedCandidate.apiModelId ?? `${String(candidate.apiModelId ?? "").trim()}-flex`,
                    reason: "flex_sibling",
                });
                continue;
            }
        }

        droppedProviders.push({
            providerId: candidate.providerId,
            apiModelId: candidate.apiModelId ?? null,
            providerModelSlug: candidate.providerModelSlug ?? null,
            reason: `service_tier_${requestedPlan}_unsupported`,
        });
    }

    return {
        candidates: nextCandidates,
        diagnostics: {
            requestedTier,
            requestedPlan,
            beforeCount: args.candidates.length,
            afterCount: nextCandidates.length,
            droppedProviders,
            remappedProviders,
        },
    };
}
