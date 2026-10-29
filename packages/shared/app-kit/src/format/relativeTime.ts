/**
 * The unit and rounded amount the website's relative timestamps use for a time difference (formatDisplayTimestamp in
 * apps/web/src/lib/displayPreferences.ts): seconds under a minute, then minutes, hours, days under 30, months and years.
 */
export function relativeUnit(milliseconds: number): { unit: Intl.RelativeTimeFormatUnit; value: number } {
	const absolute = Math.abs(milliseconds);
	if (absolute < 60_000) return { unit: "second", value: Math.round(milliseconds / 1_000) };
	if (absolute < 3_600_000) return { unit: "minute", value: Math.round(milliseconds / 60_000) };
	if (absolute < 86_400_000) return { unit: "hour", value: Math.round(milliseconds / 3_600_000) };
	if (absolute < 2_592_000_000) return { unit: "day", value: Math.round(milliseconds / 86_400_000) };
	if (absolute < 31_536_000_000) return { unit: "month", value: Math.round(milliseconds / 2_592_000_000) };
	return { unit: "year", value: Math.round(milliseconds / 31_536_000_000) };
}

type Instant = Date | number | string;

function timeOf(value: Instant): number {
	return value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

/**
 * "5 minutes ago", "in 3 hours", "yesterday", "now": a time relative to `now`, worded as the website's timestamps are.
 * An unreadable time is "".
 */
export function formatRelativeTime(value: Instant, now: Instant = Date.now(), locale = "en"): string {
	const difference = timeOf(value) - timeOf(now);
	if (!Number.isFinite(difference)) return "";
	let formatter = relativeFormatters.get(locale);
	if (!formatter) {
		formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
		relativeFormatters.set(locale, formatter);
	}
	const { unit, value: amount } = relativeUnit(difference);
	return formatter.format(amount, unit);
}

const SHORT_UNITS: Partial<Record<Intl.RelativeTimeFormatUnit, string>> = { minute: "m", hour: "h", day: "d", month: "mo", year: "y" };

/**
 * How long ago, in the fewest characters, for narrow lists: "now", "5m", "3h", "2d", "4mo", "1y". The website's
 * relative units and rounding, abbreviated (it has no short form of its own). A future time counts as now; an
 * unreadable one is "".
 */
export function formatAgoShort(value: Instant, now: Instant = Date.now()): string {
	const elapsed = timeOf(now) - timeOf(value);
	if (!Number.isFinite(elapsed)) return "";
	const { unit, value: amount } = relativeUnit(Math.max(0, elapsed));
	const suffix = SHORT_UNITS[unit];
	return suffix ? `${amount}${suffix}` : "now";
}
