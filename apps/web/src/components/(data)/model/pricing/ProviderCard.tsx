"use client";
import { localizedWorkspacePolicyReason } from "@/i18n/workspace-policy-messages";
import { localizedPricingDisplayLabel } from "@/i18n/pricing-display";

import { ProviderRouteName } from "./ProviderRouteName";
import { ProviderRoutingHelp } from "./ProviderRoutingHelp";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { resolveEnforcedZdr } from "@/components/(data)/model/pricing/zdr";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getLocalizedDocsHref } from "@/lib/docs";
import { motion, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import {
	AlertTriangle,
	ArrowUpRight,
	Ban,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	CheckCircle2,
	Clock3,
	FlaskConical,
	Info,
	KeyRound,
	ShieldBan,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
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
	MeterRateRows,
	UpcomingPricingSection,
} from "@/components/(data)/model/pricing/sections";
import {
	buildParameterSupportSummary,
	prettifyParamName,
} from "@/components/(data)/model/pricing/ProviderModelParameters";
import {
	buildProviderSections,
	buildProviderTablePriceSummaryForColumn,
	fmtUSD,
	ruleMatchCovers,
	ruleComparisonMatchSignature,
	type QualityRow,
	type ResolutionRow,
	type ProviderTablePriceColumn,
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
	getParameterReferenceTranslationKey,
} from "@/lib/parameters/reference";
import {
	getProviderModelScopeForPlan,
	getProviderPlanComparisonBase,
	getProviderPricingRulesForPlan,
	hasSelectedAlternativeServiceTier,
} from "@/components/(data)/model/pricing/providerPlanRouting";
import {
	formatProviderOfferDisplayName,
	resolveProviderDisplayName,
} from "@/lib/providers/providerOffers";
import {
	chooseGatewayStatus,
	type CanonicalGatewayStatus,
	resolveGatewayStatus,
} from "@/components/(data)/model/pricing/providerGatewayStatus";
import {
	summarizeProviderLifecycle,
	type ProviderLifecycleStatusInput,
} from "@/components/(data)/model/pricing/providerLifecycleStatus";
import {
	clearProviderInspector,
	dispatchProviderInspectorOpen,
	PROVIDER_INSPECTOR_CHANGE_EVENT,
	type ProviderInspectorChangeDetail,
} from "@/components/(data)/model/pricing/providerInspectorSync";
import type { WorkspacePolicyBlockedReason } from "@/lib/chat/effectivePolicy";

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
				"group inline-flex items-center gap-1.5 text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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

function formatLatencySeconds(value: number | null | undefined, locale: string): string {
	if (!hasObservedValue(value)) return "--";
	const seconds = value / 1000;
	const decimals = seconds >= 10 ? 1 : 2;
	return `${seconds.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}s`;
}

function formatThroughputValue(value: number | null | undefined, locale: string): string | null {
	if (!hasObservedValue(value)) return null;
	return value.toLocaleString(locale, { minimumFractionDigits: value >= 100 ? 0 : 1, maximumFractionDigits: value >= 100 ? 0 : 1 });
}

function formatPercent(value: number | null | undefined, locale: string): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 100);
}

function getPricingPlanTranslationKey(plan: string): string | null {
	switch (plan) {
		case "standard":
			return "tierStandard";
		case "free":
			return "tierFree";
		case "batch":
			return "tierBatch";
		case "flex":
			return "tierFlex";
		case "priority":
			return "tierFast";
		case "ultrafast":
			return "tierUltrafast";
		default:
			return null;
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

function formatUptimeDayLabel(dayOffset: number, locale: string, todayLabel: string): string {
	if (dayOffset === 0) return todayLabel;
	return new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" }).format(
		-dayOffset,
		"day",
	);
}

function UptimeHoverContent({
	uptimePct,
	runtimeStats,
}: {
	uptimePct: number | null;
	runtimeStats: ProviderRuntimeStats | null | undefined;
}) {
	const t = useTranslations("Catalogue.modelDetail.providerTable");
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	const locale = useLocale();
	const dailyPoints = (runtimeStats?.uptimeDaily3d ?? [])
		.slice()
		.sort((a, b) => b.dayOffset - a.dayOffset);
	return (
		<div className="space-y-2.5">
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm font-medium text-foreground">{t("threeDayUptime")}</p>
				<span className={cn("font-medium tabular-nums", uptimeValueClass(uptimePct))}>
					{formatPercent(uptimePct, locale)}
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
								{formatUptimeDayLabel(point.dayOffset, locale, tSections("today"))}
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
	const t = useTranslations("Catalogue.modelDetail.sections");
	const locale = useLocale();
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
			aria-label={t("dailyUptime")}
			role="img"
		>
			{points.map((value, index) => {
				const x = insetX + index * (barWidth + gap);
				const y = height - insetY - barHeight;
				const opacity =
					value == null || !Number.isFinite(value)
						? 0.45
						: 1;

				const day = formatUptimeDayLabel(
					points.length - 1 - index,
					locale,
					t("today"),
				);

				return (
					<Tooltip key={`${index}-${value ?? "null"}`}>
						<TooltipTrigger asChild>
							<g
								aria-label={`${day}: ${formatPercent(value, locale)}`}
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
						<TooltipContent side="top">{day}: {formatPercent(value, locale)}</TooltipContent>
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

const ERROR_CATEGORY_LABELS: Record<string, string> = {
	authentication: "Catalogue.models.detail.quickstart.authentication",
	payment: "Common.ui.providerCardCopy.payment",
	model_unavailable: "Common.ui.providerCardCopy.modelUnavailable",
	server: "Common.ui.providerCardCopy.server",
	stream: "Product.tools.request.stream",
	other_provider: "Common.ui.providerCardCopy.otherProvider",
};

type ProviderUptimeHours = 24 | 48 | 60 | 72;
type ProviderPerformanceMetricKey = "latency" | "throughput" | "uptime";
type ProviderPerformancePoint = ProviderRuntimeStats["performanceHourly3d"][number];

const PROVIDER_HOURLY_UPTIME_HOURS: ProviderUptimeHours = 60;

function getPerformanceMetricValue(
	metric: ProviderPerformanceMetricKey,
	point: ProviderPerformancePoint,
): number | null {
	switch (metric) {
		case "latency":
			return point.latencyMs;
		case "throughput":
			return point.throughput;
		case "uptime":
			return point.uptimePct;
	}
}

function hasPerformanceMetricValue(
	metric: ProviderPerformanceMetricKey,
	value: number | null | undefined,
): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		(metric === "uptime" || value > 0)
	);
}

type ProviderCopyTranslator = { (key: never, values?: never): string; has(key: never): boolean };

function getPerformanceMetricLabel(metric: ProviderPerformanceMetricKey, tx: ProviderCopyTranslator): string {
	switch (metric) {
		case "latency":
			return tx("Common.ui.providerCardCopy.hourlyLatency" as never);
		case "throughput":
			return tx("Common.ui.providerCardCopy.hourlyThroughput" as never);
		case "uptime":
			return tx("Common.ui.providerCardCopy.hourlyUptime" as never);
	}
}

function formatPerformancePeriod(points: ProviderPerformancePoint[], locale: string): string | null {
	const firstPoint = points[0];
	const lastPoint = points.at(-1);
	if (!firstPoint || !lastPoint) return null;

	const start = new Date(firstPoint.start);
	const end = new Date(Date.parse(lastPoint.start) + 60 * 60 * 1000);
	if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;

	return formatPerformancePeriodRange(start, end, locale);
}

function formatPerformancePeriodRange(start: Date, end: Date, locale: string): string | null {
	if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;

	const formatter = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
	});
	return `${formatter.format(start)} – ${formatter.format(end)} UTC`;
}

function formatPerformancePointPeriod(point: ProviderPerformancePoint, locale: string): string | null {
	const start = new Date(point.start);
	const end = new Date(Date.parse(point.start) + 60 * 60 * 1000);
	return formatPerformancePeriodRange(start, end, locale);
}

function getPerformanceMetricTooltipLabel(metric: ProviderPerformanceMetricKey, tx: ProviderCopyTranslator): string {
	switch (metric) {
		case "latency":
			return tx("Catalogue.modelDetail.providerTable.latency" as never);
		case "throughput":
			return tx("Catalogue.modelDetail.providerTable.throughput" as never);
		case "uptime":
			return tx("Catalogue.modelDetail.providerTable.uptime" as never);
	}
}

function formatPerformanceMetricValue(
	metric: ProviderPerformanceMetricKey,
	value: number | null,
	locale: string,
	tx: ProviderCopyTranslator,
): string {
	if (!hasPerformanceMetricValue(metric, value)) return tx("Catalogue.modelDetail.performance.noData" as never);
	switch (metric) {
		case "latency":
			return formatLatencySeconds(value, locale);
		case "throughput":
			return `${formatThroughputValue(value, locale) ?? "--"} tps`;
		case "uptime":
			return formatPercent(value, locale);
	}
}

function getPerformanceMetricNumberFlowProps(
	metric: ProviderPerformanceMetricKey,
	value: number,
): { value: number; suffix: string; format?: React.ComponentProps<typeof NumberFlow>["format"] } {
	switch (metric) {
		case "latency": {
			const seconds = value / 1000;
			return {
				value: seconds,
				suffix: "s",
				format: {
					minimumFractionDigits: seconds >= 10 ? 1 : 2,
					maximumFractionDigits: seconds >= 10 ? 1 : 2,
				},
			};
		}
		case "throughput":
			return {
				value,
				suffix: " tps",
				format: {
					minimumFractionDigits: value >= 100 ? 0 : 1,
					maximumFractionDigits: value >= 100 ? 0 : 1,
				},
			};
		case "uptime":
			return {
				value,
				suffix: "%",
				format: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
			};
	}
}

function ProviderPerformanceMetricValue({
	metric,
	value,
}: {
	metric: ProviderPerformanceMetricKey;
	value: number | null;
}) {
	const locale = useLocale();
	const valueClassName = "inline-flex min-h-5 min-w-[4rem] items-baseline";
	if (!hasPerformanceMetricValue(metric, value)) return <span className={valueClassName}>--</span>;
	const numberFlowProps = getPerformanceMetricNumberFlowProps(metric, value);
	return (
		<span className={valueClassName}>
			<NumberFlow locales={locale} value={numberFlowProps.value} format={numberFlowProps.format} />
			<span>{numberFlowProps.suffix}</span>
		</span>
	);
}

function ProviderHourlyPerformance({
	runtimeStats,
	hours = PROVIDER_HOURLY_UPTIME_HOURS,
	activeMetric,
	hoveredPoint,
	onPointHover,
	onPointLeave,
}: {
	runtimeStats: ProviderRuntimeStats | null | undefined;
	hours?: ProviderUptimeHours;
	activeMetric: ProviderPerformanceMetricKey;
	hoveredPoint: ProviderPerformancePoint | null;
	onPointHover: (point: ProviderPerformancePoint) => void;
	onPointLeave: () => void;
}) {
	const tx = useTranslations();
	const locale = useLocale();
	const points = (runtimeStats?.performanceHourly3d ?? []).slice(-hours);
	const categories = Object.entries(runtimeStats?.errorCategoryCounts3d ?? {})
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1]);
	const totalFailures = categories.reduce((sum, [, count]) => sum + count, 0);
	const rateLimited = runtimeStats?.rateLimited3d ?? 0;
	const metricLabel = getPerformanceMetricLabel(activeMetric, tx);
	const metricTooltipLabel = getPerformanceMetricTooltipLabel(activeMetric, tx);
	const performancePeriod = hoveredPoint
		? formatPerformancePointPeriod(hoveredPoint, locale)
		: formatPerformancePeriod(points, locale);
	const metricValues = points
		.map((point) => getPerformanceMetricValue(activeMetric, point))
		.filter((value): value is number => hasPerformanceMetricValue(activeMetric, value));
	const maxMetricValue = Math.max(...metricValues, 0);
	const hasHourlyPerformance = points.length > 0 && (
		metricValues.length > 0 || hasUptimeObservation(runtimeStats)
	);
	if (!hasHourlyPerformance && categories.length === 0 && rateLimited === 0) return null;

	return (
		<div className="space-y-3 py-3">
			{hasHourlyPerformance ? (
				<div>
					{performancePeriod ? (
						<p className="mb-1.5 text-center text-[10px] tabular-nums text-muted-foreground">
							{performancePeriod}
						</p>
					) : null}
					<div
						className="grid h-8 grid-flow-col auto-cols-fr items-end gap-0.5"
						role="img"
						aria-label={tx("Common.ui.providerCardCopy.metricOverTheLastHoursHours", { metric: metricLabel, hours })}
						onPointerLeave={onPointLeave}
					>
						{points.map((point, index) => {
							const metricValue = getPerformanceMetricValue(activeMetric, point);
							const hasData = hasPerformanceMetricValue(activeMetric, metricValue);
							const numericMetricValue = metricValue ?? 0;
							const pointLabel = hasData
								? formatPerformanceMetricValue(activeMetric, metricValue, locale, tx)
								: tx("Catalogue.modelDetail.performance.noData" as never);
							const barClassName = !hasData
								? "bg-muted-foreground/30"
								: activeMetric === "uptime" && numericMetricValue > 99
								? "bg-emerald-500"
								: activeMetric === "uptime" && numericMetricValue > 95
									? "bg-amber-500"
										: activeMetric === "uptime" ? "bg-red-500" : "bg-primary";
							const barHeight = activeMetric === "uptime"
								? "100%"
								: hasData && maxMetricValue > 0
									? `${Math.max(16, (numericMetricValue / maxMetricValue) * 100)}%`
									: "16%";
							const edgeRadiusClassName = index === 0
								? "rounded-l-xs"
								: index === points.length - 1
									? "rounded-r-xs"
									: "";

							return (
								<span
									key={point.start}
									className={cn(
										"min-w-0 self-end transition-[height,background-color] duration-150 motion-reduce:transition-none",
										edgeRadiusClassName,
										barClassName,
									)}
									style={{ height: barHeight }}
									tabIndex={0}
									aria-label={`${new Date(point.start).toLocaleString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC: ${metricTooltipLabel}: ${pointLabel}`}
									onPointerEnter={() => onPointHover(point)}
									onFocus={() => onPointHover(point)}
									onBlur={onPointLeave}
								/>
							);
						})}
					</div>
				</div>
			) : null}
			{categories.length > 0 || rateLimited > 0 ? (
				<div>
					<p className="text-[11px] text-muted-foreground">{tx("Common.ui.providerCardCopy.errorBreakdown3Days" as never)}</p>
					<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
						{categories.map(([category, count]) => (
							<span key={category} className="tabular-nums"><span className="text-muted-foreground">{ERROR_CATEGORY_LABELS[category] ? tx(ERROR_CATEGORY_LABELS[category] as never) : category}</span> {totalFailures > 0 ? formatPercent((count / totalFailures) * 100, locale) : "—"}</span>
						))}
						{rateLimited > 0 ? <span className="tabular-nums">{tx("Common.ui.providerCardCopy.rateLimitedCountExcluded", { count: rateLimited.toLocaleString(locale) })}</span> : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

function hasTokenTierComparison(tier: TokenTier): boolean {
	return (
		tier.basePer1M != null &&
		Number.isFinite(tier.basePer1M) &&
		Math.abs(tier.basePer1M - tier.per1M) > 1e-9
	);
}

function getTokenTierConditions(tiers: TokenTier[]): Array<string | null> {
	const conditions = tiers.map((tier) =>
		tier.label && tier.label !== "All usage" ? tier.label : null,
	);
	if (conditions[0]) return conditions;
	const firstExplicitCondition = conditions.find(Boolean) ?? null;
	if (!firstExplicitCondition) return conditions;
	const match = firstExplicitCondition.match(/^(>=|<=|>|<|≥|≤)\s*(.+)$/u);
	if (!match) return conditions;
	const [, operator, threshold] = match;
	const complement =
		operator === ">"
			? "≤"
			: operator === ">=" || operator === "≥"
				? "<"
				: operator === "<"
					? "≥"
					: ">";
	conditions[0] = `${complement} ${threshold}`;
	return conditions;
}

function renderCompactTierSummary(
	tiers: TokenTier[] | null | undefined,
	valueClassName: string | undefined,
	freeLabel: string,
	l: (value: string | null | undefined) => string,
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
	const hasAnyComparison = orderedTiers.some(hasTokenTierComparison);
	const conditions = getTokenTierConditions(orderedTiers);

	return (
		<div
			className={cn(
				"mt-0.5 inline-grid items-baseline gap-x-1.5 gap-y-1",
				hasAnyComparison
					? "grid-cols-[repeat(3,max-content)]"
					: "grid-cols-[repeat(2,max-content)]",
			)}
		>
			{orderedTiers.map((tier, index) => {
				const hasComparison = hasTokenTierComparison(tier);
				return (
					<React.Fragment key={`${tier.label}-${tier.per1M}-${index}`}>
						{hasAnyComparison ? (
							<span
								className={cn(
									"text-left text-xs tabular-nums",
									hasComparison
										? "text-muted-foreground line-through"
										: "text-transparent",
								)}
							>
								{hasComparison ? fmtUSD(tier.basePer1M!) : null}
							</span>
						) : null}
						<span
							className={cn(
								"text-left text-xs font-semibold tabular-nums text-foreground",
								valueClassName,
							)}
						>
							{tier.per1M === 0 ? freeLabel : fmtUSD(tier.per1M)}
						</span>
						<span className="whitespace-nowrap text-left text-[10px] text-muted-foreground">
							{l(conditions[index])}
						</span>
					</React.Fragment>
				);
			})}
		</div>
	);
}

function renderSecondaryTierSummary(
	label: string,
	tiers: TokenTier[] | null | undefined,
	unitLabel: string | undefined,
	valueClassName: string | undefined,
	freeLabel: string,
	l: (value: string | null | undefined) => string,
) {
	const orderedTiers = [...(tiers ?? [])].sort((a, b) => {
		if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
		return a.per1M - b.per1M;
	});
	if (!orderedTiers.length) {
		return <div className="text-xs font-semibold tabular-nums text-foreground">--</div>;
	}
	const hasAnyComparison = orderedTiers.some(hasTokenTierComparison);
	const conditions = getTokenTierConditions(orderedTiers);

	return (
		<div
			className={cn(
				"inline-grid items-baseline gap-x-1.5 gap-y-0.5",
				hasAnyComparison
					? "grid-cols-[max-content_repeat(3,max-content)]"
					: "grid-cols-[max-content_repeat(2,max-content)]",
			)}
		>
			{orderedTiers.map((tier, index) => {
				const hasComparison = hasTokenTierComparison(tier);
				return (
					<React.Fragment key={`${tier.label}-${tier.per1M}-${index}`}>
						<span className="whitespace-nowrap pr-3 text-[11px] text-muted-foreground">
							{index === 0 ? label : null}
						</span>
						{hasAnyComparison ? (
							<span
								className={cn(
									"text-left text-xs tabular-nums",
									hasComparison
										? "text-muted-foreground line-through"
										: "text-transparent",
								)}
							>
								{hasComparison ? fmtUSD(tier.basePer1M!) : null}
							</span>
						) : null}
						<span
							className={cn(
								"text-left text-xs font-semibold tabular-nums text-foreground",
								valueClassName,
							)}
						>
							{tier.per1M === 0 ? freeLabel : fmtUSD(tier.per1M)}
						</span>
						<span className="whitespace-nowrap text-left text-[10px] text-muted-foreground">
							{l(conditions[index])}
						</span>
					</React.Fragment>
				);
			})}
			<div
				className={cn(
					"justify-self-center text-[10px] text-muted-foreground",
					hasAnyComparison ? "col-span-3 col-start-2" : "col-span-2 col-start-2",
				)}
			>
				{l(unitLabel)}
			</div>
		</div>
	);
}

function getRoutingHealthSummary(
	routingStatus: ProviderRoutingStatus | null | undefined,
	labels: {
		limited: string;
		limitedDescription: (count: number) => string;
		recovering: string;
		recoveringDescription: (count: number) => string;
	},
): { label: string; description: string } | null {
	if (!routingStatus) return null;
	if (routingStatus.deranked) {
		return {
			label: labels.limited,
			description: labels.limitedDescription(routingStatus.openCount),
		};
	}
	if (routingStatus.recovering) {
		return {
			label: labels.recovering,
			description: labels.recoveringDescription(routingStatus.halfOpenCount),
		};
	}
	return null;
}

function formatTokenLimit(value: number | null | undefined, locale: string): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	return value.toLocaleString(locale, { notation: "compact", maximumFractionDigits: value >= 1_000_000 ? 1 : 0 });
}

function formatTokenLimit1dp(value: number | null | undefined, locale: string): string {
	if (value == null || !Number.isFinite(value) || value <= 0) return "--";
	return value.toLocaleString(locale, { notation: "compact", maximumFractionDigits: value >= 1_000_000 ? 0 : 1 });
}


function formatPolicyValue(
	value: string | boolean | null | undefined,
	labels: { yes: string; no: string; unknown: string },
	tx: ProviderCopyTranslator,
): string {
	if (typeof value === "boolean") return value ? labels.yes : labels.no;
	const normalized = String(value ?? "").trim();
	if (!normalized || normalized.toLowerCase() === "unknown") return labels.unknown;
	const keys: Record<string, string> = { private: "Catalogue.modelDetail.providerInfo.policyTiers.private", logs: "Catalogue.modelDetail.providerInfo.policyTiers.logs", trains: "Catalogue.modelDetail.providerInfo.policyTiers.trains", provider_managed: "Catalogue.modelDetail.providerInfo.residencyModes.providerManaged", customer_selectable: "Catalogue.modelDetail.providerInfo.residencyModes.customerSelectable", account_selected: "Catalogue.modelDetail.providerInfo.residencyModes.accountSelected" };
	return keys[normalized.toLowerCase()] ? tx(keys[normalized.toLowerCase()] as never) : normalized;
}

const DATA_POLICY_FIELDS = [
	"tier",
	"confidence",
	"zdrEligibility",
	"retentionMode",
	"retentionDays",
] as const;

function dataPoliciesMatch(
	a: NonNullable<ProviderPricing["provider_models"][number]["data_policy"]>,
	b: NonNullable<ProviderPricing["provider_models"][number]["data_policy"]>,
): boolean {
	return DATA_POLICY_FIELDS.every((field) => (a[field] ?? null) === (b[field] ?? null));
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
		case "ultrafast":
			return {
				accent: "text-fuchsia-700 dark:text-fuchsia-300",
				discountBorder: "border-fuchsia-400",
				discountText: "text-fuchsia-900 dark:text-fuchsia-100",
				discountStrong: "text-fuchsia-700 dark:text-fuchsia-300",
				discountMuted: "text-fuchsia-800/80 dark:text-fuchsia-200/80",
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

function formatMeterLabel(meter: string): string {
	return String(meter ?? "");
}

function getBillingTimestampBasisMessageKey(value: string | null | undefined):
	| "billingProviderAccept"
	| "billingCompletion"
	| "billingRequestStart" {
	switch (value) {
		case "provider_accept":
			return "billingProviderAccept";
		case "completion":
			return "billingCompletion";
		case "request_start":
			return "billingRequestStart";
		default:
			return "billingRequestStart";
	}
}

function formatRuleUnitLabel(rule: ProviderPricing["pricing_rules"][number], locale: string, tx: ProviderCopyTranslator): string {
 const rawUnit = String(rule.unit ?? "").trim().toLowerCase();
 const unit = rawUnit === "call" ? "request" : rawUnit || "unit";
 const quantity = Number(rule.unit_size ?? 1);
 const key = "Catalogue.modelDetail.pricing." + (quantity === 1 ? "unitsSingular." : "units.") + unit;
 const unitLabel = tx.has(key as never) ? tx(key as never) : unit === "unit" ? tx("Catalogue.organisations.unitGeneric" as never) : unit;
 return tx("Common.ui.providerCardCopy.perQuantityUnit" as never, ({ quantity: quantity.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 }), unit: unitLabel }) as never);
}

function formatRequestMeterTitle(meter: string | null | undefined, requests: string): string {
	return meter || requests;
}

function formatRequestMeterUnit(
	unitLabel: string | null | undefined,
	requestLabels: { singular: string; plural: string },
	locale: string,
): string {
	if (!unitLabel) return `/ ${requestLabels.singular}`;
	if (/^per request$/i.test(unitLabel)) return `/ ${requestLabels.singular}`;
	const match = unitLabel.match(/^per\s+([\d,]+)\s+requests?$/i);
	if (!match) return unitLabel.replace(/^per\s+/i, "/ ");
	return `/ ${Number(match[1].replace(/,/g, "")).toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 })} ${requestLabels.plural}`;
}

function parseUtcClockMinutes(value: string | null | undefined): number | null {
	const match = String(value ?? "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

function isUtcTimeWindowActiveNow(
	window: NonNullable<ProviderPricing["pricing_rules"][number]["time_windows"]>[number],
	now: Date,
): boolean {
	if (window.timezone !== "UTC") return false;
	const utcDay = PRICING_UTC_DAY_KEYS[now.getUTCDay()];
	if (window.days_of_week?.length && !window.days_of_week.includes(utcDay)) {
		return false;
	}
	const start = parseUtcClockMinutes(window.start_time);
	const end = parseUtcClockMinutes(window.end_time);
	if (start == null || end == null) return false;
	const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
	if (start === end) return true;
	if (start < end) return nowMinutes >= start && nowMinutes < end;
	return nowMinutes >= start || nowMinutes < end;
}

type PricingTimezoneMode = "local" | "utc";

const PRICING_TIMEZONE_MODE_KEY = "phaseo:pricing-timezone-mode:v1";
const PRICING_TIMEZONE_MODE_EVENT = "phaseo:pricing-timezone-mode-change";
const PRICING_UTC_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function getPricingTimezoneModeSnapshot(): PricingTimezoneMode {
	const mode = window.localStorage.getItem(PRICING_TIMEZONE_MODE_KEY);
	return mode === "utc" ? "utc" : "local";
}

function getServerPricingTimezoneModeSnapshot(): PricingTimezoneMode {
	return "local";
}

function subscribeToPricingTimezoneMode(onChange: () => void): () => void {
	window.addEventListener(PRICING_TIMEZONE_MODE_EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(PRICING_TIMEZONE_MODE_EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

function formatPricingWindowDays(days: string[] | undefined, locale: string, everyDay: string): string {
	if (!days?.length) return everyDay;
	const dayIndex: Record<string, number> = {
		mon: 0,
		tue: 1,
		wed: 2,
		thu: 3,
		fri: 4,
		sat: 5,
		sun: 6,
	};
	return days
		.map((day) => {
			const index = dayIndex[day];
			if (index == null) return day;
			const date = new Date(Date.UTC(2024, 0, index + 1));
			return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
		})
		.join(", ");
}

function formatPricingWindowRange(
	window: NonNullable<ProviderPricing["pricing_rules"][number]["time_windows"]>[number],
	mode: PricingTimezoneMode,
	now: Date,
	formatDateParts: ReturnType<typeof useDisplayFormatters>["dateParts"],
	formatTime: ReturnType<typeof useDisplayFormatters>["time"],
): string {
	if (mode === "utc") return `${window.start_time}–${window.end_time} UTC`;
	const start = parseUtcClockMinutes(window.start_time);
	const end = parseUtcClockMinutes(window.end_time);
	if (start == null || end == null) return `${window.start_time}–${window.end_time} UTC`;
	const allowedDays: Set<string> | null = window.days_of_week?.length ? new Set(window.days_of_week) : null;
	const day = new Date(now);
	day.setUTCHours(0, 0, 0, 0);
	for (let offset = 0; offset < 8; offset += 1) {
		const candidateDay = new Date(day.getTime() + offset * 86_400_000);
		if (allowedDays && !allowedDays.has(PRICING_UTC_DAY_KEYS[candidateDay.getUTCDay()])) continue;
		const startAt = new Date(candidateDay.getTime() + start * 60_000);
		const endAt = new Date(candidateDay.getTime() + end * 60_000 + (end <= start ? 86_400_000 : 0));
		const weekday = formatDateParts(startAt, { weekday: "short" });
		return `${weekday} ${formatTime(startAt)}–${formatTime(endAt)}`;
	}
	return `${window.start_time}–${window.end_time} UTC`;
}

function renderTablePriceSummary(
	summary: ProviderTablePriceSummary,
	accentClassName: string,
) {
	if (!summary.primary) {
		return <div className="font-medium tabular-nums text-foreground">--</div>;
	}

	const showVideoVariant = summary.primary.modality === "video";
	const variantLabels = [summary.primary.label, summary.secondary?.label]
		.filter((label): label is string => Boolean(label));
	return (
		<div className="text-right">
			<div className={cn("font-medium tabular-nums", accentClassName)}>
				{summary.secondary
					? `${summary.primary.formattedPrice}–${summary.secondary.formattedPrice}`
					: summary.primary.formattedPrice}
			</div>
			{showVideoVariant ? (
				<div className="max-w-40 truncate text-[10px] font-normal text-muted-foreground">
					{variantLabels.join(" · ")}
					{summary.extraCount > 0 ? ` · +${summary.extraCount}` : ""}
				</div>
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
		ruleComparisonMatchSignature(rule),
	].join("::");
}

function buildRuleComparisonKeyIgnoringEndpoint(
	rule: ProviderPricing["pricing_rules"][number],
): string {
	return [
		rule.meter,
		rule.unit,
		String(rule.unit_size ?? 1),
		ruleComparisonMatchSignature(rule),
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
			const semanticCandidates = [...activeBaseRules]
				.filter((candidate) => {
					if (candidate.meter !== rule.meter) return false;
					if (candidate.unit !== rule.unit) return false;
					return String(candidate.unit_size ?? 1) === String(rule.unit_size ?? 1);
				})
				.sort(sortPricingRuleCandidates);
			const targetMatchSignature = ruleComparisonMatchSignature(rule);
			const semanticMatch =
				semanticCandidates.find(
					(candidate) =>
						ruleComparisonMatchSignature(candidate) !== "[]" &&
						ruleComparisonMatchSignature(candidate) === targetMatchSignature,
				) ??
				semanticCandidates.find(
					(candidate) =>
						ruleComparisonMatchSignature(candidate) !== "[]" &&
						ruleMatchCovers(candidate, rule),
				) ??
				semanticCandidates.find(
					(candidate) => ruleComparisonMatchSignature(candidate) === "[]",
				);
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

function formatLeavingDate(
	value: string,
	formatCalendarDate: ReturnType<typeof useDisplayFormatters>["calendarDate"]
): string {
	return formatCalendarDate(value);
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

function formatDiscountTimeRemaining(
	value: string | null | undefined,
	labels: {
		endingNow: string;
		endsInDaysHours: (days: number, hours: number) => string;
		endsInHours: (hours: number) => string;
	},
): string | null {
	if (!value) return null;
	const end = new Date(value).getTime();
	if (Number.isNaN(end)) return null;
	const diff = end - Date.now();
	if (diff <= 0) return labels.endingNow;
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	if (days > 0) return labels.endsInDaysHours(days, remHours);
	return labels.endsInHours(Math.max(remHours, 1));
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

function formatDiscountBadge(
	entries: ActiveDiscountEntry[],
	labels: { discount: string; off: string; upToDiscount: (percent: number) => string },
): string | null {
	const roundedPercents = entries
		.map((entry) => entry.percentOff)
		.filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
		.map((value) => Math.max(1, Math.round(value)));

	if (!roundedPercents.length) return entries.length ? labels.discount : null;

	const min = Math.min(...roundedPercents);
	const max = Math.max(...roundedPercents);
	if (min === max) return `${max}% ${labels.off}`;
	return labels.upToDiscount(max);
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

type PrivacyReasonMessageKey =
	| "privacyAccountBlocked"
	| "privacyAccountAllowlist"
	| "privacyWorkspaceBlocked"
	| "privacyWorkspaceAllowlist"
	| "privacyZdrRequired"
	| "privacyFreeTrainingDisabled"
	| "privacyPaidTrainingDisabled";

function getPrivacyReasonMeta(reason: string): {
	messageKey: PrivacyReasonMessageKey;
	href: string;
} | null {
	const messageKeyByReason: Record<string, PrivacyReasonMessageKey> = {
		"Blocked by account provider restrictions": "privacyAccountBlocked",
		"Not in account provider allowlist": "privacyAccountAllowlist",
		"Blocked by workspace provider restrictions": "privacyWorkspaceBlocked",
		"Not in workspace provider allowlist": "privacyWorkspaceAllowlist",
		"Does not meet workspace ZDR-only requirement": "privacyZdrRequired",
		"Free training-on-inputs endpoints are disabled in workspace privacy settings": "privacyFreeTrainingDisabled",
		"Paid training-on-inputs endpoints are disabled in workspace privacy settings": "privacyPaidTrainingDisabled",
	};
	const messageKey = messageKeyByReason[reason];
	return messageKey ? { messageKey, href: "/settings/privacy" } : null;
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
	const textInputs = sections.mediaInputs?.filter((row) => row.mod === "text") ?? [];
	const imageInputs = sections.mediaInputs?.filter((row) => row.mod === "image") ?? [];
	const videoInputs = sections.mediaInputs?.filter((row) => row.mod === "video") ?? [];
	return [
		...collectDiscountEntriesFromTriple(sections.textTokens),
		...collectDiscountEntriesFromTriple(sections.audioTokens),
		...collectDiscountEntriesFromTriple(sections.imageTokens),
		...collectDiscountEntriesFromTriple(sections.videoTokens),
		...collectDiscountEntriesFromTriple(sections.embeddingTokens),
		...collectDiscountEntriesFromTriple(sections.decisionTokens),
		...collectDiscountEntriesFromUsage(textInputs),
		...collectDiscountEntriesFromUsage(imageInputs),
		...collectDiscountEntriesFromUsage(videoInputs),
		...collectDiscountEntriesFromImage(sections.imageGen),
		...collectDiscountEntriesFromVideo(sections.videoGen),
		...collectDiscountEntriesFromTiers(sections.requests),
		...collectDiscountEntriesFromOtherRules(sections.otherRules),
	];
}

export function getProviderTableDiscountBadge(
	sections: ReturnType<typeof buildProviderSections>,
	labels: Parameters<typeof formatDiscountBadge>[1],
): string | null {
	const entries = collectDiscountEntriesFromSections(sections);
	return entries.length ? formatDiscountBadge(entries, labels) : null;
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

export const PROVIDER_STATUS_META: Record<
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
	external: {
		label: "External",
		icon: ArrowUpRight,
		iconClass: "text-violet-600",
		description: "Listed from an external catalogue; routing requires an explicit provider-level override.",
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

function ProviderLifecycleDetails({
	providerModels,
}: {
	providerModels: ProviderLifecycleStatusInput[];
}) {
	const tProvider = useTranslations("Catalogue.modelDetail.providerTable");
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	const lifecycle = summarizeProviderLifecycle(providerModels);
	const providerAvailability = lifecycle.providerAvailability
		? {
				label: tSections(
					`providerLifecycle.availability.${lifecycle.providerAvailability.key}.label` as never,
				),
				description: tSections(
					`providerLifecycle.availability.${lifecycle.providerAvailability.key}.description` as never,
				),
			}
		: null;
	const phaseoIntegration = lifecycle.phaseo
		? {
				label: tSections(
					`providerLifecycle.phaseo.${lifecycle.phaseo.key}.label` as never,
				),
				description: tSections(
					`providerLifecycle.phaseo.${lifecycle.phaseo.key}.description` as never,
				),
			}
		: null;
	return (
		<div className="mt-2 space-y-1 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
			{providerAvailability ? (
				<div className="grid grid-cols-[auto_1fr] gap-x-3">
					<span className="text-muted-foreground">{tProvider("provider")}</span>
					<span className="text-right font-medium" title={providerAvailability.description}>
						{providerAvailability.label}
					</span>
				</div>
			) : null}
			{phaseoIntegration ? (
				<div className="grid grid-cols-[auto_1fr] gap-x-3">
					<span className="text-muted-foreground">Phaseo</span>
					<span className="text-right font-medium" title={phaseoIntegration.description}>
						{phaseoIntegration.label}
					</span>
				</div>
			) : null}
			<div className="grid grid-cols-[auto_1fr] gap-x-3">
				<span className="text-muted-foreground">{tSections("access")}</span>
				<span className="text-right font-medium">
					{lifecycle.accessScope === "internal" ? tSections("internalOnly") : tSections("public")}
				</span>
			</div>
		</div>
	);
}

export default function ProviderCard({
	provider,
	defaultPlan,
	availablePlans,
	comparisonProviders,
	navigationProviders,
	privacyIgnoredReasons,
	workspacePolicyBlockedReasons,
	runtimeStats,
	runtimeStatsByServiceTier,
	routingStatus,
	pricingTimeMs,
	displayNameOverride,
	variantLabels,
	priceColumns,
	isLastVisible = false,
	serviceTiersExpanded = false,
	showServiceTierDisclosureGutter = false,
	onToggleServiceTiers,
	isSummaryActive,
}: {
	provider: ProviderPricing;
	defaultPlan: string;
	availablePlans: string[];
	comparisonProviders: ProviderPricing[];
	navigationProviders: ProviderPricing[];
	privacyIgnoredReasons?: string[] | null;
	workspacePolicyBlockedReasons?: WorkspacePolicyBlockedReason[] | null;
	runtimeStats: ProviderRuntimeStats | null;
	runtimeStatsByServiceTier?: Record<string, ProviderRuntimeStats | null>;
	routingStatus: ProviderRoutingStatus | null;
	pricingTimeMs: number;
	displayNameOverride?: string | null;
	variantLabels?: string[] | null;
	priceColumns: ProviderTablePriceColumn[];
	isLastVisible?: boolean;
	serviceTiersExpanded?: boolean;
	showServiceTierDisclosureGutter?: boolean;
	onToggleServiceTiers?: () => void;
	isSummaryActive?: boolean;
}) {
	const tx = useTranslations();
	const tPolicy = useTranslations("Common.ui.localisationGaps");
	const tProvider = useTranslations("Catalogue.modelDetail.providerTable");
	const tQuickstart = useTranslations("Catalogue.models.detail.quickstart");
	const tModelActions = useTranslations("Catalogue.models.detail.actions");
	const tSections = useTranslations("Catalogue.modelDetail.sections");
	const tPerformance = useTranslations("Catalogue.modelDetail.performance");
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const locale = useLocale();
	const localizePricingLabel = (value: string | null | undefined) => localizedPricingDisplayLabel(value, locale, tx);
	const localizePricingMeter = (meter: string | null | undefined, fallback: string) => {
		const key = `meters.${String(meter ?? "").trim()}`;
		return tPricing.has(key as never) ? tPricing(key as never) : fallback;
	};
	const format = useDisplayFormatters();
	const [selectedPlan, setSelectedPlan] = useState(defaultPlan);
	const [expanded, setExpanded] = useState(false);
	const reduceMotion = useReducedMotion();
	const [disableInspectorAnimation, setDisableInspectorAnimation] = useState(false);
	const [inspectorNavigationProviderIds, setInspectorNavigationProviderIds] = useState<string[] | null>(null);
	const [copiedInspectorValue, setCopiedInspectorValue] = useState<string | null>(null);
	const [activePerformanceMetric, setActivePerformanceMetric] =
		useState<ProviderPerformanceMetricKey>("uptime");
	const [hoveredPerformancePoint, setHoveredPerformancePoint] =
		useState<ProviderPerformancePoint | null>(null);
	const handlePerformancePointHover = (point: ProviderPerformancePoint) => {
		setHoveredPerformancePoint(point);
	};
	const handlePerformancePointLeave = () => {
		setHoveredPerformancePoint(null);
	};
	const handlePerformanceMetricChange = (metric: ProviderPerformanceMetricKey) => {
		setActivePerformanceMetric(metric);
		handlePerformancePointLeave();
	};
	const pricingTimezoneMode = useSyncExternalStore(
		subscribeToPricingTimezoneMode,
		getPricingTimezoneModeSnapshot,
		getServerPricingTimezoneModeSnapshot,
	);
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

	const updatePricingTimezoneMode = (mode: PricingTimezoneMode) => {
		window.localStorage.setItem(PRICING_TIMEZONE_MODE_KEY, mode);
		window.dispatchEvent(new CustomEvent(PRICING_TIMEZONE_MODE_EVENT, { detail: mode }));
	};

	useEffect(() => {
		const handleOpen = (event: Event) => {
			const detail = (event as CustomEvent<ProviderInspectorChangeDetail>).detail;
			const providerId = detail?.providerId;
			if (!providerId) {
				setExpanded(false);
				return;
			}
			setInspectorNavigationProviderIds(
				detail.navigationProviderIds?.length ? detail.navigationProviderIds : null,
			);
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
				setHoveredPerformancePoint(null);
				setSelectedPlan(
					detail.serviceTier && availablePlans.includes(detail.serviceTier)
						? detail.serviceTier
						: defaultPlan,
				);
				window[PROVIDER_INSPECTOR_STATE_KEY] = providerId;
				window[PROVIDER_INSPECTOR_LAST_OPEN_ID_KEY] = providerId;
				window[PROVIDER_INSPECTOR_LAST_OPEN_AT_KEY] = Date.now();
			}
			setExpanded(isTargetProvider);
		};

		window.addEventListener(PROVIDER_INSPECTOR_CHANGE_EVENT, handleOpen);
		return () => {
			window.removeEventListener(PROVIDER_INSPECTOR_CHANGE_EVENT, handleOpen);
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
	const isCustomerManagedPricing = provider.provider_models.some((model) => model.id.startsWith("private-model:"));
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
	const planComparisonBase = getProviderPlanComparisonBase(
		availablePlans,
		defaultPlan,
	);
	const planMultiplierLabels = useMemo(() => {
		const nowMs = pricingTimeMs;
		const labels: Record<string, string | null> = {};
		for (const plan of availablePlans) {
			if (plan === planComparisonBase) {
				labels[plan] = null;
				continue;
			}
			labels[plan] = formatPlanMultiplierLabel(
				derivePlanMultiplier({
					provider,
					basePlan: planComparisonBase,
					targetPlan: plan,
					nowMs,
				}),
			);
		}
		return labels;
	}, [availablePlans, planComparisonBase, pricingTimeMs, provider]);
	const pricingComparisonAccent =
		selectedPlan === "batch" ||
		selectedPlan === "flex" ||
		selectedPlan === "free" ||
		selectedPlan === "priority" ||
		selectedPlan === "ultrafast"
			? selectedPlan
			: null;

	const now = new Date(pricingTimeMs);

	const planRules = getProviderPricingRulesForPlan(provider, selectedPlan);
	const hasPlanPricing = planRules.length > 0;
	const providerModelsInScope = getProviderModelScopeForPlan(
		provider,
		selectedPlan,
	);
	const lifecycleStatus = summarizeProviderLifecycle(providerModelsInScope);
	const providerAvailability = lifecycleStatus.providerAvailability
		? {
				label: tSections(
					`providerLifecycle.availability.${lifecycleStatus.providerAvailability.key}.label` as never,
				),
				description: tSections(
					`providerLifecycle.availability.${lifecycleStatus.providerAvailability.key}.description` as never,
				),
			}
		: null;
	const phaseoIntegration = lifecycleStatus.phaseo
		? {
				label: tSections(
					`providerLifecycle.phaseo.${lifecycleStatus.phaseo.key}.label` as never,
				),
				description: tSections(
					`providerLifecycle.phaseo.${lifecycleStatus.phaseo.key}.description` as never,
				),
			}
		: null;
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
		})
	);
	const statusKey = chooseGatewayStatus(resolvedGatewayStatuses);
	const statusMeta = PROVIDER_STATUS_META[statusKey] ?? PROVIDER_STATUS_META.not_listed;
	const statusIcon = statusMeta.icon;
	const statusClass = cn("h-3.5 w-3.5", statusMeta.iconClass);
	const statusTranslationKeys: Record<CanonicalGatewayStatus, { label: string; description: string }> = {
		active: { label: "statuses.active", description: "statusDescriptions.active" },
		coming_soon: { label: "statuses.comingSoon", description: "statusDescriptions.comingSoon" },
		external: { label: "statuses.external", description: "statusDescriptions.external" },
		internal_testing: { label: "statuses.internalTesting", description: "statusDescriptions.internalTesting" },
		deranked_lvl1: { label: "statuses.rateLimited", description: "statusDescriptions.rateLimited" },
		deranked_lvl2: { label: "statuses.rateLimited", description: "statusDescriptions.rateLimited" },
		deranked_lvl3: { label: "statuses.rateLimited", description: "statusDescriptions.rateLimited" },
		inactive: { label: "statuses.inactive", description: "statusDescriptions.inactive" },
		disabled: { label: "statuses.disabled", description: "statusDescriptions.disabled" },
		not_listed: { label: "statuses.inactive", description: "statusDescriptions.inactive" },
	};
	const statusLabel = tProvider(statusTranslationKeys[statusKey].label as never);
	const routingHealthSummary = getRoutingHealthSummary(routingStatus, {
		limited: tSections("routingHealthLimited"),
		limitedDescription: (count) => tSections("routingHealthLimitedDescription", { count }),
		recovering: tSections("routingHealthRecovering"),
		recoveringDescription: (count) => tSections("routingHealthRecoveringDescription", { count }),
	});
	const statusDescription = tProvider(statusTranslationKeys[statusKey].description as never);
	const statusDetail = statusKey === "active" && leavingSoonProviderModel?.effective_to
		? `${statusDescription} ${tProvider("availabilityEndsOn", { date: formatLeavingDate(leavingSoonProviderModel.effective_to, format.calendarDate) })}`
		: statusDescription;
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
		})
	);
	const tableStatusKey = chooseGatewayStatus(tableResolvedGatewayStatuses);
	const tableStatusMeta =
		PROVIDER_STATUS_META[tableStatusKey] ?? PROVIDER_STATUS_META.not_listed;
	const tableStatusIcon = tableStatusMeta.icon;
	const tableStatusClass = cn("h-3.5 w-3.5", tableStatusMeta.iconClass);
	const tableStatusLabel = tProvider(statusTranslationKeys[tableStatusKey].label as never);
	const tableStatusDescription = tProvider(statusTranslationKeys[tableStatusKey].description as never);
	const tableStatusDetail = tableStatusKey === "active" && tableLeavingSoonProviderModel?.effective_to
		? `${tableStatusDescription} ${tProvider("availabilityEndsOn", { date: formatLeavingDate(tableLeavingSoonProviderModel.effective_to, format.calendarDate) })}`
		: tableStatusDescription;
	const privacyReasonMeta = (privacyIgnoredReasons ?? []).map((reason) => {
		const reasonMeta = getPrivacyReasonMeta(reason);
		return {
			reason,
			meta: reasonMeta
				? {
						label: tSections(reasonMeta.messageKey),
						href: reasonMeta.href,
						linkLabel: tSections("reviewPrivacySettings"),
					}
				: null,
		};
	});
	const isWorkspacePrivacyBlocked = (privacyIgnoredReasons ?? []).some((reason) =>
		reason.includes("workspace") || reason.includes("ZDR-only"),
	) || Boolean(workspacePolicyBlockedReasons?.length);

	const isFreePlan = selectedPlan === "free";
	const textInputs = sec.mediaInputs?.filter((r) => r.mod === "text") ?? [];
	const audioInputs = sec.mediaInputs?.filter((r) => r.mod === "audio") ?? [];
	const imageInputs = sec.mediaInputs?.filter((r) => r.mod === "image") ?? [];
	const videoInputs = sec.mediaInputs?.filter((r) => r.mod === "video") ?? [];
	const upcomingFor = (
		sectionKey:
			| "textTokens"
			| "requests"
			| "textInputs"
			| "audioInputs"
			| "imageInputs"
			| "videoInputs"
			| "imageTokens"
			| "imageGen"
			| "audioTokens"
			| "videoTokens"
			| "embeddingTokens"
			| "decisionTokens"
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
						key: "totalContext",
						label: tSections("totalContext"),
						value: formatTokenLimit1dp(maxContextTokens, locale),
				}
				: null,
			maxOutputTokens !== null
				? {
						key: "maxOutput",
						label: tSections("maxOutput"),
						value: formatTokenLimit(maxOutputTokens, locale),
				}
				: null,
		].filter(
			(
				metric
			): metric is {
				key: string;
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
		modalityLabel: string,
		modalityKey: "text" | "audio" | "image" | "video" | "decisions",
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
				title: `${modalityLabel} ${tSections("input")}`,
				tiers: triple.in,
			},
			{
				key: `${modalityKey}-output`,
				title: `${modalityLabel} ${tSections("output")}`,
				tiers: triple.out,
			},
			{
				key: `${modalityKey}-cache-read`,
				title: `${modalityLabel} ${tSections("cacheReads")}`,
				tiers: triple.cached,
			},
			{
				key: `${modalityKey}-cache-write`,
				title: `${modalityLabel} ${tSections("cacheWrites")}`,
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
				unitLabel: tPricing("perMillionTokens"),
			}));
	};
	const createEmbeddingTiles = (triple: TokenTriple | undefined): TokenMetricTile[] => {
		if (!triple) return [];
		const directions = [
			{ key: "input", suffix: ` ${tSections("input")}`, tiers: triple.in },
			{ key: "output", suffix: ` ${tSections("output")}`, tiers: triple.out },
			{ key: "cache-read", suffix: ` ${tSections("cacheReads")}`, tiers: triple.cached },
			{ key: "cache-write", suffix: ` ${tSections("cacheWrites")}`, tiers: triple.write },
		] as const;

		return directions.flatMap((direction) =>
			direction.tiers.map((tier, index) => {
				const source = tier.label && tier.label !== "All usage" ? localizePricingLabel(tier.label) : tSections("embedding");
				return {
					key: `embeddings-${direction.key}-${source}-${index}`,
					title: `${source}${direction.suffix}`,
					groupTitle: tSections("embeddings"),
					tiers: [{ ...tier, label: "All usage" }],
					unitLabel: tPricing("perMillionTokens"),
				};
			}),
		);
	};
	const tokenMetricTiles = [
		...createTokenTiles(tSections("text"), "text", sec.textTokens),
		...createTokenTiles(tModelActions("decisions"), "decisions", sec.decisionTokens),
		...createEmbeddingTiles(sec.embeddingTokens),
		...createTokenTiles(tSections("audio"), "audio", sec.audioTokens),
		...createTokenTiles(tSections("image"), "image", sec.imageTokens),
		...createTokenTiles(tSections("video"), "video", sec.videoTokens),
	];
	const allTokenMetricGroups = Array.from(
		tokenMetricTiles.reduce((groups, tile) => {
			const label = tile.groupTitle ?? tx("Common.ui.metrics.tokens" as never);
			const entries = groups.get(label) ?? [];
			entries.push(tile);
			groups.set(label, entries);
			return groups;
		}, new Map<string, TokenMetricTile[]>()),
	).map(([label, tiles]) => ({
		label,
		tiles,
	}));
	const tokenMetricGroups = allTokenMetricGroups.map(({ label, tiles }) => ({
		label,
		tiles: tiles.slice(0, 3),
		columns: Math.min(3, tiles.length),
	}));
	const additionalTokenMetricTiles = allTokenMetricGroups.flatMap(({ label, tiles }) =>
		tiles.slice(3).map((tile) => ({ ...tile, groupTitle: label })),
	);
	const infoScope = providerModelsInScope;
	const tableInfoScope = tableProviderModelsInScope;
	const providerModelSlugs = infoScope.map((pm) => pm.provider_model_slug);
	const providerApiModelIds = infoScope.map((pm) => pm.model_id);
	const canonicalModelId = providerApiModelIds.find(
		(modelId) => typeof modelId === "string" && modelId.trim().length > 0,
	)?.trim();
	const providerQualifiedModelId = canonicalModelId
		? `${sec.providerId}:${canonicalModelId}`
		: null;
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
			: [tx("Catalogue.modelDetail.sections.anyResolution" as never)];
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
		!sec.decisionTokens &&
		!sec.imageGen &&
		!sec.videoGen &&
		!textInputs.length &&
		!audioInputs.length &&
		!imageInputs.length &&
		!videoInputs.length &&
		!sec.requests?.length &&
		!sec.upcomingChanges?.length &&
		!sec.otherRules.length;

	if (allEmpty && !isFreePlan && hasPlanPricing) return null;

	const selectedRuntimeStats = selectedPlan === "batch"
		? null
		: runtimeStatsByServiceTier?.[selectedPlan] ??
			(selectedPlan === tablePlan ? runtimeStats : null);
	const uptimePct = getDisplayedUptimePct(selectedRuntimeStats);
	const uptimeTrendPoints = getUptimeTrendPoints(selectedRuntimeStats);
	const displayedPerformanceValue = (
		metric: ProviderPerformanceMetricKey,
		fallback: number | null | undefined,
	) =>
		hoveredPerformancePoint
			? getPerformanceMetricValue(metric, hoveredPerformancePoint)
			: fallback ?? null;
	const tableUptimePct = getDisplayedUptimePct(runtimeStats);
	const tableUptimeTrendPoints = getUptimeTrendPoints(runtimeStats);
	const tableThroughputValue = formatThroughputValue(runtimeStats?.throughput30m, locale);
	const activeDiscountEntries = collectDiscountEntriesFromSections(sec);
	// A promotion can have an open-ended published duration. Show its discount
	// without fabricating a deadline; the countdown remains conditional below.
	const activePromotionEntries = activeDiscountEntries;
	const discountCount = activePromotionEntries.length;
	const tableDiscountCount = activeDiscountEntries.length;
	const discountLabels = {
		discount: tSections("discount"),
		off: tSections("off"),
		upToDiscount: (percent: number) => tSections("upToDiscount", { percent }),
	};
	const discountCountdownLabels = {
		endingNow: tSections("endingNow"),
		endsInDaysHours: (days: number, hours: number) =>
			tSections("discountEndsInDaysHours", { days, hours }),
		endsInHours: (hours: number) => tSections("discountEndsInHours", { hours }),
	};
	const soonestDiscountEnd = activePromotionEntries
		.map((entry) => entry.endsAt)
		.filter((value): value is string => Boolean(value))
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
	const discountBadge = discountCount ? formatDiscountBadge(activePromotionEntries, discountLabels) : null;
	const tableDiscountBadge = getProviderTableDiscountBadge(tableSec, discountLabels);
	const discountTimeRemaining =
		discountCount && soonestDiscountEnd
			? formatDiscountTimeRemaining(soonestDiscountEnd, discountCountdownLabels)
			: null;
	const selectedPlanTranslationKey = getPricingPlanTranslationKey(selectedPlan);
	const selectedPlanLabel = selectedPlanTranslationKey
		? tQuickstart(selectedPlanTranslationKey as never)
		: selectedPlan ? selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1) : selectedPlan;
	const selectedPlanTheme = getPlanTheme(selectedPlan);
	const tablePlanTheme = getPlanTheme(tablePlan);
	const selectedPlanPriceClass = selectedPlan === "free" ? "text-foreground" : selectedPlanTheme.accent;
	const tablePlanPriceClass = tablePlan === "free" ? "text-foreground" : tablePlanTheme.accent;
	const performanceMetrics: Array<{
		key: ProviderPerformanceMetricKey;
		label: string;
		value: number | null;
		valueClassName: string;
	}> = [
		{
			key: "latency",
			label: tProvider("latency"),
			value: displayedPerformanceValue("latency", selectedRuntimeStats?.latencyMs30m),
			valueClassName:
				hasSelectedAlternativeServiceTier(selectedPlan, planComparisonBase)
					? selectedPlanTheme.accent
					: "text-foreground",
		},
		{
			key: "throughput",
			label: tProvider("throughput"),
			value: displayedPerformanceValue("throughput", selectedRuntimeStats?.throughput30m),
			valueClassName: selectedPlanTheme.accent,
		},
		{
			key: "uptime",
			label: tProvider("uptime"),
			value: displayedPerformanceValue("uptime", uptimePct),
			valueClassName: selectedPlanTheme.accent,
		},
	] as const;
	const tablePerformanceMetrics = [
		{
			value:
				tablePlan === "batch" || runtimeStats?.latencyMs30m == null
					? "--"
					: formatLatencySeconds(runtimeStats.latencyMs30m, locale),
			valueClassName: tablePlanTheme.accent,
		},
		{
			value:
				tablePlan === "batch" || !tableThroughputValue
					? "--"
					: `${tableThroughputValue} tps`,
			valueClassName: tablePlanTheme.accent,
		},
		{
			value: formatPercent(tableUptimePct, locale),
			valueClassName: tablePlanTheme.accent,
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
	const logoProviderId = sec.logoProviderId;
	const tablePriceSummaries = Object.fromEntries(
		priceColumns.map((column) => [
			column.key,
			buildProviderTablePriceSummaryForColumn(tableSec, column),
		]),
	) as Record<string, ProviderTablePriceSummary>;
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
	const defaultProviderNavigationItems = Array.from(
		new Map(
			navigationProviders.map((candidate) => [
				candidate.provider.api_provider_id,
				{
					id: candidate.provider.api_provider_id,
					name: resolveProviderDisplayName({ providerId: candidate.provider.api_provider_id, providerName: candidate.provider.api_provider_name || candidate.provider.api_provider_id, offerLabel: candidate.provider.offer_label, offerScope: candidate.provider.offer_scope }),
				},
			]),
		).values(),
	);
	const navigationProviderById = new Map(
		[...comparisonProviders, ...navigationProviders].map((candidate) => [
			candidate.provider.api_provider_id,
			{
				id: candidate.provider.api_provider_id,
				name: resolveProviderDisplayName({ providerId: candidate.provider.api_provider_id, providerName: candidate.provider.api_provider_name || candidate.provider.api_provider_id, offerLabel: candidate.provider.offer_label, offerScope: candidate.provider.offer_scope }),
			},
		]),
	);
	const providerNavigationItems = inspectorNavigationProviderIds
		? inspectorNavigationProviderIds.flatMap((providerId) => {
			const item = navigationProviderById.get(providerId);
			return item ? [item] : [];
		})
		: defaultProviderNavigationItems;
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
		options: {
			disableAnimation?: boolean;
			navigationProviderIds?: string[];
			serviceTier?: string;
		} = {},
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
		dispatchProviderInspectorOpen(
			providerId,
			disableAnimation,
			options.navigationProviderIds ?? inspectorNavigationProviderIds ?? navigationProviders.map(
				(candidate) => candidate.provider.api_provider_id,
			),
			options.serviceTier,
		);
	};
	const selectServiceTier = (serviceTier: string) => {
		setHoveredPerformancePoint(null);
		setSelectedPlan(serviceTier);
		openInspectorForProvider(inspectorProviderId, { serviceTier });
	};
	const toggleExpanded = () => {
		if (expanded && selectedPlan === tablePlan) {
			window[PROVIDER_INSPECTOR_STATE_KEY] = null;
			clearProviderInspector(inspectorProviderId);
			setExpanded(false);
			return;
		}
		openInspectorForProvider(inspectorProviderId, {
			serviceTier: tablePlan,
			navigationProviderIds: navigationProviders.map(
				(candidate) => candidate.provider.api_provider_id,
			),
		});
	};
	const summaryActive = isSummaryActive ?? expanded;
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
			clearProviderInspector(inspectorProviderId);
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
		dataPolicy: (() => {
			const tierPolicy = provider.provider.service_tier_data_policies?.[selectedPlan] ?? null;
			const capabilityPolicies = infoScope
				.map((providerModel) => providerModel.data_policy)
				.filter((policy): policy is NonNullable<typeof policy> => Boolean(policy));
			const policies = tierPolicy ? [tierPolicy] : capabilityPolicies;
			if (!policies.length) return [{
				tier: provider.provider.data_policy_tier ?? null,
				confidence: provider.provider.data_policy_confidence ?? null,
				contractMode: provider.provider.data_policy_contract_mode ?? null,
				contractNotes: provider.provider.data_policy_contract_notes ?? null,
				notes: provider.provider.prompt_training_notes ?? null,
				sourceUrl: provider.provider.prompt_training_source_url ?? null,
				promptTrainingPolicy: provider.provider.prompt_training_policy ?? null,
				zeroDataRetention: provider.provider.zero_data_retention ?? null,
			}];
			return policies.map((policy) => ({
				tier: policy.tier ?? null,
				confidence: policy.confidence ?? null,
				contractMode: provider.provider.data_policy_contract_mode ?? null,
				contractNotes: provider.provider.data_policy_contract_notes ?? null,
				notes: policy.reason ?? provider.provider.prompt_training_notes ?? null,
				sourceUrl: policy.evidenceUrl ?? provider.provider.prompt_training_source_url ?? null,
				promptTrainingPolicy: provider.provider.prompt_training_policy ?? null,
				zeroDataRetention: policy.zdrEligibility === "eligible" && provider.provider.zero_data_retention === true
					? true
					: policy.zdrEligibility === "ineligible"
						? false
						: provider.provider.zero_data_retention ?? null,
			}));
		})(),
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
		capacityMetrics.find((metric) => metric.key === "totalContext")?.value ?? "--";
	const maxOutputValue =
		capacityMetrics.find((metric) => metric.key === "maxOutput")?.value ?? "--";
	const parameterSupport = buildParameterSupportSummary(infoScope);
	const supportedParameters = parameterSupport.parameters;
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
	const pricingPrimaryContent = isCustomerManagedPricing ? (
		<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/30">
			<div className="font-semibold text-foreground">{tx("Common.ui.providerCardCopy.customerManaged" as never)}</div>
			<p className="mt-1 text-xs leading-5 text-muted-foreground">{tx("Common.ui.providerCardCopy.upstreamInferenceCostsAreBilledDirectlyByYourDeploymentProvider" as never)}</p>
		</div>
	) : !hasPlanPricing ? (
		isInternalTestingProvider ? (
			<div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
				<div className="inline-flex items-center gap-1.5 font-semibold">
					<FlaskConical className="h-3.5 w-3.5" />
										{tProvider("statuses.internalTesting")}
				</div>
				<p className="mt-1 text-[11px] leading-snug text-sky-800/90 dark:text-sky-200/90">
								{tProvider("statusDescriptions.internalTesting")}
				</p>
			</div>
		) : isComingSoonProvider ? (
			<div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100">
				<div className="inline-flex items-center gap-1.5 font-semibold">
					<Clock3 className="h-3.5 w-3.5" />
										{tProvider("statuses.comingSoon")}
				</div>
				<p className="mt-1 text-[11px] leading-snug text-blue-800/90 dark:text-blue-200/90">
								{tProvider("comingSoonTierPricingDescription")}
				</p>
			</div>
		) : (
			<div className="rounded-xl border border-dashed border-zinc-200/80 bg-zinc-50/60 px-3 py-2.5 text-xs text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/30">
				{tProvider("noPricingForSelectedTier")}
			</div>
		)
	) : isFreePlan ? (
		<div className="py-3">
			<div>
				<div className="text-[11px] text-muted-foreground">{tSections("inputAndOutput")}</div>
				<div
					className={cn(
						"mt-0.5 text-lg font-semibold tabular-nums",
						selectedPlanPriceClass,
					)}
				>
					{fmtUSD(0)}
				</div>
				<div className="mt-0.5 text-[10px] text-muted-foreground">
					{tPricing("perMillionTokens")}
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
										{renderCompactTierSummary(tile.tiers, selectedPlanPriceClass, tx("Common.ui.chatSettings.free" as never), localizePricingLabel)}
										<div className="mt-0.5 text-[10px] text-muted-foreground">
											{localizePricingLabel(tile.unitLabel)}
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
	const pricingMediaInputContent =
		!isFreePlan &&
		(textInputs.length > 0 ||
			audioInputs.length > 0 ||
			imageInputs.length > 0 ||
			videoInputs.length > 0 ||
			upcomingFor("textInputs").length > 0 ||
			upcomingFor("audioInputs").length > 0 ||
			upcomingFor("imageInputs").length > 0 ||
			upcomingFor("videoInputs").length > 0) ? (
			<div className="space-y-2.5 pt-1">
				{textInputs.length > 0 ? (
					<InputsSection title={tSections("text")} rows={textInputs} comparisonAccent={pricingComparisonAccent} />
				) : null}
				{audioInputs.length > 0 ? (
					<InputsSection title={tSections("audio")} rows={audioInputs} comparisonAccent={pricingComparisonAccent} />
				) : null}
				{imageInputs.length > 0 ? (
					<InputsSection title={tSections("imageInputs")} rows={imageInputs} comparisonAccent={pricingComparisonAccent} />
				) : null}
				{videoInputs.length > 0 ? (
					<InputsSection title={tSections("videoInputs")} rows={videoInputs} comparisonAccent={pricingComparisonAccent} />
				) : null}
				{upcomingFor("textInputs").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("textInputs")} title={tSections("upcoming")} compact />
				) : null}
				{upcomingFor("audioInputs").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("audioInputs")} title={tSections("upcoming")} compact />
				) : null}
				{upcomingFor("imageInputs").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("imageInputs")} title={tSections("upcoming")} compact />
				) : null}
				{upcomingFor("videoInputs").length > 0 ? (
					<UpcomingPricingSection rows={upcomingFor("videoInputs")} title={tSections("upcoming")} compact />
				) : null}
			</div>
		) : null;
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
					<UpcomingPricingSection rows={upcomingFor("imageGen")} title={tSections("upcoming")} compact />
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
					<UpcomingPricingSection rows={upcomingFor("videoGen")} title={tSections("upcoming")} compact />
				) : null}
			</div>
		) : null;
	const pricingAdditionalContent =
		!isFreePlan &&
		(additionalTokenMetricTiles.length > 0 ||
			upcomingFor("decisionTokens").length > 0 ||
			(sec.requests?.length ?? 0) > 0 ||
			upcomingFor("requests").length > 0 ||
			sec.otherRules.length > 0 ||
			upcomingFor("other").length > 0) ? (
			<div className="space-y-2 pt-1">
				{additionalTokenMetricTiles.length > 0 ? (
					<div className="space-y-2">
						{additionalTokenMetricTiles.map((tile) => (
							<React.Fragment key={tile.key}>
								{renderSecondaryTierSummary(
									tokenMetricGroups.length > 1
										? `${tile.groupTitle} ${tile.title}`
										: tile.title,
									tile.tiers,
									tile.unitLabel,
									selectedPlanPriceClass,
									tx("Common.ui.chatSettings.free" as never),
									localizePricingLabel,
								)}
							</React.Fragment>
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
															{localizePricingMeter(tier.meter, formatRequestMeterTitle(tier.meter, tx("Common.ui.metrics.requests" as never)))}
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
													selectedPlanPriceClass,
												)}
											>
												{fmtUSD(tier.price)}
											</span>
											<span className="text-[10px] text-muted-foreground">
												{formatRequestMeterUnit(tier.unitLabel, {
													singular: tPricing("unitsSingular.request"),
													plural: tPricing("units.request"),
												}, locale)}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					) : null}
				<div className="space-y-2.5">
					{upcomingFor("decisionTokens").length > 0 ? (
						<UpcomingPricingSection
							rows={upcomingFor("decisionTokens")}
							title={tSections("upcoming")}
							compact
						/>
					) : null}
					{upcomingFor("requests").length > 0 ? (
						<UpcomingPricingSection rows={upcomingFor("requests")} title={tSections("upcoming")} compact />
					) : null}
					{sec.otherRules.length > 0 ? (
						<MeterRateRows rows={sec.otherRules} />
					) : null}
					{upcomingFor("other").length > 0 ? (
						<UpcomingPricingSection
							rows={upcomingFor("other")}
							title={tSections("otherUpcomingPricing")}
							compact
						/>
					) : null}
				</div>
			</div>
		) : null;

	const timeWindowPricingRules = planRules
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
	const representativePricingWindows = timeWindowPricingRules[0]?.windows ?? [];
	const peakPricingActiveNow = representativePricingWindows.some((window) =>
		isUtcTimeWindowActiveNow(window, now),
	);
	const weekdayOnlyPricing = representativePricingWindows[0]?.days_of_week?.join(",") === "mon,tue,wed,thu,fri";
	const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || tx("Common.ui.providerCardCopy.localTime" as never);
	const sheetSectionPrefix = `provider-${sec.providerId.replace(/[^a-z0-9_-]/gi, "-")}-${selectedPlan}`;
	const pricingSectionId = `${sheetSectionPrefix}-pricing`;
	const performanceSectionId = `${sheetSectionPrefix}-performance`;
	const availabilitySectionId = `${sheetSectionPrefix}-availability`;
	const dataPolicySectionId = `${sheetSectionPrefix}-data-policy`;
	const parametersSectionId = `${sheetSectionPrefix}-parameters`;
	const selectedTierPolicy = provider.provider.service_tier_data_policies?.[selectedPlan] ?? null;
	const scopedCapabilityPolicies = providerModelsInScope.map((providerModel) => providerModel.data_policy ?? null);
	const selectedCapabilityPolicies = scopedCapabilityPolicies.filter(
		(policy): policy is NonNullable<typeof policy> => Boolean(policy),
	);
	const firstCapabilityPolicy = selectedCapabilityPolicies[0] ?? null;
	const hasMixedCapabilityPolicies =
		!selectedTierPolicy &&
		selectedCapabilityPolicies.length > 0 &&
		(selectedCapabilityPolicies.length !== scopedCapabilityPolicies.length ||
			(firstCapabilityPolicy
				? !selectedCapabilityPolicies.every((policy) =>
						dataPoliciesMatch(policy, firstCapabilityPolicy),
					)
				: false));
	const selectedDataPolicy =
		selectedTierPolicy ??
		(hasMixedCapabilityPolicies ? null : firstCapabilityPolicy);
	const selectedDataPolicyTier = hasMixedCapabilityPolicies
		? null
		: selectedDataPolicy?.tier ?? provider.provider.data_policy_tier;
	const policyValueLabels = {
		yes: tSections("yes"),
		no: tSections("no"),
		unknown: tSections("unknown"),
	};
	const selectedZdr = hasMixedCapabilityPolicies
		? null
		: selectedDataPolicy?.zdrEligibility === "eligible" && provider.provider.zero_data_retention === true
			? true
			: selectedDataPolicy?.zdrEligibility === "ineligible"
				? false
				: provider.provider.zero_data_retention;
	const dataPolicySummary = [
		{
			label: tProvider("dataPolicy"),
			value: formatPolicyValue(selectedDataPolicyTier, policyValueLabels, tx),
		},
		{
			label: "ZDR",
			value: formatPolicyValue(selectedZdr, policyValueLabels, tx),
		},
		{
			label: tSections("processing"),
			value: provider.provider.default_execution_regions?.join(", ") || formatPolicyValue(provider.provider.residency_mode, policyValueLabels, tx),
		},
		{
			label: tSections("dataCenters"),
			value: provider.provider.default_data_regions?.join(", ") || tSections("unknown"),
		},
	];

	return (
		<>
			<TableRow
				role="button"
				tabIndex={0}
				aria-pressed={summaryActive}
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
					{summaryActive ? (
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
					<div className="flex items-center gap-1.5">
						{showServiceTierDisclosureGutter && availablePlans.length > 1 && onToggleServiceTiers ? (
							<button
								type="button"
								aria-expanded={serviceTiersExpanded}
								aria-label={tProvider(
									serviceTiersExpanded ? "collapseServiceTiers" : "expandServiceTiers",
									{ provider: displayName },
								)}
								onClick={onToggleServiceTiers}
								className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
							>
								<ChevronDown className={cn("size-3 transition-transform", !serviceTiersExpanded && "-rotate-90")} aria-hidden="true" />
							</button>
						) : null}
						<div>
						<div className="flex items-center gap-2.5">
							<div
								className="inline-flex items-center gap-2.5 whitespace-nowrap text-foreground"
							>
								<div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 bg-background transition-colors group-hover:border-zinc-300 dark:border-zinc-800 dark:group-hover:border-zinc-700">
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
								<span className="inline-flex items-baseline gap-1 whitespace-nowrap">
									<span className="font-semibold text-foreground">
										<ProviderRouteName provider={provider.provider} plan={tablePlan} nameOverride={formattedDisplayName} />
									</span>
								</span>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								{provider.provider.credential_mode === "byok_only" ? (
									<HoverCard openDelay={120} closeDelay={80}>
										<HoverCardTrigger asChild>
											<button
												type="button"
												aria-label={tx("Common.ui.providerCardCopy.bYOKOnlyRequiresYourProviderKey" as never)}
												className="inline-flex h-6 w-6 items-center justify-center rounded-md text-amber-700 transition-colors hover:bg-muted/60 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-amber-300 dark:hover:text-amber-200"
											>
												<KeyRound className="h-3.5 w-3.5" />
											</button>
										</HoverCardTrigger>
										<HoverCardContent align="start" className="w-auto p-2 text-xs">
											<p className="font-semibold">{tx("Common.ui.providerCardCopy.bYOKOnly" as never)}</p>
											<p className="mt-1 text-muted-foreground">{tx("Common.ui.providerCardCopy.requiresYourProviderKey" as never)}</p>
										</HoverCardContent>
									</HoverCard>
								) : null}
								<HoverCard openDelay={120} closeDelay={80}>
									<HoverCardTrigger asChild>
										<button
											type="button"
								aria-label={tProvider("providerStatus", { status: tableStatusLabel })}
										className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
										>
											{React.createElement(tableStatusIcon, {
												className: cn("h-3 w-3", tableStatusClass),
											})}
										</button>
									</HoverCardTrigger>
									<HoverCardContent align="start" className="w-auto p-2 text-xs">
										<p className="font-semibold">{tableStatusLabel}</p>
										<p className="mt-1 text-muted-foreground">{tableStatusDetail}</p>
										<ProviderLifecycleDetails
											providerModels={tableProviderModelsInScope}
										/>
										{routingHealthSummary ? (
											<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
												<p className="font-semibold">{routingHealthSummary.label}</p>
												<p>{routingHealthSummary.description}</p>
											</div>
										) : null}
										<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
											<Link
								href={getLocalizedDocsHref(locale, PROVIDER_STATUSES_DOCS_HREF)}
												target="_blank"
												rel="noopener noreferrer"
												className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
											>
												{tProvider("learnMoreProviderStatuses")}
											</Link>
										</div>
									</HoverCardContent>
								</HoverCard>
								{privacyIgnoredReasons?.length || workspacePolicyBlockedReasons?.length ? (
									<HoverCard openDelay={120} closeDelay={80}>
										<HoverCardTrigger asChild>
											<button
												type="button"
											aria-label={isWorkspacePrivacyBlocked ? tSections("blockedByWorkspaceDataControls") : tSections("unavailableInPhaseoChat")}
											className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
											>
											{isWorkspacePrivacyBlocked ? <Ban className="h-3.5 w-3.5" /> : <ShieldBan className="h-3.5 w-3.5" />}
											</button>
										</HoverCardTrigger>
										<HoverCardContent align="start" className="w-80 p-2 text-xs">
											<p className="font-semibold text-foreground">{isWorkspacePrivacyBlocked ? tSections("workspaceBlocked") : tSections("chatUnavailable")}</p>
											<p className="mt-1 text-muted-foreground">
												{isWorkspacePrivacyBlocked ? tSections("workspacePrivacyPreventsProvider") : tSections("assignedGuardrailPreventsProvider")}
											</p>
											<div className="mt-2 space-y-1 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
												{workspacePolicyBlockedReasons?.map((reason) => (
													<div key={`${reason.source}:${reason.settingsHref}`} className="space-y-1">
														<p className="text-muted-foreground">{localizedWorkspacePolicyReason(tPolicy, reason)}</p>
														<Link href={reason.settingsHref} className="inline-flex text-[11px] font-medium text-primary hover:underline">{tx("Common.ui.providerCardCopy.reviewPolicy" as never)}</Link>
													</div>
												))}
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
													{tSections("apiKeyGuardrailsMayAffectRouting")}
												</p>
												<Link
													href="/settings/guardrails"
													className="mt-1 inline-flex text-[11px] font-medium text-primary hover:underline"
												>
													{tSections("reviewGuardrails")}
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
					</div>
				</TableCell>
				{priceColumns.length > 0 ? (
					isCustomerManagedPricing ? (
						<TableCell colSpan={priceColumns.length} className="py-1 pl-2 pr-4 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
							{tx("Common.ui.providerCardCopy.customerManaged")}
						</TableCell>
					) : (
						priceColumns.map((column) => (
							<TableCell key={column.key} className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
								{renderTablePriceSummary(
									tablePriceSummaries[column.key] ?? buildProviderTablePriceSummaryForColumn(tableSec, column),
									tablePlanPriceClass,
								)}
							</TableCell>
						))
					)
				) : null}
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div className="font-medium text-foreground">{tablePerformanceMetrics[0].value}</div>
				</TableCell>
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div className="font-medium text-foreground">{tablePerformanceMetrics[1].value}</div>
				</TableCell>
				<TableCell className="py-1 pl-2 pr-4 text-right tabular-nums whitespace-nowrap">
					<div
						className={cn(
							"inline-flex items-center justify-end gap-2 font-medium tabular-nums",
							tablePerformanceMetrics[2].valueClassName,
						)}
					>
						<span>{tablePerformanceMetrics[2].value}</span>
						<UptimeSparkline points={tableUptimeTrendPoints} />
					</div>
				</TableCell>
			</TableRow>
			<TableRow className="h-0 border-0 hover:bg-transparent">
				<TableCell
					colSpan={priceColumns.length + 4}
					className="h-0 border-0 p-0"
				>
					<ProviderInspectorSheet open={expanded} onOpenChange={handleInspectorOpenChange}>
						<ProviderInspectorSheetContent
							disableAnimation={disableInspectorAnimation}
							className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[50vw] lg:!w-[48vw] xl:!w-[44vw] 2xl:!w-[42vw] data-[side=right]:sm:max-w-none"
						>
							<div className="absolute right-14 top-4 z-10 flex items-center gap-2">
								<div className="flex items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										disabled={!previousProviderNavigationItem}
										aria-label={
											previousProviderNavigationItem
												? tPricing("openProviderDetails", { provider: previousProviderNavigationItem.name })
												: tSections("noPreviousProvider")
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
												? tPricing("openProviderDetails", { provider: nextProviderNavigationItem.name })
												: tSections("noNextProvider")
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
								{currentProviderNavigationIndex >= 0 ? (
									<span
										aria-label={tSections("providerIndex", { current: currentProviderNavigationIndex + 1, total: providerNavigationItems.length })}
										className="min-w-8 text-right font-sans text-[10px] font-medium tabular-nums text-muted-foreground"
									>
										{currentProviderNavigationIndex + 1} / {providerNavigationItems.length}
									</span>
								) : null}
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
											className="text-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:underline"
										>
											{displayName}
										</Link>
									</ProviderInspectorSheetTitle>
									<HoverCard openDelay={120} closeDelay={80}>
										<HoverCardTrigger asChild>
											<button
												type="button"
								aria-label={tProvider("providerStatus", { status: statusLabel })}
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
											<ProviderLifecycleDetails
												providerModels={providerModelsInScope}
											/>
											{routingHealthSummary ? (
												<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
													<p className="font-semibold">{routingHealthSummary.label}</p>
													<p>{routingHealthSummary.description}</p>
												</div>
											) : null}
											<div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
												<Link
								href={getLocalizedDocsHref(locale, PROVIDER_STATUSES_DOCS_HREF)}
													target="_blank"
													rel="noopener noreferrer"
													className="text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
												>
												{tProvider("learnMoreProviderStatuses")}
												</Link>
											</div>
										</HoverCardContent>
									</HoverCard>
								</div>
								<ProviderInspectorSheetDescription className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
									<button
										type="button"
										onClick={() =>
											void copyInspectorValue(providerQualifiedModelId ?? sec.providerId)
										}
										className="min-w-0 truncate rounded-sm text-left text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
										title={
											providerQualifiedModelId
												? tSections("copyProviderModelId")
												: tSections("copyProviderModelId")
										}
									>
										{copiedInspectorValue === (providerQualifiedModelId ?? sec.providerId)
											? tSections("copied")
											: providerQualifiedModelId ?? sec.providerId}
									</button>
									{canonicalModelId ? (
										<ProviderRoutingHelp />
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
									href={getLocalizedDocsHref(locale, PROVIDER_SHEET_DOCS.serviceTier)}
										className="text-xs font-medium text-muted-foreground"
									>
										{tQuickstart("serviceTier")}
									</ProviderSheetSectionLink>
										<PricingPlanSelect
										value={selectedPlan}
										onChange={selectServiceTier}
										plans={availablePlans}
										planMetaLabels={planMultiplierLabels}
										compact
									/>
								</div>
							</div>
						) : null}
						<div className="px-5">
							{availablePlans.length > 0 ? (
								<div className="sr-only">{tSections("selectedServiceTier", { tier: selectedPlanLabel })}</div>
							) : null}

							<section id={pricingSectionId} className="scroll-mt-5 space-y-1 py-2">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="text-[15px] font-semibold text-foreground">
									<ProviderSheetSectionLink href={getLocalizedDocsHref(locale, PROVIDER_SHEET_DOCS.pricing)}>
											{tPricing("title")}
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
											<span className={selectedPlanTheme.discountMuted}>{tSections("promotion")}</span>
											{discountTimeRemaining ? (
												<span className={selectedPlanTheme.discountMuted}>
													{discountTimeRemaining}
												</span>
											) : null}
								</div>
							) : null}
						</div>
						{pricingPrimaryContent}
						{pricingMediaInputContent}
						{pricingGeneratedOutputContent}
						{pricingAdditionalContent}
						{timeWindowPricingRules.length > 0 ? (
							<div className="py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="text-xs font-semibold text-foreground">{tSections("scheduledPricing")}</div>
										<div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
											{tSections("selectedByTime", { basis: tSections(getBillingTimestampBasisMessageKey(timeWindowPricingRules[0]?.rule.billing_timestamp_basis)) })}
										</div>
									</div>
										<div className="inline-flex shrink-0 rounded-md border border-zinc-200 p-0.5 text-[11px] dark:border-zinc-800" aria-label={tSections("pricingScheduleTimezone")}>
										{(["local", "utc"] as const).map((mode) => (
											<button
												key={mode}
												type="button"
												aria-pressed={pricingTimezoneMode === mode}
												onClick={() => updatePricingTimezoneMode(mode)}
												className={cn(
													"rounded px-2 py-1 font-medium transition-colors",
													pricingTimezoneMode === mode ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
												)}
											>
												{mode === "local" ? tSections("yourTime") : "UTC"}
											</button>
										))}
									</div>
								</div>

								<div className="mt-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
									<div className="grid grid-cols-[1fr_auto] gap-3 border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800">
										<div>
											<div className="flex items-center gap-2 text-xs font-semibold text-foreground">
												{tSections("offPeak")}
												{!peakPricingActiveNow ? <span className={selectedPlanTheme.accent}>{tSections("activeNow")}</span> : null}
											</div>
											<div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
												{weekdayOnlyPricing
													? tSections("weekendsOutsidePeriods")
													: tSections("outsidePeriods")}
											</div>
										</div>
									</div>
									<div className="border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800">
										<div className="flex items-center gap-2 text-xs font-semibold text-foreground">
										{tSections("peak")} · {formatPricingWindowDays(representativePricingWindows[0]?.days_of_week, locale, tSections("everyDay"))}
											{peakPricingActiveNow ? <span className={selectedPlanTheme.accent}>{tSections("activeNow")}</span> : null}
										</div>
										<div className="mt-1 space-y-0.5 text-[11px] tabular-nums text-muted-foreground">
											{representativePricingWindows.map((window, index) => (
												<div key={`${window.start_time}-${window.end_time}-${index}`}>
											{formatPricingWindowRange(
												window,
												pricingTimezoneMode,
												now,
												format.dateParts,
												format.time
											)}
												</div>
											))}
										</div>
										<div className="mt-1 text-[10px] text-muted-foreground">
												{pricingTimezoneMode === "local" ? localTimezone : tSections("coordinatedUniversalTime")}
										</div>
									</div>
									<div className="divide-y divide-zinc-200/70 px-3 dark:divide-zinc-800">
										{timeWindowPricingRules.map(({ rule, windows }) => (
											<div key={rule.id} className="py-2.5">
												<div className="flex items-baseline justify-between gap-3">
									<div className="min-w-0 text-xs font-medium text-foreground">{localizePricingMeter(rule.meter, formatMeterLabel(rule.meter))}</div>
													<div className="shrink-0 text-[10px] text-muted-foreground">{formatRuleUnitLabel(rule, locale, tx)}</div>
												</div>
												<div className="mt-1.5 grid grid-cols-2 gap-2">
													<div>
														<div className="text-[10px] font-medium text-muted-foreground">{tSections("offPeak")}</div>
														<div className={cn("mt-0.5 text-xs font-semibold tabular-nums", !peakPricingActiveNow ? selectedPlanPriceClass : "text-foreground")}>
															{fmtUSD(Number(rule.price_per_unit))}
														</div>
													</div>
													<div>
														<div className="text-[10px] font-medium text-muted-foreground">{tSections("peak")}</div>
														<div className={cn("mt-0.5 text-xs font-semibold tabular-nums", peakPricingActiveNow ? selectedPlanPriceClass : "text-foreground")}>
															{fmtUSD(Number(windows[0]?.price_per_unit))}
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>
						) : null}
							</section>

							<section
								id={performanceSectionId}
								className="scroll-mt-5 space-y-1 border-t border-zinc-200/80 py-2 dark:border-zinc-800"
							>
								<div>
									<h3 className="text-[15px] font-semibold text-foreground">
									<ProviderSheetSectionLink href={getLocalizedDocsHref(locale, PROVIDER_SHEET_DOCS.performance)}>
													{tPerformance("title")}
										</ProviderSheetSectionLink>
									</h3>
								</div>
							<div className="grid sm:grid-cols-3 sm:divide-x sm:divide-zinc-200/80 sm:dark:divide-zinc-800">
								{performanceMetrics.map((metric) => (
									<button
										type="button"
										key={metric.key}
										aria-pressed={activePerformanceMetric === metric.key}
										onClick={() => handlePerformanceMetricChange(metric.key)}
										className={cn(
											"group w-full py-3 text-left transition-colors hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:px-4 sm:first:pl-0 sm:last:pr-0",
										)}
									>
										<div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
											<span className="flex min-w-0 items-center gap-1">
												<span>{metric.label}</span>
												{metric.key === "uptime" ? (
													<HoverCard openDelay={120} closeDelay={80}>
														<HoverCardTrigger asChild>
															<span
																aria-label={tProvider("uptime")}
																tabIndex={0}
																className="inline-flex size-3.5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
															>
																<Info className="size-3" />
															</span>
														</HoverCardTrigger>
														<HoverCardContent
															align="start"
															side="top"
															className="w-72 text-left"
														>
															<UptimeHoverContent
																uptimePct={uptimePct}
																runtimeStats={selectedRuntimeStats}
															/>
														</HoverCardContent>
													</HoverCard>
												) : null}
											</span>
											<ChevronDown
												className={cn(
													"size-3 transition-transform",
													activePerformanceMetric === metric.key
														? "rotate-180 text-foreground"
														: "text-muted-foreground/60",
												)}
												aria-hidden="true"
											/>
										</div>
										<div
											className={cn(
												"mt-1 flex items-center gap-2 text-xs font-semibold tabular-nums",
												metric.valueClassName,
											)}
										>
											<ProviderPerformanceMetricValue metric={metric.key} value={metric.value} />
											{metric.key === "uptime" && activePerformanceMetric !== "uptime" ? (
												<UptimeSparkline points={uptimeTrendPoints} className="h-4 w-10" />
											) : null}
										</div>
									</button>
								))}
							</div>
							<ProviderHourlyPerformance
								runtimeStats={selectedRuntimeStats}
								activeMetric={activePerformanceMetric}
								hoveredPoint={hoveredPerformancePoint}
								onPointHover={handlePerformancePointHover}
								onPointLeave={handlePerformancePointLeave}
							/>
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
									<ProviderSheetSectionLink href={getLocalizedDocsHref(locale, PROVIDER_SHEET_DOCS.routing)}>
											{tSections("routingDetails")}
										</ProviderSheetSectionLink>
									</h3>
								</div>
								<div className="space-y-2">
									<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
										<div className="text-[11px] text-muted-foreground">{tSections("gatewayStatus")}</div>
										<div className="flex items-center justify-end gap-2 text-sm font-medium text-foreground">
												{React.createElement(statusIcon, { className: statusClass })}
												<span>{statusLabel}</span>
											</div>
									</div>
									<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
										<div className="text-[11px] text-muted-foreground">{tSections("providerModelIds")}</div>
										<div className="flex max-w-[18rem] flex-wrap justify-end gap-1.5">
											{displayProviderModelIds.map((modelId) => (
												<button
													key={modelId}
													type="button"
													onClick={() => void copyInspectorValue(modelId)}
													className="min-w-0 max-w-full rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:hover:bg-zinc-800"
													title={tSections("copyProviderModelId")}
												>
													<span className="block truncate">
														{copiedInspectorValue === modelId ? tSections("copied") : modelId}
													</span>
												</button>
											))}
											{displayProviderModelIds.length === 0 ? (
												<span className="text-xs text-muted-foreground">{tSections("noProviderModelIds")}</span>
											) : null}
										</div>
									</div>
					{providerAvailability ? (
										<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
											<div className="text-[11px] text-muted-foreground">{tSections("providerAvailability")}</div>
							<div className="text-sm font-medium text-foreground" title={providerAvailability.description}>
								{providerAvailability.label}
											</div>
										</div>
									) : null}
					{phaseoIntegration ? (
										<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
											<div className="text-[11px] text-muted-foreground">{tSections("phaseoIntegration")}</div>
							<div className="text-sm font-medium text-foreground" title={phaseoIntegration.description}>
								{phaseoIntegration.label}
											</div>
										</div>
									) : null}
									<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
										<div className="text-[11px] text-muted-foreground">{tSections("access")}</div>
										<div className="text-sm font-medium text-foreground">
											{lifecycleStatus.accessScope === "internal" ? tSections("internalOnly") : tSections("public")}
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
										<ProviderSheetSectionLink href={getLocalizedDocsHref(locale, PROVIDER_SHEET_DOCS.dataRetention)}>
											{tProvider("dataPolicy")}
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
										<div className="font-semibold">{isWorkspacePrivacyBlocked ? tSections("blockedByWorkspaceDataControls") : tSections("unavailableInPhaseoChat")}</div>
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
										<h3 className="text-[15px] font-semibold text-foreground">{tQuickstart("technicalDetails")}</h3>
								</div>
								<div className="space-y-2">
									{[
										[tQuickstart("quantization"), summaryQuantization ?? "--"],
										[tQuickstart("context"), contextLengthValue],
										[tQuickstart("maximumOutput"), maxOutputValue],
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
								<div className="flex items-center justify-between gap-3">
										<h3 className="text-[15px] font-semibold text-foreground">{tQuickstart("parameterSupport")}</h3>
									{parameterSupport.status !== "documented" ? (
										<span className="rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
											{parameterSupport.status === "partial" ? tQuickstart("partial") : tQuickstart("unknown")}
										</span>
									) : null}
								</div>
								{supportedParameters.length > 0 ? (
									<div className="space-y-2">
										{parameterSupport.status === "partial" ? (
											<p className="text-xs leading-relaxed text-muted-foreground">
												{tQuickstart("partialParameterSupport")}
											</p>
										) : null}
										<div className="flex flex-wrap items-start gap-1.5">
											{supportedParameters.map((param) => {
												const reference = getParameterReference(param);
												const descriptionKey = getParameterReferenceTranslationKey(param);
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
												href={getLocalizedDocsHref(locale, getParameterDocsHref(param))}
																		target="_blank"
																		rel="noopener noreferrer"
																		className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
																	>
																		{tQuickstart("docsLabel")}
																	</Link>
																</div>
																<p className="leading-relaxed text-muted-foreground">
																	{tQuickstart(`parameterDescriptions.${descriptionKey}` as never)}
																</p>
															</div>
															<div className="flex items-center gap-4 border-t border-zinc-200/70 pt-2 text-[11px] text-muted-foreground dark:border-zinc-800">
																<span>
																	{tQuickstart("typeLabel")}{" "}
																	<span className="text-foreground">{reference.type}</span>
																</span>
																<span>
																	{tQuickstart("defaultLabel")}{" "}
																	<span className="text-foreground">
																		{reference.defaultValue === "Provider specific" ? tQuickstart("defaultProviderSpecific") : reference.defaultValue === "Unset" ? tQuickstart("defaultUnset") : reference.defaultValue}
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
									<div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-3 dark:border-amber-900/70 dark:bg-amber-950/20">
										<div className="flex items-start gap-2">
											<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
											<div>
												<p className="text-sm font-medium text-foreground">{tQuickstart("supportNotDocumented")}</p>
												<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
													{tQuickstart("supportNotDocumentedDescription")}
												</p>
											</div>
										</div>
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
