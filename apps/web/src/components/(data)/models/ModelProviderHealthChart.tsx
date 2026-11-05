import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ModelSuccessPoint } from "@/lib/fetchers/models/getModelPerformance";
import { useLocale, useTranslations } from "@/i18n/react";

import {
	type AttemptFailureShare,
	type AttemptFunnelRates,
	attemptFailureShares,
	formatFailureShare,
	PROVIDER_HEALTH_METRICS,
	type ProviderHealthMetric,
} from "./attemptFunnel";

export { PROVIDER_HEALTH_METRICS, type ProviderHealthMetric } from "./attemptFunnel";

const METRIC_STYLE: Record<ProviderHealthMetric, { color: string; dash?: string; swatch: string }> = {
	reachability: { color: "hsl(142, 76%, 36%)", swatch: "border-emerald-600 dark:border-emerald-400" },
	capacity: { color: "hsl(32, 95%, 44%)", dash: "6 3", swatch: "border-dashed border-amber-600 dark:border-amber-400" },
	callErrors: { color: "hsl(221, 83%, 53%)", dash: "2 3", swatch: "border-dotted border-blue-600 dark:border-blue-400" },
};

export type ProviderHealthChartPoint = {
	time: string;
	bucket: string;
	/** Rates as published for the hour (null when there was nothing to rate). */
	rates: { reachabilityPct: number | null; capacityPct: number | null; callErrorPct: number | null };
} & Record<ProviderHealthMetric, number | null>;

/** True when the series carries per-attempt provider health (newer web-api). */
export function hasProviderAttemptHealth(successSeries: ModelSuccessPoint[]): boolean {
	return successSeries.some((point) => point.reachabilityPct !== undefined);
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

const finite = (value: number | null | undefined): number | null =>
	value != null && Number.isFinite(value) ? value : null;

/**
 * An hour with no eligible attempts (no reachable rate) shows as 100%, like the
 * request-level chart. A later step nothing reached stays empty.
 */
function displayedRate(value: number | null | undefined, hadAttempts: boolean): number | null {
	const rate = finite(value);
	if (rate != null) return rate;
	return hadAttempts ? null : 100;
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
		const rates = {
			reachabilityPct: finite(point?.reachabilityPct),
			capacityPct: finite(point?.capacityPct),
			callErrorPct: finite(point?.callErrorPct),
		};
		const hadAttempts = rates.reachabilityPct != null;
		return {
			time: formatBucketLabel(bucket, locale),
			bucket,
			rates,
			reachability: displayedRate(rates.reachabilityPct, hadAttempts),
			capacity: displayedRate(rates.capacityPct, hadAttempts),
			callErrors: displayedRate(rates.callErrorPct, hadAttempts),
		};
	});
}

export type ProviderHealthSummary = Record<ProviderHealthMetric, { averagePct: number | null }>;

/** Hourly averages over the 24 hours shown, as the request-level chart. */
export function summarizeProviderHealth(points: ProviderHealthChartPoint[]): ProviderHealthSummary {
	const average = (values: Array<number | null>) => {
		const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
		return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
	};
	return {
		reachability: { averagePct: average(points.map((point) => point.reachability)) },
		capacity: { averagePct: average(points.map((point) => point.capacity)) },
		callErrors: { averagePct: average(points.map((point) => point.callErrors)) },
	};
}

/**
 * The 24-hour failure share of each step. Uses the rates web-api computes from
 * all attempts in those hours when present: an average of hourly rates would
 * understate failures when traffic is uneven (idle hours count as 100%). Older
 * cached responses without them fall back to the averages shown beside it.
 */
export function summaryFailureShares(
	summary: ProviderHealthSummary,
	totals?: AttemptFunnelRates | null,
): Record<ProviderHealthMetric, AttemptFailureShare> {
	if (totals) return attemptFailureShares(totals);
	return attemptFailureShares({
		reachabilityPct: summary.reachability.averagePct,
		capacityPct: summary.capacity.averagePct,
		callErrorPct: summary.callErrors.averagePct,
	});
}

function formatRate(value: number | null | undefined) {
	return value != null ? `${value.toFixed(1)}%` : "—";
}

export default function ModelProviderHealthChart({
	successSeries,
	totals = null,
	showTitle = true,
}: {
	successSeries: ModelSuccessPoint[];
	/** The 24 hours' rates from summed attempts (web-api `attemptHealth24h`). */
	totals?: AttemptFunnelRates | null;
	showTitle?: boolean;
}) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.modelDetail.uptime");
	const chartData = buildProviderHealthChartData(successSeries, new Date(), locale);
	const summary = summarizeProviderHealth(chartData);
	const summaryShares = summaryFailureShares(summary, totals);
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
	/** Percentages only: the counts behind them reveal the model's traffic volume. */
	const failureText = (metric: ProviderHealthMetric, share: AttemptFailureShare, noFailures: string) => {
		if (share.kind === "none") return noFailures;
		if (share.kind === "unmeasured") return metric === "capacity" ? t("capacityUnmeasured") : t("callErrorsUnmeasured");
		const percent = formatFailureShare(share.pct, locale);
		if (metric === "reachability") return t("reachabilityFailureShare", { percent });
		if (metric === "capacity") return t("capacityFailureShare", { percent });
		return t("callErrorsFailureShare", { percent });
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
											{failureText(metric, summaryShares[metric], t("noFailures"))}
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
										const shares = attemptFailureShares(point.rates);
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
															{failureText(metric, shares[metric], t("noFailuresThisHour"))}
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
