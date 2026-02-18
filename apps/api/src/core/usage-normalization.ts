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
		"input_text_tokens",
		"inputTokens",
		"promptTokenCount",
	]);
	const output = pickFirstFiniteNumber(usageRaw, [
		"output_tokens",
		"completion_tokens",
		"output_text_tokens",
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
