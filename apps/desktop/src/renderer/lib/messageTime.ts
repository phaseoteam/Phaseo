import { formatDateParts, formatTime } from "@phaseo/app-kit/format";

const startOfDay = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime(); };

/** "14:05" today, "Yesterday 14:05", "29 Oct, 14:05" this year, "29 Oct 2025, 14:05" before: when a message was sent. */
export function messageTime(value: string, now = Date.now()) {
	const time = Date.parse(value);
	if (!Number.isFinite(time)) return "";
	const days = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000), clock = formatTime(time);
	if (days === 0) return clock;
	if (days === 1) return `Yesterday ${clock}`;
	const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
	return `${formatDateParts(time, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })}, ${clock}`;
}

/** "Friday 31 October 2026, 14:05:33": the whole moment, for a tooltip. */
export function fullMessageTime(value: string) {
	return formatDateParts(value, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }, "");
}
