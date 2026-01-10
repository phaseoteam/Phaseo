"use client";

import React, { useMemo, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { type ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import ProviderCard from "@/components/(data)/model/pricing/ProviderCard";

const PLAN_ORDER = ["free", "standard", "batch", "flex", "priority"] as const;

const formatPlanLabel = (plan: string) =>
    plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : plan;

type SortOption = "default" | "pricing" | "throughput" | "latency";

export default function ModelPricingClient({
    providers,
    creatorOrgId,
}: {
    providers: ProviderPricing[];
    creatorOrgId?: string | null;
}) {
    // discover available plans across all providers
    const availablePlans = useMemo(() => {
        const s = new Set<string>();
        for (const p of providers)
            for (const r of p.pricing_rules)
				s.add(r.pricing_plan || "standard");
		return PLAN_ORDER.filter((x) => s.has(x));
	}, [providers]);

    const [plan, setPlan] = useState<string>(availablePlans[0] || "standard");
    const [sort, setSort] = useState<SortOption>("default");
    const sortLabel =
        sort === "default"
            ? "Default"
            : sort.charAt(0).toUpperCase() + sort.slice(1);

    const sortedProviders = useMemo(() => {
        const list = [...providers];
        const byName = (a: ProviderPricing, b: ProviderPricing) => {
            const an = a.provider.api_provider_name || a.provider.api_provider_id;
            const bn = b.provider.api_provider_name || b.provider.api_provider_id;
            return an.localeCompare(bn);
        };

        if (sort === "default") {
            if (creatorOrgId) {
                list.sort((a, b) => {
                    const aIsCreator = a.provider.api_provider_id === creatorOrgId;
                    const bIsCreator = b.provider.api_provider_id === creatorOrgId;
                    if (aIsCreator && !bIsCreator) return -1;
                    if (!aIsCreator && bIsCreator) return 1;
                    return byName(a, b);
                });
                return list;
            }
            return list.sort(byName);
        }

        return list.sort(byName);
    }, [providers, creatorOrgId, sort]);

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<div>
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						Pricing by Provider
					</h2>
				</div>
                <div className="flex items-center gap-3">
                    {availablePlans.length === 1 ? (
                        <span className="text-sm font-medium px-3 py-1 bg-muted rounded-md">
                            {formatPlanLabel(availablePlans[0])} Tier
                        </span>
                    ) : (
                        <PricingPlanSelect
							value={plan}
							onChange={setPlan}
                            plans={availablePlans}
                        />
                    )}
                    <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}>
                        <SelectTrigger className="w-[170px]">
                            <SelectValue placeholder="Sort">{sortLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="pricing" disabled>
                                Pricing
                            </SelectItem>
                            <SelectItem value="throughput" disabled>
                                Throughput
                            </SelectItem>
                            <SelectItem value="latency" disabled>
                                Latency
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {sortedProviders.map((prov) => (
                    <ProviderCard
                        key={prov.provider.api_provider_id}
                        provider={prov}
						plan={plan}
					/>
				))}
			</div>
		</div>
	);
}
