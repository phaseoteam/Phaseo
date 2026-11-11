// Purpose: The model list as one key may use it (GET /v1/models/me).
// Why: Apps such as Phaseo desktop list models from the gateway; listing ones a guardrail blocks only fails later, at send.
// How: Each model's offers go through applyWorkspacePolicy, the same check requests get, with the key's workspace policy.
// The candidates are built as buildProviderCandidates builds them for a request: each route's concrete model (the Free
// router's routes serve other models) and its effective data policy (resolveEffectiveDataPolicy: the provider's facts
// with the route's capability override applied).

import { getSupabaseAdmin } from "@/runtime/env";
import { resolveEffectiveDataPolicy } from "@pipeline/before/dataPolicy";
import { applyWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import type { GatewayProviderSnapshot, ProviderCandidate, WorkspacePolicy } from "@pipeline/before/types";
import type { PriceCard } from "@pipeline/pricing/types";

type ListedMeter = { provider_id?: string; unit?: string; unit_size?: number; price_per_unit?: string | number | null; currency?: string | null };
type ListedOffer = {
    provider: { id: string };
    status?: string | null;
    routable?: boolean;
    pricing?: { meters?: Record<string, ListedMeter | null> } | null;
};
type ListedModel = {
    id: string;
    offers: ListedOffer[];
    pricing?: { meters?: Record<string, ListedMeter | null>; [key: string]: unknown } | null;
    availability: {
        provider_count: number;
        active_provider_count: number;
        coming_soon_provider_count: number;
        inactive_provider_count: number;
        [key: string]: unknown;
    };
};

/** What a provider says it does with prompts, from v2_providers (or a route's snapshot), as the request pipeline reads it. */
export type ProviderDataFacts = Partial<Pick<GatewayProviderSnapshot, "zeroDataRetention" | "promptTrainingPolicy" | "dataPolicyTier" | "dataPolicyConfidence" | "dataPolicyVariant">>;

/**
 * What the request pipeline checks for one route and the listing doesn't show: the concrete model it serves (the Free
 * router's routes serve other models), its capability params (their `data_policy` overrides the provider's facts) and,
 * when known from the route's own snapshot, its data facts.
 */
export type PolicyRouteFacts = { apiModelId?: string; routeId?: string; capabilityParams?: Record<string, unknown>; facts?: ProviderDataFacts };

const PROVIDER_BATCH = 200;
/** A workspace's own models run under its own agreement (pipeline/before/context.ts gives them the same facts). */
const PRIVATE_MODEL_FACTS: ProviderDataFacts = {
    zeroDataRetention: true,
    promptTrainingPolicy: "enterprise_no_train",
    dataPolicyTier: "private",
    dataPolicyConfidence: "confirmed",
    dataPolicyVariant: "standard",
};

/** Whether the policy can rule out any model or provider; without one, the list is the shared catalogue. */
export function policyRestrictsModels(policy: WorkspacePolicy): boolean {
    return Boolean(
        policy.allowedApiModels
        || policy.blockedApiModels?.length
        || policy.providerAllowlist
        || policy.providerBlocklist?.length
        || policy.privacyZdrOnly
        || policy.privacyEnablePaidMayTrain === false
        || policy.privacyEnableFreeMayTrain === false
        || policy.privacyEnableInputOutputLogging === false,
    );
}

/** Whether the policy's privacy rules apply, which need each provider's data facts. */
function policyChecksPrivacy(policy: WorkspacePolicy): boolean {
    return policy.privacyZdrOnly
        || policy.privacyEnablePaidMayTrain === false
        || policy.privacyEnableFreeMayTrain === false
        || policy.privacyEnableInputOutputLogging === false;
}

export async function fetchProviderDataFacts(providerIds: string[]): Promise<Map<string, ProviderDataFacts>> {
    const facts = new Map<string, ProviderDataFacts>();
    const ids = [...new Set(providerIds.filter((id) => id && id !== "private-model"))];
    for (let index = 0; index < ids.length; index += PROVIDER_BATCH) {
        const { data, error } = await getSupabaseAdmin()
            .from("v2_providers")
            .select("provider_slug,zero_data_retention,prompt_training_policy,data_policy_tier,data_policy_confidence,data_policy_variant")
            .in("provider_slug", ids.slice(index, index + PROVIDER_BATCH));
        if (error) throw new Error(`provider_data_policy_lookup_failed:${error.message ?? "unknown"}`);
        for (const row of (data ?? []) as any[]) {
            if (typeof row?.provider_slug !== "string") continue;
            // applyWorkspacePolicy normalises the policy strings itself; unknown values count as unknown there.
            facts.set(row.provider_slug, {
                zeroDataRetention: row.zero_data_retention === true,
                promptTrainingPolicy: row.prompt_training_policy ?? "unknown",
                dataPolicyTier: row.data_policy_tier ?? "unknown",
                dataPolicyConfidence: row.data_policy_confidence ?? "unknown",
                dataPolicyVariant: row.data_policy_variant === "zdr" ? "zdr" : "standard",
            } as ProviderDataFacts);
        }
    }
    return facts;
}

/**
 * Text routes that declare their own data policy, by route id, from v2_effective_route_capabilities: the view the
 * request pipeline reads (the base table doesn't carry these). Few routes have one, so they're read in one query.
 */
export async function fetchRouteDataPolicies(): Promise<Map<string, Record<string, unknown>>> {
    const { data, error } = await getSupabaseAdmin()
        .from("v2_effective_route_capabilities")
        .select("provider_model_id,data_policy:params->data_policy")
        .eq("capability_id", "text.generate")
        .not("params->data_policy", "is", null);
    if (error) throw new Error(`route_data_policy_lookup_failed:${error.message ?? "unknown"}`);
    return new Map(((data ?? []) as any[])
        .filter((row) => typeof row?.provider_model_id === "string" && row.data_policy && typeof row.data_policy === "object" && !Array.isArray(row.data_policy))
        .map((row) => [row.provider_model_id, row.data_policy as Record<string, unknown>]));
}

/** The offer's prices as the price rules the free/paid training rules read (only price_per_unit matters there). */
function offerPriceCard(offer: ListedOffer): PriceCard | null {
    const meters = Object.values(offer.pricing?.meters ?? {}).filter((meter): meter is ListedMeter => Boolean(meter));
    if (!meters.length) return null;
    return { rules: meters.map((meter) => ({ price_per_unit: meter.price_per_unit ?? null })) } as unknown as PriceCard;
}

/** One route as a request candidate, as buildProviderCandidates makes it: the concrete model and the effective data policy. */
function candidateFor(model: ListedModel, offer: ListedOffer, route: PolicyRouteFacts | undefined, facts: Map<string, ProviderDataFacts>): ProviderCandidate {
    const providerId = offer.provider.id;
    const provider = { ...(providerId === "private-model" ? PRIVATE_MODEL_FACTS : facts.get(providerId) ?? {}), ...route?.facts };
    const effectiveDataPolicy = resolveEffectiveDataPolicy({
        endpoint: "text.generate",
        provider: {
            dataPolicyTier: provider.dataPolicyTier ?? "unknown",
            dataPolicyConfidence: provider.dataPolicyConfidence ?? "unknown",
            zeroDataRetention: provider.zeroDataRetention ?? false,
            dataPolicyVariant: provider.dataPolicyVariant ?? "standard",
            capabilityParams: (route?.capabilityParams ?? {}) as GatewayProviderSnapshot["capabilityParams"],
        } as Parameters<typeof resolveEffectiveDataPolicy>[0]["provider"],
    });
    return {
        providerId,
        apiModelId: route?.apiModelId ?? model.id,
        promptTrainingPolicy: provider.promptTrainingPolicy ?? null,
        zeroDataRetention: effectiveDataPolicy.zdrEligibility === "eligible",
        dataPolicyTier: effectiveDataPolicy.tier,
        dataPolicyConfidence: effectiveDataPolicy.confidence,
        effectiveDataPolicy,
        pricingCard: offerPriceCard(offer),
    } as ProviderCandidate;
}

const perUnit = (meter: ListedMeter) => {
    const price = Number(meter.price_per_unit), size = Number(meter.unit_size) || 1;
    return Number.isFinite(price) ? price / size : Number.POSITIVE_INFINITY;
};

/** The model's prices from the offers left: per meter, the cheapest, as the catalogue picks it from every offer. */
function pricingFrom<T extends ListedModel>(model: T, offers: ListedOffer[]): T["pricing"] {
    if (!model.pricing?.meters) return model.pricing;
    const meters = Object.fromEntries(Object.keys(model.pricing.meters).map((name) => {
        const cheapest = offers.map((offer) => offer.pricing?.meters?.[name]).filter((meter): meter is ListedMeter => Boolean(meter))
            .reduce<ListedMeter | null>((best, meter) => !best || perUnit(meter) < perUnit(best) ? meter : best, null);
        return [name, cheapest ? { ...cheapest } : null];
    }));
    return { ...model.pricing, meters };
}

/**
 * The models the policy lets this key use, each with only the offers it may be routed to, and its prices and counts
 * from those. A model with no permitted offer, or one a model rule blocks, is left out, as a request would be refused.
 */
export function filterModelsForPolicy<T extends ListedModel>(
    models: T[],
    policy: WorkspacePolicy,
    facts: Map<string, ProviderDataFacts>,
    routes: Map<string, Map<string, PolicyRouteFacts>> = new Map(),
): T[] {
    return models.flatMap((model) => {
        const modelRoutes = routes.get(model.id);
        const candidates = model.offers.map((offer) => candidateFor(model, offer, modelRoutes?.get(offer.provider.id), facts));
        const result = applyWorkspacePolicy({ providers: candidates, resolvedModel: model.id, body: {}, workspacePolicy: policy });
        if (!result.ok) return [];
        const permitted = new Set(result.providers.map((provider) => provider.providerId));
        const offers = model.offers.filter((offer) => permitted.has(offer.provider.id));
        if (offers.length === model.offers.length) return [model];
        const count = (status: string) => offers.filter((offer) => offer.status === status).length;
        const active = count("active"), comingSoon = count("coming_soon");
        return [{
            ...model,
            offers,
            pricing: pricingFrom(model, offers),
            availability: {
                ...model.availability,
                provider_count: offers.length,
                active_provider_count: active,
                coming_soon_provider_count: comingSoon,
                inactive_provider_count: offers.length - active - comingSoon,
            },
        }];
    });
}

/** Up to this many hidden models are named; the count is always exact. */
const MAX_HIDDEN_MODELS_NAMED = 500;

/**
 * What the key's rules took out of a listing, for apps to explain it: whether any rule restricts models or providers,
 * the models left out (by id and name) and how many kept models lost some of their providers.
 */
export function modelAccessSummary(
    listed: Array<{ id: string; name?: string | null; offers: unknown[] }>,
    permitted: Array<{ id: string; offers: unknown[] }>,
    policy: WorkspacePolicy,
) {
    const kept = new Map(permitted.map((model) => [model.id, model.offers.length]));
    const hidden = listed.filter((model) => !kept.has(model.id));
    return {
        restricted: policyRestrictsModels(policy),
        hidden_model_count: hidden.length,
        hidden_models: hidden.slice(0, MAX_HIDDEN_MODELS_NAMED).map((model) => ({ id: model.id, name: model.name ?? model.id })),
        limited_model_count: listed.filter((model) => kept.has(model.id) && kept.get(model.id)! < model.offers.length).length,
    };
}

/** The list for one key: the shared catalogue with the key's policy applied. */
export async function modelsForPolicy<T extends ListedModel>(models: T[], policy: WorkspacePolicy, routes: Map<string, Map<string, PolicyRouteFacts>> = new Map()): Promise<T[]> {
    if (!policyRestrictsModels(policy)) return models;
    if (!policyChecksPrivacy(policy)) return filterModelsForPolicy(models, policy, new Map(), routes);
    const [facts, routePolicies] = await Promise.all([
        fetchProviderDataFacts(models.flatMap((model) => model.offers.map((offer) => offer.provider.id))),
        fetchRouteDataPolicies(),
    ]);
    // Each text route's own data policy, as its capability params, where the route didn't bring its own.
    const withPolicies = new Map([...routes].map(([modelId, byProvider]) => [modelId, new Map([...byProvider].map(([providerId, route]) => {
        const dataPolicy = route.routeId ? routePolicies.get(route.routeId) : undefined;
        return [providerId, dataPolicy && !route.capabilityParams ? { ...route, capabilityParams: { data_policy: dataPolicy } } : route];
    }))]));
    return filterModelsForPolicy(models, policy, facts, withPolicies);
}
