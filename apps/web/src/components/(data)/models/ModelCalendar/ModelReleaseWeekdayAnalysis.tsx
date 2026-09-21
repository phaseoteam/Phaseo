"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Logo } from "@/components/Logo";
import type { ModelEvent } from "@/lib/fetchers/updates/types";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_CARD_LIMIT = 10;
const DEFAULT_CHART_ROW_LIMIT = 10;
const EXPANDED_CARD_LIMIT = 10;
const EXPANDED_CHART_ROW_LIMIT = 20;
type ExpandLevel = 0 | 1 | 2;

const DAY_SERIES = [
	{ key: "mon", label: "Mon", color: "#60a5fa" },
	{ key: "tue", label: "Tue", color: "#34d399" },
	{ key: "wed", label: "Wed", color: "#fbbf24" },
	{ key: "thu", label: "Thu", color: "#f97316" },
	{ key: "fri", label: "Fri", color: "#a78bfa" },
	{ key: "sat", label: "Sat", color: "#f472b6" },
	{ key: "sun", label: "Sun", color: "#94a3b8" },
] as const;

type WeekdayStat = {
	label: string;
	count: number;
	share: number;
};

type OrganisationStat = {
	organisationId: string;
	organisationName: string;
	total: number;
	weekdayCounts: number[];
	releasedTodayCount: number;
	topWeekdayIndex: number;
	topWeekdayCount: number;
	topWeekdayShare: number;
};

type OrganisationChartRow = {
	organisationId: string;
	organisationName: string;
	shortLabel: string;
	total: number;
	mon: number;
	tue: number;
	wed: number;
	thu: number;
	fri: number;
	sat: number;
	sun: number;
};

type AnalysisResult = {
	totalReleases: number;
	uniqueModelCount: number;
	uniqueReleaseDayCount: number;
	avgReleasesPerActiveDay: number;
	weekdayStats: WeekdayStat[];
	topWeekdayLabel: string;
	topWeekdayCount: number;
	topWeekdayShare: number;
	organisationStats: OrganisationStat[];
	organisationChartRows: OrganisationChartRow[];
};

type ModelReleaseWeekdayAnalysisProps = {
	events: ModelEvent[];
	compact?: boolean;
};

function toMondayFirstIndex(jsWeekday: number) {
	return (jsWeekday + 6) % 7;
}

function shortenLabel(value: string, max = 18) {
	const normalized = value.trim();
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, max - 3)}...`;
}

function formatPercent(value: number) {
	return `${(value * 100).toFixed(1)}%`;
}

function getLocalMonthDayKey(date: Date) {
	return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

export default function ModelReleaseWeekdayAnalysis({
	events,
	compact = false,
}: ModelReleaseWeekdayAnalysisProps) {
	const format = useDisplayFormatters();
	const formatNumber = (value: number) => Number.isFinite(value)
		? format.number(value, { maximumFractionDigits: 1 })
		: "--";
	const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
	const [expandLevel, setExpandLevel] = useState<ExpandLevel>(0);
	const [organisationQuery, setOrganisationQuery] = useState("");
	const [isPending, startTransition] = useTransition();
	const analysis = useMemo<AnalysisResult | null>(() => {
		const nowMs = Date.now();
		const todayMonthDayKey = getLocalMonthDayKey(new Date());
		const releaseEvents = events.filter((event) => {
			if (!event.types.includes("Released")) return false;
			const parsed = new Date(event.date);
			if (Number.isNaN(parsed.getTime())) return false;
			return parsed.getTime() <= nowMs;
		});

		if (releaseEvents.length === 0) return null;

		const weekdayCounts = Array<number>(7).fill(0);
		const uniqueModels = new Set<string>();
		const uniqueReleaseDays = new Set<string>();
		const organisations = new Map<
			string,
			{
				organisationId: string;
				organisationName: string;
				total: number;
				weekdayCounts: number[];
				releasedTodayCount: number;
			}
		>();

		for (const event of releaseEvents) {
			const parsed = new Date(event.date);
			if (Number.isNaN(parsed.getTime())) continue;
			const weekdayIndex = toMondayFirstIndex(parsed.getUTCDay());
			weekdayCounts[weekdayIndex] += 1;

			uniqueModels.add(event.model.model_id);
			uniqueReleaseDays.add(event.date.slice(0, 10));

			const organisationId =
				event.model.organisation.organisation_id ||
				event.model.organisation_id;
			const organisationName =
				event.model.organisation.name?.trim() || organisationId;
			const existing = organisations.get(organisationId);
			if (existing) {
				existing.total += 1;
				existing.weekdayCounts[weekdayIndex] += 1;
				if (event.date.slice(5, 10) === todayMonthDayKey) {
					existing.releasedTodayCount += 1;
				}
			} else {
				const counts = Array<number>(7).fill(0);
				counts[weekdayIndex] = 1;
				organisations.set(organisationId, {
					organisationId,
					organisationName,
					total: 1,
					weekdayCounts: counts,
					releasedTodayCount:
						event.date.slice(5, 10) === todayMonthDayKey ? 1 : 0,
				});
			}
		}

		const totalReleases = releaseEvents.length;
		const weekdayStats = WEEKDAY_LABELS.map((label, index) => ({
			label,
			count: weekdayCounts[index],
			share: totalReleases === 0 ? 0 : weekdayCounts[index] / totalReleases,
		}));

		let topWeekdayIndex = 0;
		for (let index = 1; index < weekdayCounts.length; index += 1) {
			if (weekdayCounts[index] > weekdayCounts[topWeekdayIndex]) {
				topWeekdayIndex = index;
			}
		}

		const organisationStats = Array.from(organisations.values())
			.map<OrganisationStat>((entry) => {
				let topIndex = 0;
				for (let index = 1; index < entry.weekdayCounts.length; index += 1) {
					if (entry.weekdayCounts[index] > entry.weekdayCounts[topIndex]) {
						topIndex = index;
					}
				}
				const topCount = entry.weekdayCounts[topIndex];
				return {
					organisationId: entry.organisationId,
					organisationName: entry.organisationName,
					total: entry.total,
					weekdayCounts: entry.weekdayCounts,
					releasedTodayCount: entry.releasedTodayCount,
					topWeekdayIndex: topIndex,
					topWeekdayCount: topCount,
					topWeekdayShare: entry.total === 0 ? 0 : topCount / entry.total,
				};
			})
			.sort((a, b) => {
				if (b.total !== a.total) return b.total - a.total;
				return a.organisationName.localeCompare(b.organisationName);
			});

		const organisationChartRows: OrganisationChartRow[] = organisationStats.map(
			(org) => ({
				organisationId: org.organisationId,
				organisationName: org.organisationName,
				shortLabel: shortenLabel(org.organisationName),
				total: org.total,
				mon: org.weekdayCounts[0] ?? 0,
				tue: org.weekdayCounts[1] ?? 0,
				wed: org.weekdayCounts[2] ?? 0,
				thu: org.weekdayCounts[3] ?? 0,
				fri: org.weekdayCounts[4] ?? 0,
				sat: org.weekdayCounts[5] ?? 0,
				sun: org.weekdayCounts[6] ?? 0,
			})
		);

		return {
			totalReleases,
			uniqueModelCount: uniqueModels.size,
			uniqueReleaseDayCount: uniqueReleaseDays.size,
			avgReleasesPerActiveDay:
				uniqueReleaseDays.size === 0
					? 0
					: totalReleases / uniqueReleaseDays.size,
			weekdayStats,
			topWeekdayLabel: WEEKDAY_LABELS[topWeekdayIndex],
			topWeekdayCount: weekdayCounts[topWeekdayIndex],
			topWeekdayShare:
				totalReleases === 0 ? 0 : weekdayCounts[topWeekdayIndex] / totalReleases,
			organisationStats,
			organisationChartRows,
		};
	}, [events]);

	if (!analysis) return null;

	const visibleCardLimit =
		expandLevel === 0 ? DEFAULT_CARD_LIMIT : EXPANDED_CARD_LIMIT;
	const visibleChartRowLimit =
		expandLevel === 0
			? DEFAULT_CHART_ROW_LIMIT
			: EXPANDED_CHART_ROW_LIMIT;

	const visibleOrganisationChartRows = analysis.organisationChartRows.slice(
		0,
		visibleChartRowLimit
	);
	const visibleOrganisationCards = analysis.organisationStats.slice(
		0,
		visibleCardLimit
	);
	const canExpandToExpanded =
		analysis.organisationStats.length > DEFAULT_CARD_LIMIT ||
		analysis.organisationChartRows.length > DEFAULT_CHART_ROW_LIMIT;
	const chartHeightPx = expandLevel === 0 ? 420 : 840;

	const daySeriesByLabel = new Map<string, (typeof DAY_SERIES)[number]>(
		DAY_SERIES.map((day) => [day.label, day])
	);
	const dayOrder = new Map<string, number>(
		DAY_SERIES.map((day, index) => [day.key, index])
	);
	const organisationLabelById = useMemo(
		() =>
			new Map(
				analysis.organisationChartRows.map((row) => [
					row.organisationId,
					row.shortLabel,
				])
			),
		[analysis.organisationChartRows]
	);

	const chartConfig = {
		mon: { label: "Mon", color: "#60a5fa" },
		tue: { label: "Tue", color: "#34d399" },
		wed: { label: "Wed", color: "#fbbf24" },
		thu: { label: "Thu", color: "#f97316" },
		fri: { label: "Fri", color: "#a78bfa" },
		sat: { label: "Sat", color: "#f472b6" },
		sun: { label: "Sun", color: "#94a3b8" },
	} as const;

	const renderOrganisationCard = (org: OrganisationStat) => {
		return (
			<Link
				key={org.organisationId}
				href={`/updates/calendar/organisations/${encodeURIComponent(org.organisationId)}?view=all`}
				className="group flex h-[42px] items-center gap-2 border-b border-zinc-200/80 last:border-b-0 dark:border-zinc-800"
			>
				<div className="relative size-7 shrink-0 rounded-md border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
					<div className="absolute inset-1.5">
						<Logo
							id={org.organisationId}
							alt={org.organisationName}
							className="object-contain"
							fill
						/>
					</div>
				</div>
				<div className="min-w-0 flex-1 leading-tight">
					<span className="block truncate font-semibold text-zinc-800 group-hover:underline dark:text-zinc-100">
						{org.organisationName}
					</span>
					<p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
						Top {WEEKDAY_LABELS[org.topWeekdayIndex]} · {formatPercent(org.topWeekdayShare)}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
					<span>
						Today {org.releasedTodayCount}
					</span>
					<span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
						{org.total}
					</span>
				</div>
			</Link>
		);
	};
	const matchingOrganisations = analysis.organisationStats.filter((org) => {
		const query = organisationQuery.trim().toLocaleLowerCase();
		return (
			query.length === 0 ||
			org.organisationName.toLocaleLowerCase().includes(query) ||
			org.organisationId.toLocaleLowerCase().includes(query)
		);
	});

	if (compact) {
		const compactOrganisationLimit =
			expandLevel === 0
				? DEFAULT_CARD_LIMIT
				: expandLevel === 1
					? EXPANDED_CARD_LIMIT
					: analysis.organisationStats.length;
		const compactOrganisations = analysis.organisationStats.slice(
			0,
			compactOrganisationLimit
		);

		return (
			<aside className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
							Release day analysis
						</h2>
						<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
							{format.number(analysis.totalReleases)} releases across{" "}
							{format.number(analysis.uniqueReleaseDayCount)} active days
						</p>
					</div>
					<div className="text-right">
						<p className="text-xs text-zinc-500 dark:text-zinc-400">Top day</p>
						<p className="font-semibold">
							{analysis.topWeekdayLabel} · {formatPercent(analysis.topWeekdayShare)}
						</p>
					</div>
				</div>

				<div className="mt-4 space-y-2">
					{analysis.weekdayStats.map((entry) => {
						const colour = daySeriesByLabel.get(entry.label)?.color ?? "#94a3b8";
						return (
							<div key={entry.label} className="grid grid-cols-[28px_1fr_38px] items-center gap-2 text-xs">
								<span className="font-medium">{entry.label}</span>
								<div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
									<div
										className="h-full rounded-full"
										style={{
											backgroundColor: colour,
											width: `${entry.share * 100}%`,
										}}
									/>
								</div>
								<span className="text-right font-mono text-zinc-500 dark:text-zinc-400">
									{entry.count}
								</span>
							</div>
						);
					})}
				</div>

				<div className="mt-4 border-t border-zinc-200 pt-2 dark:border-zinc-800">
					<div className="max-h-[420px] overflow-y-auto pr-1 text-xs">
						{compactOrganisations.map(renderOrganisationCard)}
					</div>
					{analysis.organisationStats.length > DEFAULT_CARD_LIMIT ? (
						<div className="mt-3 flex justify-end gap-2">
							{expandLevel < 2 && compactOrganisationLimit < analysis.organisationStats.length ? (
								<button
									type="button"
									disabled={isPending}
									onClick={() =>
										startTransition(() =>
											setExpandLevel((level) => (level === 0 ? 1 : 2))
										)
									}
									className="rounded-md border border-zinc-200 px-2.5 py-1 font-medium disabled:opacity-50 dark:border-zinc-700"
								>
									{expandLevel === 0 ? "Show more" : "Show all"}
								</button>
							) : null}
							{expandLevel > 0 ? (
								<button
									type="button"
									onClick={() => startTransition(() => setExpandLevel(0))}
									className="rounded-md border border-zinc-200 px-2.5 py-1 font-medium dark:border-zinc-700"
								>
									Collapse
								</button>
							) : null}
						</div>
					) : null}
				</div>
			</aside>
		);
	}

	return (
		<section className="space-y-4 py-6">
			<div className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
				<div>
					<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
						Release day analysis
					</h2>
				</div>

				<div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
					<div className="flex items-center gap-2">
						<span className="text-zinc-500 dark:text-zinc-400">Release events</span>
						<span className="font-semibold text-zinc-900 dark:text-zinc-50">
							{format.number(analysis.totalReleases)}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-zinc-500 dark:text-zinc-400">Models released</span>
						<span className="font-semibold text-zinc-900 dark:text-zinc-50">
							{format.number(analysis.uniqueModelCount)}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-zinc-500 dark:text-zinc-400">Active release days</span>
						<span className="font-semibold text-zinc-900 dark:text-zinc-50">
							{format.number(analysis.uniqueReleaseDayCount)}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-zinc-500 dark:text-zinc-400">Top release day</span>
						<span className="font-semibold text-zinc-900 dark:text-zinc-50">
							{analysis.topWeekdayLabel}
						</span>
						<span className="text-zinc-500 dark:text-zinc-400">
							{format.number(analysis.topWeekdayCount)} (
							{formatPercent(analysis.topWeekdayShare)})
						</span>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap gap-2 text-xs">
					{analysis.weekdayStats.map((entry) => (
						<div
							key={entry.label}
							className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
						>
							<span className="inline-flex items-center gap-1.5 font-medium">
								<span
									className="inline-block h-2.5 w-2.5 rounded-full"
									style={{
										backgroundColor:
											daySeriesByLabel.get(entry.label)?.color ?? "#94a3b8",
									}}
								/>
								{entry.label}
							</span>{" "}
							<span className="font-mono">{format.number(entry.count)}</span>{" "}
							<span className="text-zinc-500 dark:text-zinc-400">
								({formatPercent(entry.share)})
							</span>
						</div>
					))}
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
					<div className="rounded-md border border-zinc-200/80 p-3 dark:border-zinc-800/90">
						<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
							Release weekday mix by organisation (top {visibleOrganisationChartRows.length})
						</h3>
						<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
							Stacked bars show how each organisation distributes releases across weekdays.
						</p>
						<ChartContainer
							config={chartConfig}
							className="mt-3 w-full min-w-0 max-w-full !aspect-auto transition-[height] duration-300 ease-out"
							style={{ height: `${chartHeightPx}px` }}
						>
							<BarChart
								data={visibleOrganisationChartRows}
								layout="vertical"
								margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
								onMouseLeave={() => setHoveredDayKey(null)}
							>
								<CartesianGrid horizontal={false} className="stroke-muted" />
								<XAxis
									type="number"
									allowDecimals={false}
									tickLine={false}
									axisLine={false}
									tickFormatter={(value) => formatNumber(Number(value))}
								/>
								<YAxis
									type="category"
									dataKey="organisationId"
									tickFormatter={(value) =>
										organisationLabelById.get(String(value)) ??
										String(value)
									}
									tickLine={false}
									axisLine={false}
									width={120}
								/>
								<ChartTooltip
									content={(props) => {
										const row =
											(props.payload?.[0]?.payload as
												| OrganisationChartRow
												| undefined) ?? undefined;
										const rowTotal = Number(row?.total ?? 0);
										const filteredPayload =
											props.payload
												?.filter((item) => Number(item?.value ?? 0) > 0)
												.sort(
													(a, b) =>
														(dayOrder.get(String(a?.dataKey ?? "")) ?? 99) -
														(dayOrder.get(String(b?.dataKey ?? "")) ?? 99)
												) ?? [];
										if (!filteredPayload.length) return null;
										return (
											<ChartTooltipContent
												active={props.active}
												label={row?.organisationName ?? props.label}
												payload={filteredPayload}
												labelFormatter={(label) => String(label)}
												formatter={(value, name, item) => {
													const amount = Number(value ?? 0);
													const dayKey = String(item?.dataKey ?? name ?? "");
													const day = DAY_SERIES.find(
														(entry) => entry.key === dayKey
													);
													const share =
														rowTotal > 0 ? amount / rowTotal : 0;
													const active =
														hoveredDayKey === dayKey || hoveredDayKey === null;
													return (
														<div className="flex w-full items-center justify-between gap-2">
															<span
																className={`inline-flex items-center gap-1.5 ${
																	active ? "" : "opacity-60"
																}`}
															>
																<span
																	className="inline-block h-3.5 w-1 rounded-[2px]"
																	style={{
																		backgroundColor: day?.color ?? "#94a3b8",
																	}}
																/>
																<span>{day?.label ?? String(name)}</span>
															</span>
															<span className="font-mono">
																{format.number(amount)} (
																{formatPercent(share)})
															</span>
														</div>
													);
												}}
											/>
										);
									}}
								/>
								{DAY_SERIES.map((series) => {
									const active = hoveredDayKey
										? hoveredDayKey === series.key
										: true;
									return (
										<Bar
											key={series.key}
											dataKey={series.key}
											name={series.label}
											stackId="weekday"
											fill={`var(--color-${series.key}, ${series.color})`}
											fillOpacity={hoveredDayKey ? (active ? 0.95 : 0.35) : 0.9}
											onMouseOver={() => setHoveredDayKey(series.key)}
											onMouseOut={() => setHoveredDayKey(null)}
											isAnimationActive={false}
										/>
									);
								})}
							</BarChart>
						</ChartContainer>
					</div>

					<div className="rounded-md border border-zinc-200/80 p-3 dark:border-zinc-800/90">
						<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
							Organisation weekday tendencies
						</h3>
						<div className="mt-3 text-xs">
							{visibleOrganisationCards.map(renderOrganisationCard)}
						</div>
					</div>
				</div>

				{canExpandToExpanded || expandLevel > 0 ? (
					<div className="mt-4 flex justify-end gap-2">
						<Dialog>
							<DialogTrigger asChild>
								<button
									type="button"
									className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
								>
									Browse all organisations
								</button>
							</DialogTrigger>
							<DialogContent className="max-w-lg rounded-md">
								<DialogHeader>
									<DialogTitle>Browse organisations</DialogTitle>
								</DialogHeader>
								<input
									type="search"
									value={organisationQuery}
									onChange={(event) => setOrganisationQuery(event.target.value)}
									placeholder="Search organisations"
									className="h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-400 dark:border-zinc-700 dark:focus:border-zinc-500"
								/>
								<p className="text-xs text-zinc-500 dark:text-zinc-400">
									{format.number(matchingOrganisations.length)} organisation
									{matchingOrganisations.length === 1 ? "" : "s"}
								</p>
								<ScrollArea className="h-[420px] pr-3">
									{matchingOrganisations.length > 0 ? (
										matchingOrganisations.map(renderOrganisationCard)
									) : (
										<p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
											No organisations match that search.
										</p>
									)}
								</ScrollArea>
							</DialogContent>
						</Dialog>
						{expandLevel === 0 && canExpandToExpanded ? (
							<button
								type="button"
								disabled={isPending}
								onClick={() => startTransition(() => setExpandLevel(1))}
								className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
							>
								Show more organisations
							</button>
						) : null}
						{expandLevel > 0 ? (
							<button
								type="button"
								onClick={() => startTransition(() => setExpandLevel(0))}
								className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
							>
								Collapse
							</button>
						) : null}
					</div>
				) : null}

				<p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
					Average releases per active release day:{" "}
					{analysis.avgReleasesPerActiveDay.toFixed(2)}
				</p>
			</div>
		</section>
	);
}
