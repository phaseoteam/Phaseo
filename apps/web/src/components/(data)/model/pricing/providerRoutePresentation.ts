import type { ProviderInfo } from "@/lib/fetchers/models/getModelPricing";
import { formatProviderOfferDisplayName } from "@/lib/providers/providerOffers";

export function getProviderRoutePresentation(provider: ProviderInfo, plan = "standard", nameOverride?: string) {
    const id = provider.api_provider_id.toLowerCase();
    const region = id.endsWith("-eu") ? "eu" : id.endsWith("-us") ? "us" : null;
    let name = nameOverride || formatProviderOfferDisplayName({
        providerId: provider.api_provider_id,
        providerName: provider.api_provider_name || provider.api_provider_id,
        offerLabel: provider.offer_label,
        offerScope: provider.offer_scope,
    });
    if (region) name = name.replace(/\s*\((?:EU|US)\)$/i, "");
    const tier = plan !== "standard" && plan !== "free"
        ? plan === "priority" ? "Fast" : plan.replace(/[_-]+/g, " ").replace(/\b\w/g, character => character.toUpperCase())
        : null;
    return { name, region, tier };
}

// These sections describe route variants, not live health or availability.
export function isProviderRouteVariant(provider: ProviderInfo, plan: string) {
    return provider.offer_scope === "regional" ||
        provider.offer_scope === "specialized" ||
        getProviderRoutePresentation(provider).region !== null ||
        (plan !== "standard" && plan !== "free");
}
