"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
	AlertTriangle,
	ArrowUpRight,
	Ban,
	ChevronLeft,
	ChevronRight,
	CheckCircle2,
	Clock3,
	FlaskConical,
	Info,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	ImageGenSection,
	VideoGenSection,
	InputsSection,
	AdvancedTable,
	UpcomingPricingSection,
} from "@/components/(data)/model/pricing/sections";
import {
	buildSupportedParameters,
	prettifyParamName,
} from "@/components/(data)/model/pricing/ProviderModelParameters";
import {
	buildProviderSections,
	buildProviderTablePriceSummary,
	fmtCompact,
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
	"https://phaseo.app/docs/v1/guides/provider-statuses";
const PROVIDER_SHEET_DOCS = {
	serviceTier: "https://phaseo.app/docs/v1/guides/service-tiers",
	pricing: "https://phaseo.app/docs/v1/exploring/pricing-performance",
	performance: "https://phaseo.app/docs/v1/exploring/pricing-performance",
	routing: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
	dataRetention:
		"https://phaseo.app/docs/v1/cookbook/route-only-to-eu-or-zdr-providers",
} as const;
const PROVIDER_INSPECTOR_OPEN_EVENT = "ai-stats-provider-inspector-open";
const PROVIDER_INSPECTOR_STATE_KEY = "__aiStatsOpenProviderInspectorId";
const PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY =
	"__aiStatsSuppressProviderInspectorAnimationForId";
const PROVIDER_INSPECTOR_RECENTLY_CLOSED_ID_KEY =
	"__aiStatsRecentlyClosedProviderInspectorId";
const PROVIDER_INSPECTOR_RECENTLY_CLOSED_AT_KEY =
	"__aiStatsRecentlyClosedProviderInspectorAt";
const PROVIDER_INSPECTOR_LAST_OPEN_ID_KEY =
	"__aiStatsLastOpenProviderInspectorId";
const PROVIDER_INSPECTOR_LAST_OPEN_AT_KEY =
	"__aiStatsLastOpenProviderInspectorAt";

declare global {
	interface Window {
		[PROVIDER_INSPECTOR_STATE_KEY]?: string | null;
		[PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY]?: string | null;
		[PROVIDER_INSPECTOR_RECENTLY_CLOSED_ID_KEY]?: string | null;
		[PROVIDER_INSPECTOR_RECENTLY_CLOSED_AT_KEY]?: number | null;
		[PROVIDER_INSPECTOR_LAST_OPEN_ID_KEY]?: string | null;
		[PROVIDER_INSPECTOR_LAST_OPEN_AT_KEY]?: number | null;
	}
}

function ProviderSheetSectionLink({
	href,
	children,
	className,
}: {
	href: string;
	children: React.ComponentProps<typeof Link>["children"];
	className?: string;
}) {
	return (
		<Link
			href={href}
			target="_blank"
			rel="noreferrer"
			className={cn(
				"group inline-flex items-center gap-1.5 underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
				className,
			)}
		>
			{children}
			<ArrowUpRight
				aria-hidden="true"
				className="size-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
			/>
		</Link>
	);
}

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
	if (value > 95) return "text-amber-600 dark:text-amber-400";
	return "text-red-600 dark:text-red-400";
}

function getDisplayedUptimePct(
	runtimeStats: ProviderRuntimeStats | null | undefined,
): number | null {
	if (!hasUptimeObservation(runtimeStats)) return null;
	return runtimeStats?.uptimePct3d ?? null;
}

function getUptimeTrendPoints(
	runtimeStats: ProviderRuntimeStats | null | undefined,
): Array<number | null> {
	if (!hasUptimeObservation(runtimeStats)) return [null, null, null];
	const pointsByDay = new Map(
		(runtimeStats?.uptimeDaily3d ?? []).map((entry) => [entry.dayOffset, entry.uptimePct]),
	);
	return [2, 1, 0].map((dayOffset) => pointsByDay.get(dayOffset as 0 | 1 | 2) ?? null);
}

function UptimeHoverContent({
	uptimePct,
	runtimeStats,
}: {
	uptimePct: number | null;
	runtimeStats: ProviderRuntimeStats | null | undefined;
}) {
	const dailyPoints = (runtimeStats?.uptimeDaily3d ?? [])
		.slice()
		.sort((a, b) => b.dayOffset - a.dayOffset);
	return (
		<div className="space-y-2.5">
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm font-medium text-foreground">3-day uptime</p>
				<span className={cn("font-medium tabular-nums", uptimeValueClass(uptimePct))}>
					{formatPercent(uptimePct)}
				</span>
			</div>
			<div className="flex items-end gap-2">
				{dailyPoints.map((point) => {
					const value = point.uptimePct;
					const height =
						value == null || !Number.isFinite(value)
							? 8
							: Math.max(8, Math.min(34, 8 + (value / 100) * 26));
					return (
						<div
							key={point.dayOffset}
							className="flex w-10 flex-col items-center gap-1"
						>
							<div
								className={cn(
									"w-3 rounded-full",
									uptimeValueClass(value),
									value == null ? "bg-muted" : "bg-current",
								)}
								style={{ height }}
								aria-hidden="true"
							/>
							<span className="text-[10px] text-muted-foreground">
								{point.dayOffset === 0 ? "Today" : `-${point.dayOffset}d`}
							</span>
						</div>
					);
				})}
			</div>
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
	const barHeight = height - insetY * 2;

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={cn("h-3.5 w-8 shrink-0 overflow-visible", className)}
			aria-label="Daily uptime"
			role="img"
		>
			{points.map((value, index) => {
				const x = insetX + index * (barWidth + gap);
				const y = height - insetY - barHeight;
				const opacity =
					value == null || !Number.isFinite(value)
						? 0.45
						: 1;

				const day =
					index === points.length - 1
						? "Today"
						: `-${points.length - 1 - index}d`;

				return (
					<Tooltip key={`${index}-${value ?? "null"}`}>
						<TooltipTrigger asChild>
							<g
								aria-label={`${day}: ${formatPercent(value)}`}
								className="cursor-help"
								tabIndex={0}
							>
								<rect
									className={cn(
										value == null || !Number.isFinite(value)
											? "text-muted-foreground"
											: uptimeValueClass(value),
									)}
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
							</g>
						</TooltipTrigger>
						<TooltipContent side="top">{day}: {formatPercent(value)}</TooltipContent>
					</Tooltip>
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
	billingTimestampBasis?: string | null,
) {
	const orderedTiers = [...(tiers ?? [])].sort((a, b) => {
		if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
		return a.per1M - b.per1M;
	});
	if (!orderedTiers.length) {
		return (
			<div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
				--
			</div>
		);
	}

	return (
		<div className="mt-0.5 space-y-1">
			{orderedTiers.map((tier, index) => {
				const hasComparison =
					tier.basePer1M != null &&
					Number.isFinite(tier.basePer1M) &&
					Math.abs(tier.basePer1M - tier.per1M) > 1e-9;
				const condition = tier.label && tier.label !== "All usage" ? tier.label : null;
				const prices = tier.timeWindowPrices?.length
					? [...tier.timeWindowPrices].sort((a, b) => {
							if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
							return 0;
						})
					: [{
							label: condition ?? "",
							price: tier.price,
							per1M: tier.per1M,
							scheduleLabel: null,
							isCurrent: true,
						}];
				const scheduledPeriods = Array.from(
					new Set(
						prices
							.map((price) => price.scheduleLabel)
							.filter((schedule): schedule is string => Boolean(schedule)),
					),
				);

				return (
					<div key={`${tier.label}-${tier.per1M}-${index}`} className="space-y-0.5">
						{prices.map((price, priceIndex) => {
							const isHeadline = index === 0 && priceIndex === 0;
							const periodLabel = tier.timeWindowPrices?.length
								? `${price.label}${price.isCurrent ? " · now" : ""}`
								: condition;
							return (
								<div
									key={`${price.label}-${price.per1M}-${priceIndex}`}
									className="flex min-w-0 items-baseline gap-1.5"
								>
									{hasComparison && priceIndex === 0 ? (
										<span className="text-[11px] tabular-nums text-muted-foreground line-through">
											{fmtUSD(tier.basePer1M!)}
										</span>
									) : null}
									<span
										className={cn(
											isHeadline ? "text-lg" : "text-xs",
											"font-semibold tabular-nums",
											price.isCurrent ? (valueClassName ?? "text-foreground") : "text-muted-foreground",
										)}
									>
										{fmtUSD(price.per1M)}
									</span>
									{periodLabel && tier.timeWindowPrices?.length ? (
										<PricingPeriodHoverCard
											label={price.label}
											isCurrent={price.isCurrent}
											scheduleLabel={price.scheduleLabel}
											scheduledPeriods={scheduledPeriods}
											billingTimestampBasis={billingTimestampBasis}
										/>
									) : periodLabel ? (
										<span className="truncate text-[10px] text-muted-foreground">
											{periodLabel}
										</span>
									) : null}
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

function formatPricingScheduleForDisplay(schedule: string): string {
	return schedule
		.replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, "$1–$2")
		.replace(/,\s*/g, " · ")
		.replace(/\s+UTC$/, "");
}

function PricingPeriodHoverCard({
	label,
	isCurrent,
	scheduleLabel,
	scheduledPeriods,
	billingTimestampBasis,
}: {
	label: string;
	isCurrent: boolean;
	scheduleLabel: string | null;
	scheduledPeriods: string[];
	billingTimestampBasis?: string | null;
}) {
	const scheduledDisplay = scheduledPeriods
		.map(formatPricingScheduleForDisplay)
		.join(" · ");
	const schedule = scheduleLabel
		? formatPricingScheduleForDisplay(scheduleLabel)
		: scheduledDisplay
			? `Outside ${scheduledDisplay}`
			: "All other times";
	const timestampBasis = formatBillingTimestampBasis(billingTimestampBasis);

	return (
		<HoverCard openDelay={120} closeDelay={80}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					className="group/period inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					aria-label={`View ${label} pricing period details`}
				>
					<span className="truncate">{label}{isCurrent ? " · now" : ""}</span>
					<Info className="h-2.5 w-2.5 shrink-0 opacity-55 transition-opacity group-hover/period:opacity-100" />
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				side="top"
				align="start"
				sideOffset={8}
				className="w-[18rem] overflow-hidden rounded-2xl bg-popover p-0 shadow-xl ring-1 ring-foreground/10"
			>
				<div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground">
							<Clock3 className="h-3.5 w-3.5" />
						</div>
						<div className="min-w-0">
							<div className="truncate text-xs font-semibold text-foreground">{label} pricing</div>
							<div className="text-[10px] text-muted-foreground">Time-based rate</div>
						</div>
					</div>
					{isCurrent ? (
						<span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
							Active now
						</span>
					) : null}
				</div>
				<dl className="space-y-2.5 px-4 py-3 text-[11px]">
					<div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
						<dt className="text-muted-foreground">Schedule</dt>
						<dd className="font-medium tabular-nums text-foreground">{schedule}</dd>
					</div>
					<div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
						<dt className="text-muted-foreground">Timezone</dt>
						<dd className="font-medium text-foreground">UTC</dd>
					</div>
					<div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
						<dt className="text-muted-foreground">Rate selected</dt>
						<dd className="font-medium text-foreground">At {timestampBasis}</dd>
					</div>
				</dl>
				<p className="border-t border-border/70 bg-muted/35 px-4 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
					The selected rate stays with the request after it is sent upstream.
				</p>
			</HoverCardContent>
		</HoverCard>
	);
}

function formatPriceRange(values: number[]): string {
	const finiteValues = values.filter((value) => Number.isFinite(value));
	if (!finiteValues.length) return "--";
	const min = Math.min(...finiteValues);
	const max = Math.max(...finiteValues);
	if (Math.abs(min - max) < 1e-9) return fmtUSD(min);
	return `${fmtUSD(min)}-${fmtUSD(max)}`;
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`): string | null {
	if (count <= 0) return null;
	return `${count} ${count === 1 ? singular : plural}`;
}

type AdditionalMeterSummary = {
	key: string;
	label: string;
	value: string;
	unit: string;
	detail: string | null;
};

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

function formatPolicyValue(value: string | null | undefined): string {
	const normalized = String(value ?? "").trim();
	if (!normalized) return "Unknown";
	return normalized
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPlanTheme(plan: string) {
	switch (plan) {
		case "free":
			return {
				accent: "text-emerald-700 dark:text-emerald-300",
				discountBorder: "border-emerald-400",
				discountText: "text-emerald-900 dark:text-emerald-100",
				discountStrong: "text-emerald-700 dark:text-emerald-300",
				discountMuted: "text-emerald-800/80 dark:text-emerald-200/80",
			};
		case "batch":
			return {
				accent: "text-orange-700 dark:text-orange-300",
				discountBorder: "border-orange-400",
				discountText: "text-orange-900 dark:text-orange-100",
				discountStrong: "text-orange-700 dark:text-orange-300",
				discountMuted: "text-orange-800/80 dark:text-orange-200/80",
			};
		case "flex":
			return {
				accent: "text-sky-700 dark:text-sky-300",
				discountBorder: "border-sky-400",
				discountText: "text-sky-900 dark:text-sky-100",
				discountStrong: "text-sky-700 dark:text-sky-300",
				discountMuted: "text-sky-800/80 dark:text-sky-200/80",
			};
		case "priority":
			return {
				accent: "text-violet-700 dark:text-violet-300",
				discountBorder: "border-violet-400",
				discountText: "text-violet-900 dark:text-violet-100",
				discountStrong: "text-violet-700 dark:text-violet-300",
				discountMuted: "text-violet-800/80 dark:text-violet-200/80",
			};
		default:
			return {
				accent: "text-zinc-700 dark:text-zinc-200",
				discountBorder: "border-emerald-400",
				discountText: "text-emerald-900 dark:text-emerald-100",
				discountStrong: "text-emerald-700 dark:text-emerald-300",
				discountMuted: "text-emerald-800/80 dark:text-emerald-200/80",
			};
	}
}

function formatBillingTimestampBasis(value: string | null | undefined): string {
	switch (value) {
		case "provider_accept":
			return "upstream request start";
		case "completion":
			return "completion";
		case "request_start":
			return "request start";
		default:
			return "request start";
	}
}

function formatRequestMeterTitle(meter: string | null | undefined): string {
	const words = (meter ?? "")
		.split(/[_\s-]+/)
		.filter(Boolean)
		.filter((word) => !/^requests?$/i.test(word));
	if (words.length === 0) return "Requests";
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

function formatRequestMeterUnit(unitLabel: string | null | undefined): string {
	if (!unitLabel) return "/ request";
	if (/^per request$/i.test(unitLabel)) return "/ request";
	const match = unitLabel.match(/^per\s+([\d,]+)\s+requests?$/i);
	if (!match) return unitLabel.replace(/^per\s+/i, "/ ");
	return `/ ${fmtCompact(Number(match[1].replace(/,/g, "")))} req`;
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
		})
		.filter((entry) => entry.percentOff != null);
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
		}))
		.filter((entry) => entry.percentOff != null);
}

function collectDiscountEntriesFromImage(rows?: QualityRow[] | null): ActiveDiscountEntry[] {
	if (!rows?.length) return [];
	return rows.flatMap((row) =>
		row.items
			.filter((item) => item.basePrice != null)
			.map((item) => ({
				endsAt: item.discountEndsAt ?? null,
				percentOff: getPercentOff(item.basePrice, item.price),
			}))
			.filter((entry) => entry.percentOff != null),
	);
}

function collectDiscountEntriesFromVideo(rows?: ResolutionRow[] | null): ActiveDiscountEntry[] {
	if (!rows?.length) return [];
	return rows
		.filter((row) => row.basePrice != null)
		.map((row) => ({
			endsAt: row.discountEndsAt ?? null,
			percentOff: getPercentOff(row.basePrice, row.price),
		}))
		.filter((entry) => entry.percentOff != null);
}

function collectDiscountEntriesFromOtherRules(
	rows?: ReturnType<typeof buildProviderSections>["otherRules"] | null,
): ActiveDiscountEntry[] {
	if (!rows?.length) return [];
	return rows
		.filter((row) => row.basePrice != null)
		.map((row) => ({
			endsAt: row.discountEndsAt ?? null,
			percentOff: getPercentOff(row.basePrice, row.price),
		}))
		.filter((entry) => entry.percentOff != null);
}

function collectDiscountEntriesFromSections(
	sections: ReturnType<typeof buildProviderSections>,
) {
	const imageInputs = sections.mediaInputs?.filter((row) => row.mod === "image") ?? [];
	const videoInputs = sections.mediaInputs?.filter((row) => row.mod === "video") ?? [];
	return [
		...collectDiscountEntriesFromTriple(sections.textTokens),
		...collectDiscountEntriesFromTriple(sections.audioTokens),
		...collectDiscountEntriesFromTriple(sections.imageTokens),
		...collectDiscountEntriesFromTriple(sections.videoTokens),
		...collectDiscountEntriesFromTriple(sections.embeddingTokens),
		...collectDiscountEntriesFromUsage(imageInputs),
		...collectDiscountEntriesFromUsage(videoInputs),
		...collectDiscountEntriesFromImage(sections.imageGen),
		...collectDiscountEntriesFromVideo(sections.videoGen),
		...collectDiscountEntriesFromTiers(sections.requests),
		...collectDiscountEntriesFromOtherRules(sections.otherRules),
	];
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
	navigationProviders,
	privacyIgnoredReasons,
	runtimeStats,
	routingStatus,
	displayNameOverride,
	variantLabels,
	pricingTimeMs,
	showCacheReadColumn = false,
	isLastVisible = false,
}: {
	provider: ProviderPricing;
	defaultPlan: string;
	availablePlans: string[];
	comparisonProviders: ProviderPricing[];
	navigationProviders: ProviderPricing[];
	privacyIgnoredReasons?: string[] | null;
	runtimeStats: ProviderRuntimeStats | null;
	routingStatus: ProviderRoutingStatus | null;
	displayNameOverride?: string | null;
	variantLabels?: string[] | null;
	pricingTimeMs: number;
	showCacheReadColumn?: boolean;
	isLastVisible?: boolean;
}) {
	const [selectedPlan, setSelectedPlan] = useState(defaultPlan);
	const [expanded, setExpanded] = useState(false);
	const reduceMotion = useReducedMotion();
	const [disableInspectorAnimation, setDisableInspectorAnimation] = useState(false);
	const [copiedInspectorValue, setCopiedInspectorValue] = useState<string | null>(null);
	const inspectorAnimationResetRef = useRef<number | null>(null);
	const inspectorStateClearRef = useRef<number | null>(null);
	const inspectorProviderId = provider.provider.api_provider_id;

	useEffect(() => {
		if (availablePlans.includes(selectedPlan)) return;
		setSelectedPlan(defaultPlan);
	}, [availablePlans, defaultPlan, selectedPlan]);

	useEffect(() => {
		setSelectedPlan(defaultPlan);
	}, [defaultPlan]);

	useEffect(() => {
		const handleOpen = (event: Event) => {
			const detail = (event as CustomEvent<{
				providerId?: string;
				disableAnimation?: boolean;
			}>).detail;
			const providerId = detail?.providerId;
			if (!providerId) return;
			const isTargetProvider = providerId === inspectorProviderId;
			if (inspectorStateClearRef.current !== null) {
				window.clearTimeout(inspectorStateClearRef.current);
				inspectorStateClearRef.current = null;
			}
			const isProviderSwap =
				typeof window !== "undefined" &&
				Boolean(window[PROVIDER_INSPECTOR_STATE_KEY]) &&
				window[PROVIDER_INSPECTOR_STATE_KEY] !== providerId;
			const lastOpenProviderId = window[PROVIDER_INSPECTOR_LAST_OPEN_ID_KEY] ?? null;
			const lastOpenAt = window[PROVIDER_INSPECTOR_LAST_OPEN_AT_KEY] ?? null;
			const isImmediateProviderChange =
				lastOpenProviderId &&
				lastOpenProviderId !== providerId &&
				typeof lastOpenAt === "number" &&
				Date.now() - lastOpenAt < 1500;
			const shouldDisableAnimation = Boolean(
				detail?.disableAnimation || isProviderSwap || isImmediateProviderChange,
			);
			if (isTargetProvider && shouldDisableAnimation) {
				if (inspectorAnimationResetRef.current !== null) {
					window.clearTimeout(inspectorAnimationResetRef.current);
				}
				document.documentElement.dataset.providerInspectorSwitching = "true";
				window.setTimeout(() => {
					if (document.documentElement.dataset.providerInspectorSwitching === "true") {
						delete document.documentElement.dataset.providerInspectorSwitching;
					}
				}, 250);
				setDisableInspectorAnimation(true);
				inspectorAnimationResetRef.current = window.setTimeout(() => {
					setDisableInspectorAnimation(false);
					inspectorAnimationResetRef.current = null;
				}, 250);
			}
			if (isTargetProvider) {
				window[PROVIDER_INSPECTOR_STATE_KEY] = providerId;
				window[PROVIDER_INSPECTOR_LAST_OPEN_ID_KEY] = providerId;
				window[PROVIDER_INSPECTOR_LAST_OPEN_AT_KEY] = Date.now();
			}
			setExpanded(isTargetProvider);
		};

		window.addEventListener(PROVIDER_INSPECTOR_OPEN_EVENT, handleOpen);
		return () => {
			window.removeEventListener(PROVIDER_INSPECTOR_OPEN_EVENT, handleOpen);
			if (inspectorAnimationResetRef.current !== null) {
				window.clearTimeout(inspectorAnimationResetRef.current);
			}
			if (inspectorStateClearRef.current !== null) {
				window.clearTimeout(inspectorStateClearRef.current);
			}
		};
	}, [inspectorProviderId]);

	const sec = useMemo(
		() => buildProviderSections(provider, selectedPlan, pricingTimeMs),
		[pricingTimeMs, provider, selectedPlan]
	);
	const tablePlan = defaultPlan;
	const tableSec = useMemo(
		() => buildProviderSections(provider, tablePlan, pricingTimeMs),
		[pricingTimeMs, provider, tablePlan],
	);
	const tableDerivedPricingMultiplier = useMemo(
		() =>
			derivePricingMultiplier({
				provider,
				comparisonProviders,
				selectedPlan: tablePlan,
				nowMs: pricingTimeMs,
			}),
		[comparisonProviders, pricingTimeMs, provider, tablePlan],
	);
	const planMultiplierLabels = useMemo(() => {
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
					nowMs: pricingTimeMs,
				}),
			);
		}
		return labels;
	}, [availablePlans, defaultPlan, pricingTimeMs, provider]);
	const pricingComparisonAccent =
		selectedPlan === "batch" ||
		selectedPlan === "flex" ||
		selectedPlan === "free" ||
		selectedPlan === "priority"
			? selectedPlan
			: null;

	const now = new Date(pricingTimeMs);

	const planRules = getProviderPricingRulesForPlan(provider, selectedPlan);
	const hasPlanPricing = planRules.length > 0;
	const timeWindowPricingRules = planRules
		.filter((rule) => isRuleActiveNow(rule, pricingTimeMs))
		.map((rule) => ({
			rule,
			windows: (rule.time_windows ?? []).filter(
				(window) =>
					window &&
					window.timezone === "UTC" &&
					window.price_per_unit !== undefined &&
					window.price_per_unit !== null,
			),
		}))
		.filter((entry) => entry.windows.length > 0);
	const timeWindowBillingTimestampBasis =
		timeWindowPricingRules[0]?.rule.billing_timestamp_basis ?? null;
	const providerModelsInScope = getProviderModelScopeForPlan(
		provider,
		selectedPlan,
	);
	const tableProviderModelsInScope = getProviderModelScopeForPlan(
		provider,
		tablePlan,
	);

	const leavingSoonProviderModel = providerModelsInScope
		.filter((providerModel) => {
			if (!providerModel.effective_to) return false;
			const to = new Date(providerModel.effective_to).getTime();
			return to > now.getTime();
		})
		.sort(
			(a, b) =>
				new Date(a.effective_to!).getTime() - new Date(b.effective_to!).getTime(),
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
		statusKey === "active" && leavingSoonProviderModel?.effective_to
			? `${statusMeta.description} Provider availability ends on ${formatLeavingDate(leavingSoonProviderModel.effective_to, now)}`
			: statusMeta.description;
	const isComingSoonProvider = statusKey === "coming_soon";
	const isInternalTestingProvider = statusKey === "internal_testing";
	const tableLeavingSoonProviderModel = tableProviderModelsInScope
		.filter((providerModel) => {
			if (!providerModel.effective_to) return false;
			const to = new Date(providerModel.effective_to).getTime();
			return to > now.getTime();
		})
		.sort(
			(a, b) =>
				new Date(a.effective_to!).getTime() - new Date(b.effective_to!).getTime(),
		)[0];
	const tableResolvedGatewayStatuses = tableProviderModelsInScope.map((providerModel) =>
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
	const tableStatusKey = chooseGatewayStatus(tableResolvedGatewayStatuses);
	const tableStatusMeta =
		PROVIDER_STATUS_META[tableStatusKey] ?? PROVIDER_STATUS_META.not_listed;
	const tableStatusIcon = tableStatusMeta.icon;
	const tableStatusClass = cn("h-3.5 w-3.5", tableStatusMeta.iconClass);
	const tableStatusLabel = tableStatusMeta.label;
	const tableStatusDetail =
		tableStatusKey === "active" && tableLeavingSoonProviderModel?.effective_to
			? `${tableStatusMeta.description} Provider availability ends on ${formatLeavingDate(tableLeavingSoonProviderModel.effective_to, now)}`
			: tableStatusMeta.description;
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
			| "embeddingTokens"
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
	const createEmbeddingTiles = (triple: TokenTriple | undefined): TokenMetricTile[] => {
		if (!triple) return [];
		const directions = [
			{ key: "input", suffix: " Input", tiers: triple.in },
			{ key: "output", suffix: " Output", tiers: triple.out },
			{ key: "cache-read", suffix: " Cache Reads", tiers: triple.cached },
			{ key: "cache-write", suffix: " Cache Writes", tiers: triple.write },
		] as const;

		return directions.flatMap((direction) =>
			direction.tiers.map((tier, index) => {
				const source = tier.label && tier.label !== "All usage" ? tier.label : "Embedding";
				return {
					key: `embeddings-${direction.key}-${source}-${index}`,
					title: `${source}${direction.suffix}`,
					groupTitle: "Embeddings",
					tiers: [{ ...tier, label: "All usage" }],
					unitLabel: "Per 1M tokens",
				};
			}),
		);
	};
	const tokenMetricTiles = [
		...createTokenTiles("Text", "text", sec.textTokens),
		...createEmbeddingTiles(sec.embeddingTokens),
		...createTokenTiles("Audio", "audio", sec.audioTokens),
		...createTokenTiles("Image", "image", sec.imageTokens),
		...createTokenTiles("Video", "video", sec.videoTokens),
	];
	const tokenMetricGroups = Array.from(
		tokenMetricTiles.reduce((groups, tile) => {
			const label = tile.groupTitle ?? "Tokens";
			const entries = groups.get(label) ?? [];
			entries.push(tile);
			groups.set(label, entries);
			return groups;
		}, new Map<string, TokenMetricTile[]>()),
	).map(([label, tiles]) => ({
		label,
		tiles,
		columns: Math.min(4, tiles.length),
	}));
	const infoScope = providerModelsInScope;
	const tableInfoScope = tableProviderModelsInScope;
	const providerModelSlugs = infoScope.map((pm) => pm.provider_model_slug);
	const providerApiModelIds = infoScope.map((pm) => pm.model_id);
	const tableProviderModelSlugs = tableInfoScope.map((pm) => pm.provider_model_slug);
	const tableProviderApiModelIds = tableInfoScope.map((pm) => pm.model_id);
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
		!sec.embeddingTokens &&
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
	const activeDiscountEntries = collectDiscountEntriesFromSections(sec);
	const activePromotionEntries = activeDiscountEntries.filter((entry) => entry.endsAt);
	const tableActiveDiscountEntries = collectDiscountEntriesFromSections(tableSec);
	const discountCount = activePromotionEntries.length;
	const tableDiscountCount = tableActiveDiscountEntries.length;
	const soonestDiscountEnd = activePromotionEntries
		.map((entry) => entry.endsAt)
		.filter((value): value is string => Boolean(value))
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
	const discountBadge = discountCount ? formatDiscountBadge(activePromotionEntries) : null;
	const tableDiscountBadge = tableDiscountCount
		? formatDiscountBadge(tableActiveDiscountEntries)
		: null;
	const discountTimeRemaining =
		discountCount && soonestDiscountEnd
			? formatDiscountTimeRemaining(soonestDiscountEnd)
			: null;
	const selectedPlanLabel = getPricingPlanLabel(selectedPlan);
	const selectedPlanTheme = getPlanTheme(selectedPlan);
	const tablePlanTheme = getPlanTheme(tablePlan);
	const performanceMetrics = [
		{
			key: "latency",
			label: "Latency",
			value:
				runtimeStats?.latencyMs30m != null
					? formatLatencySeconds(runtimeStats.latencyMs30m)
					: "--",
			valueClassName: uptimeValueClass(uptimePct),
		},
		{
			key: "throughput",
			label: "Throughput",
			value: throughputValue ? `${throughputValue} tps` : "--",
			valueClassName: selectedPlanTheme.accent,
		},
		{
			key: "uptime",
			label: "Uptime",
			value: formatPercent(uptimePct),
			valueClassName: selectedPlanTheme.accent,
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
	const tableInputPriceSummary = buildProviderTablePriceSummary(tableSec, "input");
	const tableOutputPriceSummary = buildProviderTablePriceSummary(tableSec, "output");
	const tableCacheReadPriceSummary = showCacheReadColumn
		? buildProviderTablePriceSummary(tableSec, "cached")
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
	const providerNavigationItems = Array.from(
		new Map(
			navigationProviders.map((candidate) => [
				candidate.provider.api_provider_id,
				{
					id: candidate.provider.api_provider_id,
					name:
						candidate.provider.api_provider_name ||
						candidate.provider.api_provider_id,
				},
			]),
		).values(),
	);
	const currentProviderNavigationIndex = providerNavigationItems.findIndex(
		(item) => item.id === inspectorProviderId,
	);
	const canNavigateProviders = providerNavigationItems.length > 1;
	const previousProviderNavigationItem =
		canNavigateProviders && currentProviderNavigationIndex >= 0
			? providerNavigationItems[
					(currentProviderNavigationIndex - 1 + providerNavigationItems.length) %
						providerNavigationItems.length
				]
			: null;
	const nextProviderNavigationItem =
		canNavigateProviders && currentProviderNavigationIndex >= 0
			? providerNavigationItems[
					(currentProviderNavigationIndex + 1) % providerNavigationItems.length
				]
			: null;
	const openInspectorForProvider = (
		providerId: string,
		options: { disableAnimation?: boolean } = {},
	) => {
		const currentOpenProviderId = window[PROVIDER_INSPECTOR_STATE_KEY] ?? null;
		const suppressAnimationForProviderId =
			window[PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY] ?? null;
		const recentlyClosedProviderId =
			window[PROVIDER_INSPECTOR_RECENTLY_CLOSED_ID_KEY] ?? null;
		const recentlyClosedAt =
			window[PROVIDER_INSPECTOR_RECENTLY_CLOSED_AT_KEY] ?? null;
		const lastOpenProviderId = window[PROVIDER_INSPECTOR_LAST_OPEN_ID_KEY] ?? null;
		const lastOpenAt = window[PROVIDER_INSPECTOR_LAST_OPEN_AT_KEY] ?? null;
		const isImmediateReopenAfterClose =
			recentlyClosedProviderId &&
			recentlyClosedProviderId !== providerId &&
			typeof recentlyClosedAt === "number" &&
			Date.now() - recentlyClosedAt < 500;
		const isImmediateProviderChange =
			lastOpenProviderId &&
			lastOpenProviderId !== providerId &&
			typeof lastOpenAt === "number" &&
			Date.now() - lastOpenAt < 1500;
		const disableAnimation = Boolean(
			options.disableAnimation ||
				(currentOpenProviderId && currentOpenProviderId !== providerId) ||
				suppressAnimationForProviderId === providerId ||
				isImmediateReopenAfterClose ||
				isImmediateProviderChange,
		);
		if (suppressAnimationForProviderId === providerId) {
			window[PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY] = null;
		}
		window[PROVIDER_INSPECTOR_RECENTLY_CLOSED_ID_KEY] = null;
		window[PROVIDER_INSPECTOR_RECENTLY_CLOSED_AT_KEY] = null;
		if (disableAnimation) {
			document.documentElement.dataset.providerInspectorSwitching = "true";
			window.setTimeout(() => {
				if (document.documentElement.dataset.providerInspectorSwitching === "true") {
					delete document.documentElement.dataset.providerInspectorSwitching;
				}
			}, 250);
		}
		window.dispatchEvent(
			new CustomEvent(PROVIDER_INSPECTOR_OPEN_EVENT, {
				detail: { providerId, disableAnimation },
			}),
		);
	};
	const toggleExpanded = () => {
		if (expanded) {
			window[PROVIDER_INSPECTOR_STATE_KEY] = null;
			setExpanded(false);
			return;
		}
		openInspectorForProvider(inspectorProviderId);
	};
	const handleSummaryRowClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
		const interactiveTarget = (event.target as HTMLElement).closest(
			"a, button, input, select, textarea, [role='button']",
		);
		if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
		toggleExpanded();
	};
	const handleSummaryRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		const interactiveTarget = (event.target as HTMLElement).closest(
			"a, button, input, select, textarea, [role='button']",
		);
		if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
		event.preventDefault();
		toggleExpanded();
	};
	const handleSummaryRowPointerDownCapture = (
		event: React.PointerEvent<HTMLTableRowElement>,
	) => {
		const interactiveTarget = (event.target as HTMLElement).closest(
			"a, button, input, select, textarea, [role='button']",
		);
		if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
		const currentOpenProviderId = window[PROVIDER_INSPECTOR_STATE_KEY] ?? null;
		const hasMountedInspector = Boolean(
			document.querySelector('[data-slot="provider-inspector-sheet-content"]'),
		);
		if (
			(currentOpenProviderId && currentOpenProviderId !== inspectorProviderId) ||
			(hasMountedInspector && !expanded)
		) {
			window[PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY] = inspectorProviderId;
		}
	};
	const handleInspectorOpenChange = (open: boolean) => {
		if (!open && expanded) {
			const closingProviderId = inspectorProviderId;
			window[PROVIDER_INSPECTOR_RECENTLY_CLOSED_ID_KEY] = closingProviderId;
			window[PROVIDER_INSPECTOR_RECENTLY_CLOSED_AT_KEY] = Date.now();
			if (inspectorStateClearRef.current !== null) {
				window.clearTimeout(inspectorStateClearRef.current);
			}
			inspectorStateClearRef.current = window.setTimeout(() => {
				if (window[PROVIDER_INSPECTOR_STATE_KEY] === closingProviderId) {
					window[PROVIDER_INSPECTOR_STATE_KEY] = null;
				}
				if (window[PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY] === closingProviderId) {
					window[PROVIDER_INSPECTOR_SUPPRESS_ANIMATION_KEY] = null;
				}
				inspectorStateClearRef.current = null;
			}, 180);
		}
		setExpanded(open);
	};
	const copyInspectorValue = async (value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setCopiedInspectorValue(value);
			window.setTimeout(() => {
				setCopiedInspectorValue((current) => (current === value ? null : current));
			}, 1400);
		} catch {
			setCopiedInspectorValue(null);
		}
	};
	const providerInfoProps = {
		providerId: sec.providerId,
		providerModelSlugs: tableProviderModelSlugs,
		apiModelIds: tableProviderApiModelIds,
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
			derivedMultiplier: tableDerivedPricingMultiplier?.multiplier ?? null,
			derivedMinMultiplier: tableDerivedPricingMultiplier?.minMultiplier ?? null,
			derivedMaxMultiplier: tableDerivedPricingMultiplier?.maxMultiplier ?? null,
			derivedComparisonProviderName:
				tableDerivedPricingMultiplier?.comparedProviderName ?? null,
			derivedRuleCount: tableDerivedPricingMultiplier?.ruleCount ?? null,
			notes: provider.provider.regional_pricing_notes ?? null,
			sourceUrl: provider.provider.pricing_source_url ?? null,
		},
		showQuantizationTrigger: false,
		showModelMappingTrigger: false,
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
	const displayProviderModelIds = Array.from(
		new Set(
			infoScope.map(
				(providerModel) =>
					providerModel.provider_model_slug?.trim() || providerModel.model_id?.trim(),
			),
		),
	).filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);
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
		<div className="py-3">
			<div>
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
		<div className="space-y-2.5">
			{tokenMetricGroups.map((group) => (
				<div key={group.label} className="space-y-1">
					<div
						className="grid"
						style={{
							gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))`,
						}}
					>
						{group.tiles.map((tile, index) => (
							<div
								key={tile.key}
								className={cn(
									"min-h-[78px] min-w-0 py-2.5",
									index % group.columns === 0
										? "pr-3"
										: "border-l border-zinc-200/80 px-3 dark:border-zinc-800",
								)}
							>
								<div className="text-[11px] text-muted-foreground">
									{tokenMetricGroups.length > 1
										? `${group.label} ${tile.title}`
										: tile.title}
								</div>
								{tile.tiers ? (
									<>
										{renderCompactTierSummary(
											tile.tiers,
											selectedPlanTheme.accent,
											timeWindowBillingTimestampBasis,
										)}
										<div className="mt-0.5 text-[10px] text-muted-foreground">
											{tile.unitLabel}
										</div>
									</>
								) : null}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	) : null;
	const additionalMeterSummaries: AdditionalMeterSummary[] = [
		imageInputs.length > 0
			? {
					key: "image-inputs",
					label: "Image inputs",
					value: formatPriceRange(imageInputs.map((row) => row.price)),
					unit:
						new Set(imageInputs.map((row) => row.unitLabel)).size === 1
							? imageInputs[0]?.unitLabel ?? "Usage"
							: "Mixed units",
					detail: formatCountLabel(new Set(imageInputs.map((row) => row.label)).size, "condition"),
				}
			: null,
		videoInputs.length > 0
			? {
					key: "video-inputs",
					label: "Video inputs",
					value: formatPriceRange(videoInputs.map((row) => row.price)),
					unit:
						new Set(videoInputs.map((row) => row.unitLabel)).size === 1
							? videoInputs[0]?.unitLabel ?? "Usage"
							: "Mixed units",
					detail: formatCountLabel(new Set(videoInputs.map((row) => row.label)).size, "condition"),
				}
			: null,
		sec.otherRules.length > 0
			? {
					key: "conditional",
					label: "Conditional meters",
					value: formatPriceRange(sec.otherRules.map((row) => row.price)),
					unit: "See rules",
					detail: formatCountLabel(sec.otherRules.length, "rule"),
				}
			: null,
	].filter((summary): summary is AdditionalMeterSummary => Boolean(summary));
	const pricingGeneratedOutputContent =
		!isFreePlan &&
		(Boolean(sec.imageGen) ||
			upcomingFor("imageGen").length > 0 ||
			Boolean(sec.videoGen) ||
			upcomingFor("videoGen").length > 0) ? (
			<div className="space-y-2.5 pt-1">
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
			sec.otherRules.length > 0 ||
			upcomingFor("other").length > 0) ? (
			<div className="space-y-2 pt-1">
				<div>
					<h4 className="text-xs font-semibold text-foreground">Additional meters</h4>
				</div>
					{additionalMeterSummaries.length > 0 ? (
						<div className="space-y-2">
							{additionalMeterSummaries.map((summary) => (
								<div
									key={summary.key}
									className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4"
								>
									<div className="text-[11px] text-muted-foreground">{summary.label}</div>
									<div className="text-right">
										<div className="text-sm font-medium tabular-nums text-foreground">{summary.value}</div>
										<div className="text-[10px] text-muted-foreground">
											{summary.unit}{summary.detail ? ` / ${summary.detail}` : ""}
										</div>
									</div>
								</div>
							))}
						</div>
					) : null}
					{sec.requests && sec.requests.length > 0 ? (
						<div className="space-y-1.5">
							{sec.requests.map((tier, index) => {
								const hasComparison =
									tier.basePrice != null &&
									Number.isFinite(tier.basePrice) &&
									Math.abs(tier.basePrice - tier.price) > 1e-9;
								return (
									<div
										key={`${tier.meter ?? "request"}-${tier.label}-${index}`}
										className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4"
									>
										<div className="text-[11px] text-muted-foreground">
											{formatRequestMeterTitle(tier.meter)}
										</div>
										<div className="flex items-baseline justify-end gap-2 text-right">
											{hasComparison ? (
												<span className="text-[11px] tabular-nums text-muted-foreground line-through">
													{fmtUSD(tier.basePrice!)}
												</span>
											) : null}
											<span
												className={cn(
													"text-sm font-medium tabular-nums",
													selectedPlanTheme.accent,
												)}
											>
												{fmtUSD(tier.price)}
											</span>
											<span className="text-[10px] text-muted-foreground">
												{formatRequestMeterUnit(tier.unitLabel)}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					) : null}
				<div className="space-y-2.5">
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
			</div>
		) : null;

	const sheetSectionPrefix = `provider-${sec.providerId.replace(/[^a-z0-9_-]/gi, "-")}-${selectedPlan}`;
	const pricingSectionId = `${sheetSectionPrefix}-pricing`;
	const performanceSectionId = `${sheetSectionPrefix}-performance`;
	const availabilitySectionId = `${sheetSectionPrefix}-availability`;
	const dataPolicySectionId = `${sheetSectionPrefix}-data-policy`;
	const parametersSectionId = `${sheetSectionPrefix}-parameters`;
	const dataPolicySummary = [
		{
			label: "Training Policy",
			value: formatPolicyValue(provider.provider.prompt_training_policy),
		},
		{
			label: "Zero Data Retention",
			value: formatPolicyValue(provider.provider.zero_data_retention),
		},
		{
			label: "Data Policy",
			value: formatPolicyValue(provider.provider.data_policy_tier),
		},
		{
			label: "Residency",
			value: formatPolicyValue(provider.provider.residency_mode),
		},
	];

	return (
		<>
			<TableRow
				role="button"
				tabIndex={0}
				aria-selected={expanded}
				aria-expanded={expanded}
				data-provider-inspector-open={expanded ? "true" : undefined}
				onPointerDownCapture={handleSummaryRowPointerDownCapture}
				onClick={handleSummaryRowClick}
				onKeyDown={handleSummaryRowKeyDown}
				className={cn(
					"group cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30",
					isLastVisible && "border-b-0",
				)}
			>
				<TableCell className="relative min-w-[280px] py-1 pl-3 pr-2">
					{expanded ? (
						<motion.span
							aria-hidden="true"
							className="absolute inset-y-0 left-0 w-0.5 bg-primary"
							initial={reduceMotion ? false : { opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={
								reduceMotion
									? { duration: 0 }
									: { duration: 0.12, ease: "easeOut" }
							}
						/>
					) : null}
					<div>
						<div className="flex items-center gap-2.5">
							<Link
								href={`/api-providers/${sec.providerId}`}
								className="group/provider inline-flex items-center gap-2.5 whitespace-nowrap"
							>
								<div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors group-hover/provider:border-zinc-300 dark:border-zinc-800 dark:group-hover/provider:border-zinc-700">
									<div className="relative h-3.5 w-3.5">
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
											aria-label={`Provider status: ${tableStatusLabel}`}
											className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
										>
											{React.createElement(tableStatusIcon, {
												className: cn("h-3 w-3", tableStatusClass),
											})}
										</button>
									</HoverCardTrigger>
									<HoverCardContent align="start" className="w-auto p-2 text-xs">
										<p className="font-semibold">{tableStatusLabel}</p>
										<p className="mt-1 text-muted-foreground">{tableStatusDetail}</p>
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
							{inlineProviderLabels.length > 0 || tableDiscountBadge ? (
								<div className="flex shrink-0 items-center gap-x-1.5 text-[11px] text-muted-foreground">
									{inlineProviderLabels.map((item, index) => (
										<React.Fragment key={item}>
											{index > 0 ? <span className="text-zinc-300 dark:text-zinc-700">/</span> : null}
											<span className="whitespace-nowrap">{item}</span>
										</React.Fragment>
									))}
									{tableDiscountBadge ? (
										<>
											{inlineProviderLabels.length > 0 ? (
												<span className="text-zinc-300 dark:text-zinc-700">/</span>
											) : null}
											<span className={cn("whitespace-nowrap font-medium", tablePlanTheme.discountStrong)}>
												{tableDiscountBadge}
											</span>
										</>
									) : null}
								</div>
							) : null}
						</div>
					</div>
				</TableCell>
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					{renderTablePriceSummary(tableInputPriceSummary, tablePlanTheme.accent)}
				</TableCell>
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					{renderTablePriceSummary(tableOutputPriceSummary, tablePlanTheme.accent)}
				</TableCell>
				{showCacheReadColumn && tableCacheReadPriceSummary ? (
					<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
						{renderTablePriceSummary(tableCacheReadPriceSummary, tablePlanTheme.accent)}
					</TableCell>
				) : null}
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div className="font-medium text-foreground">{performanceMetrics[0].value}</div>
				</TableCell>
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div className="font-medium text-foreground">{performanceMetrics[1].value}</div>
				</TableCell>
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
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
			</TableRow>
			<TableRow className="h-0 border-0 hover:bg-transparent">
				<TableCell
					colSpan={showCacheReadColumn ? 7 : 6}
					className="h-0 border-0 p-0"
				>
					<ProviderInspectorSheet open={expanded} onOpenChange={handleInspectorOpenChange}>
						<ProviderInspectorSheetContent
							disableAnimation={disableInspectorAnimation}
							className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[50vw] lg:!w-[48vw] xl:!w-[44vw] 2xl:!w-[42vw] data-[side=right]:sm:max-w-none"
						>
					<div className="absolute right-14 top-4 z-10 flex items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={!previousProviderNavigationItem}
							aria-label={
								previousProviderNavigationItem
									? `Open ${previousProviderNavigationItem.name}`
									: "No previous provider"
							}
							onClick={() => {
								if (previousProviderNavigationItem) {
									openInspectorForProvider(previousProviderNavigationItem.id, {
										disableAnimation: true,
									});
								}
							}}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={!nextProviderNavigationItem}
							aria-label={
								nextProviderNavigationItem
									? `Open ${nextProviderNavigationItem.name}`
									: "No next provider"
							}
							onClick={() => {
								if (nextProviderNavigationItem) {
									openInspectorForProvider(nextProviderNavigationItem.id, {
										disableAnimation: true,
									});
								}
							}}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
					<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
						<div className="flex min-w-0 items-center gap-3 pr-10">
							<div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-background dark:border-zinc-800">
								<div className="relative h-7 w-7">
									<Logo
										id={logoProviderId}
										alt={`${displayName} logo`}
										className="object-contain"
										fill
										sizes="22px"
									/>
								</div>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 items-center gap-2">
									<ProviderInspectorSheetTitle className="truncate pr-2 text-base">
										<Link
											href={`/api-providers/${sec.providerId}`}
											className="underline-offset-4 transition-colors hover:text-primary hover:underline"
										>
											{displayName}
										</Link>
									</ProviderInspectorSheetTitle>
									<HoverCard openDelay={120} closeDelay={80}>
										<HoverCardTrigger asChild>
											<button
												type="button"
												aria-label={`Provider status: ${statusLabel}`}
												className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
											>
												{React.createElement(statusIcon, {
													className: cn("h-3 w-3", statusClass),
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
								</div>
								<ProviderInspectorSheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
									<button
										type="button"
										onClick={() => void copyInspectorValue(sec.providerId)}
										className="rounded-sm text-left text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
										title="Copy provider ID"
									>
										{copiedInspectorValue === sec.providerId ? "Copied" : sec.providerId}
									</button>
									{providerApiModelIds[0] ? (
										<>
											<span className="text-zinc-300 dark:text-zinc-700">/</span>
											<button
												type="button"
												onClick={() => void copyInspectorValue(providerApiModelIds[0]!)}
												className="truncate rounded-sm text-left text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
												title="Copy provider model ID"
											>
												{copiedInspectorValue === providerApiModelIds[0]
													? "Copied"
													: providerApiModelIds[0]}
											</button>
										</>
									) : null}
									{inlineProviderLabels.map((item) => (
										<React.Fragment key={item}>
											<span className="text-zinc-300 dark:text-zinc-700">/</span>
											<span>{item}</span>
										</React.Fragment>
									))}
								</ProviderInspectorSheetDescription>
							</div>
						</div>
					</ProviderInspectorSheetHeader>

					<ScrollArea
						className="min-h-0 flex-1 overscroll-contain"
						viewportClassName="pb-5 overscroll-contain"
						scrollBarOrientation="vertical"
					>
						{availablePlans.length > 0 ? (
							<div className="border-b border-zinc-200/80 px-5 py-2.5 dark:border-zinc-800">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<ProviderSheetSectionLink
										href={PROVIDER_SHEET_DOCS.serviceTier}
										className="text-xs font-medium text-muted-foreground"
									>
										Service tier
									</ProviderSheetSectionLink>
									<PricingPlanSelect
										value={selectedPlan}
										onChange={setSelectedPlan}
										plans={availablePlans}
										planMetaLabels={planMultiplierLabels}
										compact
									/>
								</div>
							</div>
						) : null}
						<div className="px-5">
							{availablePlans.length > 0 ? (
								<div className="sr-only">Selected service tier: {selectedPlanLabel}</div>
							) : null}

							<section id={pricingSectionId} className="scroll-mt-5 space-y-1 py-2">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="text-[15px] font-semibold text-foreground">
										<ProviderSheetSectionLink href={PROVIDER_SHEET_DOCS.pricing}>
											Pricing
										</ProviderSheetSectionLink>
									</h3>
									{discountBadge ? (
										<div
											className={cn(
												"inline-flex items-center gap-1.5 text-xs",
												selectedPlanTheme.discountText,
											)}
										>
											<span className={cn("font-semibold", selectedPlanTheme.discountStrong)}>
												{discountBadge}
											</span>
											<span className={selectedPlanTheme.discountMuted}>Promotion</span>
											{discountTimeRemaining ? (
												<span className={selectedPlanTheme.discountMuted}>
													{discountTimeRemaining}
												</span>
											) : null}
										</div>
									) : null}
								</div>
								{pricingPrimaryContent}
								{pricingGeneratedOutputContent}
								{pricingAdditionalContent}
							</section>

							<section
								id={performanceSectionId}
								className="scroll-mt-5 space-y-1 border-t border-zinc-200/80 py-2 dark:border-zinc-800"
							>
								<div>
									<h3 className="text-[15px] font-semibold text-foreground">
										<ProviderSheetSectionLink href={PROVIDER_SHEET_DOCS.performance}>
											Performance
										</ProviderSheetSectionLink>
									</h3>
								</div>
								<div className="grid sm:grid-cols-3 sm:divide-x sm:divide-zinc-200/80 sm:dark:divide-zinc-800">
									{performanceMetrics.map((metric) => (
										<div
											key={metric.key}
											className="py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0"
										>
											<div className="flex items-center gap-1 text-[11px] text-muted-foreground">
												<span>{metric.label}</span>
												{metric.key === "uptime" ? (
													<HoverCard openDelay={120} closeDelay={80}>
														<HoverCardTrigger asChild>
															<button
																type="button"
																aria-label="About uptime"
																className="inline-flex size-3.5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
															>
																<Info className="size-3" />
															</button>
														</HoverCardTrigger>
														<HoverCardContent
															align="start"
															side="top"
															className="w-72 text-left"
														>
															<UptimeHoverContent
																uptimePct={uptimePct}
																runtimeStats={runtimeStats}
															/>
														</HoverCardContent>
													</HoverCard>
												) : null}
											</div>
											<div
												className={cn(
													"mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums",
													metric.valueClassName,
												)}
											>
												<span>{metric.value}</span>
												{metric.key === "uptime" ? (
													<UptimeSparkline points={uptimeTrendPoints} className="h-4 w-10" />
												) : null}
											</div>
										</div>
									))}
								</div>
								{routingHealthSummary ? (
									<div className="border-l-2 border-amber-400 pl-3 text-xs text-amber-900 dark:text-amber-100">
										<div className="font-semibold">{routingHealthSummary.label}</div>
										<p className="mt-1">{routingHealthSummary.description}</p>
									</div>
								) : null}
							</section>

							<section
								id={availabilitySectionId}
								className="scroll-mt-5 space-y-1 border-t border-zinc-200/80 py-2 dark:border-zinc-800"
							>
								<div>
									<h3 className="text-[15px] font-semibold text-foreground">
										<ProviderSheetSectionLink href={PROVIDER_SHEET_DOCS.routing}>
											Routing details
										</ProviderSheetSectionLink>
									</h3>
								</div>
								<div className="space-y-2">
									<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
										<div className="text-[11px] text-muted-foreground">Gateway status</div>
										<div className="flex items-center justify-end gap-2 text-sm font-medium text-foreground">
												{React.createElement(statusIcon, { className: statusClass })}
												<span>{statusLabel}</span>
											</div>
									</div>
									<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
										<div className="text-[11px] text-muted-foreground">Provider model IDs</div>
										<div className="flex max-w-[18rem] flex-wrap justify-end gap-1.5">
											{displayProviderModelIds.map((modelId) => (
												<button
													key={modelId}
													type="button"
													onClick={() => void copyInspectorValue(modelId)}
													className="min-w-0 max-w-full rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:hover:bg-zinc-800"
													title="Copy provider model ID"
												>
													<span className="block truncate">
														{copiedInspectorValue === modelId ? "Copied" : modelId}
													</span>
												</button>
											))}
											{displayProviderModelIds.length === 0 ? (
												<span className="text-xs text-muted-foreground">No provider model IDs listed.</span>
											) : null}
										</div>
									</div>
								</div>
							</section>

							<section
								id={dataPolicySectionId}
								className="scroll-mt-5 space-y-1 border-t border-zinc-200/80 py-2 dark:border-zinc-800"
							>
								<div>
									<h3 className="text-[15px] font-semibold text-foreground">
										<ProviderSheetSectionLink href={PROVIDER_SHEET_DOCS.dataRetention}>
											Data and Retention
										</ProviderSheetSectionLink>
									</h3>
								</div>
								<div className="space-y-2">
									{dataPolicySummary.map((item) => (
										<div
											key={item.label}
											className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4"
										>
											<div className="text-[11px] text-muted-foreground">{item.label}</div>
											<div className="text-right text-sm font-medium text-foreground">{item.value}</div>
										</div>
									))}
								</div>
								{privacyReasonMeta.length > 0 ? (
									<div className="border-l-2 border-red-400 pl-3 text-xs text-red-900 dark:text-red-100">
										<div className="font-semibold">Blocked by workspace settings</div>
										<ul className="mt-1 list-inside list-disc space-y-1">
											{privacyReasonMeta.map(({ reason, meta }) => (
												<li key={reason}>{meta?.label ?? reason}</li>
											))}
										</ul>
									</div>
								) : null}
							</section>

							<section className="scroll-mt-5 space-y-1 border-t border-zinc-200/80 py-2 dark:border-zinc-800">
								<div>
									<h3 className="text-[15px] font-semibold text-foreground">Technical Details</h3>
								</div>
								<div className="space-y-2">
									{[
										["Quantization", summaryQuantization ?? "--"],
										["Context", contextLengthValue],
										["Max output", maxOutputValue],
									].map(([label, value]) => (
										<div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
											<div className="text-[11px] text-muted-foreground">{label}</div>
											<div className="text-right text-sm font-medium tabular-nums text-foreground">{value}</div>
										</div>
									))}
								</div>
							</section>

							<section
								id={parametersSectionId}
								className="scroll-mt-5 space-y-1 border-t border-zinc-200/80 py-2 dark:border-zinc-800"
							>
								<div>
									<h3 className="text-[15px] font-semibold text-foreground">Supported Parameters</h3>
								</div>
								{supportedParameters.length > 0 ? (
									<div className="flex flex-wrap items-start gap-1.5">
										{supportedParameters.map((param) => {
											const reference = getParameterReference(param);
											return (
												<HoverCard key={param} openDelay={120} closeDelay={80}>
													<HoverCardTrigger asChild>
														<Button
															type="button"
															variant="outline"
															size="sm"
														className="h-7 min-h-0 justify-start rounded-md px-2 py-1 font-mono text-[11px]"
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
								) : (
									<div className="rounded-lg border border-dashed border-zinc-200/80 bg-zinc-50/60 px-3 py-3 text-sm text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/30">
										No parameter metadata is published for this route.
									</div>
								)}
							</section>
						</div>
					</ScrollArea>
						</ProviderInspectorSheetContent>
					</ProviderInspectorSheet>
				</TableCell>
			</TableRow>
		</>
	);
}
