export const CHAT_TIME_SEPARATOR_GAP_MS = 6 * 60 * 60 * 1000;

function parseTimestamp(value: string | null | undefined) {
	if (!value) return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : null;
}

function isSameLocalDay(first: Date, second: Date) {
	return (
		first.getFullYear() === second.getFullYear() &&
		first.getMonth() === second.getMonth() &&
		first.getDate() === second.getDate()
	);
}

function startOfLocalDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function shouldShowChatTimeSeparator(
	currentValue: string | null | undefined,
	previousValue: string | null | undefined,
) {
	const currentTimestamp = parseTimestamp(currentValue);
	if (currentTimestamp === null) return false;
	if (!previousValue) return true;

	const previousTimestamp = parseTimestamp(previousValue);
	if (previousTimestamp === null) return false;

	const currentDate = new Date(currentTimestamp);
	const previousDate = new Date(previousTimestamp);
	return (
		!isSameLocalDay(currentDate, previousDate) ||
		Math.abs(currentTimestamp - previousTimestamp) >=
			CHAT_TIME_SEPARATOR_GAP_MS
	);
}

export function formatChatTimeSeparator(
	value: string | null | undefined,
	now = new Date(),
): string | null {
	const timestamp = parseTimestamp(value);
	if (timestamp === null) return null;

	const date = new Date(timestamp);
	const time = new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);

	if (isSameLocalDay(date, now)) return `Today at ${time}`;

	const dayDifference = Math.round(
		(startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000,
	);
	if (dayDifference === 1) return `Yesterday at ${time}`;
	if (dayDifference > 1 && dayDifference < 7) {
		const weekday = new Intl.DateTimeFormat("en-GB", {
			weekday: "long",
		}).format(date);
		return `${weekday} at ${time}`;
	}

	const dateLabel = new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		...(date.getFullYear() === now.getFullYear()
			? {}
			: { year: "numeric" as const }),
	}).format(date);
	return `${dateLabel} at ${time}`;
}

export function formatModelChangeMarker(labels: string[]) {
	const uniqueLabels = Array.from(
		new Set(labels.map((label) => label.trim()).filter(Boolean)),
	);
	if (uniqueLabels.length <= 1) {
		const label = uniqueLabels[0] ?? "selected model";
		return {
			label: `Model changed to ${label}`,
			title: `Model changed to ${label}`,
		};
	}

	const visibleLabels = uniqueLabels.slice(0, 2);
	const remainingCount = uniqueLabels.length - visibleLabels.length;
	const summary = `${visibleLabels.join(" + ")}${
		remainingCount > 0 ? ` + ${remainingCount} more` : ""
	}`;
	return {
		label: `Models changed to ${summary}`,
		title: `Models changed to ${uniqueLabels.join(", ")}`,
	};
}
