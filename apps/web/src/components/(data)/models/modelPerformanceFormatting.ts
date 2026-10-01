const MINUTES_THRESHOLD_SECONDS = 1_000;

export function formatProviderDuration(
	valueMs: number | null,
	formatNumber?: (value: number, options?: Intl.NumberFormatOptions) => string
): string {
	if (valueMs == null || !Number.isFinite(valueMs)) return "-";

	const seconds = Math.max(0, valueMs) / 1_000;
	if (seconds > MINUTES_THRESHOLD_SECONDS) {
		const minutes = seconds / 60;
		const value = minutes >= 100 ? Math.round(minutes) : minutes;
		return `${formatNumber
			? formatNumber(value, { maximumFractionDigits: minutes >= 100 ? 0 : 1, notation: "standard" })
			: minutes >= 100 ? Math.round(minutes) : minutes.toFixed(1)} min`;
	}

	const maximumFractionDigits = seconds >= 100 ? 0 : seconds >= 10 ? 1 : 2;
	const formattedSeconds = formatNumber
		? formatNumber(seconds, { maximumFractionDigits, notation: "standard" })
		: seconds >= 100
			? String(Math.round(seconds))
			: seconds.toFixed(maximumFractionDigits);
	return `${formattedSeconds} s`;
}
