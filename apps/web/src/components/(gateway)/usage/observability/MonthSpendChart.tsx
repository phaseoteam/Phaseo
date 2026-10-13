"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { MonthSpendForecast } from "@/lib/gateway/usage/monthSpendForecast";

const DAY_MS = 86_400_000;
const NANOS_PER_USD = 1_000_000_000;

type MonthSpendPoint = { x: number; spent?: number; projected?: number; band?: [number, number] };

/** Cumulative spend so far, then the projection from now to the month end, in USD. */
export function buildMonthSpendPoints(forecast: MonthSpendForecast): MonthSpendPoint[] {
	const points: MonthSpendPoint[] = forecast.cumulative.map((point) => ({ x: point.x, spent: point.nanos / NANOS_PER_USD }));
	const spent = forecast.spentNanos / NANOS_PER_USD;
	points[points.length - 1] = { ...points[points.length - 1], projected: spent, band: [spent, spent] };
	points.push({
		x: forecast.daysInMonth,
		projected: forecast.midNanos / NANOS_PER_USD,
		band: [forecast.lowNanos / NANOS_PER_USD, forecast.highNanos / NANOS_PER_USD],
	});
	return points;
}

export function formatSpendRange(lowNanos: number, highNanos: number, format: (usd: number) => string) {
	const low = format(lowNanos / NANOS_PER_USD);
	const high = format(highNanos / NANOS_PER_USD);
	return low === high ? low : `${low}–${high}`;
}

/** Even axis steps of 1, 2, 2.5 or 5 × 10ⁿ, so the top tick is a round amount. */
export function niceSpendTicks(maxUsd: number): number[] {
	if (!(maxUsd > 0)) return [0, 1];
	const rough = maxUsd / 4;
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const step = [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
	return Array.from({ length: Math.ceil(maxUsd / step) + 1 }, (_, index) => index * step);
}

export function MonthSpendChart({
	forecast,
	formatCurrency,
	height = 300,
}: {
	forecast: MonthSpendForecast;
	formatCurrency: (usd: number) => string;
	height?: number;
}) {
	const t = useTranslations("SettingsUI.observability");
	const format = useDisplayFormatters();
	const hatchId = `month-spend-hatch-${React.useId().replace(/:/g, "")}`;
	const points = buildMonthSpendPoints(forecast);
	// Days are UTC calendar days, so label them in UTC whatever the viewer's zone.
	const dayLabel = (ms: number) => format.dateParts(ms, { month: "short", day: "numeric", timeZone: "UTC" });
	const lastDay = dayLabel(forecast.monthStart + (forecast.daysInMonth - 1) * DAY_MS);
	const xLabel = (x: number) => {
		if (x >= forecast.daysInMonth) return lastDay;
		if (Math.abs(x - forecast.elapsedDays) < 1e-6) return t("monthSpendToday");
		return dayLabel(forecast.monthStart + Math.max(0, Math.ceil(x) - 1) * DAY_MS);
	};
	const previousUsd = forecast.previousMonthNanos === null ? null : forecast.previousMonthNanos / NANOS_PER_USD;
	const yTicks = niceSpendTicks(Math.max(forecast.highNanos / NANOS_PER_USD, previousUsd ?? 0) * 1.05);
	const projectedRange = formatSpendRange(forecast.lowNanos, forecast.highNanos, formatCurrency);
	const config = {
		spent: { label: t("monthSpendSpent"), color: "var(--chart-4)" },
		projected: { label: t("monthSpendProjected"), color: "var(--chart-4)" },
	} satisfies ChartConfig;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm tabular-nums">
				<span className="text-muted-foreground">
					{t("monthSpendSpent")} <span className="font-medium text-foreground">{formatCurrency(forecast.spentNanos / NANOS_PER_USD)}</span>
				</span>
				<span className="text-muted-foreground">
					{t("monthSpendProjected")} <span className="font-medium text-foreground">{projectedRange}</span> · {t("monthSpendByDate", { date: lastDay })}
				</span>
			</div>
			<ChartContainer config={config} className="w-full min-w-0 [aspect-ratio:auto]" style={{ width: "100%", height, minHeight: height }}>
				<ComposedChart data={points} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
					<defs>
						<pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-projected)" strokeOpacity={0.55} strokeWidth={2} />
						</pattern>
					</defs>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="x"
						type="number"
						domain={[0, forecast.daysInMonth]}
						ticks={[0, forecast.elapsedDays, forecast.daysInMonth]}
						tickFormatter={(value) => xLabel(Number(value))}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={56}
						ticks={yTicks}
						domain={[0, yTicks[yTicks.length - 1]]}
						tickFormatter={(value) => formatCurrency(Number(value))}
					/>
					<Tooltip
						cursor={{ stroke: "var(--muted-foreground)", opacity: 0.28 }}
						content={({ active, payload }) => {
							const point = active ? (payload?.[0]?.payload as MonthSpendPoint | undefined) : undefined;
							if (!point) return null;
							const isEnd = point.x >= forecast.daysInMonth;
							return (
								<div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
									<div className="font-medium">{xLabel(point.x)}</div>
									<div className="mt-0.5 tabular-nums text-muted-foreground">
										{isEnd ? `${t("monthSpendProjected")}: ${projectedRange}` : `${t("monthSpendSpent")}: ${formatCurrency(point.spent ?? 0)}`}
									</div>
								</div>
							);
						}}
					/>
					{previousUsd !== null ? (
						<ReferenceLine y={previousUsd} stroke="var(--muted-foreground)" strokeDasharray="2 4" ifOverflow="extendDomain" />
					) : null}
					<Area dataKey="band" stroke="none" fill={`url(#${hatchId})`} isAnimationActive={false} connectNulls activeDot={false} />
					<Area
						dataKey="spent"
						type="monotone"
						stroke="var(--color-spent)"
						strokeWidth={2}
						fill="var(--color-spent)"
						fillOpacity={0.12}
						dot={false}
						isAnimationActive={false}
					/>
					<Line
						dataKey="projected"
						stroke="var(--color-projected)"
						strokeOpacity={0.8}
						strokeWidth={1.5}
						strokeDasharray="4 4"
						dot={false}
						activeDot={false}
						connectNulls
						isAnimationActive={false}
					/>
				</ComposedChart>
			</ChartContainer>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="h-1.5 w-3.5 rounded-sm bg-chart-4" />
					{t("monthSpendSpent")}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className="h-1.5 w-3.5 rounded-sm text-chart-4"
						style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 4px)" }}
					/>
					{t("monthSpendProjected")}
				</span>
				{previousUsd !== null ? (
					<span className="inline-flex items-center gap-1.5">
						<span aria-hidden="true" className="w-3.5 border-t-2 border-dotted border-muted-foreground" />
						{t("monthSpendLastMonth")} · {formatCurrency(previousUsd)}
					</span>
				) : null}
			</div>
		</div>
	);
}
