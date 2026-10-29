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

// The words Intl.RelativeTimeFormat uses in English with numeric "auto", for -1, 0 and 1 of each unit.
const AUTO_WORDS: Record<string, Partial<Record<-1 | 0 | 1, string>>> = {
	second: { 0: "now" },
	minute: { 0: "this minute" },
	hour: { 0: "this hour" },
	day: { [-1]: "yesterday", 0: "today", 1: "tomorrow" },
	week: { [-1]: "last week", 0: "this week", 1: "next week" },
	month: { [-1]: "last month", 0: "this month", 1: "next month" },
	quarter: { [-1]: "last quarter", 0: "this quarter", 1: "next quarter" },
	year: { [-1]: "last year", 0: "this year", 1: "next year" },
};

const englishNumber = new Intl.NumberFormat("en");

/**
 * What Intl.RelativeTimeFormat("en", { numeric: "auto" }) says, for engines without it. Hermes, the mobile app's
 * engine, may not have it; the tests check this matches Intl's English word for word.
 */
export function formatRelativeUnitInEnglish(value: number, unit: Intl.RelativeTimeFormatUnit): string {
	const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
	const word = value === 0 ? AUTO_WORDS[singular]?.[0] : value === 1 || value === -1 ? AUTO_WORDS[singular]?.[value] : undefined;
	if (word) return word;
	const amount = `${englishNumber.format(Math.abs(value))} ${singular}${Math.abs(value) === 1 ? "" : "s"}`;
	return value < 0 ? `${amount} ago` : `in ${amount}`;
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

/** "5 minutes ago", "yesterday", "next month": an amount of one unit, worded with numeric "auto" as the website does. */
export function formatRelativeUnit(value: number, unit: Intl.RelativeTimeFormatUnit, locale = "en"): string {
	if (typeof Intl.RelativeTimeFormat !== "function") return formatRelativeUnitInEnglish(value, unit);
	let formatter = relativeFormatters.get(locale);
	if (!formatter) {
		formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
		relativeFormatters.set(locale, formatter);
	}
	return formatter.format(value, unit);
}

/**
 * "5 minutes ago", "in 3 hours", "yesterday", "now": a time relative to `now`, worded as the website's timestamps are.
 * An unreadable time is "".
 */
export function formatRelativeTime(value: Instant, now: Instant = Date.now(), locale = "en"): string {
	const difference = timeOf(value) - timeOf(now);
	if (!Number.isFinite(difference)) return "";
	const { unit, value: amount } = relativeUnit(difference);
	return formatRelativeUnit(amount, unit, locale);
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

/**
 * The website's language for dates and times: its site language, which a reader can change in their display
 * preferences on the website. The apps have no such preference, so they always use it.
 */
export const DATE_LOCALE = "en-GB";

export type DateValue = Date | number | string | null | undefined;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function parseDate(value: DateValue): Date | null {
	if (value == null || value === "") return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

// The website asks Intl for dateStyle "medium" and timeStyle "short" or "medium" (displayPreferences.ts). These options
// give the same text in en-GB (checked on 535,952 times in four time zones) and work in Hermes, where the mobile app
// already uses them.
const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const TIME_WITH_SECONDS: Intl.DateTimeFormatOptions = { ...TIME, second: "2-digit" };

/**
 * A date with any Intl options, in the website's language (its formatDisplayDateParts). A missing date is `fallback`;
 * text that isn't a date is shown as it is.
 */
export function formatDateParts(value: DateValue, options: Intl.DateTimeFormatOptions, fallback = "-"): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	const key = JSON.stringify(options);
	let formatter = dateFormatters.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(DATE_LOCALE, options);
		dateFormatters.set(key, formatter);
	}
	return formatter.format(date);
}

/** "29 Oct 2026", in the reader's time zone: the website's dates (formatDisplayDate). */
export function formatDate(value: DateValue, fallback = "-"): string {
	return formatDateParts(value, DATE, fallback);
}

/** "29 Oct 2026" for a calendar date such as a release date, read in UTC so it can't move a day (formatDisplayCalendarDate). */
export function formatCalendarDate(value: DateValue, fallback = "-"): string {
	return formatDateParts(value, { ...DATE, timeZone: "UTC" }, fallback);
}

/** "14:05", or "14:05:33" with seconds: the website's times (formatDisplayTime). */
export function formatTime(value: DateValue, options?: { includeSeconds?: boolean }): string {
	return formatDateParts(value, options?.includeSeconds ? TIME_WITH_SECONDS : TIME);
}

/** "29 Oct 2026, 14:05": the website's date and time (formatDisplayDateTime). */
export function formatDateTime(value: DateValue, options?: { includeSeconds?: boolean }): string {
	return formatDateParts(value, { ...DATE, ...(options?.includeSeconds ? TIME_WITH_SECONDS : TIME) });
}

/**
 * "3 hours ago" within a day of `now`, otherwise "29 Oct 2026, 14:05": the website's timestamps under its default
 * "contextual" setting (formatDisplayTimestamp).
 */
export function formatTimestamp(value: DateValue, now: Instant = Date.now()): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	const difference = date.getTime() - timeOf(now);
	if (Math.abs(difference) >= 86_400_000) return formatDateTime(date);
	const { unit, value: amount } = relativeUnit(difference);
	return formatRelativeUnit(amount, unit, DATE_LOCALE);
}
