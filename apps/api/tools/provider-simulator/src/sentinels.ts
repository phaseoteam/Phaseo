// Purpose: Traceable sentinel values for simulated requests and responses.
// Why: A distinctive value can be found again wherever the gateway moves it, so drops and renames are provable.
// How: Strings carry a SIM marker; numbers come from a registry of values no default would produce.

export const SENTINEL_NUMBERS = new Map<number, string>([
	[0.37, "temperature"],
	[0.91, "top_p"],
	[41, "top_k"],
	[0.07, "min_p"],
	[424242, "seed"],
	[777, "max_tokens"],
	[0.11, "frequency_penalty"],
	[0.13, "presence_penalty"],
	[1.07, "repetition_penalty"],
	[3, "top_logprobs"],
	[1337, "reasoning.max_tokens"],
	[2048, "thinking.budget_tokens"],
	[9, "max_tool_calls"],
]);

/** Distinct usage sentinels: every value is unique so each provider field can be traced into meters. */
export const USAGE = {
	input: 100_003,
	cachedRead: 20_011,
	cacheWrite: 3_019,
	cacheWrite5m: 1_013,
	cacheWrite1h: 2_006,
	output: 5_003,
	reasoning: 1_109,
	inputAudio: 211,
	outputAudio: 223,
	inputImage: 307,
	toolUsePrompt: 401,
	acceptedPrediction: 13,
	rejectedPrediction: 17,
	webSearch: 2,
} as const;

export function isTraceableString(value: unknown): value is string {
	return typeof value === "string" && /SIM[-_]|sim-/.test(value);
}

export function isTraceableNumber(value: unknown): value is number {
	return typeof value === "number" && SENTINEL_NUMBERS.has(value);
}

export type Leaf = { path: string; value: unknown };

export function leaves(value: unknown, prefix = "$", out: Leaf[] = []): Leaf[] {
	if (value === null || typeof value !== "object") {
		out.push({ path: prefix, value });
		return out;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) out.push({ path: prefix, value: [] });
		value.forEach((item, index) => leaves(item, `${prefix}[${index}]`, out));
		return out;
	}
	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length === 0) out.push({ path: prefix, value: {} });
	for (const [key, child] of entries) leaves(child, `${prefix}.${key}`, out);
	return out;
}

/** Normalises a leaf path to a shape signature: array indexes dropped, case and separators folded. */
export function pathSignature(path: string): string {
	return path.replace(/\[\d+\]/g, "[]");
}

export function lastKey(path: string): string {
	const cleaned = path.replace(/\[\d+\]$/g, "");
	const match = cleaned.match(/\.([^.[\]]+)$/);
	return match ? match[1] : cleaned;
}

export function foldKey(key: string): string {
	return key.replace(/[_-]/g, "").toLowerCase();
}
