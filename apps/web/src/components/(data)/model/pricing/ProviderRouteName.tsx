import type { ProviderInfo } from "@/lib/fetchers/models/getModelPricing";
import { getProviderRoutePresentation, isSelectableServiceTier } from "./providerRoutePresentation";
import { ServiceTierBadge } from "./ServiceTierBadge";

export function ProviderRouteName({ provider, plan = "standard", nameOverride, showTierHelp = false }: { provider: ProviderInfo; plan?: string; nameOverride?: string; showTierHelp?: boolean }) {
    const { name, region } = getProviderRoutePresentation(provider, plan, nameOverride);
    return (
        <span className="inline-flex shrink-0 items-center max-sm:min-w-0 max-sm:max-w-full max-sm:shrink gap-2 whitespace-nowrap">
            <span className="inline-flex min-w-0"><span className="max-sm:truncate">{name}</span>{region ? <span className="shrink-0">&nbsp;({region.toUpperCase()})</span> : null}</span>
            <ServiceTierBadge
                plan={plan}
                showTooltip={showTierHelp && isSelectableServiceTier(plan)}
            />
        </span>
    );
}
