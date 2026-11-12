export const epochCapabilitiesIndexId = "epoch-capabilities-index";

export function isEpochCapabilitiesIndex(benchmarkId: string) {
	return benchmarkId === epochCapabilitiesIndexId;
}

/** The inline chart shows twelve neighbouring entries around the current model. */
export function selectEpochLeaderboardEntries<T extends { model_id: string }>(
	entries: readonly T[],
	modelId?: string,
): T[] {
	const currentIndex = entries.findIndex((entry) => entry.model_id === modelId);
	const start = currentIndex < 0
		? 0
		: Math.min(Math.max(0, currentIndex - 5), Math.max(0, entries.length - 12));
	return entries.slice(start, start + 12);
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
