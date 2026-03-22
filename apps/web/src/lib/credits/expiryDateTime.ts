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

export function parseOptionalExpiryInput(
	raw: FormDataEntryValue | null
): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const parsed = new Date(trimmed);
	if (!Number.isFinite(parsed.getTime())) {
		throw new Error("Invalid expiry date");
	}
	return parsed.toISOString();
}
