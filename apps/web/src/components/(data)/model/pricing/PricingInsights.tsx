"use client";

import { useEffect, useMemo, useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	Tooltip as RechartsTooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import {
	assignSeriesColours,
	keyForSeries,
} from "@/components/(rankings)/chart-colors";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import { formatProviderOfferDisplayName } from "@/lib/providers/providerOffers";

const INPUT_METER_PREFERENCE = ["input_text_tokens", "input_tokens"] as const;
const OUTPUT_METER_PREFERENCE = ["output_text_tokens", "output_tokens"] as const;
const HISTORY_DAYS = 30;
const DEFAULT_SERIES_COLOUR = "hsl(210 70% 55%)";
const BLENDED_METER = "__blended_text_tokens";
const HISTORY_METER_ORDER = [
	"input_text_tokens",
	"output_text_tokens",
	"cached_read_text_tokens",
	"cached_write_text_tokens",
] as const;

type EffectiveRow = {
	providerId: string;
	providerName: string;
	providerColour: string | null;
	inputPricePer1M: number | null;
	outputPricePer1M: number | null;
	inputTokens1h: number;
	outputTokens1h: number;
	cacheTokenPct1h: number | null;
};

type ConditionFacet = {
	fieldKey: string;
	fieldLabel: string;
	options: Array<{ value: string; label: string; sortKey?: number }>;
};

const MONTH_SHORT_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

function meterLabel(meter: string): string {
	if (meter === BLENDED_METER) return "Blended Tokens (90/10)";
	return meter
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function humanizeToken(value: string): string {
	return value
		.split(/[._\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function normalizeConditionField(fieldRaw: string): string {
	return fieldRaw
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, ".")
		.replace(/\.+/g, ".")
		.replace(/^\$?\./, "")
		.replace(/^video\.?params?\./, "")
		.replace(/^video\.?parameters?\./, "")
		.replace(/^params?\./, "")
		.replace(/^request\./, "")
		.replace(/^metadata\./, "")
		.replace(/^\./, "")
		.replace(/\.$/, "");
}

function isAudioField(fieldKey: string): boolean {
	const normalized = normalizeConditionField(fieldKey);
	return normalized === "audio" || normalized.endsWith(".audio");
}

function isResolutionField(fieldKey: string): boolean {
	const normalized = normalizeConditionField(fieldKey);
	return normalized === "resolution" || normalized.endsWith(".resolution");
}

function isQualityField(fieldKey: string): boolean {
	const normalized = normalizeConditionField(fieldKey);
	return normalized === "quality" || normalized.endsWith(".quality");
}

function stringifyConditionValue(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map((item) => stringifyConditionValue(item)).join("/");
	}
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	if (value == null) return "null";
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function fieldLabelForVariant(fieldKey: string): string {
	if (isAudioField(fieldKey)) return "Video Params - Audio";
	if (isResolutionField(fieldKey)) return "Resolution";
	if (fieldKey === "quality") return "Quality";
	if (fieldKey === "context") return "Context";
	return humanizeToken(fieldKey);
}

function normaliseConditionOperator(value: unknown): string {
	return String(value ?? "=").trim().toLowerCase();
}

function parseConditionValues(
	fieldKey: string,
	valueRaw: unknown,
): Array<{ value: string; label: string }> {
	const values = Array.isArray(valueRaw) ? valueRaw : [valueRaw];
	const parsed = values
		.map((value) => {
			const raw = stringifyConditionValue(value).trim();
			if (!raw) return null;
			const key = raw.toLowerCase();
			if (isAudioField(fieldKey)) {
				if (key === "true") return { value: "true", label: "True" };
				if (key === "false") return { value: "false", label: "False" };
			}
			if (isQualityField(fieldKey)) {
				if (key === "high") return { value: "high", label: "High" };
				if (key === "medium") return { value: "medium", label: "Medium" };
				if (key === "low") return { value: "low", label: "Low" };
				return { value: key, label: humanizeToken(raw) };
			}
			return { value: key, label: raw };
		})
		.filter((entry): entry is { value: string; label: string } => entry != null);

	const dedup = new Map<string, string>();
	for (const entry of parsed) {
		if (!dedup.has(entry.value)) dedup.set(entry.value, entry.label);
	}
	return Array.from(dedup.entries()).map(([value, label]) => ({ value, label }));
}

function extractRuleConditions(
	match: unknown[] | null | undefined,
): Array<{ fieldKey: string; fieldLabel: string; value: string; valueLabel: string }> {
	if (!Array.isArray(match) || !match.length) return [];
	const conditions: Array<{
		fieldKey: string;
		fieldLabel: string;
		value: string;
		valueLabel: string;
	}> = [];

	for (const item of match) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const raw = item as Record<string, unknown>;
		const fieldRaw = String(raw.field ?? raw.key ?? raw.path ?? raw.name ?? "").trim();
		if (!fieldRaw) continue;
		const fieldKey = normalizeConditionField(fieldRaw);
		if (!fieldKey) continue;
		const op = normaliseConditionOperator(raw.op ?? raw.operator ?? "=");
		if (!["=", "eq", "equals", "in"].includes(op)) continue;
		const valueRaw =
			raw.value ?? raw.expected ?? raw.equals ?? raw.eq ?? raw.target ?? raw.values;
		const values = parseConditionValues(fieldKey, valueRaw);
		for (const entry of values) {
			conditions.push({
				fieldKey,
				fieldLabel: fieldLabelForVariant(fieldKey),
				value: entry.value,
				valueLabel: entry.label,
			});
		}
	}

	return conditions;
}

function ruleMatchesFacetFilters(
	rule: ModelPricingHistoryRule,
	filters: Record<string, string>,
): boolean {
	const activeFilters = Object.entries(filters).filter(
		([, value]) => typeof value === "string" && value.length > 0,
	);
	if (!activeFilters.length) return true;

	const ruleConditions = extractRuleConditions(rule.match);
	const valuesByField = new Map<string, Set<string>>();
	for (const condition of ruleConditions) {
		const set = valuesByField.get(condition.fieldKey) ?? new Set<string>();
		set.add(condition.value);
		valuesByField.set(condition.fieldKey, set);
	}

	for (const [fieldKey, selectedValue] of activeFilters) {
		if (fieldKey === "context_length") {
			const context = extractContextLengthFacetOption(rule.match);
			if (!context || context.value !== selectedValue) return false;
			continue;
		}
		const supported = valuesByField.get(fieldKey);
		if (!supported || !supported.has(selectedValue)) return false;
	}
	return true;
}

function toCompactCount(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	const abs = Math.abs(value);
	if (abs >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`;
	}
	if (abs >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
	}
	if (abs >= 1_000) {
		return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
	}
	return `${Math.round(value)}`;
}

function toNumericMatchValue(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function isTokenLikePath(pathRaw: unknown): boolean {
	const path = String(pathRaw ?? "").toLowerCase();
	return path.includes("token") || path.includes("context");
}

function extractContextLengthFacetOption(
	match: unknown[] | null | undefined,
): { value: string; label: string; sortKey: number } | null {
	if (!Array.isArray(match) || match.length === 0) return null;

	let lower: number | null = null;
	let upper: number | null = null;
	let includeLower = false;
	let includeUpper = false;

	for (const item of match) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const raw = item as Record<string, unknown>;
		if (!isTokenLikePath(raw.path ?? raw.field ?? raw.key ?? raw.name)) continue;
		const op = normaliseConditionOperator(raw.op ?? raw.operator);
		const value =
			toNumericMatchValue(
				raw.value ?? raw.expected ?? raw.equals ?? raw.eq ?? raw.target,
			);
		if (value == null) continue;

		if (op === "gt" || op === ">") {
			if (lower == null || value > lower) {
				lower = value;
				includeLower = false;
			}
			continue;
		}
		if (op === "gte" || op === ">=") {
			if (lower == null || value > lower || (value === lower && !includeLower)) {
				lower = value;
				includeLower = true;
			}
			continue;
		}
		if (op === "lt" || op === "<") {
			if (upper == null || value < upper) {
				upper = value;
				includeUpper = false;
			}
			continue;
		}
		if (op === "lte" || op === "<=") {
			if (upper == null || value < upper || (value === upper && !includeUpper)) {
				upper = value;
				includeUpper = true;
			}
		}
	}

	if (lower == null && upper == null) return null;

	const lowerText = lower != null ? toCompactCount(lower) : "";
	const upperText = upper != null ? toCompactCount(upper) : "";
	let label = "";
	if (lower != null && upper != null) {
		label = `${includeLower ? "≥" : ">"} ${lowerText} to ${includeUpper ? "≤" : "<"} ${upperText}`;
	} else if (lower != null) {
		label = `${includeLower ? "≥" : ">"} ${lowerText}`;
	} else {
		label = `${includeUpper ? "≤" : "<"} ${upperText}`;
	}

	const value = `ctx:${lower ?? ""}:${includeLower ? 1 : 0}:${upper ?? ""}:${includeUpper ? 1 : 0}`;
	const sortKey = lower ?? (upper != null ? upper - 0.5 : Number.MAX_SAFE_INTEGER);
	return { value, label, sortKey };
}

function resolutionSortValue(label: string): number {
	const value = String(label ?? "").toLowerCase().trim();
	if (!value) return Number.POSITIVE_INFINITY;
	const pMatch = value.match(/(\d+(?:\.\d+)?)\s*p\b/i);
	if (pMatch) return Number(pMatch[1]);
	const kMatch = value.match(/(\d+(?:\.\d+)?)\s*k\b/i);
	if (kMatch) return Number(kMatch[1]) * 1000;
	const dimMatch = value.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
	if (dimMatch) {
		const a = Number(dimMatch[1]);
		const b = Number(dimMatch[2]);
		if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) return a * b;
	}
	const plainNumber = Number(value);
	if (Number.isFinite(plainNumber)) return plainNumber;
	return Number.POSITIVE_INFINITY;
}

function compareFacetOptionLabels(fieldKey: string, a: string, b: string): number {
	if (isQualityField(fieldKey)) {
		const qualityRank = (label: string): number => {
			const normalized = label.trim().toLowerCase();
			if (normalized === "high") return 0;
			if (normalized === "medium") return 1;
			if (normalized === "low") return 2;
			return Number.POSITIVE_INFINITY;
		};
		const aRank = qualityRank(a);
		const bRank = qualityRank(b);
		if (aRank !== bRank) return aRank - bRank;
	}
	if (isResolutionField(fieldKey)) {
		const av = resolutionSortValue(a);
		const bv = resolutionSortValue(b);
		if (Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return av - bv;
	}
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function pickDefaultFacetValue(facet: ConditionFacet): string {
	if (!facet.options.length) return "";

	if (isAudioField(facet.fieldKey)) {
		const trueOption = facet.options.find((option) => option.value === "true");
		if (trueOption) return trueOption.value;
	}

	if (isResolutionField(facet.fieldKey)) {
		const finiteOptions = facet.options
			.map((option) => ({
				option,
				order: resolutionSortValue(option.label),
			}))
			.filter(({ order }) => Number.isFinite(order))
			.sort((a, b) => a.order - b.order);
		if (finiteOptions.length) {
			return finiteOptions[finiteOptions.length - 1].option.value;
		}
	}

	if (facet.fieldKey === "context_length") {
		const withSortKey = facet.options
			.filter(
				(option): option is { value: string; label: string; sortKey: number } =>
					typeof option.sortKey === "number" && Number.isFinite(option.sortKey),
			)
			.sort((a, b) => a.sortKey - b.sortKey);
		if (withSortKey.length) return withSortKey[0].value;
	}

	return facet.options[0]?.value ?? "";
}

function normaliseUnit(unit: string | null | undefined): string {
	const value = String(unit ?? "").trim().toLowerCase();
	return value || "token";
}

function unitLabelPlural(unit: string): string {
	const normalized = normaliseUnit(unit);
	if (normalized.endsWith("s")) return normalized;
	if (normalized.endsWith("y") && normalized.length > 1) {
		return `${normalized.slice(0, -1)}ies`;
	}
	return `${normalized}s`;
}

function unitLabelSingular(unit: string): string {
	const normalized = normaliseUnit(unit);
	if (normalized.endsWith("ies") && normalized.length > 3) {
		return `${normalized.slice(0, -3)}y`;
	}
	if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
		return normalized.slice(0, -1);
	}
	return normalized;
}

function formatUnitSizeForLabel(unitSize: number): string {
	if (!Number.isFinite(unitSize) || unitSize <= 0) return "1";
	if (unitSize === 1_000_000) return "1M";
	if (unitSize === 1_000) return "1K";
	return new Intl.NumberFormat("en-US").format(unitSize);
}

function buildPriceDenominatorLabel(unit: string, unitSize: number): string {
	const normalizedUnit = normaliseUnit(unit);
	if (unitSize <= 1) {
		return unitLabelSingular(normalizedUnit);
	}
	return `${formatUnitSizeForLabel(unitSize)} ${unitLabelPlural(normalizedUnit)}`;
}

function pickMeterDisplayScale(
	rules: ModelPricingHistoryRule[],
	meter: string,
): { unit: string; unitSize: number } {
	if (meter === BLENDED_METER) {
		return { unit: "token", unitSize: 1_000_000 };
	}

	const counts = new Map<string, number>();
	for (const rule of rules) {
		if (rule.meter !== meter) continue;
		const unit = normaliseUnit(rule.unit);
		const unitSize = Number(rule.unitSize);
		if (!Number.isFinite(unitSize) || unitSize <= 0) continue;
		const key = `${unit}:${unitSize}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	if (!counts.size) {
		return { unit: "token", unitSize: 1_000_000 };
	}

	const bestKey = [...counts.entries()].sort((a, b) => {
		if (a[1] !== b[1]) return b[1] - a[1];
		const [aUnit, aSizeRaw] = a[0].split(":");
		const [bUnit, bSizeRaw] = b[0].split(":");
		const aSize = Number(aSizeRaw);
		const bSize = Number(bSizeRaw);
		if (aUnit !== bUnit) return aUnit.localeCompare(bUnit);
		return aSize - bSize;
	})[0][0];

	const [unit, unitSizeRaw] = bestKey.split(":");
	const unitSize = Number(unitSizeRaw);
	return {
		unit: normaliseUnit(unit),
		unitSize: Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
	};
}

function toDisplayPrice(
	rule: ModelPricingHistoryRule | null | undefined,
	scale: { unit: string; unitSize: number },
): number | null {
	if (!rule) return null;
	if (normaliseUnit(rule.unit) !== normaliseUnit(scale.unit)) return null;
	const sourceUnitSize = Number(rule.unitSize);
	if (!Number.isFinite(sourceUnitSize) || sourceUnitSize <= 0) return null;
	return rule.pricePerUnit * (scale.unitSize / sourceUnitSize);
}

function toPricePer1M(pricePerUnit: number, unitSize: number): number | null {
	if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) return null;
	if (!Number.isFinite(unitSize) || unitSize <= 0) return null;
	return pricePerUnit * (1_000_000 / unitSize);
}

function formatUsd(value: number | null, digits = 3): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(value);
}

function formatUsdAdaptive(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "--";
	const abs = Math.abs(value);
	if (abs < 0.000001) {
		return formatUsd(0, 3);
	}
	const digits =
		abs >= 1 ? 3 : abs >= 0.01 ? 4 : 6;
	return formatUsd(value, digits);
}

function formatPct(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function formatDayLabel(day: string): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime())) return day;
	const dayNumber = String(date.getUTCDate()).padStart(2, "0");
	const month = MONTH_SHORT_LABELS[date.getUTCMonth()] ?? "";
	return `${dayNumber} ${month}`;
}

function formatDayNumber(day: string): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime())) return day;
	return String(date.getUTCDate());
}

function formatMonthShort(day: string): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime())) return "";
	return MONTH_SHORT_LABELS[date.getUTCMonth()] ?? "";
}

function buildMonthAxisMeta(dayBuckets: string[]): {
	monthCenterTicks: string[];
	monthLabelByTick: Record<string, string>;
} {
	if (!dayBuckets.length) {
		return { monthCenterTicks: [], monthLabelByTick: {} };
	}

	const monthCenterTicks: string[] = [];
	const monthLabelByTick: Record<string, string> = {};

	let startIndex = 0;
	while (startIndex < dayBuckets.length) {
		const monthLabel = formatMonthShort(dayBuckets[startIndex]);
		let endIndex = startIndex;
		while (endIndex + 1 < dayBuckets.length) {
			const nextMonth = formatMonthShort(dayBuckets[endIndex + 1]);
			if (nextMonth !== monthLabel) break;
			endIndex += 1;
		}

		const centerIndex = Math.floor((startIndex + endIndex) / 2);
		const centerDay = dayBuckets[centerIndex];
		monthCenterTicks.push(centerDay);
		monthLabelByTick[centerDay] = monthLabel;

		startIndex = endIndex + 1;
	}

	return { monthCenterTicks, monthLabelByTick };
}

function toDayKey(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function buildDayBuckets(days: number): string[] {
	const buckets: string[] = [];
	const now = new Date();
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	start.setUTCDate(start.getUTCDate() - (days - 1));

	for (let i = 0; i < days; i += 1) {
		const day = new Date(start);
		day.setUTCDate(start.getUTCDate() + i);
		buckets.push(toDayKey(day));
	}
	return buckets;
}

function toMs(value: string | null | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function normaliseProviderColour(value: string | null | undefined): string | null {
	const raw = String(value ?? "").trim();
	if (!raw) return null;
	const hex = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (hex) return raw;
	const cssLike = raw.match(/^(rgb|rgba|hsl|hsla)\(.+\)$/i);
	if (cssLike) return raw;
	return null;
}

function pickPlanMeterPricePer1M(
	provider: ProviderPricing,
	plan: string,
	meterPreference: readonly string[],
): number | null {
	const planRules = provider.pricing_rules.filter(
		(rule) => (rule.pricing_plan || "standard") === plan,
	);
	for (const meter of meterPreference) {
		const candidates = planRules
			.filter((rule) => String(rule.meter ?? "").toLowerCase() === meter)
			.map((rule) =>
				toPricePer1M(
					Number(rule.price_per_unit),
					Number(rule.unit_size ?? 1),
				),
			)
			.filter((value): value is number => value != null);
		if (candidates.length > 0) {
			return Math.min(...candidates);
		}
	}
	return null;
}

function chooseRuleForTimestamp(
	rules: ModelPricingHistoryRule[],
	targetMs: number,
): ModelPricingHistoryRule | null {
	const active = rules.filter((rule) => {
		const fromMs = toMs(rule.effectiveFrom, Number.NEGATIVE_INFINITY);
		const toMsValue = toMs(rule.effectiveTo, Number.POSITIVE_INFINITY);
		return targetMs >= fromMs && targetMs < toMsValue;
	});
	if (!active.length) return null;
	return active.sort((a, b) => {
		if (a.priority !== b.priority) return b.priority - a.priority;
		const aFrom = toMs(a.effectiveFrom, Number.NEGATIVE_INFINITY);
		const bFrom = toMs(b.effectiveFrom, Number.NEGATIVE_INFINITY);
		if (aFrom !== bFrom) return bFrom - aFrom;
		return a.pricePer1MUnits - b.pricePer1MUnits;
	})[0];
}

function sortProviderIdsByName(
	providerIds: string[],
	nameById: Map<string, string>,
): string[] {
	return [...providerIds].sort((a, b) => {
		const aName = nameById.get(a) ?? a;
		const bName = nameById.get(b) ?? b;
		return aName.localeCompare(bName);
	});
}

function providerActiveWindowMs(provider: ProviderPricing): {
	startMs: number;
	endMs: number;
} {
	let startMs = Number.POSITIVE_INFINITY;
	let endMs = Number.NEGATIVE_INFINITY;
	let sawWindow = false;

	for (const model of provider.provider_models) {
		const fromMs = toMs(model.effective_from, Number.NEGATIVE_INFINITY);
		const toMsValue = toMs(model.effective_to, Number.POSITIVE_INFINITY);
		startMs = Math.min(startMs, fromMs);
		endMs = Math.max(endMs, toMsValue);
		sawWindow = true;
	}

	if (!sawWindow) {
		return {
			startMs: Number.NEGATIVE_INFINITY,
			endMs: Number.POSITIVE_INFINITY,
		};
	}

	return {
		startMs,
		endMs,
	};
}

export default function PricingInsights({
	providers,
	plan,
	availablePlans = [],
	onPlanChange,
	showPlanInEffectiveHeader = false,
	runtimeStats,
	historyRules,
}: {
	providers: ProviderPricing[];
	plan: string;
	availablePlans?: string[];
	onPlanChange?: (plan: string) => void;
	showPlanInEffectiveHeader?: boolean;
	runtimeStats: ProviderRuntimeStatsMap;
	historyRules: ModelPricingHistoryRule[];
}) {
	const providerDisplayNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const provider of providers) {
			const providerId = provider.provider.api_provider_id;
			if (!providerId) continue;
			map.set(
				providerId,
				formatProviderOfferDisplayName({
					providerId,
					providerName:
						provider.provider.api_provider_name ||
						provider.provider.api_provider_id,
					offerLabel: provider.provider.offer_label ?? null,
					offerScope: provider.provider.offer_scope ?? null,
				}) || providerId,
			);
		}
		return map;
	}, [providers]);

	const providerColourById = useMemo(() => {
		const map = new Map<string, string>();
		for (const provider of providers) {
			const providerId = provider.provider.api_provider_id;
			const colour = normaliseProviderColour(provider.provider.colour);
			if (!providerId || !colour) continue;
			map.set(providerId, colour);
		}
		return map;
	}, [providers]);

	const fallbackProviderColours = useMemo(
		() =>
			assignSeriesColours(
				providers.map((provider) => provider.provider.api_provider_id),
			),
		[providers],
	);

	const effectiveRows = useMemo(() => {
		return providers
			.map((provider) => {
				const providerId = provider.provider.api_provider_id;
				const inputPricePer1M = pickPlanMeterPricePer1M(
					provider,
					plan,
					INPUT_METER_PREFERENCE,
				);
				const outputPricePer1M = pickPlanMeterPricePer1M(
					provider,
					plan,
					OUTPUT_METER_PREFERENCE,
				);
				const inputTokens1h = Number(runtimeStats[providerId]?.inputTokens1h ?? 0);
				const outputTokens1h = Number(runtimeStats[providerId]?.outputTokens1h ?? 0);

				return {
					providerId,
					providerName:
						providerDisplayNameById.get(providerId) ?? provider.provider.api_provider_id,
					providerColour:
						providerColourById.get(providerId) ??
						fallbackProviderColours[providerId]?.stroke ??
						DEFAULT_SERIES_COLOUR,
					inputPricePer1M,
					outputPricePer1M,
					inputTokens1h,
					outputTokens1h,
					cacheTokenPct1h:
						runtimeStats[providerId]?.cacheTokenPct1h ??
						null,
				} satisfies EffectiveRow;
			})
			.sort((a, b) => a.providerName.localeCompare(b.providerName));
	}, [
		plan,
		providers,
		runtimeStats,
		providerColourById,
		fallbackProviderColours,
		providerDisplayNameById,
	]);

	const effectiveSummary = useMemo(() => {
		let inputCostUsd = 0;
		let outputCostUsd = 0;
		let pricedInputTokens = 0;
		let pricedOutputTokens = 0;

		for (const row of effectiveRows) {
			if (row.inputPricePer1M != null && row.inputTokens1h > 0) {
				inputCostUsd += row.inputPricePer1M * (row.inputTokens1h / 1_000_000);
				pricedInputTokens += row.inputTokens1h;
			}
			if (row.outputPricePer1M != null && row.outputTokens1h > 0) {
				outputCostUsd += row.outputPricePer1M * (row.outputTokens1h / 1_000_000);
				pricedOutputTokens += row.outputTokens1h;
			}
		}

		return {
			weightedInputPricePer1M:
				pricedInputTokens > 0
					? (inputCostUsd / pricedInputTokens) * 1_000_000
					: null,
			weightedOutputPricePer1M:
				pricedOutputTokens > 0
					? (outputCostUsd / pricedOutputTokens) * 1_000_000
					: null,
		};
	}, [effectiveRows]);

	const scopedHistoryRules = useMemo(() => {
		return historyRules.filter((rule) => rule.pricingPlan === plan);
	}, [historyRules, plan]);

	const meterOptions = useMemo(() => {
		const availableMeters = new Set(
			scopedHistoryRules.map((rule) => rule.meter).filter(Boolean),
		);
		const options: string[] = [];
		const hasInputText = availableMeters.has("input_text_tokens");
		const hasOutputText = availableMeters.has("output_text_tokens");
		if (hasInputText && hasOutputText) {
			options.push(BLENDED_METER);
		}
		for (const meter of HISTORY_METER_ORDER) {
			if (availableMeters.has(meter)) {
				options.push(meter);
			}
		}

		const knownMeters = new Set<string>(HISTORY_METER_ORDER);
		const remainingMeters = Array.from(availableMeters)
			.filter((meter) => !knownMeters.has(meter))
			.sort((a, b) => meterLabel(a).localeCompare(meterLabel(b)));
		options.push(...remainingMeters);
		return options;
	}, [scopedHistoryRules]);

	const [selectedMeter, setSelectedMeter] = useState<string>("");
	const [selectedConditionValues, setSelectedConditionValues] = useState<
		Record<string, string>
	>({});

	useEffect(() => {
		if (!meterOptions.length) {
			setSelectedMeter("");
			return;
		}
		if (meterOptions.includes(selectedMeter)) return;
		setSelectedMeter(meterOptions[0]);
	}, [meterOptions, selectedMeter]);

	useEffect(() => {
		setSelectedConditionValues({});
	}, [selectedMeter]);

	const conditionFacets = useMemo((): ConditionFacet[] => {
		if (!selectedMeter || selectedMeter === BLENDED_METER) return [];
		const facetMap = new Map<
			string,
			{ fieldLabel: string; options: Map<string, { label: string; sortKey?: number }> }
		>();

		for (const rule of scopedHistoryRules) {
			if (rule.meter !== selectedMeter) continue;
			const conditions = extractRuleConditions(rule.match);
			for (const condition of conditions) {
				const facet = facetMap.get(condition.fieldKey) ?? {
					fieldLabel: condition.fieldLabel,
					options: new Map<string, { label: string; sortKey?: number }>(),
				};
				if (!facet.options.has(condition.value)) {
					facet.options.set(condition.value, { label: condition.valueLabel });
				}
				facetMap.set(condition.fieldKey, facet);
			}
			const contextOption = extractContextLengthFacetOption(rule.match);
			if (contextOption) {
				const facet = facetMap.get("context_length") ?? {
					fieldLabel: "Context Length",
					options: new Map<string, { label: string; sortKey?: number }>(),
				};
				if (!facet.options.has(contextOption.value)) {
					facet.options.set(contextOption.value, {
						label: contextOption.label,
						sortKey: contextOption.sortKey,
					});
				}
				facetMap.set("context_length", facet);
			}
		}

		const preferredOrder = [
			"context_length",
			"resolution",
			"audio",
			"quality",
			"context",
		];
		return Array.from(facetMap.entries())
			.map(([fieldKey, data]) => ({
				fieldKey,
				fieldLabel: data.fieldLabel,
				options: Array.from(data.options.entries())
					.map(([value, option]) => ({
						value,
						label: option.label,
						sortKey: option.sortKey,
					}))
					.sort((a, b) => {
						if (
							typeof a.sortKey === "number" &&
							typeof b.sortKey === "number" &&
							a.sortKey !== b.sortKey
						) {
							return a.sortKey - b.sortKey;
						}
						return compareFacetOptionLabels(fieldKey, a.label, b.label);
					}),
			}))
			.filter((facet) => facet.options.length > 1)
			.sort((a, b) => {
				const aOrder = preferredOrder.indexOf(a.fieldKey);
				const bOrder = preferredOrder.indexOf(b.fieldKey);
				if (aOrder >= 0 || bOrder >= 0) {
					if (aOrder < 0) return 1;
					if (bOrder < 0) return -1;
					return aOrder - bOrder;
				}
				return a.fieldLabel.localeCompare(b.fieldLabel);
			});
	}, [scopedHistoryRules, selectedMeter]);

	useEffect(() => {
		setSelectedConditionValues((current) => {
			const next: Record<string, string> = {};
			for (const facet of conditionFacets) {
				const existing = current[facet.fieldKey];
				if (existing && facet.options.some((option) => option.value === existing)) {
					next[facet.fieldKey] = existing;
				} else {
					next[facet.fieldKey] = pickDefaultFacetValue(facet);
				}
			}
			return next;
		});
	}, [conditionFacets]);

	const historyChartState = useMemo(() => {
		if (!selectedMeter) {
			return {
				chartConfig: {} as ChartConfig,
				chartData: [] as Array<Record<string, string | number | null>>,
				seriesKeys: [] as string[],
				hasData: false,
				providerNameBySeries: new Map<string, string>(),
				monthCenterTicks: [] as string[],
				monthLabelByTick: {} as Record<string, string>,
				priceDenominatorLabel: "1M tokens",
				priceAxisLabel: "USD per 1M tokens",
			};
		}
		const rulesForSelectedContext =
			selectedMeter === BLENDED_METER
				? scopedHistoryRules
				: scopedHistoryRules.filter(
						(rule) =>
							rule.meter === selectedMeter &&
							ruleMatchesFacetFilters(rule, selectedConditionValues),
					);
		const displayScale = pickMeterDisplayScale(rulesForSelectedContext, selectedMeter);
		const priceDenominatorLabel = buildPriceDenominatorLabel(
			displayScale.unit,
			displayScale.unitSize,
		);
		const priceAxisLabel = `USD per ${priceDenominatorLabel}`;

		const providerNameById = new Map<string, string>();
		for (const rule of scopedHistoryRules) {
			providerNameById.set(
				rule.providerId,
				providerDisplayNameById.get(rule.providerId) ?? rule.providerName,
			);
		}

		let providerIds: string[] = [];
		let rulesByProvider = new Map<string, ModelPricingHistoryRule[]>();
		let blendedInputByProvider = new Map<string, ModelPricingHistoryRule[]>();
		let blendedOutputByProvider = new Map<string, ModelPricingHistoryRule[]>();

		if (selectedMeter === BLENDED_METER) {
			for (const rule of scopedHistoryRules) {
				if (rule.meter === "input_text_tokens") {
					const list = blendedInputByProvider.get(rule.providerId) ?? [];
					list.push(rule);
					blendedInputByProvider.set(rule.providerId, list);
				}
				if (rule.meter === "output_text_tokens") {
					const list = blendedOutputByProvider.get(rule.providerId) ?? [];
					list.push(rule);
					blendedOutputByProvider.set(rule.providerId, list);
				}
			}
			providerIds = sortProviderIdsByName(
				Array.from(
					new Set([
						...blendedInputByProvider.keys(),
						...blendedOutputByProvider.keys(),
					]),
				),
				providerNameById,
			);
		} else {
			const rulesForMeter = rulesForSelectedContext;
			for (const rule of rulesForMeter) {
				const list = rulesByProvider.get(rule.providerId) ?? [];
				list.push(rule);
				rulesByProvider.set(rule.providerId, list);
			}
			providerIds = sortProviderIdsByName(
				Array.from(rulesByProvider.keys()),
				providerNameById,
			);
		}

		const nowMs = Date.now();
		const currentPriceByProvider = new Map<string, number | null>();
		for (const providerId of providerIds) {
			if (selectedMeter === BLENDED_METER) {
				const inputRule = chooseRuleForTimestamp(
					blendedInputByProvider.get(providerId) ?? [],
					nowMs,
				);
				const outputRule = chooseRuleForTimestamp(
					blendedOutputByProvider.get(providerId) ?? [],
					nowMs,
				);
				currentPriceByProvider.set(
					providerId,
					inputRule && outputRule
						? (inputRule.pricePer1MUnits * 9 + outputRule.pricePer1MUnits) / 10
						: null,
				);
				continue;
			}
			const rule = chooseRuleForTimestamp(
				rulesByProvider.get(providerId) ?? [],
				nowMs,
			);
			currentPriceByProvider.set(providerId, toDisplayPrice(rule, displayScale));
		}
		providerIds = [...providerIds].sort((a, b) => {
			const aValue = currentPriceByProvider.get(a);
			const bValue = currentPriceByProvider.get(b);
			const aHas = typeof aValue === "number" && Number.isFinite(aValue);
			const bHas = typeof bValue === "number" && Number.isFinite(bValue);
			if (aHas && bHas && aValue !== bValue) return bValue - aValue;
			if (aHas && !bHas) return -1;
			if (!aHas && bHas) return 1;
			const aName = providerNameById.get(a) ?? a;
			const bName = providerNameById.get(b) ?? b;
			return aName.localeCompare(bName);
		});
		const providerWindowById = new Map<string, { startMs: number; endMs: number }>();
		for (const provider of providers) {
			const providerId = provider.provider.api_provider_id;
			providerWindowById.set(providerId, providerActiveWindowMs(provider));
		}

		const fallbackColours = assignSeriesColours(providerIds);
		const seriesKeyByProvider = Object.fromEntries(
			providerIds.map((providerId) => [providerId, keyForSeries(providerId)]),
		) as Record<string, string>;
		const providerNameBySeries = new Map<string, string>();
		for (const providerId of providerIds) {
			providerNameBySeries.set(
				seriesKeyByProvider[providerId],
				providerNameById.get(providerId) ?? providerId,
			);
		}

		const chartConfig = Object.fromEntries(
			providerIds.map((providerId) => {
				const seriesKey = seriesKeyByProvider[providerId];
				return [
					seriesKey,
					{
						label: providerNameById.get(providerId) ?? providerId,
						color:
							providerColourById.get(providerId) ??
							fallbackColours[providerId]?.stroke ??
							DEFAULT_SERIES_COLOUR,
					},
				];
			}),
		) as ChartConfig;

		const dayBuckets = buildDayBuckets(HISTORY_DAYS);
		const { monthCenterTicks, monthLabelByTick } = buildMonthAxisMeta(dayBuckets);

		const chartData = dayBuckets.map((day) => {
			const dayMidpointMs = Date.parse(`${day}T12:00:00.000Z`);
			const row: Record<string, string | number | null> = { day };
			for (const providerId of providerIds) {
				const seriesKey = seriesKeyByProvider[providerId];
				const window = providerWindowById.get(providerId) ?? {
					startMs: Number.NEGATIVE_INFINITY,
					endMs: Number.POSITIVE_INFINITY,
				};
				if (dayMidpointMs < window.startMs || dayMidpointMs >= window.endMs) {
					row[seriesKey] = null;
					continue;
				}
				const selectedRule = chooseRuleForTimestamp(
					rulesByProvider.get(providerId) ?? [],
					dayMidpointMs,
				);
				if (selectedMeter === BLENDED_METER) {
					const inputRule = chooseRuleForTimestamp(
						blendedInputByProvider.get(providerId) ?? [],
						dayMidpointMs,
					);
					const outputRule = chooseRuleForTimestamp(
						blendedOutputByProvider.get(providerId) ?? [],
						dayMidpointMs,
					);
					if (inputRule && outputRule) {
						row[seriesKey] =
							(inputRule.pricePer1MUnits * 9 + outputRule.pricePer1MUnits) / 10;
					} else {
						row[seriesKey] = null;
					}
					continue;
				}
				row[seriesKey] = toDisplayPrice(selectedRule, displayScale);
			}
			return row;
		});

		const seriesKeys = providerIds.map((providerId) => seriesKeyByProvider[providerId]);
		const hasData = chartData.some((row) =>
			seriesKeys.some((seriesKey) => {
				const value = row[seriesKey];
				return typeof value === "number" && Number.isFinite(value);
			}),
		);

		return {
			chartConfig,
			chartData,
			seriesKeys,
			hasData,
			providerNameBySeries,
			monthCenterTicks,
			monthLabelByTick,
			priceDenominatorLabel,
			priceAxisLabel,
		};
	}, [
		scopedHistoryRules,
		selectedMeter,
		selectedConditionValues,
		providerColourById,
		providerDisplayNameById,
		providers,
	]);

	return (
		<div className="space-y-6">
			<section className="space-y-4">
				<div
					className={
						showPlanInEffectiveHeader && availablePlans.length > 1 && onPlanChange
							? "flex flex-wrap items-start justify-between gap-3"
							: "space-y-1"
					}
				>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">Effective Pricing</h2>
						<p className="text-xs text-muted-foreground">
							Based on the last hour of usage: we total provider spend, divide by
							total token volume, and express it as USD per 1M tokens. Providers
							with more traffic naturally carry more weight.
						</p>
					</div>
					{showPlanInEffectiveHeader && availablePlans.length > 1 && onPlanChange ? (
						<PricingPlanSelect
							value={plan}
							onChange={onPlanChange}
							plans={availablePlans}
						/>
					) : null}
				</div>

				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<Card className="px-4 py-3">
						<p className="text-sm text-muted-foreground">Weighted Avg Input Price</p>
						<p className="text-xl font-semibold">
							{formatUsd(effectiveSummary.weightedInputPricePer1M)}
						</p>
						<p className="text-xs text-muted-foreground">per 1M tokens (past hour)</p>
					</Card>
					<Card className="px-4 py-3">
						<p className="text-sm text-muted-foreground">Weighted Avg Output Price</p>
						<p className="text-xl font-semibold">
							{formatUsd(effectiveSummary.weightedOutputPricePer1M)}
						</p>
						<p className="text-xs text-muted-foreground">per 1M tokens (past hour)</p>
					</Card>
				</div>

				<div className="overflow-hidden rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Provider</TableHead>
								<TableHead className="text-center">Input $/Million</TableHead>
								<TableHead className="text-center">Output $/Million</TableHead>
								<TableHead className="text-center">Cache Token %</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{effectiveRows.map((row) => (
								<TableRow key={row.providerId}>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											<span
												className="size-2 shrink-0 rounded-full"
												style={{
													backgroundColor:
														row.providerColour ?? DEFAULT_SERIES_COLOUR,
												}}
											/>
											<span>{row.providerName}</span>
										</div>
									</TableCell>
									<TableCell className="text-center tabular-nums">
										{formatUsd(row.inputPricePer1M)}
									</TableCell>
									<TableCell className="text-center tabular-nums">
										{formatUsd(row.outputPricePer1M)}
									</TableCell>
									<TableCell className="text-center tabular-nums">
										{formatPct(row.cacheTokenPct1h)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</section>

			<section className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-lg font-semibold">Pricing History</h2>
						<div className="flex flex-wrap items-center gap-3">
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">
								Meter
								</p>
							<Select
								value={selectedMeter || undefined}
								onValueChange={setSelectedMeter}
								disabled={meterOptions.length === 0}
							>
								<SelectTrigger className="h-9 w-[240px] bg-background">
									<SelectValue placeholder="Select meter" />
								</SelectTrigger>
								<SelectContent>
									{meterOptions.map((meter) => (
										<SelectItem key={meter} value={meter}>
											{meterLabel(meter)}
										</SelectItem>
									))}
								</SelectContent>
								</Select>
							</div>
							{conditionFacets.map((facet) => (
								<div key={facet.fieldKey} className="space-y-1">
									<p className="text-xs font-medium text-muted-foreground">
										{facet.fieldLabel}
									</p>
									<Select
										value={
											selectedConditionValues[facet.fieldKey] ??
											pickDefaultFacetValue(facet)
										}
										onValueChange={(value) =>
											setSelectedConditionValues((current) => ({
												...current,
												[facet.fieldKey]: value,
											}))
										}
									>
										<SelectTrigger className="h-9 w-[180px] bg-background">
											<SelectValue placeholder={facet.fieldLabel} />
										</SelectTrigger>
										<SelectContent>
											{facet.options.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							))}
						</div>
					</div>

				{historyChartState.seriesKeys.length > 0 && historyChartState.hasData ? (
					<div className="rounded-md border p-4">
						<ChartContainer
							config={historyChartState.chartConfig}
							className="h-[320px] w-full"
						>
							<LineChart
								data={historyChartState.chartData}
								margin={{ top: 14, right: 8, left: 8, bottom: 22 }}
							>
								<CartesianGrid vertical={false} className="stroke-muted" />
								<XAxis
									xAxisId="days"
									dataKey="day"
									tickFormatter={(value) => formatDayNumber(String(value))}
									tick={{
										fill: "var(--chart-axis-color)",
										fontSize: 12,
									}}
									tickLine={false}
									axisLine={false}
									minTickGap={16}
									height={20}
									tickMargin={6}
								/>
								<XAxis
									xAxisId="months"
									dataKey="day"
									ticks={historyChartState.monthCenterTicks}
									tickFormatter={(value) =>
										historyChartState.monthLabelByTick[String(value)] ?? ""
									}
									tick={{
										fill: "var(--chart-axis-color)",
										fontSize: 12,
									}}
									interval={0}
									tickLine={false}
									axisLine={false}
									height={24}
									tickMargin={10}
									minTickGap={0}
									allowDuplicatedCategory={false}
								/>
								<YAxis
									tickFormatter={(value) => formatUsdAdaptive(Number(value))}
									tick={{
										fill: "var(--chart-axis-color)",
										fontSize: 12,
									}}
									tickLine={false}
									axisLine={false}
									width={128}
									label={{
										value: historyChartState.priceAxisLabel,
										angle: -90,
										position: "insideLeft",
										style: {
											textAnchor: "middle",
											fill: "var(--chart-axis-color)",
											fontSize: 12,
										},
									}}
								/>
								<RechartsTooltip
									isAnimationActive={false}
									content={({ active, payload, label }) => {
										if (!active || !payload || payload.length === 0) return null;
										const payloadDay = payload[0]?.payload?.day;
										const tooltipDay =
											typeof payloadDay === "string"
												? payloadDay
												: String(label ?? "");
										const seriesOrder = new Map(
											historyChartState.seriesKeys.map((key, index) => [key, index]),
										);
										const orderedPayload = [...payload].sort((a, b) => {
											const aKey = String(a.dataKey ?? "");
											const bKey = String(b.dataKey ?? "");
											const aOrder = seriesOrder.get(aKey) ?? Number.MAX_SAFE_INTEGER;
											const bOrder = seriesOrder.get(bKey) ?? Number.MAX_SAFE_INTEGER;
											return aOrder - bOrder;
										});
										return (
											<div className="rounded-md border bg-background px-2.5 py-2 text-xs shadow-sm">
												<p className="mb-1 font-medium">
													{formatDayLabel(tooltipDay)}
												</p>
												<div className="space-y-1">
													{orderedPayload.map((entry) => {
														const key = String(entry.dataKey ?? "");
														const providerName =
															historyChartState.providerNameBySeries.get(key) ??
															key;
														const value = Number(entry.value ?? Number.NaN);
														if (!Number.isFinite(value)) return null;
														return (
															<div
																key={key}
																className="flex items-center justify-between gap-3"
															>
																<div className="flex items-center gap-2 text-foreground">
																	<span
																		className="size-2 rounded-full"
																		style={{
																			backgroundColor:
																				String(entry.color ?? DEFAULT_SERIES_COLOUR),
																		}}
																	/>
																	<span>{providerName}</span>
																</div>
																<span className="font-medium tabular-nums">
																	{formatUsdAdaptive(value)} /{" "}
																	{historyChartState.priceDenominatorLabel}
																</span>
															</div>
														);
													})}
												</div>
											</div>
										);
									}}
								/>
								{historyChartState.seriesKeys.map((seriesKey) => (
									<Line
										key={seriesKey}
										xAxisId="days"
										type="monotone"
										dataKey={seriesKey}
										stroke={`var(--color-${seriesKey})`}
										strokeWidth={2}
										dot={false}
										connectNulls={false}
										isAnimationActive={false}
									/>
								))}
							</LineChart>
						</ChartContainer>
					</div>
				) : (
					<div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
						No 30-day pricing history is available for the selected filters.
					</div>
				)}
			</section>
		</div>
	);
}
