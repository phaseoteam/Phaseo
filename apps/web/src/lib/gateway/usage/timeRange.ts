export type UsageLogsViewKey = "logs" | "upstream" | "jobs" | "sessions";

type KnownUsageRangePreset =
	| "live"
	| "past_15m"
	| "past_30m"
	| "past_hour"
	| "past_3h"
	| "past_24h"
	| "past_2d"
	| "last_7d"
	| "last_30d"
	| "last_90d"
	| "past_1y"
	| "today"
	| "yesterday"
	| "this_week"
	| "last_week"
	| "this_month"
	| "last_month"
	| "this_year"
	| "last_year"
	| "this_quarter"
	| "last_quarter"
	| "custom";

export type UsageRangePreset = KnownUsageRangePreset | `rel:${string}`;

type RelativeUnit = "m" | "h" | "d" | "w" | "mo" | "y";

const RELATIVE_RANGE_PATTERN = /^(\d+)\s*(mo|m|h|d|w|y)$/i;

export function getUsageRangeParamKeys() {
	return {
		preset: "usage_preset",
		from: "usage_from",
		to: "usage_to",
	};
}

export function parseUsageRelativeShorthand(value?: string | null): string | null {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return null;
	const match = normalized.match(RELATIVE_RANGE_PATTERN);
	if (!match) return null;
	const amount = Number.parseInt(match[1] ?? "", 10);
	const unit = (match[2] ?? "").toLowerCase() as RelativeUnit;
	if (!Number.isFinite(amount) || amount <= 0) return null;
	return `${amount}${unit}`;
}

export function isRelativeUsageRangePreset(
	value: UsageRangePreset,
): value is `rel:${string}` {
	return value.startsWith("rel:");
}

export function serializeUsageRangePreset(value: UsageRangePreset): string {
	return isRelativeUsageRangePreset(value) ? value.slice(4) : value;
}

export function parseUsageRangePreset(value?: string | null): UsageRangePreset {
	const normalized = String(value ?? "").trim().toLowerCase();
	switch (normalized) {
		case "live":
		case "past_15m":
		case "past_30m":
		case "past_hour":
		case "past_3h":
		case "past_24h":
		case "past_2d":
		case "last_7d":
		case "last_30d":
		case "last_90d":
		case "past_1y":
		case "today":
		case "yesterday":
		case "this_week":
		case "last_week":
		case "this_month":
		case "last_month":
		case "this_year":
		case "last_year":
		case "this_quarter":
		case "last_quarter":
		case "custom":
			return normalized;
		case "15m":
			return "past_15m";
		case "30m":
			return "past_30m";
		case "1h":
			return "past_hour";
		case "3h":
			return "past_3h";
		case "24h":
		case "1d":
			return "past_24h";
		case "2d":
			return "past_2d";
		case "7d":
		case "1w":
			return "last_7d";
		case "30d":
		case "1mo":
		case "1m":
			return "last_30d";
		case "90d":
			return "last_90d";
		case "week":
			return "this_week";
		case "prev_week":
		case "previous_week":
			return "last_week";
		case "month":
			return "this_month";
		case "prev_month":
		case "previous_month":
			return "last_month";
		case "year":
			return "this_year";
		case "prev_year":
		case "previous_year":
			return "last_year";
		case "quarter":
			return "this_quarter";
		case "prev_quarter":
		case "previous_quarter":
			return "last_quarter";
		default: {
			const shorthand = parseUsageRelativeShorthand(normalized);
			return shorthand ? `rel:${shorthand}` : "past_24h";
		}
	}
}

export function parseUsageDateInput(value?: string | null): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
	const normalized = trimmed.replace(" ", "T");
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalized)) {
		return normalized.length === 16 ? normalized : normalized.slice(0, 16);
	}
	return null;
}

function startOfDay(date: Date): Date {
	const next = new Date(date);
	next.setHours(0, 0, 0, 0);
	return next;
}

function endOfDay(date: Date): Date {
	const next = new Date(date);
	next.setHours(23, 59, 59, 999);
	return next;
}

function startOfWeek(date: Date): Date {
	const next = startOfDay(date);
	const day = (next.getDay() + 6) % 7;
	next.setDate(next.getDate() - day);
	return next;
}

function endOfWeek(date: Date): Date {
	const next = startOfWeek(date);
	next.setDate(next.getDate() + 6);
	next.setHours(23, 59, 59, 999);
	return next;
}

function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(date: Date): Date {
	const month = Math.floor(date.getMonth() / 3) * 3;
	return new Date(date.getFullYear(), month, 1, 0, 0, 0, 0);
}

function endOfQuarter(date: Date): Date {
	const start = startOfQuarter(date);
	return new Date(start.getFullYear(), start.getMonth() + 3, 0, 23, 59, 59, 999);
}

function startOfYear(date: Date): Date {
	return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(date: Date): Date {
	return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function parseInputDate(value: string): Date {
	const normalized = parseUsageDateInput(value) ?? value.trim();
	const [datePart, timePart] = normalized.split("T");
	const [year, month, day] = datePart.split("-").map(Number);
	const [hours, minutes, seconds] = (timePart ?? "00:00:00").split(":").map(Number);
	return new Date(
		year,
		(month ?? 1) - 1,
		day ?? 1,
		hours ?? 0,
		minutes ?? 0,
		seconds ?? 0,
		0,
	);
}

function subtractRelativeDuration(date: Date, token: string): Date {
	const match = token.match(RELATIVE_RANGE_PATTERN);
	if (!match) return new Date(date);
	const amount = Number.parseInt(match[1] ?? "", 10);
	const unit = (match[2] ?? "").toLowerCase() as RelativeUnit;
	const next = new Date(date);
	switch (unit) {
		case "m":
			next.setMinutes(next.getMinutes() - amount);
			return next;
		case "h":
			next.setHours(next.getHours() - amount);
			return next;
		case "d":
			next.setDate(next.getDate() - amount);
			return next;
		case "w":
			next.setDate(next.getDate() - amount * 7);
			return next;
		case "mo":
			next.setMonth(next.getMonth() - amount);
			return next;
		case "y":
			next.setFullYear(next.getFullYear() - amount);
			return next;
		default:
			return next;
	}
}

function formatTime(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

function formatFriendlyDate(
	date: Date,
	{ includeYear = false }: { includeYear?: boolean } = {},
): string {
	const month = new Intl.DateTimeFormat("en-US", {
		month: "short",
	}).format(date);
	return includeYear
		? `${month} ${date.getDate()}, ${date.getFullYear()}`
		: `${month} ${date.getDate()}`;
}

function formatFriendlyDateTime(
	date: Date,
	options?: { includeYear?: boolean },
): string {
	return `${formatFriendlyDate(date, options)}, ${formatTime(date)}`;
}

function formatFriendlyCustomRange(args: {
	from: Date;
	to: Date;
	includeTime?: boolean;
	reference?: Date;
}): string {
	const { from, to, includeTime = false } = args;
	const reference = args.reference ?? new Date();
	const includeYear =
		from.getFullYear() !== to.getFullYear() ||
		from.getFullYear() !== reference.getFullYear() ||
		to.getFullYear() !== reference.getFullYear();
	if (includeTime) {
		return `${formatFriendlyDateTime(from, { includeYear })} – ${formatFriendlyDateTime(to, { includeYear })}`;
	}

	return `${formatFriendlyDate(from, { includeYear })} – ${formatFriendlyDate(to, { includeYear })}`;
}

function formatRelativeTokenLabel(token: string): string {
	const match = token.match(RELATIVE_RANGE_PATTERN);
	if (!match) return token;
	const amount = Number.parseInt(match[1] ?? "", 10);
	const unit = (match[2] ?? "").toLowerCase() as RelativeUnit;
	const noun =
		unit === "m"
			? "Minute"
			: unit === "h"
				? "Hour"
				: unit === "d"
					? "Day"
					: unit === "w"
						? "Week"
						: unit === "mo"
							? "Month"
							: "Year";
	return `Past ${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

function diffDays(start: Date, end: Date): number {
	return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function diffHours(start: Date, end: Date): number {
	return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 3_600_000));
}

function diffMonths(start: Date, end: Date): number {
	const months =
		(end.getFullYear() - start.getFullYear()) * 12 +
		(end.getMonth() - start.getMonth());
	return Math.max(1, months);
}

function getPreviousMonthDurationDays(now: Date): number {
	const currentMonthStart = startOfMonth(now);
	const previousMonthEnd = new Date(currentMonthStart);
	previousMonthEnd.setDate(0);
	return previousMonthEnd.getDate();
}

function getRelativePresetToken(preset: UsageRangePreset): string | null {
	if (isRelativeUsageRangePreset(preset)) return preset.slice(4);
	switch (preset) {
		case "past_15m":
			return "15m";
		case "past_30m":
			return "30m";
		case "past_hour":
			return "1h";
		case "past_3h":
			return "3h";
		case "past_24h":
			return "1d";
		case "past_2d":
			return "2d";
		case "last_7d":
			return "1w";
		case "last_30d":
			return "1mo";
		case "last_90d":
			return "90d";
		case "past_1y":
			return "1y";
		default:
			return null;
	}
}

export function getUsageRangeBadgeLabel(args: {
	preset: UsageRangePreset;
	now?: Date;
}): string {
	const now = args.now ? new Date(args.now) : new Date();
	const relativeToken = getRelativePresetToken(args.preset);
	if (relativeToken) return relativeToken;

	switch (args.preset) {
		case "today":
			return `${diffHours(startOfDay(now), now)}h`;
		case "yesterday":
			return "24h";
		case "this_week":
			return `${diffDays(startOfWeek(now), now)}d`;
		case "last_week":
			return "7d";
		case "this_month":
			return `${diffDays(startOfMonth(now), now)}d`;
		case "last_month":
			return `${getPreviousMonthDurationDays(now)}d`;
		case "this_year":
			return `${diffMonths(startOfYear(now), now)}mo`;
		case "last_year":
			return "1y";
		case "this_quarter":
			return `${diffMonths(startOfQuarter(now), now)}mo`;
		case "last_quarter":
			return "3mo";
		case "custom":
			return "custom";
		case "live":
			return "live";
		default:
			return "range";
	}
}

export function resolveUsageTimeRange(args: {
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	now?: Date;
}): { from: string; to: string } {
	const now = args.now ? new Date(args.now) : new Date();

	if (isRelativeUsageRangePreset(args.preset)) {
		const from = subtractRelativeDuration(now, args.preset.slice(4));
		return { from: from.toISOString(), to: now.toISOString() };
	}

	switch (args.preset) {
		case "live": {
			const from = new Date(now);
			from.setSeconds(0, 0);
			from.setMinutes(from.getMinutes() - 15);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_15m": {
			const from = new Date(now);
			from.setMinutes(from.getMinutes() - 15);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_30m": {
			const from = new Date(now);
			from.setMinutes(from.getMinutes() - 30);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_hour": {
			const from = new Date(now);
			from.setHours(from.getHours() - 1);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_3h": {
			const from = new Date(now);
			from.setHours(from.getHours() - 3);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_24h": {
			const from = new Date(now);
			from.setDate(from.getDate() - 1);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_2d": {
			const from = new Date(now);
			from.setDate(from.getDate() - 2);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "last_7d": {
			const from = new Date(now);
			from.setDate(from.getDate() - 7);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "last_30d": {
			const from = new Date(now);
			from.setDate(from.getDate() - 30);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "last_90d": {
			const from = new Date(now);
			from.setDate(from.getDate() - 90);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_1y": {
			const from = new Date(now);
			from.setFullYear(from.getFullYear() - 1);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "today":
			return { from: startOfDay(now).toISOString(), to: now.toISOString() };
		case "yesterday": {
			const end = new Date(startOfDay(now));
			end.setMilliseconds(-1);
			return { from: startOfDay(end).toISOString(), to: end.toISOString() };
		}
		case "this_week":
			return { from: startOfWeek(now).toISOString(), to: now.toISOString() };
		case "last_week": {
			const currentStart = startOfWeek(now);
			const end = new Date(currentStart);
			end.setMilliseconds(-1);
			return { from: startOfWeek(end).toISOString(), to: end.toISOString() };
		}
		case "this_month":
			return { from: startOfMonth(now).toISOString(), to: now.toISOString() };
		case "last_month": {
			const currentStart = startOfMonth(now);
			const end = new Date(currentStart);
			end.setMilliseconds(-1);
			return { from: startOfMonth(end).toISOString(), to: end.toISOString() };
		}
		case "this_year":
			return { from: startOfYear(now).toISOString(), to: now.toISOString() };
		case "last_year": {
			const start = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
			const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "this_quarter":
			return { from: startOfQuarter(now).toISOString(), to: now.toISOString() };
		case "last_quarter": {
			const currentStart = startOfQuarter(now);
			const end = new Date(currentStart);
			end.setMilliseconds(-1);
			return { from: startOfQuarter(end).toISOString(), to: end.toISOString() };
		}
		case "custom": {
			const fromInput = parseUsageDateInput(args.customFrom);
			const toInput = parseUsageDateInput(args.customTo);
			if (fromInput && toInput) {
				const parsedFrom = parseInputDate(fromInput);
				const parsedTo = parseInputDate(toInput);
				const startDate = fromInput.includes("T")
					? parsedFrom
					: startOfDay(parsedFrom);
				const endDate = toInput.includes("T")
					? parsedTo
					: endOfDay(parsedTo);
				if (startDate.getTime() <= endDate.getTime()) {
					return { from: startDate.toISOString(), to: endDate.toISOString() };
				}
				return {
					from: endDate.toISOString(),
					to: startDate.toISOString(),
				};
			}
			const fallback = new Date(now);
			fallback.setDate(fallback.getDate() - 1);
			return { from: fallback.toISOString(), to: now.toISOString() };
		}
		default:
			return { from: now.toISOString(), to: now.toISOString() };
	}
}

/** The same local date and time `months` earlier, on the month's last day when the date doesn't exist. */
function shiftMonths(date: Date, months: number): Date {
	const target = new Date(date.getFullYear(), date.getMonth() - months, 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
	const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
	target.setDate(Math.min(date.getDate(), lastDay));
	return target;
}

function shiftDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() - days);
	return next;
}

/**
 * The period a range is compared with. A period so far is compared with the
 * same point in the one before (today until 9am with yesterday until 9am), a
 * finished calendar period with the whole one before (September with all of
 * August), and any other window with the same length immediately before it.
 */
export function resolvePreviousUsageTimeRange(args: {
	preset: UsageRangePreset;
	from: string;
	to: string;
}): { from: string; to: string } {
	const from = new Date(args.from);
	const to = new Date(args.to);
	const shifted = (shift: (date: Date) => Date) => ({ from: shift(from).toISOString(), to: shift(to).toISOString() });
	switch (args.preset) {
		case "today":
		case "yesterday":
			return shifted((date) => shiftDays(date, 1));
		case "this_week":
		case "last_week":
			return shifted((date) => shiftDays(date, 7));
		case "this_month":
			return shifted((date) => shiftMonths(date, 1));
		case "this_quarter":
			return shifted((date) => shiftMonths(date, 3));
		case "this_year":
			return shifted((date) => shiftMonths(date, 12));
		case "last_month": {
			const start = shiftMonths(startOfMonth(from), 1);
			return { from: start.toISOString(), to: endOfMonth(start).toISOString() };
		}
		case "last_quarter": {
			const start = shiftMonths(startOfQuarter(from), 3);
			return { from: start.toISOString(), to: endOfQuarter(start).toISOString() };
		}
		case "last_year": {
			const start = shiftMonths(startOfYear(from), 12);
			return { from: start.toISOString(), to: endOfYear(start).toISOString() };
		}
		default:
			return { from: new Date(2 * from.getTime() - to.getTime()).toISOString(), to: from.toISOString() };
	}
}

/**
 * A comparison period in the reader's locale: "1–31 Aug" for whole days,
 * "14 Oct, 00:00–09:12" otherwise. The year shows when it isn't this year.
 */
export function formatUsageComparisonRange(args: {
	from: string;
	to: string;
	locale: string;
	now?: Date;
}): string {
	const from = new Date(args.from);
	// Ranges end on the last millisecond of a day or at the current moment.
	const to = new Date(args.to);
	const now = args.now ?? new Date();
	const wholeDays = from.getTime() === startOfDay(from).getTime() && to.getTime() === endOfDay(to).getTime();
	const showYear = from.getFullYear() !== now.getFullYear() || to.getFullYear() !== now.getFullYear();
	return new Intl.DateTimeFormat(args.locale, {
		day: "numeric",
		month: "short",
		...(showYear ? { year: "numeric" } : {}),
		...(wholeDays ? {} : { hour: "2-digit", minute: "2-digit" }),
	}).formatRange(from, to);
}

export function getUsageRangeLabel(args: {
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
}): string {
	if (isRelativeUsageRangePreset(args.preset)) {
		return formatRelativeTokenLabel(args.preset.slice(4));
	}

	switch (args.preset) {
		case "live":
			return "Live";
		case "past_15m":
			return "Past 15 Minutes";
		case "past_30m":
			return "Past 30 Minutes";
		case "past_hour":
			return "Past 1 Hour";
		case "past_3h":
			return "Past 3 Hours";
		case "past_24h":
			return "Past 24 Hours";
		case "past_2d":
			return "Past 48 Hours";
		case "last_7d":
			return "Past 1 Week";
		case "last_30d":
			return "Past 1 Month";
		case "last_90d":
			return "Past 90 Days";
		case "past_1y":
			return "Past 1 Year";
		case "today":
			return "Today";
		case "yesterday":
			return "Yesterday";
		case "this_week":
			return "This Week";
		case "last_week":
			return "Previous Week";
		case "this_month":
			return "This Month";
		case "last_month":
			return "Previous Month";
		case "this_year":
			return "This Year";
		case "last_year":
			return "Previous Year";
		case "this_quarter":
			return "This Quarter";
		case "last_quarter":
			return "Prev Quarter";
		case "custom":
			if (args.customFrom && args.customTo) {
				const from = parseInputDate(args.customFrom);
				const to = parseInputDate(args.customTo);
				const includeTime =
					args.customFrom.includes("T") || args.customTo.includes("T");
				return formatFriendlyCustomRange({ from, to, includeTime });
			}
			return "Custom Range";
		default:
			return "Past 1 Day";
	}
}

export function getUsageRangeTriggerLabel(args: {
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	now?: Date;
}): string {
	const now = args.now ? new Date(args.now) : new Date();
	const { from, to } = resolveUsageTimeRange(args);
	const start = new Date(from);
	const end = new Date(to);
	return formatFriendlyCustomRange({
		from: start,
		to: end,
		includeTime: true,
		reference: now,
	});
}
