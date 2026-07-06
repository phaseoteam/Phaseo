"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	AlertTriangle,
	Ban,
	ChevronRight,
	CheckCircle2,
	Clock3,
	FlaskConical,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	RequestsSection,
	UpcomingPricingSection,
} from "@/components/(data)/model/pricing/sections";
import {
	buildSupportedParameters,
	prettifyParamName,
} from "@/components/(data)/model/pricing/ProviderModelParameters";
import {
	buildProviderSections,
	buildProviderTablePriceSummary,
	fmtUSD,
	ruleMatchCovers,
	type QualityRow,
	type ResolutionRow,
	type ProviderTablePriceSummary,
	type TokenTier,
	type TokenTriple,
	type UsageRow,
} from "@/components/(data)/model/pricing/pricingHelpers";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ProviderRuntimeStats } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ProviderRoutingStatus } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import { Logo } from "@/components/Logo";
import ProviderInfoHoverIcons from "@/components/(data)/model/ProviderInfoHoverIcons";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import {
	getParameterDocsHref,
	getParameterReference,
} from "@/lib/parameters/reference";
import {
	getProviderModelScopeForPlan,
	getProviderPricingRulesForPlan,
} from "@/components/(data)/model/pricing/providerPlanRouting";
import {
	formatProviderOfferDisplayName,
	resolveProviderLogoId,
} from "@/lib/providers/providerOffers";
import {
	chooseGatewayStatus,
	type CanonicalGatewayStatus,
	resolveGatewayStatus,
} from "@/components/(data)/model/pricing/providerGatewayStatus";

const PROVIDER_STATUSES_DOCS_HREF =
	"https://docs.phaseo.app/v1/guides/provider-statuses";

function hasObservedValue(value: number | null | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasUptimeObservation(
	runtimeStats: ProviderRuntimeStats | null | undefined,
): boolean {
	if (!runtimeStats) return false;
	if ((runtimeStats.healthRequests3d ?? 0) > 0) return true;
	return runtimeStats.uptimeDaily3d.some((entry) => entry.requests > 0);
}

function formatLatencySeconds(value: number | null | undefined): string {
	if (!hasObservedValue(value)) return "--";
	const seconds = value / 1000;
	const decimals = seconds >= 10 ? 1 : 2;
	return `${seconds.toFixed(decimals)}s`;
}

function formatThroughputValue(value: number | null | undefined): string | null {
	if (!hasObservedValue(value)) return null;
	return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPercent(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function getPricingPlanLabel(plan: string): string {
	switch (plan) {
		case "standard":
			return "Standard";
		case "free":
			return "Free";
		case "batch":
			return "Batch";
		case "flex":
			return "Flex";
		case "priority":
			return "Priority";
		default:
			return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : plan;
	}
}

function uptimeValueClass(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "text-foreground";
	if (value > 99) return "text-emerald-600 dark:text-emerald-400";
	if (value >= 97) return "text-amber-600 dark:text-amber-400";
	return "text-red-600 dark:text-red-400";
}

function getDisplayedUptimePct(
	runtimeStats: ProviderRuntimeStats | null | undefined,
): number | null {
	if (!hasUptimeObservation(runtimeStats)) return null;
	const currentDay =
		runtimeStats?.uptimeDaily3d.find((entry) => entry.dayOffset === 0)?.uptimePct ??
		null;
	return currentDay ?? runtimeStats?.uptimePct3d ?? null;
}

function getUptimeTrendPoints(
	runtimeStats: ProviderRuntimeStats | null | undefined,
): Array<number | null> {
	if (!hasUptimeObservation(runtimeStats)) return [null, null, null];
	const pointsByHour = new Map(
		(runtimeStats?.uptimeHourly3h ?? []).map((entry) => [entry.hourOffset, entry.uptimePct]),
	);
	const hourlyPoints = [2, 1, 0].map(
		(hourOffset) => pointsByHour.get(hourOffset as 0 | 1 | 2) ?? null,
	);
	if (hourlyPoints.some((value) => value != null && Number.isFinite(value))) {
		return hourlyPoints;
	}
	const pointsByDay = new Map(
		(runtimeStats?.uptimeDaily3d ?? []).map((entry) => [entry.dayOffset, entry.uptimePct]),
	);
	return [2, 1, 0].map((dayOffset) => pointsByDay.get(dayOffset as 0 | 1 | 2) ?? null);
}

function UptimeSparkline({
	points,
	className,
}: {
	points: Array<number | null>;
	className?: string;
}) {
	const values = points.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);

	if (values.length === 0) return null;

	const width = 28;
	const height = 14;
	const insetX = 1;
	const insetY = 1.5;
	const gap = 2.5;
	const barWidth =
		(width - insetX * 2 - gap * Math.max(points.length - 1, 0)) / Math.max(points.length, 1);
	const minValue = Math.min(...values);
	const maxValue = Math.max(...values);
	const range = maxValue - minValue;
	const minBarHeight = 3.5;
	const maxBarHeight = height - insetY * 2;

	const getBarHeight = (value: number | null): number => {
		if (value == null || !Number.isFinite(value)) return 2;
		if (range < 0.25) return maxBarHeight - 1;
		return minBarHeight + ((value - minValue) / range) * (maxBarHeight - minBarHeight);
	};

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={cn("h-3.5 w-8 shrink-0 overflow-visible", className)}
			aria-hidden="true"
		>
			{points.map((value, index) => {
				const barHeight = getBarHeight(value);
				const x = insetX + index * (barWidth + gap);
				const y = height - insetY - barHeight;
				const opacity =
					value == null || !Number.isFinite(value)
						? 0.18
						: index === points.length - 1
							? 0.95
							: index === points.length - 2
								? 0.68
								: 0.42;

				return (
					<rect
						key={`${index}-${value ?? "null"}`}
						x={x}
						y={y}
						width={barWidth}
						height={barHeight}
						rx={1.8}
						fill="currentColor"
						fillOpacity={opacity}
						stroke={
							index === points.length - 1 && value != null && Number.isFinite(value)
								? "currentColor"
								: "none"
						}
						strokeOpacity={0.12}
						strokeWidth={0.6}
					/>
				);
			})}
			<path
				d={`M ${insetX} ${height - insetY} H ${width - insetX}`}
				fill="none"
				stroke="currentColor"
				strokeOpacity="0.14"
				strokeWidth="1"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function renderCompactTierSummary(
	tiers?: TokenTier[] | null,
	valueClassName?: string,
) {
	const tier = tiers?.find((entry) => entry.isCurrent) ?? tiers?.[0] ?? null;
	if (!tier) {
		return (
			<div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
				--
			</div>
		);
	}

	const hasDiscount =
		tier.basePer1M != null &&
		Number.isFinite(tier.basePer1M) &&
		Math.abs(tier.basePer1M - tier.per1M) > 1e-9;

	return (
		<div className="mt-0.5 flex items-baseline gap-1.5">
			{hasDiscount ? (
				<span className="text-[11px] tabular-nums text-muted-foreground line-through">
					{fmtUSD(tier.basePer1M!)}
				</span>
			) : null}
			<span
				className={cn(
					"text-lg font-semibold tabular-nums text-foreground",
					valueClassName,
					hasDiscount && "text-emerald-700 dark:text-emerald-300",
				)}
			>
				{fmtUSD(tier.per1M)}
			</span>
		</div>
	);
}

function getRoutingHealthSummary(
	routingStatus: ProviderRoutingStatus | null | undefined,
): { label: string; description: string } | null {
	if (!routingStatus) return null;
	if (routingStatus.deranked) {
		return {
			label: "Temporarily limited",
			description: `Routing health has temporarily deranked this provider (${routingStatus.openCount} affected route pair${
				routingStatus.openCount === 1 ? "" : "s"
			}).`,
		};
	}
	if (routingStatus.recovering) {
		return {
			label: "Recovering",
			description: `Routing health is probing recovery now (${routingStatus.halfOpenCount} route pair${
				routingStatus.halfOpenCount === 1 ? "" : "s"
			} in half-open state).`,
		};
	}
	return null;
}

function formatTokenLimit(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
	return `${Math.round(value)}`;
}

function formatTokenLimit1dp(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(0)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return `${value.toFixed(1)}`;
}

function renderTablePriceSummary(
	summary: ProviderTablePriceSummary,
	accentClassName: string,
) {
	if (!summary.primary) {
		return <div className="font-medium tabular-nums text-foreground">--</div>;
	}

	const detailParts: string[] = [];
	if (!summary.secondary && summary.primary.label !== "text") {
		detailParts.push(summary.primary.label);
	}
	if (summary.secondary) {
		detailParts.push(summary.secondary.label);
	}
	if (summary.extraCount > 0) {
		detailParts.push(`+${summary.extraCount} more`);
	}
	const detailLabel = detailParts.join(" / ");

	return (
		<div className="flex flex-col items-end gap-0.5">
			<div className={cn("font-medium tabular-nums", accentClassName)}>
				{summary.primary.formattedPrice}
			</div>
			{summary.secondary ? (
				<div className="truncate text-[10px] text-muted-foreground">
					<span>{summary.secondary.label}</span>
					{" "}
					<span className="tabular-nums">{summary.secondary.formattedPrice}</span>
					{summary.extraCount > 0 ? <span>{` +${summary.extraCount} more`}</span> : null}
				</div>
			) : detailLabel ? (
				<div className="truncate text-[10px] text-muted-foreground">{detailLabel}</div>
			) : null}
		</div>
	);
}

function tokenTileGridClass(count: number): string {
	if (count >= 4) return "grid-cols-2 md:grid-cols-4";
	if (count === 3) return "grid-cols-2 md:grid-cols-3";
	if (count === 2) return "grid-cols-2";
	return "grid-cols-1";
}

function extractEndpointFromModelKey(modelKey: string): string {
	const lastColon = modelKey.lastIndexOf(":");
	return lastColon >= 0 ? modelKey.slice(lastColon + 1).trim() : "";
}

function normalizeRuleMatchSignature(match: unknown): string {
	if (!Array.isArray(match)) return "[]";
	return JSON.stringify(
		match
			.map((item) => {
				if (!item || typeof item !== "object") return null;
				const value = item as Record<string, unknown>;
				return {
					path: String(value.path ?? "").trim(),
					op: String(value.op ?? "").trim(),
					value: value.value ?? null,
					or_group:
						typeof value.or_group === "number" ? value.or_group : null,
					and_index:
						typeof value.and_index === "number" ? value.and_index : null,
				};
			})
			.filter(Boolean)
			.sort((a, b) =>
				JSON.stringify(a).localeCompare(JSON.stringify(b)),
			),
	);
}

function isRuleActiveNow(
	rule: ProviderPricing["pricing_rules"][number],
	nowMs: number,
): boolean {
	const fromMs = rule.effective_from
		? Date.parse(rule.effective_from)
		: Number.NEGATIVE_INFINITY;
	const toMs = rule.effective_to
		? Date.parse(rule.effective_to)
		: Number.POSITIVE_INFINITY;
	const normalizedFrom = Number.isFinite(fromMs) ? fromMs : Number.NEGATIVE_INFINITY;
	const normalizedTo = Number.isFinite(toMs) ? toMs : Number.POSITIVE_INFINITY;
	return nowMs >= normalizedFrom && nowMs < normalizedTo;
}

function normalizeRuleUnitPrice(
	rule: ProviderPricing["pricing_rules"][number],
): number | null {
	const price = Number(rule.price_per_unit);
	const unitSize = Number(rule.unit_size ?? 1);
	if (!Number.isFinite(price) || !Number.isFinite(unitSize) || unitSize <= 0) {
		return null;
	}
	return price / unitSize;
}

type DerivedPricingMultiplier = {
	multiplier: number;
	minMultiplier: number;
	maxMultiplier: number;
	comparedProviderName: string;
	ruleCount: number;
	variable: boolean;
};

type DerivedPlanMultiplier = {
	multiplier: number;
	minMultiplier: number;
	maxMultiplier: number;
	averageMultiplier: number;
	ruleCount: number;
	variable: boolean;
	inputMultiplier: number | null;
	outputMultiplier: number | null;
};

function derivePricingMultiplier(args: {
	provider: ProviderPricing;
	comparisonProviders: ProviderPricing[];
	selectedPlan: string;
	nowMs: number;
}): DerivedPricingMultiplier | null {
	const familyId =
		args.provider.provider.provider_family_id ??
		args.provider.provider.api_provider_id;
	if (!familyId) return null;

	const baseProvider = args.comparisonProviders.find((candidate) => {
		if (
			candidate.provider.api_provider_id ===
			args.provider.provider.api_provider_id
		) {
			return false;
		}
		if (
			(candidate.provider.provider_family_id ?? candidate.provider.api_provider_id) !==
			familyId
		) {
			return false;
		}
		return (
			candidate.provider.api_provider_id === familyId ||
			candidate.provider.offer_scope === "global" ||
			(!candidate.provider.offer_scope && !candidate.provider.offer_label)
		);
	});

	if (!baseProvider) return null;

	const baseRuleMap = new Map<string, number>();
	const basePlanRules = getProviderPricingRulesForPlan(baseProvider, args.selectedPlan);
	for (const rule of basePlanRules) {
		if (!isRuleActiveNow(rule, args.nowMs)) continue;
		const normalizedPrice = normalizeRuleUnitPrice(rule);
		if (normalizedPrice == null || normalizedPrice <= 0) continue;
		const key = [
			extractEndpointFromModelKey(rule.model_key),
			rule.meter,
			rule.unit,
			String(rule.unit_size ?? 1),
			normalizeRuleMatchSignature(rule.match),
		].join("::");
		baseRuleMap.set(key, normalizedPrice);
	}

	const ratios: number[] = [];
	const providerPlanRules = getProviderPricingRulesForPlan(args.provider, args.selectedPlan);
	for (const rule of providerPlanRules) {
		if (!isRuleActiveNow(rule, args.nowMs)) continue;
		const normalizedPrice = normalizeRuleUnitPrice(rule);
		if (normalizedPrice == null || normalizedPrice <= 0) continue;
		const key = [
			extractEndpointFromModelKey(rule.model_key),
			rule.meter,
			rule.unit,
			String(rule.unit_size ?? 1),
			normalizeRuleMatchSignature(rule.match),
		].join("::");
		const basePrice = baseRuleMap.get(key);
		if (basePrice == null || basePrice <= 0) continue;
		const ratio = normalizedPrice / basePrice;
		if (Number.isFinite(ratio) && ratio > 0) {
			ratios.push(ratio);
		}
	}

	if (!ratios.length) return null;
	const sortedRatios = [...ratios].sort((a, b) => a - b);
	const minMultiplier = sortedRatios[0]!;
	const maxMultiplier = sortedRatios[sortedRatios.length - 1]!;
	const variable = maxMultiplier / minMultiplier > 1.02;
	const multiplier = variable
		? minMultiplier
		: sortedRatios[Math.floor(sortedRatios.length / 2)]!;

	return {
		multiplier,
		minMultiplier,
		maxMultiplier,
		comparedProviderName:
			baseProvider.provider.api_provider_name ||
			baseProvider.provider.api_provider_id,
		ruleCount: ratios.length,
		variable,
	};
}

function buildRuleComparisonKey(
	rule: ProviderPricing["pricing_rules"][number],
): string {
	return [
		extractEndpointFromModelKey(rule.model_key),
		rule.meter,
		rule.unit,
		String(rule.unit_size ?? 1),
		normalizeRuleMatchSignature(rule.match),
	].join("::");
}

function buildRuleComparisonKeyIgnoringEndpoint(
	rule: ProviderPricing["pricing_rules"][number],
): string {
	return [
		rule.meter,
		rule.unit,
		String(rule.unit_size ?? 1),
		normalizeRuleMatchSignature(rule.match),
	].join("::");
}

function sortPricingRuleCandidates(
	a: ProviderPricing["pricing_rules"][number],
	b: ProviderPricing["pricing_rules"][number],
): number {
	if ((a.priority ?? 0) !== (b.priority ?? 0)) {
		return (b.priority ?? 0) - (a.priority ?? 0);
	}
	const aFrom = a.effective_from ? Date.parse(a.effective_from) : Number.NEGATIVE_INFINITY;
	const bFrom = b.effective_from ? Date.parse(b.effective_from) : Number.NEGATIVE_INFINITY;
	return bFrom - aFrom;
}

function isPrimaryPlanComparisonRule(
	rule: ProviderPricing["pricing_rules"][number],
): boolean {
	const meter = String(rule.meter ?? "").trim().toLowerCase();
	const unit = String(rule.unit ?? "").trim().toLowerCase();

	if (unit !== "token") return false;
	if (!meter.startsWith("input") && !meter.startsWith("output")) return false;
	if (meter.startsWith("cached")) return false;
	if (meter.includes("request")) return false;
	return true;
}

function getPlanComparisonDirection(
	rule: ProviderPricing["pricing_rules"][number],
): "input" | "output" | null {
	const meter = String(rule.meter ?? "").trim().toLowerCase();
	if (meter.startsWith("cached")) return null;
	if (meter.startsWith("input")) return "input";
	if (meter.startsWith("output")) return "output";
	return null;
}

function derivePlanMultiplier(args: {
	provider: ProviderPricing;
	basePlan: string;
	targetPlan: string;
	nowMs: number;
}): DerivedPlanMultiplier | null {
	if (args.basePlan === args.targetPlan) return null;

	const baseRuleMap = new Map<string, number>();
	const baseRuleMapIgnoringEndpoint = new Map<string, number>();
	const activeBaseRules: ProviderPricing["pricing_rules"] = [];
	for (const rule of getProviderPricingRulesForPlan(args.provider, args.basePlan)) {
		if (!isRuleActiveNow(rule, args.nowMs)) continue;
		const normalizedPrice = normalizeRuleUnitPrice(rule);
		if (normalizedPrice == null || normalizedPrice <= 0) continue;
		activeBaseRules.push(rule);
		baseRuleMap.set(buildRuleComparisonKey(rule), normalizedPrice);
		baseRuleMapIgnoringEndpoint.set(
			buildRuleComparisonKeyIgnoringEndpoint(rule),
			normalizedPrice,
		);
	}

	const primaryRatios: number[] = [];
	const fallbackRatios: number[] = [];
	const inputRatios: number[] = [];
	const outputRatios: number[] = [];
	for (const rule of getProviderPricingRulesForPlan(args.provider, args.targetPlan)) {
		if (!isRuleActiveNow(rule, args.nowMs)) continue;
		const normalizedPrice = normalizeRuleUnitPrice(rule);
		if (normalizedPrice == null || normalizedPrice <= 0) continue;
		let basePrice: number | null | undefined =
			baseRuleMap.get(buildRuleComparisonKey(rule)) ??
			baseRuleMapIgnoringEndpoint.get(
				buildRuleComparisonKeyIgnoringEndpoint(rule),
			);
		if (basePrice == null) {
			const semanticMatch = [...activeBaseRules]
				.filter((candidate) => {
					if (candidate.meter !== rule.meter) return false;
					if (candidate.unit !== rule.unit) return false;
					return String(candidate.unit_size ?? 1) === String(rule.unit_size ?? 1);
				})
				.sort(sortPricingRuleCandidates)
				.find((candidate) => ruleMatchCovers(candidate, rule));
			basePrice = semanticMatch
				? normalizeRuleUnitPrice(semanticMatch)
				: null;
		}
		if (basePrice == null || basePrice <= 0) continue;
		const ratio = normalizedPrice / basePrice;
		if (!Number.isFinite(ratio) || ratio <= 0) continue;
		fallbackRatios.push(ratio);
		if (isPrimaryPlanComparisonRule(rule)) {
			primaryRatios.push(ratio);
			const direction = getPlanComparisonDirection(rule);
			if (direction === "input") inputRatios.push(ratio);
			if (direction === "output") outputRatios.push(ratio);
		}
	}

	const ratios = primaryRatios.length > 0 ? primaryRatios : fallbackRatios;
	if (!ratios.length) return null;
	const sortedRatios = [...ratios].sort((a, b) => a - b);
	const minMultiplier = sortedRatios[0]!;
	const maxMultiplier = sortedRatios[sortedRatios.length - 1]!;
	const variable = maxMultiplier / minMultiplier > 1.02;
	const multiplier = variable
		? minMultiplier
		: sortedRatios[Math.floor(sortedRatios.length / 2)]!;
	const averageMultiplier =
		ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
	const averageOf = (values: number[]): number | null =>
		values.length > 0
			? values.reduce((sum, value) => sum + value, 0) / values.length
			: null;

	return {
		multiplier,
		minMultiplier,
		maxMultiplier,
		averageMultiplier,
		ruleCount: ratios.length,
		variable,
		inputMultiplier: averageOf(inputRatios),
		outputMultiplier: averageOf(outputRatios),
	};
}

function formatMultiplierValue(value: number): string {
	const rounded = value >= 10 ? value.toFixed(1) : value.toFixed(2);
	return rounded.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatApproxMultiplierValue(value: number): string {
	const rounded = (Math.round(value * 2) / 2).toFixed(1);
	return rounded.replace(/\.0$/, "");
}

function formatPlanMultiplierLabel(value: DerivedPlanMultiplier | null): string | null {
	if (!value) return null;
	if (value.variable) {
		return `~${formatApproxMultiplierValue(value.averageMultiplier)}x`;
	}
	return `${formatMultiplierValue(value.multiplier)}x`;
}

function formatLeavingDate(value: string, now: Date): string {
	const to = new Date(value);
	const includeYear = to.getFullYear() !== now.getFullYear();
	return to.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "long",
		...(includeYear ? { year: "numeric" as const } : {}),
	});
}

function parseRuleConditionValues(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((v) => String(v));
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			try {
				const parsed = JSON.parse(trimmed.replace(/''/g, '"'));
				if (Array.isArray(parsed)) return parsed.map((v) => String(v));
			} catch {
				return trimmed
					.slice(1, -1)
					.split(",")
					.map((v) => v.replace(/['"]/g, "").trim())
					.filter(Boolean);
			}
		}
		return [trimmed.replace(/['"]/g, "")];
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return [String(value)];
	}
	return [];
}

function formatDiscountCountdown(value: string | null | undefined): string | null {
	if (!value) return null;
	const end = new Date(value).getTime();
	if (Number.isNaN(end)) return null;
	const diff = end - Date.now();
	if (diff <= 0) return "Discount ending now";
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	if (days > 0) return `Discount ends in ${days}d ${remHours}h`;
	return `Discount ends in ${Math.max(remHours, 1)}h`;
}

function formatDiscountTimeRemaining(value: string | null | undefined): string | null {
	const countdown = formatDiscountCountdown(value);
	if (!countdown) return null;
	if (countdown === "Discount ending now") return "Ending now";
	return countdown.replace(/^Discount ends/i, "Ends");
}

type ActiveDiscountEntry = {
	endsAt: string | null;
	percentOff: number | null;
};

function getPercentOff(basePrice: number | null | undefined, discountedPrice: number | null | undefined): number | null {
	const base = Number(basePrice);
	const discounted = Number(discountedPrice);
	if (!Number.isFinite(base) || !Number.isFinite(discounted) || base <= 0 || discounted < 0) {
		return null;
	}
	if (discounted >= base) return null;
	const percent = ((base - discounted) / base) * 100;
	return Number.isFinite(percent) && percent > 0 ? percent : null;
}

function formatDiscountBadge(entries: ActiveDiscountEntry[]): string | null {
	const roundedPercents = entries
		.map((entry) => entry.percentOff)
		.filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
		.map((value) => Math.max(1, Math.round(value)));

	if (!roundedPercents.length) return entries.length ? "Discount" : null;

	const min = Math.min(...roundedPercents);
	const max = Math.max(...roundedPercents);
	if (min === max) return `${max}% Off`;
	return `Up to ${max}% Off`;
}

function collectDiscountEntriesFromTiers(tiers?: TokenTier[] | null): ActiveDiscountEntry[] {
	if (!tiers?.length) return [];
	return tiers
		.filter((tier) => tier.basePrice != null || tier.basePer1M != null)
		.map((tier) => {
			const base = tier.basePer1M ?? tier.basePrice ?? null;
			const discounted = tier.basePer1M != null ? tier.per1M : tier.price;
			return {
				endsAt: tier.discountEndsAt ?? null,
				percentOff: getPercentOff(base, discounted),
			};
		});
}

function getPrivacyReasonMeta(reason: string): {
	label: string;
	href: string;
	linkLabel: string;
} | null {
	if (reason === "Blocked by workspace provider restrictions") {
		return {
			label: "Blocked by your workspace provider restrictions.",
			href: "/settings/privacy",
			linkLabel: "Review privacy settings",
		};
	}
	if (reason === "Not in workspace provider allowlist") {
		return {
			label: "This provider is outside your workspace allowlist.",
			href: "/settings/privacy",
			linkLabel: "Review privacy settings",
		};
	}
	if (reason === "Does not meet workspace ZDR-only requirement") {
		return {
			label: "This provider does not meet your workspace ZDR-only requirement.",
			href: "/settings/privacy",
			linkLabel: "Review privacy settings",
		};
	}
	if (
		reason ===
		"Free training-on-inputs endpoints are disabled in workspace privacy settings"
	) {
		return {
			label: "Free providers that may train on inputs are disabled in your workspace.",
			href: "/settings/privacy",
			linkLabel: "Review privacy settings",
		};
	}
	if (
		reason ===
		"Paid training-on-inputs endpoints are disabled in workspace privacy settings"
	) {
		return {
			label: "Paid providers that may train on inputs are disabled in your workspace.",
			href: "/settings/privacy",
			linkLabel: "Review privacy settings",
		};
	}
	return null;
}

function collectDiscountEntriesFromTriple(triple?: TokenTriple | null): ActiveDiscountEntry[] {
	if (!triple) return [];
	return [
		...collectDiscountEntriesFromTiers(triple.in),
		...collectDiscountEntriesFromTiers(triple.cached),
		...collectDiscountEntriesFromTiers(triple.write),
		...collectDiscountEntriesFromTiers(triple.out),
	];
}

function collectDiscountEntriesFromUsage(rows?: UsageRow[] | null): ActiveDiscountEntry[] {
	if (!rows?.length) return [];
	return rows
		.filter((row) => row.basePrice != null)
		.map((row) => ({
			endsAt: row.discountEndsAt ?? null,
			percentOff: getPercentOff(row.basePrice, row.price),
		}));
}

function collectDiscountEntriesFromImage(rows?: QualityRow[] | null): ActiveDiscountEntry[] {
	if (!rows?.length) return [];
	return rows.flatMap((row) =>
		row.items
			.filter((item) => item.basePrice != null)
			.map((item) => ({
				endsAt: item.discountEndsAt ?? null,
				percentOff: getPercentOff(item.basePrice, item.price),
			})),
	);
}

function collectDiscountEntriesFromVideo(rows?: ResolutionRow[] | null): ActiveDiscountEntry[] {
	if (!rows?.length) return [];
	return rows
		.filter((row) => row.basePrice != null)
		.map((row) => ({
			endsAt: row.discountEndsAt ?? null,
			percentOff: getPercentOff(row.basePrice, row.price),
		}));
}

function parseRuleAudioMode(value: unknown): "with-audio" | "without-audio" | null {
	const values = parseRuleConditionValues(value);
	const parsed = values
		.map((raw) => raw.trim().toLowerCase())
		.map((v) => {
			if (["true", "1", "yes", "enabled", "t", "on"].includes(v)) return true;
			if (["false", "0", "no", "disabled", "f", "off"].includes(v)) return false;
			return null;
		})
		.filter((v): v is boolean => v !== null);
	if (!parsed.length) return null;
	const hasTrue = parsed.includes(true);
	const hasFalse = parsed.includes(false);
	if (hasTrue && !hasFalse) return "with-audio";
	if (hasFalse && !hasTrue) return "without-audio";
	return null;
}

const PROVIDER_STATUS_META: Record<
	CanonicalGatewayStatus,
	{
		label: string;
		icon: React.ElementType;
		iconClass: string;
		description: string;
	}
> = {
	active: {
		label: "Active",
		icon: CheckCircle2,
		iconClass: "text-green-600",
		description: "Available.",
	},
	coming_soon: {
		label: "Coming Soon",
		icon: Clock3,
		iconClass: "text-blue-600",
		description: "Not active yet.",
	},
	internal_testing: {
		label: "Internal Testing",
		icon: FlaskConical,
		iconClass: "text-sky-600",
		description: "Visible to admins only while this provider/model capability is being tested.",
	},
	deranked_lvl1: {
		label: "Deranked L1",
		icon: AlertTriangle,
		iconClass: "text-amber-500",
		description: "Routable, but slightly deprioritized by routing health.",
	},
	deranked_lvl2: {
		label: "Deranked L2",
		icon: AlertTriangle,
		iconClass: "text-amber-600",
		description: "Routable, but currently deprioritized by routing health.",
	},
	deranked_lvl3: {
		label: "Deranked L3",
		icon: AlertTriangle,
		iconClass: "text-red-500",
		description: "Routable, but heavily deprioritized by routing health.",
	},
	inactive: {
		label: "Not Active",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "Not available.",
	},
	disabled: {
		label: "Disabled",
		icon: Ban,
		iconClass: "text-red-600",
		description: "Explicitly disabled and not routable.",
	},
	not_listed: {
		label: "Not Active",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "Not available.",
	},
};

export default function ProviderCard({
	provider,
	defaultPlan,
	availablePlans,
	comparisonProviders,
	privacyIgnoredReasons,
	runtimeStats,
	routingStatus,
	displayNameOverride,
	variantLabels,
	showCacheReadColumn = false,
}: {
	provider: ProviderPricing;
	defaultPlan: string;
	availablePlans: string[];
	comparisonProviders: ProviderPricing[];
	privacyIgnoredReasons?: string[] | null;
	runtimeStats: ProviderRuntimeStats | null;
	routingStatus: ProviderRoutingStatus | null;
	displayNameOverride?: string | null;
	variantLabels?: string[] | null;
	showCacheReadColumn?: boolean;
}) {
	const [selectedPlan, setSelectedPlan] = useState(defaultPlan);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		if (availablePlans.includes(selectedPlan)) return;
		setSelectedPlan(defaultPlan);
	}, [availablePlans, defaultPlan, selectedPlan]);

	useEffect(() => {
		setSelectedPlan(defaultPlan);
	}, [defaultPlan]);

	const sec = useMemo(
		() => buildProviderSections(provider, selectedPlan),
		[provider, selectedPlan]
	);
	const derivedPricingMultiplier = useMemo(
		() =>
			derivePricingMultiplier({
				provider,
				comparisonProviders,
				selectedPlan,
				nowMs: Date.now(),
			}),
		[comparisonProviders, provider, selectedPlan],
	);
	const planMultiplierLabels = useMemo(() => {
		const nowMs = Date.now();
		const labels: Record<string, string | null> = {};
		for (const plan of availablePlans) {
			if (plan === defaultPlan) {
				labels[plan] = null;
				continue;
			}
			labels[plan] = formatPlanMultiplierLabel(
				derivePlanMultiplier({
					provider,
					basePlan: defaultPlan,
					targetPlan: plan,
					nowMs,
				}),
			);
		}
		return labels;
	}, [availablePlans, defaultPlan, provider]);
	const pricingComparisonAccent = selectedPlan === "batch" ? "batch" : null;

	const now = new Date();

	const planRules = getProviderPricingRulesForPlan(provider, selectedPlan);
	const hasPlanPricing = planRules.length > 0;
	const providerModelsInScope = getProviderModelScopeForPlan(
		provider,
		selectedPlan,
	);

	const leavingSoonRule = planRules
		.filter((r) => {
			if (!r.effective_to) return false;
			const to = new Date(r.effective_to).getTime();
			return to > now.getTime();
		})
		.sort(
			(a, b) =>
				new Date(a.effective_to!).getTime() -
				new Date(b.effective_to!).getTime()
		)[0];

	const resolvedGatewayStatuses = providerModelsInScope.map((providerModel) =>
		resolveGatewayStatus({
			isActiveGateway: providerModel.is_active_gateway,
			capabilityStatus: providerModel.capability_status,
			providerStatus: provider.provider.status,
			providerRoutingStatus: provider.provider.routing_status,
			modelRoutingStatus: providerModel.routing_status,
			effectiveFrom: providerModel.effective_from,
			effectiveTo: providerModel.effective_to,
		})
	);
	const statusKey = chooseGatewayStatus(resolvedGatewayStatuses);
	const statusMeta = PROVIDER_STATUS_META[statusKey] ?? PROVIDER_STATUS_META.not_listed;
	const statusIcon = statusMeta.icon;
	const statusClass = cn("h-3.5 w-3.5", statusMeta.iconClass);
	const statusLabel = statusMeta.label;
	const routingHealthSummary = getRoutingHealthSummary(routingStatus);
	const statusDetail =
		statusKey === "active" && leavingSoonRule?.effective_to
			? `${statusMeta.description} Leaving on ${formatLeavingDate(leavingSoonRule.effective_to, now)}`
			: statusMeta.description;
	const isComingSoonProvider = statusKey === "coming_soon";
	const isInternalTestingProvider = statusKey === "internal_testing";
	const privacyReasonMeta = (privacyIgnoredReasons ?? []).map((reason) => ({
		reason,
		meta: getPrivacyReasonMeta(reason),
	}));

	const isFreePlan = selectedPlan === "free";
	const imageInputs = sec.mediaInputs?.filter((r) => r.mod === "image") ?? [];
	const videoInputs = sec.mediaInputs?.filter((r) => r.mod === "video") ?? [];
	const upcomingFor = (
		sectionKey:
			| "textTokens"
			| "requests"
			| "imageInputs"
			| "videoInputs"
			| "imageTokens"
			| "imageGen"
			| "audioTokens"
			| "videoTokens"
			| "videoGen"
			| "other"
	) => sec.upcomingChanges?.filter((change) => change.sectionKey === sectionKey) ?? [];
	const textProviderModels = providerModelsInScope.filter(
		(pm) => pm.endpoint === "text.generate"
	);
	const maxFrom = (values: Array<number | null | undefined>) => {
		const nums = values.filter(
			(v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
		);
		return nums.length ? Math.max(...nums) : null;
	};
	const maxOutputTokens = maxFrom(
		textProviderModels.map((pm) => pm.max_output_tokens)
	);
	const maxContextTokens = maxFrom(
		textProviderModels.map((pm) => pm.context_length)
	);
	const capacityMetrics = [
			maxContextTokens !== null
				? {
						label: "Total Context",
						value: formatTokenLimit1dp(maxContextTokens),
				}
				: null,
			maxOutputTokens !== null
				? {
						label: "Max Output",
						value: formatTokenLimit(maxOutputTokens),
				}
				: null,
		].filter(
			(
				metric
			): metric is {
				label: string;
				value: string;
			} => Boolean(metric)
		);
	type TokenMetricTile = {
		key: string;
		title: string;
		groupTitle?: string | null;
		tiers?: TokenTier[];
		unitLabel?: string;
	};
	const createTokenTiles = (
		modalityLabel: "Text" | "Audio" | "Image" | "Video",
		modalityKey: "text" | "audio" | "image" | "video",
		triple: TokenTriple | undefined,
	): TokenMetricTile[] => {
		if (!triple) return [];
		const sections: Array<{
			key: string;
			title: string;
			tiers: TokenTier[];
		}> = [
			{
				key: `${modalityKey}-input`,
				title: `${modalityLabel} Input`,
				tiers: triple.in,
			},
			{
				key: `${modalityKey}-output`,
				title: `${modalityLabel} Output`,
				tiers: triple.out,
			},
			{
				key: `${modalityKey}-cache-read`,
				title: `${modalityLabel} Cache Reads`,
				tiers: triple.cached,
			},
			{
				key: `${modalityKey}-cache-write`,
				title: `${modalityLabel} Cache Writes`,
				tiers: triple.write,
			},
		];
		return sections
			.filter((section) => section.tiers.length > 0)
			.map((section) => ({
				key: section.key,
				title: section.title.replace(`${modalityLabel} `, ""),
				groupTitle: modalityLabel,
				tiers: section.tiers,
				unitLabel: "Per 1M tokens",
			}));
	};
	const tokenMetricTiles = [
		...createTokenTiles("Text", "text", sec.textTokens),
		...createTokenTiles("Audio", "audio", sec.audioTokens),
		...createTokenTiles("Image", "image", sec.imageTokens),
		...createTokenTiles("Video", "video", sec.videoTokens),
	];
	const distinctTokenGroups = new Set(
		tokenMetricTiles
			.map((tile) => tile.groupTitle)
			.filter((group): group is string => Boolean(group)),
	);
	const showTokenGroupEyebrows = distinctTokenGroups.size > 1;
	const infoScope = providerModelsInScope;
	const providerModelSlugs = infoScope.map((pm) => pm.provider_model_slug);
	const providerApiModelIds = infoScope.map((pm) => pm.model_id);
	const videoAudioRuleHints = planRules.flatMap((rule) => {
		const meter = String(rule.meter ?? "").toLowerCase();
		const isVideoMeter =
			meter.includes("output_video") ||
			meter.includes("video_output") ||
			(meter.includes("video") &&
				(meter.includes("second") || meter.includes("minute") || meter.includes("video")));
		if (!isVideoMeter) return [];
		const fromMs = rule.effective_from ? new Date(rule.effective_from).getTime() : null;
		const toMs = rule.effective_to ? new Date(rule.effective_to).getTime() : null;
		const nowMs = now.getTime();
		if (fromMs != null && Number.isFinite(fromMs) && fromMs > nowMs) return [];
		if (toMs != null && Number.isFinite(toMs) && toMs <= nowMs) return [];
		const conditions = Array.isArray(rule.match) ? rule.match : [];
		const audioCondition = conditions.find(
			(cond: any) =>
				String(cond?.path ?? "").trim().toLowerCase() === "video_params.audio",
		);
		const audioMode = audioCondition
			? parseRuleAudioMode(audioCondition.value)
			: null;
		if (!audioMode) return [];
		const resolutionCondition = conditions.find((cond: any) =>
			String(cond?.path ?? "").trim().toLowerCase().includes("resolution"),
		);
		const resolutions = resolutionCondition
			? parseRuleConditionValues(resolutionCondition.value)
			: ["Any resolution"];
		const price = Number(rule.price_per_unit ?? Number.NaN);
		if (!Number.isFinite(price)) return [];
		return resolutions.map((resolution) => ({
			resolution,
			price,
			audioMode,
		}));
	});
	const hasExplicitVideoAudioRules = planRules.some((rule) => {
		const meter = String(rule.meter ?? "").toLowerCase();
		const isVideoMeter =
			meter.includes("output_video") ||
			meter.includes("video_output") ||
			(meter.includes("video") && (meter.includes("second") || meter.includes("minute")));
		if (!isVideoMeter) return false;
		const match = Array.isArray(rule.match) ? rule.match : [];
		const audioCond = match.find(
			(cond: any) =>
				String(cond?.path ?? "").trim().toLowerCase() === "video_params.audio",
		);
		if (!audioCond) return false;
		const values = Array.isArray(audioCond.value) ? audioCond.value : [audioCond.value];
		return values.some((v: unknown) => {
			if (typeof v === "boolean") return true;
			const normalized = String(v ?? "").trim().toLowerCase();
			return [
				"true",
				"false",
				"1",
				"0",
				"yes",
				"no",
				"enabled",
				"disabled",
				"t",
				"f",
				"on",
				"off",
			].includes(normalized);
		});
	});
	const hasVideoAudioSplitData = Boolean(
		sec.videoGen?.some((row) => row.audioMode === "with-audio" || row.audioMode === "without-audio")
	);
	const quantizationScheme =
		infoScope
			.find(
				(pm) =>
					pm.is_active_gateway &&
					pm.capability_status !== "disabled" &&
					typeof pm.quantization_scheme === "string" &&
					pm.quantization_scheme.trim()
			)
			?.quantization_scheme?.trim() ??
		infoScope
			.find(
				(pm) =>
					pm.endpoint === "text.generate" &&
					typeof pm.quantization_scheme === "string" &&
					pm.quantization_scheme.trim()
			)
			?.quantization_scheme?.trim() ??
		infoScope
			.find(
				(pm) =>
					typeof pm.quantization_scheme === "string" &&
					pm.quantization_scheme.trim()
			)
			?.quantization_scheme?.trim() ??
		null;
	const allEmpty =
		!sec.textTokens &&
		!sec.imageTokens &&
		!sec.audioTokens &&
		!sec.videoTokens &&
		!sec.imageGen &&
		!sec.videoGen &&
		!imageInputs.length &&
		!videoInputs.length &&
		!sec.requests?.length &&
		!sec.upcomingChanges?.length &&
		!sec.otherRules.length;

	if (allEmpty && !isFreePlan && hasPlanPricing) return null;

	const uptimePct = getDisplayedUptimePct(runtimeStats);
	const uptimeTrendPoints = getUptimeTrendPoints(runtimeStats);
	const throughputValue = formatThroughputValue(runtimeStats?.throughput30m);
	const activeDiscountEntries = [
		...collectDiscountEntriesFromTriple(sec.textTokens),
		...collectDiscountEntriesFromTriple(sec.audioTokens),
		...collectDiscountEntriesFromTriple(sec.imageTokens),
		...collectDiscountEntriesFromTriple(sec.videoTokens),
		...collectDiscountEntriesFromUsage(imageInputs),
		...collectDiscountEntriesFromUsage(videoInputs),
		...collectDiscountEntriesFromImage(sec.imageGen),
		...collectDiscountEntriesFromVideo(sec.videoGen),
		...collectDiscountEntriesFromTiers(sec.requests),
	];
	const discountCount = activeDiscountEntries.length;
	const soonestDiscountEnd = activeDiscountEntries
		.map((entry) => entry.endsAt)
		.filter((value): value is string => Boolean(value))
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
	const discountBadge = discountCount ? formatDiscountBadge(activeDiscountEntries) : null;
	const discountTimeRemaining =
		discountCount && soonestDiscountEnd
			? formatDiscountTimeRemaining(soonestDiscountEnd)
			: null;
	const selectedPlanLabel = getPricingPlanLabel(selectedPlan);
	const selectedPlanTheme = (() => {
		switch (selectedPlan) {
			case "free":
				return {
					accent: "text-emerald-700 dark:text-emerald-300",
				};
			case "batch":
				return {
					accent: "text-orange-700 dark:text-orange-300",
				};
			case "flex":
				return {
					accent: "text-emerald-700 dark:text-emerald-300",
				};
			case "priority":
				return {
					accent: "text-violet-700 dark:text-violet-300",
				};
			default:
				return {
					accent: "text-zinc-700 dark:text-zinc-200",
				};
		}
	})();
	const performanceMetrics = [
		{
			key: "latency",
			label: "Latency",
			value:
				runtimeStats?.latencyMs30m != null
					? formatLatencySeconds(runtimeStats.latencyMs30m)
					: "--",
			valueClassName: "text-foreground",
			meta: "30m",
		},
		{
			key: "throughput",
			label: "Throughput",
			value: throughputValue ? `${throughputValue} tps` : "--",
			valueClassName: "text-foreground",
			meta: "30m",
		},
		{
			key: "uptime",
			label: "Uptime",
			value: formatPercent(uptimePct),
			valueClassName: uptimeValueClass(uptimePct),
			meta: "1d",
		},
	] as const;
	const formattedDisplayName =
		typeof displayNameOverride === "string" && displayNameOverride.trim()
			? displayNameOverride.trim()
			: formatProviderOfferDisplayName({
					providerId: sec.providerId,
					providerName:
						provider.provider.api_provider_name ||
						sec.providerName ||
						sec.providerId,
					offerLabel: provider.provider.offer_label ?? null,
					offerScope: provider.provider.offer_scope ?? null,
				});
	const displayName = (() => {
		const providerId = String(sec.providerId ?? "").trim().toLowerCase();
		const name = formattedDisplayName.trim();
		if (providerId.endsWith("-eu") && !/\bEU\b/i.test(name)) {
			return `${name} (EU)`;
		}
		if (providerId.endsWith("-us") && !/\bUS\b/i.test(name)) {
			return `${name} (US)`;
		}
		return name;
	})();
	const logoProviderId = resolveProviderLogoId({
		providerId: sec.providerId,
		providerFamilyId: provider.provider.provider_family_id ?? null,
	});
	const inputPriceSummary = buildProviderTablePriceSummary(sec, "input");
	const outputPriceSummary = buildProviderTablePriceSummary(sec, "output");
	const cacheReadPriceSummary = showCacheReadColumn
		? buildProviderTablePriceSummary(sec, "cached")
		: null;
	const summaryQuantization =
		typeof quantizationScheme === "string" && quantizationScheme.trim()
			? quantizationScheme.trim()
			: null;
	const visibleVariantLabels = variantLabels?.slice(0, 2) ?? [];
	const hiddenVariantCount = Math.max((variantLabels?.length ?? 0) - visibleVariantLabels.length, 0);
	const inlineProviderLabels = [
		...visibleVariantLabels,
		hiddenVariantCount > 0 ? `+${hiddenVariantCount} more` : null,
	].filter((value): value is string => Boolean(value));
	const toggleExpanded = () => setExpanded((current) => !current);
	const handleSummaryRowClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
		const interactiveTarget = (event.target as HTMLElement).closest(
			"a, button, input, select, textarea, [role='button']",
		);
		if (interactiveTarget) return;
		toggleExpanded();
	};
	const providerInfoProps = {
		providerId: sec.providerId,
		providerModelSlugs,
		apiModelIds: providerApiModelIds,
		quantizationScheme,
		dataPolicy: [
			{
				tier: provider.provider.data_policy_tier ?? null,
				confidence: provider.provider.data_policy_confidence ?? null,
				contractMode: provider.provider.data_policy_contract_mode ?? null,
				contractNotes: provider.provider.data_policy_contract_notes ?? null,
				notes: provider.provider.prompt_training_notes ?? null,
				sourceUrl: provider.provider.prompt_training_source_url ?? null,
				promptTrainingPolicy: provider.provider.prompt_training_policy ?? null,
				zeroDataRetention: provider.provider.zero_data_retention ?? null,
			},
		],
		residency: [
			{
				residencyMode: provider.provider.residency_mode ?? null,
				executionRegions: provider.provider.default_execution_regions ?? null,
				dataRegions: provider.provider.default_data_regions ?? null,
				zeroDataRetention: provider.provider.zero_data_retention ?? null,
				notes: provider.provider.residency_notes ?? null,
				sourceUrl: provider.provider.residency_source_url ?? null,
			},
		],
		pricingPolicy: {
			regionalPricingMode: provider.provider.regional_pricing_mode ?? null,
			regionalPricingUpliftPercent:
				provider.provider.regional_pricing_uplift_percent ?? null,
			derivedMultiplier: derivedPricingMultiplier?.multiplier ?? null,
			derivedMinMultiplier: derivedPricingMultiplier?.minMultiplier ?? null,
			derivedMaxMultiplier: derivedPricingMultiplier?.maxMultiplier ?? null,
			derivedComparisonProviderName:
				derivedPricingMultiplier?.comparedProviderName ?? null,
			derivedRuleCount: derivedPricingMultiplier?.ruleCount ?? null,
			notes: provider.provider.regional_pricing_notes ?? null,
			sourceUrl: provider.provider.pricing_source_url ?? null,
		},
		showQuantizationTrigger: false,
		promptTraining:
			infoScope.length > 0
				? infoScope.map((providerModel) => ({
						policy:
							providerModel.prompt_training_policy_override ??
							provider.provider.prompt_training_policy ??
							null,
						notes:
							providerModel.prompt_training_override_notes ??
							provider.provider.prompt_training_notes ??
							null,
						sourceUrl:
							providerModel.prompt_training_override_source_url ??
							provider.provider.prompt_training_source_url ??
							null,
						userIdentifierPolicy:
							provider.provider.user_identifier_policy ?? null,
						userIdentifierNotes:
							provider.provider.user_identifier_notes ?? null,
						privacyPolicyUrl:
							provider.provider.privacy_policy_url ?? null,
						termsOfServiceUrl:
							provider.provider.terms_of_service_url ?? null,
						isOverride: Boolean(
							providerModel.prompt_training_policy_override,
						),
				}))
				: [
						{
							policy: provider.provider.prompt_training_policy ?? null,
							notes: provider.provider.prompt_training_notes ?? null,
							sourceUrl:
								provider.provider.prompt_training_source_url ?? null,
							userIdentifierPolicy:
								provider.provider.user_identifier_policy ?? null,
							userIdentifierNotes:
								provider.provider.user_identifier_notes ?? null,
							privacyPolicyUrl:
								provider.provider.privacy_policy_url ?? null,
							termsOfServiceUrl:
								provider.provider.terms_of_service_url ?? null,
							isOverride: false,
						},
		],
	};
	const contextLengthValue =
		capacityMetrics.find((metric) => metric.label === "Total Context")?.value ?? "--";
	const maxOutputValue =
		capacityMetrics.find((metric) => metric.label === "Max Output")?.value ?? "--";
	const supportedParameters = buildSupportedParameters(infoScope);
	const pricingPrimaryContent = !hasPlanPricing ? (
		isInternalTestingProvider ? (
			<div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
				<div className="inline-flex items-center gap-1.5 font-semibold">
					<FlaskConical className="h-3.5 w-3.5" />
					Internal Testing
				</div>
				<p className="mt-1 text-[11px] leading-snug text-sky-800/90 dark:text-sky-200/90">
					This provider/model capability is visible to admins for testing before public rollout.
				</p>
			</div>
		) : isComingSoonProvider ? (
			<div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100">
				<div className="inline-flex items-center gap-1.5 font-semibold">
					<Clock3 className="h-3.5 w-3.5" />
					Coming Soon
				</div>
				<p className="mt-1 text-[11px] leading-snug text-blue-800/90 dark:text-blue-200/90">
					This provider is not live for the selected tier yet. Pricing will appear once
					availability starts.
				</p>
			</div>
		) : (
			<div className="rounded-xl border border-dashed border-zinc-200/80 bg-zinc-50/60 px-3 py-2.5 text-xs text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/30">
				Pricing is not available for the selected tier on this provider.
			</div>
		)
	) : isFreePlan ? (
		<div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-background dark:border-zinc-800">
			<div className="px-4 py-3">
				<div className="text-[11px] text-muted-foreground">Input and output</div>
				<div
					className={cn(
						"mt-0.5 text-lg font-semibold tabular-nums",
						selectedPlanTheme.accent,
					)}
				>
					{fmtUSD(0)}
				</div>
				<div className="mt-0.5 text-[10px] text-muted-foreground">
					Per 1M tokens
				</div>
			</div>
		</div>
	) : tokenMetricTiles.length > 0 ? (
		<div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-background dark:border-zinc-800">
			<div
				className={cn(
					"grid divide-y divide-zinc-200/80 md:divide-y-0 md:divide-x dark:divide-zinc-800",
					tokenTileGridClass(tokenMetricTiles.length),
				)}
			>
				{tokenMetricTiles.map((tile) => (
					<div key={tile.key} className="min-w-0 px-4 py-3">
						<div className="text-[11px] text-muted-foreground">
							{showTokenGroupEyebrows && tile.groupTitle
								? `${tile.groupTitle} ${tile.title}`
								: tile.title}
						</div>
						{tile.tiers ? (
							<>
								{renderCompactTierSummary(tile.tiers, selectedPlanTheme.accent)}
								<div className="mt-0.5 text-[10px] text-muted-foreground">
									{tile.unitLabel}
								</div>
							</>
						) : null}
					</div>
				))}
			</div>
		</div>
	) : null;
	const pricingAdditionalContent =
		!isFreePlan &&
		((sec.requests?.length ?? 0) > 0 ||
			upcomingFor("requests").length > 0 ||
			imageInputs.length > 0 ||
			upcomingFor("imageInputs").length > 0 ||
			videoInputs.length > 0 ||
			upcomingFor("videoInputs").length > 0 ||
			Boolean(sec.imageGen) ||
			upcomingFor("imageGen").length > 0 ||
			Boolean(sec.videoGen) ||
			upcomingFor("videoGen").length > 0 ||
			sec.otherRules.length > 0 ||
			upcomingFor("other").length > 0) ? (
			<div className="space-y-2 pt-1">
				{sec.requests && sec.requests.length > 0 ? (
					<RequestsSection
						rows={sec.requests}
						comparisonAccent={pricingComparisonAccent}
					/>
				) : null}
				{upcomingFor("requests").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("requests")} title="Upcoming" compact />
				) : null}
				{imageInputs.length > 0 ? (
					<InputsSection
						title="Image Inputs"
						rows={imageInputs}
						comparisonAccent={pricingComparisonAccent}
					/>
				) : null}
				{upcomingFor("imageInputs").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("imageInputs")} title="Upcoming" compact />
				) : null}
				{videoInputs.length > 0 ? (
					<InputsSection
						title="Video Inputs"
						rows={videoInputs}
						comparisonAccent={pricingComparisonAccent}
					/>
				) : null}
				{upcomingFor("videoInputs").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("videoInputs")} title="Upcoming" compact />
				) : null}
				{sec.imageGen ? (
					<ImageGenSection
						rows={sec.imageGen}
						comparisonAccent={pricingComparisonAccent}
					/>
				) : null}
				{upcomingFor("imageGen").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("imageGen")} title="Upcoming" compact />
				) : null}
				{sec.videoGen ? (
					<VideoGenSection
						rows={sec.videoGen}
						showAudioVariants={
							hasExplicitVideoAudioRules ||
							hasVideoAudioSplitData ||
							videoAudioRuleHints.length > 0
						}
						audioHints={videoAudioRuleHints}
						comparisonAccent={pricingComparisonAccent}
					/>
				) : null}
				{upcomingFor("videoGen").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("videoGen")} title="Upcoming" compact />
				) : null}
				{sec.otherRules.length > 0 ? (
					<div>
						<AdvancedTable rows={sec.otherRules} />
					</div>
				) : null}
				{upcomingFor("other").length > 0 ? (
					<UpcomingPricingSection
						rows={upcomingFor("other")}
						title="Other Upcoming Pricing"
						compact
					/>
				) : null}
			</div>
		) : null;

	return (
		<>
			<TableRow
				onClick={handleSummaryRowClick}
				className="group cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30"
			>
				<TableCell className="min-w-[280px] py-2 pl-3 pr-2">
					<div>
						<div className="flex items-center gap-2.5">
							<Link
								href={`/api-providers/${sec.providerId}`}
								className="group/provider inline-flex items-center gap-2.5 whitespace-nowrap"
							>
								<div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors group-hover/provider:border-zinc-300 dark:border-zinc-800 dark:group-hover/provider:border-zinc-700">
									<div className="relative h-4 w-4">
										<Logo
											id={logoProviderId}
											alt={`${displayName} logo`}
											className="object-contain"
											fill
											sizes="18px"
										/>
									</div>
								</div>
								<span className="whitespace-nowrap font-semibold text-foreground transition-colors group-hover/provider:text-primary">
									{displayName}
								</span>
							</Link>

							<div className="flex shrink-0 items-center gap-1">
								<HoverCard openDelay={120} closeDelay={80}>
									<HoverCardTrigger asChild>
										<button
											type="button"
											aria-label={`Provider status: ${statusLabel}`}
											className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
										>
											{React.createElement(statusIcon, {
												className: cn("h-3.5 w-3.5", statusClass),
											})}
										</button>
									</HoverCardTrigger>
									<HoverCardContent align="start" className="w-auto p-2 text-xs">
										<p className="font-semibold">{statusLabel}</p>
										<p className="mt-1 text-muted-foreground">{statusDetail}</p>
										{routingHealthSummary ? (
											<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
												<p className="font-semibold">{routingHealthSummary.label}</p>
												<p>{routingHealthSummary.description}</p>
											</div>
										) : null}
										<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
											<Link
												href={PROVIDER_STATUSES_DOCS_HREF}
												target="_blank"
												rel="noopener noreferrer"
												className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
											>
												Learn more about provider statuses
											</Link>
										</div>
									</HoverCardContent>
								</HoverCard>
								{privacyIgnoredReasons?.length ? (
									<HoverCard openDelay={120} closeDelay={80}>
										<HoverCardTrigger asChild>
											<button
												type="button"
												aria-label="Blocked by workspace privacy settings"
												className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
											>
												<Ban className="h-3.5 w-3.5" />
											</button>
										</HoverCardTrigger>
										<HoverCardContent align="start" className="w-80 p-2 text-xs">
											<p className="font-semibold text-foreground">Blocked</p>
											<p className="mt-1 text-muted-foreground">
												This provider is currently ignored by your workspace settings.
											</p>
											<div className="mt-2 space-y-1 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
												{privacyReasonMeta.map(({ reason, meta }) => (
													<div key={reason} className="space-y-1">
														<p className="text-muted-foreground">
															{meta?.label ?? reason}
														</p>
														{meta ? (
															<Link
																href={meta.href}
																className="inline-flex text-[11px] font-medium text-primary hover:underline"
															>
																{meta.linkLabel}
															</Link>
														) : null}
													</div>
												))}
											</div>
											<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
												<p className="text-muted-foreground">
													API key guardrails can also affect live routing separately from these workspace settings.
												</p>
												<Link
													href="/settings/guardrails"
													className="mt-1 inline-flex text-[11px] font-medium text-primary hover:underline"
												>
													Review guardrails
												</Link>
											</div>
										</HoverCardContent>
									</HoverCard>
								) : null}
								<ProviderInfoHoverIcons {...providerInfoProps} />
							</div>
							{inlineProviderLabels.length > 0 || discountBadge ? (
								<div className="flex shrink-0 items-center gap-x-1.5 text-[11px] text-muted-foreground">
									{inlineProviderLabels.map((item, index) => (
										<React.Fragment key={item}>
											{index > 0 ? <span className="text-zinc-300 dark:text-zinc-700">/</span> : null}
											<span className="whitespace-nowrap">{item}</span>
										</React.Fragment>
									))}
									{discountBadge ? (
										<>
											{inlineProviderLabels.length > 0 ? (
												<span className="text-zinc-300 dark:text-zinc-700">/</span>
											) : null}
											<span className="whitespace-nowrap font-medium text-emerald-700 dark:text-emerald-300">
												{discountBadge}
											</span>
										</>
									) : null}
								</div>
							) : null}
						</div>
					</div>
				</TableCell>
				<TableCell className="py-2 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					{renderTablePriceSummary(inputPriceSummary, selectedPlanTheme.accent)}
				</TableCell>
				<TableCell className="py-2 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					{renderTablePriceSummary(outputPriceSummary, selectedPlanTheme.accent)}
				</TableCell>
				{showCacheReadColumn && cacheReadPriceSummary ? (
					<TableCell className="py-2 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
						{renderTablePriceSummary(cacheReadPriceSummary, selectedPlanTheme.accent)}
					</TableCell>
				) : null}
				<TableCell className="py-2 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div className="font-medium text-foreground">{performanceMetrics[0].value}</div>
				</TableCell>
				<TableCell className="py-2 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div className="font-medium text-foreground">{performanceMetrics[1].value}</div>
				</TableCell>
				<TableCell className="py-2 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div
						className={cn(
							"inline-flex items-center justify-end gap-2 font-medium tabular-nums",
							performanceMetrics[2].valueClassName,
						)}
					>
						<span>{performanceMetrics[2].value}</span>
						<UptimeSparkline points={uptimeTrendPoints} />
					</div>
				</TableCell>
				<TableCell className="w-10 py-2 pl-2 pr-3 text-right">
					<button
						type="button"
						onClick={toggleExpanded}
						aria-expanded={expanded}
						aria-label={expanded ? `Collapse ${displayName} details` : `Expand ${displayName} details`}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
					>
						<ChevronRight
							className={cn(
								"h-4 w-4 transition-transform duration-200 ease-out",
								expanded ? "rotate-90" : "rotate-0",
							)}
						/>
					</button>
				</TableCell>
			</TableRow>
			<TableRow
				className={cn(
					"hover:bg-transparent data-[state=selected]:bg-transparent",
					expanded ? "border-b" : "border-b-0",
				)}
				aria-hidden={!expanded}
			>
				<TableCell
					colSpan={showCacheReadColumn ? 8 : 7}
					className={cn(
						"overflow-hidden bg-zinc-50/45 px-0 py-0 dark:bg-zinc-900/20",
						expanded ? "border-t border-zinc-200/70 dark:border-zinc-800/70" : "border-t-0",
					)}
				>
					<div
						className={cn(
							"grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
							expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
						)}
					>
						<div className="min-h-0 overflow-hidden">
							<div
								className={cn(
									"space-y-4 px-4 transition-[transform,opacity,padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
									expanded
										? "translate-y-0 py-4 opacity-100"
										: "-translate-y-1 py-0 opacity-0 pointer-events-none",
								)}
							>
								<div className="space-y-3">
									<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
										<div className="min-w-0">
											{availablePlans.length > 0 ? (
												<PricingPlanSelect
													value={selectedPlan}
													onChange={setSelectedPlan}
													plans={availablePlans}
													planMetaLabels={planMultiplierLabels}
													compact
												/>
											) : null}
										</div>

										<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground lg:justify-end">
											<span>
												Quantization:{" "}
												<span className="font-medium text-foreground">
													{summaryQuantization ?? "--"}
												</span>
											</span>
											<span className="text-zinc-300 dark:text-zinc-700">|</span>
											<span>
												Context Length:{" "}
												<span className="font-medium text-foreground">{contextLengthValue}</span>
											</span>
											<span className="text-zinc-300 dark:text-zinc-700">|</span>
											<span>
												Max Output:{" "}
												<span className="font-medium text-foreground">{maxOutputValue}</span>
											</span>
										</div>
									</div>
								</div>

								<div aria-label={`${selectedPlanLabel} pricing`} className="space-y-2">
									<div className="text-sm font-medium text-foreground">Pricing</div>
									{discountBadge ? (
										<div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
											<span className="font-semibold text-emerald-700 dark:text-emerald-300">
												{discountBadge}
											</span>
											<span className="text-emerald-800/80 dark:text-emerald-200/80">
												Promotion
											</span>
											{discountTimeRemaining ? (
												<span className="text-emerald-800/80 dark:text-emerald-200/80">
													{discountTimeRemaining}
												</span>
											) : null}
										</div>
									) : null}
									{pricingPrimaryContent}
									{pricingAdditionalContent}
								</div>

								<div className="space-y-2">
									<div className="flex items-center justify-between gap-3">
										<div className="text-sm font-medium text-foreground">Supported parameters</div>
										{supportedParameters.length > 0 ? (
											<div className="text-[11px] text-muted-foreground">
												Hover for details
											</div>
										) : null}
									</div>
									{supportedParameters.length > 0 ? (
										<div className="mt-3 max-h-[4.75rem] overflow-hidden">
											<div className="flex flex-wrap items-start gap-2">
												{supportedParameters.map((param) => {
													const reference = getParameterReference(param);
													return (
														<HoverCard key={param} openDelay={120} closeDelay={80}>
															<HoverCardTrigger asChild>
																<Button
																	type="button"
																	variant="outline"
																	size="sm"
																	className="h-auto min-h-8 justify-start rounded-md px-2.5 py-1.5 font-mono text-xs"
																>
																	{prettifyParamName(param)}
																</Button>
															</HoverCardTrigger>
															<HoverCardContent align="start" className="w-80 p-3 text-xs">
																<div className="space-y-2">
																	<div className="space-y-1">
																		<div className="flex items-center justify-between gap-3">
																			<code className="font-mono text-[11px] text-foreground">
																				{param}
																			</code>
																			<Link
																				href={getParameterDocsHref(param)}
																				target="_blank"
																				rel="noopener noreferrer"
																				className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
																			>
																				Docs
																			</Link>
																		</div>
																		<p className="leading-relaxed text-muted-foreground">
																			{reference.description}
																		</p>
																	</div>
																	<div className="flex items-center gap-4 border-t border-zinc-200/70 pt-2 text-[11px] text-muted-foreground dark:border-zinc-800">
																		<span>
																			Type:{" "}
																			<span className="text-foreground">{reference.type}</span>
																		</span>
																		<span>
																			Default:{" "}
																			<span className="text-foreground">
																				{reference.defaultValue}
																			</span>
																		</span>
																	</div>
																</div>
															</HoverCardContent>
														</HoverCard>
													);
												})}
											</div>
										</div>
									) : (
										<div className="mt-3 text-sm text-muted-foreground">
											No parameter metadata is published for this route.
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</TableCell>
			</TableRow>
		</>
	);
}
