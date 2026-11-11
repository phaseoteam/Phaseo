// Purpose: The model list as one key may use it (GET /v1/models/me).
// Why: Apps such as Phaseo desktop list models from the gateway; listing ones a guardrail blocks only fails later, at send.
// How: Each model's offers go through applyWorkspacePolicy, the same check requests get, with the key's workspace policy.

import { getSupabaseAdmin } from "@/runtime/env";
import { applyWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import type { ProviderCandidate, WorkspacePolicy } from "@pipeline/before/types";
import type { PriceCard } from "@pipeline/pricing/types";

type ListedOffer = {
    provider: { id: string };
    status?: string | null;
    routable?: boolean;
    pricing?: { meters?: Record<string, { price_per_unit?: string | number | null } | null> } | null;
};
type ListedModel = {
    id: string;
    offers: ListedOffer[];
    availability: {
        provider_count: number;
        active_provider_count: number;
        coming_soon_provider_count: number;
        inactive_provider_count: number;
        [key: string]: unknown;
    };
};

/** What a provider says it does with prompts, from v2_providers, as the request pipeline reads it. */
export type ProviderDataFacts = Pick<ProviderCandidate, "zeroDataRetention" | "promptTrainingPolicy" | "dataPolicyTier" | "dataPolicyConfidence">;

const PROVIDER_BATCH = 200;
/** A workspace's own models run under its own agreement (pipeline/before/context.ts gives them the same facts). */
const PRIVATE_MODEL_FACTS: ProviderDataFacts = {
    zeroDataRetention: true,
    promptTrainingPolicy: "enterprise_no_train",
    dataPolicyTier: "private",
    dataPolicyConfidence: "confirmed",
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
            .select("provider_slug,zero_data_retention,prompt_training_policy,data_policy_tier,data_policy_confidence")
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
            } as ProviderDataFacts);
        }
    }
    return facts;
}

/** The offer's prices as the price rules the free/paid training rules read (only price_per_unit matters there). */
function offerPriceCard(offer: ListedOffer): PriceCard | null {
    const meters = Object.values(offer.pricing?.meters ?? {}).filter((meter): meter is { price_per_unit?: string | number | null } => Boolean(meter));
    if (!meters.length) return null;
    return { rules: meters.map((meter) => ({ price_per_unit: meter.price_per_unit ?? null })) } as unknown as PriceCard;
}

/**
 * The models the policy lets this key use, each with only the offers it may be routed to. A model with no permitted
 * offer, or one a model rule blocks, is left out, as a request for it would be refused.
 */
export function filterModelsForPolicy<T extends ListedModel>(models: T[], policy: WorkspacePolicy, facts: Map<string, ProviderDataFacts>): T[] {
    return models.flatMap((model) => {
        const candidates: ProviderCandidate[] = model.offers.map((offer) => ({
            providerId: offer.provider.id,
            apiModelId: model.id,
            ...(offer.provider.id === "private-model" ? PRIVATE_MODEL_FACTS : facts.get(offer.provider.id) ?? {}),
            pricingCard: offerPriceCard(offer),
        } as ProviderCandidate));
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
export async function modelsForPolicy<T extends ListedModel>(models: T[], policy: WorkspacePolicy): Promise<T[]> {
    if (!policyRestrictsModels(policy)) return models;
    const facts = policyChecksPrivacy(policy)
        ? await fetchProviderDataFacts(models.flatMap((model) => model.offers.map((offer) => offer.provider.id)))
        : new Map<string, ProviderDataFacts>();
    return filterModelsForPolicy(models, policy, facts);
}
