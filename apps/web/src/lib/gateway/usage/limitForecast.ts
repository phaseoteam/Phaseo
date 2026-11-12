export type LimitWindow = "day" | "week" | "month";

export type LimitWindowForecast = {
	/** Usage at the end of the window if the pace so far continues. */
	projected: number;
	/** When the pace so far reaches the limit, if that happens before the window resets. */
	reachesLimitAt: number | null;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Projections from a very short slice of a window swing wildly, so wait until
 * enough of it has passed for the pace to mean something.
 */
export const MIN_ELAPSED_MS: Record<LimitWindow, number> = {
	day: 3 * HOUR_MS,
	week: DAY_MS,
	month: 3 * DAY_MS,
};

/**
 * The gateway enforces key limits on UTC calendar windows: midnight, Monday
 * 00:00 and the 1st of the month (see `date_trunc` in the request context).
 */
export function utcLimitWindow(window: LimitWindow, now: number): { start: number; end: number } {
	const date = new Date(now);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const day = date.getUTCDate();
	if (window === "day") {
		const start = Date.UTC(year, month, day);
		return { start, end: start + DAY_MS };
	}
	if (window === "week") {
		const daysSinceMonday = (date.getUTCDay() + 6) % 7;
		const start = Date.UTC(year, month, day - daysSinceMonday);
		return { start, end: start + 7 * DAY_MS };
	}
	return { start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) };
}

/** Time until the window resets, e.g. "19d 3h", "5h 12m" or "8m". */
export function formatLimitResetCountdown(window: LimitWindow, now: number): string {
	const diffMs = Math.max(0, utcLimitWindow(window, now).end - now);
	const totalMinutes = Math.ceil(diffMs / 60_000);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	return `${Math.max(1, minutes)}m`;
}

/**
 * Straight-line projection of a limit window from its usage so far. Returns
 * null while too little of the window has passed to project from.
 */
export function forecastLimitWindow({
	window,
	used,
	limit,
	now,
}: {
	window: LimitWindow;
	used: number;
	limit: number;
	now: number;
}): LimitWindowForecast | null {
	return forecastCalendarWindow({ window, ...utcLimitWindow(window, now), used, limit, now });
}

/**
 * {@link forecastLimitWindow} over any day, week or month, such as one in a
 * spend rule's own time zone (`start` and `end` are its instants, so a day
 * across a clock change lasts 23 or 25 hours). Spend rule forecasts compute
 * the same in SQL (`private.spend_rule_values`); the shared fixture in
 * `__fixtures__/spend-forecast-parity.json` keeps the two in step.
 */
export function forecastCalendarWindow({
	window,
	start,
	end,
	used,
	limit,
	now,
}: {
	window: LimitWindow;
	start: number;
	end: number;
	used: number;
	limit: number;
	now: number;
}): LimitWindowForecast | null {
	const elapsed = now - start;
	if (elapsed < MIN_ELAPSED_MS[window]) return null;
	if (!(used > 0)) return { projected: 0, reachesLimitAt: null };

	const projected = (used * (end - start)) / elapsed;
	// Reaching the limit exactly as the window resets is not a hit: the reset comes first.
	const reachesLimitAt =
		limit > 0 && used < limit && projected > limit
			? Math.round(start + (elapsed * limit) / used)
			: null;
	return { projected, reachesLimitAt };
}
