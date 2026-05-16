export type UsageLogsViewKey = "logs" | "jobs" | "sessions";

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
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	})
		.format(date)
		.replace("AM", "am")
		.replace("PM", "pm");
}

function formatOrdinalDay(day: number): string {
	const mod100 = day % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

function formatFriendlyDate(
	date: Date,
	{ includeYear = false }: { includeYear?: boolean } = {},
): string {
	const month = new Intl.DateTimeFormat("en-US", {
		month: "short",
	}).format(date);
	return includeYear
		? `${month} ${formatOrdinalDay(date.getDate())}, ${date.getFullYear()}`
		: `${month} ${formatOrdinalDay(date.getDate())}`;
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
	const sameDay =
		from.getFullYear() === to.getFullYear() &&
		from.getMonth() === to.getMonth() &&
		from.getDate() === to.getDate();

	if (sameDay) {
		if (includeTime) {
			return `${formatFriendlyDate(from, { includeYear })}, ${formatTime(from)} - ${formatTime(to)}`;
		}
		return formatFriendlyDate(from, { includeYear });
	}

	if (includeTime) {
		return `${formatFriendlyDateTime(from, { includeYear })} - ${formatFriendlyDateTime(to, { includeYear })}`;
	}

	return `${formatFriendlyDate(from, { includeYear })} - ${formatFriendlyDate(to, { includeYear })}`;
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
			return "Past 1 Day";
		case "past_2d":
			return "Past 2 Days";
		case "last_7d":
			return "Past 1 Week";
		case "last_30d":
			return "Past 1 Month";
		case "last_90d":
			return "Past 90 Days";
		case "today":
			return "Today";
		case "yesterday":
			return "Yesterday";
		case "this_week":
			return "This Week";
		case "last_week":
			return "Prev Week";
		case "this_month":
			return "This Month";
		case "last_month":
			return "Prev Month";
		case "this_year":
			return "This Year";
		case "last_year":
			return "Prev Year";
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
			return "Custom range...";
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
	const includeTime =
		Boolean(args.customFrom && args.customFrom.includes("T")) ||
		Boolean(args.customTo && args.customTo.includes("T"));
	return formatFriendlyCustomRange({
		from: start,
		to: end,
		includeTime,
		reference: now,
	});
}
