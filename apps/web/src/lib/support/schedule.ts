type ScheduleWindow = { start: number; end: number };

const SCHEDULE: Record<number, ScheduleWindow[]> = {
	0: [{ start: 7 * 60, end: 23 * 60 }],
	1: [{ start: 7 * 60, end: 23 * 60 }],
	2: [{ start: 7 * 60, end: 16 * 60 + 30 }],
	3: [{ start: 7 * 60, end: 23 * 60 }],
	4: [{ start: 7 * 60, end: 16 * 60 + 30 }],
	5: [{ start: 7 * 60, end: 23 * 60 }],
	6: [
		{ start: 7 * 60, end: 11 * 60 + 30 },
		{ start: 22 * 60, end: 23 * 60 },
	],
};

const DAY_MINUTES = 24 * 60;

const londonPartsFormatter = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
	timeZone: "Europe/London",
});

const londonLabelFormatter = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZone: "Europe/London",
});

const WEEKDAY_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

type LondonParts = {
	weekdayLabel: string;
	year: number;
	month: number;
	dayOfMonth: number;
	hour: number;
	minute: number;
	second: number;
};

function getLondonParts(date = new Date()): LondonParts {
	const parts = londonPartsFormatter.formatToParts(date);
	const getPart = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";

	return {
		weekdayLabel: getPart("weekday"),
		year: Number(getPart("year") || 0),
		month: Number(getPart("month") || 0),
		dayOfMonth: Number(getPart("day") || 0),
		hour: Number(getPart("hour") || 0),
		minute: Number(getPart("minute") || 0),
		second: Number(getPart("second") || 0),
	};
}

function getMinutesUntilNextWindow(day: number, minutes: number): number | null {
	for (let offset = 0; offset < 7; offset += 1) {
		const currentDay = (day + offset) % 7;
		const windows = (SCHEDULE[currentDay] ?? [])
			.slice()
			.sort((a, b) => a.start - b.start);

		for (const window of windows) {
			if (offset === 0 && window.start <= minutes) {
				continue;
			}
			const dayMinutes = offset * DAY_MINUTES;
			return dayMinutes + window.start - minutes;
		}
	}

	return null;
}

export interface SupportAvailability {
	isOpen: boolean;
	minutesUntilNextWindow: number | null;
}

export function getLondonInfo(date?: Date) {
	const sourceDate = date ?? new Date();
	const london = getLondonParts(date);
	return {
		date: sourceDate,
		label: londonLabelFormatter.format(sourceDate),
		isoLike: `${String(london.year).padStart(4, "0")}-${String(london.month).padStart(2, "0")}-${String(london.dayOfMonth).padStart(2, "0")}T${String(london.hour).padStart(2, "0")}:${String(london.minute).padStart(2, "0")}:${String(london.second).padStart(2, "0")} Europe/London`,
		weekdayLabel: london.weekdayLabel,
		day: WEEKDAY_INDEX[london.weekdayLabel] ?? 0,
		minutes: london.hour * 60 + london.minute,
	};
}

export function getSupportAvailability(date?: Date): SupportAvailability {
	const london = getLondonInfo(date);
	const windows = SCHEDULE[london.day] ?? [];

	const isOpen = windows.some(
		(window) => london.minutes >= window.start && london.minutes < window.end,
	);

	const minutesUntilNextWindow = isOpen
		? null
		: getMinutesUntilNextWindow(london.day, london.minutes);

	return { isOpen, minutesUntilNextWindow };
}

export function formatSupportWait(minutes: number | null): string | null {
	if (minutes == null) return null;
	if (minutes <= 60) {
		const minutesRounded = Math.ceil(minutes);
		return `${minutesRounded} minute${minutesRounded === 1 ? "" : "s"}`;
	}
	const hours = Math.ceil(minutes / 60);
	return `${hours} hour${hours === 1 ? "" : "s"}`;
}
