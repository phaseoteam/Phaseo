"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Camera, ExternalLink, Flame } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { ProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot"
import { formatCompactNumber, formatUsdFromNanos } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Logo } from "@/components/Logo"
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
	actions?: ReactNode
}

type TimeRange = "today" | "7d" | "30d" | "1y" | "all"
type Metric = "tokens" | "spend" | "requests"

const RANGE_LABELS: Record<TimeRange, string> = {
	today: "Today",
	"7d": "Last 7 Days",
	"30d": "Last 30 Days",
	"1y": "Last Year",
	all: "All Time",
}

const HEATMAP_LEVEL_CLASSES = [
	"bg-zinc-100",
	"bg-indigo-100",
	"bg-indigo-200",
	"bg-indigo-400",
	"bg-indigo-600",
]

const WEEKDAY_LABELS = ["M", "", "W", "", "F", "", ""]

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("")
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

function formatWeekday(date: string): string {
	return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en", {
		weekday: "long",
		timeZone: "UTC",
	})
}

function getSeriesForRange(
	profile: ProfileSnapshot,
	range: TimeRange,
): ProfileSnapshot["activitySeries30"] {
	if (range === "today") return profile.activitySeries30.slice(-1)
	if (range === "7d") return profile.activitySeries30.slice(-7)
	if (range === "30d") return profile.activitySeries30
	return profile.heatmapDays
		.filter((day) => day.inTrailingWindow && !day.isFuture)
		.map((day) => ({
			date: day.date,
			requests: day.requests,
			tokens: day.tokens,
			spendNanos: day.spendNanos,
		}))
}

function getMetricValue(
	point: Pick<ProfileSnapshot["activitySeries30"][number], "requests" | "tokens" | "spendNanos">,
	metric: Metric,
) {
	if (metric === "requests") return point.requests
	if (metric === "spend") return point.spendNanos / 1_000_000_000
	return point.tokens
}

function formatMetricValue(metric: Metric, value: number, compact = true): string {
	if (metric === "spend") {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			notation: value >= 1000 && compact ? "compact" : "standard",
			maximumFractionDigits: value >= 100 ? 0 : value >= 1 ? 2 : 4,
		}).format(value)
	}

	return compact ? formatCompactNumber(value) : value.toLocaleString()
}

function getProviderFromModelId(id: string): string {
	const provider = id.includes("/") ? id.split("/")[0] : ""
	return provider || "ai-stats"
}

function formatProviderName(provider: string): string {
	const normalized = provider.trim().toLowerCase()
	const known: Record<string, string> = {
		"ai-stats": "AI Stats",
		anthropic: "Anthropic",
		deepseek: "DeepSeek",
		google: "Google",
		meta: "Meta",
		mistral: "Mistral AI",
		openai: "OpenAI",
		openrouter: "OpenRouter",
		xai: "xAI",
		"x-ai": "xAI",
	}

	return (
		known[normalized] ??
		normalized
			.split(/[-_\s]+/)
			.filter(Boolean)
			.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
			.join(" ")
	)
}

function ProviderMark({ provider, label }: { provider: string; label: string }) {
	return (
		<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white p-1">
			<Logo
				id={provider}
				alt={`${label} logo`}
				width={18}
				height={18}
				className="h-4.5 w-4.5 object-contain"
				fallbackToColor={false}
				fallback={
					<span className="text-[9px] font-semibold uppercase text-zinc-500">
						{label.slice(0, 2)}
					</span>
				}
			/>
		</div>
	)
}

function getHeatmapLevel(value: number, max: number): number {
	if (value <= 0 || max <= 0) return 0
	const ratio = value / max
	if (ratio <= 0.25) return 1
	if (ratio <= 0.5) return 2
	if (ratio <= 0.75) return 3
	return 4
}

function ActivityHeatmap({
	profile,
	metric,
}: {
	profile: ProfileSnapshot
	metric: Metric
}) {
	const days = profile.heatmapDays
	const activeDays = days.filter((day) => day.inTrailingWindow && !day.isFuture)
	const values = activeDays.map((day) => getMetricValue(day, metric))
	const total = values.reduce((sum, value) => sum + value, 0)
	const max = Math.max(0, ...values)
	const avgDay = total / Math.max(1, activeDays.length)
	const avgWeek = total / 52
	const nonZeroDays = activeDays.filter((day) => getMetricValue(day, metric) > 0)
	const biggestDay = nonZeroDays.reduce<
		(ProfileSnapshot["heatmapDays"][number] & { metricValue: number }) | null
	>((best, day) => {
		const metricValue = getMetricValue(day, metric)
		if (!best || metricValue > best.metricValue) {
			return { ...day, metricValue }
		}
		return best
	}, null)
	const weekdayTotals = activeDays.reduce<Record<string, number>>((acc, day) => {
		const weekday = formatWeekday(day.date)
		acc[weekday] = (acc[weekday] ?? 0) + getMetricValue(day, metric)
		return acc
	}, {})
	const mostActiveWeekday =
		Object.entries(weekdayTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No activity yet"
	const topModel = profile.topModels[0]
	const topModelValue = topModel
		? metric === "spend"
			? topModel.spendNanos / 1_000_000_000
			: metric === "requests"
				? topModel.requests
				: topModel.tokens
		: 0
	const topModelShare = total > 0 ? Math.round((topModelValue / total) * 100) : 0

	const monthLabels = days
		.map((day, index) => (day.monthLabel ? { index, label: day.monthLabel } : null))
		.filter(Boolean) as Array<{ index: number; label: string }>

	return (
		<section className="min-w-0 overflow-hidden border-t border-zinc-200 pt-6">
			<div className="mb-4 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold text-zinc-950">Activity</h2>
				</div>
				<div className="text-sm text-zinc-500">
					{metric === "tokens" ? "Tokens" : metric === "spend" ? "Spend" : "Requests"}
				</div>
			</div>

			<div className="mb-5 grid max-w-3xl grid-cols-4 divide-x divide-zinc-200 text-sm">
				<div className="pr-6">
					<div className="flex items-center gap-1.5 text-zinc-500">
						<Flame className="h-3.5 w-3.5" />
						<span>Streak</span>
					</div>
					<div className="mt-1 text-base font-semibold text-zinc-950">
						{profile.currentStreak.toLocaleString()} days
					</div>
					<div className="mt-0.5 text-xs text-zinc-500">
						Best {profile.longestStreak.toLocaleString()}
					</div>
				</div>
				<div className="px-6">
						<div className="text-zinc-500">Avg / day</div>
						<div className="mt-1 text-base font-semibold text-zinc-950">
							{formatMetricValue(metric, avgDay)}
						</div>
				</div>
				<div className="px-6">
					<div className="text-zinc-500">Avg / week</div>
					<div className="mt-1 text-base font-semibold text-zinc-950">
						{formatMetricValue(metric, avgWeek)}
					</div>
				</div>
				<div className="pl-6">
					<div className="text-zinc-500">Total</div>
					<div className="mt-1 text-base font-semibold text-zinc-950">
						{formatMetricValue(metric, total)}
					</div>
				</div>
			</div>

			<div className="w-full max-w-full overflow-hidden pb-1">
				<div className="w-full">
					<div className="ml-5 grid grid-cols-[repeat(53,1fr)] gap-1 text-[10px] text-zinc-400">
						{Array.from({ length: 53 }).map((_, weekIndex) => {
							const label =
								monthLabels.find(
									(entry) => Math.floor(entry.index / 7) === weekIndex,
								)?.label ?? ""
							return <div key={`month-${weekIndex}`}>{label}</div>
						})}
					</div>

					<div className="mt-1 grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2">
						<div className="grid grid-rows-7 gap-1 text-[10px] text-zinc-500">
							{WEEKDAY_LABELS.map((label, index) => (
								<div key={`${label}-${index}`} className="flex h-3.5 items-center">
									{label}
								</div>
							))}
						</div>

						<div className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-1 overflow-hidden">
							{days.map((day) => {
								const value = getMetricValue(day, metric)
								const level = getHeatmapLevel(value, max)
								return (
									<Tooltip key={`${metric}-${day.date}`}>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={`aspect-square w-full min-w-0 rounded-[4px] ${HEATMAP_LEVEL_CLASSES[level]} ${
													day.isFuture ? "opacity-40" : ""
												}`}
												aria-label={`${formatLongDate(day.date)} ${formatMetricValue(metric, value)}`}
											/>
										</TooltipTrigger>
										<TooltipContent>
											<div className="space-y-1">
												<p className="font-medium">{formatLongDate(day.date)}</p>
												<p>{formatMetricValue(metric, value, false)}</p>
											</div>
										</TooltipContent>
									</Tooltip>
								)
							})}
						</div>
					</div>
				</div>
			</div>

			<div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
				<span>Less</span>
				<div className="flex items-center gap-1">
					{HEATMAP_LEVEL_CLASSES.map((levelClass, index) => (
						<div
							key={levelClass}
							className={`h-2.5 w-2.5 rounded-[3px] ${levelClass}`}
							aria-label={`Activity level ${index}`}
						/>
					))}
				</div>
				<span>More</span>
			</div>

			<div className="mt-8 grid gap-10 lg:grid-cols-2">
				<div>
					<h3 className="text-sm font-semibold text-zinc-950">Activity insights</h3>
					<div className="mt-3 space-y-3 text-sm">
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Biggest day</span>
							<span className="text-right font-medium text-zinc-950">
								{biggestDay
									? `${formatLongDate(biggestDay.date)} · ${formatMetricValue(
											metric,
											biggestDay.metricValue,
										)}`
									: "No activity yet"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Most active weekday</span>
							<span className="font-medium text-zinc-950">{mostActiveWeekday}</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Active days</span>
							<span className="font-medium text-zinc-950">
								{nonZeroDays.length.toLocaleString()} of {activeDays.length.toLocaleString()}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Quiet days</span>
							<span className="font-medium text-zinc-950">
								{Math.max(0, activeDays.length - nonZeroDays.length).toLocaleString()}
							</span>
						</div>
					</div>
				</div>

				<div>
					<h3 className="text-sm font-semibold text-zinc-950">Usage notes</h3>
					<div className="mt-3 space-y-3 text-sm">
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Most used model</span>
							<span className="max-w-[14rem] truncate text-right font-medium text-zinc-950">
								{topModel?.name ?? "No model activity"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Top model share</span>
							<span className="font-medium text-zinc-950">
								{topModel ? `${topModelShare}%` : "0%"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-zinc-500">Models used</span>
							<span className="font-medium text-zinc-950">
								{profile.topModels.length.toLocaleString()}
							</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}

export default function ProfileDashboard({
	profile,
	publicView = false,
	actions,
}: Props) {
	const [range, setRange] = useState<TimeRange>("all")
	const [metric, setMetric] = useState<Metric>("tokens")

	const chartPoints = useMemo(() => {
		const points = getSeriesForRange(profile, range)
		return points.map((point) => ({
			date: point.date,
			value: getMetricValue(point, metric),
			raw: point,
		}))
	}, [profile, range, metric])

	const total = chartPoints.reduce((sum, point) => sum + point.value, 0)
	const previous =
		metric === "tokens" ? profile.tokenChange : metric === "requests" ? profile.requestChange : null
	const topModels = useMemo(() => {
		return [...profile.topModels]
			.sort((left, right) => {
				if (metric === "spend") return right.spendNanos - left.spendNanos
				if (metric === "requests") return right.requests - left.requests
				return right.tokens - left.tokens
			})
			.slice(0, 5)
	}, [profile.topModels, metric])
	const topModelMax = Math.max(
		1,
		...topModels.map((model) =>
			metric === "spend"
				? model.spendNanos
				: metric === "requests"
					? model.requests
					: model.tokens,
		),
	)

	return (
		<div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
			<header className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="relative">
						<Avatar className="h-14 w-14 border border-zinc-200 bg-zinc-50">
							{profile.avatarUrl ? (
								<AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
							) : null}
							<AvatarFallback className="bg-zinc-100 font-semibold text-zinc-700">
								{getInitials(profile.displayName)}
							</AvatarFallback>
						</Avatar>
						{publicView ? null : (
							<button
								type="button"
								className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm"
								aria-label="Change profile photo"
							>
								<Camera className="h-3 w-3" />
							</button>
						)}
					</div>
					<div>
						<h1 className="text-base font-semibold text-zinc-950">
							{profile.displayName}
						</h1>
						{publicView ? (
							<p className="text-sm text-zinc-500">/{profile.publicProfileSlug}</p>
						) : profile.email ? (
							<p className="text-sm text-zinc-500" data-pii="true">
								{profile.email}
							</p>
						) : null}
					</div>
				</div>
				{actions}
			</header>

			<section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="min-w-0">
					<div className="mb-4 flex flex-wrap items-center gap-3">
						<h2 className="mr-2 text-lg font-semibold text-zinc-950">
							Usage summary
						</h2>
						<Select value={range} onValueChange={(value) => setRange(value as TimeRange)}>
							<SelectTrigger className="h-8 w-36 rounded-lg border-zinc-200 bg-white text-xs shadow-none">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(RANGE_LABELS).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="inline-flex rounded-lg bg-zinc-100 p-1">
							{(["tokens", "spend", "requests"] as const).map((nextMetric) => (
								<button
									key={nextMetric}
									type="button"
									onClick={() => setMetric(nextMetric)}
									className={[
										"h-7 rounded-md px-4 text-xs font-medium transition-colors",
										metric === nextMetric
											? "bg-white text-zinc-950 shadow-sm"
											: "text-zinc-600 hover:text-zinc-950",
									].join(" ")}
								>
									{nextMetric === "tokens"
										? "Tokens"
										: nextMetric === "spend"
											? "Spend"
											: "Requests"}
								</button>
							))}
						</div>
					</div>

					<div className="grid min-w-0 gap-3">
						<div className="w-fit">
							<div className="text-xs text-zinc-500">
								{metric === "tokens" ? "Tokens" : metric === "spend" ? "Spend" : "Requests"} ·{" "}
								{RANGE_LABELS[range].toLowerCase()}
							</div>
							<div className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
								{formatMetricValue(metric, total)}
							</div>
							<div className="mt-1 text-sm text-zinc-500">
								{previous == null
									? "No prior data"
									: `${previous > 0 ? "+" : ""}${Math.round(previous)}% vs prior`}
							</div>
						</div>

						<ChartContainer
							config={{
								value: {
									label:
										metric === "tokens"
											? "Tokens"
											: metric === "spend"
												? "Spend"
												: "Requests",
									color: "#8b5cf6",
								},
							}}
							className="h-[18rem] min-w-0 w-full"
						>
							<BarChart data={chartPoints} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis
									dataKey="date"
									tickLine={false}
									axisLine={false}
									minTickGap={28}
									tickMargin={8}
									tickFormatter={(value) => formatShortDate(String(value))}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									width={52}
									tickFormatter={(value) => formatMetricValue(metric, Number(value))}
								/>
								<ChartTooltip
									cursor={{ fill: "rgba(24,24,27,0.06)" }}
									content={
										<ChartTooltipContent
											hideIndicator
											labelFormatter={(label) => formatLongDate(String(label))}
											formatter={(value) => (
												<span className="font-mono font-semibold tabular-nums text-zinc-950">
													{formatMetricValue(metric, Number(value), false)}
												</span>
											)}
										/>
									}
								/>
								<Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
							</BarChart>
						</ChartContainer>
					</div>
				</div>

				<aside className="min-w-0 border-l border-zinc-200 pl-5">
					<div className="mb-5 flex items-center justify-between">
						<div className="flex items-baseline gap-2">
							<h2 className="text-lg font-semibold text-zinc-950">Top models</h2>
							<span className="text-sm text-zinc-500">
								by {metric === "tokens" ? "tokens" : metric === "spend" ? "spend" : "requests"}
							</span>
						</div>
						{publicView ? null : (
							<Link
								href="/settings/usage/overview"
								className="text-xs font-medium text-zinc-600 hover:text-zinc-950"
							>
								View all usage <ExternalLink className="ml-1 inline h-3 w-3" />
							</Link>
						)}
					</div>

					<div className="space-y-4">
						{topModels.length === 0 ? (
							<div className="rounded-lg bg-zinc-50 px-3 py-4 text-sm text-zinc-500">
								No model activity recorded yet.
							</div>
						) : (
							topModels.map((model) => {
								const value =
									metric === "spend"
										? model.spendNanos
										: metric === "requests"
											? model.requests
											: model.tokens
								const provider = getProviderFromModelId(model.id)
								const providerName = formatProviderName(provider)
								return (
									<div key={model.id} className="space-y-2">
										<div className="flex items-center gap-3">
											<ProviderMark provider={provider} label={providerName} />
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium text-zinc-950">
													{model.name}
												</div>
												<div className="truncate text-xs text-zinc-500">
													{providerName}
												</div>
											</div>
											<div className="text-sm font-semibold tabular-nums text-zinc-950">
												{metric === "spend"
													? formatUsdFromNanos(model.spendNanos)
													: formatCompactNumber(value)}
											</div>
										</div>
										<div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
											<div
												className="h-full rounded-full bg-zinc-800"
												style={{
													width: `${Math.max(3, (value / topModelMax) * 100)}%`,
												}}
											/>
										</div>
									</div>
								)
							})
						)}
					</div>
				</aside>
			</section>

			<ActivityHeatmap profile={profile} metric={metric} />
		</div>
	)
}
