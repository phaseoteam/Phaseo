"use client";

import * as Recharts from "recharts";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { TooltipProps } from "recharts";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import {
	ChartContainer,
	ChartLegendContent,
	ChartTooltip,
	ChartLegend,
} from "@/components/ui/chart";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

// Predictions removed per request; only actuals and 3-mo avg

const MONTH_LABELS = (date: Date, locale: string) =>
	date.toLocaleString(locale, { month: "short", year: "2-digit" });

const isRelease = (event: ModelEvent) => event.types.includes("Released");

function padTwo(value: number) {
	return `${value}`.padStart(2, "0");
}

type ReleasePaceData = {
	key: string;
	label: string;
	releases: number;
	trend: number;
	releaseActual?: number;
	trendActual?: number;
};

type ModelReleasePaceProps = {
	events: ModelEvent[];
	monthsWindow?: number;
};

type RechartsTooltipContentProps = TooltipProps<number, string> & {
	active?: boolean;
	payload?: Array<any>;
	label?: string | number;
};

type ReleaseTooltipProps = RechartsTooltipContentProps & {
	locale: string;
	labels: Record<string, string>;
	currentLabel: string;
	inProgressLabel: string;
	predictedLabel: string;
};

const ReleaseTooltip = ({
	active,
	payload,
	label,
	locale,
	labels,
	currentLabel,
	inProgressLabel,
	predictedLabel,
}: ReleaseTooltipProps) => {
	if (!active || !payload?.length) return null;

	const rows = payload.filter((item) => item.value !== undefined);
	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
			<p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
				{label} {label === currentLabel ? `(${inProgressLabel})` : ""}
			</p>
			<div className="mt-2 space-y-1">
				{rows.map((entry) => {
					const key = entry.dataKey ?? "";
					const labelText = labels[key] ?? String(key);
					const isPred = entry.payload?.isPrediction;
					return (
						<div
							key={`${entry.dataKey}-${label}-${isPred}`}
							className="flex items-center justify-between"
						>
							<span className="text-[11px] text-zinc-600 dark:text-zinc-400">
								{labelText}
								{isPred ? ` (${predictedLabel})` : ""}
							</span>
							<span className="font-mono">
								{Number(entry.value ?? 0).toLocaleString(locale)}
							</span>
						</div>
					);
				})}
			</div>
			{/* footer removed per request */}
		</div>
	);
};

export default function ModelReleasePace({
	events,
	monthsWindow = 24,
}: ModelReleasePaceProps) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.updatesCalendar.releasePace");
	const now = useMemo(() => new Date(), []);
	const config = {
		releases: { label: t("monthlyReleases"), color: "#22c55e" },
		trend: { label: t("threeMonthAverage"), color: "#3b82f6" },
	};
	const tooltipLabels = {
		releases: t("releases"),
		trend: t("threeMonthAverage"),
	};

	const data = useMemo<ReleasePaceData[]>(() => {
		const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
		windowStart.setMonth(windowStart.getMonth() - (monthsWindow - 1));

		const releaseMap = new Map<string, number>();

		events.forEach((event) => {
			if (!isRelease(event)) return;
			const parsed = new Date(event.date);
			if (Number.isNaN(parsed.getTime())) return;
			const key = `${parsed.getFullYear()}-${padTwo(
				parsed.getMonth() + 1
			)}`;
			releaseMap.set(key, (releaseMap.get(key) ?? 0) + 1);
		});

		const months = Array.from({ length: monthsWindow }, (_, index) => {
			const point = new Date(windowStart);
			point.setMonth(windowStart.getMonth() + index);
			return {
				key: `${point.getFullYear()}-${padTwo(point.getMonth() + 1)}`,
				label: MONTH_LABELS(point, locale),
			};
		});

		return months.map((entry, index) => {
			const releases = releaseMap.get(entry.key) ?? 0;
			const window = months
				.slice(Math.max(0, index - 2), index + 1)
				.reduce(
					(sum, item) => sum + (releaseMap.get(item.key) ?? 0),
					0
				);
			const windowCount = Math.min(index + 1, 3);
			const trend = windowCount === 0 ? 0 : window / windowCount;
			return {
				...entry,
				releases,
				trend: Math.round(trend * 100) / 100,
				releaseActual: releases,
				trendActual: Math.round(trend * 100) / 100,
			};
		});
	}, [events, monthsWindow, now, locale]);

	const maxRelease = Math.max(...data.map((entry) => entry.releases), 0);
	const thresholds = [0, Math.round(maxRelease / 2), maxRelease].filter(
		(value, index, arr) => value !== arr[index - 1]
	);
	const _totalReleases = data.reduce((sum, entry) => sum + entry.releases, 0);
	const cleanData = data.slice(0, -1);
	const recentWindow = cleanData.slice(-3);
	const prevWindow = cleanData.slice(-6, -3);
	const recentAvg =
		recentWindow.reduce((sum, entry) => sum + entry.releases, 0) /
		Math.max(recentWindow.length, 1);
	const previousAvg =
		prevWindow.reduce((sum, entry) => sum + entry.releases, 0) /
		Math.max(prevWindow.length, 1);
	const diff = recentAvg - previousAvg;
	const trendLabel =
		Math.abs(diff) < 0.1
			? t("stableReleases")
			: diff > 0
			? t("speedingUp", { value: Math.abs(diff).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
			: t("slowingDown", { value: Math.abs(diff).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
	const badgeTooltip = t("trendTooltip", {
		recent: recentAvg.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
		previous: previousAvg.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
	});

	// No predictions: only actual data
	const chartData = data;

	return (
		<section>
			<div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-1">
						<h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
							{t("releasesPerMonth")}
						</h3>
					</div>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<div
								className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
									diff >= 0
										? "border-emerald-400 bg-emerald-50 text-emerald-700"
										: "border-rose-400 bg-rose-50 text-rose-700"
								}`}
							>
								<span
									className={`h-2 w-2 rounded-full ${
										diff >= 0
											? "bg-emerald-500"
											: "bg-rose-500"
									}`}
								/>
								<span>{trendLabel}</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							{badgeTooltip}
						</TooltipContent>
					</Tooltip>
				</div>
				<ChartContainer
					config={config}
					className="!aspect-[4/3] sm:!aspect-[3/1]"
				>
					<Recharts.LineChart
						data={chartData}
						margin={{ top: 6, right: 14, left: 0, bottom: 28 }}
					>
						<Recharts.CartesianGrid
							strokeDasharray="3 3"
							vertical={false}
							strokeOpacity={0.3}
						/>
						{thresholds.map((value) => (
							<Recharts.ReferenceLine
								key={`grid-${value}`}
								y={value}
								strokeDasharray="4 4"
								stroke="#9ca3af"
								strokeOpacity={0.4}
							/>
						))}
						<Recharts.XAxis
							dataKey="label"
							tickLine={false}
							axisLine={false}
							strokeOpacity={0.6}
						/>
						<Recharts.YAxis
							tickLine={false}
							axisLine={false}
							allowDecimals={false}
							minTickGap={10}
						/>
						<Recharts.Line
							type="monotone"
							dataKey="releases"
							stroke="var(--color-releases,#22c55e)"
							strokeWidth={3}
							dot={false}
							activeDot={{ r: 3 }}
						/>
						<Recharts.Line
							type="monotone"
							dataKey="trend"
							stroke="var(--color-trend,#3b82f6)"
							strokeWidth={2}
							dot={false}
							strokeDasharray="5 5"
						/>
						<ChartLegend
							content={(props) => (
								<ChartLegendContent
									payload={props.payload}
									verticalAlign={props.verticalAlign}
								/>
							)}
							verticalAlign="bottom"
						/>
						<ChartTooltip
							content={
								<ReleaseTooltip
									locale={locale}
									labels={tooltipLabels}
									currentLabel={MONTH_LABELS(now, locale)}
									inProgressLabel={t("inProgress")}
									predictedLabel={t("predicted")}
								/>
							}
						/>
					</Recharts.LineChart>
				</ChartContainer>
			</div>
		</section>
	);
}
