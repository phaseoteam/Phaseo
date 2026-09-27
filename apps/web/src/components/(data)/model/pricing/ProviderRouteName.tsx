"use client";

import type { ProviderInfo } from "@/lib/fetchers/models/getModelPricing";
import { getProviderRoutePresentation, isSelectableServiceTier } from "./providerRoutePresentation";
import { ServiceTierBadge } from "./ServiceTierBadge";

export function ProviderRouteName({ provider, plan = "standard", nameOverride, showTierHelp = false }: { provider: ProviderInfo; plan?: string; nameOverride?: string; showTierHelp?: boolean }) {
    const { name, region, tier } = getProviderRoutePresentation(provider, plan, nameOverride);
    const badge = tier ? (
        <ServiceTierBadge
            plan={plan}
            showTooltip={showTierHelp && isSelectableServiceTier(plan)}
        />
    ) : null;
    return (
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span>{name}{region ? ` (${region.toUpperCase()})` : ""}</span>
            {badge}
        </span>
    );
}
