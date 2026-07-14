const DAY_MS = 24 * 60 * 60 * 1000;

export type RelativeCalendarTone = "past" | "today" | "future";

export type RelativeCalendarDescriptor = {
	label: string;
	tone: RelativeCalendarTone;
	dayDifference: number;
};

export type DetailedRelativeCalendarDescriptor = RelativeCalendarDescriptor & {
	detailedLabel: string;
	totalDays: number;
};

function toUtcDayTimestamp(value: string | Date): number | null {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function pluralize(value: number, unit: string): string {
	return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function daysInUtcMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcMonths(date: Date, monthsToAdd: number): Date {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const day = date.getUTCDate();
	const totalMonths = month + monthsToAdd;
	const nextYear = year + Math.floor(totalMonths / 12);
	const nextMonth = ((totalMonths % 12) + 12) % 12;
	const nextDay = Math.min(day, daysInUtcMonth(nextYear, nextMonth));
	return new Date(Date.UTC(nextYear, nextMonth, nextDay));
}

function addUtcYears(date: Date, yearsToAdd: number): Date {
	const year = date.getUTCFullYear() + yearsToAdd;
	const month = date.getUTCMonth();
	const day = Math.min(date.getUTCDate(), daysInUtcMonth(year, month));
	return new Date(Date.UTC(year, month, day));
}

function decomposeCalendarDayDifference(start: Date, end: Date) {
	let years = end.getUTCFullYear() - start.getUTCFullYear();
	let cursor = addUtcYears(start, years);
	if (cursor.getTime() > end.getTime()) {
		years -= 1;
		cursor = addUtcYears(start, years);
	}

	let months =
		(end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 +
		(end.getUTCMonth() - cursor.getUTCMonth());
	let monthCursor = addUtcMonths(cursor, months);
	if (monthCursor.getTime() > end.getTime()) {
		months -= 1;
		monthCursor = addUtcMonths(cursor, months);
	}

	const days = Math.round((end.getTime() - monthCursor.getTime()) / DAY_MS);

	return { years, months, days };
}

function formatDetailedRelativeDistance(absDays: number, start: Date, end: Date): string {
	if (absDays === 0) return "0 days";

	const { years, months, days } = decomposeCalendarDayDifference(start, end);
	const parts = [
		years > 0 ? pluralize(years, "year") : null,
		months > 0 ? pluralize(months, "month") : null,
		days > 0 ? pluralize(days, "day") : null,
	].filter(Boolean);

	return parts.length > 0 ? parts.join(", ") : pluralize(absDays, "day");
}

function formatRelativeDistance(absDays: number): string {
	if (absDays < 14) return pluralize(absDays, "day");
	if (absDays < 28) return pluralize(Math.round(absDays / 7), "week");
	if (absDays < 730) return pluralize(Math.round(absDays / 30.4375), "month");
	return pluralize(Math.round(absDays / 365.25), "year");
}

export function formatModelLifecycleDate(dateStr?: string | null): string {
	if (!dateStr) return "-";
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("en-GB", {
		timeZone: "UTC",
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function describeRelativeCalendarDate(
	dateStr: string,
	now = new Date(),
): RelativeCalendarDescriptor | null {
	const targetDay = toUtcDayTimestamp(dateStr);
	const nowDay = toUtcDayTimestamp(now);
	if (targetDay == null || nowDay == null) return null;

	const dayDifference = Math.round((targetDay - nowDay) / DAY_MS);
	if (dayDifference === 0) {
		return { label: "Today", tone: "today", dayDifference };
	}
	if (dayDifference === 1) {
		return { label: "Tomorrow", tone: "future", dayDifference };
	}
	if (dayDifference === -1) {
		return { label: "Yesterday", tone: "past", dayDifference };
	}

	const distance = formatRelativeDistance(Math.abs(dayDifference));
	if (dayDifference > 0) {
		return {
			label: `In ${distance}`,
			tone: "future",
			dayDifference,
		};
	}

	return {
		label: `${distance} ago`,
		tone: "past",
		dayDifference,
	};
}

export function describeDetailedRelativeCalendarDate(
	dateStr: string,
	now = new Date(),
): DetailedRelativeCalendarDescriptor | null {
	const basic = describeRelativeCalendarDate(dateStr, now);
	const targetDay = toUtcDayTimestamp(dateStr);
	const nowDay = toUtcDayTimestamp(now);
	if (!basic || targetDay == null || nowDay == null) return null;

	const totalDays = Math.abs(basic.dayDifference);
	const startTimestamp = Math.min(targetDay, nowDay);
	const endTimestamp = Math.max(targetDay, nowDay);
	const start = new Date(startTimestamp);
	const end = new Date(endTimestamp);
	const detailedDistance = formatDetailedRelativeDistance(totalDays, start, end);
	const detailedLabel =
		basic.dayDifference > 0
			? `In ${detailedDistance}`
			: basic.dayDifference < 0
				? `${detailedDistance} ago`
				: "Today";

	return {
		...basic,
		detailedLabel,
		totalDays,
	};
}
