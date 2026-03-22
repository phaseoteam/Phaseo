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

export function buildExpiryUtcIso(
	dateValue: string,
	timeValue: string,
	defaultTime = "23:59"
): string {
	const localInput = buildExpiryLocalInput(dateValue, timeValue, defaultTime);
	if (!localInput) return "";

	const [safeDate, safeTime] = localInput.split("T");
	if (!DATE_PATTERN.test(safeDate) || !TIME_PATTERN.test(safeTime)) {
		return "";
	}

	const [year, month, day] = safeDate.split("-").map((part) => Number(part));
	const [hour, minute] = safeTime.split(":").map((part) => Number(part));
	const localDateTime = new Date(year, month - 1, day, hour, minute, 0, 0);
	if (!Number.isFinite(localDateTime.getTime())) {
		return "";
	}

	return localDateTime.toISOString();
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
