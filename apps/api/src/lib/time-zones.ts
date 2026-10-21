const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/**
 * An IANA time zone name such as "Europe/London" or "UTC", trimmed; null otherwise.
 * Offsets ("+01:00") and abbreviations Intl cannot resolve are rejected. The database
 * re-checks against pg_timezone_names (private.is_valid_time_zone), which is case-sensitive.
 */
export function parseIanaTimeZone(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const zone = value.trim();
	if (!zone || zone.length > 64 || !IANA_NAME.test(zone)) return null;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return zone;
	} catch {
		return null;
	}
}
