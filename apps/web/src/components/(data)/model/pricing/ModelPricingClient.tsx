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
import { AppWindow, ArrowDown, ArrowUp, ChevronDown, Shield, SlidersHorizontal, Server } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import { type ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ProviderCard from "@/components/(data)/model/pricing/ProviderCard";
import { cn } from "@/lib/utils";
import { normalizeQuantizationScheme } from "@/lib/quantization";
import { normalizeProviderPromptTrainingPolicy } from "@/lib/providers/promptTrainingPolicy";
import { mergeProviderPricingOffers } from "@/lib/providers/providerFamilyGroups";
import {
    getProviderAvailablePlans,
    getProviderModelScopeForPlan,
    hasPricingForPlan,
    isProviderVisibleForPlan,
} from "@/components/(data)/model/pricing/providerPlanRouting";
const PRICING_VIEW_STORAGE_KEY = "ai-stats:model-pricing-view";
const SORT_QUERY_KEY = "sort";
const SORT_DIRECTION_QUERY_KEY = "dir";
const VIEW_QUERY_KEY = "view";
const QUANT_QUERY_KEY = "quant";

type SortOption = "default" | "pricing" | "throughput" | "latency" | "uptime";
type SortDirection = "asc" | "desc";
type PricingView = "api" | "subscription";
type WorkspacePrivacySettings = {
    isAuthenticated: boolean;
    privacyEnablePaidMayTrain: boolean;
    privacyEnableFreeMayTrain: boolean;
    privacyZdrOnly: boolean;
    providerRestrictionMode: "none" | "allowlist" | "blocklist";
    providerRestrictionProviderIds: string[];
};
const SORT_TRIGGER_LABELS: Record<SortOption, string> = {
    default: "Sort by",
    pricing: "Sort by Price",
    throughput: "Sort by Throughput",
    latency: "Sort by Latency",
    uptime: "Sort by Uptime",
};
const SORT_OPTION_LABELS: Record<SortOption, string> = {
    default: "Sort by Default",
    pricing: "Sort by Price",
    throughput: "Sort by Throughput",
    latency: "Sort by Latency",
    uptime: "Sort by Uptime",
};
const DEFAULT_SORT_DIRECTIONS: Record<Exclude<SortOption, "default">, SortDirection> = {
    pricing: "asc",
    throughput: "desc",
    latency: "asc",
    uptime: "desc",
};

const PRICING_METER_PREFERENCE = [
    "input_tokens",
    "output_tokens",
    "input_text_tokens",
    "output_text_tokens",
    "cached_read_text_tokens",
    "input_image_tokens",
    "output_image_tokens",
    "input_audio_tokens",
    "output_audio_tokens",
] as const;
const DEFAULT_VISIBLE_PROVIDER_COUNT = 6;
const PLAN_FREQUENCY_ALIASES: Record<string, string> = {
    mo: "monthly",
    month: "monthly",
    monthly: "monthly",
    qtr: "quarterly",
    quarter: "quarterly",
    quarterly: "quarterly",
    yr: "yearly",
    year: "yearly",
    annual: "yearly",
    yearly: "yearly",
    week: "weekly",
    weekly: "weekly",
    day: "daily",
    daily: "daily",
};
const PLAN_FREQUENCY_MONTH_MULTIPLIERS: Record<string, number> = {
    daily: 30,
    weekly: 4.345,
    monthly: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
};
const PLAN_FREQUENCY_SORT_ORDER: Record<string, number> = {
    monthly: 0,
    quarterly: 1,
    yearly: 2,
    weekly: 3,
    daily: 4,
};

type SubscriptionPrice = {
    price: number;
    currency: string;
    frequency: string;
};

function getPreferredPlan(plans: string[]): string {
    if (plans.includes("standard")) return "standard";
    if (plans.includes("free")) return "free";
    return plans[0] || "standard";
}

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

function getProviderDefaultPlan(provider: ProviderPricing): string {
    return getPreferredPlan(getProviderAvailablePlans(provider));
}

function getProviderPromptTrainingPolicy(provider: ProviderPricing): string {
    const override = provider.provider_models.find(
        (model) => typeof model.prompt_training_policy_override === "string" && model.prompt_training_policy_override.trim()
    )?.prompt_training_policy_override;
    return normalizeProviderPromptTrainingPolicy(
        override ?? provider.provider.prompt_training_policy ?? null
    );
}

function getIgnoredPrivacyReasons(
    provider: ProviderPricing,
    settings: WorkspacePrivacySettings
): string[] {
    const reasons: string[] = [];
    const providerId = provider.provider.api_provider_id;
    const providerIds = settings.providerRestrictionProviderIds;
    if (settings.providerRestrictionMode === "allowlist" && providerIds.length) {
        if (!providerIds.includes(providerId)) {
            reasons.push("Not in workspace provider allowlist");
        }
    } else if (settings.providerRestrictionMode === "blocklist" && providerIds.length) {
        if (providerIds.includes(providerId)) {
            reasons.push("Blocked by workspace provider restrictions");
        }
    }

    if (settings.privacyZdrOnly) {
        const zdr = provider.provider.zero_data_retention ?? "unknown";
        if (zdr !== "default" && zdr !== "optional") {
            reasons.push("Does not meet workspace ZDR-only requirement");
        }
    }

    const trainingPolicy = getProviderPromptTrainingPolicy(provider);
    if (trainingPolicy === "may_train") {
        const defaultPlan = getProviderDefaultPlan(provider);
        if (defaultPlan === "free" && !settings.privacyEnableFreeMayTrain) {
            reasons.push("Free training-on-inputs endpoints are disabled in workspace privacy settings");
        } else if (defaultPlan !== "free" && !settings.privacyEnablePaidMayTrain) {
            reasons.push("Paid training-on-inputs endpoints are disabled in workspace privacy settings");
        }
    }

    return reasons;
}

function normalizePlanFrequency(value: string | null | undefined): string {
    const normalized = String(value ?? "").trim().toLowerCase();
    return PLAN_FREQUENCY_ALIASES[normalized] ?? normalized;
}

function getFrequencySuffix(value: string): string {
    const normalized = normalizePlanFrequency(value);
    if (normalized === "monthly") return "/mo";
    if (normalized === "quarterly") return "/qtr";
    if (normalized === "yearly") return "/yr";
    if (normalized === "weekly") return "/wk";
    if (normalized === "daily") return "/day";
    return normalized ? `/${normalized}` : "";
}

function getFrequencyLabel(value: string): string {
    const normalized = normalizePlanFrequency(value);
    if (!normalized) return "Other";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toMonthlyEquivalent(price: SubscriptionPrice): number | null {
    const raw = Number(price.price);
    if (!Number.isFinite(raw) || raw < 0) return null;
    const normalized = normalizePlanFrequency(price.frequency);
    const multiplier = PLAN_FREQUENCY_MONTH_MULTIPLIERS[normalized];
    if (typeof multiplier !== "number") return raw;
    return raw * multiplier;
}

function getCurrencySortRank(currency: string | null | undefined): number {
    const normalized = String(currency ?? "").trim().toUpperCase();
    if (!normalized || normalized === "USD") return 0;
    return 1;
}

function formatPlanPriceValue(price: SubscriptionPrice): string {
    const currency = String(price.currency || "USD").toUpperCase();
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(price.price);
}

function sortSubscriptionPlanPrices(prices: SubscriptionPrice[]): SubscriptionPrice[] {
    return [...prices].sort((a, b) => {
        const currencyRank = getCurrencySortRank(a.currency) - getCurrencySortRank(b.currency);
        if (currencyRank !== 0) return currencyRank;

        const aMonthly = toMonthlyEquivalent(a);
        const bMonthly = toMonthlyEquivalent(b);
        if (aMonthly != null && bMonthly != null && aMonthly !== bMonthly) {
            return aMonthly - bMonthly;
        }
        if (aMonthly == null && bMonthly != null) return 1;
        if (aMonthly != null && bMonthly == null) return -1;

        if (a.price !== b.price) return a.price - b.price;

        const aFrequencyOrder =
            PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(a.frequency)] ?? 99;
        const bFrequencyOrder =
            PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(b.frequency)] ?? 99;
        if (aFrequencyOrder !== bFrequencyOrder) {
            return aFrequencyOrder - bFrequencyOrder;
        }
        return String(a.frequency).localeCompare(String(b.frequency));
    });
}

function getPlanSortKey(prices: SubscriptionPrice[]): {
    currencyRank: number;
    monthlyEquivalent: number;
    rawPrice: number;
} | null {
    const sorted = sortSubscriptionPlanPrices(
        prices.filter(
            (price) =>
                Number.isFinite(Number(price.price)) &&
                Number(price.price) >= 0 &&
                Boolean(String(price.currency ?? "").trim())
        )
    );
    const first = sorted[0];
    if (!first) return null;
    return {
        currencyRank: getCurrencySortRank(first.currency),
        monthlyEquivalent: toMonthlyEquivalent(first) ?? Number(first.price),
        rawPrice: Number(first.price),
    };
}

function isProviderModelActiveForPlan(
    model: ProviderPricing["provider_models"][number]
): boolean {
    return model.is_active_gateway && model.capability_status !== "disabled";
}

function getQuantizationFilterFromUrl(value: string | null): string {
    const normalized = normalizeQuantizationScheme(value);
    return normalized ?? "all";
}

export default function ModelPricingClient({
    providers,
    subscriptionPlans,
    creatorOrgId,
    runtimeStats = {},
    routingHealth = {},
    workspacePrivacySettings = null,
    showHeader = true,
}: {
    providers: ProviderPricing[];
    subscriptionPlans: SubscriptionPlan[];
    creatorOrgId?: string | null;
    runtimeStats?: ProviderRuntimeStatsMap;
    routingHealth?: ProviderRoutingStatusMap;
    workspacePrivacySettings?: WorkspacePrivacySettings | null;
    showHeader?: boolean;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const displayProviders = useMemo(
        () => mergeProviderPricingOffers(providers),
        [providers]
    );
    const hasApiProviders = displayProviders.some(
        (provider) =>
            provider.provider_models.length > 0 || provider.pricing_rules.length > 0
    );
    const hasSubscriptionPlans = subscriptionPlans.length > 0;
    const defaultPricingView: PricingView =
        !hasApiProviders && hasSubscriptionPlans ? "subscription" : "api";

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
        return isPricingView(fromUrl) ? fromUrl : defaultPricingView;
    });
    const [quantizationFilter, setQuantizationFilter] = useState<string>(() =>
        getQuantizationFilterFromUrl(searchParams.get(QUANT_QUERY_KEY))
    );
    const [showAllProviders, setShowAllProviders] = useState(false);
    const [showIgnoredProviders, setShowIgnoredProviders] = useState(false);

    const sortLabel = SORT_TRIGGER_LABELS[sort];

    const sortedSubscriptionPlans = useMemo(() => {
        return [...subscriptionPlans].sort((a, b) => {
            const aKey = getPlanSortKey(a.prices ?? []);
            const bKey = getPlanSortKey(b.prices ?? []);
            if (aKey && bKey) {
                if (aKey.currencyRank !== bKey.currencyRank) {
                    return aKey.currencyRank - bKey.currencyRank;
                }
                if (aKey.monthlyEquivalent !== bKey.monthlyEquivalent) {
                    return aKey.monthlyEquivalent - bKey.monthlyEquivalent;
                }
                if (aKey.rawPrice !== bKey.rawPrice) {
                    return aKey.rawPrice - bKey.rawPrice;
                }
            } else if (aKey && !bKey) {
                return -1;
            } else if (!aKey && bKey) {
                return 1;
            }

            const aOrg = a.organisation?.name ?? "";
            const bOrg = b.organisation?.name ?? "";
            if (aOrg !== bOrg) return aOrg.localeCompare(bOrg);
            return a.name.localeCompare(b.name);
        });
    }, [subscriptionPlans]);

    const quantizationOptions = useMemo(() => {
        const values = new Set<string>();
        for (const provider of displayProviders) {
            for (const model of provider.provider_models) {
                const quant = normalizeQuantizationScheme(model.quantization_scheme);
                if (quant) values.add(quant);
            }
        }
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [displayProviders]);
    const hasQuantizationOptions = quantizationOptions.length > 0;

    const sortedProviders = useMemo(() => {
        const list = displayProviders.filter((provider) =>
            provider.pricing_rules.length > 0 || provider.provider_models.length > 0
        );
        const getProviderSortPrice = (provider: ProviderPricing): number | null => {
            const preferredPlan = getProviderDefaultPlan(provider);
            const planRules = provider.pricing_rules.filter(
                (r) => (r.pricing_plan || "standard") === preferredPlan
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
            const modelScope = getProviderModelScopeForPlan(
                provider,
                getProviderDefaultPlan(provider)
            );
            return modelScope.some((pm) => isProviderModelActiveForPlan(pm));
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
    }, [displayProviders, creatorOrgId, runtimeStats, sort, sortDirection]);

    const { filteredProviders, ignoredProviderReasons } = useMemo(() => {
        const quantizedProviders =
            quantizationFilter === "all"
                ? sortedProviders
                : sortedProviders.filter((provider) =>
                      provider.provider_models.some(
                          (pm) =>
                              normalizeQuantizationScheme(pm.quantization_scheme) ===
                              quantizationFilter
                      )
                  );

        const ignoredReasonMap = new Map<string, string[]>();
        if (!workspacePrivacySettings?.isAuthenticated) {
            return {
                filteredProviders: quantizedProviders,
                ignoredProviderReasons: ignoredReasonMap,
            };
        }

        const eligible: ProviderPricing[] = [];
        const ignored: ProviderPricing[] = [];
        for (const provider of quantizedProviders) {
            const reasons = getIgnoredPrivacyReasons(provider, workspacePrivacySettings);
            if (reasons.length) {
                ignoredReasonMap.set(provider.provider.api_provider_id, reasons);
                if (showIgnoredProviders) ignored.push(provider);
            } else {
                eligible.push(provider);
            }
        }

        return {
            filteredProviders: showIgnoredProviders ? [...eligible, ...ignored] : eligible,
            ignoredProviderReasons: ignoredReasonMap,
        };
    }, [quantizationFilter, showIgnoredProviders, sortedProviders, workspacePrivacySettings]);
    const ignoredProviderCount = ignoredProviderReasons.size;
    const canShowIgnoredToggle =
        Boolean(workspacePrivacySettings?.isAuthenticated) && ignoredProviderCount > 0;
    const allProvidersHiddenByPrivacy =
        sortedProviders.length > 0 &&
        filteredProviders.length === 0 &&
        ignoredProviderCount > 0 &&
        !showIgnoredProviders;
    const hasProviderOverflow =
        filteredProviders.length > DEFAULT_VISIBLE_PROVIDER_COUNT;
    const alwaysVisibleProviders = hasProviderOverflow
        ? filteredProviders.slice(0, DEFAULT_VISIBLE_PROVIDER_COUNT)
        : filteredProviders;
    const extraProviders = hasProviderOverflow
        ? filteredProviders.slice(DEFAULT_VISIBLE_PROVIDER_COUNT)
        : [];
    const hiddenProviderCount = hasProviderOverflow
        ? filteredProviders.length - DEFAULT_VISIBLE_PROVIDER_COUNT
        : 0;

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
        setShowAllProviders(false);
    }, [quantizationFilter, sort, sortDirection, showIgnoredProviders]);

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
                const nextView: PricingView =
                    !hasApiProviders && hasSubscriptionPlans && stored === "api"
                        ? "subscription"
                        : stored;
                setPricingView(nextView);
                return;
            }

            setPricingView(defaultPricingView);
        } catch (error) {
            console.warn("[pricing] failed to read pricing view preference", error);
        }
    }, [defaultPricingView, hasApiProviders, hasSubscriptionPlans]);

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
            const nextValue =
                value === "all" ? "all" : normalizeQuantizationScheme(value) ?? "all";
            setQuantizationFilter(nextValue);
            updateUrlState({
                [QUANT_QUERY_KEY]: nextValue === "all" ? null : nextValue,
            });
        },
        [updateUrlState]
    );

    const headerTitle =
        pricingView === "subscription" ? "Subscription Plans" : "Providers";

    const pricingViewToggle = (
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
    );

    return (
        <div className="space-y-6">
            {showHeader ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                        {headerTitle}
                    </h2>
                    {pricingViewToggle}
                </div>
            ) : (
                <div className="flex justify-end">{pricingViewToggle}</div>
            )}

            {pricingView === "api" ? (
                <section className="space-y-4">
                    {hasApiProviders ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                                {hasQuantizationOptions ? (
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
                                ) : null}
                                <Select value={sort} onValueChange={onSortChange}>
                                    <SelectTrigger className="h-9 w-[210px] bg-background">
                                        <SelectValue placeholder="Sort by">{sortLabel}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">{SORT_OPTION_LABELS.default}</SelectItem>
                                        <SelectItem value="pricing">{SORT_OPTION_LABELS.pricing}</SelectItem>
                                        <SelectItem value="throughput">{SORT_OPTION_LABELS.throughput}</SelectItem>
                                        <SelectItem value="latency">{SORT_OPTION_LABELS.latency}</SelectItem>
                                        <SelectItem value="uptime">{SORT_OPTION_LABELS.uptime}</SelectItem>
                                    </SelectContent>
                                </Select>
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
                            </div>
                            <div className="flex items-center gap-2.5">
                                {canShowIgnoredToggle ? (
                                    <label className="inline-flex items-center gap-2.5 rounded-md border border-zinc-200 bg-background px-3 py-1.5 text-sm text-foreground dark:border-zinc-800">
                                        <Switch
                                            checked={showIgnoredProviders}
                                            onCheckedChange={setShowIgnoredProviders}
                                            aria-label="Show ignored providers"
                                        />
                                        <span>Show ignored</span>
                                    </label>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    {filteredProviders.length > 0 ? (
                        <div className="space-y-3">
							<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                {alwaysVisibleProviders.map((prov) => (
                                    <ProviderCard
                                        key={prov.provider.api_provider_id}
                                        provider={prov}
                                        defaultPlan={getProviderDefaultPlan(prov)}
                                        availablePlans={getProviderAvailablePlans(prov)}
                                        comparisonProviders={displayProviders}
                                        privacyIgnoredReasons={
                                            ignoredProviderReasons.get(
                                                prov.provider.api_provider_id
                                            ) ?? null
                                        }
                                        runtimeStats={
                                            runtimeStats[prov.provider.api_provider_id] ?? null
                                        }
                                        routingStatus={
                                            routingHealth[prov.provider.api_provider_id] ?? null
                                        }
                                    />
                                ))}
                            </div>
                            {hasProviderOverflow ? (
                                <>
                                    <div
                                        className={cn(
                                            "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
                                            showAllProviders
                                                ? "grid-rows-[1fr] opacity-100"
                                                : "grid-rows-[0fr] opacity-0"
                                        )}
                                    >
                                        <div className="overflow-hidden">
                                            <div className="pt-3">
												<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                                    {extraProviders.map((prov) => (
                                                        <ProviderCard
                                                            key={prov.provider.api_provider_id}
                                                            provider={prov}
                                                            defaultPlan={getProviderDefaultPlan(prov)}
                                                            availablePlans={getProviderAvailablePlans(prov)}
                                                            comparisonProviders={displayProviders}
                                                            privacyIgnoredReasons={
                                                                ignoredProviderReasons.get(
                                                                    prov.provider.api_provider_id
                                                                ) ?? null
                                                            }
                                                            runtimeStats={
                                                                runtimeStats[
                                                                    prov.provider.api_provider_id
                                                                ] ?? null
                                                            }
                                                            routingStatus={
                                                                routingHealth[
                                                                    prov.provider.api_provider_id
                                                                ] ?? null
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-center">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() =>
                                                setShowAllProviders((current) => !current)
                                            }
                                        >
                                            <span>
                                                {showAllProviders
                                                    ? "Show fewer providers"
                                                    : `Show ${hiddenProviderCount.toLocaleString()} more provider${
                                                          hiddenProviderCount === 1 ? "" : "s"
                                                      }`}
                                            </span>
                                            <ChevronDown
                                                className={cn(
                                                    "h-4 w-4 transition-transform duration-200",
                                                    showAllProviders ? "rotate-180" : "rotate-0"
                                                )}
                                            />
                                        </Button>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : allProvidersHiddenByPrivacy ? (
                        <Empty className="rounded-lg border p-10">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Shield className="size-5" />
                                </EmptyMedia>
                                <EmptyTitle>All providers hidden</EmptyTitle>
                                <EmptyDescription>
                                    Your workspace privacy preferences are currently filtering out every provider for this model.
                                </EmptyDescription>
                            </EmptyHeader>
                            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                                <Button asChild type="button" variant="outline">
                                    <Link href="/settings/privacy">Update Privacy Settings</Link>
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setShowIgnoredProviders(true)}
                                >
                                    Show Hidden Providers
                                </Button>
                            </div>
                        </Empty>
                    ) : sortedProviders.length > 0 ? (
                        <Empty className="rounded-lg border p-8">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <SlidersHorizontal className="size-5" />
                                </EmptyMedia>
                                <EmptyTitle>No matching API providers</EmptyTitle>
                                <EmptyDescription>
                                    No providers match the selected quantization filter.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Empty className="rounded-lg border p-8">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Server className="size-5" />
                                </EmptyMedia>
                                <EmptyTitle>No API providers listed yet</EmptyTitle>
                                <EmptyDescription>
                                    No API provider availability is listed for this model yet.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    )}
                </section>
            ) : (
                <section className="space-y-4">
                    {sortedSubscriptionPlans.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                            {sortedSubscriptionPlans.map((planItem) => {
                                const sortedPrices = sortSubscriptionPlanPrices(
                                    (planItem.prices ?? []).filter(
                                        (price) =>
                                            Number.isFinite(Number(price.price)) &&
                                            Number(price.price) >= 0
                                    )
                                );
                                return (
                                    <Card
                                        key={planItem.plan_id}
                                        className="group h-full border-border/70 bg-gradient-to-b from-background to-muted/[0.22] p-4 transition-colors hover:border-border"
                                    >
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="min-w-0 space-y-1">
                                                    <Link
                                                        href={`/subscription-plans/${planItem.plan_id}`}
                                                        className="block text-sm font-semibold leading-tight transition-colors hover:text-primary"
                                                    >
                                                        {planItem.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {planItem.organisation?.name ?? "Unknown provider"}
                                                    </p>
                                                </div>
                                            </div>

                                            {sortedPrices.length > 0 ? (
                                                <div className="rounded-md border border-border/70 bg-background/70 p-2">
                                                    <div className="space-y-1.5">
                                                        {sortedPrices.map((price) => (
                                                            <div
                                                                key={`${price.frequency}:${price.currency}:${price.price}`}
                                                                className="flex items-center justify-between gap-3 text-xs"
                                                            >
                                                                <span className="text-muted-foreground">
                                                                    {getFrequencyLabel(price.frequency)}
                                                                </span>
                                                                <span className="font-semibold tabular-nums text-foreground">
                                                                    {formatPlanPriceValue(price)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
                                                    No pricing values listed yet.
                                                </div>
                                            )}

                                            {typeof planItem.model_info?.rate_limit === "string" &&
                                            planItem.model_info.rate_limit.trim() ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Rate limit: {planItem.model_info.rate_limit}
                                                </p>
                                            ) : null}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    ) : (
                        <Empty className="rounded-lg border p-8">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <AppWindow className="size-5" />
                                </EmptyMedia>
                                <EmptyTitle>No subscription plans listed yet</EmptyTitle>
                                <EmptyDescription>
                                    No subscription pricing is available for this model.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    )}
                </section>
            )}
        </div>
    );
}
