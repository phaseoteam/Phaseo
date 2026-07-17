"use client";

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    ArrowDown,
    ArrowUp,
    ChevronsUpDown,
    Shield,
    Server,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import { type ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ProviderCard from "@/components/(data)/model/pricing/ProviderCard";
import { cn } from "@/lib/utils";
import { normalizeProviderPromptTrainingPolicy } from "@/lib/providers/promptTrainingPolicy";
import { mergeProviderPricingOffers } from "@/lib/providers/providerFamilyGroups";
import {
    getProviderAvailablePlans,
    getProviderModelScopeForPlan,
} from "@/components/(data)/model/pricing/providerPlanRouting";
import { getPricingProviderVariantLabels } from "@/components/(data)/model/pricing/pricingProviderVariants";
import {
    buildProviderSections,
    buildProviderTablePriceSummary,
} from "@/components/(data)/model/pricing/pricingHelpers";
import {
    chooseGatewayStatus,
    type CanonicalGatewayStatus,
    getGatewayStatusSortRank,
    resolveGatewayStatus,
} from "@/components/(data)/model/pricing/providerGatewayStatus";
const SORT_QUERY_KEY = "sort";
const SORT_DIRECTION_QUERY_KEY = "dir";

type SortOption =
    | "default"
    | "provider"
    | "input"
    | "output"
    | "cache_read"
    | "throughput"
    | "latency"
    | "uptime";
type SortDirection = "asc" | "desc";
type WorkspacePrivacySettings = {
    isAuthenticated: boolean;
    privacyEnablePaidMayTrain: boolean;
    privacyEnableFreeMayTrain: boolean;
    privacyZdrOnly: boolean;
    providerRestrictionMode: "none" | "allowlist" | "blocklist";
    providerRestrictionProviderIds: string[];
};
const DEFAULT_SORT_DIRECTIONS: Record<Exclude<SortOption, "default">, SortDirection> = {
    provider: "asc",
    input: "asc",
    output: "asc",
    cache_read: "asc",
    throughput: "desc",
    latency: "asc",
    uptime: "desc",
};

const EMPTY_RUNTIME_STATS: ProviderRuntimeStatsMap = {};
const EMPTY_ROUTING_HEALTH: ProviderRoutingStatusMap = {};
const PRICING_CLOCK_BOUNDARY_BUFFER_MS = 25;
const ESTIMATED_ROUTING_WEIGHTS = {
    price: 0.32,
    uptime: 0.28,
    latency: 0.20,
    throughput: 0.14,
    observations: 0.06,
} as const;

function getDisplayedProviderUptime(
	stats: ProviderRuntimeStatsMap[string] | undefined
): number | null {
	if (!hasProviderUptimeObservation(stats)) return null;
	return stats?.uptimePct3d ?? null;
}

function usePricingClock(
    initialPricingTimeMs: number,
    freezePricingClock: boolean,
): number {
    const [pricingTimeMs, setPricingTimeMs] = useState(initialPricingTimeMs);

    useEffect(() => {
        if (freezePricingClock) return;
        let timeoutId: number | null = null;
        const tick = () => {
            const nowMs = Date.now();
            setPricingTimeMs(nowMs);
            const nextMinuteDelay =
                60_000 - (nowMs % 60_000) + PRICING_CLOCK_BOUNDARY_BUFFER_MS;
            timeoutId = window.setTimeout(tick, nextMinuteDelay);
        };
        tick();
        return () => {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
    }, [freezePricingClock]);

    return pricingTimeMs;
}

const DEFAULT_ROUTING_ERROR_RATE = 0;

function routingStatusMultiplier(status: CanonicalGatewayStatus): number {
    if (status === "active") return 1;
    if (status === "deranked_lvl1") return 1e-3;
    if (status === "deranked_lvl2") return 1e-6;
    if (status === "deranked_lvl3") return 1e-9;
    return 0;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function finitePositive(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function hasProviderUptimeObservation(
	stats: ProviderRuntimeStatsMap[string] | undefined
): boolean {
	if (!stats) return false;
	if ((stats.healthRequests3d ?? 0) > 0) return true;
	return stats.uptimeDaily3d.some((entry) => entry.requests > 0);
}

function normalizedMetricScore(args: {
    value: number | null;
    min: number | null;
    max: number | null;
    lowerIsBetter?: boolean;
    missingScore?: number;
}): number {
    if (args.value === null) return args.missingScore ?? 0.5;
    if (args.min === null || args.max === null) return 0.5;
    if (args.max <= args.min) return 1;
    const normalized = clamp01((args.value - args.min) / (args.max - args.min));
    return args.lowerIsBetter ? 1 - normalized : normalized;
}

function getProviderObservationConfidence(
	stats: ProviderRuntimeStatsMap[string] | undefined
): number {
	if (!stats) return 0;

	const requestConfidence = clamp01(Math.log10(Math.max(0, stats.requests3d) + 1) / 2);
	const recentRequestConfidence = stats.requests30m > 0 ? 0.2 : 0;
	const metricConfidence =
		(finitePositive(stats.latencyMs30m) ? 0.25 : 0) +
		(finitePositive(stats.throughput30m) ? 0.25 : 0) +
		(getDisplayedProviderUptime(stats) !== null ? 0.25 : 0) +
		(stats.lastRequestAt ? 0.25 : 0);

	return clamp01(Math.max(requestConfidence, metricConfidence) + recentRequestConfidence);
}

function observedRouteMultiplier(confidence: number): number {
	// Unknown routes stay eligible, but observed routes should sort ahead when
	// pricing is close enough that performance/reliability data matters.
	return 0.55 + 0.45 * clamp01(confidence);
}

function normalizeInverseSquarePriceWeights(
    entries: Array<{ providerId: string; price: number | null }>
): Map<string, number> {
    const finitePrices = entries
        .map((entry) => entry.price)
        .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
    if (!finitePrices.length) {
        return new Map(entries.map((entry) => [entry.providerId, 0.5]));
    }

    const positivePrices = finitePrices.filter((price) => price > 0);
    const freePriceFloor = positivePrices.length ? Math.min(...positivePrices) / 10 : 1;
    const rawWeights = new Map<string, number>();
    for (const entry of entries) {
        if (entry.price === null) {
            rawWeights.set(entry.providerId, 0);
            continue;
        }
        const safePrice = entry.price > 0 ? entry.price : freePriceFloor;
        rawWeights.set(entry.providerId, 1 / Math.pow(safePrice, 2));
    }

    const maxWeight = Math.max(...Array.from(rawWeights.values()), 0);
    if (maxWeight <= 0) {
        return new Map(entries.map((entry) => [entry.providerId, 0.5]));
    }
    return new Map(
        entries.map((entry) => [
            entry.providerId,
            (rawWeights.get(entry.providerId) ?? 0) / maxWeight,
        ])
    );
}

function getPreferredPlan(plans: string[]): string {
    if (plans.includes("standard")) return "standard";
    if (plans.includes("free")) return "free";
    return plans[0] || "standard";
}

function parseSortOption(value: string | null): SortOption {
    if (value === "pricing" || value === "input") return "input";
    if (value === "provider") return "provider";
    if (value === "output") return "output";
    if (value === "cache_read" || value === "cache" || value === "cached") {
        return "cache_read";
    }
    if (value === "throughput") return "throughput";
    if (value === "latency") return "latency";
    if (value === "uptime") return "uptime";
    return "default";
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

function UptimeHeaderHoverContent() {
	return (
		<div className="space-y-2">
			<p className="text-sm font-medium text-foreground">3-day uptime</p>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-200 pt-2.5 text-xs text-muted-foreground dark:border-zinc-800">
				<div className="flex items-center gap-1.5">
					<span className="h-2 w-2 rounded-full bg-emerald-500" />
					<span>&gt;99%</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="h-2 w-2 rounded-full bg-amber-500" />
					<span>95-99%</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="h-2 w-2 rounded-full bg-red-500" />
					<span>&lt;95%</span>
				</div>
			</div>
		</div>
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

export default function ModelPricingClient({
    providers,
    creatorOrgId,
    initialPricingTimeMs,
    freezePricingClock = false,
    runtimeStats = EMPTY_RUNTIME_STATS,
    routingHealth = EMPTY_ROUTING_HEALTH,
    workspacePrivacySettings = null,
    showHeader = true,
}: {
    modelId: string;
    providers: ProviderPricing[];
    creatorOrgId?: string | null;
    initialPricingTimeMs: number;
    freezePricingClock?: boolean;
    runtimeStats?: ProviderRuntimeStatsMap;
    routingHealth?: ProviderRoutingStatusMap;
    workspacePrivacySettings?: WorkspacePrivacySettings | null;
    showHeader?: boolean;
}) {
    const pricingTimeMs = usePricingClock(initialPricingTimeMs, freezePricingClock);
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const searchParams = useSearchParams();
    const effectiveSearchParams = useMemo(
        () => searchParams ?? new URLSearchParams(),
        [searchParams]
    );
    const liveRuntimeStats = runtimeStats;
    const displayProviders = useMemo(
        () => mergeProviderPricingOffers(providers),
        [providers]
    );
    const providerVariantLabelsById = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const provider of displayProviders) {
            map.set(
                provider.provider.api_provider_id,
                getPricingProviderVariantLabels({
                    displayProvider: provider,
                    sourceProviders: providers,
                })
            );
        }
        return map;
    }, [displayProviders, providers]);
    const hasApiProviders = displayProviders.some(
        (provider) =>
            provider.provider_models.length > 0 || provider.pricing_rules.length > 0
    );

    const [sort, setSort] = useState<SortOption>(() => {
        return parseSortOption(effectiveSearchParams.get(SORT_QUERY_KEY));
    });
    const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
        const fromUrl = effectiveSearchParams.get(SORT_DIRECTION_QUERY_KEY);
        return isSortDirection(fromUrl) ? fromUrl : "desc";
    });
    const [showIgnoredProviders, setShowIgnoredProviders] = useState(false);

    const sortedProviders = useMemo(() => {
        const list = displayProviders.filter((provider) =>
            provider.pricing_rules.length > 0 || provider.provider_models.length > 0
        );
        const sectionCache = new Map<string, ReturnType<typeof buildProviderSections>>();
        const getCachedSections = (provider: ProviderPricing) => {
            const providerId = provider.provider.api_provider_id;
            const cached = sectionCache.get(providerId);
            if (cached) return cached;
            const built = buildProviderSections(
                provider,
                getProviderDefaultPlan(provider),
                pricingTimeMs,
            );
            sectionCache.set(providerId, built);
            return built;
        };
        const getProviderSortPrice = (
            provider: ProviderPricing,
            direction: "input" | "output" | "cached"
        ): number | null => {
            const sections = getCachedSections(provider);
            return buildProviderTablePriceSummary(sections, direction).sortValue;
        };

        const getProviderGatewayStatus = (provider: ProviderPricing): CanonicalGatewayStatus => {
            const modelScope = getProviderModelScopeForPlan(
                provider,
                getProviderDefaultPlan(provider)
            );
            const statuses = modelScope.map((pm) =>
                resolveGatewayStatus({
                    isActiveGateway: pm.is_active_gateway,
                    capabilityStatus: pm.capability_status,
                    providerStatus: provider.provider.status,
                    providerRoutingStatus: provider.provider.routing_status,
                    modelRoutingStatus: pm.routing_status,
                    effectiveFrom: pm.effective_from,
                    effectiveTo: pm.effective_to,
                })
            );
            return chooseGatewayStatus(statuses);
        };

        const getProviderStatusRank = (provider: ProviderPricing): number => {
            return getGatewayStatusSortRank(getProviderGatewayStatus(provider));
        };

        const byGatewayStatus = (a: ProviderPricing, b: ProviderPricing) => {
            const aRank = getProviderStatusRank(a);
            const bRank = getProviderStatusRank(b);
            return aRank - bRank;
        };

        const defaultPriceWeights = normalizeInverseSquarePriceWeights(
            list.map((provider) => {
                const input = getProviderSortPrice(provider, "input");
                const output = getProviderSortPrice(provider, "output");
                return {
                    providerId: provider.provider.api_provider_id,
                    price: input === null && output === null ? null : (input ?? 0) + (output ?? 0),
                };
            })
        );
        const latencySamples = list
            .map((provider) =>
                finitePositive(
                    liveRuntimeStats[provider.provider.api_provider_id]?.latencyMs30m
                )
            )
            .filter((value): value is number => value !== null);
        const throughputSamples = list
            .map((provider) =>
                finitePositive(
                    liveRuntimeStats[provider.provider.api_provider_id]?.throughput30m
                )
            )
            .filter((value): value is number => value !== null);
        const minLatency = latencySamples.length ? Math.min(...latencySamples) : null;
        const maxLatency = latencySamples.length ? Math.max(...latencySamples) : null;
        const minThroughput = throughputSamples.length ? Math.min(...throughputSamples) : null;
        const maxThroughput = throughputSamples.length ? Math.max(...throughputSamples) : null;

        const getEstimatedRoutingScore = (provider: ProviderPricing): number => {
            const providerId = provider.provider.api_provider_id;
            const stats = liveRuntimeStats[providerId];
            const status = getProviderGatewayStatus(provider);
            const statusMultiplier = routingStatusMultiplier(status);
            if (statusMultiplier <= 0) return 0;

            const liveHealth = routingHealth[providerId];
            const healthMultiplier = liveHealth?.deranked ? 1e-9 : 1;
            const priceWeight = defaultPriceWeights.get(providerId) ?? 0.5;
            const observationConfidence = getProviderObservationConfidence(stats);
            const errorRate =
                1 - ((stats?.requestSuccessPct3d ?? getDisplayedProviderUptime(stats) ?? (1 - DEFAULT_ROUTING_ERROR_RATE) * 100) / 100);
            const uptimeScore = 1 - Math.max(0, Math.min(1, errorRate));
            const latencyScore = normalizedMetricScore({
                value: finitePositive(stats?.latencyMs30m),
                min: minLatency,
                max: maxLatency,
                lowerIsBetter: true,
                missingScore: 0.2,
            });
            const throughputScore = normalizedMetricScore({
                value: finitePositive(stats?.throughput30m),
                min: minThroughput,
                max: maxThroughput,
                missingScore: 0.2,
            });
            const weightedScore =
                ESTIMATED_ROUTING_WEIGHTS.price * priceWeight +
                ESTIMATED_ROUTING_WEIGHTS.uptime * Math.max(0.05, Math.min(1, uptimeScore)) +
                ESTIMATED_ROUTING_WEIGHTS.latency * latencyScore +
                ESTIMATED_ROUTING_WEIGHTS.throughput * throughputScore +
                ESTIMATED_ROUTING_WEIGHTS.observations * observationConfidence;

            return (
                statusMultiplier *
                healthMultiplier *
                observedRouteMultiplier(observationConfidence) *
                weightedScore
            );
        };

        const byName = (a: ProviderPricing, b: ProviderPricing) => {
            const an = a.provider.api_provider_name || a.provider.api_provider_id;
            const bn = b.provider.api_provider_name || b.provider.api_provider_id;
            return an.localeCompare(bn);
        };

        const withCreatorBias = (a: ProviderPricing, b: ProviderPricing) => {
            const statusCmp = byGatewayStatus(a, b);
            if (statusCmp !== 0) return statusCmp;
            if (creatorOrgId) {
                const aIsCreator = a.provider.api_provider_id === creatorOrgId;
                const bIsCreator = b.provider.api_provider_id === creatorOrgId;
                if (aIsCreator && !bIsCreator) return -1;
                if (!aIsCreator && bIsCreator) return 1;
            }
            return byName(a, b);
        };

        const byEstimatedRoutingOrder = (a: ProviderPricing, b: ProviderPricing) => {
            const scoreDelta = getEstimatedRoutingScore(b) - getEstimatedRoutingScore(a);
            if (Math.abs(scoreDelta) > Number.EPSILON) return scoreDelta;
            return withCreatorBias(a, b);
        };

        if (sort === "default") {
            return list.sort(byEstimatedRoutingOrder);
        }

        if (sort === "provider") {
            return list.sort((a, b) => {
                const statusCmp = byGatewayStatus(a, b);
                if (statusCmp !== 0) return statusCmp;
                const byProvider = byName(a, b);
                if (byProvider !== 0) {
                    return sortDirection === "asc" ? byProvider : -byProvider;
                }
                return withCreatorBias(a, b);
            });
        }

        if (sort === "throughput") {
            return list.sort((a, b) => {
                const statusCmp = byGatewayStatus(a, b);
                if (statusCmp !== 0) return statusCmp;
                const aTp = finitePositive(
                    liveRuntimeStats[a.provider.api_provider_id]?.throughput30m
                );
                const bTp = finitePositive(
                    liveRuntimeStats[b.provider.api_provider_id]?.throughput30m
                );
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
                const statusCmp = byGatewayStatus(a, b);
                if (statusCmp !== 0) return statusCmp;
                const aLat = finitePositive(
                    liveRuntimeStats[a.provider.api_provider_id]?.latencyMs30m
                );
                const bLat = finitePositive(
                    liveRuntimeStats[b.provider.api_provider_id]?.latencyMs30m
                );
                if (aLat == null && bLat == null) return withCreatorBias(a, b);
                if (aLat == null) return 1;
                if (bLat == null) return -1;
                if (aLat !== bLat) {
                    return sortDirection === "asc" ? aLat - bLat : bLat - aLat;
                }
                return withCreatorBias(a, b);
            });
        }

        if (sort === "input" || sort === "output" || sort === "cache_read") {
            return list.sort((a, b) => {
                const statusCmp = byGatewayStatus(a, b);
                if (statusCmp !== 0) return statusCmp;
                const sortDirectionKey = sort === "cache_read" ? "cached" : sort;
                const aPrice = getProviderSortPrice(a, sortDirectionKey);
                const bPrice = getProviderSortPrice(b, sortDirectionKey);
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
                const statusCmp = byGatewayStatus(a, b);
                if (statusCmp !== 0) return statusCmp;
                const aUptime = getDisplayedProviderUptime(
                    liveRuntimeStats[a.provider.api_provider_id]
                );
                const bUptime = getDisplayedProviderUptime(
                    liveRuntimeStats[b.provider.api_provider_id]
                );
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
    }, [displayProviders, creatorOrgId, liveRuntimeStats, pricingTimeMs, routingHealth, sort, sortDirection]);

    const { filteredProviders, ignoredProviderReasons } = useMemo(() => {
        const ignoredReasonMap = new Map<string, string[]>();
        if (!workspacePrivacySettings?.isAuthenticated) {
            return {
                filteredProviders: sortedProviders,
                ignoredProviderReasons: ignoredReasonMap,
            };
        }

        const eligible: ProviderPricing[] = [];
        const ignored: ProviderPricing[] = [];
        for (const provider of sortedProviders) {
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
    }, [showIgnoredProviders, sortedProviders, workspacePrivacySettings]);
    const ignoredProviderCount = ignoredProviderReasons.size;
    const canShowIgnoredToggle =
        Boolean(workspacePrivacySettings?.isAuthenticated) && ignoredProviderCount > 0;
    const allProvidersHiddenByPrivacy =
        sortedProviders.length > 0 &&
        filteredProviders.length === 0 &&
        ignoredProviderCount > 0 &&
        !showIgnoredProviders;
    const visibleProviders = filteredProviders;
    const showCacheReadColumn = useMemo(() => {
        return visibleProviders.some((provider) => {
            const sections = buildProviderSections(
                provider,
                getProviderDefaultPlan(provider),
                pricingTimeMs,
            );
            return buildProviderTablePriceSummary(sections, "cached").primary !== null;
        });
    }, [pricingTimeMs, visibleProviders]);
    const providerTableViewportRef = useRef<HTMLDivElement>(null);
    const [providerTableOverflows, setProviderTableOverflows] = useState<boolean | null>(null);
    const [providerTableThumbWidth, setProviderTableThumbWidth] = useState<number | null>(null);

    useLayoutEffect(() => {
        const viewport = providerTableViewportRef.current;
        if (!viewport) return;

        let frame = 0;
        const updateOverflow = () => {
            const next = viewport.scrollWidth > viewport.clientWidth + 1;
            const nextThumbWidth =
                next && viewport.scrollWidth > 0
                    ? Math.max(40, (viewport.clientWidth * viewport.clientWidth) / viewport.scrollWidth)
                    : null;
            setProviderTableOverflows((current) =>
                current === next ? current : next
            );
            setProviderTableThumbWidth((current) =>
                current === nextThumbWidth ? current : nextThumbWidth
            );
        };
        const measure = () => {
            if (frame) window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(updateOverflow);
        };

        updateOverflow();
        measure();
        const resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(viewport);
        const content = viewport.querySelector("table") ?? viewport.firstElementChild;
        if (content) resizeObserver.observe(content);
        window.addEventListener("resize", measure);

        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [showCacheReadColumn, visibleProviders.length]);

    const updateUrlState = useCallback(
        (updates: Record<string, string | null>) => {
            const next = new URLSearchParams(effectiveSearchParams.toString());
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
        [effectiveSearchParams, pathname, router]
    );

    useEffect(() => {
        const nextSort = parseSortOption(effectiveSearchParams.get(SORT_QUERY_KEY));
        setSort((current) => (current === nextSort ? current : nextSort));
        const nextDirection = isSortDirection(effectiveSearchParams.get(SORT_DIRECTION_QUERY_KEY))
            ? (effectiveSearchParams.get(SORT_DIRECTION_QUERY_KEY) as SortDirection)
            : getDefaultSortDirection(nextSort);
        setSortDirection((current) =>
            current === nextDirection ? current : nextDirection
        );

    }, [effectiveSearchParams]);

    const onColumnSortChange = useCallback(
        (nextSort: Exclude<SortOption, "default">) => {
            const defaultDirection = getDefaultSortDirection(nextSort);
            const oppositeDirection: SortDirection =
                defaultDirection === "asc" ? "desc" : "asc";

            if (sort !== nextSort) {
                setSort(nextSort);
                setSortDirection(defaultDirection);
                updateUrlState({
                    [SORT_QUERY_KEY]: nextSort,
                    [SORT_DIRECTION_QUERY_KEY]: defaultDirection,
                });
                return;
            }

            if (sortDirection === defaultDirection) {
                setSort(nextSort);
                setSortDirection(oppositeDirection);
                updateUrlState({
                    [SORT_QUERY_KEY]: nextSort,
                    [SORT_DIRECTION_QUERY_KEY]: oppositeDirection,
                });
                return;
            }

            setSort("default");
            setSortDirection("desc");
            updateUrlState({
                [SORT_QUERY_KEY]: null,
                [SORT_DIRECTION_QUERY_KEY]: null,
            });
        },
        [sort, sortDirection, updateUrlState]
    );

	const renderTableSortHead = (
		label: string,
		option: Exclude<SortOption, "default">,
		align: "left" | "right" = "right"
	) => {
        const isActive = sort === option;
		const labelNode = (
			<span
				className={cn(
					option === "uptime" &&
						"underline decoration-dotted underline-offset-4",
				)}
			>
				{label}
			</span>
		);
        const icon = isActive ? (
            sortDirection === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5" />
            ) : (
                <ArrowDown className="h-3.5 w-3.5" />
            )
        ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        );
		const wrapHeader = (button: React.ReactElement) => {
			if (option !== "uptime") return button;
			return (
				<HoverCard openDelay={120} closeDelay={80}>
					<HoverCardTrigger asChild>{button}</HoverCardTrigger>
					<HoverCardContent align="end" className="w-72 text-left">
						<UptimeHeaderHoverContent />
					</HoverCardContent>
				</HoverCard>
			);
		};

        if (align === "left") {
            return wrapHeader(
                <button
                    type="button"
                    onClick={() => onColumnSortChange(option)}
                    className={cn(
                        "group inline-flex w-full items-center gap-1.5 text-left text-xs font-medium transition-colors hover:text-foreground justify-start",
                        isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                    aria-label={`Sort providers by ${label.toLowerCase()}`}
                >
                    {labelNode}
                    {icon}
                </button>
            );
        }

        return wrapHeader(
            <button
                type="button"
                onClick={() => onColumnSortChange(option)}
                className={cn(
                    "group inline-flex w-full items-center justify-end gap-1.5 text-right text-xs font-medium transition-colors hover:text-foreground",
                    isActive ? "text-foreground" : "text-muted-foreground"
                )}
                aria-label={`Sort providers by ${label.toLowerCase()}`}
            >
                {icon}
                {labelNode}
            </button>
        );
    };

    return (
        <div className="space-y-6">
            {showHeader ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                        Providers
                    </h2>
                </div>
            ) : (
                <></>
            )}
            <section className="space-y-4">
                {hasApiProviders ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div />
                        <div className="flex items-center gap-2.5">
                            {canShowIgnoredToggle ? (
                                <div className="inline-flex items-center gap-2.5 rounded-md border border-zinc-200 bg-background px-3 py-1.5 text-sm text-foreground dark:border-zinc-800">
                                    <Switch
                                        checked={showIgnoredProviders}
                                        onCheckedChange={setShowIgnoredProviders}
                                        aria-label="Show ignored providers"
                                    />
                                    <span>Show ignored</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
                {filteredProviders.length > 0 ? (
                    <div className="space-y-2">
                        <div className="overflow-hidden rounded-md border border-zinc-200/80 bg-background dark:border-zinc-800">
                            <ScrollArea
                                className={cn(
                                    "w-full",
                                    providerTableOverflows === true
                                        ? "[&_[data-orientation=horizontal]]:h-2 [&_[data-orientation=horizontal]]:border-t-0 [&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:min-w-[var(--provider-table-scrollbar-thumb-width,2.5rem)] [&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-400/70 [&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:transition-colors hover:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-500/80 focus-within:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-500/80 dark:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-500/80 dark:hover:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-400/90 dark:focus-within:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-400/90"
                                        : "[&_[data-orientation=horizontal]]:hidden"
                                )}
                                keepScrollbarMounted
                                scrollBarOrientation="horizontal"
                                style={
                                    providerTableThumbWidth
                                        ? ({
                                              "--provider-table-scrollbar-thumb-width": `${providerTableThumbWidth}px`,
                                          } as React.CSSProperties)
                                        : undefined
                                }
                                viewportClassName={providerTableOverflows === true ? "pb-1.5" : undefined}
                                viewportRef={providerTableViewportRef}
                            >
								<Table
									className={cn(
										"table-auto lg:min-w-full",
										showCacheReadColumn ? "min-w-[944px]" : "min-w-[888px]",
									)}
									wrapInContainer={false}
								>
									<colgroup>
										<col className="w-72" />
										<col className="w-24" />
										<col className="w-24" />
										{showCacheReadColumn ? <col className="w-32" /> : null}
										<col className="w-24" />
										<col className="w-28" />
										<col className="w-32" />
									</colgroup>
									<TableHeader>
										<TableRow className="hover:bg-transparent">
											<TableHead className="h-8 min-w-[280px] px-3 whitespace-nowrap">
												{renderTableSortHead("Provider", "provider", "left")}
											</TableHead>
											<TableHead className="h-8 w-24 min-w-24 pl-2 pr-4 text-right whitespace-nowrap">
												{renderTableSortHead("Input $/M", "input")}
											</TableHead>
											<TableHead className="h-8 w-24 min-w-24 pl-2 pr-4 text-right whitespace-nowrap">
												{renderTableSortHead("Output $/M", "output")}
											</TableHead>
											{showCacheReadColumn ? (
												<TableHead className="h-8 w-32 min-w-32 pl-2 pr-4 text-right whitespace-nowrap">
													{renderTableSortHead("Cache Read $/M", "cache_read")}
												</TableHead>
											) : null}
											<TableHead className="h-8 w-24 min-w-24 pl-2 pr-4 text-right whitespace-nowrap">
												{renderTableSortHead("Latency", "latency")}
											</TableHead>
											<TableHead className="h-8 w-28 min-w-28 pl-2 pr-4 text-right whitespace-nowrap">
												{renderTableSortHead("Throughput", "throughput")}
											</TableHead>
											<TableHead className="h-8 w-32 min-w-32 pl-2 pr-4 text-right whitespace-nowrap">
												{renderTableSortHead("Uptime", "uptime")}
											</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {visibleProviders.map((prov, index) => (
                                            <ProviderCard
                                                key={prov.provider.api_provider_id}
                                                provider={prov}
                                                defaultPlan={getProviderDefaultPlan(prov)}
                                                availablePlans={getProviderAvailablePlans(prov)}
                                                comparisonProviders={displayProviders}
                                                navigationProviders={visibleProviders}
                                                privacyIgnoredReasons={
                                                    ignoredProviderReasons.get(
                                                        prov.provider.api_provider_id
                                                    ) ?? null
                                                }
                                                runtimeStats={
                                                    liveRuntimeStats[prov.provider.api_provider_id] ?? null
                                                }
                                                routingStatus={
                                                    routingHealth[prov.provider.api_provider_id] ?? null
                                                }
                                                variantLabels={
                                                    providerVariantLabelsById.get(
                                                        prov.provider.api_provider_id
                                                    ) ?? null
                                                }
                                                pricingTimeMs={pricingTimeMs}
                                                showCacheReadColumn={showCacheReadColumn}
                                                isLastVisible={index === visibleProviders.length - 1}
                                            />
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
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
                                <Shield className="size-5" />
                            </EmptyMedia>
                            <EmptyTitle>No visible API providers</EmptyTitle>
                            <EmptyDescription>
                                Provider availability exists for this model, but nothing is currently visible.
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
        </div>
    );
}
