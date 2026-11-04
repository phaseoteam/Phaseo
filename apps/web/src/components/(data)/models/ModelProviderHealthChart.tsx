"use client";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ModelSuccessPoint } from "@/lib/fetchers/models/getModelPerformance";
import { useLocale, useTranslations } from "next-intl";

import { attemptFunnel, type AttemptFunnelCounts, PROVIDER_HEALTH_METRICS, type ProviderHealthMetric } from "./attemptFunnel";

export { PROVIDER_HEALTH_METRICS, type ProviderHealthMetric } from "./attemptFunnel";

const PCT_FIELD = {
	reachability: "reachabilityPct",
	capacity: "capacityPct",
	callErrors: "callErrorPct",
} as const satisfies Record<ProviderHealthMetric, keyof ModelSuccessPoint>;

const FAILURE_FIELD = {
	reachability: "reachabilityFailures",
	capacity: "capacityFailures",
	callErrors: "callErrorFailures",
} as const satisfies Record<ProviderHealthMetric, keyof ModelSuccessPoint>;

const METRIC_STYLE: Record<ProviderHealthMetric, { color: string; dash?: string; swatch: string }> = {
	reachability: { color: "hsl(142, 76%, 36%)", swatch: "border-emerald-600 dark:border-emerald-400" },
	capacity: { color: "hsl(32, 95%, 44%)", dash: "6 3", swatch: "border-dashed border-amber-600 dark:border-amber-400" },
	callErrors: { color: "hsl(221, 83%, 53%)", dash: "2 3", swatch: "border-dotted border-blue-600 dark:border-blue-400" },
};

export type ProviderHealthChartPoint = {
	time: string;
	bucket: string;
	eligibleAttempts: number;
} & Record<ProviderHealthMetric, number | null> & Record<`${ProviderHealthMetric}Failures`, number>;

/** True when the series carries per-attempt provider health (newer web-api). */
export function hasProviderAttemptHealth(successSeries: ModelSuccessPoint[]): boolean {
	return successSeries.some((point) => point.eligibleAttempts !== undefined);
}

function toHourlyBucket(value: Date | string) {
	const date = new Date(value);
	date.setUTCMinutes(0, 0, 0);
	return date.toISOString();
}

function formatBucketLabel(bucket: string, locale: string) {
	const date = new Date(bucket);
	if (!Number.isFinite(date.getTime())) return bucket;
	return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

/** An hour with no eligible attempts shows as 100%, like the request-level chart. */
function displayedRate(value: number | null | undefined, eligibleAttempts: number): number | null {
	if (value != null && Number.isFinite(value)) return value;
	return eligibleAttempts === 0 ? 100 : null;
}

export function buildProviderHealthChartData(
	successSeries: ModelSuccessPoint[],
	now = new Date(),
	locale = "en-GB",
): ProviderHealthChartPoint[] {
	const pointsByBucket = new Map(successSeries.map((point) => [toHourlyBucket(point.bucket), point]));
	const currentHour = new Date(toHourlyBucket(now));
	return Array.from({ length: 24 }, (_, index) => {
		const bucketDate = new Date(currentHour);
		bucketDate.setUTCHours(currentHour.getUTCHours() - (23 - index));
		const bucket = bucketDate.toISOString();
		const point = pointsByBucket.get(bucket);
		const eligibleAttempts = point?.eligibleAttempts ?? 0;
		return {
			time: formatBucketLabel(bucket, locale),
			bucket,
			eligibleAttempts,
			reachability: displayedRate(point?.reachabilityPct, eligibleAttempts),
			capacity: displayedRate(point?.capacityPct, eligibleAttempts),
			callErrors: displayedRate(point?.callErrorPct, eligibleAttempts),
			reachabilityFailures: point?.reachabilityFailures ?? 0,
			capacityFailures: point?.capacityFailures ?? 0,
			callErrorsFailures: point?.callErrorFailures ?? 0,
		};
	});
}

export type ProviderHealthSummary = Record<ProviderHealthMetric, { averagePct: number | null; failures: number }> & {
	eligibleAttempts: number;
};

/** Hourly averages (as the request-level chart) and 24-hour counts for each metric. */
export function summarizeProviderHealth(points: ProviderHealthChartPoint[]): ProviderHealthSummary {
	const average = (values: Array<number | null>) => {
		const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
		return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
	};
	const metric = (key: ProviderHealthMetric) => ({
		averagePct: average(points.map((point) => point[key])),
		failures: points.reduce((sum, point) => sum + point[`${key}Failures`], 0),
	});
	return {
		eligibleAttempts: points.reduce((sum, point) => sum + point.eligibleAttempts, 0),
		reachability: metric("reachability"),
		capacity: metric("capacity"),
		callErrors: metric("callErrors"),
	};
}

function formatRate(value: number | null | undefined) {
	return value != null ? `${value.toFixed(1)}%` : "—";
}

export default function ModelProviderHealthChart({
	successSeries,
	showTitle = true,
}: {
	successSeries: ModelSuccessPoint[];
	showTitle?: boolean;
}) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.modelDetail.uptime");
	const chartData = buildProviderHealthChartData(successSeries, new Date(), locale);
	const summary = summarizeProviderHealth(chartData);
	const labels: Record<ProviderHealthMetric, string> = {
		reachability: t("reachabilityLabel"),
		capacity: t("capacityLabel"),
		callErrors: t("callErrorsLabel"),
	};
	const help: Record<ProviderHealthMetric, string> = {
		reachability: t("reachabilityHelp"),
		capacity: t("capacityHelp"),
		callErrors: t("callErrorsHelp"),
	};
	const label = (metric: ProviderHealthMetric) => labels[metric];
	const failureText = (metric: ProviderHealthMetric, counts: AttemptFunnelCounts) => {
		const { failed, of: count } = attemptFunnel(counts)[metric];
		if (metric === "reachability") return t("reachabilityCount", { failed, count });
		if (metric === "capacity") return t("capacityCount", { failed, count });
		return t("callErrorsCount", { failed, count });
	};
	const funnelCounts = (point: Pick<ProviderHealthChartPoint, "eligibleAttempts" | `${ProviderHealthMetric}Failures`>): AttemptFunnelCounts => ({
		eligibleAttempts: point.eligibleAttempts,
		reachabilityFailures: point.reachabilityFailures,
		capacityFailures: point.capacityFailures,
		callErrorFailures: point.callErrorsFailures,
	});
	const summaryCounts: AttemptFunnelCounts = {
		eligibleAttempts: summary.eligibleAttempts,
		reachabilityFailures: summary.reachability.failures,
		capacityFailures: summary.capacity.failures,
		callErrorFailures: summary.callErrors.failures,
	};
	const chartConfig: ChartConfig = Object.fromEntries(
		PROVIDER_HEALTH_METRICS.map((metric) => [metric, { label: label(metric), color: METRIC_STYLE[metric].color }]),
	);

	return (
		<div className="grid gap-4 rounded-lg border border-border/70 bg-background p-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
			<div className="min-w-0">
				{showTitle ? <h3 className="text-sm font-medium text-foreground">{t("providerHealthTitle")}</h3> : null}
				<dl className="mt-1 space-y-1.5">
					{PROVIDER_HEALTH_METRICS.map((metric) => (
						<div key={metric} className="flex items-baseline justify-between gap-3">
							<dt>
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											className="cursor-help text-sm text-muted-foreground underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
										>
											{label(metric)}
										</button>
									</TooltipTrigger>
									<TooltipContent className="max-w-64 space-y-1">
										<p>{help[metric]}</p>
										<p className="tabular-nums opacity-80">
											{failureText(metric, summaryCounts)}
										</p>
									</TooltipContent>
								</Tooltip>
							</dt>
							<dd className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
								{formatRate(summary[metric].averagePct)}
							</dd>
						</div>
					))}
				</dl>
				<p className="mt-2 text-xs text-muted-foreground">{t("attemptHourlyAverage")}</p>
			</div>
			<div className="min-w-0">
				<div
					className="h-[112px] w-full"
					role="img"
					aria-label={t("providerHealthChartLabel", {
						reachability: formatRate(summary.reachability.averagePct),
						capacity: formatRate(summary.capacity.averagePct),
						callErrors: formatRate(summary.callErrors.averagePct),
					})}
				>
					<ChartContainer config={chartConfig} className="h-full w-full">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={chartData}>
								<CartesianGrid vertical={false} stroke="var(--border)" opacity={0.35} />
								<XAxis
									dataKey="time"
									axisLine={false}
									interval={5}
									padding={{ left: 20, right: 20 }}
									tickLine={false}
									tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
								/>
								<YAxis hide domain={[0, 100]} />
								<ChartTooltip
									content={({ active, payload }) => {
										if (!active || !payload?.length) return null;
										const point = payload[0].payload as ProviderHealthChartPoint;
										return (
											<div className="space-y-1.5 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
												<p className="text-xs text-muted-foreground">{point.time}</p>
												{PROVIDER_HEALTH_METRICS.map((metric) => (
													<div key={metric}>
														<p className="text-sm">
															<span className="font-semibold">{label(metric)}</span>{" "}
															<span className="tabular-nums">{formatRate(point[metric])}</span>
														</p>
														<p className="text-xs text-muted-foreground tabular-nums">
															{failureText(metric, funnelCounts(point))}
														</p>
													</div>
												))}
											</div>
										);
									}}
								/>
								{PROVIDER_HEALTH_METRICS.map((metric) => (
									<Line
										key={metric}
										type="monotone"
										dataKey={metric}
										stroke={`var(--color-${metric})`}
										strokeWidth={2}
										strokeDasharray={METRIC_STYLE[metric].dash}
										dot={false}
										activeDot={false}
										connectNulls
									/>
								))}
							</LineChart>
						</ResponsiveContainer>
					</ChartContainer>
				</div>
				<div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
					{PROVIDER_HEALTH_METRICS.map((metric) => (
						<span key={metric} className="inline-flex items-center gap-1.5">
							<span className={`w-4 border-t-2 ${METRIC_STYLE[metric].swatch}`} aria-hidden="true" />
							{label(metric)}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
