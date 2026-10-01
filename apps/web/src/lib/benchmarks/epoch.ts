export const epochCapabilitiesIndexId = "epoch-capabilities-index";

export function isEpochCapabilitiesIndex(benchmarkId: string) {
	return benchmarkId === epochCapabilitiesIndexId;
}

export function parseEpochConfidenceInterval(info: string | null | undefined) {
	const match = info?.match(/95% CI\s+([\d.]+)[–-]([\d.]+)/i);
	if (!match) return null;
	const low = Number(match[1]);
	const high = Number(match[2]);
	return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

export function isEpochConfidenceIntervalForScore(
	interval: { low: number; high: number } | null | undefined,
	score: unknown,
) {
	const value = Number(score);
	return Boolean(
		interval
		&& Number.isFinite(value)
		&& interval.low > 0
		&& interval.high > interval.low
		&& interval.low <= value
		&& value <= interval.high,
	);
}
