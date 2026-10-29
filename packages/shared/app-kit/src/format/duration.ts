/**
 * How long something took: "850 ms", "1.5 s", "12.3 s", "2.08 min", "15.5 min". The website chat's response timings
 * (moved from components/(chat)/ChatMessageFooters.tsx). An unreadable duration is "-".
 */
export function formatDuration(value: number, locale = "en-GB") {
	if (!Number.isFinite(value)) return "-";
	const formatNumber = (number: number, digits: number) =>
		new Intl.NumberFormat(locale, {
			maximumFractionDigits: digits,
		}).format(number);
	if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
	const seconds = value / 1000;
	if (seconds < 10) {
		return `${formatNumber(seconds, 2)} s`;
	}
	if (seconds < 60) {
		return `${formatNumber(seconds, 1)} s`;
	}
	const minutes = seconds / 60;
	if (minutes < 10) {
		return `${formatNumber(minutes, 2)} min`;
	}
	return `${formatNumber(minutes, 1)} min`;
}
