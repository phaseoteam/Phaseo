// Purpose: Shared usage normalization helpers.
// Why: Keeps token/request fallback logic consistent across pipeline and executors.
// How: Resolves canonical token counts from mixed provider usage payload shapes.

export type CanonicalTokenUsage = {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
};

function readPath(source: any, path: string): unknown {
	if (!source || typeof source !== "object") return undefined;
	const parts = path.split(".");
	let cursor: any = source;
	for (const part of parts) {
		if (cursor == null || typeof cursor !== "object") return undefined;
		cursor = cursor[part];
	}
	return cursor;
}

export function pickFirstFiniteNumber(
	source: any,
	paths: string[],
): number | undefined {
	for (const path of paths) {
		const value = readPath(source, path);
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return undefined;
}

function clampNonNegativeInt(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.round(value));
}

export function resolveCanonicalTokenUsage(usageRaw: any): CanonicalTokenUsage {
	const input = pickFirstFiniteNumber(usageRaw, [
		"input_tokens",
		"prompt_tokens",
		"promptTokens",
		"prompt_token_count",
		"input_text_tokens",
		"total_input_tokens",
		"totalInputTokens",
		"inputTokens",
		"promptTokenCount",
	]);
	const output = pickFirstFiniteNumber(usageRaw, [
		"output_tokens",
		"completion_tokens",
		"completionTokens",
		"completion_token_count",
		"output_text_tokens",
		"total_output_tokens",
		"totalOutputTokens",
		"outputTokens",
		"candidatesTokenCount",
	]);
	const total = pickFirstFiniteNumber(usageRaw, [
		"total_tokens",
		"totalTokens",
		"totalTokenCount",
	]);

	let inputResolved = input;
	let outputResolved = output;
	let totalResolved = total;

	if (inputResolved == null && outputResolved == null && totalResolved != null) {
		// Providers sometimes return total-only usage. Price against input meter by default.
		inputResolved = totalResolved;
		outputResolved = 0;
	}

	if (totalResolved == null) {
		totalResolved = (inputResolved ?? 0) + (outputResolved ?? 0);
	}

	if (inputResolved == null) {
		inputResolved = Math.max(0, totalResolved - (outputResolved ?? 0));
	}
	if (outputResolved == null) {
		outputResolved = Math.max(0, totalResolved - (inputResolved ?? 0));
	}

	// Never let total undercount split meters.
	const splitSum = (inputResolved ?? 0) + (outputResolved ?? 0);
	if (totalResolved < splitSum) {
		totalResolved = splitSum;
	}

	return {
		inputTokens: clampNonNegativeInt(inputResolved),
		outputTokens: clampNonNegativeInt(outputResolved),
		totalTokens: clampNonNegativeInt(totalResolved),
	};
}

export function resolveRequestCountUsage(usageRaw: any): number | undefined {
	const explicit = pickFirstFiniteNumber(usageRaw, [
		"requests",
		"request_count",
		"_ext.requests",
	]);
	if (explicit != null) return clampNonNegativeInt(explicit);

	const tokens = resolveCanonicalTokenUsage(usageRaw);
	if (tokens.totalTokens > 0) return 1;

	return undefined;
}

function isUsageRecord(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// The counts a Messages stream reports on message_start, which message_delta may repeat as 0.
const MESSAGES_START_COUNTS = new Set([
	"input_tokens",
	"cache_read_input_tokens",
	"cache_creation_input_tokens",
	"cache_creation",
]);

function mergeMessagesUsageRecord(
	previous: Record<string, any>,
	next: Record<string, any>,
	startCounts: boolean,
): Record<string, any> {
	const merged: Record<string, any> = { ...previous };
	for (const [key, value] of Object.entries(next)) {
		if (value == null) continue;
		const earlier = merged[key];
		const startCount = startCounts || MESSAGES_START_COUNTS.has(key);
		if (startCount && value === 0 && typeof earlier === "number" && earlier > 0) continue;
		merged[key] = isUsageRecord(value) && isUsageRecord(earlier)
			? mergeMessagesUsageRecord(earlier, value, startCount)
			: value;
	}
	return merged;
}

/**
 * Merges a Messages stream's usage events. message_start reports the input and cache counts
 * and message_delta the cumulative output; message_delta often omits the input and cache
 * counts, and some upstreams repeat them there as 0. A count an event omits is kept and a
 * later count replaces an earlier one, except that a 0 for an input or cache count does not
 * erase the count message_start reported.
 */
export function mergeMessagesStreamUsage(previous: unknown, next: unknown): any {
	if (!isUsageRecord(next)) return previous ?? next;
	if (!isUsageRecord(previous)) return next;
	return mergeMessagesUsageRecord(previous, next, false);
}

/**
 * Accumulates the usage events of a stream in `protocol`. Only Messages streams split usage
 * across events. In every other protocol each usage event carries the stream's usage so far,
 * so the latest wins whole, 0 counts included: a final usage can correct a provisional count
 * (a cache-token estimate, say) to 0.
 */
export function accumulateStreamUsage(protocol: string | null | undefined, previous: unknown, next: unknown): any {
	return protocol === "anthropic.messages" ? mergeMessagesStreamUsage(previous, next) : next;
}
