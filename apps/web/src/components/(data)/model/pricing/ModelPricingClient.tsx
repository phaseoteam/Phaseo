"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import ProviderCard from "@/components/(data)/model/pricing/ProviderCard";

const PLAN_ORDER = ["free", "standard", "batch", "flex", "priority"] as const;

const formatPlanLabel = (plan: string) =>
    plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : plan;

type SortOption = "default" | "pricing" | "throughput" | "latency";

export default function ModelPricingClient({
    providers,
    subscriptionPlans,
    creatorOrgId,
    runtimeStats = {},
    routingHealth = {},
}: {
    providers: ProviderPricing[];
    subscriptionPlans: SubscriptionPlan[];
    creatorOrgId?: string | null;
    runtimeStats?: ProviderRuntimeStatsMap;
    routingHealth?: ProviderRoutingStatusMap;
}) {
    // discover available plans across all providers
    const availablePlans = useMemo(() => {
        const s = new Set<string>();
        for (const p of providers)
            for (const r of p.pricing_rules)
				s.add(r.pricing_plan || "standard");
		return PLAN_ORDER.filter((x) => s.has(x));
	}, [providers]);

    const [plan, setPlan] = useState<string>(
        availablePlans.includes("standard")
            ? "standard"
            : availablePlans.includes("free")
            ? "free"
            : availablePlans[0] || "standard"
    );
    const [sort, setSort] = useState<SortOption>("default");
    const sortLabel =
        sort === "default"
            ? "Default"
            : sort.charAt(0).toUpperCase() + sort.slice(1);
    const sortedSubscriptionPlans = useMemo(() => {
        return [...subscriptionPlans].sort((a, b) => {
            const aOrg = a.organisation?.name ?? "";
            const bOrg = b.organisation?.name ?? "";
            if (aOrg !== bOrg) return aOrg.localeCompare(bOrg);
            return a.name.localeCompare(b.name);
        });
    }, [subscriptionPlans]);

    const sortedProviders = useMemo(() => {
        const list = [...providers];
        const isProviderActiveForPlan = (provider: ProviderPricing) => {
            const planRules = provider.pricing_rules.filter(
                (r) => (r.pricing_plan || "standard") === plan
            );
            const planModelKeys = new Set(planRules.map((r) => r.model_key));
            const matchingProviderModels = provider.provider_models.filter((pm) =>
                planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
            );
            const modelScope = matchingProviderModels.length
                ? matchingProviderModels
                : provider.provider_models;
            return modelScope.some((pm) => pm.is_active_gateway);
        };
        const byActive = (a: ProviderPricing, b: ProviderPricing) => {
            const aIsActive = isProviderActiveForPlan(a);
            const bIsActive = isProviderActiveForPlan(b);
            if (aIsActive && !bIsActive) return -1;
            if (!aIsActive && bIsActive) return 1;
            return 0;
        };
        const byName = (a: ProviderPricing, b: ProviderPricing) => {
            const an = a.provider.api_provider_name || a.provider.api_provider_id;
            const bn = b.provider.api_provider_name || b.provider.api_provider_id;
            return an.localeCompare(bn);
        };
        const withCreatorBias = (a: ProviderPricing, b: ProviderPricing) => {
            const activeCmp = byActive(a, b);
            if (activeCmp !== 0) return activeCmp;
            if (creatorOrgId) {
                const aIsCreator = a.provider.api_provider_id === creatorOrgId;
                const bIsCreator = b.provider.api_provider_id === creatorOrgId;
                if (aIsCreator && !bIsCreator) return -1;
                if (!aIsCreator && bIsCreator) return 1;
            }
            return byName(a, b);
        };

        if (sort === "default") {
            return list.sort(withCreatorBias);
        }

        if (sort === "throughput") {
            return list.sort((a, b) => {
                const activeCmp = byActive(a, b);
                if (activeCmp !== 0) return activeCmp;
                const aTp = runtimeStats[a.provider.api_provider_id]?.throughput30m;
                const bTp = runtimeStats[b.provider.api_provider_id]?.throughput30m;
                if (aTp == null && bTp == null) return withCreatorBias(a, b);
                if (aTp == null) return 1;
                if (bTp == null) return -1;
                if (aTp !== bTp) return bTp - aTp;
                return withCreatorBias(a, b);
            });
        }

        if (sort === "latency") {
            return list.sort((a, b) => {
                const activeCmp = byActive(a, b);
                if (activeCmp !== 0) return activeCmp;
                const aLat = runtimeStats[a.provider.api_provider_id]?.latencyMs30m;
                const bLat = runtimeStats[b.provider.api_provider_id]?.latencyMs30m;
                if (aLat == null && bLat == null) return withCreatorBias(a, b);
                if (aLat == null) return 1;
                if (bLat == null) return -1;
                if (aLat !== bLat) return aLat - bLat;
                return withCreatorBias(a, b);
            });
        }

        return list.sort(withCreatorBias);
    }, [providers, creatorOrgId, runtimeStats, sort, plan]);

	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<div>
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						Availability + Pricing by Provider
					</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Performance metrics are sourced from gateway request logs in the database.
                    </p>
				</div>
            </div>

            <section className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold">API Providers</h3>
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
                                <SelectItem value="throughput">
                                    Throughput
                                </SelectItem>
                                <SelectItem value="latency">
                                    Latency
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {sortedProviders.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {sortedProviders.map((prov) => (
                            <ProviderCard
                                key={prov.provider.api_provider_id}
                                provider={prov}
                                plan={plan}
                                runtimeStats={
                                    runtimeStats[prov.provider.api_provider_id] ?? null
                                }
                                routingStatus={
                                    routingHealth[prov.provider.api_provider_id] ?? null
                                }
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground">
                            No API provider pricing is available for this model.
                        </p>
                    </Card>
                )}
            </section>

            {sortedSubscriptionPlans.length > 0 ? (
                <section className="space-y-4">
                    <h3 className="text-lg font-semibold">Subscriptions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {sortedSubscriptionPlans.map((planItem) => (
                            <Card key={planItem.plan_id} className="p-4 space-y-2">
                                <Link
                                    href={`/subscription-plans/${planItem.plan_id}`}
                                    className="text-sm font-semibold hover:text-primary transition-colors"
                                >
                                    {planItem.name}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                    {planItem.organisation?.name ?? "Unknown provider"}
                                </p>
                                <div className="space-y-1">
                                    {planItem.prices.map((price) => {
                                        const suffix =
                                            price.frequency === "monthly"
                                                ? "/mo"
                                                : price.frequency === "yearly"
                                                ? "/yr"
                                                : price.frequency === "daily"
                                                ? "/day"
                                                : "";
                                        const formatted = new Intl.NumberFormat("en-US", {
                                            style: "currency",
                                            currency: price.currency,
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 2,
                                        }).format(price.price);
                                        return (
                                            <div
                                                key={`${price.frequency}:${price.currency}:${price.price}`}
                                                className="text-sm font-medium"
                                            >
                                                {formatted}
                                                {suffix}
                                            </div>
                                        );
                                    })}
                                </div>
                                {typeof planItem.model_info?.rate_limit === "string" &&
                                planItem.model_info.rate_limit.trim() ? (
                                    <p className="text-xs text-muted-foreground">
                                        Rate limit: {planItem.model_info.rate_limit}
                                    </p>
                                ) : null}
                            </Card>
                        ))}
                    </div>
                </section>
            ) : null}
		</div>
	);
}
