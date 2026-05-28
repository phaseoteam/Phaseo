"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	AlertTriangle,
	Ban,
	CheckCircle2,
	CircleHelp,
	Clock3,
	Copy,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	TierTiles,
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	RequestsSection,
	UpcomingPricingSection,
} from "@/components/(data)/model/pricing/sections";
import ProviderModelParameters from "@/components/(data)/model/pricing/ProviderModelParameters";
import {
	buildProviderSections,
	fmtUSD,
	ruleMatchCovers,
	type QualityRow,
	type ResolutionRow,
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

const SERVICE_TIERS_DOCS_HREF =
	"https://docs.ai-stats.phaseo.app/v1/guides/service-tiers";

function formatLatencySeconds(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	const seconds = value / 1000;
	const decimals = seconds >= 10 ? 1 : 2;
	return `${seconds.toFixed(decimals)}s`;
}

function formatThroughputValue(value: number | null | undefined): string | null {
	if (value == null || !Number.isFinite(value)) return null;
	return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPercent(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return `${value.toFixed(1)}%`;
}

function UptimeMetricLabel() {
	return (
		<span className="inline-flex items-center gap-1">
			<span>Uptime</span>
			<HoverCard openDelay={120} closeDelay={80}>
				<HoverCardTrigger asChild>
					<button
						type="button"
						aria-label="How uptime is calculated"
						className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
					>
						<CircleHelp className="h-3 w-3" />
					</button>
				</HoverCardTrigger>
				<HoverCardContent align="center" className="w-64 p-2 text-xs">
					<p className="font-medium text-foreground">Recent request health</p>
					<p className="mt-1 text-muted-foreground">
						Uptime is based on recent request outcomes. Upstream rate limits and
						aborted requests are excluded instead of counting as downtime.
					</p>
				</HoverCardContent>
			</HoverCard>
		</span>
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

function uptimeBarColorClass(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "bg-muted";
	if (value > 99) return "bg-emerald-500";
	if (value >= 90) return "bg-amber-500";
	return "bg-red-500";
}

function uptimeBarCount(value: number | null | undefined): number {
	if (value == null || !Number.isFinite(value)) return 0;
	if (value > 99) return 3;
	if (value >= 90) return 2;
	return 1;
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
	for (const rule of baseProvider.pricing_rules) {
		if ((rule.pricing_plan || "standard") !== args.selectedPlan) continue;
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
	for (const rule of args.provider.pricing_rules) {
		if ((rule.pricing_plan || "standard") !== args.selectedPlan) continue;
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
	for (const rule of args.provider.pricing_rules) {
		if ((rule.pricing_plan || "standard") !== args.basePlan) continue;
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
	for (const rule of args.provider.pricing_rules) {
		if ((rule.pricing_plan || "standard") !== args.targetPlan) continue;
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

function formatServiceTierBreakdown(value: DerivedPlanMultiplier | null): string | null {
	if (!value) return null;
	const parts: string[] = [];
	if (value.inputMultiplier != null) {
		parts.push(`Input ${formatMultiplierValue(value.inputMultiplier)}x`);
	}
	if (value.outputMultiplier != null) {
		parts.push(`Output ${formatMultiplierValue(value.outputMultiplier)}x`);
	}
	return parts.length > 0 ? parts.join(", ") : null;
}

function formatSelectedPlanUsageHint(args: {
	selectedPlan: string;
	breakdown: string | null;
}):
	| {
			kind: "service_tier";
			snippet: string;
			description: string;
			breakdown: string | null;
	  }
	| {
			kind: "batch";
			description: string;
			breakdown: string | null;
	  }
	| null {
	if (args.selectedPlan === "priority" || args.selectedPlan === "flex") {
		return {
			kind: "service_tier",
			snippet: `service_tier: "${args.selectedPlan}"`,
			description: "in your request to route to this tier.",
			breakdown: args.breakdown,
		};
	}
	if (args.selectedPlan === "batch") {
		return {
			kind: "batch",
			description: "Use the Batch API to route requests to this tier.",
			breakdown: args.breakdown,
		};
	}
	return null;
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

const MISSING_PERFORMANCE_EXPLAINER =
	"This can be blank when AI Stats has not seen enough recent gateway requests for this provider/model combination to show a reliable metric yet.";

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

function collectDiscountEntriesFromTiers(tiers?: TokenTier[] | null): Array<{
	endsAt: string | null;
}> {
	if (!tiers?.length) return [];
	return tiers
		.filter((tier) => tier.basePrice != null || tier.basePer1M != null)
		.map((tier) => ({ endsAt: tier.discountEndsAt ?? null }));
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

function collectDiscountEntriesFromTriple(triple?: TokenTriple | null): Array<{
	endsAt: string | null;
}> {
	if (!triple) return [];
	return [
		...collectDiscountEntriesFromTiers(triple.in),
		...collectDiscountEntriesFromTiers(triple.cached),
		...collectDiscountEntriesFromTiers(triple.write),
		...collectDiscountEntriesFromTiers(triple.out),
	];
}

function collectDiscountEntriesFromUsage(rows?: UsageRow[] | null): Array<{
	endsAt: string | null;
}> {
	if (!rows?.length) return [];
	return rows
		.filter((row) => row.basePrice != null)
		.map((row) => ({ endsAt: row.discountEndsAt ?? null }));
}

function collectDiscountEntriesFromImage(rows?: QualityRow[] | null): Array<{
	endsAt: string | null;
}> {
	if (!rows?.length) return [];
	return rows.flatMap((row) =>
		row.items
			.filter((item) => item.basePrice != null)
			.map((item) => ({ endsAt: item.discountEndsAt ?? null })),
	);
}

function collectDiscountEntriesFromVideo(rows?: ResolutionRow[] | null): Array<{
	endsAt: string | null;
}> {
	if (!rows?.length) return [];
	return rows
		.filter((row) => row.basePrice != null)
		.map((row) => ({ endsAt: row.discountEndsAt ?? null }));
}

function MissingPerformanceMetricValue({
	metricLabel,
}: {
	metricLabel: string;
}) {
	const ariaLabel = `Why ${metricLabel.toLowerCase()} is blank`;

	return (
		<span className="inline-flex items-center gap-1 text-muted-foreground">
			<span>--</span>
			<span className="hidden md:inline-flex">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={ariaLabel}
							className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
						>
							<CircleHelp className="h-3.5 w-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-[220px]">
						{MISSING_PERFORMANCE_EXPLAINER}
					</TooltipContent>
				</Tooltip>
			</span>
			<span className="md:hidden">
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={ariaLabel}
							className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
						>
							<CircleHelp className="h-3.5 w-3.5" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="center" className="w-64 p-3 text-xs leading-relaxed">
						{MISSING_PERFORMANCE_EXPLAINER}
					</PopoverContent>
				</Popover>
			</span>
		</span>
	);
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

const PROVIDER_STATUS_PRIORITY_ORDER = [
	"active",
	"coming_soon",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"inactive",
	"disabled",
	"not_listed",
] as const;

type CanonicalGatewayStatus = (typeof PROVIDER_STATUS_PRIORITY_ORDER)[number];

const providerStatusPriority = new Map<string, number>(
	PROVIDER_STATUS_PRIORITY_ORDER.map((status, index) => [status, index])
);

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
	deranked_lvl1: {
		label: "Limited",
		icon: AlertTriangle,
		iconClass: "text-amber-500",
		description: "Temporarily limited.",
	},
	deranked_lvl2: {
		label: "Limited",
		icon: AlertTriangle,
		iconClass: "text-amber-600",
		description: "Temporarily limited.",
	},
	deranked_lvl3: {
		label: "Limited",
		icon: AlertTriangle,
		iconClass: "text-red-500",
		description: "Temporarily limited.",
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
		description: "Disabled.",
	},
	not_listed: {
		label: "Not Active",
		icon: XCircle,
		iconClass: "text-zinc-500",
		description: "Not available.",
	},
};

function normalizeGatewayStatusValue(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function resolveGatewayStatus(
	isActiveGateway: boolean | null | undefined,
	capabilityStatus: unknown
): string {
	const normalizedCapabilityStatus =
		normalizeGatewayStatusValue(capabilityStatus);

	if (normalizedCapabilityStatus === "disabled") return "disabled";
	if (normalizedCapabilityStatus === "coming_soon") return "coming_soon";
	if (normalizedCapabilityStatus.startsWith("deranked")) {
		return normalizedCapabilityStatus;
	}
	if (
		normalizedCapabilityStatus &&
		normalizedCapabilityStatus !== "active" &&
		normalizedCapabilityStatus !== "inactive"
	) {
		return normalizedCapabilityStatus;
	}
	if (normalizedCapabilityStatus === "inactive") return "inactive";
	return isActiveGateway ? "active" : "inactive";
}

export default function ProviderCard({
	provider,
	defaultPlan,
	availablePlans,
	comparisonProviders,
	privacyIgnoredReasons,
	runtimeStats,
	routingStatus,
	displayNameOverride,
}: {
	provider: ProviderPricing;
	defaultPlan: string;
	availablePlans: string[];
	comparisonProviders: ProviderPricing[];
	privacyIgnoredReasons?: string[] | null;
	runtimeStats: ProviderRuntimeStats | null;
	routingStatus: ProviderRoutingStatus | null;
	displayNameOverride?: string | null;
}) {
	const [selectedPlan, setSelectedPlan] = useState(defaultPlan);
	const [copiedUsageSnippet, setCopiedUsageSnippet] = useState<string | null>(null);

	useEffect(() => {
		if (availablePlans.includes(selectedPlan)) return;
		setSelectedPlan(defaultPlan);
	}, [availablePlans, defaultPlan, selectedPlan]);

	useEffect(() => {
		setSelectedPlan(defaultPlan);
	}, [defaultPlan]);

	useEffect(() => {
		if (!copiedUsageSnippet) return;
		const timeout = window.setTimeout(() => setCopiedUsageSnippet(null), 1600);
		return () => window.clearTimeout(timeout);
	}, [copiedUsageSnippet]);

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
	const selectedPlanMultiplier =
		selectedPlan === defaultPlan
			? null
			: derivePlanMultiplier({
					provider,
					basePlan: defaultPlan,
					targetPlan: selectedPlan,
					nowMs: Date.now(),
			  });
	const selectedPlanBreakdown = formatServiceTierBreakdown(selectedPlanMultiplier);
	const selectedPlanUsageHint = formatSelectedPlanUsageHint({
		selectedPlan,
		breakdown: selectedPlanBreakdown,
	});
	const pricingComparisonAccent = selectedPlan === "batch" ? "batch" : null;
	const handleUsageSnippetCopy = (value: string) => {
		navigator.clipboard
			.writeText(value)
			.then(() => setCopiedUsageSnippet(value))
			.catch((error) => {
				console.error("Error copying service tier snippet", error);
			});
	};

	const now = new Date();

	const planRules = provider.pricing_rules.filter(
		(r) => (r.pricing_plan || "standard") === selectedPlan
	);
	const hasPlanPricing = planRules.length > 0;
	const planModelKeys = new Set(planRules.map((r) => r.model_key));
	const matchingProviderModels = provider.provider_models.filter((pm) =>
		planModelKeys.has(`${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
	);
	const providerModelsInScope =
		matchingProviderModels.length > 0
			? matchingProviderModels
			: provider.provider_models;

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
		resolveGatewayStatus(
			providerModel.is_active_gateway,
			providerModel.capability_status
		)
	);
	const chosenGatewayStatus =
		resolvedGatewayStatuses.reduce<string | undefined>((current, candidate) => {
			if (!current) return candidate;
			const currentPriority =
				providerStatusPriority.get(current) ?? providerStatusPriority.size + 1;
			const candidatePriority =
				providerStatusPriority.get(candidate) ?? providerStatusPriority.size + 1;
			return candidatePriority < currentPriority ? candidate : current;
		}, undefined) ?? "not_listed";
	const statusKey = chosenGatewayStatus as CanonicalGatewayStatus;
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
	const providerExecutionRegions = Array.isArray(
		provider.provider.default_execution_regions
	)
		? provider.provider.default_execution_regions
		: [];
	const providerDataRegions = Array.isArray(
		provider.provider.default_data_regions
	)
		? provider.provider.default_data_regions
		: [];
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

	const uptimePct = runtimeStats?.uptimePct3d;
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
	const discountSummary =
		discountCount && soonestDiscountEnd
			? formatDiscountCountdown(soonestDiscountEnd)
			: null;
	const uptimeByDay = runtimeStats?.uptimeDaily3d ?? [];
	const uptimeBars = [2, 1, 0].map((dayOffset) => {
		const match = uptimeByDay.find((d) => d.dayOffset === dayOffset);
		return {
			dayOffset,
			label:
				dayOffset === 0
					? "today"
					: dayOffset === 1
					? "yesterday"
					: `${dayOffset} days ago`,
			uptimePct: match?.uptimePct ?? null,
		};
	});
	const performanceMetrics = [
		{
			key: "latency",
			label: "Latency",
			value:
				runtimeStats?.latencyMs30m != null ? (
					(formatLatencySeconds(runtimeStats?.latencyMs30m) as React.ReactNode)
				) : (
					<MissingPerformanceMetricValue metricLabel="Latency" />
				),
		},
		{
			key: "throughput",
			label: "Throughput",
			value: throughputValue ? (
				<>
					{throughputValue}
					<span className="ml-0.5 text-[0.68em] font-medium">tps</span>
				</>
			) : (
				<MissingPerformanceMetricValue metricLabel="Throughput" />
			),
		},
		{
			key: "uptime",
			label: <UptimeMetricLabel />,
			value: (
				<div
					className="mt-0.5 flex items-center justify-center gap-[3px]"
					aria-label={`Uptime ${formatPercent(uptimePct)}`}
				>
					{uptimeBars.map((bar) => (
						<HoverCard key={bar.dayOffset} openDelay={120} closeDelay={80}>
							<HoverCardTrigger asChild>
								<button
									type="button"
									aria-label={`Uptime ${formatPercent(bar.uptimePct)} ${bar.label}`}
									className={cn(
										"h-[16px] w-[7px] rounded-[2px] transition-colors",
										uptimeBarCount(bar.uptimePct) > 0
											? uptimeBarColorClass(bar.uptimePct)
											: "bg-muted"
									)}
								/>
							</HoverCardTrigger>
							<HoverCardContent align="center" className="w-auto p-2 text-xs">
								<p className="font-medium text-foreground">
									{formatPercent(bar.uptimePct)} uptime {bar.label}
								</p>
							</HoverCardContent>
						</HoverCard>
					))}
				</div>
			),
		},
	];
	const displayName =
		typeof displayNameOverride === "string" && displayNameOverride.trim()
			? displayNameOverride.trim()
			: sec.providerName;

	return (
		<Card className="overflow-hidden border-zinc-200/80 shadow-sm dark:border-zinc-800">
			<CardHeader className="px-4 py-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0 flex-1 space-y-2">
							<div className="flex min-w-0 flex-wrap items-center gap-2">
								<Link href={`/api-providers/${sec.providerId}`} className="group">
									<div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-background dark:border-zinc-800">
										<div className="relative h-5 w-5">
											<Logo
												id={sec.logoProviderId}
												alt={`${sec.providerName} logo`}
												className="object-contain transition group-hover:opacity-80"
												fill
											/>
										</div>
									</div>
								</Link>
								<Link href={`/api-providers/${sec.providerId}`} className="group min-w-0">
									<CardTitle className="truncate text-lg transition-colors group-hover:text-primary">
										{displayName}
									</CardTitle>
								</Link>
								{discountSummary ? (
									<span className="inline-flex max-w-full items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
										{discountSummary}
									</span>
								) : null}
								{privacyIgnoredReasons?.length ? (
									<span
										title={privacyIgnoredReasons.join(" ")}
										className="inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
									>
										Ignored
									</span>
								) : null}
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								<HoverCard openDelay={120} closeDelay={80}>
									<HoverCardTrigger asChild>
										<button
											type="button"
											aria-label={`Provider status: ${statusLabel}`}
											className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors hover:border-slate-300 dark:border-zinc-800 dark:hover:border-slate-700"
										>
											{React.createElement(statusIcon, {
												className: statusClass,
											})}
										</button>
									</HoverCardTrigger>
										<HoverCardContent align="start" className="w-auto p-2 text-xs">
											<p className="font-semibold">{statusLabel}</p>
											<p>{statusDetail}</p>
											{routingHealthSummary ? (
												<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
													<p className="font-semibold">{routingHealthSummary.label}</p>
													<p>{routingHealthSummary.description}</p>
												</div>
											) : null}
										</HoverCardContent>
									</HoverCard>
								{privacyIgnoredReasons?.length ? (
									<HoverCard openDelay={120} closeDelay={80}>
										<HoverCardTrigger asChild>
											<button
												type="button"
												aria-label="Blocked by workspace privacy settings"
												className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-600/80 bg-red-600 text-white transition-colors hover:bg-red-700 dark:border-red-400/70 dark:bg-red-400 dark:text-zinc-950 dark:hover:bg-red-300"
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
								<ProviderInfoHoverIcons
									providerId={sec.providerId}
									providerModelSlugs={providerModelSlugs}
									quantizationScheme={quantizationScheme}
									residency={
										[
											{
												residencyMode:
													provider.provider.residency_mode ?? null,
												executionRegions:
													provider.provider.default_execution_regions ??
													null,
												dataRegions:
													provider.provider.default_data_regions ?? null,
												zeroDataRetention:
													provider.provider.zero_data_retention ?? null,
												notes: provider.provider.residency_notes ?? null,
												sourceUrl:
													provider.provider.residency_source_url ?? null,
											},
										]
									}
									pricingPolicy={{
										regionalPricingMode:
											provider.provider.regional_pricing_mode ?? null,
										regionalPricingUpliftPercent:
											provider.provider.regional_pricing_uplift_percent ??
											null,
										derivedMultiplier:
											derivedPricingMultiplier?.multiplier ?? null,
										derivedMinMultiplier:
											derivedPricingMultiplier?.minMultiplier ?? null,
										derivedMaxMultiplier:
											derivedPricingMultiplier?.maxMultiplier ?? null,
										derivedComparisonProviderName:
											derivedPricingMultiplier?.comparedProviderName ?? null,
										derivedRuleCount:
											derivedPricingMultiplier?.ruleCount ?? null,
										notes:
											provider.provider.regional_pricing_notes ?? null,
										sourceUrl: provider.provider.pricing_source_url ?? null,
									}}
									promptTraining={
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
														policy:
															provider.provider.prompt_training_policy ?? null,
														notes:
															provider.provider.prompt_training_notes ?? null,
														sourceUrl:
															provider.provider
																.prompt_training_source_url ?? null,
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
											  ]
									}
								/>
								<ProviderModelParameters models={infoScope} />
							</div>
							{capacityMetrics.length > 0 ? (
								<div className="flex flex-wrap items-center gap-2 pt-0.5">
									{capacityMetrics.map((metric) => (
										<div
											key={metric.label}
											className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-50/70 px-2.5 py-1 text-[11px] dark:border-zinc-800 dark:bg-zinc-900/50"
										>
											<span className="text-muted-foreground">{metric.label}</span>
											<span className="font-semibold tabular-nums text-foreground">
												{metric.value}
											</span>
										</div>
									))}
								</div>
							) : null}
						</div>

					<div className="w-full lg:w-auto lg:min-w-[240px]">
						<div className="grid grid-cols-3 rounded-lg border border-zinc-200/70 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
							{performanceMetrics.map((metric) => (
								<div
									key={metric.key}
									className="flex min-w-0 flex-col items-center justify-center px-3 py-2 text-center [&:not(:last-child)]:border-r [&:not(:last-child)]:border-zinc-200/70 dark:[&:not(:last-child)]:border-zinc-800"
								>
									<p className="text-[10px] font-medium text-muted-foreground">
										{metric.label}
									</p>
									<div className="text-xs font-semibold leading-tight text-foreground tabular-nums">
										{metric.value}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-4 pb-4 pt-0">
				<div className="grid grid-cols-1 gap-2.5 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
					<div className="space-y-1.5">
						<div className="flex flex-wrap items-center gap-1.5">
							<div className="text-[11px] font-semibold tracking-wide text-foreground">
								Pricing
							</div>
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
					</div>
					{!hasPlanPricing ? (
						isComingSoonProvider ? (
							<div className="rounded-md border border-blue-200/80 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100">
								<div className="inline-flex items-center gap-1.5 font-semibold">
									<Clock3 className="h-3.5 w-3.5" />
									Coming Soon
								</div>
								<p className="mt-1 text-[11px] leading-snug text-blue-800/90 dark:text-blue-200/90">
									This provider is not live for the selected tier yet. Pricing will
									appear once availability starts.
								</p>
							</div>
						) : (
							<div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
								Pricing is not available for the selected tier on this provider.
							</div>
						)
					) : null}
					{isFreePlan && (
						<div className="px-1 py-1">
							<div className="mb-0.5 text-xs text-muted-foreground">
								Per 1M tokens
							</div>
							<div className="text-xs font-semibold leading-tight tabular-nums">
								{fmtUSD(0)}
							</div>
						</div>
					)}
					{!isFreePlan && tokenMetricTiles.length > 0 && (
						<div className="w-full">
							<div
								className={cn(
									"grid gap-x-3 gap-y-2",
									tokenTileGridClass(tokenMetricTiles.length),
								)}
							>
								{tokenMetricTiles.map((tile) => (
									<div
										key={tile.key}
										className="min-w-0 rounded-lg border border-zinc-200/70 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/30"
									>
										{showTokenGroupEyebrows && tile.groupTitle ? (
											<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
												{tile.groupTitle}
											</div>
										) : null}
										<div className="mb-0.5 text-xs text-muted-foreground">{tile.title}</div>
										{tile.tiers ? (
											<TierTiles
												tiers={tile.tiers}
												dense
												unitLabel={tile.unitLabel}
												comparisonAccent={pricingComparisonAccent}
											/>
										) : null}
									</div>
								))}
							</div>
						</div>
					)}
					{!isFreePlan && sec.requests && sec.requests.length > 0 && (
						<RequestsSection
							rows={sec.requests}
							comparisonAccent={pricingComparisonAccent}
						/>
					)}
					{!isFreePlan && upcomingFor("requests").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("requests")} title="Upcoming" compact />
					)}
					{!isFreePlan && imageInputs.length > 0 && (
						<InputsSection
							title="Image Inputs"
							rows={imageInputs}
							comparisonAccent={pricingComparisonAccent}
						/>
					)}
					{!isFreePlan && upcomingFor("imageInputs").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("imageInputs")} title="Upcoming" compact />
					)}
					{!isFreePlan && videoInputs.length > 0 && (
						<InputsSection
							title="Video Inputs"
							rows={videoInputs}
							comparisonAccent={pricingComparisonAccent}
						/>
					)}
					{!isFreePlan && upcomingFor("videoInputs").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("videoInputs")} title="Upcoming" compact />
					)}
					{!isFreePlan && sec.imageGen && (
						<ImageGenSection
							rows={sec.imageGen}
							comparisonAccent={pricingComparisonAccent}
						/>
					)}
					{!isFreePlan && upcomingFor("imageGen").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("imageGen")} title="Upcoming" compact />
					)}
					{!isFreePlan && sec.videoGen && (
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
					)}
					{!isFreePlan && upcomingFor("videoGen").length > 0 && (
						<UpcomingPricingSection rows={upcomingFor("videoGen")} title="Upcoming" compact />
					)}
					{!isFreePlan && sec.otherRules.length > 0 && (
						<div>
							<AdvancedTable rows={sec.otherRules} />
						</div>
					)}
					{!isFreePlan && upcomingFor("other").length > 0 && (
						<UpcomingPricingSection
							rows={upcomingFor("other")}
							title="Other Upcoming Pricing"
							compact
						/>
					)}
					{selectedPlanUsageHint ? (
						<div className="text-[11px] leading-relaxed text-muted-foreground">
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								{selectedPlanUsageHint.breakdown ? (
									<span
										className="mr-1 inline-flex items-center text-muted-foreground"
										aria-hidden="true"
									>
										<CircleHelp className="h-3.5 w-3.5" />
									</span>
								) : null}
								{selectedPlanUsageHint.kind === "service_tier" ? (
									<>
										<span>Set</span>
										<button
											type="button"
											onClick={() =>
												handleUsageSnippetCopy(selectedPlanUsageHint.snippet)
											}
											className="mx-0.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 transition-colors hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900/70 dark:hover:text-zinc-100"
											aria-label={`Copy ${selectedPlanUsageHint.snippet}`}
											title="Copy snippet"
										>
											<code>{selectedPlanUsageHint.snippet}</code>
											{copiedUsageSnippet === selectedPlanUsageHint.snippet ? (
												<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
											) : (
												<Copy className="h-3 w-3 text-muted-foreground" />
											)}
										</button>
										<span>{selectedPlanUsageHint.description}</span>
										<Link
											href={SERVICE_TIERS_DOCS_HREF}
											target="_blank"
											rel="noopener noreferrer"
											className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
										>
											Learn more
										</Link>
									</>
								) : (
									<>
										<span>{selectedPlanUsageHint.description}</span>
										<Link
											href={SERVICE_TIERS_DOCS_HREF}
											target="_blank"
											rel="noopener noreferrer"
											className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
										>
											Learn more
										</Link>
									</>
								)}
							</div>
						</div>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
