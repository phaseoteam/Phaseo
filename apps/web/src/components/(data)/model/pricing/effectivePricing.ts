export type ObservedEffectivePricingPoint = {
	dayBucket: string;
	inputTokens: number;
	outputTokens: number;
	inputCostNanos: number;
	outputCostNanos: number;
};

export function calculateObservedEffectivePriceSummary(
	usageByDay: Map<string, ObservedEffectivePricingPoint>,
	sinceMs?: number,
	untilMs?: number,
) {
	let inputCostNanos = 0;
	let inputTokens = 0;
	let outputCostNanos = 0;
	let outputTokens = 0;

	for (const point of usageByDay.values()) {
		const timestampMs = Date.parse(`${point.dayBucket}T12:00:00.000Z`);
		if (!Number.isFinite(timestampMs)) continue;
		if (sinceMs !== undefined && timestampMs < sinceMs) continue;
		if (untilMs !== undefined && timestampMs > untilMs) continue;
		if (point.inputTokens > 0) {
			inputTokens += point.inputTokens;
			inputCostNanos += point.inputCostNanos;
		}
		if (point.outputTokens > 0) {
			outputTokens += point.outputTokens;
			outputCostNanos += point.outputCostNanos;
		}
	}

	return {
		weightedInputPricePer1M: inputTokens > 0 ? (inputCostNanos / 1_000_000_000) / inputTokens * 1_000_000 : null,
		weightedOutputPricePer1M: outputTokens > 0 ? (outputCostNanos / 1_000_000_000) / outputTokens * 1_000_000 : null,
		pricedInputTokens: inputTokens,
		pricedOutputTokens: outputTokens,
	};
}

export function calculateCacheHitRatePct(
	cachedReadTokens: number,
	inputTokens: number,
): number | null {
	if (!Number.isFinite(inputTokens) || inputTokens <= 0) return null;
	if (!Number.isFinite(cachedReadTokens) || cachedReadTokens < 0) return null;
	return Math.min(100, (cachedReadTokens / inputTokens) * 100);
}

export function hasObservedTokenUsage(
	inputTokens: number,
	outputTokens: number,
): boolean {
	return (
		(Number.isFinite(inputTokens) && inputTokens > 0) ||
		(Number.isFinite(outputTokens) && outputTokens > 0)
	);
}

export function calculateTokenSharePct(
	tokens: number,
	totalTokens: number,
): number | null {
	if (!Number.isFinite(totalTokens) || totalTokens <= 0) return null;
	if (!Number.isFinite(tokens) || tokens < 0) return null;
	return Math.min(100, (tokens / totalTokens) * 100);
}
