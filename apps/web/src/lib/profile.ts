export type DailyActivityPoint = {
	date: string
	requests: number
	tokens: number
	spendNanos: number
}

export type DailyUsageTotals = {
	requests: number
	tokens: number
	spendNanos: number
}

export type HeatmapDay = {
	date: string
	requests: number
	tokens: number
	spendNanos: number
	monthLabel: string | null
	weekdayLabel: string | null
	inTrailingWindow: boolean
	isFuture: boolean
}

function slugifySegment(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

export function buildPublicProfileSlug(
	displayName: string | null | undefined,
	userId: string,
): string {
	const base = slugifySegment(displayName ?? "") || "profile"
	const suffix = userId.replace(/-/g, "").slice(0, 8).toLowerCase()
	return `${base.slice(0, 40)}-${suffix}`
}

export function toUtcDateKey(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value
	const year = date.getUTCFullYear()
	const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
	const day = `${date.getUTCDate()}`.padStart(2, "0")
	return `${year}-${month}-${day}`
}

export function shiftUtcDays(value: Date, days: number): Date {
	const next = new Date(value)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

export function buildDailyActivitySeries(
	dayTotals: Map<string, { requests: number; tokens: number; spendNanos?: number }>,
	days: number,
	now: Date = new Date(),
): DailyActivityPoint[] {
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
	return Array.from({ length: days }, (_, index) => {
		const date = shiftUtcDays(today, index - (days - 1))
		const key = toUtcDateKey(date)
		const totals = dayTotals.get(key)
		return {
			date: key,
			requests: totals?.requests ?? 0,
			tokens: totals?.tokens ?? 0,
			spendNanos: totals?.spendNanos ?? 0,
		}
	})
}

export function calculateStreaks(
	points: Array<{ requests: number }>,
): { current: number; longest: number; activeDays: number } {
	let current = 0
	let longest = 0
	let running = 0
	let activeDays = 0

	for (const point of points) {
		if (point.requests > 0) {
			running += 1
			activeDays += 1
			longest = Math.max(longest, running)
		} else {
			running = 0
		}
	}

	for (let index = points.length - 1; index >= 0; index -= 1) {
		if (points[index]?.requests > 0) {
			current += 1
		} else {
			break
		}
	}

	return { current, longest, activeDays }
}

export function calculatePeriodChange(current: number, previous: number): number | null {
	if (current === 0 && previous === 0) return null
	if (previous === 0) return 100
	return ((current - previous) / previous) * 100
}

export function formatCompactNumber(value: number): string {
	return new Intl.NumberFormat("en", {
		maximumFractionDigits: value >= 100 ? 0 : 1,
		notation: value >= 1000 ? "compact" : "standard",
	}).format(value)
}

export function formatUsdFromNanos(nanos: number): string {
	return `$${(nanos / 1_000_000_000).toFixed(4)}`
}

export function buildHeatmapDays(
	dayTotals: Map<string, { requests: number; tokens: number; spendNanos?: number }>,
	now: Date = new Date(),
	weeks: number = 53,
): HeatmapDay[] {
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
	const todayKey = toUtcDateKey(today)
	const trailingStartKey = toUtcDateKey(shiftUtcDays(today, -364))
	const endOffset = (7 - today.getUTCDay()) % 7
	const gridEnd = shiftUtcDays(today, endOffset)
	const gridStart = shiftUtcDays(gridEnd, -(weeks * 7) + 1)

	const days: HeatmapDay[] = []
	let previousMonth = ""

	for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = shiftUtcDays(cursor, 1)) {
		const key = toUtcDateKey(cursor)
		const totals = dayTotals.get(key)
		const requests = totals?.requests ?? 0
		const tokens = totals?.tokens ?? 0
		const spendNanos = totals?.spendNanos ?? 0
		const month = cursor.toLocaleString("en", { month: "short", timeZone: "UTC" })
		const isMonthAnchor = cursor.getUTCDate() <= 7 && month !== previousMonth

		days.push({
			date: key,
			requests,
			tokens,
			spendNanos,
			monthLabel: isMonthAnchor ? month : null,
			weekdayLabel:
				cursor.getUTCDay() === 1
					? "M"
					: cursor.getUTCDay() === 2
						? "T"
						: cursor.getUTCDay() === 3
							? "W"
							: cursor.getUTCDay() === 4
								? "T"
								: cursor.getUTCDay() === 5
									? "F"
									: "S",
			inTrailingWindow: key >= trailingStartKey && key <= todayKey,
			isFuture: key > todayKey,
		})

		previousMonth = month
	}

	return days
}
