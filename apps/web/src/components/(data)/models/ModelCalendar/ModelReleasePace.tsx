"use client";

import * as Recharts from "recharts";
import { useMemo } from "react";
import type { TooltipProps } from "recharts";
import type { ModelEvent } from "@/lib/fetchers/updates/getModelUpdates";
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

const CONFIG = {
	releases: { label: "Monthly releases", color: "#22c55e" },
	trend: { label: "3-mo average", color: "#3b82f6" },
};

// Predictions removed per request; only actuals and 3-mo avg

const MONTH_LABELS = (date: Date) =>
	date.toLocaleString("en-US", { month: "short", year: "2-digit" });

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

const KEY_LABELS: Record<string, string> = {
	releases: "Releases",
	trend: "3-mo avg",
};

const ReleaseTooltip = ({
	active,
	payload,
	label,
}: TooltipProps<number, string>) => {
	if (!active || !payload?.length) return null;

	const rows = payload.filter((item) => item.value !== undefined);
	const currentLabel = MONTH_LABELS(new Date());

	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
			<p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
				{label} {label === currentLabel ? "(in progress)" : ""}
			</p>
			<div className="mt-2 space-y-1">
				{rows.map((entry) => {
					const key = entry.dataKey ?? "";
					const labelText = KEY_LABELS[key] ?? String(key);
					const isPred = entry.payload?.isPrediction;
					return (
						<div
							key={`${entry.dataKey}-${label}-${isPred}`}
							className="flex items-center justify-between"
						>
							<span className="uppercase text-[10px] tracking-[0.2em] text-zinc-600 dark:text-zinc-400">
								{labelText}
								{isPred ? " (predicted)" : ""}
							</span>
							<span className="font-mono">
								{Number(entry.value ?? 0).toLocaleString()}
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
	const now = useMemo(() => new Date(), []);

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
				label: MONTH_LABELS(point),
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
	}, [events, monthsWindow, now]);

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
			? "Stable releases"
			: diff > 0
			? `Speeding up +${diff.toFixed(1)}`
			: `Slowing down ${diff.toFixed(1)}`;
	const badgeTooltip = `Recent 3-mo avg ${recentAvg.toFixed(
		1
	)}, prior ${previousAvg.toFixed(1)}.`;

	// No predictions: only actual data
	const chartData = data;

	return (
		<section>
			<div className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-1">
						<h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
							Releases per month (last 12 months)
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
					config={CONFIG}
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
								isFront={false}
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
							content={<ChartLegendContent />}
							verticalAlign="bottom"
						/>
						<ChartTooltip content={<ReleaseTooltip />} />
					</Recharts.LineChart>
				</ChartContainer>
			</div>
		</section>
	);
}
