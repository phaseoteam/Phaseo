"use client";

import { memo } from "react";
import { useSearchParams } from "next/navigation";
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
import { extractUsageMeters } from "@/components/(gateway)/usage/usageMeters";
import {
	getUsageRangeLabel,
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolveUsageTimeRange,
	type UsageRangePreset,
} from "@/lib/gateway/usage/timeRange";
import {
	buildGuardrailEnforcementMetrics,
	type GuardrailEnforcementMetricsResult,
} from "@/lib/gateway/usage/guardrailEnforcementMetrics";
import type {
	SettingsObservabilityData,
	ObservabilityRequestRow as RawRequestRow,
} from "@/lib/fetchers/internal/fetchSettingsObservabilityData";


function toNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
}

function metricValue(usage: unknown, key: string): number {
	const meters = extractUsageMeters(usage as any);
	return meters.find((meter) => meter.key === key)?.value ?? 0;
}

function usageTokens(usage: unknown): number {
	const meters = extractUsageMeters(usage as any);
	const total = meters.find((meter) => meter.key === "total_tokens")?.value;
	if (total && total > 0) return total;
	const input = meters.find((meter) => meter.key === "input_tokens")?.value ?? 0;
	const output = meters.find((meter) => meter.key === "output_tokens")?.value ?? 0;
	return input + output;
}

function deltaPercent(current: number, previous: number): number | null {
	if (previous === 0) return current > 0 ? 100 : null;
	return ((current - previous) / previous) * 100;
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

function formatBucketLabel(date: Date, range: ObservabilityRange): string {
	if (range === "1h") {
		return new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	}
	if (range === "1d") {
		return new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			day: "numeric",
			month: "short",
		}).format(date);
	}
	if (range === "1w" || range === "1m") {
		return new Intl.DateTimeFormat("en-GB", {
			day: "numeric",
			month: "short",
		}).format(date);
	}
	return new Intl.DateTimeFormat("en-GB", {
		month: "short",
		year: "numeric",
	}).format(date);
}

function buildEmptySeries(args: {
	from: string;
	to: string;
	range: ObservabilityRange;
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
			label: formatBucketLabel(cursor, args.range),
			value: 0,
		});
	}
	return points;
}

function sumByBucket(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
	getValue: (row: RawRequestRow) => number;
}): ObservabilitySeriesPoint[] {
	const points = buildEmptySeries(args);
	const pointMap = new Map(points.map((point) => [point.bucket, point]));
	for (const row of args.rows) {
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const bucket = floorToBucket(created, args.range).toISOString();
		const point = pointMap.get(bucket);
		if (!point) continue;
		point.value += args.getValue(row);
	}
	return points;
}

function cacheHitRateByBucket(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
}): ObservabilitySeriesPoint[] {
	const points = buildEmptySeries(args);
	const totals = new Map(
		points.map((point) => [
			point.bucket,
			{
				cachedTokens: 0,
				totalTokens: 0,
			},
		]),
	);
	for (const row of args.rows) {
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const bucket = floorToBucket(created, args.range).toISOString();
		const total = totals.get(bucket);
		if (!total) continue;
		const cachedTokens =
			metricValue(row.usage, "cache_read_tokens") +
			metricValue(row.usage, "cache_write_tokens");
		total.cachedTokens += cachedTokens;
		total.totalTokens += usageTokens(row.usage);
	}
	return points.map((point) => {
		const total = totals.get(point.bucket);
		return {
			...point,
			value:
				total && total.totalTokens > 0
					? total.cachedTokens / total.totalTokens
					: 0,
		};
	});
}

function successRateByBucket(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
}): ObservabilitySeriesPoint[] {
	const points = buildEmptySeries(args);
	const totals = new Map(points.map((point) => [point.bucket, { successful: 0, total: 0 }]));
	for (const row of args.rows) {
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const total = totals.get(floorToBucket(created, args.range).toISOString());
		if (!total) continue;
		total.total += 1;
		if (row.success === true) total.successful += 1;
	}
	return points.map((point) => {
		const total = totals.get(point.bucket);
		return { ...point, value: total && total.total > 0 ? total.successful / total.total : 0 };
	});
}

function blendedPriceByBucket(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
}): ObservabilitySeriesPoint[] {
	const points = buildEmptySeries(args);
	const totals = new Map(points.map((point) => [point.bucket, { spend: 0, tokens: 0 }]));
	for (const row of args.rows) {
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const total = totals.get(floorToBucket(created, args.range).toISOString());
		if (!total) continue;
		total.spend += toNumber(row.cost_nanos) / 1e9;
		total.tokens += usageTokens(row.usage);
	}
	return points.map((point) => {
		const total = totals.get(point.bucket);
		return {
			...point,
			value: total && total.tokens > 0 ? (total.spend / total.tokens) * 1_000_000 : 0,
		};
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

function isByokRequest(row: RawRequestRow): boolean {
	const lines = Array.isArray(row.pricing_lines) ? row.pricing_lines : [];
	const searchable = JSON.stringify(lines).toLowerCase();
	const usageText = JSON.stringify(row.usage ?? {}).toLowerCase();
	return (
		searchable.includes("byok") ||
		searchable.includes("bring_your_own") ||
		usageText.includes("byok_key") ||
		usageText.includes("provider_key")
	);
}

function makeRankedItems(args: {
	rows: RawRequestRow[];
	previousRows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
	getId: (row: RawRequestRow) => string | null;
	getLabel: (id: string) => string;
	getSubtitle?: (id: string) => string | null | undefined;
	getImageUrl?: (id: string) => string | null | undefined;
	limit?: number;
}): ObservabilityRankedItem[] {
	const current = new Map<string, { tokens: number; requests: number; cost: number }>();
	const previous = new Map<string, number>();

	for (const row of args.rows) {
		const id = args.getId(row);
		if (!id) continue;
		const entry = current.get(id) ?? { tokens: 0, requests: 0, cost: 0 };
		entry.tokens += usageTokens(row.usage);
		entry.requests += 1;
		entry.cost += toNumber(row.cost_nanos) / 1e9;
		current.set(id, entry);
	}

	for (const row of args.previousRows) {
		const id = args.getId(row);
		if (!id) continue;
		previous.set(id, (previous.get(id) ?? 0) + usageTokens(row.usage));
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
				rows: args.rows.filter((row) => args.getId(row) === id),
				range: args.range,
				from: args.from,
				to: args.to,
				getValue: (row) => usageTokens(row.usage),
			}),
		}))
		.sort((a, b) => b.tokens - a.tokens)
		.slice(0, args.limit ?? 6);
}

function buildBreakdown(args: {
	rows: RawRequestRow[];
	getId: (row: RawRequestRow) => string | null;
	getLabel: (id: string) => string;
	getValue: (row: RawRequestRow) => number;
	limit?: number;
}) {
	const totals = new Map<string, number>();
	for (const row of args.rows) {
		const id = args.getId(row);
		if (!id) continue;
		totals.set(id, (totals.get(id) ?? 0) + args.getValue(row));
	}
	return Array.from(totals.entries())
		.map(([id, value]) => ({ id, label: args.getLabel(id), value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, args.limit ?? 8);
}

function buildTimeSeriesBreakdown(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
	getId: (row: RawRequestRow) => string | null;
	getLabel: (id: string) => string;
	getValue: (row: RawRequestRow) => number;
	limit?: number;
	includeOther?: boolean;
}): ObservabilityTimeSeriesChart {
	const totals = new Map<string, number>();
	for (const row of args.rows) {
		const id = args.getId(row);
		if (!id) continue;
		totals.set(id, (totals.get(id) ?? 0) + args.getValue(row));
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
					label: "Other",
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
	for (const row of args.rows) {
		const sourceId = args.getId(row);
		const id = sourceId
			? seriesIdBySourceId.get(sourceId) ?? (hasOther ? "other" : null)
			: null;
		if (!id) continue;
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const point = pointMap.get(floorToBucket(created, args.range).toISOString());
		if (!point) continue;
		point[id] = Number(point[id] ?? 0) + args.getValue(row);
	}
	return {
		series: chartSeries.map(({ id, label }) => ({ id, label })),
		data: points,
	};
}

function buildFixedTimeSeries(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	from: string;
	to: string;
	series: Array<{ id: string; label: string; color?: string }>;
	getValues: (row: RawRequestRow) => Record<string, number>;
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
	for (const row of args.rows) {
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const point = pointMap.get(floorToBucket(created, args.range).toISOString());
		if (!point) continue;
		const values = args.getValues(row);
		for (const item of args.series) {
			point[item.id] = Number(point[item.id] ?? 0) + (values[item.id] ?? 0);
		}
	}
	return { series: args.series, data: points };
}

function buildExploreRows(args: {
	rows: RawRequestRow[];
	range: ObservabilityRange;
	keyLabel: (id: string | null) => string;
	appLabel: (id: string | null) => string;
	modelLabel: (id: string | null) => string;
}): ObservabilityExploreRow[] {
	const grouped = new Map<string, ObservabilityExploreRow>();
	for (const row of args.rows) {
		const created = new Date(row.created_at);
		if (Number.isNaN(created.getTime())) continue;
		const bucket = formatBucketLabel(floorToBucket(created, args.range), args.range);
		const model = args.modelLabel(row.model_id);
		const apiKey = args.keyLabel(row.key_id);
		const app = args.appLabel(row.app_id);
		const provider = row.provider ?? "Unknown";
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
		const inputTokens = metricValue(row.usage, "input_tokens");
		const outputTokens = metricValue(row.usage, "output_tokens");
		const reasoningTokens =
			metricValue(row.usage, "reasoning_tokens") +
			metricValue(row.usage, "output_reasoning_tokens");
		const cachedTokens =
			metricValue(row.usage, "cache_read_tokens") +
			metricValue(row.usage, "cache_write_tokens");
		const tokens = usageTokens(row.usage);
		existing.requests += 1;
		existing.tokens += tokens;
		existing.inputTokens += inputTokens;
		existing.outputTokens += outputTokens;
		existing.reasoningTokens += reasoningTokens;
		existing.cachedTokens += cachedTokens;
		existing.uncachedTokens += Math.max(0, tokens - cachedTokens);
		existing.cost += toNumber(row.cost_nanos) / 1e9;
		existing.errors += row.success === false ? 1 : 0;
		grouped.set(key, existing);
	}
	return Array.from(grouped.values()).sort((a, b) => b.tokens - a.tokens);
}

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

export default function ObservabilityClient({ scope, initialTab }: { scope: AccountQueryScope; initialTab: ObservabilityTab }) {
	const sp = useSearchParams();
	const rangeKeys = getUsageRangeParamKeys();
	const presetParam = sp.get(rangeKeys.preset);
	const preset = presetParam
		? parseUsageRangePreset(presetParam)
		: parseLegacyRangePreset(sp.get("range"));
	const customFrom = parseUsageDateInput(sp.get(rangeKeys.from));
	const customTo = parseUsageDateInput(sp.get(rangeKeys.to));
	const labelKey = sp.get("label_key")?.trim() || "";
	const labelValue = sp.get("label_value")?.trim() || "";
	const query = usePrivateUsageQuery(scope, "observability", { preset, from: customFrom ?? "", to: customTo ?? "", labelKey, labelValue }, preset === "live", async (signal) => {
		const { from, to } = resolveUsageTimeRange({ preset, customFrom, customTo });
		const previousFrom = new Date(2 * new Date(from).getTime() - new Date(to).getTime()).toISOString();
		const params = new URLSearchParams({ workspaceId: scope.workspaceId!, from, to, previousFrom, previousTo: from });
		if (labelKey) params.set("label_key", labelKey);
		if (labelValue) params.set("label_value", labelValue);
		const path = `/api/account/settings/usage/observability?${params}` as const;
		const initial = await fetchPrivateUsage<SettingsObservabilityData>(path, scope, signal);
		if (!initial.signedIn) throw new WebApiError(path, 401);
		if (initial.workspaceId !== scope.workspaceId) throw new WebApiError(path, 403);
		return { initial, from, to };
	});
	return <PrivateUsageQuery query={query} scope={scope} live={preset === "live"}>{(snapshot) => <ObservabilityView snapshot={snapshot} initialTab={initialTab} preset={preset} customFrom={customFrom} customTo={customTo} />}</PrivateUsageQuery>;
}

const ObservabilityView = memo(function ObservabilityView({ snapshot: { initial, from, to }, initialTab, preset, customFrom, customTo }: {
	snapshot: { initial: SettingsObservabilityData; from: string; to: string };
	initialTab: ObservabilityTab;
	preset: UsageRangePreset;
	customFrom: string | null;
	customTo: string | null;
}) {
	const range = rangeForTimeWindow(from, to);
	const { keys, current: currentRequestResult, previous: previousRequestResult } = initial;
	const rawRows = currentRequestResult.rows;
	const previousRows = previousRequestResult.rows;

	const keyMap = new Map(keys.map((key) => [key.id, key]));
	const modelMetadata = new Map(initial.modelMetadataEntries);
	const appNames = new Map(initial.appNameEntries);
	const appMetadata = new Map(initial.appMetadataEntries);

	const modelLabel = (id: string | null) => {
		if (!id) return "Unknown model";
		const meta = modelMetadata.get(id);
		return meta?.modelName || id;
	};
	const keyLabel = (id: string | null) => {
		if (!id) return "No API key";
		const key = keyMap.get(id);
		return key?.name || key?.prefix || id;
	};
	const keySubtitle = (id: string) => {
		const key = keyMap.get(id);
		return key?.name && key?.prefix ? key.prefix : null;
	};
	const appLabel = (id: string | null) => {
		if (!id) return "No app";
		return appNames.get(id) || id;
	};
	const modelFilterOptions = Array.from(new Set(rawRows.flatMap((row) => {
		const id = row.model_id?.trim();
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

	const currentSpend = rawRows.reduce(
		(sum, row) => sum + toNumber(row.cost_nanos) / 1e9,
		0,
	);
	const previousSpend = previousRows.reduce(
		(sum, row) => sum + toNumber(row.cost_nanos) / 1e9,
		0,
	);
	const currentTokens = rawRows.reduce((sum, row) => sum + usageTokens(row.usage), 0);
	const previousTokens = previousRows.reduce(
		(sum, row) => sum + usageTokens(row.usage),
		0,
	);
	const currentCachedTokens = rawRows.reduce(
		(sum, row) =>
			sum +
			metricValue(row.usage, "cache_read_tokens") +
			metricValue(row.usage, "cache_write_tokens"),
		0,
	);
	const previousCachedTokens = previousRows.reduce(
		(sum, row) =>
			sum +
			metricValue(row.usage, "cache_read_tokens") +
			metricValue(row.usage, "cache_write_tokens"),
		0,
	);
	const currentBlendedPrice = currentTokens > 0 ? (currentSpend / currentTokens) * 1_000_000 : 0;
	const previousBlendedPrice = previousTokens > 0 ? (previousSpend / previousTokens) * 1_000_000 : 0;
	const currentSuccessRate = rawRows.length > 0
		? rawRows.filter((row) => row.success === true).length / rawRows.length
		: 0;
	const previousSuccessRate = previousRows.length > 0
		? previousRows.filter((row) => row.success === true).length / previousRows.length
		: 0;

	const kpis: ObservabilityKpi[] = [
		makeKpi({
			id: "spend",
			label: "Total Spend",
			value: currentSpend,
			previous: previousSpend,
			format: "currency",
			sparkline: sumByBucket({
				rows: rawRows,
				range,
				from,
				to,
				getValue: (row) => toNumber(row.cost_nanos) / 1e9,
			}),
		}),
		makeKpi({
			id: "requests",
			label: "Requests",
			value: rawRows.length,
			previous: previousRows.length,
			format: "number",
			sparkline: sumByBucket({
				rows: rawRows,
				range,
				from,
				to,
				getValue: () => 1,
			}),
		}),
		makeKpi({
			id: "tokens",
			label: "Tokens",
			value: currentTokens,
			previous: previousTokens,
			format: "number",
			sparkline: sumByBucket({
				rows: rawRows,
				range,
				from,
				to,
				getValue: (row) => usageTokens(row.usage),
			}),
		}),
		makeKpi({
			id: "cache",
			label: "Cache Hit Rate",
			value: currentTokens > 0 ? currentCachedTokens / currentTokens : 0,
			previous: previousTokens > 0 ? previousCachedTokens / previousTokens : 0,
			format: "percent",
			sparkline: cacheHitRateByBucket({
				rows: rawRows,
				range,
				from,
				to,
			}),
		}),
		makeKpi({
			id: "success_rate",
			label: "Success rate",
			value: currentSuccessRate,
			previous: previousSuccessRate,
			format: "percent",
			sparkline: successRateByBucket({ rows: rawRows, range, from, to }),
		}),
		makeKpi({
			id: "blended_price",
			label: "Blended price / 1M",
			value: currentBlendedPrice,
			previous: previousBlendedPrice,
			format: "currency_per_million",
			sparkline: blendedPriceByBucket({ rows: rawRows, range, from, to }),
		}),
	];

	const topApiKeys = makeRankedItems({
		rows: rawRows,
		previousRows,
		range,
		from,
		to,
		getId: (row) => row.key_id,
		getLabel: keyLabel,
		getSubtitle: keySubtitle,
		limit: 5,
	});
	const topApps = makeRankedItems({
		rows: rawRows,
		previousRows,
		range,
		from,
		to,
		getId: (row) => row.app_id,
		getLabel: appLabel,
		getImageUrl: (id) => appMetadata.get(id)?.imageUrl ?? null,
		limit: 5,
	});
	const trendingModels = makeRankedItems({
		rows: rawRows,
		previousRows,
		range,
		from,
		to,
		getId: (row) => row.model_id,
		getLabel: modelLabel,
	});

	const usageByModelCost = buildTimeSeriesBreakdown({
		rows: rawRows,
		range,
		from,
		to,
		getId: (row) => row.model_id,
		getLabel: modelLabel,
		getValue: (row) => toNumber(row.cost_nanos) / 1e9,
	});
	const requestVolumeByModel = buildTimeSeriesBreakdown({
		rows: rawRows,
		range,
		from,
		to,
		getId: (row) => row.model_id,
		getLabel: modelLabel,
		getValue: () => 1,
	});
	const trendChartArgs = {
		rows: rawRows,
		range,
		from,
		to,
		limit: 10,
		includeOther: true,
	};
	const modelTrendCharts = {
		spend: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.model_id,
			getLabel: modelLabel,
			getValue: (row) => toNumber(row.cost_nanos) / 1e9,
		}),
		requests: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.model_id,
			getLabel: modelLabel,
			getValue: () => 1,
		}),
		tokens: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.model_id,
			getLabel: modelLabel,
			getValue: (row) => usageTokens(row.usage),
		}),
	};
	const keyTrendCharts = {
		spend: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.key_id,
			getLabel: keyLabel,
			getValue: (row) => toNumber(row.cost_nanos) / 1e9,
		}),
		requests: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.key_id,
			getLabel: keyLabel,
			getValue: () => 1,
		}),
		tokens: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.key_id,
			getLabel: keyLabel,
			getValue: (row) => usageTokens(row.usage),
		}),
	};
	const appTrendCharts = {
		spend: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.app_id,
			getLabel: appLabel,
			getValue: (row) => toNumber(row.cost_nanos) / 1e9,
		}),
		requests: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.app_id,
			getLabel: appLabel,
			getValue: () => 1,
		}),
		tokens: buildTimeSeriesBreakdown({
			...trendChartArgs,
			getId: (row) => row.app_id,
			getLabel: appLabel,
			getValue: (row) => usageTokens(row.usage),
		}),
	};
	const usageTypeCost = buildFixedTimeSeries({
		rows: rawRows,
		range,
		from,
		to,
		series: [
			{ id: "phaseo", label: "Phaseo Credits", color: "#2563eb" },
			{ id: "byok", label: "BYOK", color: "#059669" },
		],
		getValues: (row) => {
			const cost = toNumber(row.cost_nanos) / 1e9;
			return isByokRequest(row)
				? { phaseo: 0, byok: cost }
				: { phaseo: cost, byok: 0 };
		},
	});
	const tokenSplit = buildFixedTimeSeries({
		rows: rawRows,
		range,
		from,
		to,
		series: [
			{ id: "input", label: "Input", color: "#2563eb" },
			{ id: "output", label: "Output", color: "#059669" },
			{ id: "reasoning", label: "Reasoning", color: "#d97706" },
		],
		getValues: (row) => ({
			input: metricValue(row.usage, "input_tokens"),
			output: metricValue(row.usage, "output_tokens"),
			reasoning:
				metricValue(row.usage, "reasoning_tokens") +
				metricValue(row.usage, "output_reasoning_tokens"),
		}),
	});
	const cacheSplit = buildFixedTimeSeries({
		rows: rawRows,
		range,
		from,
		to,
		series: [
			{ id: "cached", label: "Cached", color: "#059669" },
			{ id: "uncached", label: "Uncached", color: "#94a3b8" },
		],
		getValues: (row) => {
			const tokens = usageTokens(row.usage);
			const cached =
				metricValue(row.usage, "cache_read_tokens") +
				metricValue(row.usage, "cache_write_tokens");
			return {
				cached,
				uncached: Math.max(0, tokens - cached),
			};
		},
	});

	const data: ObservabilityData = {
		range,
		periodLabel: getUsageRangeLabel({ preset, customFrom, customTo }),
		isSampled: currentRequestResult.isSampled,
		sampleLimit: currentRequestResult.limit,
		kpis,
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
			spendOverTime: sumByBucket({
				rows: rawRows,
				range,
				from,
				to,
				getValue: (row) => toNumber(row.cost_nanos) / 1e9,
			}),
			trends: {
				models: modelTrendCharts,
				keys: keyTrendCharts,
				apps: appTrendCharts,
			},
		},
		filterOptions: {
			models: modelFilterOptions,
		},
		exploreRows: buildExploreRows({
			rows: rawRows,
			range,
			keyLabel,
			appLabel,
			modelLabel,
		}),
	};

	const guardrailMetrics: GuardrailEnforcementMetricsResult =
		buildGuardrailEnforcementMetrics({
			rows: rawRows.map((row) => ({
				createdAt: row.created_at,
				errorPayload: row.error_payload,
				errorMessage: row.error_message,
			})),
			timeRange: { from, to },
			range,
		});

	return (
		<ObservabilityHub
			data={data}
			guardrailMetrics={guardrailMetrics}
			initialTab={initialTab}
			labelFacets={initial.labelFacets}
			labelSummary={initial.labelSummary}
			preset={preset}
			customFrom={customFrom}
			customTo={customTo}
		/>
	);
});
