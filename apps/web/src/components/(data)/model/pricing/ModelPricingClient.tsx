"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { type ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import ProviderCard from "@/components/(data)/model/pricing/ProviderCard";
import { cn } from "@/lib/utils";

const PLAN_ORDER = ["free", "standard", "batch", "flex", "priority"] as const;
const PRICING_VIEW_STORAGE_KEY = "ai-stats:model-pricing-view";
const SORT_QUERY_KEY = "sort";
const SORT_DIRECTION_QUERY_KEY = "dir";
const VIEW_QUERY_KEY = "view";
const QUANT_QUERY_KEY = "quant";

const formatPlanLabel = (plan: string) =>
    plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : plan;

type SortOption = "default" | "pricing" | "throughput" | "latency" | "uptime";
type SortDirection = "asc" | "desc";
type PricingView = "api" | "subscription";
const SORT_LABELS: Record<SortOption, string> = {
    default: "Default",
    pricing: "Price",
    throughput: "Throughput",
    latency: "Latency",
    uptime: "Uptime",
};
const DEFAULT_SORT_DIRECTIONS: Record<Exclude<SortOption, "default">, SortDirection> = {
    pricing: "asc",
    throughput: "desc",
    latency: "asc",
    uptime: "desc",
};

const PRICING_METER_PREFERENCE = [
    "input_text_tokens",
    "output_text_tokens",
    "cached_read_text_tokens",
    "input_image_tokens",
    "output_image_tokens",
    "input_audio_tokens",
    "output_audio_tokens",
] as const;

function normalizedRulePrice(
    rule: ProviderPricing["pricing_rules"][number]
): number | null {
    const price = Number(rule.price_per_unit);
    if (!Number.isFinite(price) || price < 0) return null;
    const unitSize = Number(rule.unit_size ?? 1);
    if (!Number.isFinite(unitSize) || unitSize <= 0) return null;
    return price / unitSize;
}

function isPricingView(value: string | null): value is PricingView {
    return value === "api" || value === "subscription";
}

function isSortOption(value: string | null): value is SortOption {
    return (
        value === "default" ||
        value === "pricing" ||
        value === "throughput" ||
        value === "latency" ||
        value === "uptime"
    );
}

function isSortDirection(value: string | null): value is SortDirection {
    return value === "asc" || value === "desc";
}

function getDefaultSortDirection(sort: SortOption): SortDirection {
    if (sort === "default") return "desc";
    return DEFAULT_SORT_DIRECTIONS[sort];
}

function getProviderModelScopeForPlan(
    provider: ProviderPricing,
    plan: string
): ProviderPricing["provider_models"] {
    const planRules = provider.pricing_rules.filter(
        (r) => (r.pricing_plan || "standard") === plan
    );
    const planModelKeys = new Set(planRules.map((r) => r.model_key));
    const matchingProviderModels = provider.provider_models.filter((pm) =>
        planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
    );

    return matchingProviderModels.length
        ? matchingProviderModels
        : provider.provider_models;
}

function getQuantizationFilterFromUrl(value: string | null): string {
    if (!value) return "all";
    const next = value.trim();
    return next.length ? next : "all";
}

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
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();

    const availablePlans = useMemo(() => {
        const s = new Set<string>();
        for (const p of providers) {
            for (const r of p.pricing_rules) {
                s.add(r.pricing_plan || "standard");
            }
        }
        return PLAN_ORDER.filter((x) => s.has(x));
    }, [providers]);

    const [plan, setPlan] = useState<string>(
        availablePlans.includes("standard")
            ? "standard"
            : availablePlans.includes("free")
            ? "free"
            : availablePlans[0] || "standard"
    );
    const [sort, setSort] = useState<SortOption>(() => {
        const fromUrl = searchParams.get(SORT_QUERY_KEY);
        return isSortOption(fromUrl) ? fromUrl : "default";
    });
    const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
        const fromUrl = searchParams.get(SORT_DIRECTION_QUERY_KEY);
        return isSortDirection(fromUrl) ? fromUrl : "desc";
    });
    const [pricingView, setPricingView] = useState<PricingView>(() => {
        const fromUrl = searchParams.get(VIEW_QUERY_KEY);
        return isPricingView(fromUrl) ? fromUrl : "api";
    });
    const [quantizationFilter, setQuantizationFilter] = useState<string>(() =>
        getQuantizationFilterFromUrl(searchParams.get(QUANT_QUERY_KEY))
    );

    const sortLabel = SORT_LABELS[sort];

    const sortedSubscriptionPlans = useMemo(() => {
        return [...subscriptionPlans].sort((a, b) => {
            const aOrg = a.organisation?.name ?? "";
            const bOrg = b.organisation?.name ?? "";
            if (aOrg !== bOrg) return aOrg.localeCompare(bOrg);
            return a.name.localeCompare(b.name);
        });
    }, [subscriptionPlans]);

    const quantizationOptions = useMemo(() => {
        const values = new Set<string>();
        for (const provider of providers) {
            const scope = getProviderModelScopeForPlan(provider, plan);
            for (const model of scope) {
                const quant = model.quantization_scheme?.trim();
                if (quant) values.add(quant);
            }
        }
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [providers, plan]);

    const sortedProviders = useMemo(() => {
        const list = [...providers];
        const getProviderSortPrice = (provider: ProviderPricing): number | null => {
            const planRules = provider.pricing_rules.filter(
                (r) => (r.pricing_plan || "standard") === plan
            );
            if (!planRules.length) return null;

            for (const meter of PRICING_METER_PREFERENCE) {
                const preferredPrices = planRules
                    .filter((rule) => rule.meter === meter)
                    .map(normalizedRulePrice)
                    .filter((price): price is number => price !== null);
                if (preferredPrices.length) {
                    return Math.min(...preferredPrices);
                }
            }

            const fallbackPrices = planRules
                .map(normalizedRulePrice)
                .filter((price): price is number => price !== null);
            if (!fallbackPrices.length) return null;
            return Math.min(...fallbackPrices);
        };

        const isProviderActiveForPlan = (provider: ProviderPricing) => {
            const modelScope = getProviderModelScopeForPlan(provider, plan);
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
                if (aTp !== bTp) {
                    return sortDirection === "asc" ? aTp - bTp : bTp - aTp;
                }
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
                if (aLat !== bLat) {
                    return sortDirection === "asc" ? aLat - bLat : bLat - aLat;
                }
                return withCreatorBias(a, b);
            });
        }

        if (sort === "pricing") {
            return list.sort((a, b) => {
                const activeCmp = byActive(a, b);
                if (activeCmp !== 0) return activeCmp;

                const aPrice = getProviderSortPrice(a);
                const bPrice = getProviderSortPrice(b);
                if (aPrice == null && bPrice == null) return withCreatorBias(a, b);
                if (aPrice == null) return 1;
                if (bPrice == null) return -1;
                if (aPrice !== bPrice) {
                    return sortDirection === "asc" ? aPrice - bPrice : bPrice - aPrice;
                }
                return withCreatorBias(a, b);
            });
        }

        if (sort === "uptime") {
            return list.sort((a, b) => {
                const activeCmp = byActive(a, b);
                if (activeCmp !== 0) return activeCmp;
                const aUptime = runtimeStats[a.provider.api_provider_id]?.uptimePct3d;
                const bUptime = runtimeStats[b.provider.api_provider_id]?.uptimePct3d;
                if (aUptime == null && bUptime == null) return withCreatorBias(a, b);
                if (aUptime == null) return 1;
                if (bUptime == null) return -1;
                if (aUptime !== bUptime) {
                    return sortDirection === "asc" ? aUptime - bUptime : bUptime - aUptime;
                }
                return withCreatorBias(a, b);
            });
        }

        return list.sort(withCreatorBias);
    }, [providers, creatorOrgId, runtimeStats, sort, sortDirection, plan]);

    const filteredProviders = useMemo(() => {
        if (quantizationFilter === "all") return sortedProviders;

        return sortedProviders.filter((provider) => {
            const scope = getProviderModelScopeForPlan(provider, plan);
            return scope.some(
                (pm) => (pm.quantization_scheme?.trim() ?? "") === quantizationFilter
            );
        });
    }, [sortedProviders, quantizationFilter, plan]);
    const [activeProviders, inactiveProviders] = useMemo(() => {
        const active: ProviderPricing[] = [];
        const inactive: ProviderPricing[] = [];

        for (const provider of filteredProviders) {
            const scope = getProviderModelScopeForPlan(provider, plan);
            if (scope.some((pm) => pm.is_active_gateway)) {
                active.push(provider);
            } else {
                inactive.push(provider);
            }
        }

        return [active, inactive];
    }, [filteredProviders, plan]);

    const updateUrlState = useCallback(
        (updates: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams.toString());
            for (const [key, value] of Object.entries(updates)) {
                if (!value) {
                    next.delete(key);
                } else {
                    next.set(key, value);
                }
            }
            const nextQuery = next.toString();
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
                scroll: false,
            });
        },
        [pathname, router, searchParams]
    );

    useEffect(() => {
        const nextSort = isSortOption(searchParams.get(SORT_QUERY_KEY))
            ? (searchParams.get(SORT_QUERY_KEY) as SortOption)
            : "default";
        setSort((current) => (current === nextSort ? current : nextSort));
        const nextDirection = isSortDirection(searchParams.get(SORT_DIRECTION_QUERY_KEY))
            ? (searchParams.get(SORT_DIRECTION_QUERY_KEY) as SortDirection)
            : getDefaultSortDirection(nextSort);
        setSortDirection((current) =>
            current === nextDirection ? current : nextDirection
        );

        const nextView = searchParams.get(VIEW_QUERY_KEY);
        if (isPricingView(nextView)) {
            setPricingView((current) => (current === nextView ? current : nextView));
        }

        const nextQuant = getQuantizationFilterFromUrl(
            searchParams.get(QUANT_QUERY_KEY)
        );
        setQuantizationFilter((current) =>
            current === nextQuant ? current : nextQuant
        );
    }, [searchParams]);

    useEffect(() => {
        if (quantizationFilter === "all") return;
        if (quantizationOptions.includes(quantizationFilter)) return;

        setQuantizationFilter("all");
        updateUrlState({
            [QUANT_QUERY_KEY]: null,
        });
    }, [quantizationFilter, quantizationOptions, updateUrlState]);

    useEffect(() => {
        try {
            const urlView = new URLSearchParams(window.location.search).get(
                VIEW_QUERY_KEY
            );
            if (isPricingView(urlView)) {
                setPricingView(urlView);
                return;
            }

            const stored = window.localStorage.getItem(PRICING_VIEW_STORAGE_KEY);
            if (isPricingView(stored)) {
                setPricingView(stored);
            }
        } catch (error) {
            console.warn("[pricing] failed to read pricing view preference", error);
        }
    }, []);

    const onPricingViewChange = useCallback(
        (checked: boolean) => {
            const nextView: PricingView = checked ? "subscription" : "api";
            setPricingView(nextView);
            try {
                window.localStorage.setItem(PRICING_VIEW_STORAGE_KEY, nextView);
            } catch (error) {
                console.warn("[pricing] failed to persist pricing view preference", error);
            }

            updateUrlState({
                [VIEW_QUERY_KEY]: nextView === "api" ? null : nextView,
            });
        },
        [updateUrlState]
    );

    const onSortChange = useCallback(
        (value: string) => {
            if (!isSortOption(value)) return;

            setSort(value);
            const nextDirection = getDefaultSortDirection(value);
            setSortDirection(nextDirection);
            updateUrlState({
                [SORT_QUERY_KEY]: value === "default" ? null : value,
                [SORT_DIRECTION_QUERY_KEY]:
                    value === "default" ? null : nextDirection,
            });
        },
        [updateUrlState]
    );
    const onToggleSortDirection = useCallback(() => {
        if (sort === "default") return;

        const nextDirection: SortDirection =
            sortDirection === "asc" ? "desc" : "asc";
        setSortDirection(nextDirection);
        updateUrlState({
            [SORT_QUERY_KEY]: sort,
            [SORT_DIRECTION_QUERY_KEY]: nextDirection,
        });
    }, [sort, sortDirection, updateUrlState]);

    const onQuantizationFilterChange = useCallback(
        (value: string) => {
            const nextValue = value || "all";
            setQuantizationFilter(nextValue);
            updateUrlState({
                [QUANT_QUERY_KEY]: nextValue === "all" ? null : nextValue,
            });
        },
        [updateUrlState]
    );

    const headerTitle =
        pricingView === "subscription" ? "Subscription Plans" : "Providers";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {headerTitle}
                </h2>
                <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-background px-3 py-1.5 dark:border-zinc-800">
                    <span
                        className={cn(
                            "text-xs font-medium transition-colors sm:text-sm",
                            pricingView === "api"
                                ? "text-foreground"
                                : "text-muted-foreground"
                        )}
                    >
                        API
                    </span>
                    <Switch
                        aria-label="Toggle pricing view"
                        checked={pricingView === "subscription"}
                        onCheckedChange={onPricingViewChange}
                    />
                    <span
                        className={cn(
                            "text-xs font-medium transition-colors sm:text-sm",
                            pricingView === "subscription"
                                ? "text-foreground"
                                : "text-muted-foreground"
                        )}
                    >
                        Subscriptions
                    </span>
                </div>
            </div>

            {pricingView === "api" ? (
                <section className="space-y-4">
                    <div className="rounded-xl border border-zinc-200/80 bg-background p-3 dark:border-zinc-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                                {availablePlans.length === 1 ? (
                                    <span className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium dark:border-zinc-800">
                                        {formatPlanLabel(availablePlans[0])} Tier
                                    </span>
                                ) : (
                                    <PricingPlanSelect
                                        value={plan}
                                        onChange={setPlan}
                                        plans={availablePlans}
                                    />
                                )}
                                <Select
                                    value={quantizationFilter}
                                    onValueChange={onQuantizationFilterChange}
                                >
                                    <SelectTrigger className="h-9 w-[220px] bg-background">
                                        <SelectValue placeholder="Quantization">
                                            {quantizationFilter === "all"
                                                ? "All Quantizations"
                                                : quantizationFilter}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Quantizations</SelectItem>
                                        {quantizationOptions.map((quant) => (
                                            <SelectItem key={quant} value={quant}>
                                                {quant}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2.5">
                                {sort !== "default" ? (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={onToggleSortDirection}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-background text-muted-foreground transition-colors hover:text-foreground dark:border-zinc-800"
                                                    aria-label={
                                                        sortDirection === "asc"
                                                            ? "Sorted ascending, click to sort descending"
                                                            : "Sorted descending, click to sort ascending"
                                                    }
                                                >
                                                    {sortDirection === "asc" ? (
                                                        <ArrowUp className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <ArrowDown className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {sortDirection === "asc"
                                                    ? "Ascending"
                                                    : "Descending"}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ) : null}
                                <Select value={sort} onValueChange={onSortChange}>
                                    <SelectTrigger className="h-9 w-[170px] bg-background">
                                        <SelectValue placeholder="Sort">{sortLabel}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">Default</SelectItem>
                                        <SelectItem value="pricing">Price</SelectItem>
                                        <SelectItem value="throughput">Throughput</SelectItem>
                                        <SelectItem value="latency">Latency</SelectItem>
                                        <SelectItem value="uptime">Uptime</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    {filteredProviders.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3">
                            {activeProviders.map((prov) => (
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
                            {activeProviders.length > 0 && inactiveProviders.length > 0 ? (
                                <div className="pt-1">
                                    <div className="border-t border-zinc-200/80 dark:border-zinc-800" />
                                    <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Inactive Providers
                                    </p>
                                </div>
                            ) : null}
                            {inactiveProviders.map((prov) => (
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
                    ) : sortedProviders.length > 0 ? (
                        <Card className="p-6">
                            <p className="text-sm text-muted-foreground">
                                No providers match the selected quantization filter.
                            </p>
                        </Card>
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-muted-foreground">
                                No API provider pricing is available for this model.
                            </p>
                        </Card>
                    )}
                </section>
            ) : (
                <section className="space-y-4">
                    {sortedSubscriptionPlans.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {sortedSubscriptionPlans.map((planItem) => (
                                <Card key={planItem.plan_id} className="space-y-2 p-4">
                                    <Link
                                        href={`/subscription-plans/${planItem.plan_id}`}
                                        className="text-sm font-semibold transition-colors hover:text-primary"
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
                    ) : (
                        <Card className="p-6">
                            <p className="text-sm text-muted-foreground">
                                No subscription pricing is available for this model.
                            </p>
                        </Card>
                    )}
                </section>
            )}
        </div>
    );
}
