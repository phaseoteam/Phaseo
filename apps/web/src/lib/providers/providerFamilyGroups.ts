import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import {
    formatProviderOfferVariantLabel,
    inferProviderFamilyIdFromSiblings,
    inferProviderFamilyName,
    isGlobalProviderOffer,
    resolveProviderLogoId,
} from "@/lib/providers/providerOffers";

export type ProviderPricingFamilyGroup = {
    familyId: string;
    familyName: string;
    logoProviderId: string;
    routeProviderId: string;
    providers: ProviderPricing[];
    offerLabels: string[];
};

function resolveMergedPricingPlan(provider: ProviderPricing): string | null {
    const explicitLabel = String(provider.provider.offer_label ?? "")
        .trim()
        .toLowerCase();
    const providerId = String(provider.provider.api_provider_id ?? "")
        .trim()
        .toLowerCase();

    if (explicitLabel === "priority") return "priority";
    if (
        providerId.endsWith("-lightning") ||
        providerId.endsWith("-turbo") ||
        providerId.endsWith("-fast")
    ) {
        return "priority";
    }

    return null;
}

function getProviderFamilyId(
    provider: ProviderPricing,
    knownProviderIds: Iterable<string>,
): string {
    const explicitFamilyId = String(
        provider.provider.provider_family_id ?? "",
    ).trim();

    if (
        explicitFamilyId &&
        explicitFamilyId !== provider.provider.api_provider_id
    ) {
        return explicitFamilyId;
    }

    const inferredFamilyId = inferProviderFamilyIdFromSiblings({
        providerId: provider.provider.api_provider_id,
        knownProviderIds,
    });

    return inferredFamilyId || explicitFamilyId || provider.provider.api_provider_id;
}

function getOfferSortRank(provider: ProviderPricing, familyId: string): number {
    if (provider.provider.api_provider_id === familyId) return 0;
    if (
        isGlobalProviderOffer({
            offerLabel: provider.provider.offer_label ?? null,
            offerScope: provider.provider.offer_scope ?? null,
        })
    ) {
        return 1;
    }
    if (provider.provider.offer_scope === "regional") return 2;
    if (provider.provider.offer_scope === "specialized") return 3;
    return 4;
}

function sortFamilyProviders(
    familyId: string,
    providers: ProviderPricing[],
): ProviderPricing[] {
    return [...providers].sort((a, b) => {
        const aRank = getOfferSortRank(a, familyId);
        const bRank = getOfferSortRank(b, familyId);
        if (aRank !== bRank) return aRank - bRank;

        const aLabel = formatProviderOfferVariantLabel({
            offerLabel: a.provider.offer_label ?? null,
            offerScope: a.provider.offer_scope ?? null,
            providerId: a.provider.api_provider_id,
        });
        const bLabel = formatProviderOfferVariantLabel({
            offerLabel: b.provider.offer_label ?? null,
            offerScope: b.provider.offer_scope ?? null,
            providerId: b.provider.api_provider_id,
        });
        if (aLabel !== bLabel) return aLabel.localeCompare(bLabel);

        return a.provider.api_provider_id.localeCompare(b.provider.api_provider_id);
    });
}

function resolveRepresentativeProvider(
    familyId: string,
    providers: ProviderPricing[],
): ProviderPricing {
    return (
        providers.find((provider) => provider.provider.api_provider_id === familyId) ??
        providers.find((provider) =>
            isGlobalProviderOffer({
                offerLabel: provider.provider.offer_label ?? null,
                offerScope: provider.provider.offer_scope ?? null,
            }),
        ) ??
        providers[0]!
    );
}

export function groupProviderPricingFamilies(
    providers: ProviderPricing[],
): ProviderPricingFamilyGroup[] {
    const grouped = new Map<string, ProviderPricing[]>();
    const knownProviderIds = providers.map((provider) => provider.provider.api_provider_id);

    for (const provider of providers) {
        const familyId = getProviderFamilyId(provider, knownProviderIds);
        const current = grouped.get(familyId) ?? [];
        current.push(provider);
        grouped.set(familyId, current);
    }

    return Array.from(grouped.entries()).map(([familyId, familyProviders]) => {
        const providersInFamily = sortFamilyProviders(familyId, familyProviders);
        const representative = resolveRepresentativeProvider(
            familyId,
            providersInFamily,
        );
        const familyName =
            representative.provider.api_provider_name ||
            inferProviderFamilyName({
                providerName:
                    providersInFamily[0]?.provider.api_provider_name ??
                    providersInFamily[0]?.provider.api_provider_id ??
                    familyId,
                offerLabel: providersInFamily[0]?.provider.offer_label ?? null,
                offerScope: providersInFamily[0]?.provider.offer_scope ?? null,
            }) ||
            familyId;

        return {
            familyId,
            familyName,
            logoProviderId: resolveProviderLogoId({
                providerId: representative.provider.api_provider_id,
                providerFamilyId: familyId,
            }),
            routeProviderId: representative.provider.api_provider_id,
            providers: providersInFamily,
            offerLabels: providersInFamily.map((provider) =>
                formatProviderOfferVariantLabel({
                    offerLabel: provider.provider.offer_label ?? null,
                    offerScope: provider.provider.offer_scope ?? null,
                    providerId: provider.provider.api_provider_id,
                }),
            ),
        };
    });
}

export function mergeProviderPricingOffers(
    providers: ProviderPricing[],
): ProviderPricing[] {
    const knownProviderIds = providers.map((provider) => provider.provider.api_provider_id);
    const grouped = new Map<string, ProviderPricing[]>();

    for (const provider of providers) {
        const familyId = getProviderFamilyId(provider, knownProviderIds);
        const current = grouped.get(familyId) ?? [];
        current.push(provider);
        grouped.set(familyId, current);
    }

    const mergedProviders: ProviderPricing[] = [];

    for (const [familyId, familyProviders] of grouped.entries()) {
        const providersInFamily = sortFamilyProviders(familyId, familyProviders);
        const baseProvider = providersInFamily.find((provider) =>
            provider.provider.api_provider_id === familyId ||
            isGlobalProviderOffer({
                offerLabel: provider.provider.offer_label ?? null,
                offerScope: provider.provider.offer_scope ?? null,
            }),
        );

        if (!baseProvider) {
            mergedProviders.push(...providersInFamily);
            continue;
        }

        const mergedProvider: ProviderPricing = {
            provider: {
                ...baseProvider.provider,
                api_provider_name:
                    baseProvider.provider.api_provider_name ||
                    inferProviderFamilyName({
                        providerName:
                            providersInFamily[0]?.provider.api_provider_name ??
                            familyId,
                        offerLabel:
                            providersInFamily[0]?.provider.offer_label ?? null,
                        offerScope:
                            providersInFamily[0]?.provider.offer_scope ?? null,
                    }),
                provider_family_id: familyId,
                offer_label: null,
                offer_scope: "global",
            },
            provider_models: [...baseProvider.provider_models],
            pricing_rules: [...baseProvider.pricing_rules],
        };

        let mergedAnySibling = false;

        for (const provider of providersInFamily) {
            if (provider.provider.api_provider_id === baseProvider.provider.api_provider_id) {
                continue;
            }

            const targetPlan = resolveMergedPricingPlan(provider);
            if (!targetPlan) {
                mergedProviders.push(provider);
                continue;
            }

            mergedAnySibling = true;
            mergedProvider.provider_models.push(...provider.provider_models);
            mergedProvider.pricing_rules.push(
                ...provider.pricing_rules.map((rule) => ({
                    ...rule,
                    pricing_plan: targetPlan,
                })),
            );
        }

        mergedProviders.push(mergedProvider);

        if (!mergedAnySibling) {
            continue;
        }
    }

    return mergedProviders.sort((a, b) => {
        const an = a.provider.api_provider_name || a.provider.api_provider_id;
        const bn = b.provider.api_provider_name || b.provider.api_provider_id;
        return an.localeCompare(bn);
    });
}
