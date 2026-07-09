"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { TimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";
import { Logo } from "@/components/Logo";
import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { EmptyLeaderboardPreview } from "@/components/(rankings)/EmptyLeaderboardPreview";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	assignOrderedSeriesColours,
	keyForSeries,
} from "@/components/(rankings)/chart-colors";
import { formatModelDisplayName } from "@/lib/models/displayName";
import { getModelDetailsHref } from "@/lib/models/modelHref";

type UsageStackedBarProps = {
	data: TimeseriesData[];
	leaderboardData?: TimeseriesData[];
	metric?: "requests" | "tokens" | "users";
	nameMap?: Record<string, string>;
	logoIdMap?: Record<string, string | null>;
	organisationNameMap?: Record<string, string | null>;
	modelLicenseMap?: Record<string, string | null>;
	leaderboardTitle?: string;
	leaderboardDescription?: string;
	valueUnit?: string;
};

type SeriesStyle = Record<string, { label: string; color: string; stroke: string }>;
type LeaderboardPeriod = "today" | "week" | "month" | "trending";
type ModelFilter = "all" | "open" | "closed";
const TOP_MODELS = 10;
const PERIOD_OPTIONS: Array<{ label: string; value: LeaderboardPeriod }> = [
	{ label: "Past 24 hours", value: "today" },
	{ label: "Past 7 days", value: "week" },
	{ label: "Past 30 days", value: "month" },
	{ label: "Trending", value: "trending" },
];
const MODEL_FILTER_OPTIONS: Array<{ label: string; value: ModelFilter }> = [
	{ label: "All Models", value: "all" },
	{ label: "Open Models", value: "open" },
	{ label: "Closed Models", value: "closed" },
];
const CLOSED_LICENSE_VALUES = new Set([
	"closed",
	"closed source",
	"commercial",
	"proprietary",
	"private",
	"unknown",
	"not specified",
	"n/a",
	"none",
]);

function formatBucketLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
	return value.toLocaleString();
}

function timeseriesValue(
	row: TimeseriesData,
	metric: "requests" | "tokens" | "users",
) {
	if (metric === "users") return Number(row.users ?? 0);
	return metric === "tokens"
		? Number(row.tokens ?? 0)
		: Number(row.requests ?? 0);
}

function formatPaceGain(value: number) {
	const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
	if (safeValue >= 1e9) return `+${(safeValue / 1e9).toFixed(2)}B`;
	if (safeValue >= 1e6) return `+${(safeValue / 1e6).toFixed(2)}M`;
	if (safeValue >= 1e3) return `+${(safeValue / 1e3).toFixed(2)}K`;
	return `+${safeValue.toFixed(2)}`;
}

function formatChange(value: number | null) {
	if (value == null || !Number.isFinite(value)) return "New";
	if (Math.abs(value) < 0.5) return "0%";
	return `${value > 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(0)}%`;
}

function changeClassName(value: number | null) {
	if (value == null || !Number.isFinite(value)) {
		return "text-xs tabular-nums text-blue-600";
	}
	if (value < -0.5) return "text-xs tabular-nums text-red-500";
	if (value > 0.5) return "text-xs tabular-nums text-emerald-600";
	return "text-xs tabular-nums text-muted-foreground";
}

function inferOrganisationId(modelId: string, logoId?: string | null) {
	if (logoId?.trim() && !logoId.includes("/")) return logoId.trim();
	const [organisationId] = modelId.split("/");
	return organisationId?.trim() || null;
}

function organisationHref(organisationId: string | null) {
	return organisationId
		? `/organisations/${encodeURIComponent(organisationId)}`
		: null;
}

function isOpenModelLicense(license?: string | null) {
	const normalized = license?.trim().toLowerCase();
	if (!normalized) return false;
	return !CLOSED_LICENSE_VALUES.has(normalized);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function periodWindows(period: LeaderboardPeriod, nowMs: number) {
	switch (period) {
		case "month":
			return {
				currentStart: nowMs - 30 * DAY_MS,
				currentEnd: nowMs,
				previousStart: nowMs - 60 * DAY_MS,
				previousEnd: nowMs - 30 * DAY_MS,
			};
		case "trending":
			return {
				currentStart: nowMs - WEEK_MS,
				currentEnd: nowMs,
				previousStart: nowMs - 2 * WEEK_MS,
				previousEnd: nowMs - WEEK_MS,
			};
		case "today":
			return {
				currentStart: nowMs - DAY_MS,
				currentEnd: nowMs,
				previousStart: nowMs - 2 * DAY_MS,
				previousEnd: nowMs - DAY_MS,
			};
		case "week":
		default:
			return {
				currentStart: nowMs - WEEK_MS,
				currentEnd: nowMs,
				previousStart: nowMs - 2 * WEEK_MS,
				previousEnd: nowMs - WEEK_MS,
			};
	}
}

function optionLabel<TValue extends string>(
	options: Array<{ label: string; value: TValue }>,
	value: TValue,
) {
	return options.find((option) => option.value === value)?.label ?? value;
}

function startOfWeek(date: Date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const day = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - day);
	return d;
}

export function UsageStackedBar({
	data,
	leaderboardData,
	metric = "requests",
	nameMap = {},
	logoIdMap = {},
	organisationNameMap = {},
	modelLicenseMap = {},
	leaderboardTitle = "Model Leaderboard",
	leaderboardDescription = "Compare the most popular models by weekly gateway usage.",
	valueUnit,
}: UsageStackedBarProps) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [nowMs] = useState(() => Date.now());
	const [listExpanded, setListExpanded] = useState(false);
	const [leaderboardPeriod, setLeaderboardPeriod] =
		useState<LeaderboardPeriod>("week");
	const [modelFilter, setModelFilter] = useState<ModelFilter>("all");
	const emptyTitle =
		metric === "users" ? "No unique-user data yet" : "No weekly usage data yet";
	const emptyDescription =
		metric === "users"
			? "Unique-user rankings appear once the public actor rollup is refreshed."
			: "Usage appears once enough requests are aggregated to meet privacy thresholds.";

	if (!data.length) {
		return (
			<EmptyChartPreview
				title={emptyTitle}
				description={emptyDescription}
				heightClassName="h-[420px]"
			/>
		);
	}

	const totalsByModel = new Map<string, number>();
	const bucketMap = new Map<number, Record<string, number> & { bucket: string; bucketTs: number }>();

	for (const row of data) {
		const bucketTs = new Date(row.bucket).getTime();
		if (!Number.isFinite(bucketTs)) continue;
		const rawKey = row.model_id?.trim() || "Unknown";
		const keyLower = rawKey.toLowerCase();
		if (keyLower === "unknown") continue;
		const key = keyLower === "other" ? "Other" : rawKey;
		const value = timeseriesValue(row, metric);

		if (!Number.isFinite(value)) continue;

		const entry =
			bucketMap.get(bucketTs) ??
			({
				bucket: formatBucketLabel(row.bucket),
				bucketTs,
			} as Record<string, number> & { bucket: string; bucketTs: number });

		entry[key] = (entry[key] ?? 0) + value;
		bucketMap.set(bucketTs, entry);
		totalsByModel.set(key, (totalsByModel.get(key) ?? 0) + value);
	}

	const sortedModels = Array.from(totalsByModel.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([model]) => model);
	const rankedModels = sortedModels.filter((model) => model !== "Other");
	const topModels = rankedModels;
	const hasOther = totalsByModel.has("Other");

	if (!topModels.length && !hasOther) {
		return (
			<EmptyChartPreview
				title={emptyTitle}
				description={emptyDescription}
				heightClassName="h-[420px]"
			/>
		);
	}

	const existingBucketTs = Array.from(bucketMap.keys());
	const currentWeekTs = startOfWeek(new Date(nowMs)).getTime();
	const endWeekTs =
		existingBucketTs.length > 0
			? Math.max(...existingBucketTs, currentWeekTs)
			: currentWeekTs;
	const endWeek = startOfWeek(new Date(endWeekTs));
	for (let i = 51; i >= 0; i -= 1) {
		const ts = endWeek.getTime() - i * WEEK_MS;
		if (!bucketMap.has(ts)) {
			bucketMap.set(ts, {
				bucket: formatBucketLabel(new Date(ts).toISOString()),
				bucketTs: ts,
			} as Record<string, number> & { bucket: string; bucketTs: number });
		}
	}

	const modelOrder = hasOther ? [...topModels, "Other"] : topModels;
	const currentWeekStartTs = endWeek.getTime();
	const leaderboardUnit =
		valueUnit ??
		(metric === "tokens"
			? "tokens"
			: metric === "users"
				? "users"
				: "requests");
	const { currentStart, currentEnd, previousStart, previousEnd } = periodWindows(
		leaderboardPeriod,
		nowMs,
	);
	const currentPeriodTotals = new Map<string, number>();
	const previousPeriodTotals = new Map<string, number>();
	const leaderboardRows = leaderboardData ?? data;

	for (const row of leaderboardRows) {
		const bucketTs = new Date(row.bucket).getTime();
		if (!Number.isFinite(bucketTs)) continue;
		const rawKey = row.model_id?.trim() || "Unknown";
		const keyLower = rawKey.toLowerCase();
		if (keyLower === "unknown" || keyLower === "other") continue;
		const value = timeseriesValue(row, metric);
		if (!Number.isFinite(value) || value <= 0) continue;
		if (bucketTs >= currentStart && bucketTs < currentEnd) {
			currentPeriodTotals.set(
				rawKey,
				(currentPeriodTotals.get(rawKey) ?? 0) + value,
			);
		} else if (bucketTs >= previousStart && bucketTs < previousEnd) {
			previousPeriodTotals.set(
				rawKey,
				(previousPeriodTotals.get(rawKey) ?? 0) + value,
			);
		}
	}

	let rankedLeaderboardModels = Array.from(
		new Set([
			...Array.from(currentPeriodTotals.keys()),
			...Array.from(previousPeriodTotals.keys()),
		]),
	).map((model) => {
		const current = currentPeriodTotals.get(model) ?? 0;
		const previous = previousPeriodTotals.get(model) ?? 0;
		const changePct =
			previous > 0
				? ((current - previous) / previous) * 100
				: current > 0
					? null
					: 0;
		return { model, current, previous, changePct };
	});

	const matchesModelFilter = (modelId: string) => {
		if (modelFilter === "all") return true;
		const isOpen = isOpenModelLicense(modelLicenseMap[modelId]);
		return modelFilter === "open" ? isOpen : !isOpen;
	};

	rankedLeaderboardModels = rankedLeaderboardModels
		.filter((entry) => entry.current > 0 && matchesModelFilter(entry.model))
		.sort((left, right) => {
			if (leaderboardPeriod === "trending") {
				const leftChange = left.changePct ?? (left.current > 0 ? 100 : 0);
				const rightChange = right.changePct ?? (right.current > 0 ? 100 : 0);
				if (rightChange !== leftChange) return rightChange - leftChange;
			}
			return right.current - left.current;
		});

	const listEntries = rankedLeaderboardModels.slice(
		0,
		listExpanded ? TOP_MODELS * 2 : TOP_MODELS,
	);
	const canExpandList = rankedLeaderboardModels.length > TOP_MODELS;
	const hasLeaderboardEntries = listEntries.length > 0;
	const selectedPeriodLabel = optionLabel(PERIOD_OPTIONS, leaderboardPeriod);
	const listColumnSplit = Math.ceil(listEntries.length / 2);
	const listColumns = [
		listEntries.slice(0, listColumnSplit),
		listEntries.slice(listColumnSplit),
	].filter((column) => column.length > 0);

	const keyMap = new Map<string, string>();
	topModels.forEach((model) => {
		keyMap.set(model, keyForSeries(model));
	});
	if (hasOther) keyMap.set("Other", "other");

	const colourMap = assignOrderedSeriesColours(topModels);

	const seriesStyle: SeriesStyle = {};
	topModels.forEach((model) => {
		const key = keyMap.get(model) ?? model;
		const c = colourMap[model];
		seriesStyle[key] = {
			label: formatModelDisplayName(nameMap[model], model),
			color: c?.fill ?? "hsl(210 55% 58%)",
			stroke: c?.stroke ?? c?.fill ?? "hsl(210 55% 45%)",
		};
	});
	if (hasOther) {
		seriesStyle.other = {
			label: "Other",
			color: "hsl(0 0% 70% / 0.6)",
			stroke: "hsl(0 0% 50%)",
		};
	}

	const chartData = Array.from(bucketMap.values())
		.sort((a, b) => a.bucketTs - b.bucketTs)
		.map(({ bucket, ...rest }) => {
			const row: Record<string, number | string | boolean> = { bucket };
			topModels.forEach((model) => {
				const key = keyMap.get(model) ?? model;
				row[key] = Number(rest[model] ?? 0);
			});
			if (hasOther) {
				row.other = Number(rest.Other ?? 0);
			}
			row.projected_pace = 0;
			row.__isCurrentWeek = false;
			return row;
		});

	const seriesKeys = modelOrder.map((model) => keyMap.get(model) ?? model);
	const lastIndex = chartData.length - 1;
	if (lastIndex >= 0) {
		const sumForRow = (row: Record<string, number | string | boolean>) =>
			seriesKeys.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
		const currentWeekRow = chartData[lastIndex];
		const currentTotal = sumForRow(currentWeekRow);
		const isCurrentWeek =
			nowMs >= currentWeekStartTs &&
			nowMs < currentWeekStartTs + WEEK_MS;
		if (isCurrentWeek) {
			const elapsedMs = Math.max(1, nowMs - currentWeekStartTs);
			const elapsedRatio = Math.min(1, Math.max(0, elapsedMs / WEEK_MS));
			const projectedTotal =
				elapsedRatio > 0 && elapsedRatio < 1
					? Math.max(currentTotal, currentTotal / elapsedRatio)
					: currentTotal;
			const projectedDelta = Math.max(0, projectedTotal - currentTotal);
			currentWeekRow.projected_pace = projectedDelta;
			currentWeekRow.__isCurrentWeek = true;
		}
	}

	const chartConfig = {
		value: { label: "Usage", color: "hsl(var(--primary))" },
		...Object.fromEntries(
			Object.entries(seriesStyle).map(([k, v]) => [
				k,
				{ label: v.label, color: v.color },
			])
		),
	} as const;

	return (
		<div className="space-y-4">
			<ChartContainer config={chartConfig} className="h-[420px] w-full">
				<BarChart
					data={chartData}
					margin={{ top: 16, right: 12, left: 0, bottom: 32 }}
				>
					<defs>
						<pattern
							id="rankingsProjectedPacePattern"
							patternUnits="userSpaceOnUse"
							width={8}
							height={8}
							patternTransform="rotate(45)"
						>
							<rect width={8} height={8} fill="hsl(0 0% 88% / 0.35)" />
							<line
								x1={0}
								y1={0}
								x2={0}
								y2={8}
								stroke="hsl(0 0% 65% / 0.8)"
								strokeWidth={2}
							/>
						</pattern>
					</defs>
					<CartesianGrid vertical={false} className="stroke-muted" />
					<XAxis
						dataKey="bucket"
						minTickGap={24}
						interval="preserveStartEnd"
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tickFormatter={(value) => formatNumber(Number(value))}
						width={60}
						tickLine={false}
						axisLine={false}
					/>
					<ChartTooltip
						content={(props) => {
							const rowPayload = (props.payload?.[0]?.payload ?? {}) as Record<
								string,
								number | string | boolean
							>;
							const isCurrentWeek = Boolean(rowPayload.__isCurrentWeek);
							const sortedPayload =
								props.payload
									?.filter(
										(item) =>
											String(item?.dataKey ?? "") !== "projected_pace" &&
											Number(item?.value ?? 0) > 0
									)
									.sort(
										(a, b) =>
											Number(b?.value ?? 0) - Number(a?.value ?? 0)
									) ?? [];
							const otherPayload = sortedPayload.find(
								(item) => String(item?.dataKey ?? "") === "other"
							);
							const hoveredPayload = hoveredKey
								? sortedPayload.find(
										(item) =>
											String(item?.dataKey ?? "") === hoveredKey &&
											hoveredKey !== "other"
									)
								: undefined;
							const topPayload = sortedPayload
								.filter((item) => String(item?.dataKey ?? "") !== "other")
								.slice(0, TOP_MODELS);
							const hoveredAlreadyVisible =
								hoveredPayload &&
								topPayload.some(
									(item) => String(item?.dataKey ?? "") === hoveredKey
								);
							const filteredPayload = [
								...topPayload,
								...(hoveredPayload && !hoveredAlreadyVisible ? [hoveredPayload] : []),
								...(otherPayload ? [otherPayload] : []),
							];
							if (!filteredPayload.length) return null;
							const weeklyTotal = filteredPayload.reduce(
								(sum, item) => sum + Number(item?.value ?? 0),
								0
							);
							const weeklyPaceGain = isCurrentWeek
								? Number(rowPayload.projected_pace ?? 0)
								: 0;
							const projectedTotal = weeklyTotal + weeklyPaceGain;
							return (
								<div className="grid min-w-[12.5rem] items-start gap-1.5 rounded-lg border border-zinc-200/50 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-zinc-800/50 dark:bg-zinc-950">
									<ChartTooltipContent
										active={props.active}
										label={props.label}
										payload={filteredPayload}
										className="min-w-0 border-0 bg-transparent p-0 shadow-none"
										labelFormatter={(lbl) => String(lbl)}
										formatter={(v, name, item) => {
											const val = Number(v ?? 0);
											const seriesKey = String(item?.dataKey ?? name ?? "");
											const cfg = seriesStyle[seriesKey];
											const isHovered = hoveredKey === seriesKey;
											return (
												<div
													className={`flex w-full items-center justify-between rounded-md px-1.5 py-0.5 ${
														isHovered
															? "bg-zinc-200/70 dark:bg-zinc-800/70"
															: ""
													}`}
												>
													<span className="inline-flex items-center gap-1.5">
														<span
															className="inline-block rounded-[2px]"
															style={{
																backgroundColor: cfg?.color,
																width: 4,
																height: 14,
															}}
														/>
														<span className={isHovered ? "font-medium" : ""}>
															{cfg?.label ?? String(name ?? "")}
														</span>
													</span>
													<span className="ml-auto pl-3 tabular-nums">
														{formatNumber(val)}
													</span>
												</div>
											);
										}}
									/>
									<div className="space-y-0.5 border-t border-border/60 pt-1.5 text-xs">
										<div className="flex items-center justify-between gap-4">
											<span className="text-muted-foreground">
												{isCurrentWeek ? "So far" : "Total"}
											</span>
											<span className="whitespace-nowrap tabular-nums">
												{formatNumber(weeklyTotal)}
											</span>
										</div>
										{isCurrentWeek ? (
											<div className="flex items-center justify-between gap-4">
												<span className="text-muted-foreground">Weekly pace</span>
												<span className="whitespace-nowrap tabular-nums">
													{formatNumber(projectedTotal)} ({formatPaceGain(weeklyPaceGain)})
												</span>
											</div>
										) : null}
									</div>
								</div>
							);
						}}
					/>
					{seriesKeys.map((key, index) => {
						const s = seriesStyle[key];
						return (
							<Bar
								key={key}
								dataKey={key}
								name={s?.label}
								stackId="usage"
								fill={`var(--color-${key}, ${s?.color})`}
								fillOpacity={1}
								radius={
									index === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
								}
								onMouseOver={() => {
									setHoveredKey((current) => (current === key ? current : key));
								}}
								onMouseOut={() => {
									setHoveredKey((current) => (current === key ? null : current));
								}}
								isAnimationActive={false}
							/>
						);
					})}
					<Bar
						dataKey="projected_pace"
						name="Projected pace"
						stackId="usage"
						fill="url(#rankingsProjectedPacePattern)"
						stroke="hsl(0 0% 55% / 0.7)"
						strokeWidth={0.5}
						radius={[4, 4, 0, 0]}
						isAnimationActive={false}
					/>
				</BarChart>
			</ChartContainer>
			<div className="space-y-8 pt-3">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="min-w-0 max-w-xl space-y-1">
						<h3 className="text-xl font-semibold">{leaderboardTitle}</h3>
						<p className="text-sm text-muted-foreground">
							{leaderboardDescription}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-9 w-36 justify-between rounded-lg px-4 font-normal text-muted-foreground" />}>

									{optionLabel(MODEL_FILTER_OPTIONS, modelFilter)}
									<ChevronDown className="ml-2 h-4 w-4 opacity-60" />

							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-36">
								{MODEL_FILTER_OPTIONS.map((option) => (
									<DropdownMenuItem
										key={option.value}
										onSelect={() => {
											setModelFilter(option.value);
											setListExpanded(false);
										}}
										className="justify-between gap-6"
									>
										<span>{option.label}</span>
										<span className="flex h-4 w-4 items-center justify-center">
											{modelFilter === option.value ? (
												<Check className="h-4 w-4 text-primary" />
											) : null}
										</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-9 w-32 justify-between rounded-lg px-4 font-normal text-muted-foreground" />}>

									{optionLabel(PERIOD_OPTIONS, leaderboardPeriod)}
									<ChevronDown className="ml-2 h-4 w-4 opacity-60" />

							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-32">
								{PERIOD_OPTIONS.map((option) => (
									<DropdownMenuItem
										key={option.value}
										onSelect={() =>
											setLeaderboardPeriod(option.value)
										}
										className="justify-between gap-6"
									>
										<span>{option.label}</span>
										<span className="flex h-4 w-4 items-center justify-center">
											{leaderboardPeriod === option.value ? (
												<Check className="h-4 w-4 text-primary" />
											) : null}
										</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				{hasLeaderboardEntries ? (
					<div className="grid gap-x-16 gap-y-1 md:grid-cols-2">
						{listColumns.map((column, columnIndex) => (
							<div
								key={`usage-list-column-${columnIndex}`}
								className="space-y-1"
							>
								{column.map((entry, columnRowIndex) => {
								const index = columnIndex === 0
									? columnRowIndex
									: listColumnSplit + columnRowIndex;
								const model = entry.model;
								const organisationId = inferOrganisationId(
									model,
									logoIdMap[model],
								);
								const logoHref = organisationHref(organisationId);
								const modelHref = getModelDetailsHref(organisationId, model);
								const logoId = organisationId ?? model;
								const modelName = formatModelDisplayName(nameMap[model], model);
								const organisationName =
									(organisationId
										? organisationNameMap[model] ?? organisationNameMap[organisationId]
										: null) ?? organisationId;
								const changeLabel = formatChange(entry.changePct);
								return (
									<div
										key={model}
										className="grid min-h-16 grid-cols-[2.25rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-2"
									>
										<div className="text-base tabular-nums text-muted-foreground">
											{index + 1}.
										</div>
										{logoHref ? (
											<Link
												href={logoHref}
												aria-label={`${modelName} organization`}
												className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800"
											>
												<span className="relative h-4 w-4">
													<Logo
														id={logoId}
														alt={modelName}
														className="object-contain"
														fill
													/>
												</span>
											</Link>
										) : (
											<span className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800">
												<span className="relative h-4 w-4">
													<Logo
														id={logoId}
														alt={modelName}
														className="object-contain"
														fill
													/>
												</span>
											</span>
										)}
										{modelHref ? (
											<div className="min-w-0">
												<Link
													href={modelHref}
													className="block truncate text-base font-semibold underline decoration-transparent underline-offset-2 hover:decoration-current"
												>
													{modelName}
												</Link>
												{organisationId ? (
													<div className="text-sm text-muted-foreground">
														by{" "}
														<Link
															href={`/organisations/${encodeURIComponent(organisationId)}`}
															className="underline underline-offset-2 hover:text-foreground"
														>
															{organisationName}
														</Link>
													</div>
												) : null}
											</div>
										) : (
											<div className="min-w-0">
												<div className="truncate text-base font-semibold">
													{modelName}
												</div>
												{organisationId ? (
													<div className="text-sm text-muted-foreground">
														by {organisationName}
													</div>
												) : null}
											</div>
										)}
										<div className="text-right">
											<div className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
												{formatNumber(entry.current)} {leaderboardUnit}
											</div>
											<div className={changeClassName(entry.changePct)}>
												{changeLabel}
											</div>
										</div>
									</div>
								);
								})}
							</div>
						))}
					</div>
				) : (
					<EmptyLeaderboardPreview
						title={`No data for ${selectedPeriodLabel.toLowerCase()}`}
						description="Leaderboard entries appear once public gateway aggregates include usage in this rolling period."
					/>
				)}
				{canExpandList ? (
					<div className="flex justify-center">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setListExpanded((prev) => !prev)}
							aria-expanded={listExpanded}
							className="text-muted-foreground"
						>
							{listExpanded ? "Show less" : "Show more"}
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}
