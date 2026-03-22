export function buildExpiryLocalInput(
	dateValue: string,
	timeValue: string,
	defaultTime = "23:59"
): string {
	const safeDate = String(dateValue ?? "").trim();
	if (!safeDate) return "";
	const safeTime = String(timeValue ?? "").trim() || defaultTime;
	return `${safeDate}T${safeTime}`;
}

const TZ_AWARE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export type ExpirySelectionPreview = {
	timezone: string;
	timezoneOffset: string;
	timezoneDisplay: string;
	localDisplay: string;
	utcDisplay: string;
	utcIso: string;
};

function parseLocalDateTimeInput(
	dateValue: string,
	timeValue: string,
	defaultTime = "23:59"
): Date | null {
	const localInput = buildExpiryLocalInput(dateValue, timeValue, defaultTime);
	if (!localInput) return null;

	const [safeDate, safeTime] = localInput.split("T");
	if (!DATE_PATTERN.test(safeDate) || !TIME_PATTERN.test(safeTime)) {
		return null;
	}

	const [year, month, day] = safeDate.split("-").map((part) => Number(part));
	const [hour, minute] = safeTime.split(":").map((part) => Number(part));
	const localDateTime = new Date(year, month - 1, day, hour, minute, 0, 0);
	if (!Number.isFinite(localDateTime.getTime())) {
		return null;
	}
	return localDateTime;
}

function formatDateTimeInTimeZone(date: Date, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone,
		}).format(date);
	} catch {
		return date.toLocaleString();
	}
}

export function formatUtcOffset(offsetMinutesEastOfUtc: number): string {
	const sign = offsetMinutesEastOfUtc >= 0 ? "+" : "-";
	const absoluteMinutes = Math.abs(offsetMinutesEastOfUtc);
	const hours = Math.floor(absoluteMinutes / 60)
		.toString()
		.padStart(2, "0");
	const minutes = (absoluteMinutes % 60).toString().padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
}

export function getBrowserTimeZone(): string {
	const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return resolved && resolved.trim().length > 0 ? resolved : "Local";
}

export function buildExpirySelectionPreview(
	dateValue: string,
	timeValue: string,
	defaultTime = "23:59"
): ExpirySelectionPreview | null {
	const localDateTime = parseLocalDateTimeInput(dateValue, timeValue, defaultTime);
	if (!localDateTime) return null;

	const timezone = getBrowserTimeZone();
	const timezoneOffset = formatUtcOffset(-localDateTime.getTimezoneOffset());
	return {
		timezone,
		timezoneOffset,
		timezoneDisplay: `${timezone} (UTC${timezoneOffset})`,
		localDisplay: formatDateTimeInTimeZone(localDateTime, timezone),
		utcDisplay: formatDateTimeInTimeZone(localDateTime, "UTC"),
		utcIso: localDateTime.toISOString(),
	};
}

export function buildExpiryUtcIso(
	dateValue: string,
	timeValue: string,
	defaultTime = "23:59"
): string {
	const localDateTime = parseLocalDateTimeInput(dateValue, timeValue, defaultTime);
	return localDateTime ? localDateTime.toISOString() : "";
}

export function parseOptionalExpiryInput(
	raw: FormDataEntryValue | null
): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (!TZ_AWARE_SUFFIX.test(trimmed)) {
		throw new Error("Invalid expiry date");
	}
	const parsed = new Date(trimmed);
	if (!Number.isFinite(parsed.getTime())) {
		throw new Error("Invalid expiry date");
	}
	return parsed.toISOString();
}
