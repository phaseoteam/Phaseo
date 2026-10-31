import { useLocale, useTranslations } from "@/i18n/react";
import { usageDeltaPercent as deltaPercent } from "@phaseo/app-kit/format";
import { Link } from "@/i18n/navigation";
import { UserUsageChip } from "@/components/(gateway)/settings/keys/UserUsageChip";
import { memo, useEffect } from "react";
import { captureProductEventOnce } from "@/lib/productAnalytics";
import { useSearchParams } from "@/lib/navigation";
import { PrivateUsageQuery, usePrivateUsageQuery } from "@/components/(gateway)/usage/PrivateUsageQuery";
import { fetchPrivateUsage } from "@/lib/query/fetchPrivateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import { WebApiError } from "@/lib/web-api/client";
import ObservabilityHub from "@/components/(gateway)/usage/observability/ObservabilityHub";
import type {
	ObservabilityData,
	ObservabilityExploreRow,
	ObservabilityKpi,
	ObservabilityRange,
	ObservabilityRankedItem,
	ObservabilitySeriesPoint,
	ObservabilityTab,
	ObservabilityTimeSeriesChart,
} from "@/components/(gateway)/usage/observability/types";
import {
	getUsageRangeLabel,
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolvePreviousUsageTimeRange,
	resolveUsageTimeRange,
	type UsageRangePreset,
} from "@/lib/gateway/usage/timeRange";
import { forecastMonthSpend } from "@/lib/gateway/usage/monthSpendForecast";
import { forecastPeriod, kpiFooters, type KpiCard } from "@/lib/gateway/usage/periodUsageKpis";
import {
	buildGuardrailBlockMetrics,
	type GuardrailEnforcementMetricsResult,
} from "@/lib/gateway/usage/guardrailEnforcementMetrics";
import type {
	ObservabilityUsageCell,
	SettingsObservabilityData,
} from "@/lib/fetchers/internal/fetchSettingsObservabilityData";


type UsageCell = ObservabilityUsageCell;

const spendOf = (cell: UsageCell) => cell.costNanos / 1e9;

function sumCells(cells: UsageCell[], getValue: (cell: UsageCell) => number): number {
	return cells.reduce((sum, cell) => sum + getValue(cell), 0);
}

function floorToBucket(date: Date, range: ObservabilityRange): Date {
	const d = new Date(date);
	if (range === "1h") {
		d.setSeconds(0, 0);
		d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
		return d;
	}
	if (range === "1d") {
		d.setMinutes(0, 0, 0);
		return d;
	}
	if (range === "1w" || range === "1m") {
		d.setHours(0, 0, 0, 0);
		return d;
	}
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	return d;
}

function advanceBucket(date: Date, range: ObservabilityRange): Date {
	const d = new Date(date);
	if (range === "1h") d.setMinutes(d.getMinutes() + 5);
	else if (range === "1d") d.setHours(d.getHours() + 1);
	else if (range === "1w" || range === "1m") d.setDate(d.getDate() + 1);
	else d.setMonth(d.getMonth() + 1);
	return d;
}

function formatBucketLabel(date: Date, range: ObservabilityRange, locale: string): string {
	if (range === "1h") {
		return new Intl.DateTimeFormat(locale, {
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	}
	if (range === "1d") {
		return new Intl.DateTimeFormat(locale, {
			hour: "2-digit",
			day: "numeric",
			month: "short",
		}).format(date);
	}
	if (range === "1w" || range === "1m") {
		return new Intl.DateTimeFormat(locale, {
			day: "numeric",
			month: "short",
		}).format(date);
	}
	return new Intl.DateTimeFormat(locale, {
		month: "short",
		year: "numeric",
	}).format(date);
}

function buildEmptySeries(args: {
	from: string;
	to: string;
	range: ObservabilityRange;
	locale: string;
}): ObservabilitySeriesPoint[] {
	const from = new Date(args.from);
	const to = new Date(args.to);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
	const points: ObservabilitySeriesPoint[] = [];
	for (
		let cursor = floorToBucket(from, args.range);
		cursor <= to;
		cursor = advanceBucket(cursor, args.range)
	) {
		points.push({
			bucket: cursor.toISOString(),
			label: formatBucketLabel(cursor, args.range, args.locale),
			value: 0,
		});
	}
	return points;
}

/** The chart bucket a cell's own bucket falls in, or null for a cell summed over the whole window. */
function cellBucket(cell: UsageCell, range: ObservabilityRange): string | null {
	if (!cell.bucket) return null;
	const start = new Date(cell.bucket);
	return Number.isNaN(start.getTime()) ? null : floorToBucket(start, range).toISOString();
}

function sumByBucket(args: {
	cells: UsageCell[];
	range: ObservabilityRange;
	locale: string;
	from: string;
	to: string;
	getValue: (cell: UsageCell) => number;
}): ObservabilitySeriesPoint[] {
	const points = buildEmptySeries(args);
	const pointMap = new Map(points.map((point) => [point.bucket, point]));
	for (const cell of args.cells) {
		const point = pointMap.get(cellBucket(cell, args.range) ?? "");
		if (point) point.value += args.getValue(cell);
	}
	return points;
}

/** A rate per bucket, such as cached tokens over all tokens; zero where the bucket has none. */
function ratioByBucket(args: {
	cells: UsageCell[];
	range: ObservabilityRange;
	locale: string;
	from: string;
	to: string;
	numerator: (cell: UsageCell) => number;
	denominator: (cell: UsageCell) => number;
	scale?: number;
}): ObservabilitySeriesPoint[] {
	const numerators = sumByBucket({ ...args, getValue: args.numerator });
	const denominators = sumByBucket({ ...args, getValue: args.denominator });
	return numerators.map((point, index) => {
		const denominator = denominators[index]?.value ?? 0;
		return { ...point, value: denominator > 0 ? (point.value / denominator) * (args.scale ?? 1) : 0 };
	});
}

function makeKpi(args: {
	id: ObservabilityKpi["id"];
	label: string;
	value: number;
	previous: number;
	sparkline: ObservabilitySeriesPoint[];
	format: ObservabilityKpi["format"];
}): ObservabilityKpi {
	return {
		...args,
		deltaPercent: deltaPercent(args.value, args.previous),
	};
}

function makeRankedItems(args: {
	cells: UsageCell[];
	previousCells: UsageCell[];
	range: ObservabilityRange;
	locale: string;
	from: string;
	to: string;
	getId: (cell: UsageCell) => string | null;
	getLabel: (id: string) => string;
	getSubtitle?: (id: string) => string | null | undefined;
	getImageUrl?: (id: string) => string | null | undefined;
	limit?: number;
}): ObservabilityRankedItem[] {
	const current = new Map<string, { tokens: number; requests: number; cost: number }>();
	const previous = new Map<string, number>();

	for (const cell of args.cells) {
		const id = args.getId(cell);
		if (!id) continue;
		const entry = current.get(id) ?? { tokens: 0, requests: 0, cost: 0 };
		entry.tokens += cell.tokens;
		entry.requests += cell.requests;
		entry.cost += spendOf(cell);
		current.set(id, entry);
	}

	for (const cell of args.previousCells) {
		const id = args.getId(cell);
		if (!id) continue;
		previous.set(id, (previous.get(id) ?? 0) + cell.tokens);
	}

	return Array.from(current.entries())
		.map(([id, values]) => ({
			id,
			label: args.getLabel(id),
			subtitle: args.getSubtitle?.(id) ?? null,
			imageUrl: args.getImageUrl?.(id) ?? null,
			tokens: values.tokens,
			requests: values.requests,
			cost: values.cost,
			previousTokens: previous.get(id) ?? 0,
			deltaPercent: deltaPercent(values.tokens, previous.get(id) ?? 0),
			sparkline: sumByBucket({
				locale: args.locale,
				cells: args.cells.filter((cell) => args.getId(cell) === id),
				range: args.range,
				from: args.from,
				to: args.to,
				getValue: (cell) => cell.tokens,
			}),
		}))
		.sort((a, b) => b.tokens - a.tokens)
		.slice(0, args.limit ?? 6);
}

function buildTimeSeriesBreakdown(args: {
	cells: UsageCell[];
	range: ObservabilityRange;
	locale: string;
	from: string;
	to: string;
	getId: (cell: UsageCell) => string | null;
	getLabel: (id: string) => string;
	getValue: (cell: UsageCell) => number;
	limit?: number;
	includeOther?: boolean;
	otherLabel: string;
}): ObservabilityTimeSeriesChart {
	const totals = new Map<string, number>();
	for (const cell of args.cells) {
		const id = args.getId(cell);
		if (!id) continue;
		totals.set(id, (totals.get(id) ?? 0) + args.getValue(cell));
	}
	const series = Array.from(totals.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, args.limit ?? 6)
		.map(([sourceId], index) => ({
			id: `series${index + 1}`,
			label: args.getLabel(sourceId),
			sourceId,
		}));
	const topSourceIds = new Set(series.map((item) => item.sourceId));
	const hasOther =
		Boolean(args.includeOther) &&
		Array.from(totals.keys()).some((sourceId) => !topSourceIds.has(sourceId));
	const chartSeries = hasOther
		? [
				...series,
				{
					id: "other",
					label: args.otherLabel,
					sourceId: "__other",
				},
			]
		: series;
	const seriesIdBySourceId = new Map(
		series.map((item) => [item.sourceId, item.id]),
	);
	const points = buildEmptySeries(args).map((point) => {
		const row: Record<string, string | number> = {
			bucket: point.bucket,
			label: point.label,
		};
		for (const item of chartSeries) row[item.id] = 0;
		return row;
	});
	const pointMap = new Map(points.map((point) => [String(point.bucket), point]));
	for (const cell of args.cells) {
		const sourceId = args.getId(cell);
		const id = sourceId
			? seriesIdBySourceId.get(sourceId) ?? (hasOther ? "other" : null)
			: null;
		if (!id) continue;
		const point = pointMap.get(cellBucket(cell, args.range) ?? "");
		if (!point) continue;
		point[id] = Number(point[id] ?? 0) + args.getValue(cell);
	}
	return {
		series: chartSeries.map(({ id, label }) => ({ id, label })),
		data: points,
	};
}

function buildFixedTimeSeries(args: {
	cells: UsageCell[];
	range: ObservabilityRange;
	locale: string;
	from: string;
	to: string;
	series: Array<{ id: string; label: string; color?: string }>;
	getValues: (cell: UsageCell) => Record<string, number>;
}): ObservabilityTimeSeriesChart {
	const points = buildEmptySeries(args).map((point) => {
		const row: Record<string, string | number> = {
			bucket: point.bucket,
			label: point.label,
		};
		for (const item of args.series) row[item.id] = 0;
		return row;
	});
	const pointMap = new Map(points.map((point) => [String(point.bucket), point]));
	for (const cell of args.cells) {
		const point = pointMap.get(cellBucket(cell, args.range) ?? "");
		if (!point) continue;
		const values = args.getValues(cell);
		for (const item of args.series) {
			point[item.id] = Number(point[item.id] ?? 0) + (values[item.id] ?? 0);
		}
	}
	return { series: args.series, data: points };
}

function buildExploreRows(args: {
	cells: UsageCell[];
	range: ObservabilityRange;
	locale: string;
	unknownLabel: string;
	keyLabel: (id: string | null) => string;
	appLabel: (id: string | null) => string;
	modelLabel: (id: string | null) => string;
}): ObservabilityExploreRow[] {
	const grouped = new Map<string, ObservabilityExploreRow>();
	for (const cell of args.cells) {
		const bucketStart = cellBucket(cell, args.range);
		if (!bucketStart) continue;
		const bucket = formatBucketLabel(new Date(bucketStart), args.range, args.locale);
		const model = args.modelLabel(cell.modelId);
		const apiKey = args.keyLabel(cell.keyId);
		const app = args.appLabel(cell.appId);
		const provider = cell.provider ?? args.unknownLabel;
		const key = `${bucket}\n${model}\n${apiKey}\n${app}\n${provider}`;
		const existing =
			grouped.get(key) ??
			({
				bucket,
				model,
				apiKey,
				app,
				provider,
				requests: 0,
				tokens: 0,
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				cachedTokens: 0,
				uncachedTokens: 0,
				cost: 0,
				errors: 0,
			} satisfies ObservabilityExploreRow);
		existing.requests += cell.requests;
		existing.tokens += cell.tokens;
		existing.inputTokens += cell.inputTokens;
		existing.outputTokens += cell.outputTokens;
		existing.reasoningTokens += cell.reasoningTokens;
		existing.cachedTokens += cell.cachedTokens;
		existing.uncachedTokens += Math.max(0, cell.tokens - cell.cachedTokens);
		existing.cost += spendOf(cell);
		existing.errors += cell.requests - cell.successfulRequests;
		grouped.set(key, existing);
	}
	return Array.from(grouped.values()).sort((a, b) => b.tokens - a.tokens);
}

const DATABASE_BUCKETS: Record<ObservabilityRange, string> = {
	"1h": "5 minutes",
	"1d": "hour",
	"1w": "day",
	"1m": "day",
	"1y": "month",
};

function rangeForTimeWindow(from: string, to: string): ObservabilityRange {
	const fromTime = new Date(from).getTime();
	const toTime = new Date(to).getTime();
	const hours = Math.max(1, (toTime - fromTime) / 3_600_000);
	if (hours <= 2) return "1h";
	if (hours <= 48) return "1d";
	if (hours <= 24 * 14) return "1w";
	if (hours <= 24 * 400) return "1m";
	return "1y";
}

function parseLegacyRangePreset(value?: string | null): UsageRangePreset {
	if (value === "1h") return "past_hour";
	if (value === "1d") return "past_24h";
	if (value === "1w") return "last_7d";
	if (value === "1y") return "last_year";
	return "last_30d";
}

export default function ObservabilityClient({ scope: initialScope, initialTab }: { scope: AccountQueryScope; initialTab: ObservabilityTab }) {
	const sp = useSearchParams();
	const scope = { ...initialScope, workspaceId: sp.get("workspaceId")?.trim() || initialScope.workspaceId };
	const creatorId = sp.get("user") || "";
	const keyId = sp.get("key") || "";
	const excludeKey = Boolean(keyId) && sp.get("key_op") === "is_not";
	const rangeKeys = getUsageRangeParamKeys();
	const presetParam = sp.get(rangeKeys.preset);
	const preset = presetParam
		? parseUsageRangePreset(presetParam)
		: parseLegacyRangePreset(sp.get("range"));
	const customFrom = parseUsageDateInput(sp.get(rangeKeys.from));
	const customTo = parseUsageDateInput(sp.get(rangeKeys.to));
	const labelKey = sp.get("label_key")?.trim() || "";
	const labelValue = sp.get("label_value")?.trim() || "";
	// "Is not" has no rollup totals, so the API leaves the overview unfiltered for it.
	const excludeLabel = Boolean(labelKey) && sp.get("label_op") === "is_not";
	const query = usePrivateUsageQuery(scope, "observability", { preset, from: customFrom ?? "", to: customTo ?? "", labelKey, labelValue, labelOp: excludeLabel ? "is_not" : "", creatorId, keyId, keyOp: excludeKey ? "is_not" : "" }, preset === "live", async (signal) => {
		const { from, to } = resolveUsageTimeRange({ preset, customFrom, customTo });
		const previous = resolvePreviousUsageTimeRange({ preset, from, to });
		const params = new URLSearchParams({
			workspaceId: scope.workspaceId!,
			from,
			to,
			previousFrom: previous.from,
			previousTo: previous.to,
			// The database cuts the charts' buckets in the reader's time zone.
			bucket: DATABASE_BUCKETS[rangeForTimeWindow(from, to)],
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		});
		if (creatorId) params.set("user", creatorId);
		if (keyId) params.set("key", keyId);
		if (excludeKey) params.set("key_op", "is_not");
		if (labelKey) params.set("label_key", labelKey);
		if (labelValue) params.set("label_value", labelValue);
		if (excludeLabel) params.set("label_op", "is_not");
		const path = `/api/account/settings/usage/observability?${params}` as const;
		const initial = await fetchPrivateUsage<SettingsObservabilityData>(path, scope, signal);
		if (!initial.signedIn) throw new WebApiError(path, 401);
		if (initial.workspaceId !== scope.workspaceId) throw new WebApiError(path, 403);
		return { initial, from, to, previous };
	});
	return <PrivateUsageQuery query={query} scope={scope} live={preset === "live"}>{(snapshot) => <ObservabilityView snapshot={snapshot} initialTab={initialTab} preset={preset} customFrom={customFrom} customTo={customTo} />}</PrivateUsageQuery>;
}

const ObservabilityView = memo(function ObservabilityView({ snapshot: { initial, from, to, previous }, initialTab, preset, customFrom, customTo }: {
	snapshot: { initial: SettingsObservabilityData; from: string; to: string; previous: { from: string; to: string } };
	initialTab: ObservabilityTab;
	preset: UsageRangePreset;
	customFrom: string | null;
	customTo: string | null;
}) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const sp = useSearchParams();
	const clearFilterParams = new URLSearchParams(sp.toString());
	clearFilterParams.delete("user");
	const range = rangeForTimeWindow(from, to);
	const { keys } = initial;
	const cells = initial.current.cells;
	const previousCells = initial.previous.cells;
	const hasUsage = cells.some((cell) => cell.requests > 0) || previousCells.some((cell) => cell.requests > 0);

	useEffect(() => {
		if (!hasUsage || !initial.workspaceId) return;
		captureProductEventOnce("gateway_first_usage_seen", { surface: "usage_overview" }, initial.workspaceId);
	}, [hasUsage, initial.workspaceId]);

	const keyMap = new Map(keys.map((key) => [key.id, key]));
	const modelMetadata = new Map(initial.modelMetadataEntries);
	const appNames = new Map(initial.appNameEntries);
	const appMetadata = new Map(initial.appMetadataEntries);

	const modelLabel = (id: string | null) => {
		if (!id) return t("observability.unknownModel" as never);
		const meta = modelMetadata.get(id);
		return meta?.modelName || id;
	};
	const keyLabel = (id: string | null) => {
		if (!id) return t("observability.noApiKey" as never);
		const key = keyMap.get(id);
		return key?.name || key?.prefix || id;
	};
	const keySubtitle = (id: string) => {
		const key = keyMap.get(id);
		return key?.name && key?.prefix ? key.prefix : null;
	};
	const appLabel = (id: string | null) => {
		if (!id) return t("observability.noApp" as never);
		return appNames.get(id) || id;
	};
	const modelFilterOptions = Array.from(new Set(cells.flatMap((cell) => {
		const id = cell.modelId?.trim();
		return id ? [id] : [];
	}))
	)
		.map((id) => {
			const meta = modelMetadata.get(id);
			return {
				value: id,
				label: modelLabel(id),
				logoId: meta?.organisationId ?? null,
			};
		})
		.sort((a, b) => a.label.localeCompare(b.label));

	const totals = (windowCells: UsageCell[]) => {
		const spend = sumCells(windowCells, spendOf);
		const requests = sumCells(windowCells, (cell) => cell.requests);
		const tokens = sumCells(windowCells, (cell) => cell.tokens);
		return {
			spend,
			requests,
			tokens,
			cache: tokens > 0 ? sumCells(windowCells, (cell) => cell.cachedTokens) / tokens : 0,
			successRate: requests > 0 ? sumCells(windowCells, (cell) => cell.successfulRequests) / requests : 0,
			blendedPrice: tokens > 0 ? (spend / tokens) * 1_000_000 : 0,
		};
	};
	const currentTotals = totals(cells);
	const previousTotals = totals(previousCells);
	const series = { cells, range, locale, from, to };

	const kpis: ObservabilityKpi[] = [
		makeKpi({
			id: "spend",
			label: t("observability.metricCost" as never),
			value: currentTotals.spend,
			previous: previousTotals.spend,
			format: "currency",
			sparkline: sumByBucket({ ...series, getValue: spendOf }),
		}),
		makeKpi({
			id: "requests",
			label: t("observability.metricRequests" as never),
			value: currentTotals.requests,
			previous: previousTotals.requests,
			format: "number",
			sparkline: sumByBucket({ ...series, getValue: (cell) => cell.requests }),
		}),
		makeKpi({
			id: "tokens",
			label: t("observability.metricTokens" as never),
			value: currentTotals.tokens,
			previous: previousTotals.tokens,
			format: "number",
			sparkline: sumByBucket({ ...series, getValue: (cell) => cell.tokens }),
		}),
		makeKpi({
			id: "cache",
			label: t("observability.metricCacheHitRate" as never),
			value: currentTotals.cache,
			previous: previousTotals.cache,
			format: "percent",
			sparkline: ratioByBucket({ ...series, numerator: (cell) => cell.cachedTokens, denominator: (cell) => cell.tokens }),
		}),
		makeKpi({
			id: "success_rate",
			label: t("strings.Success rate" as never),
			value: currentTotals.successRate,
			previous: previousTotals.successRate,
			format: "percent",
			sparkline: ratioByBucket({ ...series, numerator: (cell) => cell.successfulRequests, denominator: (cell) => cell.requests }),
		}),
		makeKpi({
			id: "blended_price",
			label: t("observability.metricBlendedPricePerMillion" as never),
			value: currentTotals.blendedPrice,
			previous: previousTotals.blendedPrice,
			format: "currency_per_million",
			sparkline: ratioByBucket({ ...series, numerator: spendOf, denominator: (cell) => cell.tokens, scale: 1_000_000 }),
		}),
	];

	const rankedArgs = { ...series, previousCells };
	const topApiKeys = makeRankedItems({
		...rankedArgs,
		getId: (cell) => cell.keyId,
		getLabel: keyLabel,
		getSubtitle: keySubtitle,
		limit: 5,
	});
	const topApps = makeRankedItems({
		...rankedArgs,
		getId: (cell) => cell.appId,
		getLabel: appLabel,
		getImageUrl: (id) => appMetadata.get(id)?.imageUrl ?? null,
		limit: 5,
	});
	const trendingModels = makeRankedItems({
		...rankedArgs,
		getId: (cell) => cell.modelId,
		getLabel: modelLabel,
	});

	const otherLabel = t("strings.Other" as never);
	const usageByModelCost = buildTimeSeriesBreakdown({ ...series, otherLabel, getId: (cell) => cell.modelId, getLabel: modelLabel, getValue: spendOf });
	const requestVolumeByModel = buildTimeSeriesBreakdown({ ...series, otherLabel, getId: (cell) => cell.modelId, getLabel: modelLabel, getValue: (cell) => cell.requests });
	const trendCharts = (getId: (cell: UsageCell) => string | null, getLabel: (id: string) => string) => {
		const trendArgs = { ...series, otherLabel, limit: 10, includeOther: true, getId, getLabel };
		return {
			spend: buildTimeSeriesBreakdown({ ...trendArgs, getValue: spendOf }),
			requests: buildTimeSeriesBreakdown({ ...trendArgs, getValue: (cell) => cell.requests }),
			tokens: buildTimeSeriesBreakdown({ ...trendArgs, getValue: (cell) => cell.tokens }),
		};
	};
	const usageTypeCost = buildFixedTimeSeries({
		...series,
		series: [
			{ id: "phaseo", label: t("observability.metricPhaseoCredits" as never), color: "#2563eb" },
			{ id: "byok", label: "BYOK", color: "#059669" },
		],
		getValues: (cell) => cell.byok ? { phaseo: 0, byok: spendOf(cell) } : { phaseo: spendOf(cell), byok: 0 },
	});
	const tokenSplit = buildFixedTimeSeries({
		...series,
		series: [
			{ id: "input", label: t("observability.metricInput" as never), color: "#2563eb" },
			{ id: "output", label: t("observability.metricOutput" as never), color: "#059669" },
			{ id: "reasoning", label: t("observability.metricReasoning" as never), color: "#d97706" },
		],
		getValues: (cell) => ({ input: cell.inputTokens, output: cell.outputTokens, reasoning: cell.reasoningTokens }),
	});
	const cacheSplit = buildFixedTimeSeries({
		...series,
		series: [
			{ id: "cached", label: t("observability.metricCached" as never), color: "#059669" },
			{ id: "uncached", label: t("observability.metricUncached" as never), color: "#94a3b8" },
		],
		getValues: (cell) => ({ cached: cell.cachedTokens, uncached: Math.max(0, cell.tokens - cell.cachedTokens) }),
	});

	const recentCells = initial.recent?.cells ?? null;
	const footers = kpiFooters({
		observedAt: Date.parse(to),
		period: forecastPeriod({ preset, from, to }),
		cards: Object.fromEntries(kpis.map((kpi) => [kpi.id, { value: kpi.value, previous: kpi.previous }])) as Record<ObservabilityKpi["id"], KpiCard>,
		recent: recentCells ? {
			spend: sumCells(recentCells, spendOf),
			requests: sumCells(recentCells, (cell) => cell.requests),
			tokens: sumCells(recentCells, (cell) => cell.tokens),
		} : null,
	});
	const data: ObservabilityData = {
		range,
		periodLabel: getUsageRangeLabel({ preset, customFrom, customTo }),
		previousPeriod: previous,
		kpis: kpis.map((kpi) => ({ ...kpi, footer: footers[kpi.id] })),
		monthSpend: initial.monthUsage ? forecastMonthSpend(initial.monthUsage) : null,
		topApiKeys,
		topApps,
		trendingModels,
		trendingKeys: topApiKeys,
		trendingApps: topApps,
		charts: {
			usageByModelCost,
			usageTypeCost,
			requestVolumeByModel,
			tokenSplit,
			cacheSplit,
			spendOverTime: sumByBucket({ ...series, getValue: spendOf }),
			trends: {
				models: trendCharts((cell) => cell.modelId, modelLabel),
				keys: trendCharts((cell) => cell.keyId, keyLabel),
				apps: trendCharts((cell) => cell.appId, appLabel),
			},
		},
		filterOptions: {
			models: modelFilterOptions,
		},
		exploreRows: buildExploreRows({
			locale,
			unknownLabel: t("strings.Unknown" as never),
			cells,
			range,
			keyLabel,
			appLabel,
			modelLabel,
		}),
	};

	const guardrailMetrics: GuardrailEnforcementMetricsResult = buildGuardrailBlockMetrics({
		blocks: cells.flatMap((cell) => cell.bucket ? [{ bucket: cell.bucket, blocked: cell.guardrailBlocked }] : []),
		timeRange: { from, to },
		range,
	});

	return (
		<div className="space-y-4">
		{initial.creatorFilter && <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-sm"><span className="text-muted-foreground">{t("keyDetail.keysCreatedBy")}</span><UserUsageChip userId={initial.creatorFilter.id} name={initial.creatorFilter.name} avatarUrl={initial.creatorFilter.avatarUrl} workspaceId={initial.workspaceId!} currentUserId={initial.currentUserId} canViewWorkspaceUsers={initial.canViewWorkspaceUsers} /><Link className="ml-auto text-muted-foreground underline hover:text-foreground" href={`/settings/usage/${initialTab}?${clearFilterParams}`}>{t("keyDetail.clearUserFilter")}</Link></div>}
		<ObservabilityHub
			data={data}
			guardrailMetrics={guardrailMetrics}
			initialTab={initialTab}
			labelFacets={initial.labelFacets}
			labelSummary={initial.labelSummary}
			requestClassifiers={initial.requestClassifiers ?? []}
			labelBreakdown={{
				from,
				to,
				keyId: sp.get("key") || null,
				excludeKey: Boolean(sp.get("key")) && sp.get("key_op") === "is_not",
				creatorId: sp.get("user") || null,
			}}
			preset={preset}
			customFrom={customFrom}
			customTo={customTo}
		/>
		</div>
	);
});
