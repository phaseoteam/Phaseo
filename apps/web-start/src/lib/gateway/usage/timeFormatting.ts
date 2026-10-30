export function formatDateTime(
	date: Date,
	timeZone: string,
	locale = "en-US",
): string {
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
		hour12: false,
		timeZone,
	}).format(date);
}

export function shouldShowYear(date: Date, referenceDate = new Date()): boolean {
	return date.getFullYear() !== referenceDate.getFullYear();
}

export function formatWordyDateTime(
	value: string | Date | null | undefined,
	options?: {
		includeTime?: boolean;
		includeYear?: boolean;
		locale?: string;
	},
): string {
	if (!value) return "-";
	const date =
		value instanceof Date ? value : new Date(typeof value === "string" ? value : "");
	if (!Number.isFinite(date.getTime())) {
		return typeof value === "string" ? value : "-";
	}

	return new Intl.DateTimeFormat(options?.locale ?? "en-US", {
		month: "short",
		day: "2-digit",
		...(options?.includeYear ?? shouldShowYear(date) ? { year: "numeric" } : {}),
		...(options?.includeTime
			? {
					hour: "2-digit",
					minute: "2-digit",
					hour12: false,
				}
			: {}),
	}).format(date);
}

export function formatWordyRange(
	start: string | null | undefined,
	end: string | null | undefined,
	locale = "en-US",
): string {
	if (!start || !end) return "-";
	const startDate = new Date(start);
	const endDate = new Date(end);
	if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
		return `${start ?? "-"} - ${end ?? "-"}`;
	}

	const sameDay =
		startDate.getFullYear() === endDate.getFullYear() &&
		startDate.getMonth() === endDate.getMonth() &&
		startDate.getDate() === endDate.getDate();
	const includeYear =
		startDate.getFullYear() !== endDate.getFullYear() ||
		shouldShowYear(startDate) ||
		shouldShowYear(endDate);

	if (sameDay) {
		return `${formatWordyDateTime(startDate, {
			includeYear,
			includeTime: true,
			locale,
		})} - ${new Intl.DateTimeFormat(locale, {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(endDate)}`;
	}

	return `${formatWordyDateTime(startDate, {
		includeYear,
		includeTime: true,
		locale,
	})} - ${formatWordyDateTime(endDate, {
		includeYear,
		includeTime: true,
		locale,
	})}`;
}

export function shortenIdentifier(value: string, visibleChars = 5): string {
	const trimmed = value.trim();
	if (trimmed.length <= visibleChars * 2 + 1) return trimmed;
	return `${trimmed.slice(0, visibleChars)}...${trimmed.slice(-visibleChars)}`;
}
