"use client";

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { resolveEnforcedZdr } from "@/components/(data)/model/pricing/zdr";
import useSWR from "swr";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    ArrowDown,
    ArrowUp,
    Ban,
    CheckCircle2,
    Clock3,
    ChevronsUpDown,
    CircleDot,
    Database,
    Filter,
    Globe2,
    GraduationCap,
    ListFilter,
	KeyRound,
    RotateCcw,
    Shield,
    Server,
    ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Table,
    TableBody,
    TableCell,
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
import {
	getProviderRuntimeStats,
	getModelProviderRuntimeStats,
	type ProviderRuntimeStats,
	type ProviderRuntimeStatsMap,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ProviderCard, {
	getProviderTableDiscountBadge,
	PROVIDER_STATUS_META,
} from "@/components/(data)/model/pricing/ProviderCard";
import ProviderInfoHoverIcons from "@/components/(data)/model/ProviderInfoHoverIcons";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { normalizeProviderPromptTrainingPolicy } from "@/lib/providers/promptTrainingPolicy";
import { mergeProviderPricingOffers } from "@/lib/providers/providerFamilyGroups";
import { formatProviderOfferDisplayName } from "@/lib/providers/providerOffers";
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
import ModelPercentileSelect, {
	DEFAULT_MODEL_PERCENTILE,
	type ModelPercentile,
} from "@/components/(data)/models/ModelPercentileSelect";
import { publishProviderView } from "@/components/(data)/model/pricing/providerViewSync";
import {
	clearProviderInspector,
    dispatchProviderInspectorOpen,
    subscribeProviderInspectorSelection,
    type ProviderInspectorSelection,
} from "@/components/(data)/model/pricing/providerInspectorSync";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
const SORT_QUERY_KEY = "sort";
const SORT_DIRECTION_QUERY_KEY = "dir";
const PROVIDER_QUERY_KEY = "provider";
const LEGACY_PROVIDER_VIEW_QUERY_KEY = "provider_view";
const RUNTIME_STATS_ERROR_RETRY_COUNT = 2;

export function isTerminalRuntimeStatsRetry(retryCount: number) {
	return retryCount > RUNTIME_STATS_ERROR_RETRY_COUNT;
}

export function resolveRuntimeStatsPercentileAfterError(
	attemptedPercentile: ModelPercentile,
	lastSuccessfulPercentile: ModelPercentile,
	retryCount: number,
) {
	return isTerminalRuntimeStatsRetry(retryCount)
		? lastSuccessfulPercentile
		: attemptedPercentile;
}

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
type ProviderStatusFilter = "routable" | "preview" | "inactive" | "external";
type PrivacyFilter = "workspace" | "all" | "zdr" | "no_training";
type ProviderOffering = {
	provider: ProviderPricing;
	plan: string;
	isPrimary: boolean;
};
type WorkspacePrivacySettings = {
    isAuthenticated: boolean;
    privacyEnablePaidMayTrain: boolean;
    privacyEnableFreeMayTrain: boolean;
    privacyZdrOnly: boolean;
    providerRestrictionMode: "none" | "allowlist" | "blocklist";
    providerRestrictionProviderIds: string[];
    accountProviderRestrictionMode?: "none" | "allowlist" | "blocklist";
    accountProviderRestrictionProviderIds?: string[];
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

function usePricingClock(initialPricingTimeMs: number): number {
    const [pricingTimeMs, setPricingTimeMs] = useState(initialPricingTimeMs);

    useEffect(() => {
        let timeoutId: number | null = null;
        const tick = () => {
            const nowMs = Date.now();
            setPricingTimeMs(nowMs);
            timeoutId = window.setTimeout(
                tick,
                60_000 - (nowMs % 60_000) + PRICING_CLOCK_BOUNDARY_BUFFER_MS,
            );
        };
        tick();
        return () => {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
    }, []);

    return pricingTimeMs;
}

const DEFAULT_PROVIDER_STATUS_FILTERS: ProviderStatusFilter[] = [
    "routable",
    "preview",
    "inactive",
];

function providerStatusFilterKey(status: CanonicalGatewayStatus): ProviderStatusFilter {
    if (status === "external") return "external";
    if (["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3"].includes(status)) return "routable";
    if (["coming_soon", "internal_testing"].includes(status)) return "preview";
    return "inactive";
}

function toggleProviderStatusFilter(
    current: ProviderStatusFilter[],
    filter: ProviderStatusFilter,
    checked: boolean,
): ProviderStatusFilter[] {
    return checked
        ? [...new Set([...current, filter])]
        : current.filter((value) => value !== filter);
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

function resolveProviderGatewayStatus(provider: ProviderPricing): CanonicalGatewayStatus {
    const modelScope = getProviderModelScopeForPlan(
        provider,
        getProviderDefaultPlan(provider),
    );
    return chooseGatewayStatus(
        modelScope.map((providerModel) =>
            resolveGatewayStatus({
                isActiveGateway: providerModel.is_active_gateway,
				providerAvailabilityStatus:
					providerModel.provider_availability_status,
				phaseoStatus: providerModel.phaseo_status,
				accessScope: providerModel.access_scope,
                capabilityStatus: providerModel.capability_status,
                providerStatus: provider.provider.status,
                providerRoutingStatus: provider.provider.routing_status,
                modelRoutingStatus: providerModel.routing_status,
                effectiveFrom: providerModel.effective_from,
                effectiveTo: providerModel.effective_to,
            }),
        ),
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
    settings: WorkspacePrivacySettings,
    plan = getProviderDefaultPlan(provider),
): string[] {
    const reasons: string[] = [];
    const providerId = provider.provider.api_provider_id;
    const providerIds = settings.providerRestrictionProviderIds;
	const accountProviderIds = settings.accountProviderRestrictionProviderIds ?? [];
	if (settings.accountProviderRestrictionMode === "allowlist" && !accountProviderIds.includes(providerId)) {
		reasons.push("Not in account provider allowlist");
	} else if (settings.accountProviderRestrictionMode === "blocklist" && accountProviderIds.includes(providerId)) {
		reasons.push("Blocked by account provider restrictions");
	}
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
        if (getPlanZdrEligibility(provider, plan) !== true) {
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

function matchesPrivacyFilter(
    provider: ProviderPricing,
    filter: PrivacyFilter,
    workspacePrivacySettings: WorkspacePrivacySettings | null,
    plan = getProviderDefaultPlan(provider),
): boolean {
    if (filter === "all") return true;
    if (filter === "zdr") {
        return getPlanZdrEligibility(provider, plan) === true;
    }
    if (filter === "no_training") {
        return getProviderPromptTrainingPolicy(provider) !== "may_train";
    }
    if (!workspacePrivacySettings?.isAuthenticated) return true;
        return getIgnoredPrivacyReasons(provider, workspacePrivacySettings, plan)
		.filter((reason) => !reason.includes("account provider"))
		.length === 0;
}

function getPlanZdrEligibility(
	provider: ProviderPricing,
	plan: string,
): boolean | null {
	// Eligibility metadata describes a possible offer; it is not proof that
	// this provider route enforces zero retention. A provider-level false must
	// always win, and an eligible tier is usable only with a verified true flag.
	const providerZdr = provider.provider.zero_data_retention;
	if (providerZdr === false) return false;
	const tierPolicy = provider.provider.service_tier_data_policies?.[plan] ?? null;
	const tierEligibility = tierPolicy?.zdrEligibility;
	if (tierEligibility === "eligible") return providerZdr === true ? true : null;
	if (tierEligibility === "ineligible") return false;

    const providerModels = getProviderModelScopeForPlan(provider, plan);
    const capabilityPolicies = providerModels.map((providerModel) => providerModel.data_policy);
    const policiesWithData = capabilityPolicies.filter(
        (policy): policy is NonNullable<typeof policy> => Boolean(policy),
    );
    if (!policiesWithData.length) return provider.provider.zero_data_retention ?? null;
    if (policiesWithData.length !== capabilityPolicies.length) return null;

    const eligibilities = new Set(
        policiesWithData.map((policy) => policy.zdrEligibility ?? null),
    );
    if (eligibilities.size !== 1) return null;
    const eligibility = policiesWithData[0]?.zdrEligibility;
	if (eligibility === "eligible") return providerZdr === true ? true : null;
	if (eligibility === "ineligible") return false;
	return providerZdr ?? null;
}

function formatServiceTierLabel(plan: string): string {
	if (plan === "priority") return "Fast";

	return plan
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTierLatency(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	const seconds = value / 1_000;
	return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

function formatTierThroughput(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} tps`;
}

function formatTierUptime(stats: ProviderRuntimeStats | null): string {
	const uptime = getDisplayedProviderUptime(stats ?? undefined);
	return uptime == null ? "--" : `${uptime.toFixed(1)}%`;
}

function renderTierTablePrice(
	summary: ReturnType<typeof buildProviderTablePriceSummary>,
) {
	return summary.primary ? (
		<div className="font-medium tabular-nums text-foreground">
			{summary.primary.formattedPrice}
		</div>
	) : (
		<div className="font-medium tabular-nums text-foreground">--</div>
	);
}

function ProviderServiceTierInfoIcons({
	provider,
	plan,
}: {
	provider: ProviderPricing;
	plan: string;
}) {
	const providerModels = getProviderModelScopeForPlan(provider, plan);
	const statusKey = chooseGatewayStatus(
		providerModels.map((providerModel) =>
			resolveGatewayStatus({
				isActiveGateway: providerModel.is_active_gateway,
				providerAvailabilityStatus: providerModel.provider_availability_status,
				phaseoStatus: providerModel.phaseo_status,
				accessScope: providerModel.access_scope,
				capabilityStatus: providerModel.capability_status,
				providerStatus: provider.provider.status,
				providerRoutingStatus: provider.provider.routing_status,
				modelRoutingStatus: providerModel.routing_status,
				effectiveFrom: providerModel.effective_from,
				effectiveTo: providerModel.effective_to,
			}),
		),
	);
	const statusMeta = PROVIDER_STATUS_META[statusKey] ?? PROVIDER_STATUS_META.not_listed;
	const tierPolicy = provider.provider.service_tier_data_policies?.[plan] ?? null;
	const capabilityPolicies = providerModels
		.map((providerModel) => providerModel.data_policy)
		.filter((policy): policy is NonNullable<typeof policy> => Boolean(policy));
	const policies = tierPolicy ? [tierPolicy] : capabilityPolicies;
	const dataPolicy = (policies.length > 0 ? policies : [null]).map((policy) => ({
		tier: policy?.tier ?? provider.provider.data_policy_tier ?? null,
		confidence: policy?.confidence ?? provider.provider.data_policy_confidence ?? null,
		contractMode: provider.provider.data_policy_contract_mode ?? null,
		contractNotes: provider.provider.data_policy_contract_notes ?? null,
		notes: policy?.reason ?? provider.provider.prompt_training_notes ?? null,
		sourceUrl: policy?.evidenceUrl ?? provider.provider.prompt_training_source_url ?? null,
		promptTrainingPolicy: provider.provider.prompt_training_policy ?? null,
		zeroDataRetention: resolveEnforcedZdr(
			provider.provider.zero_data_retention,
			policy?.zdrEligibility,
		),
	}));

	return (
		<div className="flex shrink-0 items-center gap-1">
			{provider.provider.credential_mode === "byok_only" ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span
							tabIndex={0}
							aria-label="BYOK only: requires your provider key"
							className="inline-flex h-6 w-6 items-center justify-center rounded-md text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-amber-300"
						>
							<KeyRound className="h-3.5 w-3.5" />
						</span>
					</TooltipTrigger>
					<TooltipContent>BYOK only · requires your provider key</TooltipContent>
				</Tooltip>
			) : null}
			<HoverCard openDelay={120} closeDelay={80}>
				<HoverCardTrigger asChild>
					<button
						type="button"
						aria-label={`Provider status: ${statusMeta.label}`}
						className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						{React.createElement(statusMeta.icon, {
							className: cn("h-3 w-3", statusMeta.iconClass),
						})}
					</button>
				</HoverCardTrigger>
				<HoverCardContent align="start" className="w-auto p-2 text-xs">
					<p className="font-semibold">{statusMeta.label}</p>
					<p className="mt-1 text-muted-foreground">{statusMeta.description}</p>
				</HoverCardContent>
			</HoverCard>
			<ProviderInfoHoverIcons
				providerId={provider.provider.api_provider_id}
				providerModelSlugs={providerModels.map((providerModel) => providerModel.provider_model_slug)}
				apiModelIds={providerModels.map((providerModel) => providerModel.model_id)}
				dataPolicy={dataPolicy}
				residency={[
					{
						residencyMode: provider.provider.residency_mode ?? null,
						executionRegions: provider.provider.default_execution_regions ?? null,
						dataRegions: provider.provider.default_data_regions ?? null,
						zeroDataRetention: provider.provider.zero_data_retention ?? null,
						notes: provider.provider.residency_notes ?? null,
						sourceUrl: provider.provider.residency_source_url ?? null,
					},
				]}
				showQuantizationTrigger={false}
				showModelMappingTrigger={false}
			/>
		</div>
	);
}

function ProviderServiceTierRow({
	provider,
	plan,
	pricingTimeMs,
	showCacheReadColumn,
	navigationProviderIds,
	isActive,
	runtimeStats,
	showDisclosureGutter,
}: {
	provider: ProviderPricing;
	plan: string;
	pricingTimeMs: number;
	showCacheReadColumn: boolean;
	navigationProviderIds: string[];
	isActive: boolean;
	runtimeStats: ProviderRuntimeStats | null;
	showDisclosureGutter: boolean;
}) {
	const sections = useMemo(
		() => buildProviderSections(provider, plan, pricingTimeMs),
		[plan, pricingTimeMs, provider],
	);
	const inputPrice = buildProviderTablePriceSummary(sections, "input");
	const outputPrice = buildProviderTablePriceSummary(sections, "output");
	const cacheReadPrice = showCacheReadColumn
		? buildProviderTablePriceSummary(sections, "cached")
		: null;
	const tierMeta = getTierFilterMeta(plan);
	const providerName = getProviderServiceTierDisplayName(provider);
	const logoProviderId = sections.logoProviderId;
	const discountBadge = getProviderTableDiscountBadge(sections);
	const openTier = () => {
		dispatchProviderInspectorOpen(
			provider.provider.api_provider_id,
			false,
			navigationProviderIds,
			plan,
		);
	};

	return (
		<TableRow
			role="button"
			tabIndex={0}
			aria-pressed={isActive}
			aria-label={`Open ${providerName} ${formatServiceTierLabel(plan)} service tier`}
			onClick={openTier}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				openTier();
			}}
			className={cn(
				"group cursor-pointer hover:bg-zinc-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-zinc-900/30",
				isActive && "bg-primary/[0.06]",
			)}
		>
			<TableCell className="relative min-w-[280px] py-1 pl-3 pr-2">
				{isActive ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
				<div className="flex items-center gap-1.5 whitespace-nowrap">
					{showDisclosureGutter ? <span aria-hidden="true" className="size-5 shrink-0" /> : null}
					<span className="inline-flex items-center gap-2.5 font-semibold text-foreground">
						<span className="relative flex size-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors group-hover:border-zinc-300 dark:border-zinc-800 dark:group-hover:border-zinc-700">
							<span className="relative size-3.5">
								<Logo
									id={logoProviderId}
									alt={`${providerName} logo`}
									className="object-contain"
									fill
									sizes="18px"
								/>
							</span>
						</span>
						<span>
							{providerName}{" "}
							<span className={cn("font-medium", tierMeta.iconClassName)}>
								({formatServiceTierLabel(plan)})
							</span>
						</span>
						<ProviderServiceTierInfoIcons provider={provider} plan={plan} />
						{discountBadge ? (
							<span className="whitespace-nowrap text-xs font-medium text-emerald-600 dark:text-emerald-400">
								{discountBadge}
							</span>
						) : null}
					</span>
				</div>
			</TableCell>
			<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
				{renderTierTablePrice(inputPrice)}
			</TableCell>
			<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
				{renderTierTablePrice(outputPrice)}
			</TableCell>
			{showCacheReadColumn ? (
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					{cacheReadPrice ? renderTierTablePrice(cacheReadPrice) : "--"}
				</TableCell>
			) : null}
			<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
				{plan === "batch" ? "--" : formatTierLatency(runtimeStats?.latencyMs30m)}
			</TableCell>
			<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
				{plan === "batch" ? "--" : formatTierThroughput(runtimeStats?.throughput30m)}
			</TableCell>
			<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
				{plan === "batch" ? "--" : formatTierUptime(runtimeStats)}
			</TableCell>
		</TableRow>
	);
}

export function getProviderServiceTierDisplayName(provider: ProviderPricing): string {
	return formatProviderOfferDisplayName({
		providerId: provider.provider.api_provider_id,
		providerName:
			provider.provider.api_provider_name ||
			provider.provider.api_provider_id,
		offerLabel: provider.provider.offer_label ?? null,
		offerScope: provider.provider.offer_scope ?? null,
	});
}

export default function ModelPricingClient({
	modelId,
	providers,
    creatorOrgId,
    initialPricingTimeMs,
    runtimeStats = EMPTY_RUNTIME_STATS,
    routingHealth = EMPTY_ROUTING_HEALTH,
    workspacePrivacySettings = null,
    showHeader = true,
    headerDescription,
}: {
    modelId: string;
    providers: ProviderPricing[];
    creatorOrgId?: string | null;
    initialPricingTimeMs: number;
    runtimeStats?: ProviderRuntimeStatsMap;
    routingHealth?: ProviderRoutingStatusMap;
    workspacePrivacySettings?: WorkspacePrivacySettings | null;
    showHeader?: boolean;
    headerDescription?: string | null;
}) {
    const pricingTimeMs = usePricingClock(initialPricingTimeMs);
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const searchParams = useSearchParams();
    const effectiveSearchParams = useMemo(
        () => searchParams ?? new URLSearchParams(),
        [searchParams]
    );
	const requestedProviderId =
		effectiveSearchParams.get(PROVIDER_QUERY_KEY)?.trim() || null;
    const [selectedPercentile, setSelectedPercentile] = useState<ModelPercentile>(
        DEFAULT_MODEL_PERCENTILE,
    );
	const [expandedServiceTierProviderIds, setExpandedServiceTierProviderIds] = useState<Set<string>>(
		() => new Set(),
	);
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
    const providerIds = useMemo(
        () => displayProviders.map((provider) => provider.provider.api_provider_id),
        [displayProviders],
    );
    const modelAliases = useMemo(
        () =>
            displayProviders.flatMap((provider) =>
                provider.provider_models.flatMap((providerModel) => [
                    providerModel.model_id,
                    providerModel.provider_model_slug ?? "",
                ]),
            ),
        [displayProviders],
    );
	const runtimeStatsKey = useMemo(
		() =>
			[
				"model-provider-runtime-stats",
				modelId,
				providerIds,
				modelAliases,
				selectedPercentile,
			] as const,
		[modelAliases, modelId, providerIds, selectedPercentile],
	);
	const successfulPercentileRef = useRef<ModelPercentile>(
		DEFAULT_MODEL_PERCENTILE,
	);
	const {
		data: liveRuntimeStats = runtimeStats,
		isValidating: isLoadingPercentile,
	} = useSWR<ProviderRuntimeStatsMap>(
		runtimeStatsKey,
		() =>
			getModelProviderRuntimeStats({
				modelId,
				providerIds,
				modelAliases,
				percentile: selectedPercentile,
			}),
		{
			dedupingInterval: 30_000,
			errorRetryCount: RUNTIME_STATS_ERROR_RETRY_COUNT,
			fallbackData:
				selectedPercentile === DEFAULT_MODEL_PERCENTILE
					? runtimeStats
					: undefined,
			focusThrottleInterval: 60_000,
			keepPreviousData: true,
			onErrorRetry: (_error, _key, config, revalidate, retryOptions) => {
				if (isTerminalRuntimeStatsRetry(retryOptions.retryCount)) {
					setSelectedPercentile(
						resolveRuntimeStatsPercentileAfterError(
							selectedPercentile,
							successfulPercentileRef.current,
							retryOptions.retryCount,
						),
					);
					return;
				}
				const retryDelay =
					(Math.random() + 0.5) *
					2 ** Math.min(retryOptions.retryCount, 8) *
					(config.errorRetryInterval ?? 5_000);
				window.setTimeout(() => revalidate(retryOptions), retryDelay);
			},
			onSuccess: () => {
				successfulPercentileRef.current = selectedPercentile;
			},
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
		},
	);

    const handlePercentileChange = (nextPercentile: ModelPercentile) => {
        if (nextPercentile === selectedPercentile || isLoadingPercentile) return;
		setSelectedPercentile(nextPercentile);
    };

    const [sort, setSort] = useState<SortOption>(() => {
        return parseSortOption(effectiveSearchParams.get(SORT_QUERY_KEY));
    });
    const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
        const fromUrl = effectiveSearchParams.get(SORT_DIRECTION_QUERY_KEY);
        return isSortDirection(fromUrl) ? fromUrl : "desc";
    });
    const [providerStatusFilters, setProviderStatusFilters] = useState<ProviderStatusFilter[]>(
        DEFAULT_PROVIDER_STATUS_FILTERS,
    );
    const [privacyFilter, setPrivacyFilter] = useState<PrivacyFilter>("workspace");
    const [activeInspectorSelection, setActiveInspectorSelection] =
        useState<ProviderInspectorSelection | null>(null);
	const inspectorProviderIdRef = useRef<string | null>(null);
	const lastAppliedUrlProviderIdRef = useRef<string | null | undefined>(undefined);
	const urlProviderIdRef = useRef<string | null>(
		effectiveSearchParams.get(PROVIDER_QUERY_KEY)?.trim() || null,
	);

    useEffect(
        () => subscribeProviderInspectorSelection((selection) => {
			inspectorProviderIdRef.current = selection?.providerId ?? null;
			setActiveInspectorSelection(selection);
		}),
        [],
    );

    const sortedProviders = useMemo(() => {
        const list = displayProviders.filter((provider) => {
			if (
				provider.pricing_rules.length === 0 &&
				provider.provider_models.length === 0
			) return false;
			if (provider.provider.api_provider_id === requestedProviderId) return true;
			return providerStatusFilters.includes(
				providerStatusFilterKey(resolveProviderGatewayStatus(provider)),
			);
		});
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

        const getProviderStatusRank = (provider: ProviderPricing): number => {
            return getGatewayStatusSortRank(resolveProviderGatewayStatus(provider));
        };
        const getProviderGatewayStatus = resolveProviderGatewayStatus;

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
                    getProviderRuntimeStats(
						liveRuntimeStats,
						provider.provider.api_provider_id,
						getProviderDefaultPlan(provider),
					)?.latencyMs30m
                )
            )
            .filter((value): value is number => value !== null);
        const throughputSamples = list
            .map((provider) =>
                finitePositive(
                    getProviderRuntimeStats(
						liveRuntimeStats,
						provider.provider.api_provider_id,
						getProviderDefaultPlan(provider),
					)?.throughput30m
                )
            )
            .filter((value): value is number => value !== null);
        const minLatency = latencySamples.length ? Math.min(...latencySamples) : null;
        const maxLatency = latencySamples.length ? Math.max(...latencySamples) : null;
        const minThroughput = throughputSamples.length ? Math.min(...throughputSamples) : null;
        const maxThroughput = throughputSamples.length ? Math.max(...throughputSamples) : null;

        const getEstimatedRoutingScore = (provider: ProviderPricing): number => {
            const providerId = provider.provider.api_provider_id;
            const stats = getProviderRuntimeStats(
				liveRuntimeStats,
				providerId,
				getProviderDefaultPlan(provider),
			);
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
                    getProviderRuntimeStats(liveRuntimeStats, a.provider.api_provider_id, getProviderDefaultPlan(a))?.throughput30m
                );
                const bTp = finitePositive(
                    getProviderRuntimeStats(liveRuntimeStats, b.provider.api_provider_id, getProviderDefaultPlan(b))?.throughput30m
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
                    getProviderRuntimeStats(liveRuntimeStats, a.provider.api_provider_id, getProviderDefaultPlan(a))?.latencyMs30m
                );
                const bLat = finitePositive(
                    getProviderRuntimeStats(liveRuntimeStats, b.provider.api_provider_id, getProviderDefaultPlan(b))?.latencyMs30m
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
                    getProviderRuntimeStats(liveRuntimeStats, a.provider.api_provider_id, getProviderDefaultPlan(a))
                );
                const bUptime = getDisplayedProviderUptime(
                    getProviderRuntimeStats(liveRuntimeStats, b.provider.api_provider_id, getProviderDefaultPlan(b))
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
    }, [displayProviders, creatorOrgId, liveRuntimeStats, pricingTimeMs, providerStatusFilters, requestedProviderId, routingHealth, sort, sortDirection]);

    const { filteredProviders, ignoredProviderReasons } = useMemo(() => {
        const ignoredReasonMap = new Map<string, string[]>();
        for (const provider of sortedProviders) {
            const reasons = workspacePrivacySettings?.isAuthenticated
                ? getIgnoredPrivacyReasons(
                      provider,
                      workspacePrivacySettings,
                      getProviderDefaultPlan(provider),
                  )
                : [];
            if (reasons.length) {
                ignoredReasonMap.set(provider.provider.api_provider_id, reasons);
            }
        }

		const filteredProviders = sortedProviders.filter((provider) =>
			provider.provider.api_provider_id === requestedProviderId ||
			getProviderAvailablePlans(provider).some((plan) =>
				matchesPrivacyFilter(
					provider,
					privacyFilter,
					workspacePrivacySettings,
					plan,
				),
			),
		);
		filteredProviders.sort((a, b) => {
			const aAccountBlocked = (ignoredReasonMap.get(a.provider.api_provider_id) ?? []).some((reason) => reason.includes("account provider"));
			const bAccountBlocked = (ignoredReasonMap.get(b.provider.api_provider_id) ?? []).some((reason) => reason.includes("account provider"));
			return Number(aAccountBlocked) - Number(bAccountBlocked);
		});
		return {
			filteredProviders,
            ignoredProviderReasons: ignoredReasonMap,
        };
	}, [privacyFilter, requestedProviderId, sortedProviders, workspacePrivacySettings]);
    const ignoredProviderCount = ignoredProviderReasons.size;
    const allProvidersHiddenByPrivacy =
        sortedProviders.length > 0 &&
        filteredProviders.length === 0 &&
        privacyFilter === "workspace" &&
        ignoredProviderCount > 0;
    const activeFilterCount =
        DEFAULT_PROVIDER_STATUS_FILTERS.filter((filter) => !providerStatusFilters.includes(filter)).length +
        (providerStatusFilters.includes("external") ? 1 : 0) +
        (privacyFilter === "workspace" ? 0 : 1);
    const visibleProviders = filteredProviders;
    const visibleOfferings = useMemo(() => {
		const offerings = visibleProviders.flatMap((provider) => {
			const availablePlans = getProviderAvailablePlans(provider).filter((plan) =>
				provider.provider.api_provider_id === requestedProviderId ||
				matchesPrivacyFilter(provider, privacyFilter, workspacePrivacySettings, plan),
			);
			const defaultPlan = getProviderDefaultPlan(provider);
			const primaryPlan = availablePlans.includes(defaultPlan)
				? defaultPlan
				: availablePlans[0];
			return availablePlans.map((plan): ProviderOffering => ({
				provider,
				plan,
				isPrimary: plan === primaryPlan,
			}));
		});
		if (sort === "default") return offerings;

		const tierRank = (plan: string) => {
			if (plan === "standard") return 0;
			if (plan === "priority") return 1;
			if (plan === "flex") return 2;
			if (plan === "batch") return 3;
			return 4;
		};
		const offeringName = (offering: ProviderOffering) =>
			getProviderServiceTierDisplayName(offering.provider);
		const fallbackCompare = (a: ProviderOffering, b: ProviderOffering) => {
			const nameComparison = offeringName(a).localeCompare(offeringName(b));
			if (nameComparison !== 0) return nameComparison;
			return tierRank(a.plan) - tierRank(b.plan);
		};
		const metricCompare = (aValue: number | null, bValue: number | null, fallback: number) => {
			if (aValue == null && bValue == null) return fallback;
			if (aValue == null) return 1;
			if (bValue == null) return -1;
			return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
		};
		const priceFor = (offering: ProviderOffering, direction: "input" | "output" | "cached") =>
			buildProviderTablePriceSummary(
				buildProviderSections(offering.provider, offering.plan, pricingTimeMs),
				direction,
			).sortValue;
		return offerings.sort((a, b) => {
			const fallback = fallbackCompare(a, b);
			if (sort === "provider") {
				return sortDirection === "asc" ? fallback : -fallback;
			}
			const aStats = getProviderRuntimeStats(
				liveRuntimeStats,
				a.provider.provider.api_provider_id,
				a.plan,
			);
			const bStats = getProviderRuntimeStats(
				liveRuntimeStats,
				b.provider.provider.api_provider_id,
				b.plan,
			);
			if (sort === "latency") {
				return metricCompare(
					a.plan === "batch" ? null : finitePositive(aStats?.latencyMs30m),
					b.plan === "batch" ? null : finitePositive(bStats?.latencyMs30m),
					fallback,
				);
			}
			if (sort === "throughput") {
				return metricCompare(
					a.plan === "batch" ? null : finitePositive(aStats?.throughput30m),
					b.plan === "batch" ? null : finitePositive(bStats?.throughput30m),
					fallback,
				);
			}
			if (sort === "uptime") {
				return metricCompare(
					a.plan === "batch" ? null : getDisplayedProviderUptime(aStats),
					b.plan === "batch" ? null : getDisplayedProviderUptime(bStats),
					fallback,
				);
			}
			const priceDirection = sort === "cache_read" ? "cached" : sort;
			return metricCompare(
				priceFor(a, priceDirection),
				priceFor(b, priceDirection),
				fallback,
			);
		});
	}, [liveRuntimeStats, pricingTimeMs, privacyFilter, requestedProviderId, sort, sortDirection, visibleProviders, workspacePrivacySettings]);
	const isGroupedProviderView = sort === "default";
	const displayedOfferings = useMemo(
		() => sort === "default"
			? visibleOfferings.filter(
				(offering) =>
					offering.isPrimary ||
					expandedServiceTierProviderIds.has(
						offering.provider.provider.api_provider_id,
					),
			)
			: visibleOfferings,
		[expandedServiceTierProviderIds, sort, visibleOfferings],
	);
	const toggleServiceTiers = useCallback((providerId: string) => {
		setExpandedServiceTierProviderIds((current) => {
			const next = new Set(current);
			if (next.has(providerId)) next.delete(providerId);
			else next.add(providerId);
			return next;
		});
	}, []);
    const showCacheReadColumn = useMemo(() => {
        return visibleOfferings.some(({ provider, plan }) => {
            const sections = buildProviderSections(
                provider,
                plan,
                pricingTimeMs,
            );
            return buildProviderTablePriceSummary(sections, "cached").primary !== null;
        });
    }, [pricingTimeMs, visibleOfferings]);
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
            const hash = window.location.hash;
            const nextUrl = nextQuery ? `${pathname}?${nextQuery}${hash}` : `${pathname}${hash}`;
            router.replace(nextUrl, {
                scroll: false,
            });
        },
        [effectiveSearchParams, pathname, router]
    );

	useEffect(() => {
		return subscribeProviderInspectorSelection((selection) => {
			const providerId = selection?.providerId ?? null;
			inspectorProviderIdRef.current = providerId;
			if (providerId === urlProviderIdRef.current) return;
			lastAppliedUrlProviderIdRef.current = providerId;
			urlProviderIdRef.current = providerId;
			updateUrlState({ [PROVIDER_QUERY_KEY]: providerId });
		}, false);
	}, [updateUrlState]);

	useEffect(() => {
		const requestedProvider = requestedProviderId
			? displayProviders.find(
					(provider) =>
						provider.provider.api_provider_id === requestedProviderId,
				)
			: null;

		if (requestedProviderId && !requestedProvider) {
			lastAppliedUrlProviderIdRef.current = null;
			urlProviderIdRef.current = null;
			if (inspectorProviderIdRef.current) clearProviderInspector();
			updateUrlState({ [PROVIDER_QUERY_KEY]: null });
			return;
		}

		if (
			lastAppliedUrlProviderIdRef.current === requestedProviderId &&
			inspectorProviderIdRef.current === requestedProviderId
		) return;
		lastAppliedUrlProviderIdRef.current = requestedProviderId;
		urlProviderIdRef.current = requestedProviderId;
		if (!requestedProviderId) {
			if (inspectorProviderIdRef.current) clearProviderInspector();
			return;
		}

		dispatchProviderInspectorOpen(
			requestedProviderId,
			true,
			visibleProviders.map(
				(provider) => provider.provider.api_provider_id,
			),
		);
	}, [displayProviders, requestedProviderId, updateUrlState, visibleProviders]);

    useLayoutEffect(() => {
		publishProviderView(modelId, activeFilterCount > 0
            ? filteredProviders
                .map((provider) => provider.provider.api_provider_id)
                .sort((a, b) => a.localeCompare(b))
                .join(",") || "none"
            : null);
		return () => publishProviderView(modelId, null);
	}, [activeFilterCount, filteredProviders, modelId]);

    useEffect(() => {
        if (!effectiveSearchParams.has(LEGACY_PROVIDER_VIEW_QUERY_KEY)) return;
        updateUrlState({ [LEGACY_PROVIDER_VIEW_QUERY_KEY]: null });
    }, [effectiveSearchParams, updateUrlState]);

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
            <div className={cn(
                "flex flex-wrap items-center justify-between gap-3",
                !showHeader && "-mt-3 justify-end",
            )}>
                {showHeader ? (
                    <div className="space-y-1">
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                            Providers
                        </h2>
                        {headerDescription ? (
                            <p className="text-sm text-muted-foreground">{headerDescription}</p>
                        ) : null}
                    </div>
                ) : null}
                {hasApiProviders ? (
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button type="button" variant="outline" size="sm" className="h-8 gap-2 rounded-md px-3 text-xs" />
                                }
                            >
                                <Filter className="size-3.5" />
                                Filters
                                {activeFilterCount > 0 ? (
                                    <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                                        {activeFilterCount}
                                    </span>
                                ) : null}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72 rounded-md">
                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                                    Filter providers
                                </div>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <ListFilter className="size-4 text-muted-foreground" />
                                        <span className="whitespace-nowrap">Status</span>
                                        <span className="ml-auto text-xs text-muted-foreground">
                                            {providerStatusFilters.length}/4
                                        </span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="w-72 rounded-md">
                                            <DropdownMenuGroup>
                                                <DropdownMenuCheckboxItem
                                                    checked={providerStatusFilters.includes("routable")}
                                                    onCheckedChange={(checked) =>
                                                        setProviderStatusFilters((current) =>
                                                            toggleProviderStatusFilter(current, "routable", checked === true),
                                                        )
                                                    }
                                                >
                                                    <CheckCircle2 className="size-4 text-emerald-600" />
                                                    <span className="whitespace-nowrap">Routable</span>
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={providerStatusFilters.includes("preview")}
                                                    onCheckedChange={(checked) =>
                                                        setProviderStatusFilters((current) =>
                                                            toggleProviderStatusFilter(current, "preview", checked === true),
                                                        )
                                                    }
                                                >
                                                    <Clock3 className="size-4 text-blue-600" />
                                                    <span className="whitespace-nowrap">Preview / coming soon</span>
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={providerStatusFilters.includes("inactive")}
                                                    onCheckedChange={(checked) =>
                                                        setProviderStatusFilters((current) =>
                                                            toggleProviderStatusFilter(current, "inactive", checked === true),
                                                        )
                                                    }
                                                >
                                                    <Ban className="size-4 text-zinc-500" />
                                                    <span className="whitespace-nowrap">Inactive / disabled</span>
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={providerStatusFilters.includes("external")}
                                                    onCheckedChange={(checked) =>
                                                        setProviderStatusFilters((current) =>
                                                            toggleProviderStatusFilter(current, "external", checked === true),
                                                        )
                                                    }
                                                >
                                                    <Globe2 className="size-4 text-violet-600" />
                                                    <span className="whitespace-nowrap">External providers</span>
                                                </DropdownMenuCheckboxItem>
                                            </DropdownMenuGroup>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <ShieldCheck className="size-4 text-muted-foreground" />
                                        <span className="whitespace-nowrap">Data privacy</span>
                                        <span className="ml-auto text-xs text-muted-foreground">{privacyFilter === "workspace" ? "Workspace" : "Custom"}</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="w-80 rounded-md">
                                            <DropdownMenuGroup>
                                                <DropdownMenuCheckboxItem
                                                    checked={privacyFilter === "workspace"}
                                                    onCheckedChange={(checked) => checked && setPrivacyFilter("workspace")}
                                                >
                                                    <ShieldCheck className="size-4 text-emerald-600" />
                                                    <span className="whitespace-nowrap">Respect workspace settings</span>
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={privacyFilter === "zdr"}
                                                    onCheckedChange={(checked) => checked && setPrivacyFilter("zdr")}
                                                >
                                                    <Database className="size-4 text-blue-600" />
                                                    <span className="whitespace-nowrap">Zero data retention only</span>
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={privacyFilter === "no_training"}
                                                    onCheckedChange={(checked) => checked && setPrivacyFilter("no_training")}
                                                >
                                                    <GraduationCap className="size-4 text-amber-600" />
                                                    <span className="whitespace-nowrap">No training on inputs</span>
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={privacyFilter === "all"}
                                                    onCheckedChange={(checked) => checked && setPrivacyFilter("all")}
                                                >
                                                    <CircleDot className="size-4 text-zinc-500" />
                                                    <span className="whitespace-nowrap">Show all privacy policies</span>
                                                </DropdownMenuCheckboxItem>
                                            </DropdownMenuGroup>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => {
                                        setProviderStatusFilters(DEFAULT_PROVIDER_STATUS_FILTERS);
                                        setPrivacyFilter("workspace");
                                    }}
                                >
                                    <RotateCcw className="size-4 text-muted-foreground" />
                                    Reset filters
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <ModelPercentileSelect
                            value={selectedPercentile}
                            onChange={handlePercentileChange}
                            isLoading={isLoadingPercentile}
                            ariaLabel="Select provider percentile"
                        />
                    </div>
                ) : null}
            </div>
            <section className="space-y-4">
                {visibleOfferings.length > 0 ? (
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
                                        {displayedOfferings.map(({ provider: prov, plan, isPrimary }, index) => {
                                            const providerId = prov.provider.api_provider_id;
                                            const runtimeStatsForTier = getProviderRuntimeStats(
											liveRuntimeStats,
											providerId,
											plan,
										);
                                            const isActive =
                                                activeInspectorSelection?.providerId === providerId &&
											(activeInspectorSelection.serviceTier ?? getProviderDefaultPlan(prov)) === plan;

                                            if (!isPrimary) {
											return (
												<ProviderServiceTierRow
													key={`${providerId}-${plan}`}
													provider={prov}
													plan={plan}
													pricingTimeMs={pricingTimeMs}
													showCacheReadColumn={showCacheReadColumn}
													navigationProviderIds={visibleProviders.map(
														(candidate) => candidate.provider.api_provider_id,
													)}
													isActive={isActive}
													runtimeStats={runtimeStatsForTier ?? null}
													showDisclosureGutter={isGroupedProviderView}
												/>
											);
										}

										return (
											<ProviderCard
												key={`${providerId}-${plan}`}
												provider={prov}
												defaultPlan={plan}
												availablePlans={getProviderAvailablePlans(prov)}
												comparisonProviders={displayProviders}
												navigationProviders={visibleProviders}
												privacyIgnoredReasons={ignoredProviderReasons.get(providerId) ?? null}
												runtimeStats={runtimeStatsForTier ?? null}
												runtimeStatsByServiceTier={Object.fromEntries(
													getProviderAvailablePlans(prov).map((serviceTier) => [
														serviceTier,
														getProviderRuntimeStats(liveRuntimeStats, providerId, serviceTier) ?? null,
													]),
												)}
												routingStatus={routingHealth[providerId] ?? null}
												pricingTimeMs={pricingTimeMs}
												variantLabels={providerVariantLabelsById.get(providerId) ?? null}
												showCacheReadColumn={showCacheReadColumn}
													isLastVisible={index === displayedOfferings.length - 1}
													isSummaryActive={isActive}
													serviceTiersExpanded={expandedServiceTierProviderIds.has(providerId)}
													showServiceTierDisclosureGutter={isGroupedProviderView}
													onToggleServiceTiers={isGroupedProviderView ? () => toggleServiceTiers(providerId) : undefined}
												/>
										);
									})}
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
                                onClick={() => setPrivacyFilter("all")}
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
