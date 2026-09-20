"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProviderInfo } from "@/lib/fetchers/models/getModelPricing";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { cn } from "@/lib/utils";
import { getProviderRoutePresentation } from "./providerRoutePresentation";

const tierBadgeBackgrounds: Record<string, string> = {
    priority: "bg-violet-100 dark:bg-violet-950",
    flex: "bg-sky-100 dark:bg-sky-950",
    batch: "bg-orange-100 dark:bg-orange-950",
};

export function ProviderRouteName({ provider, plan = "standard", nameOverride, showTierHelp = false }: { provider: ProviderInfo; plan?: string; nameOverride?: string; showTierHelp?: boolean }) {
    const { name, region, tier } = getProviderRoutePresentation(provider, plan, nameOverride);
    const tierHelp = plan === "batch"
        ? "Batch is not used for ordinary requests. Submit requests through the Batch API to use this tier."
        : `${tier} requires explicit selection in your request or a route dedicated to this tier. It is not selected automatically.`;
    const badge = tier ? (
        <Badge
            variant="secondary"
            className={cn(
                "h-4 rounded-sm border-0 px-1.5 py-0 text-[10px] leading-none",
                tierBadgeBackgrounds[plan] ?? "bg-muted",
                getTierFilterMeta(plan).iconClassName,
            )}
        >
            {tier}
        </Badge>
    ) : null;
    return (
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span>{name}{region ? ` (${region.toUpperCase()})` : ""}</span>
            {tier && showTierHelp ? (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span tabIndex={0} aria-label={`${tier} service tier information`} className="inline-flex cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {badge}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64 whitespace-normal leading-relaxed">{tierHelp}</TooltipContent>
                </Tooltip>
            ) : badge}
        </span>
    );
}
