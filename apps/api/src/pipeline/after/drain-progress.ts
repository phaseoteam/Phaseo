// Purpose: Usage so far for a stream whose client has gone while the upstream still drains.
// Why: The runtime may stop the drain before final usage arrives; what was generated is charged first.
// How: Provider-reported usage where there is any; output never below the streamed text, and
//      input estimated from the request's text when the provider has not reported it yet.

// Lean low: estimates are charged before the exact cost is known, and the exact charge only
// takes what is left, so an estimate above the real cost would overcharge.
const CHARS_PER_TOKEN_LOWER_BOUND = 5;
const TEXT_KEYS = new Set(["text", "content", "input", "instructions", "system", "prompt"]);

function positive(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Characters of prompt text in a request body; media, ids and settings are not counted. */
export function requestTextChars(value: unknown, key?: string): number {
	if (typeof value === "string") return key && TEXT_KEYS.has(key) ? value.length : 0;
	if (Array.isArray(value)) return value.reduce((sum: number, entry) => sum + requestTextChars(entry, key), 0);
	if (!value || typeof value !== "object") return 0;
	let sum = 0;
	for (const [childKey, entry] of Object.entries(value as Record<string, unknown>)) {
		if (childKey === "metadata" || childKey === "tools") continue;
		sum += requestTextChars(entry, childKey);
	}
	return sum;
}

export function estimateDrainProgressUsage(args: {
	usage: any;
	outputChars: number;
	body: unknown;
}): Record<string, unknown> | null {
	const streamedOutputTokens = Math.floor(positive(args.outputChars) / CHARS_PER_TOKEN_LOWER_BOUND);
	const usage = args.usage && typeof args.usage === "object" ? args.usage : null;
	const reportedInput = usage
		? positive(usage.input_tokens) || positive(usage.prompt_tokens) || positive(usage.promptTokenCount)
		: 0;
	if (usage && reportedInput > 0) {
		const outputKey = "prompt_tokens" in usage && !("input_tokens" in usage) ? "completion_tokens" : "output_tokens";
		return { ...usage, [outputKey]: Math.max(positive(usage[outputKey]), streamedOutputTokens) };
	}
	const inputTokens = Math.floor(requestTextChars(args.body) / CHARS_PER_TOKEN_LOWER_BOUND);
	if (inputTokens <= 0 && streamedOutputTokens <= 0) return null;
	return { input_tokens: inputTokens, output_tokens: streamedOutputTokens };
}
