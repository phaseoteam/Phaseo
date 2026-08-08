"use client"

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Camera, ExternalLink, Flame, LoaderCircle } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import type { ProfileSnapshot } from "@/lib/fetchers/profile/types"
import { formatCompactNumber, formatUsdFromNanos } from "@/lib/profile"
import { buildProfileShareCardPayload } from "@/lib/profileShare"
import { getModelDetailsHref } from "@/lib/models/modelHref"
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"
import ProfileShareControls from "@/components/(gateway)/settings/profile/ProfileShareControls"
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
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
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

const METRIC_HSL: Record<Metric, string> = {
	tokens: "199 89% 48%",
	requests: "350 68% 48%",
	spend: "262 83% 58%",
}

const HEATMAP_LEVEL_OPACITIES = [0, 0.16, 0.32, 0.58, 1]

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]

function getMetricColor(metric: Metric, opacity = 1): string {
	return `hsl(${METRIC_HSL[metric]} / ${opacity})`
}

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

function getModelsForRange(
	profile: ProfileSnapshot,
	range: TimeRange,
): ProfileSnapshot["topModels"] {
	const dates = new Set(getSeriesForRange(profile, range).map((point) => point.date))
	const models = new Map<string, ProfileSnapshot["topModels"][number]>()
	const modelActivity = profile.modelActivity
	if (!modelActivity) return [...profile.topModels]

	for (const entry of modelActivity) {
		if (!dates.has(entry.date)) continue
		const model = models.get(entry.id) ?? {
			id: entry.id,
			name: entry.name,
			requests: 0,
			tokens: 0,
			spendNanos: 0,
		}
		model.requests += entry.requests
		model.tokens += entry.tokens
		model.spendNanos += entry.spendNanos
		models.set(entry.id, model)
	}

	return [...models.values()]
}

function getLongestStreak(points: ProfileSnapshot["activitySeries30"]): number {
	let longest = 0
	let current = 0
	for (const point of points) {
		current = point.requests > 0 ? current + 1 : 0
		longest = Math.max(longest, current)
	}
	return longest
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
	return provider || "phaseo"
}

function formatProviderName(provider: string): string {
	const normalized = provider.trim().toLowerCase()
	const known: Record<string, string> = {
		"phaseo": "Phaseo",
		anthropic: "Anthropic",
		deepseek: "DeepSeek",
		google: "Google",
		meta: "Meta",
		mistral: "Mistral AI",
		openai: "OpenAI",
		openrouter: "OpenRouter",
		xai: "SpaceXAI",
		"spacex-ai": "SpaceXAI",
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
		<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background p-1">
			<Logo
				id={provider}
				alt={`${label} logo`}
				width={18}
				height={18}
				className="h-4.5 w-4.5 object-contain"
				fallbackToColor={false}
				fallback={
					<span className="text-[9px] font-semibold uppercase text-muted-foreground">
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
		<section className="min-w-0 border-t border-border pt-6">
			<div className="mb-4 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold text-foreground">Activity</h2>
				</div>
				<div className="text-sm text-muted-foreground">
					{metric === "tokens" ? "Tokens" : metric === "spend" ? "Spend" : "Requests"}
				</div>
			</div>

			<div className="mb-5 grid max-w-3xl grid-cols-2 gap-y-5 text-sm sm:grid-cols-4 sm:divide-x sm:divide-border">
				<div className="pr-4 sm:pr-6">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Flame className="h-3.5 w-3.5" />
						<span>Streak</span>
					</div>
					<div className="mt-1 text-base font-semibold text-foreground">
						{profile.currentStreak.toLocaleString()} days
					</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						Best {profile.longestStreak.toLocaleString()}
					</div>
				</div>
				<div className="pl-4 sm:px-6">
						<div className="text-muted-foreground">Avg / day</div>
						<div className="mt-1 text-base font-semibold text-foreground">
							{formatMetricValue(metric, avgDay)}
						</div>
				</div>
				<div className="pr-4 sm:px-6">
					<div className="text-muted-foreground">Avg / week</div>
					<div className="mt-1 text-base font-semibold text-foreground">
						{formatMetricValue(metric, avgWeek)}
					</div>
				</div>
				<div className="pl-4 sm:pl-6">
					<div className="text-muted-foreground">Total</div>
					<div className="mt-1 text-base font-semibold text-foreground">
						{formatMetricValue(metric, total)}
					</div>
				</div>
			</div>

			<ScrollArea
				scrollBarOrientation="horizontal"
				keepScrollbarMounted
				className="w-full max-w-full"
				viewportClassName="pb-3"
			>
				<div className="min-w-[44rem]">
					<div className="ml-5 grid grid-cols-[repeat(53,1fr)] gap-1 text-[10px] text-muted-foreground/70">
						{Array.from({ length: 53 }).map((_, weekIndex) => {
							const label =
								monthLabels.find(
									(entry) => Math.floor(entry.index / 7) === weekIndex,
								)?.label ?? ""
							return <div key={`month-${weekIndex}`}>{label}</div>
						})}
					</div>

					<div className="mt-1 grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2">
						<div className="grid grid-rows-7 gap-1 text-[10px] text-muted-foreground">
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
												data-activity-cell
												className={`aspect-square w-full min-w-0 rounded-xs ${level === 0 ? "bg-muted" : ""} ${
													day.isFuture ? "opacity-40" : ""
												}`}
												style={level === 0 ? undefined : { backgroundColor: getMetricColor(metric, HEATMAP_LEVEL_OPACITIES[level]) }}
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
			</ScrollArea>

			<div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
				<span>Less</span>
				<div className="flex items-center gap-1">
					{HEATMAP_LEVEL_OPACITIES.map((opacity, index) => (
						<div
							key={opacity}
							className={`h-2.5 w-2.5 rounded-xs ${index === 0 ? "bg-muted" : ""}`}
							style={index === 0 ? undefined : { backgroundColor: getMetricColor(metric, opacity) }}
							aria-label={`Activity level ${index}`}
						/>
					))}
				</div>
				<span>More</span>
			</div>

			<div className="mt-8 grid gap-10 lg:grid-cols-2">
				<div>
					<h3 className="text-sm font-semibold text-foreground">Activity Insights</h3>
					<div className="mt-3 space-y-3 text-sm">
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Biggest day</span>
							<span className="text-right font-medium text-foreground">
								{biggestDay
									? `${formatLongDate(biggestDay.date)} · ${formatMetricValue(
											metric,
											biggestDay.metricValue,
										)}`
									: "No activity yet"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Most active weekday</span>
							<span className="font-medium text-foreground">{mostActiveWeekday}</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Active days</span>
							<span className="font-medium text-foreground">
								{nonZeroDays.length.toLocaleString()} of {activeDays.length.toLocaleString()}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Quiet days</span>
							<span className="font-medium text-foreground">
								{Math.max(0, activeDays.length - nonZeroDays.length).toLocaleString()}
							</span>
						</div>
					</div>
				</div>

				<div>
					<h3 className="text-sm font-semibold text-foreground">Usage Notes</h3>
					<div className="mt-3 space-y-3 text-sm">
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Most used model</span>
							<span className="max-w-[14rem] truncate text-right font-medium text-foreground">
								{topModel?.name ?? "No model activity"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Top model share</span>
							<span className="font-medium text-foreground">
								{topModel ? `${topModelShare}%` : "0%"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Models used</span>
							<span className="font-medium text-foreground">
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
	const router = useRouter()
	const avatarInputRef = useRef<HTMLInputElement>(null)
	const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl)
	const [avatarUploading, setAvatarUploading] = useState(false)
	const [range, setRange] = useState<TimeRange>("30d")
	const [metric, setMetric] = useState<Metric>("tokens")

	async function updateProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		if (!file) return
		if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
			toast.error("Choose a JPG, PNG, or WebP image.")
			event.target.value = ""
			return
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error("Profile photos must be 5 MB or smaller.")
			event.target.value = ""
			return
		}

		setAvatarUploading(true)
		try {
			const accessToken = await getBrowserAccessToken()
			const response = await fetch("/api/account/settings/profile/avatar", {
				method: "POST",
				body: file,
				headers: {
					Accept: "application/json",
					"Content-Type": file.type,
					...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
				},
			})
			const payload = (await response.json().catch(() => ({}))) as {
				avatarUrl?: string
				error?: string
			}
			if (!response.ok || !payload.avatarUrl) {
				const message = payload.error === "profile_photo_too_large"
					? "Profile photos must be 5 MB or smaller."
					: ["invalid_profile_photo", "unsupported_profile_photo", "empty_profile_photo"].includes(payload.error ?? "")
						? "Choose a valid JPG, PNG, or WebP image."
						: "Could not update profile photo"
				throw new Error(message)
			}
			const nextAvatarUrl = payload.avatarUrl

			setAvatarUrl(nextAvatarUrl)
			toast.success("Profile photo updated")
			router.refresh()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not update profile photo")
		} finally {
			setAvatarUploading(false)
			event.target.value = ""
		}
	}

	const selectedSeries = useMemo(() => getSeriesForRange(profile, range), [profile, range])
	const chartPoints = useMemo(() => {
		return selectedSeries.map((point) => ({
			date: point.date,
			value: getMetricValue(point, metric),
			raw: point,
		}))
	}, [selectedSeries, metric])
	const sharePayload = useMemo(() => {
		const totalRequests = selectedSeries.reduce((sum, point) => sum + point.requests, 0)
		const totalTokens = selectedSeries.reduce((sum, point) => sum + point.tokens, 0)
		return buildProfileShareCardPayload(profile, {
			periodLabel: RANGE_LABELS[range],
			totalRequests,
			totalTokens,
			longestStreak: getLongestStreak(selectedSeries),
			avgPerWeek: totalRequests / Math.max(1, selectedSeries.length / 7),
		})
	}, [profile, range, selectedSeries])

	const total = chartPoints.reduce((sum, point) => sum + point.value, 0)
	const previous =
		metric === "tokens" ? profile.tokenChange : metric === "requests" ? profile.requestChange : null
	const topModels = useMemo(() => {
		return getModelsForRange(profile, range)
			.sort((left, right) => {
				if (metric === "spend") return right.spendNanos - left.spendNanos
				if (metric === "requests") return right.requests - left.requests
				return right.tokens - left.tokens
			})
			.slice(0, 5)
	}, [profile, range, metric])
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
				<div className="flex min-w-0 items-center gap-3">
					<div className="relative">
						<Avatar className="h-14 w-14 border border-border bg-muted">
							{avatarUrl ? (
								<AvatarImage src={avatarUrl} alt={profile.displayName} />
							) : null}
							<AvatarFallback className="bg-muted font-semibold text-muted-foreground">
								{getInitials(profile.displayName)}
							</AvatarFallback>
						</Avatar>
						{publicView ? null : (
							<button
								type="button"
								className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-70"
								aria-label={avatarUploading ? "Uploading profile photo" : "Change profile photo"}
								disabled={avatarUploading}
								onClick={() => avatarInputRef.current?.click()}
							>
								{avatarUploading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
							</button>
						)}
						{publicView ? null : (
							<input
								ref={avatarInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								className="sr-only"
								onChange={updateProfilePhoto}
							/>
						)}
					</div>
					<div className="min-w-0">
						<h1 className="text-base font-semibold text-foreground">
							{profile.displayName}
						</h1>
						{publicView ? (
							<p className="text-sm text-muted-foreground">/{profile.publicProfileSlug}</p>
						) : profile.email ? (
							<p className="truncate text-sm text-muted-foreground" data-pii="true">
								{profile.email}
							</p>
						) : null}
					</div>
				</div>
				{publicView ? actions : <ProfileShareControls payload={sharePayload} />}
			</header>

			<section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="min-w-0">
					<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<h2 className="mr-2 text-lg font-semibold text-foreground">
							Usage Summary
						</h2>
						<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
							<Select value={range} onValueChange={(value) => setRange(value as TimeRange)}>
								<SelectTrigger className="h-8 w-full rounded-lg border-border bg-input/50 text-xs text-foreground shadow-none sm:w-36">
									<span data-slot="select-value">{RANGE_LABELS[range]}</span>
								</SelectTrigger>
								<SelectContent>
									{Object.entries(RANGE_LABELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="grid h-8 grid-cols-3 rounded-lg bg-muted/70 p-0.5 sm:inline-flex">
							{(["tokens", "spend", "requests"] as const).map((nextMetric) => (
								<button
									key={nextMetric}
									type="button"
									onClick={() => setMetric(nextMetric)}
									className={[
										"h-7 rounded-md px-3 text-xs font-medium transition-colors sm:px-4",
										metric === nextMetric
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
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
					</div>

					<div className="grid min-w-0 gap-3">
						<div className="w-fit">
							<div className="text-xs text-muted-foreground">
								{metric === "tokens" ? "Tokens" : metric === "spend" ? "Spend" : "Requests"} ·{" "}
								{RANGE_LABELS[range].toLowerCase()}
							</div>
							<div className="mt-1 text-4xl font-semibold tracking-tight text-foreground">
								{formatMetricValue(metric, total)}
							</div>
							<div className="mt-1 text-sm text-muted-foreground">
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
									color: getMetricColor(metric),
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
												<span className="font-mono font-semibold tabular-nums text-foreground">
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

				<aside className="min-w-0 border-t border-border pt-5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5">
					<div className="mb-5 min-w-0">
						<div className="flex items-center justify-between gap-4">
							<h2 className="text-lg font-semibold text-foreground">Top Models</h2>
							{publicView ? null : (
								<Button asChild variant="ghost" size="xs" className="-mr-2 rounded-lg text-muted-foreground">
									<Link href="/settings/usage/overview">
										Open workspace usage <ExternalLink className="h-3 w-3" />
									</Link>
								</Button>
							)}
						</div>
						<div className="mt-0.5 text-sm text-muted-foreground">
							by {metric === "tokens" ? "tokens" : metric === "spend" ? "spend" : "requests"}
						</div>
					</div>

					<div className="space-y-4">
						{topModels.length === 0 ? (
							<div className="rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
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
								const modelHref = getModelDetailsHref(null, model.id)
								const modelSummary = (
									<div className="flex items-center gap-3">
										<ProviderMark provider={provider} label={providerName} />
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium text-foreground group-hover/model:underline">
												{model.name}
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{providerName}
											</div>
										</div>
										<div className="text-sm font-semibold tabular-nums text-foreground">
											{metric === "spend"
												? formatUsdFromNanos(model.spendNanos)
												: formatCompactNumber(value)}
										</div>
									</div>
								)
								return (
									<div key={model.id} className="space-y-2">
										{modelHref ? <Link href={modelHref} className="group/model block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30">{modelSummary}</Link> : modelSummary}
										<div className="h-1.5 overflow-hidden rounded-full bg-muted">
											<div
										className="h-full rounded-full"
										style={{
											width: `${Math.max(3, (value / topModelMax) * 100)}%`,
											backgroundColor: getMetricColor(metric),
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
