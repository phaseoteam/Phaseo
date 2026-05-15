"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Flame, Link2 } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { ProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot"
import { formatCompactNumber, formatUsdFromNanos } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Props = {
	profile: ProfileSnapshot
	publicView?: boolean
}

type ActivityRange = "1d" | "7d" | "30d"
type HeatmapMetric = "requests" | "tokens" | "spend"
type ActivitySeriesMetric = "requests" | "tokens"
type TopModelsMetric = "requests" | "tokens" | "spend"

const HEATMAP_ROW_LABELS = ["M", "T", "W", "T", "F", "S", "S"]
const HEATMAP_LEVEL_CLASSES = [
	"bg-zinc-100",
	"bg-indigo-100",
	"bg-indigo-200",
	"bg-indigo-400",
	"bg-indigo-600",
]
const ACTIVITY_RANGE_LABELS: Record<ActivityRange, string> = {
	"1d": "Today",
	"7d": "Last 7 Days",
	"30d": "Last 30 Days",
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("")
}

function formatDelta(value: number | null): string {
	if (value == null) return "0%"
	const rounded = Math.round(value)
	return `${rounded > 0 ? "+" : ""}${rounded}%`
}

function formatShortDate(date: string): string {
	return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en", {
		month: "numeric",
		day: "numeric",
		timeZone: "UTC",
	})
}

function formatLongDate(date: string): string {
	return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	})
}

function formatMetricValue(mode: HeatmapMetric, value: number, compact = false): string {
	if (mode === "spend") {
		if (compact) {
			const dollars = value / 1_000_000_000
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				notation: dollars >= 1000 ? "compact" : "standard",
				maximumFractionDigits: dollars >= 100 ? 0 : dollars >= 1 ? 2 : 4,
			}).format(dollars)
		}

		return formatUsdFromNanos(value)
	}

	if (compact) {
		return formatCompactNumber(value)
	}

	return new Intl.NumberFormat("en", {
		minimumFractionDigits: value > 0 && value < 10 ? 2 : 0,
		maximumFractionDigits: value >= 100 ? 0 : 2,
	}).format(value)
}

function formatTopModelMetricValue(
	mode: TopModelsMetric,
	model: ProfileSnapshot["topModels"][number],
): string {
	if (mode === "spend") {
		return formatUsdFromNanos(model.spendNanos)
	}

	if (mode === "requests") {
		return model.requests.toLocaleString()
	}

	return formatCompactNumber(model.tokens)
}

function formatTopModelMetricLabel(mode: TopModelsMetric): string {
	if (mode === "spend") return "Spend"
	if (mode === "requests") return "Requests"
	return "Tokens"
}

function formatChartMetricValue(mode: ActivitySeriesMetric, value: number): string {
	if (mode === "tokens") {
		return value.toLocaleString()
	}

	return value.toLocaleString()
}

function getMetricDayValue(
	day: ProfileSnapshot["heatmapDays"][number],
	mode: HeatmapMetric,
): number {
	if (mode === "tokens") return day.tokens
	if (mode === "spend") return day.spendNanos
	return day.requests
}

function getMetricLabel(mode: HeatmapMetric): string {
	if (mode === "tokens") return "Tokens"
	if (mode === "spend") return "Spend"
	return "Requests"
}

function getHeatmapQuantile(values: number[], quantile: number): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((left, right) => left - right)
	const index = (sorted.length - 1) * quantile
	const lower = Math.floor(index)
	const upper = Math.ceil(index)
	if (lower === upper) return sorted[lower] ?? 0
	const weight = index - lower
	return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

function getHeatmapLevel(
	value: number,
	thresholds: { low: number; medium: number; high: number } | null,
): number {
	if (value <= 0 || !thresholds) return 0
	if (value <= thresholds.low) return 1
	if (value <= thresholds.medium) return 2
	if (value <= thresholds.high) return 3
	return 4
}

function SectionShell({
	children,
	className = "",
}: {
	children: ReactNode
	className?: string
}) {
	return (
		<section
			className={`rounded-[1.25rem] border border-zinc-200/90 bg-white ${className}`}
		>
			{children}
		</section>
	)
}

function SectionHeader({
	title,
	description,
	right,
}: {
	title: string
	description?: string
	right?: ReactNode
}) {
	return (
		<div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
			<div>
				<h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
				{description ? (
					<p className="mt-1 text-xs text-zinc-500">{description}</p>
				) : null}
			</div>
			{right}
		</div>
	)
}

function ActivitySeriesChart({
	points,
	mode,
}: {
	points: ProfileSnapshot["activitySeries30"]
	mode: ActivitySeriesMetric
}) {
	const chartData = useMemo(
		() =>
			points.map((point) => ({
				date: point.date,
				value: mode === "requests" ? point.requests : point.tokens,
			})),
		[mode, points],
	)

	const chartConfig = useMemo(
		() => ({
			value: {
				label: mode === "requests" ? "Requests" : "Tokens",
				color: mode === "requests" ? "#7c65f6" : "#f43f5e",
			},
		}),
		[mode],
	)

	const gradientId =
		mode === "requests" ? "profile-activity-gradient" : "profile-token-gradient"

	return (
		<div className="px-4 pb-3.5 sm:px-5">
			<ChartContainer
				config={chartConfig}
				className="h-[12.5rem] w-full border-t border-dashed border-zinc-200 pt-3"
			>
				<AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.28} />
							<stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.03} />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} strokeDasharray="3 3" />
					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						minTickGap={24}
						tickMargin={10}
						tickFormatter={(value) => formatShortDate(String(value))}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={44}
						tickMargin={10}
						tickFormatter={(value) => formatCompactNumber(Number(value))}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<ChartTooltipContent
								className="min-w-[11rem] gap-2.5 rounded-xl border-zinc-200 px-3.5 py-2.5 shadow-lg"
								hideIndicator
								labelClassName="text-sm font-medium text-zinc-900"
								labelFormatter={(label) => formatLongDate(String(label))}
								formatter={(value) => (
									<div className="flex items-center gap-2.5 leading-none">
										<span className="font-mono text-sm font-semibold tabular-nums text-zinc-950">
											{formatChartMetricValue(mode, Number(value))}
										</span>
										<span className="text-xs font-medium text-zinc-500">
											{mode === "requests" ? "Requests" : "Tokens"}
										</span>
									</div>
								)}
							/>
						}
					/>
					<Area
						type="monotone"
						dataKey="value"
						stroke="var(--color-value)"
						fill={`url(#${gradientId})`}
						strokeWidth={2.2}
						activeDot={{
							r: 4,
							fill: "var(--color-value)",
							stroke: "#ffffff",
							strokeWidth: 2,
						}}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	)
}

function StatPill({
	label,
	value,
}: {
	label: string
	value: string
}) {
	return (
		<div className="rounded-xl bg-zinc-50 px-3.5 py-3">
			<div className="text-[11px] text-zinc-500">{label}</div>
			<div className="mt-1 text-2xl font-semibold text-zinc-950">{value}</div>
		</div>
	)
}

function UsageBreakdown({
	label,
	value,
}: {
	label: string
	value: string
}) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-zinc-500">{label}</span>
			<span className="font-medium text-zinc-950">{value}</span>
		</div>
	)
}

function ActivityHeatmap({
	days,
}: {
	days: ProfileSnapshot["heatmapDays"]
}) {
	const [mode, setMode] = useState<HeatmapMetric>("requests")

	const monthLabels = useMemo(
		() =>
			days
				.map((day, index) =>
					day.monthLabel ? { index, label: day.monthLabel } : null,
				)
				.filter(Boolean) as Array<{ index: number; label: string }>,
		[days],
	)

	const inRangeDays = useMemo(
		() => days.filter((day) => day.inTrailingWindow),
		[days],
	)

	const thresholds = useMemo(() => {
		const positiveValues = inRangeDays
			.map((day) => getMetricDayValue(day, mode))
			.filter((value) => value > 0)

		if (positiveValues.length === 0) return null

		return {
			low: getHeatmapQuantile(positiveValues, 0.25),
			medium: getHeatmapQuantile(positiveValues, 0.5),
			high: getHeatmapQuantile(positiveValues, 0.75),
		}
	}, [inRangeDays, mode])

	const totals = useMemo(() => {
		const values = inRangeDays.map((day) => getMetricDayValue(day, mode))
		const total = values.reduce((sum, value) => sum + value, 0)
		let currentStreak = 0

		for (let index = values.length - 1; index >= 0; index -= 1) {
			if ((values[index] ?? 0) > 0) {
				currentStreak += 1
			} else {
				break
			}
		}

		return {
			total,
			currentStreak,
			avgDay: total / 365,
			avgWeek: total / 52,
		}
	}, [inRangeDays, mode])

	return (
		<SectionShell>
			<SectionHeader
				title="Activity"
				description="Last 53 weeks of personal workspace activity."
				right={
					<div className="flex flex-wrap items-center justify-end gap-1.5" aria-label="Annual activity metric">
						{(["requests", "tokens", "spend"] as const).map((nextMode) => {
							const isActive = mode === nextMode
							return (
								<button
									key={nextMode}
									type="button"
									onClick={() => setMode(nextMode)}
									aria-pressed={isActive}
									className={[
										"h-7 rounded-lg px-3 text-[11px] font-medium transition-colors",
										isActive
											? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200"
											: "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
									].join(" ")}
								>
									{nextMode === "requests"
										? "Requests"
										: nextMode === "tokens"
											? "Tokens"
											: "Spend"}
								</button>
							)
						})}
					</div>
				}
			/>

			<div className="space-y-2.5 px-4 pb-4 sm:px-5">
				<div className="overflow-x-auto pb-1">
					<div className="min-w-[47rem] space-y-2">
						<div className="ml-6 grid grid-cols-[repeat(53,minmax(0,1fr))] gap-1 text-[10px] text-zinc-400">
							{Array.from({ length: 53 }).map((_, weekIndex) => {
								const label =
									monthLabels.find(
										(entry) => Math.floor(entry.index / 7) === weekIndex,
									)?.label ?? ""

								return (
									<div key={`month-${weekIndex}`} className="text-left">
										{label}
									</div>
								)
							})}
						</div>

						<div className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2.5">
							<div className="grid grid-rows-7 gap-1 text-[10px] text-zinc-400">
								{HEATMAP_ROW_LABELS.map((label, index) => (
									<div
										key={`weekday-${index}`}
										className="flex items-center"
									>
										{label}
									</div>
								))}
							</div>

							<div className="grid grid-flow-col grid-rows-7 gap-1">
								{days.map((day) => {
									const value = getMetricDayValue(day, mode)
									const level = getHeatmapLevel(value, thresholds)
									const label = getMetricLabel(mode)

									return (
										<Tooltip key={`${mode}-${day.date}`}>
											<TooltipTrigger asChild>
												<button
													type="button"
													className={`h-3.5 w-3.5 rounded-[4px] ${HEATMAP_LEVEL_CLASSES[level]} ${
														day.isFuture ? "opacity-45" : ""
													} appearance-none border-0 p-0`}
													aria-label={`${formatLongDate(day.date)} ${label} ${formatMetricValue(mode, value)}`}
												/>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={6}>
												<div className="space-y-1">
													<p className="font-medium">{formatLongDate(day.date)}</p>
													<p>
														{label}: {formatMetricValue(mode, value)}
													</p>
												</div>
											</TooltipContent>
										</Tooltip>
									)
								})}
							</div>
						</div>
					</div>
				</div>

				<div className="flex justify-end">
					<div className="flex items-center gap-2 text-[11px] text-zinc-500">
						<span>Less</span>
						<div className="flex items-center gap-1">
							{HEATMAP_LEVEL_CLASSES.map((levelClass, index) => (
								<div
									key={`legend-${index}`}
									className={`h-2.5 w-2.5 rounded-[3px] ${levelClass}`}
								/>
							))}
						</div>
						<span>More</span>
					</div>
				</div>

				<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
					<StatPill label="Current streak" value={`${totals.currentStreak} days`} />
					<StatPill
						label="Avg day"
						value={formatMetricValue(mode, totals.avgDay)}
					/>
					<StatPill
						label="Avg week"
						value={formatMetricValue(mode, totals.avgWeek)}
					/>
					<StatPill
						label="Total"
						value={formatMetricValue(mode, totals.total, true)}
					/>
				</div>
			</div>
		</SectionShell>
	)
}

export default function ProfileDashboard({
	profile,
	publicView = false,
}: Props) {
	const [activityRange, setActivityRange] = useState<ActivityRange>("7d")
	const [topModelsMetric, setTopModelsMetric] = useState<TopModelsMetric>("tokens")

	const activityPoints = useMemo(() => {
		if (activityRange === "1d") return profile.activitySeries30.slice(-1)
		if (activityRange === "30d") return profile.activitySeries30
		return profile.activitySeries30.slice(-7)
	}, [activityRange, profile.activitySeries30])

	const activityDescription = useMemo(() => {
		if (activityRange === "1d") {
			return "Personal workspace requests from today."
		}
		if (activityRange === "30d") {
			return "Personal workspace requests over the last 30 days."
		}
		return "Personal workspace requests over the last 7 days."
	}, [activityRange])

	const activityRequestsTotal = useMemo(
		() => activityPoints.reduce((sum, point) => sum + point.requests, 0),
		[activityPoints],
	)
	const activityTokensTotal = useMemo(
		() => activityPoints.reduce((sum, point) => sum + point.tokens, 0),
		[activityPoints],
	)

	const sortedTopModels = useMemo(() => {
		const models = [...profile.topModels]
		models.sort((left, right) => {
			if (topModelsMetric === "spend") {
				if (right.spendNanos !== left.spendNanos) {
					return right.spendNanos - left.spendNanos
				}
			} else if (topModelsMetric === "requests") {
				if (right.requests !== left.requests) {
					return right.requests - left.requests
				}
			} else if (right.tokens !== left.tokens) {
				return right.tokens - left.tokens
			}

			if (right.tokens !== left.tokens) return right.tokens - left.tokens
			return right.requests - left.requests
		})
		return models.slice(0, 5)
	}, [profile.topModels, topModelsMetric])

	return (
		<div className="space-y-2.5">
			<SectionShell>
				<div className="space-y-4 px-4 py-4 sm:px-5">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-4">
							<Avatar className="h-20 w-20 border border-zinc-200 bg-zinc-50">
								{profile.avatarUrl ? (
									<AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
								) : null}
								<AvatarFallback className="bg-zinc-100 text-lg font-semibold text-zinc-700">
									{getInitials(profile.displayName)}
								</AvatarFallback>
							</Avatar>

							<div>
								<h2 className="text-[1.85rem] font-semibold tracking-tight text-zinc-950">
									{profile.displayName}
								</h2>
								{publicView ? (
									<p className="mt-1 text-sm text-zinc-500">
										/{profile.publicProfileSlug}
									</p>
								) : profile.email ? (
									<p className="mt-1 text-sm text-zinc-500" data-pii="true">
										{profile.email}
									</p>
								) : null}
							</div>
						</div>

						{publicView ? (
							<div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
								<Link2 className="h-3.5 w-3.5" />
								Shared profile
							</div>
						) : null}
					</div>

					<div className="grid gap-3 border-t border-zinc-100 pt-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
						<div>
							<div className="text-[11px] text-zinc-500">Workspace</div>
							<div className="mt-1 font-medium text-zinc-950">
								{profile.workspaceName ?? "Personal"}
							</div>
						</div>
						<div>
							<div className="text-[11px] text-zinc-500">Member since</div>
							<div className="mt-1 font-medium text-zinc-950">
								{new Date(profile.memberSince).toLocaleDateString("en", {
									month: "short",
									year: "numeric",
								})}
							</div>
						</div>
						<div>
							<div className="text-[11px] text-zinc-500">Active days</div>
							<div className="mt-1 font-medium text-zinc-950">
								{profile.activeDays.toLocaleString()}
							</div>
						</div>
						<div>
							<div className="text-[11px] text-zinc-500">Avg week</div>
							<div className="mt-1 font-medium text-zinc-950">
								{profile.avgPerWeek.toFixed(1)} requests
							</div>
						</div>
					</div>
				</div>
			</SectionShell>

			<div className="min-w-0 space-y-2.5">
				<SectionShell>
					<SectionHeader
						title="Activity"
						description={activityDescription}
						right={
							<div className="flex flex-wrap items-center justify-end gap-2">
								{publicView ? (
									<span className="text-xs font-medium text-indigo-600">
										Shared view
									</span>
								) : (
									<Link
										href="/settings/usage"
										className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
									>
										All Activity
									</Link>
								)}
									<div className="flex items-center gap-1.5" aria-label="Activity time range">
										{(["1d", "7d", "30d"] as const).map((range) => {
											const isActive = activityRange === range
											return (
												<button
													key={range}
													type="button"
													onClick={() => setActivityRange(range)}
													aria-pressed={isActive}
													className={[
														"h-8 rounded-lg px-3.5 text-[11px] font-medium transition-colors",
														isActive
															? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200"
															: "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
													].join(" ")}
												>
													{range === "1d" ? "Today" : range}
												</button>
											)
										})}
									</div>
							</div>
						}
					/>

					<ActivitySeriesChart points={activityPoints} mode="requests" />

					<div className="flex items-end justify-between gap-4 border-t border-zinc-100 px-4 py-3.5 sm:px-5">
						<div>
							<div className="text-[11px] text-zinc-500">Longest streak</div>
							<div className="mt-1 text-3xl font-semibold text-zinc-950">
								{profile.longestStreak} days
							</div>
						</div>
						<div className="text-right">
							<div className="text-[11px] text-zinc-500">
								{ACTIVITY_RANGE_LABELS[activityRange]}
							</div>
							<div className="mt-1 text-2xl font-semibold text-zinc-950">
								{activityRequestsTotal.toLocaleString()}{" "}
								requests
							</div>
						</div>
					</div>
				</SectionShell>

				<div className="grid gap-2.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
					<SectionShell>
							<SectionHeader
								title="Tokens"
								right={
									<div className="flex items-center gap-2">
										<Badge
											variant="outline"
											className="rounded-full border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-500"
										>
											{ACTIVITY_RANGE_LABELS[activityRange]}
										</Badge>
										<Badge
											variant="secondary"
											className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-500"
										>
											{formatDelta(profile.tokenChange)}
										</Badge>
									</div>
								}
							/>

							<div className="px-4 pb-1 text-3xl font-semibold text-zinc-950 sm:px-5">
								{formatCompactNumber(activityTokensTotal)}
							</div>

						<ActivitySeriesChart points={activityPoints} mode="tokens" />
					</SectionShell>

					<SectionShell>
						<SectionHeader
							title="Top Models"
							right={
								<div className="flex items-center gap-2">
									<Select
										value={topModelsMetric}
										onValueChange={(nextValue) => {
											if (
												nextValue === "requests" ||
												nextValue === "tokens" ||
												nextValue === "spend"
											) {
												setTopModelsMetric(nextValue)
											}
										}}
									>
										<SelectTrigger className="h-8 w-[8.5rem] rounded-lg border-zinc-200 bg-white text-[11px] font-medium text-zinc-500 shadow-none">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="tokens">Tokens</SelectItem>
											<SelectItem value="spend">Spend</SelectItem>
											<SelectItem value="requests">Requests</SelectItem>
										</SelectContent>
									</Select>
									{publicView ? null : (
										<Link
											href="/models"
											className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
										>
											Explore
										</Link>
									)}
								</div>
							}
						/>

						<div className="px-4 pb-4 sm:px-5">
							{profile.topModels.length === 0 ? (
								<div className="rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
									No model activity recorded yet.
								</div>
							) : (
								<div className="space-y-1.5">
									{sortedTopModels.map((model, index) => (
										<div
											key={model.id}
											className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50"
										>
											<div className="text-sm font-semibold text-zinc-400">
												{index + 1}
											</div>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium text-zinc-950">
													{model.name}
												</p>
												<p className="text-xs text-zinc-500">
													{model.requests.toLocaleString()} requests
												</p>
											</div>
											<div className="text-right">
												<p className="text-sm font-semibold text-zinc-950">
													{formatTopModelMetricValue(topModelsMetric, model)}
												</p>
												<p className="text-xs text-zinc-500">
													{formatTopModelMetricLabel(topModelsMetric)}
												</p>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</SectionShell>
				</div>

				<ActivityHeatmap days={profile.heatmapDays} />

				<div className="grid gap-2.5 lg:grid-cols-2">
					<div className="rounded-[1.1rem] border border-zinc-200 bg-white px-4 py-4 sm:px-5">
						<div className="space-y-3">
							<div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
								<Flame className="h-4 w-4 text-zinc-400" />
								Credit Usage
							</div>
							<div className="space-y-2.5">
								<UsageBreakdown label="Today" value={profile.creditsUsage.today} />
								<UsageBreakdown
									label="This Week"
									value={profile.creditsUsage.week}
								/>
								<UsageBreakdown
									label="This Month"
									value={profile.creditsUsage.month}
								/>
							</div>
						</div>
					</div>

					<div className="rounded-[1.1rem] border border-zinc-200 bg-white px-4 py-4 sm:px-5">
						<div className="space-y-3">
							<div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
								<Link2 className="h-4 w-4 text-zinc-400" />
								BYOK Usage
							</div>
							<div className="space-y-2.5">
								<UsageBreakdown label="Today" value={profile.byokUsage.today} />
								<UsageBreakdown label="This Week" value={profile.byokUsage.week} />
								<UsageBreakdown
									label="This Month"
									value={profile.byokUsage.month}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
