"use client";

import {
	Fragment,
	type KeyboardEvent,
	type MouseEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import Link from "next/link";
import type { DateRange } from "react-day-picker";
import {
	CartesianGrid,
	Line,
	LineChart,
	Tooltip as RechartsTooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpRight,
	ChevronsUpDown,
	ChevronDown,
	CalendarDays,
	Download,
	Info,
	Maximize2,
} from "lucide-react";
import {
	ChartContainer,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";
import {
	buildProviderSections,
	buildProviderTablePriceSummary,
	calculateDailyAveragePricingMeterPrice,
	fmtUSD,
	resolvePricingMeterPrice,
} from "@/components/(data)/model/pricing/pricingHelpers";
import {
	assignPerceptualSeriesColours,
	getPricingTierDasharray,
	keyForSeries,
} from "@/components/(rankings)/chart-colors";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import type { ModelEffectivePricingDailyRow } from "@/lib/fetchers/models/getModelEffectivePricingDaily";
import {
	formatProviderOfferDisplayName,
	resolveProviderLogoId,
} from "@/lib/providers/providerOffers";
import { cn } from "@/lib/utils";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import {
	getPricingHistoryTimestamps,
	pricingHistoryToCsv,
	type PricingHistoryPoint,
	type PricingRange,
} from "@/components/(data)/model/pricing/pricingHistoryTimeline";
import {
	PRICING_HISTORY_TOOLTIP_EDGE_COUNT,
	getPricingHistoryLineStyle,
	orderPricingHistoryTooltipItems,
	selectPricingHistoryTooltipItems,
} from "@/components/(data)/model/pricing/pricingHistoryTooltip";
import {
	calculateCacheHitRatePct,
	calculateObservedEffectivePriceSummary,
	calculateTokenSharePct,
} from "@/components/(data)/model/pricing/effectivePricing";
import { normalizeGatewayStatusValue } from "@/components/(data)/model/pricing/providerGatewayStatus";
import {
	dispatchProviderInspectorOpen,
	subscribeProviderInspector,
} from "@/components/(data)/model/pricing/providerInspectorSync";

const dailyAveragePricePer1MCache = new WeakMap<ModelPricingHistoryRule, number>();

type PricingInsightsProps = {
	providers: ProviderPricing[];
	plan: string;
	availablePlans: string[];
	onPlanChange?: (plan: string) => void;
	showPlanInEffectiveHeader?: boolean;
	historyRules: ModelPricingHistoryRule[];
	usageRows: ModelUsageDailyBreakdownRow[];
	effectivePricingRows: ModelEffectivePricingDailyRow[];
};

type SortKey =
	| "provider"
	| "input"
	| "output"
	| "listedInput"
	| "listedOutput"
	| "cacheHitRate"
	| "tokenShare";
type SortDirection = "asc" | "desc";
type PricingView = "effective" | "listed";

type EffectiveRow = {
	providerId: string;
	providerName: string;
	logoProviderId: string;
	seriesKey: string;
	color: string;
	pricingPlan: string;
	availablePlans: string[];
	isExternal: boolean;
	effectiveUsageEligible: boolean;
	inputPricePer1M: number | null;
	outputPricePer1M: number | null;
	listedInputPricePer1M: number | null;
	listedOutputPricePer1M: number | null;
	cacheHitRatePct: number | null;
	tokenSharePct: number | null;
	totalTokens30d: number;
	inputWeightTokens30d: number;
	outputWeightTokens30d: number;
};

type DailyUsagePoint = {
	day: string;
	inputTokens: number;
	outputTokens: number;
	cachedReadTextTokens: number;
	cachedWriteTextTokens: number;
	cachedWriteTextTokens5m: number;
	cachedWriteTextTokens1h: number;
};

type ProviderUsageSummary = {
	totalTokens30d: number;
	inputWeightTokens30d: number;
	outputWeightTokens30d: number;
	cachedReadInputTokens30d: number;
	usageByDay: Map<string, DailyUsagePoint>;
};

type ObservedEffectiveUsageSummary = {
	inputTokens30d: number;
	outputTokens30d: number;
	cachedReadTokens30d: number;
	totalTokens30d: number;
	usageByDay: Map<string, ModelEffectivePricingDailyRow>;
};

const INPUT_METER_PREFERENCE = ["input_text_tokens", "input_tokens"] as const;
const OUTPUT_METER_PREFERENCE = ["output_text_tokens", "output_tokens"] as const;
function formatPercent(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function formatTokenCount(value: number): string {
	if (!Number.isFinite(value)) return "--";
	return `${Math.round(value).toLocaleString()} tokens`;
}

function formatUsd(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return fmtUSD(value);
}

function formatAxisUsd(value: number): string {
	if (!Number.isFinite(value)) return "--";
	if (Math.abs(value) >= 100) return fmtUSD(Math.round(value));
	if (Math.abs(value) >= 10) return fmtUSD(Number(value.toFixed(1)));
	return fmtUSD(Number(value.toFixed(2)));
}

function formatTimestampLabel(timestamp: string, includeTime = false): string {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) return timestamp;
	return date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		...(includeTime
			? { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
			: {}),
		timeZone: "UTC",
	});
}

function toMs(value: string | null | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function isRuleActiveAt(rule: ModelPricingHistoryRule, timestampMs: number): boolean {
	const fromMs = toMs(rule.effectiveFrom, Number.NEGATIVE_INFINITY);
	const toMsValue = toMs(rule.effectiveTo, Number.POSITIVE_INFINITY);
	return timestampMs >= fromMs && timestampMs < toMsValue;
}

function chooseRuleForTimestamp(
	rules: ModelPricingHistoryRule[],
	meterPreference: readonly string[],
	timestampMs: number,
): ModelPricingHistoryRule | null {
	const candidates = rules
		.filter((rule) => meterPreference.includes(rule.meter as (typeof meterPreference)[number]))
		.filter((rule) => isRuleActiveAt(rule, timestampMs))
		.sort((a, b) => {
			const aMeterRank = meterPreference.indexOf(
				a.meter as (typeof meterPreference)[number],
			);
			const bMeterRank = meterPreference.indexOf(
				b.meter as (typeof meterPreference)[number],
			);
			if (aMeterRank !== bMeterRank) return aMeterRank - bMeterRank;
			if (a.match.length !== b.match.length) return a.match.length - b.match.length;
			if (a.priority !== b.priority) return b.priority - a.priority;
			return toMs(b.effectiveFrom, Number.NEGATIVE_INFINITY) -
				toMs(a.effectiveFrom, Number.NEGATIVE_INFINITY);
		});

	return candidates[0] ?? null;
}

function getDefaultDirection(sortKey: SortKey): SortDirection {
	switch (sortKey) {
		case "provider":
			return "asc";
		case "input":
		case "output":
		case "listedInput":
		case "listedOutput":
			return "asc";
		case "cacheHitRate":
		case "tokenShare":
			return "desc";
	}
}

function keepExternalProvidersLast(rows: EffectiveRow[]): EffectiveRow[] {
	return [
		...rows.filter((row) => !row.isExternal),
		...rows.filter((row) => row.isExternal),
	];
}

function useSortedRows(rows: EffectiveRow[], sortKey: SortKey | null, direction: SortDirection) {
	return useMemo(() => {
		if (!sortKey) {
			return keepExternalProvidersLast([...rows].sort((a, b) => {
				if ((a.tokenSharePct ?? -1) !== (b.tokenSharePct ?? -1)) {
					return (b.tokenSharePct ?? -1) - (a.tokenSharePct ?? -1);
				}
				return a.providerName.localeCompare(b.providerName);
			}));
		}

		return keepExternalProvidersLast([...rows].sort((a, b) => {
			const sortableValue = (row: EffectiveRow): number | null => {
				switch (sortKey) {
					case "input":
						return row.inputPricePer1M;
					case "output":
						return row.outputPricePer1M;
					case "listedInput":
						return row.listedInputPricePer1M;
					case "listedOutput":
						return row.listedOutputPricePer1M;
					case "cacheHitRate":
						return row.cacheHitRatePct;
					case "tokenShare":
						return row.tokenSharePct;
					default:
						return null;
				}
			};

			if (sortKey !== "provider") {
				const left = sortableValue(a);
				const right = sortableValue(b);
				if (left == null || right == null) {
					if (left == null && right == null) {
						return a.providerName.localeCompare(b.providerName);
					}
					return left == null ? 1 : -1;
				}
			}

			const compareNumber = (left: number | null, right: number | null) => {
				if (left == null && right == null) return 0;
				if (left == null) return 1;
				if (right == null) return -1;
				return left - right;
			};

			let result = 0;
			switch (sortKey) {
				case "provider":
					result = a.providerName.localeCompare(b.providerName);
					break;
				case "input":
					result = compareNumber(a.inputPricePer1M, b.inputPricePer1M);
					break;
				case "output":
					result = compareNumber(a.outputPricePer1M, b.outputPricePer1M);
					break;
				case "listedInput":
					result = compareNumber(a.listedInputPricePer1M, b.listedInputPricePer1M);
					break;
				case "listedOutput":
					result = compareNumber(a.listedOutputPricePer1M, b.listedOutputPricePer1M);
					break;
				case "cacheHitRate":
					result = compareNumber(a.cacheHitRatePct, b.cacheHitRatePct);
					break;
				case "tokenShare":
					result = compareNumber(a.tokenSharePct, b.tokenSharePct);
					break;
			}

			if (result === 0) return a.providerName.localeCompare(b.providerName);
			return direction === "asc" ? result : -result;
		}));
	}, [direction, rows, sortKey]);
}

function SortHead({
	label,
	sortKey,
	activeSortKey,
	direction,
	align = "left",
	onToggle,
}: {
	label: string;
	sortKey: SortKey;
	activeSortKey: SortKey | null;
	direction: SortDirection;
	align?: "left" | "right";
	onToggle: (sortKey: SortKey) => void;
}) {
	const isActive = activeSortKey === sortKey;
	const icon = isActive ? (
		direction === "asc" ? (
			<ArrowUp className="h-3.5 w-3.5" />
		) : (
			<ArrowDown className="h-3.5 w-3.5" />
		)
	) : (
		<ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
	);

	return (
		<button
			type="button"
			onClick={() => onToggle(sortKey)}
			className={cn(
				"group inline-flex h-full min-h-8 w-full items-center gap-1.5 leading-none text-xs font-medium transition-colors hover:text-foreground",
				align === "left" ? "justify-start text-left" : "justify-end text-right",
				isActive ? "text-foreground" : "text-muted-foreground",
			)}
		>
			{align === "left" ? (
				<>
					<span>{label}</span>
					{icon}
				</>
			) : (
				<>
					{icon}
					<span>{label}</span>
				</>
			)}
		</button>
	);
}

function getPriceForMeter(
	rules: ModelPricingHistoryRule[],
	meterPreference: readonly string[],
	timestampMs: number,
	preferredPricePer1M?: number | null,
	mode: "daily_average" | "exact" = "daily_average",
): number | null {
	const selectedRule = chooseRuleForTimestamp(rules, meterPreference, timestampMs);
	if (!selectedRule) return null;
	const preferredPrice = preferredPricePer1M;
	const ambiguousRules = preferredPrice == null
		? []
		: rules.filter((rule) =>
			rule.meter === selectedRule.meter && isRuleActiveAt(rule, timestampMs),
		);
	const rule = ambiguousRules.length < 2
		? selectedRule
		: chooseRuleForTimestamp(
			ambiguousRules.filter((candidate) =>
				Math.abs(candidate.pricePer1MUnits - Number(preferredPrice)) < 1e-9,
			),
			meterPreference,
			timestampMs,
		) ?? selectedRule;
	if (!rule.timeWindows?.length) return rule.pricePer1MUnits;
	if (mode === "exact") {
		const date = new Date(timestampMs);
		const utcTime = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
		return resolvePricingMeterPrice({
			price_per_unit: String(rule.pricePerUnit),
			time_windows: rule.timeWindows,
		}, utcTime, date).pricePerUnit * (1_000_000 / rule.unitSize);
	}
	const cached = dailyAveragePricePer1MCache.get(rule);
	if (cached !== undefined) return cached;
	const average = calculateDailyAveragePricingMeterPrice({
		price_per_unit: String(rule.pricePerUnit),
		time_windows: rule.timeWindows,
	}) * (1_000_000 / rule.unitSize);
	dailyAveragePricePer1MCache.set(rule, average);
	return average;
}

const RANGE_LABELS: Array<{ value: PricingRange; label: string }> = [
	{ value: "7d", label: "1W" },
	{ value: "30d", label: "1M" },
	{ value: "90d", label: "3M" },
	{ value: "1y", label: "1Y" },
	{ value: "all", label: "All" },
];
const PRICING_PLAN_ORDER = ["free", "standard", "priority", "flex", "batch"];

function getProviderPricingPlans(provider: ProviderPricing): string[] {
	const plans = Array.from(
		new Set(provider.pricing_rules.map((rule) => rule.pricing_plan || "standard")),
	);
	return plans.sort((a, b) => {
		const aRank = PRICING_PLAN_ORDER.indexOf(a);
		const bRank = PRICING_PLAN_ORDER.indexOf(b);
		if (aRank !== bRank) return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
		return a.localeCompare(b);
	});
}

function formatMeterLabel(meter: string): string {
	return meter
		.replace(/_/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase())
		.replace("Cached Read", "Cache Read")
		.replace("Cached Write", "Cache Write");
}

function formatPricingPlanLabel(plan: string): string {
	return plan
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function ServiceTierIcon({ plan }: { plan: string }) {
	const tier = getTierFilterMeta(plan);
	const Icon = tier.icon;
	return <Icon className={cn("size-3.5 shrink-0", tier.iconClassName)} aria-hidden="true" />;
}

function ServiceTierIconBadge({ plan }: { plan: string }) {
	return (
		<span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background">
			<ServiceTierIcon plan={plan} />
		</span>
	);
}

function PricingLineTypeIcon({ plan, color }: { plan: string; color: string }) {
	return (
		<svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true" focusable="false">
			<line
				x1="1"
				y1="4"
				x2="23"
				y2="4"
				stroke={color}
				strokeWidth="1.75"
				strokeDasharray={getPricingTierDasharray(plan)}
				strokeLinecap="round"
			/>
		</svg>
	);
}

function PricingTierLabel({ providerName, plan }: { providerName: string; plan: string }) {
	const tier = getTierFilterMeta(plan);
	return (
		<span className="inline-flex items-center gap-2.5 whitespace-nowrap text-foreground">
			<ServiceTierIconBadge plan={plan} />
			<span>
				{providerName}{" "}
				<span className={tier.iconClassName}>({formatPricingPlanLabel(plan)})</span>
			</span>
		</span>
	);
}

function PricingTierLegend({ plans }: { plans: string[] }) {
	if (!plans.length) return null;
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-2 pt-2.5 text-[11px] text-muted-foreground" aria-label="Service tier line styles">
			<span className="font-medium text-foreground">Service tier</span>
			{plans.map((plan) => (
				<span key={plan} className="inline-flex items-center gap-1.5">
					<svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true" focusable="false">
						<line
							x1="1"
							y1="4"
							x2="27"
							y2="4"
							stroke="currentColor"
							strokeWidth="2"
							strokeDasharray={getPricingTierDasharray(plan)}
							strokeLinecap="round"
						/>
					</svg>
					<span>{formatPricingPlanLabel(plan)}</span>
				</span>
			))}
		</div>
	);
}

type EffectivePricePrefixPoint = {
	timestampMs: number;
	inputTokens: number;
	outputTokens: number;
	inputCostNanos: number;
	outputCostNanos: number;
};

function buildEffectivePricePrefix(
	usage: ObservedEffectiveUsageSummary | undefined,
): EffectivePricePrefixPoint[] {
	let inputTokens = 0;
	let outputTokens = 0;
	let inputCostNanos = 0;
	let outputCostNanos = 0;
	return Array.from(usage?.usageByDay.values() ?? [])
		.map((point) => ({ point, timestampMs: Date.parse(`${point.dayBucket}T12:00:00.000Z`) }))
		.filter(({ timestampMs }) => Number.isFinite(timestampMs))
		.sort((a, b) => a.timestampMs - b.timestampMs)
		.map(({ point, timestampMs }) => {
			if (point.inputTokens > 0) {
				inputTokens += point.inputTokens;
				inputCostNanos += point.inputCostNanos;
			}
			if (point.outputTokens > 0) {
				outputTokens += point.outputTokens;
				outputCostNanos += point.outputCostNanos;
			}
			return { timestampMs, inputTokens, outputTokens, inputCostNanos, outputCostNanos };
		});
}

function getEffectivePriceFromPrefix(
	points: EffectivePricePrefixPoint[],
	sinceMs: number,
	untilMs: number,
	input: boolean,
): number | null {
	const upperBound = (value: number) => {
		let low = 0;
		let high = points.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (points[middle]!.timestampMs <= value) low = middle + 1;
			else high = middle;
		}
		return low;
	};
	const end = points[upperBound(untilMs) - 1];
	if (!end) return null;
	const before = points[upperBound(sinceMs - 1) - 1];
	const tokens = input
		? end.inputTokens - (before?.inputTokens ?? 0)
		: end.outputTokens - (before?.outputTokens ?? 0);
	const costNanos = input
		? end.inputCostNanos - (before?.inputCostNanos ?? 0)
		: end.outputCostNanos - (before?.outputCostNanos ?? 0);
	return tokens > 0 ? (costNanos / 1_000_000_000) / tokens * 1_000_000 : null;
}

function ExternalProviderBadge() {
	return (
		<Tooltip delayDuration={120}>
			<TooltipTrigger asChild>
				<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300" aria-label="External provider">
					<ArrowUpRight className="size-3" aria-hidden="true" />
				</span>
			</TooltipTrigger>
			<TooltipContent>Listed from an external catalogue; not routable through Phaseo.</TooltipContent>
		</Tooltip>
	);
}

function buildPricingHistoryState(args: {
	rows: EffectiveRow[];
	usageByProvider: Map<string, ProviderUsageSummary>;
	observedUsageByProviderPlan: Map<string, ObservedEffectiveUsageSummary>;
	historyRules: ModelPricingHistoryRule[];
	view: PricingView;
	meter: string;
	range: PricingRange;
	nowMs: number;
	customStartMs?: number;
	customEndMs?: number;
}) {
	const providerNameBySeries = new Map<string, string>();
	const chartConfig: ChartConfig = {};
	const rulesBySeries = new Map<string, ModelPricingHistoryRule[]>();
	const seriesByProviderPlan = new Map<string, string>();
	const lineDasharrayBySeries = new Map<string, string | undefined>();
	for (const row of args.rows) {
		const seriesLabel = `${row.providerName} (${formatPricingPlanLabel(row.pricingPlan)})`;
		providerNameBySeries.set(row.seriesKey, seriesLabel);
		chartConfig[row.seriesKey] = { label: seriesLabel, color: row.color };
		rulesBySeries.set(row.seriesKey, []);
		seriesByProviderPlan.set(`${row.providerId}\u0000${row.pricingPlan}`, row.seriesKey);
		lineDasharrayBySeries.set(row.seriesKey, getPricingTierDasharray(row.pricingPlan));
	}
	for (const rule of args.historyRules) {
		const seriesKey = seriesByProviderPlan.get(`${rule.providerId}\u0000${rule.pricingPlan}`);
		if (!seriesKey) continue;
		rulesBySeries.get(seriesKey)?.push(rule);
	}

	const usageDays = Array.from(args.usageByProvider.values()).flatMap((usage) =>
		Array.from(usage.usageByDay.keys()),
	).concat(Array.from(args.observedUsageByProviderPlan.values()).flatMap((usage) =>
		Array.from(usage.usageByDay.keys()),
	));
	const timestamps = getPricingHistoryTimestamps({
		range: args.range,
		rules: args.historyRules,
		usageDays,
		nowMs: args.nowMs,
		customStartMs: args.customStartMs,
		customEndMs: args.customEndMs,
	});
	const isInputMeter = INPUT_METER_PREFERENCE.includes(
		args.meter as (typeof INPUT_METER_PREFERENCE)[number],
	);
	const isOutputMeter = OUTPUT_METER_PREFERENCE.includes(
		args.meter as (typeof OUTPUT_METER_PREFERENCE)[number],
	);
	const effectivePricePrefixes = new Map(
		args.rows.map((row) => {
			const key = `${row.providerId}\u0000${row.pricingPlan}`;
			return [key, buildEffectivePricePrefix(args.observedUsageByProviderPlan.get(key))] as const;
		}),
	);
	const chartData: PricingHistoryPoint[] = timestamps.map((timestampMs) => {
		const timestamp = new Date(timestampMs).toISOString();
		const entry: PricingHistoryPoint = { timestamp };
		for (const row of args.rows) {
			const rules = rulesBySeries.get(row.seriesKey) ?? [];
			if (args.view === "effective" && (isInputMeter || isOutputMeter)) {
				const prefix = effectivePricePrefixes.get(`${row.providerId}\u0000${row.pricingPlan}`) ?? [];
				entry[row.seriesKey] = getEffectivePriceFromPrefix(
					prefix,
					timestampMs - 29 * 86_400_000 - 12 * 60 * 60 * 1_000,
					timestampMs + 12 * 60 * 60 * 1_000,
					isInputMeter,
				);
			} else {
				const preferredListedPrice = isInputMeter
					? row.listedInputPricePer1M
					: isOutputMeter
						? row.listedOutputPricePer1M
						: null;
				entry[row.seriesKey] = getPriceForMeter(
					rules,
					[args.meter],
					timestampMs,
					preferredListedPrice,
					args.range === "7d" ? "exact" : "daily_average",
				);
			}
		}
		return entry;
	});
	const seriesKeys = args.rows.map((row) => row.seriesKey);
	return {
		chartConfig,
		chartData,
		seriesKeys,
		providerNameBySeries,
		lineDasharrayBySeries,
		hasData: chartData.some((entry) =>
			seriesKeys.some((key) => typeof entry[key] === "number" && Number.isFinite(entry[key])),
		),
	};
}

function PricingHistoryChart({
	state,
	visibleSeriesKeys,
	highlightedSeriesKey,
	range,
	expanded,
}: {
	state: ReturnType<typeof buildPricingHistoryState>;
	visibleSeriesKeys: string[];
	highlightedSeriesKey: string | null;
	range: PricingRange;
	expanded?: boolean;
}) {
	return (
		<ChartContainer
			config={state.chartConfig}
			className={cn("w-full min-w-0", expanded ? "h-[min(34vh,360px)]" : "h-[300px]")}
		>
			<LineChart data={state.chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
				<CartesianGrid vertical={false} className="stroke-muted/70" />
				<XAxis dataKey="timestamp" tickFormatter={(value) => formatTimestampLabel(String(value), range === "7d")} tickLine={false} axisLine={false} minTickGap={42} />
				<YAxis tickFormatter={(value) => formatAxisUsd(Number(value))} width={72} tickLine={false} axisLine={false} />
				<RechartsTooltip
					isAnimationActive={false}
					content={({ active, payload, label }) => {
						if (!active || !payload?.length) return null;
						const items = orderPricingHistoryTooltipItems(
							payload.filter((item) => Number.isFinite(Number(item.value))),
							visibleSeriesKeys,
							(item) => String(item.dataKey ?? ""),
						);
						if (!items.length) return null;
						const { items: visibleItems, hiddenCount } = selectPricingHistoryTooltipItems(items);
						const leadingItems = hiddenCount
							? visibleItems.slice(0, PRICING_HISTORY_TOOLTIP_EDGE_COUNT)
							: visibleItems;
						const trailingItems = hiddenCount
							? visibleItems.slice(PRICING_HISTORY_TOOLTIP_EDGE_COUNT)
							: [];
						const renderItem = (item: (typeof items)[number]) => {
							const key = String(item.dataKey ?? "");
							const color = state.chartConfig[key]?.color ?? String(item.color ?? "currentColor");
							return (
								<div key={key} className="flex items-center justify-between gap-5">
									<span className="flex min-w-0 items-center gap-2">
										<span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
										<span className="truncate">{state.providerNameBySeries.get(key) ?? key}</span>
									</span>
									<span className="shrink-0 font-medium tabular-nums">{formatUsd(Number(item.value))}</span>
								</div>
							);
						};
						return (
							<div className="min-w-48 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
								<p className="mb-2 font-medium text-foreground">{formatTimestampLabel(String(label ?? ""), true)} UTC</p>
								<div className="space-y-1.5">
									{leadingItems.map(renderItem)}
									{hiddenCount ? (
										<div className="flex items-center gap-2 py-0.5 text-[11px] text-muted-foreground" aria-label={`${hiddenCount} models omitted`}>
											<span className="h-px flex-1 border-t border-dashed border-muted-foreground/40" aria-hidden="true" />
											<span className="shrink-0">{hiddenCount}+ Models</span>
											<span className="h-px flex-1 border-t border-dashed border-muted-foreground/40" aria-hidden="true" />
										</div>
									) : null}
									{trailingItems.map(renderItem)}
								</div>
							</div>
						);
					}}
				/>
				{visibleSeriesKeys.map((seriesKey) => {
					const lineStyle = getPricingHistoryLineStyle(seriesKey, highlightedSeriesKey, visibleSeriesKeys);
					return (
						<Line
							key={seriesKey}
							type="stepAfter"
							dataKey={seriesKey}
							stroke={`var(--color-${seriesKey})`}
							strokeOpacity={lineStyle.strokeOpacity}
							strokeWidth={lineStyle.strokeWidth}
							strokeDasharray={state.lineDasharrayBySeries.get(seriesKey)}
							dot={false}
							activeDot={{ r: lineStyle.activeDotRadius }}
							connectNulls={false}
							isAnimationActive={false}
						/>
					);
				})}
			</LineChart>
		</ChartContainer>
	);
}

export default function PricingInsights({
	providers,
	plan,
	availablePlans: _availablePlans,
	onPlanChange: _onPlanChange,
	showPlanInEffectiveHeader = false,
	historyRules,
	usageRows,
	effectivePricingRows,
}: PricingInsightsProps) {
	const [sortKey, setSortKey] = useState<SortKey | null>("tokenShare");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [pricingView, setPricingView] = useState<PricingView>("effective");
	const [pricingRange, setPricingRange] = useState<PricingRange>("30d");
	const [customPricingRange, setCustomPricingRange] = useState<DateRange>();
	const [draftPricingRange, setDraftPricingRange] = useState<DateRange | undefined>(() => ({
		from: new Date(Date.now() - 30 * 86_400_000),
		to: new Date(),
	}));
	const [openCalendarSurface, setOpenCalendarSurface] = useState<"base" | "expanded" | null>(null);
	const [selectedMeter, setSelectedMeter] = useState("input_text_tokens");
	const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
	const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set());
	const [activeProviderInspectorId, setActiveProviderInspectorId] = useState<string | null>(null);
	const [seriesVisibilityOverrides, setSeriesVisibilityOverrides] = useState<Record<string, boolean>>({});
	const [highlightedSeriesKey, setHighlightedSeriesKey] = useState<string | null>(null);
	const [historyNowMs] = useState(() => Date.now());
	const customStartMs = customPricingRange?.from
		? Date.UTC(customPricingRange.from.getFullYear(), customPricingRange.from.getMonth(), customPricingRange.from.getDate())
		: undefined;
	const customEndMs = customPricingRange?.from
		? Date.UTC(
			(customPricingRange.to ?? customPricingRange.from).getFullYear(),
			(customPricingRange.to ?? customPricingRange.from).getMonth(),
			(customPricingRange.to ?? customPricingRange.from).getDate() + 1,
		) - 1
		: undefined;
	const effectivePricingViewportRef = useRef<HTMLDivElement>(null);
	const [effectivePricingTableOverflows, setEffectivePricingTableOverflows] =
		useState(false);

	useEffect(() => subscribeProviderInspector(setActiveProviderInspectorId), []);

	useLayoutEffect(() => {
		const viewport = effectivePricingViewportRef.current;
		if (!viewport) return;

		const updateOverflow = () => {
			setEffectivePricingTableOverflows(
				viewport.scrollWidth > viewport.clientWidth + 1,
			);
		};
		const observer = new ResizeObserver(updateOverflow);
		observer.observe(viewport);
		if (viewport.firstElementChild instanceof HTMLElement) {
			observer.observe(viewport.firstElementChild);
		}
		updateOverflow();

		return () => observer.disconnect();
	}, []);

	const pricingProviders = providers;
	const pricingProviderColours = useMemo(() => {
		const providerIds = pricingProviders.map((provider) => provider.provider.api_provider_id);
		const fallbackColours = assignPerceptualSeriesColours(providerIds);
		return new Map(
			pricingProviders.map((provider) => {
				const providerId = provider.provider.api_provider_id;
				const storedColour = provider.provider.colour?.trim();
				return [
					providerId,
					storedColour || fallbackColours[providerId]?.stroke || "oklch(0.58 0.19 255)",
				] as const;
			}),
		);
	}, [pricingProviders]);

	const summaryCutoffMs = useMemo(() => {
		const latestUsageDayMs = Math.max(
			...usageRows.map((row) => Date.parse(`${row.dayBucket}T12:00:00.000Z`)),
			...effectivePricingRows.map((row) => Date.parse(`${row.dayBucket}T12:00:00.000Z`)),
		);
		return Number.isFinite(latestUsageDayMs)
			? latestUsageDayMs - 29 * 86_400_000
			: Number.NEGATIVE_INFINITY;
	}, [effectivePricingRows, usageRows]);
	const usageByProvider = useMemo(() => {
		const map = new Map<string, ProviderUsageSummary>();

		for (const row of usageRows) {
			const existing = map.get(row.providerId) ?? {
				totalTokens30d: 0,
				inputWeightTokens30d: 0,
				outputWeightTokens30d: 0,
				cachedReadInputTokens30d: 0,
				usageByDay: new Map<string, DailyUsagePoint>(),
			};
			const inputTokens = row.inputTextTokens > 0 ? row.inputTextTokens : row.inputTokens;
			const outputTokens = row.outputTextTokens > 0 ? row.outputTextTokens : row.outputTokens;
			const cachedReadInputTokens = row.cachedReadTextTokens > 0
				? row.cachedReadTextTokens
				: row.cachedReadTokens;
			const isInsideSummaryWindow = Date.parse(`${row.dayBucket}T12:00:00.000Z`) >= summaryCutoffMs;
			if (isInsideSummaryWindow) {
				existing.totalTokens30d += row.totalTokens;
				existing.inputWeightTokens30d += inputTokens;
				existing.outputWeightTokens30d += outputTokens;
				existing.cachedReadInputTokens30d += Math.min(cachedReadInputTokens, inputTokens);
			}

			const day = row.dayBucket;
			if (day) {
				const dayPoint = existing.usageByDay.get(day) ?? {
					day,
					inputTokens: 0,
					outputTokens: 0,
					cachedReadTextTokens: 0,
					cachedWriteTextTokens: 0,
					cachedWriteTextTokens5m: 0,
					cachedWriteTextTokens1h: 0,
				};
				dayPoint.inputTokens += inputTokens;
				dayPoint.outputTokens += outputTokens;
				dayPoint.cachedReadTextTokens += cachedReadInputTokens;
				dayPoint.cachedWriteTextTokens +=
					row.cachedWriteTextTokens > 0
						? row.cachedWriteTextTokens
						: row.cachedWriteTokens;
				dayPoint.cachedWriteTextTokens5m += row.cachedWriteTextTokens5m;
				dayPoint.cachedWriteTextTokens1h += row.cachedWriteTextTokens1h;
				existing.usageByDay.set(day, dayPoint);
			}

			map.set(row.providerId, existing);
		}

		return map;
	}, [summaryCutoffMs, usageRows]);

	const observedUsageByProviderPlan = useMemo(() => {
		const map = new Map<string, ObservedEffectiveUsageSummary>();
		for (const row of effectivePricingRows) {
			const key = `${row.providerId}\u0000${row.pricingPlan}`;
			const existing = map.get(key) ?? {
				inputTokens30d: 0,
				outputTokens30d: 0,
				cachedReadTokens30d: 0,
				totalTokens30d: 0,
				usageByDay: new Map<string, ModelEffectivePricingDailyRow>(),
			};
			const timestampMs = Date.parse(`${row.dayBucket}T12:00:00.000Z`);
			if (timestampMs >= summaryCutoffMs) {
				existing.inputTokens30d += row.inputTokens;
				existing.outputTokens30d += row.outputTokens;
				existing.cachedReadTokens30d += Math.min(row.cachedReadTokens, row.inputTokens);
				existing.totalTokens30d += row.inputTokens + row.outputTokens;
			}
			const current = existing.usageByDay.get(row.dayBucket);
			existing.usageByDay.set(row.dayBucket, current ? {
				...row,
				inputTokens: current.inputTokens + row.inputTokens,
				outputTokens: current.outputTokens + row.outputTokens,
				cachedReadTokens: current.cachedReadTokens + row.cachedReadTokens,
				cachedWriteTokens: current.cachedWriteTokens + row.cachedWriteTokens,
				inputCostNanos: current.inputCostNanos + row.inputCostNanos,
				outputCostNanos: current.outputCostNanos + row.outputCostNanos,
				totalCostNanos: current.totalCostNanos + row.totalCostNanos,
			} : row);
			map.set(key, existing);
		}
		return map;
	}, [effectivePricingRows, summaryCutoffMs]);

	const effectiveRows = useMemo(() => {
		const providerTotalTokensAll = pricingProviders.reduce(
			(sum, provider) => sum + (usageByProvider.get(provider.provider.api_provider_id)?.totalTokens30d ?? 0),
			0,
		);
		const observedTotalTokensAll = Array.from(observedUsageByProviderPlan.values())
			.reduce((sum, usage) => sum + usage.totalTokens30d, 0);
		const useTierAwareUsage = observedTotalTokensAll > 0;

		return pricingProviders.map((provider) => {
			const providerId = provider.provider.api_provider_id;
			const providerPlans = getProviderPricingPlans(provider);
			const selectedProviderPlan = providerPlans.includes(plan)
				? plan
				: providerPlans.includes("standard")
					? "standard"
					: providerPlans[0] ?? "standard";
			const providerName = formatProviderOfferDisplayName({
				providerId,
				providerName: provider.provider.api_provider_name || providerId,
				offerLabel: provider.provider.offer_label ?? null,
				offerScope: provider.provider.offer_scope ?? null,
			});
			const logoProviderId = resolveProviderLogoId({
				providerId,
				providerFamilyId: provider.provider.provider_family_id ?? null,
			});
			const usage = usageByProvider.get(providerId);
			const observedUsage = observedUsageByProviderPlan.get(`${providerId}\u0000${selectedProviderPlan}`);
			const effectivePrices = observedUsage
				? calculateObservedEffectivePriceSummary(observedUsage.usageByDay, summaryCutoffMs)
				: null;
			const listSections = buildProviderSections(provider, selectedProviderPlan);
			const listInputPrice = buildProviderTablePriceSummary(
				listSections,
				"input",
			).primary;
			const listOutputPrice = buildProviderTablePriceSummary(
				listSections,
				"output",
			).primary;
			const listInputPricePer1M =
				listInputPrice?.unitLabel === "Per 1M tokens"
					? listInputPrice.price
					: null;
			const listOutputPricePer1M =
				listOutputPrice?.unitLabel === "Per 1M tokens"
					? listOutputPrice.price
					: null;

			return {
				providerId,
				providerName,
				logoProviderId,
				seriesKey: keyForSeries(`${providerId}:${selectedProviderPlan}`),
				color: pricingProviderColours.get(providerId) ?? "oklch(0.58 0.19 255)",
				pricingPlan: selectedProviderPlan,
				availablePlans: providerPlans,
				isExternal: normalizeGatewayStatusValue(provider.provider.status) === "external",
				effectiveUsageEligible: Boolean(observedUsage),
				inputPricePer1M:
					effectivePrices?.weightedInputPricePer1M ?? null,
				outputPricePer1M:
					effectivePrices?.weightedOutputPricePer1M ?? null,
				listedInputPricePer1M: listInputPricePer1M,
				listedOutputPricePer1M: listOutputPricePer1M,
				cacheHitRatePct: useTierAwareUsage
					? observedUsage
						? calculateCacheHitRatePct(observedUsage.cachedReadTokens30d, observedUsage.inputTokens30d)
						: null
					: usage
						? calculateCacheHitRatePct(usage.cachedReadInputTokens30d, usage.inputWeightTokens30d)
						: null,
				tokenSharePct: useTierAwareUsage
					? observedUsage
						? calculateTokenSharePct(observedUsage.totalTokens30d, observedTotalTokensAll)
						: null
					: usage
						? calculateTokenSharePct(usage.totalTokens30d, providerTotalTokensAll)
						: null,
				totalTokens30d: useTierAwareUsage
					? observedUsage?.totalTokens30d ?? 0
					: usage?.totalTokens30d ?? 0,
				inputWeightTokens30d: useTierAwareUsage
					? observedUsage?.inputTokens30d ?? 0
					: usage?.inputWeightTokens30d ?? 0,
				outputWeightTokens30d: useTierAwareUsage
					? observedUsage?.outputTokens30d ?? 0
					: usage?.outputWeightTokens30d ?? 0,
			} satisfies EffectiveRow;
		});
	}, [observedUsageByProviderPlan, plan, pricingProviderColours, pricingProviders, summaryCutoffMs, usageByProvider]);
	const providerById = useMemo(
		() => new Map(pricingProviders.map((provider) => [provider.provider.api_provider_id, provider])),
		[pricingProviders],
	);
	const providerTierRowsById = useMemo(() => {
		const rowsByProvider = new Map<string, EffectiveRow[]>();
		const observedTotalTokensAll = Array.from(observedUsageByProviderPlan.values())
			.reduce((sum, usage) => sum + usage.totalTokens30d, 0);
		for (const baseRow of effectiveRows) {
			const provider = providerById.get(baseRow.providerId);
			if (!provider) continue;
			const tierRows = baseRow.availablePlans.map((providerPlan) => {
				const observedUsage = observedUsageByProviderPlan.get(`${baseRow.providerId}\u0000${providerPlan}`);
				const effectivePrices = observedUsage
					? calculateObservedEffectivePriceSummary(observedUsage.usageByDay, summaryCutoffMs)
					: null;
				const sections = buildProviderSections(provider, providerPlan);
				const listInput = buildProviderTablePriceSummary(sections, "input").primary;
				const listOutput = buildProviderTablePriceSummary(sections, "output").primary;
				const listedInputPricePer1M = listInput?.unitLabel === "Per 1M tokens"
					? listInput.price
					: null;
				const listedOutputPricePer1M = listOutput?.unitLabel === "Per 1M tokens"
					? listOutput.price
					: null;
				return {
					...baseRow,
					seriesKey: keyForSeries(`${baseRow.providerId}:${providerPlan}`),
					color: pricingProviderColours.get(baseRow.providerId) ?? baseRow.color,
					pricingPlan: providerPlan,
					effectiveUsageEligible: Boolean(observedUsage),
					inputPricePer1M: effectivePrices?.weightedInputPricePer1M ?? null,
					outputPricePer1M: effectivePrices?.weightedOutputPricePer1M ?? null,
					listedInputPricePer1M,
					listedOutputPricePer1M,
					cacheHitRatePct: observedUsage
						? calculateCacheHitRatePct(observedUsage.cachedReadTokens30d, observedUsage.inputTokens30d)
						: null,
					totalTokens30d: observedUsage?.totalTokens30d ?? 0,
					inputWeightTokens30d: observedUsage?.inputTokens30d ?? 0,
					outputWeightTokens30d: observedUsage?.outputTokens30d ?? 0,
					tokenSharePct: observedUsage
						? calculateTokenSharePct(observedUsage.totalTokens30d, observedTotalTokensAll)
						: null,
				};
			});
			rowsByProvider.set(baseRow.providerId, tierRows);
		}
		return rowsByProvider;
	}, [effectiveRows, observedUsageByProviderPlan, pricingProviderColours, providerById, summaryCutoffMs]);

	const effectiveSummary = useMemo(() => {
		let inputCostUsd = 0;
		let pricedInputTokens = 0;
		let outputCostUsd = 0;
		let pricedOutputTokens = 0;

		for (const row of effectiveRows) {
			const observedUsage = observedUsageByProviderPlan.get(`${row.providerId}\u0000${row.pricingPlan}`);
			if (!observedUsage) continue;
			const providerEffectiveSummary = calculateObservedEffectivePriceSummary(observedUsage.usageByDay, summaryCutoffMs);
			if (providerEffectiveSummary.weightedInputPricePer1M != null) {
				inputCostUsd +=
					providerEffectiveSummary.weightedInputPricePer1M *
					(providerEffectiveSummary.pricedInputTokens / 1_000_000);
				pricedInputTokens += providerEffectiveSummary.pricedInputTokens;
			}
			if (providerEffectiveSummary.weightedOutputPricePer1M != null) {
				outputCostUsd +=
					providerEffectiveSummary.weightedOutputPricePer1M *
					(providerEffectiveSummary.pricedOutputTokens / 1_000_000);
				pricedOutputTokens += providerEffectiveSummary.pricedOutputTokens;
			}
		}

		return {
			weightedInputPricePer1M:
				pricedInputTokens > 0 ? inputCostUsd / (pricedInputTokens / 1_000_000) : null,
			weightedOutputPricePer1M:
				pricedOutputTokens > 0 ? outputCostUsd / (pricedOutputTokens / 1_000_000) : null,
			pricedInputTokens,
			pricedOutputTokens,
		};
	}, [effectiveRows, observedUsageByProviderPlan, summaryCutoffMs]);

	const sortedRows = useSortedRows(effectiveRows, sortKey, sortDirection);

	const historyRows = useMemo(
		() => sortedRows.flatMap((row) => providerTierRowsById.get(row.providerId) ?? [row]),
		[providerTierRowsById, sortedRows],
	);
	const pricingHistoryPlans = useMemo(
		() => Array.from(new Set(historyRows.map((row) => row.pricingPlan))).sort((a, b) => {
			const aRank = PRICING_PLAN_ORDER.indexOf(a);
			const bRank = PRICING_PLAN_ORDER.indexOf(b);
			if (aRank !== bRank) return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
			return a.localeCompare(b);
		}),
		[historyRows],
	);

	const meterOptions = useMemo(() => {
		const meters = new Map<string, ModelPricingHistoryRule>();
		const availableProviderPlans = new Set(
			historyRows.map((row) => `${row.providerId}\u0000${row.pricingPlan}`),
		);
		for (const rule of historyRules) {
			if (!availableProviderPlans.has(`${rule.providerId}\u0000${rule.pricingPlan}`)) continue;
			if (pricingView === "effective"
				&& !INPUT_METER_PREFERENCE.includes(rule.meter as (typeof INPUT_METER_PREFERENCE)[number])
				&& !OUTPUT_METER_PREFERENCE.includes(rule.meter as (typeof OUTPUT_METER_PREFERENCE)[number])) continue;
			if (!meters.has(rule.meter)) meters.set(rule.meter, rule);
		}
		const preferred = [
			"input_text_tokens",
			"input_tokens",
			"output_text_tokens",
			"output_tokens",
			"cached_read_text_tokens",
			"cached_write_text_tokens",
		];
		return Array.from(meters.values()).sort((a, b) => {
			const aRank = preferred.indexOf(a.meter);
			const bRank = preferred.indexOf(b.meter);
			if (aRank !== bRank) return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
			return a.meter.localeCompare(b.meter);
		});
	}, [historyRows, historyRules, pricingView]);
	const activeMeter = meterOptions.some((option) => option.meter === selectedMeter)
		? selectedMeter
		: meterOptions[0]?.meter ?? "input_text_tokens";
	const activeMeterRule = meterOptions.find((option) => option.meter === activeMeter);
	const effectivePricingHistoryState = useMemo(() => buildPricingHistoryState({
			rows: historyRows,
			usageByProvider,
			observedUsageByProviderPlan,
			historyRules,
			view: "effective",
			meter: activeMeter,
			range: pricingRange,
			nowMs: historyNowMs,
			customStartMs,
			customEndMs,
		}), [activeMeter, customEndMs, customStartMs, historyNowMs, historyRows, historyRules, observedUsageByProviderPlan, pricingRange, usageByProvider]);
	const hasEffectivePricing = effectivePricingHistoryState.hasData;
	const displayedPricingView: PricingView = pricingView === "effective" && !hasEffectivePricing
		? "listed"
		: pricingView;
	const listedPricingHistoryState = useMemo(() => displayedPricingView === "listed"
		? buildPricingHistoryState({
			rows: historyRows,
			usageByProvider,
			observedUsageByProviderPlan,
			historyRules,
			view: "listed",
			meter: activeMeter,
			range: pricingRange,
			nowMs: historyNowMs,
			customStartMs,
			customEndMs,
		})
		: null, [activeMeter, customEndMs, customStartMs, displayedPricingView, historyNowMs, historyRows, historyRules, observedUsageByProviderPlan, pricingRange, usageByProvider]);
	const pricingHistoryState = displayedPricingView === "effective"
		? effectivePricingHistoryState
		: listedPricingHistoryState!;
	const historyRowBySeries = useMemo(
		() => new Map(historyRows.map((row) => [row.seriesKey, row])),
		[historyRows],
	);
	const isSeriesVisible = (row: EffectiveRow) =>
		seriesVisibilityOverrides[row.seriesKey]
		?? (row.pricingPlan === "standard" || (!row.availablePlans.includes("standard") && row.pricingPlan === row.availablePlans[0]));
	const visibleSeriesKeys = pricingHistoryState.seriesKeys.filter((seriesKey) => {
		const row = historyRowBySeries.get(seriesKey);
		return row ? isSeriesVisible(row) : false;
	});

	const exportPricingHistory = () => {
		const exportSeriesKeys = visibleSeriesKeys.length > 0
			? visibleSeriesKeys
			: pricingHistoryState.seriesKeys;
		const csv = pricingHistoryToCsv({
			points: pricingHistoryState.chartData,
			series: exportSeriesKeys.map((key) => ({
				key,
				providerName: pricingHistoryState.providerNameBySeries.get(key) ?? key,
			})),
		});
		const url = URL.createObjectURL(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `pricing-history-${displayedPricingView}-${activeMeter}-${pricingRange}.csv`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 0);
	};

	const toggleSeries = (row: EffectiveRow) => {
		setSeriesVisibilityOverrides((current) => ({
			...current,
			[row.seriesKey]: !(current[row.seriesKey]
				?? (row.pricingPlan === "standard" || (!row.availablePlans.includes("standard") && row.pricingPlan === row.availablePlans[0]))),
		}));
	};
	const toggleProviderExpanded = (providerId: string) => {
		setExpandedProviders((current) => {
			const next = new Set(current);
			if (next.has(providerId)) next.delete(providerId);
			else next.add(providerId);
			return next;
		});
	};
	const openProviderSheet = (providerId: string) => {
		const navigationProviderIds = sortedRows.map((row) => row.providerId);
		if (isHistoryExpanded) {
			setIsHistoryExpanded(false);
			window.requestAnimationFrame(() =>
				dispatchProviderInspectorOpen(providerId, false, navigationProviderIds),
			);
			return;
		}
		dispatchProviderInspectorOpen(providerId, false, navigationProviderIds);
	};
	const handleProviderRowClick = (
		event: MouseEvent<HTMLTableRowElement>,
		providerId: string,
	) => {
		if ((event.target as HTMLElement).closest("a, button, input, select, textarea, [role='button']")) return;
		openProviderSheet(providerId);
	};
	const handleProviderRowKeyDown = (
		event: KeyboardEvent<HTMLTableRowElement>,
		providerId: string,
	) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		if ((event.target as HTMLElement).closest("a, button, input, select, textarea, [role='button']")) return;
		event.preventDefault();
		openProviderSheet(providerId);
	};

	const handleSortToggle = (nextKey: SortKey) => {
		const defaultDirection = getDefaultDirection(nextKey);
		const oppositeDirection: SortDirection =
			defaultDirection === "asc" ? "desc" : "asc";

		if (sortKey !== nextKey) {
			setSortKey(nextKey);
			setSortDirection(defaultDirection);
			return;
		}

		if (sortDirection === defaultDirection) {
			setSortDirection(oppositeDirection);
			return;
		}

		setSortKey(null);
		setSortDirection("desc");
	};

	const meterUnitLabel = activeMeterRule
		? activeMeterRule.unit === "token" && activeMeterRule.unitSize === 1_000_000
			? "USD per 1M tokens"
			: `USD per ${activeMeterRule.unitSize.toLocaleString()} ${activeMeterRule.unit}${activeMeterRule.unitSize === 1 ? "" : "s"}`
		: "USD";
	const renderPricingHistory = (expanded = false) => (
		<div className={cn("min-w-0", expanded ? "space-y-5" : "space-y-4 p-4 sm:p-5")}>
			<div className="space-y-3">
				<div className="space-y-1">
					<div className="flex items-center gap-1.5">
						<h3 className="text-sm font-semibold text-foreground">Price history</h3>
						<Tooltip delayDuration={120}>
							<TooltipTrigger asChild>
								<button type="button" className="rounded-full text-muted-foreground hover:text-foreground" aria-label="About effective and list pricing">
									<Info className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent className="max-w-72">
								Effective pricing is the rolling 30-day price observed after prompt caching. List pricing shows the published meter rate.
							</TooltipContent>
						</Tooltip>
					</div>
					<p className="text-xs text-muted-foreground">{meterUnitLabel} · 30-day rolling effective prices · exact UTC list changes</p>
				</div>

				<div className="flex w-full flex-wrap items-center gap-2">
					<div className="inline-flex h-8 rounded-md border bg-background p-0.5" aria-label="Pricing view">
						{(["effective", "listed"] as const).map((view) => (
							<button
								key={view}
								type="button"
								onClick={() => setPricingView(view)}
								disabled={view === "effective" && !hasEffectivePricing}
								className={cn("rounded-[5px] px-2.5 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40", displayedPricingView === view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
							>
								{view === "listed" ? "List" : "Effective"}
							</button>
						))}
					</div>
					<Select value={activeMeter} onValueChange={setSelectedMeter}>
						<SelectTrigger
							id={expanded ? "expanded-pricing-meter" : "pricing-meter"}
							size="default"
							className="h-8 w-fit max-w-full rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted/40"
							aria-label="Pricing meter"
						>
							<SelectValue>{formatMeterLabel(activeMeter)}</SelectValue>
						</SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false} className="w-max min-w-0 max-w-[calc(100vw-2rem)] rounded-lg">
							{meterOptions.map((option) => (
								<SelectItem key={option.meter} value={option.meter} className="rounded-md text-xs">
									{formatMeterLabel(option.meter)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="ml-auto flex flex-wrap items-center gap-1.5">
						<div className="inline-flex h-8 rounded-md border bg-background p-0.5" aria-label="History range">
							{RANGE_LABELS.map((range) => (
								<button
									key={range.value}
									type="button"
									onClick={() => {
										setCustomPricingRange(undefined);
										setPricingRange(range.value);
									}}
									className={cn("rounded-[5px] px-2 text-xs font-medium transition-colors", !customPricingRange && pricingRange === range.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
								>
									{range.label}
								</button>
							))}
						</div>
						<Popover
							open={openCalendarSurface === (expanded ? "expanded" : "base")}
							onOpenChange={(open) => setOpenCalendarSurface(open ? (expanded ? "expanded" : "base") : null)}
						>
							<PopoverTrigger asChild>
								<Button type="button" variant="outline" size="icon" className={cn("size-8 rounded-md", customPricingRange && "bg-muted text-foreground")} aria-label="Choose custom pricing history range">
									<CalendarDays className="size-3.5" />
								</Button>
							</PopoverTrigger>
							<PopoverContent align="end" className="w-auto gap-0 rounded-xl p-0">
								<Calendar mode="range" numberOfMonths={2} selected={draftPricingRange} onSelect={setDraftPricingRange} defaultMonth={draftPricingRange?.from} disabled={{ after: new Date(historyNowMs) }} className="rounded-xl" />
								<div className="flex items-center justify-end gap-2 border-t px-3 py-2.5">
									<Button type="button" variant="ghost" size="sm" onClick={() => setOpenCalendarSurface(null)}>Cancel</Button>
									<Button type="button" size="sm" disabled={!draftPricingRange?.from} onClick={() => {
										if (!draftPricingRange?.from) return;
										setCustomPricingRange({ from: draftPricingRange.from, to: draftPricingRange.to ?? draftPricingRange.from });
										setOpenCalendarSurface(null);
									}}>Apply</Button>
								</div>
							</PopoverContent>
						</Popover>
						{expanded ? <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-md px-2.5 text-xs" onClick={exportPricingHistory} disabled={!pricingHistoryState.hasData} aria-label="Export visible pricing history as CSV">
							<Download className="size-3.5" />
							CSV
						</Button> : null}
						{!expanded ? (
							<Button type="button" variant="outline" size="icon" className="size-8 rounded-md" onClick={() => setIsHistoryExpanded(true)} aria-label="Expand pricing history">
								<Maximize2 className="size-3.5" />
							</Button>
						) : null}
					</div>
				</div>
			</div>

			<div className="overflow-hidden rounded-lg border bg-background p-2 sm:p-3">
			{pricingHistoryState.hasData ? (
				<PricingHistoryChart state={pricingHistoryState} visibleSeriesKeys={visibleSeriesKeys} highlightedSeriesKey={highlightedSeriesKey} range={pricingRange} expanded={expanded} />
			) : (
				<div className={cn("grid place-items-center text-center text-sm text-muted-foreground", expanded ? "h-[min(42vh,460px)]" : "h-[300px]")}>
					<div className="max-w-sm space-y-1 px-6">
						<p className="font-medium text-foreground">No pricing points in this range</p>
						<p>Try List pricing, another meter, or a wider time range.</p>
					</div>
				</div>
			)}
			{pricingHistoryState.hasData ? <PricingTierLegend plans={pricingHistoryPlans} /> : null}
			</div>
		</div>
	);

	return (
		<section className="space-y-4">
			{showPlanInEffectiveHeader ? (
				<div className="space-y-1">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">Pricing</h2>
						<p className="text-xs text-muted-foreground">
							List prices are current provider rates. Effective prices are weighted
							by observed gateway traffic over the last 30 days. Summary values
							average time-windowed schedules; one-week history shows each UTC change.
						</p>
					</div>
				</div>
			) : null}

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<h3 className="text-sm font-medium text-foreground">Effective pricing</h3>
					<p className="text-xs text-muted-foreground">
						Weighted by observed usage over the last 30 days. Every provider with recorded pricing is included.
					</p>
				</div>
			</div>

			<div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-background shadow-sm dark:border-zinc-800">
				<div className="grid grid-cols-1 divide-y divide-border/60 border-b border-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
					<div className="px-4 py-3">
						<p className="text-xs text-muted-foreground">Weighted input price</p>
						<p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
							{formatUsd(effectiveSummary.weightedInputPricePer1M)}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">Per 1M tokens</p>
					</div>
					<div className="px-4 py-3">
						<p className="text-xs text-muted-foreground">Weighted output price</p>
						<p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
							{formatUsd(effectiveSummary.weightedOutputPricePer1M)}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">Per 1M tokens</p>
					</div>
				</div>

				{renderPricingHistory()}

				<div className="mx-4 mb-4 overflow-hidden rounded-lg border bg-background sm:mx-5 sm:mb-5">
				<ScrollArea
					className={cn(
						"w-full",
						effectivePricingTableOverflows
							? "[&_[data-orientation=horizontal]]:h-2 [&_[data-orientation=horizontal]]:border-t-0 [&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-400/70 [&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:transition-colors hover:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-500/80 dark:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-500/80 dark:hover:[&_[data-orientation=horizontal]_[data-slot=scroll-area-thumb]]:bg-zinc-400/90"
							: "[&_[data-orientation=horizontal]]:hidden",
					)}
					scrollBarOrientation="horizontal"
					viewportClassName={
						effectivePricingTableOverflows ? "pb-1.5" : undefined
					}
					viewportRef={effectivePricingViewportRef}
				>
					<Table className="min-w-[1040px]" wrapInContainer={false}>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="h-8 w-[28%] px-3">
									<SortHead
										label="Provider"
										sortKey="provider"
										activeSortKey={sortKey}
										direction={sortDirection}
										align="left"
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-left">
									<SortHead
										label="Effective in /M"
										sortKey="input"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-left">
									<SortHead
										label="Effective out /M"
										sortKey="output"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-left">
									<SortHead label="List in /M" sortKey="listedInput" activeSortKey={sortKey} direction={sortDirection} onToggle={handleSortToggle} />
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-left">
									<SortHead label="List out /M" sortKey="listedOutput" activeSortKey={sortKey} direction={sortDirection} onToggle={handleSortToggle} />
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-left">
									<SortHead
										label="Cache hit rate"
										sortKey="cacheHitRate"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-left">
									<SortHead
										label="Token Share"
										sortKey="tokenShare"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedRows.map((row) => {
								const additionalTierRows = (providerTierRowsById.get(row.providerId) ?? [])
									.filter((tierRow) => tierRow.pricingPlan !== row.pricingPlan);
								const isExpanded = expandedProviders.has(row.providerId);
								const isMainSeriesVisible = isSeriesVisible(row);

								return (
								<Fragment key={row.providerId}>
								<TableRow
									tabIndex={0}
									aria-label={`Open ${row.providerName} provider details`}
									onMouseEnter={() => setHighlightedSeriesKey(row.seriesKey)}
									onMouseLeave={() => setHighlightedSeriesKey(null)}
									onFocus={() => setHighlightedSeriesKey(row.seriesKey)}
									onBlur={(event) => {
										if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedSeriesKey(null);
									}}
									onClick={(event) => handleProviderRowClick(event, row.providerId)}
									onKeyDown={(event) => handleProviderRowKeyDown(event, row.providerId)}
									className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
								>
									<TableCell className="relative px-3 py-1.5">
										{activeProviderInspectorId === row.providerId ? (
											<span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
										) : null}
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													toggleSeries(row);
												}}
												aria-pressed={isMainSeriesVisible}
												aria-label={`${isMainSeriesVisible ? "Hide" : "Show"} ${row.providerName} ${row.pricingPlan} price line`}
												className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none", !isMainSeriesVisible && "opacity-35")}
											>
												<PricingLineTypeIcon plan={row.pricingPlan} color={row.color} />
											</button>
										<Link
											href={`/api-providers/${row.providerId}`}
											onClick={(event) => {
												event.preventDefault();
												openProviderSheet(row.providerId);
											}}
											className="group/provider inline-flex items-center gap-2.5 whitespace-nowrap"
										>
											<span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors group-hover/provider:border-zinc-300 dark:border-zinc-800 dark:group-hover/provider:border-zinc-700">
												<span className="relative h-3.5 w-3.5">
													<Logo
														id={row.logoProviderId}
														alt={`${row.providerName} logo`}
														className="object-contain"
														fill
														sizes="14px"
													/>
												</span>
											</span>
											<span className="font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] group-hover/provider:decoration-current">
																{row.providerName}
															</span>
														</Link>
										{row.isExternal ? <ExternalProviderBadge /> : null}
										{additionalTierRows.length > 0 ? <Button
											type="button"
											variant="ghost"
											size="icon"
																		onClick={(event) => {
																			event.stopPropagation();
																			toggleProviderExpanded(row.providerId);
																		}}
											aria-expanded={isExpanded}
											aria-label={`${isExpanded ? "Collapse" : "Expand"} ${row.providerName} service tiers`}
											className="size-7 shrink-0 rounded-md text-muted-foreground aria-expanded:!bg-transparent aria-expanded:text-muted-foreground hover:text-foreground hover:aria-expanded:!bg-transparent"
										>
											<ChevronDown className={cn("size-3.5 transition-transform", !isExpanded && "-rotate-90")} />
										</Button> : null}
										</div>
									</TableCell>
									<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">
										{formatUsd(row.inputPricePer1M)}
									</TableCell>
									<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">
										{formatUsd(row.outputPricePer1M)}
									</TableCell>
									<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">
										{formatUsd(row.listedInputPricePer1M)}
									</TableCell>
									<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">
										{formatUsd(row.listedOutputPricePer1M)}
									</TableCell>
									<TableCell className="px-3 py-1.5 text-left tabular-nums">
										<div className="font-medium text-foreground">
											{formatPercent(row.cacheHitRatePct)}
										</div>
									</TableCell>
									<TableCell className="px-3 py-1.5 text-left tabular-nums">
										<Tooltip delayDuration={120}>
											<TooltipTrigger asChild>
												<button
													type="button"
												className="flex items-center justify-start gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
													aria-label={`Token share ${formatPercent(row.tokenSharePct)} from ${formatTokenCount(row.totalTokens30d)}`}
												>
													<div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
														<div
															className="h-full rounded-full bg-primary"
															style={{
																width: `${Math.max(0, Math.min(100, row.tokenSharePct ?? 0))}%`,
															}}
														/>
													</div>
													<div className="w-12 font-medium text-foreground">
														{formatPercent(row.tokenSharePct)}
													</div>
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" align="end">
												{formatTokenCount(row.totalTokens30d)}
											</TooltipContent>
										</Tooltip>
									</TableCell>
								</TableRow>
								{isExpanded ? additionalTierRows.map((tierRow) => {
									const isTierVisible = isSeriesVisible(tierRow);

									return (
										<TableRow
											key={`${row.providerId}-${tierRow.pricingPlan}`}
											tabIndex={0}
											aria-label={`Open ${row.providerName} provider details`}
											onMouseEnter={() => setHighlightedSeriesKey(tierRow.seriesKey)}
											onMouseLeave={() => setHighlightedSeriesKey(null)}
											onFocus={() => setHighlightedSeriesKey(tierRow.seriesKey)}
											onBlur={(event) => {
												if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedSeriesKey(null);
											}}
											onClick={(event) => handleProviderRowClick(event, row.providerId)}
											onKeyDown={(event) => handleProviderRowKeyDown(event, row.providerId)}
											className="cursor-pointer bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
										>
						<TableCell className="px-3 py-1.5">
							<div className="flex items-center gap-2">
								<button type="button" onClick={(event) => { event.stopPropagation(); toggleSeries(tierRow); }} aria-pressed={isTierVisible} aria-label={`${isTierVisible ? "Hide" : "Show"} ${row.providerName} ${tierRow.pricingPlan} price line`} className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none", !isTierVisible && "opacity-45")}>
									<PricingLineTypeIcon plan={tierRow.pricingPlan} color={tierRow.color} />
								</button>
								<PricingTierLabel providerName={row.providerName} plan={tierRow.pricingPlan} />
							</div>
						</TableCell>
										<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">{formatUsd(tierRow.inputPricePer1M)}</TableCell>
										<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">{formatUsd(tierRow.outputPricePer1M)}</TableCell>
										<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">{formatUsd(tierRow.listedInputPricePer1M)}</TableCell>
										<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">{formatUsd(tierRow.listedOutputPricePer1M)}</TableCell>
										<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">{formatPercent(tierRow.cacheHitRatePct)}</TableCell>
										<TableCell className="px-3 py-1.5 text-left font-medium tabular-nums text-foreground">{formatPercent(tierRow.tokenSharePct)}</TableCell>
										</TableRow>
									);
								}) : null}
								</Fragment>
								);
							})}
						</TableBody>
					</Table>
				</ScrollArea>
				</div>
			</div>

			<Dialog open={isHistoryExpanded} onOpenChange={(open) => {
				setIsHistoryExpanded(open);
				if (!open) {
					setOpenCalendarSurface(null);
					setHighlightedSeriesKey(null);
				}
			}}>
				<DialogContent className="flex h-[88dvh] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl p-0 sm:h-[84dvh] sm:max-w-[84vw]">
					<DialogHeader className="sr-only">
						<DialogTitle>Price history</DialogTitle>
						<DialogDescription>Expanded provider pricing history chart and export controls.</DialogDescription>
					</DialogHeader>
					<ScrollArea className="min-h-0 flex-1" scrollBarOrientation="vertical" viewportClassName="p-5 sm:p-6">
						<div className="space-y-4">
						{renderPricingHistory(true)}
						<div className="overflow-hidden rounded-lg border bg-background">
							<ScrollArea className="w-full" scrollBarOrientation="horizontal">
							<Table className="min-w-[680px]" wrapInContainer={false}>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead><SortHead label="Provider" sortKey="provider" activeSortKey={sortKey} direction={sortDirection} align="left" onToggle={handleSortToggle} /></TableHead>
										<TableHead className="text-left"><SortHead label="Effective in /M" sortKey="input" activeSortKey={sortKey} direction={sortDirection} onToggle={handleSortToggle} /></TableHead>
										<TableHead className="text-left"><SortHead label="Effective out /M" sortKey="output" activeSortKey={sortKey} direction={sortDirection} onToggle={handleSortToggle} /></TableHead>
										<TableHead className="text-left"><SortHead label="List in /M" sortKey="listedInput" activeSortKey={sortKey} direction={sortDirection} onToggle={handleSortToggle} /></TableHead>
										<TableHead className="text-left"><SortHead label="List out /M" sortKey="listedOutput" activeSortKey={sortKey} direction={sortDirection} onToggle={handleSortToggle} /></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedRows.map((row) => {
										const additionalTierRows = (providerTierRowsById.get(row.providerId) ?? [])
											.filter((tierRow) => tierRow.pricingPlan !== row.pricingPlan);
										const isExpanded = expandedProviders.has(row.providerId);
										const isMainSeriesVisible = isSeriesVisible(row);

										return (
										<Fragment key={`expanded-${row.providerId}`}>
										<TableRow
											tabIndex={0}
											aria-label={`Open ${row.providerName} provider details`}
											onMouseEnter={() => setHighlightedSeriesKey(row.seriesKey)}
											onMouseLeave={() => setHighlightedSeriesKey(null)}
											onFocus={() => setHighlightedSeriesKey(row.seriesKey)}
											onBlur={(event) => {
												if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedSeriesKey(null);
											}}
											onClick={(event) => handleProviderRowClick(event, row.providerId)}
											onKeyDown={(event) => handleProviderRowKeyDown(event, row.providerId)}
											className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
										>
											<TableCell className="relative">
												{activeProviderInspectorId === row.providerId ? (
													<span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
												) : null}
												<span className="inline-flex items-center gap-2 font-medium">
							<button type="button" onClick={(event) => { event.stopPropagation(); toggleSeries(row); }} aria-pressed={isMainSeriesVisible} aria-label={`${isMainSeriesVisible ? "Hide" : "Show"} ${row.providerName} ${row.pricingPlan} price line`} className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none", !isMainSeriesVisible && "opacity-35")}>
								<PricingLineTypeIcon plan={row.pricingPlan} color={row.color} />
											</button>
											<span className="inline-flex items-center gap-2.5">
												<span className="relative flex size-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background dark:border-zinc-800">
													<span className="relative size-3.5">
														<Logo id={row.logoProviderId} alt={`${row.providerName} logo`} className="object-contain" fill sizes="14px" />
													</span>
												</span>
												{row.providerName}
											</span>
											{row.isExternal ? <ExternalProviderBadge /> : null}
							{additionalTierRows.length > 0 ? <Button type="button" variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); toggleProviderExpanded(row.providerId); }} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${row.providerName} service tiers`} className="size-7 shrink-0 rounded-md text-muted-foreground aria-expanded:!bg-transparent aria-expanded:text-muted-foreground hover:text-foreground hover:aria-expanded:!bg-transparent">
														<ChevronDown className={cn("size-3.5 transition-transform", !isExpanded && "-rotate-90")} />
													</Button> : null}
												</span>
											</TableCell>
											<TableCell className="text-left font-medium tabular-nums">{formatUsd(row.inputPricePer1M)}</TableCell>
											<TableCell className="text-left font-medium tabular-nums">{formatUsd(row.outputPricePer1M)}</TableCell>
											<TableCell className="text-left font-medium tabular-nums">{formatUsd(row.listedInputPricePer1M)}</TableCell>
											<TableCell className="text-left font-medium tabular-nums">{formatUsd(row.listedOutputPricePer1M)}</TableCell>
										</TableRow>
										{isExpanded ? additionalTierRows.map((tierRow) => {
											const isTierVisible = isSeriesVisible(tierRow);

											return (
												<TableRow
													key={`expanded-${row.providerId}-${tierRow.pricingPlan}`}
													tabIndex={0}
													aria-label={`Open ${row.providerName} provider details`}
													onMouseEnter={() => setHighlightedSeriesKey(tierRow.seriesKey)}
													onMouseLeave={() => setHighlightedSeriesKey(null)}
													onFocus={() => setHighlightedSeriesKey(tierRow.seriesKey)}
													onBlur={(event) => {
														if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedSeriesKey(null);
													}}
													onClick={(event) => handleProviderRowClick(event, row.providerId)}
													onKeyDown={(event) => handleProviderRowKeyDown(event, row.providerId)}
													className="cursor-pointer bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
												>
							<TableCell>
								<div className="flex items-center gap-2">
									<button type="button" onClick={(event) => { event.stopPropagation(); toggleSeries(tierRow); }} aria-pressed={isTierVisible} aria-label={`${isTierVisible ? "Hide" : "Show"} ${row.providerName} ${tierRow.pricingPlan} price line`} className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none", !isTierVisible && "opacity-45")}>
										<PricingLineTypeIcon plan={tierRow.pricingPlan} color={tierRow.color} />
									</button>
									<PricingTierLabel providerName={row.providerName} plan={tierRow.pricingPlan} />
								</div>
							</TableCell>
												<TableCell className="text-left font-medium tabular-nums">{formatUsd(tierRow.inputPricePer1M)}</TableCell>
												<TableCell className="text-left font-medium tabular-nums">{formatUsd(tierRow.outputPricePer1M)}</TableCell>
												<TableCell className="text-left font-medium tabular-nums">{formatUsd(tierRow.listedInputPricePer1M)}</TableCell>
												<TableCell className="text-left font-medium tabular-nums">{formatUsd(tierRow.listedOutputPricePer1M)}</TableCell>
												</TableRow>
											);
										}) : null}
										</Fragment>
										);
									})}
								</TableBody>
							</Table>
							</ScrollArea>
						</div>
						</div>
					</ScrollArea>
				</DialogContent>
			</Dialog>
		</section>
	);
}
