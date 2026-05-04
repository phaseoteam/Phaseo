export type UsageLogsViewKey = "logs" | "jobs" | "sessions";
export type UsageRangePreset =
	| "live"
	| "past_hour"
	| "past_24h"
	| "last_7d"
	| "last_30d"
	| "last_90d"
	| "this_week"
	| "last_week"
	| "this_month"
	| "last_month"
	| "this_quarter"
	| "last_quarter"
	| "custom";

export function getUsageRangeParamKeys() {
	return {
		preset: "usage_preset",
		from: "usage_from",
		to: "usage_to",
	};
}

export function parseUsageRangePreset(value?: string | null): UsageRangePreset {
	const normalized = String(value ?? "").trim().toLowerCase();
	switch (normalized) {
		case "live":
		case "past_hour":
		case "past_24h":
		case "last_7d":
		case "last_30d":
		case "last_90d":
		case "this_week":
		case "last_week":
		case "this_month":
		case "last_month":
		case "this_quarter":
		case "last_quarter":
		case "custom":
			return normalized;
		case "1h":
			return "past_hour";
		case "24h":
		case "1d":
			return "past_24h";
		case "7d":
		case "1w":
			return "last_7d";
		case "30d":
		case "1m":
			return "last_30d";
		case "90d":
		case "1y":
			return "last_90d";
		case "week":
			return "this_week";
		case "month":
			return "this_month";
		case "quarter":
			return "this_quarter";
		default:
			return "past_24h";
	}
}

export function parseUsageDateInput(value?: string | null): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
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

function parseInputDate(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

function formatRangeDate(date: Date, reference: Date): string {
	const includeYear = date.getFullYear() !== reference.getFullYear();
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		...(includeYear ? { year: "numeric" } : {}),
	}).format(date);
}

function describeRange(label: string, start: Date, end: Date, now: Date): string {
	return `${label} (${formatRangeDate(start, now)} - ${formatRangeDate(end, now)})`;
}

function formatRangeTime(date: Date): string {
	return new Intl.DateTimeFormat("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

function describeShortTimeRange(label: string, start: Date, end: Date, now: Date): string {
	const sameDay =
		start.getFullYear() === end.getFullYear() &&
		start.getMonth() === end.getMonth() &&
		start.getDate() === end.getDate();

	if (sameDay) {
		return `${label} (${formatRangeTime(start)} - ${formatRangeTime(end)})`;
	}

	return `${label} (${formatRangeDate(start, now)} ${formatRangeTime(start)} - ${formatRangeDate(end, now)} ${formatRangeTime(end)})`;
}

export function resolveUsageTimeRange(args: {
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	now?: Date;
}): { from: string; to: string } {
	const now = args.now ? new Date(args.now) : new Date();

	switch (args.preset) {
		case "live": {
			const from = new Date(now);
			from.setDate(from.getDate() - 1);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_hour": {
			const from = new Date(now);
			from.setHours(from.getHours() - 1);
			return { from: from.toISOString(), to: now.toISOString() };
		}
		case "past_24h": {
			const from = new Date(now);
			from.setDate(from.getDate() - 1);
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
		case "this_week": {
			const start = startOfWeek(now);
			const end = endOfWeek(now);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "last_week": {
			const currentStart = startOfWeek(now);
			const end = new Date(currentStart);
			end.setDate(end.getDate() - 1);
			end.setHours(23, 59, 59, 999);
			const start = startOfWeek(end);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "this_month": {
			const start = startOfMonth(now);
			const end = endOfMonth(now);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "last_month": {
			const currentStart = startOfMonth(now);
			const end = new Date(currentStart);
			end.setDate(0);
			end.setHours(23, 59, 59, 999);
			const start = startOfMonth(end);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "this_quarter": {
			const start = startOfQuarter(now);
			const end = endOfQuarter(now);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "last_quarter": {
			const currentStart = startOfQuarter(now);
			const end = new Date(currentStart);
			end.setDate(0);
			end.setHours(23, 59, 59, 999);
			const start = startOfQuarter(end);
			return { from: start.toISOString(), to: end.toISOString() };
		}
		case "custom": {
			const fromInput = parseUsageDateInput(args.customFrom);
			const toInput = parseUsageDateInput(args.customTo);
			if (fromInput && toInput) {
				const startDate = startOfDay(parseInputDate(fromInput));
				const endDate = endOfDay(parseInputDate(toInput));
				if (startDate.getTime() <= endDate.getTime()) {
					return { from: startDate.toISOString(), to: endDate.toISOString() };
				}
				return {
					from: startOfDay(endDate).toISOString(),
					to: endOfDay(startDate).toISOString(),
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
	now?: Date;
}): string {
	const now = args.now ? new Date(args.now) : new Date();
	const range = resolveUsageTimeRange(args);
	const start = new Date(range.from);
	const end = new Date(range.to);

	switch (args.preset) {
		case "live":
			return "Live";
		case "past_hour":
			return describeShortTimeRange("Past hour", start, end, now);
		case "past_24h":
			return describeRange("Past 24 hours", start, end, now);
		case "last_7d":
			return describeRange("Last 7 days", start, end, now);
		case "last_30d":
			return describeRange("Last 30 days", start, end, now);
		case "last_90d":
			return describeRange("Last 90 days", start, end, now);
		case "this_week":
			return describeRange("This week", start, end, now);
		case "last_week":
			return describeRange("Last week", start, end, now);
		case "this_month":
			return describeRange("This month", start, end, now);
		case "last_month":
			return describeRange("Last month", start, end, now);
		case "this_quarter":
			return describeRange("This quarter", start, end, now);
		case "last_quarter":
			return describeRange("Last quarter", start, end, now);
		case "custom":
			if (args.customFrom && args.customTo) {
				return describeRange("Custom range", start, end, now);
			}
			return "Custom range";
		default:
			return "Past 24 hours";
	}
}
