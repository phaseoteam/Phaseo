"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
	CartesianGrid,
	Line,
	LineChart,
	Tooltip as RechartsTooltip,
	XAxis,
	YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
	ChartContainer,
	type ChartConfig,
} from "@/components/ui/chart";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";
import {
	buildProviderSections,
	buildProviderTablePriceSummary,
	fmtUSD,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { assignSeriesColours, keyForSeries } from "@/components/(rankings)/chart-colors";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import {
	formatProviderOfferDisplayName,
	resolveProviderLogoId,
} from "@/lib/providers/providerOffers";
import { cn } from "@/lib/utils";
import {
	resolveGatewayStatus,
	type CanonicalGatewayStatus,
} from "@/components/(data)/model/pricing/providerGatewayStatus";

type PricingInsightsProps = {
	providers: ProviderPricing[];
	plan: string;
	availablePlans: string[];
	onPlanChange?: (plan: string) => void;
	showPlanInEffectiveHeader?: boolean;
	historyRules: ModelPricingHistoryRule[];
	usageRows: ModelUsageDailyBreakdownRow[];
};

type SortKey = "provider" | "input" | "output" | "cacheHitRate" | "tokenShare";
type SortDirection = "asc" | "desc";

type EffectiveRow = {
	providerId: string;
	providerName: string;
	logoProviderId: string;
	seriesKey: string;
	color: string;
	inputPricePer1M: number | null;
	outputPricePer1M: number | null;
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

const ROUTABLE_STATUSES = new Set<CanonicalGatewayStatus>([
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
]);

function isRoutableProvider(provider: ProviderPricing): boolean {
	return provider.provider_models.some((providerModel) =>
		ROUTABLE_STATUSES.has(
			resolveGatewayStatus({
				isActiveGateway: providerModel.is_active_gateway,
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

const INPUT_METER_PREFERENCE = ["input_text_tokens", "input_tokens"] as const;
const OUTPUT_METER_PREFERENCE = ["output_text_tokens", "output_tokens"] as const;
const CACHED_READ_TEXT_METER_PREFERENCE = [
	"cached_read_text_tokens",
	"cached_read_tokens",
	"implicit_cached_input_text_tokens",
] as const;
const CACHED_WRITE_TEXT_METER_PREFERENCE = [
	"cached_write_text_tokens",
	"cached_write_tokens",
] as const;
const CACHED_WRITE_TEXT_5M_METER_PREFERENCE = [
	"cached_write_text_tokens_5m",
	"cached_write_text_tokens",
	"cached_write_tokens",
] as const;
const CACHED_WRITE_TEXT_1H_METER_PREFERENCE = [
	"cached_write_text_tokens_1h",
	"cached_write_text_tokens",
	"cached_write_tokens",
] as const;

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

function formatDayLabel(day: string): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime())) return day;
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
	});
}

function buildDayBuckets(days: number): string[] {
	const buckets: string[] = [];
	const anchor = new Date();
	anchor.setUTCHours(0, 0, 0, 0);
	for (let offset = days - 1; offset >= 0; offset -= 1) {
		const day = new Date(anchor);
		day.setUTCDate(anchor.getUTCDate() - offset);
		buckets.push(day.toISOString().slice(0, 10));
	}
	return buckets;
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
			return "asc";
		case "cacheHitRate":
		case "tokenShare":
			return "desc";
	}
}

function useSortedRows(rows: EffectiveRow[], sortKey: SortKey | null, direction: SortDirection) {
	return useMemo(() => {
		if (!sortKey) {
			return [...rows].sort((a, b) => {
				if ((a.tokenSharePct ?? -1) !== (b.tokenSharePct ?? -1)) {
					return (b.tokenSharePct ?? -1) - (a.tokenSharePct ?? -1);
				}
				return a.providerName.localeCompare(b.providerName);
			});
		}

		return [...rows].sort((a, b) => {
			const sortableValue = (row: EffectiveRow): number | null => {
				switch (sortKey) {
					case "input":
						return row.inputPricePer1M;
					case "output":
						return row.outputPricePer1M;
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
				case "cacheHitRate":
					result = compareNumber(a.cacheHitRatePct, b.cacheHitRatePct);
					break;
				case "tokenShare":
					result = compareNumber(a.tokenSharePct, b.tokenSharePct);
					break;
			}

			if (result === 0) return a.providerName.localeCompare(b.providerName);
			return direction === "asc" ? result : -result;
		});
	}, [direction, rows, sortKey]);
}

function SortHead({
	label,
	sortKey,
	activeSortKey,
	direction,
	align = "right",
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
): number | null {
	return chooseRuleForTimestamp(rules, meterPreference, timestampMs)?.pricePer1MUnits ?? null;
}

function calculateEffectiveInputPricePer1M(args: {
	usage: DailyUsagePoint;
	rules: ModelPricingHistoryRule[];
	timestampMs: number;
}): number | null {
	const inputTokens = args.usage.inputTokens;
	if (inputTokens <= 0) return null;

	const inputPrice = getPriceForMeter(
		args.rules,
		INPUT_METER_PREFERENCE,
		args.timestampMs,
	);
	const cachedReadPrice =
		getPriceForMeter(
			args.rules,
			CACHED_READ_TEXT_METER_PREFERENCE,
			args.timestampMs,
		) ?? inputPrice;
	const cachedWritePrice =
		getPriceForMeter(
			args.rules,
			CACHED_WRITE_TEXT_METER_PREFERENCE,
			args.timestampMs,
		) ?? inputPrice;
	const cachedWrite5mPrice =
		getPriceForMeter(
			args.rules,
			CACHED_WRITE_TEXT_5M_METER_PREFERENCE,
			args.timestampMs,
		) ?? cachedWritePrice;
	const cachedWrite1hPrice =
		getPriceForMeter(
			args.rules,
			CACHED_WRITE_TEXT_1H_METER_PREFERENCE,
			args.timestampMs,
		) ?? cachedWritePrice;

	const cachedReadTokens = Math.min(
		args.usage.cachedReadTextTokens,
		inputTokens,
	);
	const specificCachedWriteTokens =
		args.usage.cachedWriteTextTokens5m + args.usage.cachedWriteTextTokens1h;
	const genericCachedWriteTokens =
		specificCachedWriteTokens > 0 ? 0 : args.usage.cachedWriteTextTokens;
	const meteredCacheTokens =
		cachedReadTokens + specificCachedWriteTokens + genericCachedWriteTokens;
	const uncachedInputTokens = Math.max(0, inputTokens - meteredCacheTokens);

	if (uncachedInputTokens > 0 && inputPrice == null) return null;
	if (cachedReadTokens > 0 && cachedReadPrice == null) return null;
	if (genericCachedWriteTokens > 0 && cachedWritePrice == null) return null;
	if (args.usage.cachedWriteTextTokens5m > 0 && cachedWrite5mPrice == null) return null;
	if (args.usage.cachedWriteTextTokens1h > 0 && cachedWrite1hPrice == null) return null;

	const costUsd =
		(uncachedInputTokens / 1_000_000) * (inputPrice ?? 0) +
		(cachedReadTokens / 1_000_000) * (cachedReadPrice ?? 0) +
		(genericCachedWriteTokens / 1_000_000) * (cachedWritePrice ?? 0) +
		(args.usage.cachedWriteTextTokens5m / 1_000_000) * (cachedWrite5mPrice ?? 0) +
		(args.usage.cachedWriteTextTokens1h / 1_000_000) * (cachedWrite1hPrice ?? 0);

	return (costUsd / inputTokens) * 1_000_000;
}

function calculateEffectiveOutputPricePer1M(args: {
	usage: DailyUsagePoint;
	rules: ModelPricingHistoryRule[];
	timestampMs: number;
}): number | null {
	const outputTokens = args.usage.outputTokens;
	if (outputTokens <= 0) return null;
	const outputPrice = getPriceForMeter(
		args.rules,
		OUTPUT_METER_PREFERENCE,
		args.timestampMs,
	);
	return outputPrice == null ? null : outputPrice;
}

function calculateEffectivePriceSummaryForUsage(
	usage: ProviderUsageSummary,
	rules: ModelPricingHistoryRule[],
): {
	weightedInputPricePer1M: number | null;
	weightedOutputPricePer1M: number | null;
	pricedInputTokens: number;
	pricedOutputTokens: number;
} {
	let inputCostUsd = 0;
	let pricedInputTokens = 0;
	let outputCostUsd = 0;
	let pricedOutputTokens = 0;

	for (const point of usage.usageByDay.values()) {
		const timestampMs = Date.parse(`${point.day}T12:00:00.000Z`);
		const inputEffectivePrice = calculateEffectiveInputPricePer1M({
			usage: point,
			rules,
			timestampMs,
		});
		if (inputEffectivePrice != null && point.inputTokens > 0) {
			inputCostUsd += inputEffectivePrice * (point.inputTokens / 1_000_000);
			pricedInputTokens += point.inputTokens;
		}

		const outputEffectivePrice = calculateEffectiveOutputPricePer1M({
			usage: point,
			rules,
			timestampMs,
		});
		if (outputEffectivePrice != null && point.outputTokens > 0) {
			outputCostUsd += outputEffectivePrice * (point.outputTokens / 1_000_000);
			pricedOutputTokens += point.outputTokens;
		}
	}

	return {
		weightedInputPricePer1M:
			pricedInputTokens > 0
				? inputCostUsd / (pricedInputTokens / 1_000_000)
				: null,
		weightedOutputPricePer1M:
			pricedOutputTokens > 0
				? outputCostUsd / (pricedOutputTokens / 1_000_000)
				: null,
		pricedInputTokens,
		pricedOutputTokens,
	};
}

function buildEffectivePriceHistoryState(args: {
	rows: EffectiveRow[];
	usageByProvider: Map<string, ProviderUsageSummary>;
	historyRules: ModelPricingHistoryRule[];
	plan: string;
	direction: "input" | "output";
}): {
	chartConfig: ChartConfig;
	chartData: Array<Record<string, string | number | null>>;
	seriesKeys: string[];
	providerNameBySeries: Map<string, string>;
	hasData: boolean;
} {
	const dayBuckets = buildDayBuckets(7);
	const providerNameBySeries = new Map<string, string>();
	const chartConfig: ChartConfig = {};

	for (const row of args.rows) {
		providerNameBySeries.set(row.seriesKey, row.providerName);
		chartConfig[row.seriesKey] = {
			label: row.providerName,
			color: row.color,
		};
	}

	const chartData = dayBuckets.map((day) => {
		const timestampMs = Date.parse(`${day}T12:00:00.000Z`);
		const entry: Record<string, string | number | null> = { day };
		for (const row of args.rows) {
			const usage = args.usageByProvider.get(row.providerId)?.usageByDay.get(day);
			if (!usage) {
				entry[row.seriesKey] = null;
				continue;
			}
			const matchingRules = args.historyRules.filter(
				(rule) =>
					rule.providerId === row.providerId &&
					rule.pricingPlan === args.plan,
			);
			entry[row.seriesKey] =
				args.direction === "input"
					? calculateEffectiveInputPricePer1M({
							usage,
							rules: matchingRules,
							timestampMs,
						})
					: calculateEffectiveOutputPricePer1M({
							usage,
							rules: matchingRules,
							timestampMs,
						});
		}
		return entry;
	});

	const seriesKeys = args.rows.map((row) => row.seriesKey);
	const hasData = chartData.some((entry) =>
		seriesKeys.some((seriesKey) => {
			const value = entry[seriesKey];
			return typeof value === "number" && Number.isFinite(value);
		}),
	);

	return {
		chartConfig,
		chartData,
		seriesKeys,
		providerNameBySeries,
		hasData,
	};
}

function HistoryChart({
	title,
	chartConfig,
	chartData,
	seriesKeys,
	providerNameBySeries,
}: {
	title: string;
	chartConfig: ChartConfig;
	chartData: Array<Record<string, string | number | null>>;
	seriesKeys: string[];
	providerNameBySeries: Map<string, string>;
}) {
	return (
		<div className="min-w-0 space-y-2 p-4">
			<h3 className="text-sm font-medium text-foreground">{title}</h3>
			<ChartContainer config={chartConfig} className="h-[220px] w-full min-w-0">
				<LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
					<CartesianGrid vertical={false} className="stroke-muted" />
					<XAxis
						dataKey="day"
						tickFormatter={(value) => formatDayLabel(String(value))}
						tickLine={false}
						axisLine={false}
						minTickGap={24}
					/>
					<YAxis
						tickFormatter={(value) => formatAxisUsd(Number(value))}
						width={70}
						tickLine={false}
						axisLine={false}
					/>
					<RechartsTooltip
						isAnimationActive={false}
						content={({ active, payload, label }) => {
							if (!active || !payload?.length) return null;
							const items = payload
								.filter((item) => Number.isFinite(Number(item.value)))
								.sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
							if (!items.length) return null;
							return (
								<div className="rounded-lg border border-zinc-200/60 bg-background px-3 py-2 text-xs shadow-xl dark:border-zinc-800/60">
									<p className="mb-1 font-medium text-foreground">
										{formatDayLabel(String(label ?? ""))}
									</p>
									<div className="space-y-1.5">
										{items.map((item) => {
											const seriesKey = String(item.dataKey ?? "");
											return (
												<div
													key={seriesKey}
													className="flex items-center justify-between gap-3"
												>
													<div className="flex items-center gap-2">
														<span
															className="size-2 rounded-[2px]"
															style={{
																backgroundColor: String(item.color ?? "currentColor"),
															}}
														/>
														<span>{providerNameBySeries.get(seriesKey) ?? seriesKey}</span>
													</div>
													<span className="font-medium tabular-nums">
														{formatUsd(Number(item.value))}
													</span>
												</div>
											);
										})}
									</div>
								</div>
							);
						}}
					/>
					{seriesKeys.map((seriesKey) => (
						<Line
							key={seriesKey}
							type="monotone"
							dataKey={seriesKey}
							stroke={`var(--color-${seriesKey})`}
							strokeWidth={2}
							dot={{ r: 3, strokeWidth: 0 }}
							activeDot={false}
							connectNulls={false}
							isAnimationActive={false}
						/>
					))}
				</LineChart>
			</ChartContainer>
		</div>
	);
}

export default function PricingInsights({
	providers,
	plan,
	availablePlans,
	onPlanChange,
	showPlanInEffectiveHeader = false,
	historyRules,
	usageRows,
}: PricingInsightsProps) {
	const [sortKey, setSortKey] = useState<SortKey | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const routableProviders = useMemo(
		() => providers.filter(isRoutableProvider),
		[providers],
	);
	const providerColours = useMemo(() => assignSeriesColours(routableProviders.map((provider) => provider.provider.api_provider_id)), [routableProviders]);

	const filteredHistoryRules = useMemo(
		() => historyRules.filter((rule) => rule.pricingPlan === plan),
		[historyRules, plan],
	);

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
			const inputTokens = row.inputTextTokens;
			const outputTokens = row.outputTextTokens;
			const cachedReadInputTokens = row.cachedReadTextTokens;
			existing.totalTokens30d += row.totalTokens;
			existing.inputWeightTokens30d += inputTokens;
			existing.outputWeightTokens30d += outputTokens;
			existing.cachedReadInputTokens30d += Math.min(cachedReadInputTokens, inputTokens);

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
	}, [usageRows]);

	const effectiveRows = useMemo(() => {
		const totalTokensAll = routableProviders.reduce(
			(sum, provider) => sum + (usageByProvider.get(provider.provider.api_provider_id)?.totalTokens30d ?? 0),
			0,
		);

		return routableProviders.map((provider) => {
			const providerId = provider.provider.api_provider_id;
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
			const matchingRules = filteredHistoryRules.filter(
				(rule) => rule.providerId === providerId,
			);
			const effectivePrices = usage
				? calculateEffectivePriceSummaryForUsage(usage, matchingRules)
				: null;
			const listSections = buildProviderSections(provider, plan);
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
				seriesKey: keyForSeries(providerId),
				color: providerColours[providerId]?.stroke ?? "hsl(210 70% 55%)",
				inputPricePer1M:
					effectivePrices?.weightedInputPricePer1M ?? listInputPricePer1M,
				outputPricePer1M:
					effectivePrices?.weightedOutputPricePer1M ?? listOutputPricePer1M,
				cacheHitRatePct:
					usage && usage.inputWeightTokens30d > 0
						? (usage.cachedReadInputTokens30d / usage.inputWeightTokens30d) * 100
						: null,
				tokenSharePct:
					totalTokensAll > 0 && usage
						? (usage.totalTokens30d / totalTokensAll) * 100
						: null,
				totalTokens30d: usage?.totalTokens30d ?? 0,
				inputWeightTokens30d: usage?.inputWeightTokens30d ?? 0,
				outputWeightTokens30d: usage?.outputWeightTokens30d ?? 0,
			} satisfies EffectiveRow;
		});
	}, [filteredHistoryRules, plan, providerColours, routableProviders, usageByProvider]);

	const effectiveSummary = useMemo(() => {
		let inputCostUsd = 0;
		let pricedInputTokens = 0;
		let outputCostUsd = 0;
		let pricedOutputTokens = 0;

		for (const row of effectiveRows) {
			const usage = usageByProvider.get(row.providerId);
			if (!usage) continue;
			const matchingRules = filteredHistoryRules.filter(
				(rule) => rule.providerId === row.providerId,
			);
			const providerEffectiveSummary = calculateEffectivePriceSummaryForUsage(
				usage,
				matchingRules,
			);
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
	}, [effectiveRows, filteredHistoryRules, usageByProvider]);

	const sortedRows = useSortedRows(effectiveRows, sortKey, sortDirection);

	const historyRows = useMemo(
		() => sortedRows.filter((row) => row.inputPricePer1M != null || row.outputPricePer1M != null),
		[sortedRows],
	);

	const inputHistoryState = useMemo(
		() =>
			buildEffectivePriceHistoryState({
				rows: historyRows,
				usageByProvider,
				historyRules,
				plan,
				direction: "input",
			}),
		[historyRows, historyRules, plan, usageByProvider],
	);

	const outputHistoryState = useMemo(
		() =>
			buildEffectivePriceHistoryState({
				rows: historyRows,
				usageByProvider,
				historyRules,
				plan,
				direction: "output",
			}),
		[historyRows, historyRules, plan, usageByProvider],
	);

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

	return (
		<section className="space-y-4">
			{showPlanInEffectiveHeader ? (
				<div
					className={
						availablePlans.length > 1 && onPlanChange
							? "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
							: "space-y-1"
					}
				>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">Pricing</h2>
						<p className="text-xs text-muted-foreground">
							List prices are current provider rates. Effective prices are weighted
							by observed gateway traffic over the last 30 days.
						</p>
					</div>
					{availablePlans.length > 1 && onPlanChange ? (
						<div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
							<span className="text-xs text-muted-foreground">Service tier</span>
							<PricingPlanSelect
								value={plan}
								onChange={onPlanChange}
								plans={availablePlans}
								variant="dropdown"
							/>
						</div>
					) : null}
				</div>
			) : null}

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<h3 className="text-sm font-medium text-foreground">Effective pricing</h3>
					<p className="text-xs text-muted-foreground">
						Weighted by routed usage over the last 30 days; external and non-routable
						providers are excluded.
					</p>
				</div>
				{!showPlanInEffectiveHeader && availablePlans.length > 1 && onPlanChange ? (
					<PricingPlanSelect
						value={plan}
						onChange={onPlanChange}
						plans={availablePlans}
						variant="dropdown"
					/>
				) : null}
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

				<ScrollArea
					className="w-full border-b border-border/70"
					scrollBarOrientation="horizontal"
				>
					<Table className="min-w-[760px]" wrapInContainer={false}>
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
								<TableHead className="h-8 pl-2 pr-3 text-right">
									<SortHead
										label="Input $/M"
										sortKey="input"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-right">
									<SortHead
										label="Output $/M"
										sortKey="output"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-right">
									<SortHead
										label="Cache hit rate"
										sortKey="cacheHitRate"
										activeSortKey={sortKey}
										direction={sortDirection}
										onToggle={handleSortToggle}
									/>
								</TableHead>
								<TableHead className="h-8 pl-2 pr-3 text-right">
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
							{sortedRows.map((row) => (
								<TableRow key={row.providerId}>
									<TableCell className="px-3 py-1.5">
										<Link
											href={`/api-providers/${row.providerId}`}
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
											<span className="font-medium text-foreground transition-colors group-hover/provider:text-primary">
												{row.providerName}
											</span>
										</Link>
									</TableCell>
									<TableCell className="px-3 py-1.5 text-right font-medium tabular-nums text-foreground">
										{formatUsd(row.inputPricePer1M)}
									</TableCell>
									<TableCell className="px-3 py-1.5 text-right font-medium tabular-nums text-foreground">
										{formatUsd(row.outputPricePer1M)}
									</TableCell>
									<TableCell className="px-3 py-1.5 text-right tabular-nums">
										<div className="font-medium text-foreground">
											{formatPercent(row.cacheHitRatePct)}
										</div>
									</TableCell>
									<TableCell className="px-3 py-1.5 text-right tabular-nums">
										<Tooltip delayDuration={120}>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="ml-auto flex items-center justify-end gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
							))}
						</TableBody>
					</Table>
				</ScrollArea>

				{inputHistoryState.hasData || outputHistoryState.hasData ? (
					<div className="grid divide-y divide-border/70 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
						{inputHistoryState.hasData ? (
							<HistoryChart
								title="Effective input price / 1M tokens (7 days)"
								chartConfig={inputHistoryState.chartConfig}
								chartData={inputHistoryState.chartData}
								seriesKeys={inputHistoryState.seriesKeys}
								providerNameBySeries={inputHistoryState.providerNameBySeries}
							/>
						) : null}
						{outputHistoryState.hasData ? (
							<HistoryChart
								title="Effective output price / 1M tokens (7 days)"
								chartConfig={outputHistoryState.chartConfig}
								chartData={outputHistoryState.chartData}
								seriesKeys={outputHistoryState.seriesKeys}
								providerNameBySeries={outputHistoryState.providerNameBySeries}
							/>
						) : null}
					</div>
				) : (
					<div className="p-4">
						<div className="rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
							No 7-day effective pricing is available for the selected service tier.
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
