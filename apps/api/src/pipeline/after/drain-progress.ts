// Purpose: Usage so far for a stream whose client has gone while the upstream still drains.
// Why: The runtime may stop the drain before final usage arrives; what was generated is charged first.
// How: Provider-reported usage where there is any, with output never below the streamed text.
//      Until the provider reports input, the prompt is estimated from the request text, on the
//      low side; the final settlement replaces the estimate with the reported usage.

// Lean low: checkpoints charge before the exact cost is known.
const CHARS_PER_TOKEN_LOWER_BOUND = 5;

// Request fields that carry prompt text, across the chat, responses, messages and Gemini shapes.
const REQUEST_TEXT_FIELDS = ["messages", "input", "system", "instructions", "prompt", "contents"] as const;

function positive(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// Characters of prompt text. Inside objects only `content` and `text` strings count, so media
// payloads, URLs, ids and tool arguments are left out.
function textChars(value: unknown, counted: boolean): number {
	if (typeof value === "string") return counted ? value.length : 0;
	if (!value || typeof value !== "object") return 0;
	if (Array.isArray(value)) return value.reduce<number>((sum, entry) => sum + textChars(entry, counted), 0);
	return Object.entries(value).reduce(
		(sum, [key, entry]) => sum + textChars(entry, key === "content" || key === "text"),
		0,
	);
}

/** Estimate the prompt from the request until the provider reports it. */
export function estimateRequestInputTokens(body: unknown): number {
	if (!body || typeof body !== "object") return 0;
	const request = body as Record<string, unknown>;
	const chars = REQUEST_TEXT_FIELDS.reduce((sum, field) => sum + textChars(request[field], true), 0);
	return Math.floor(chars / CHARS_PER_TOKEN_LOWER_BOUND);
}

export function estimateDrainProgressUsage(args: {
	usage: any;
	outputChars: number;
	requestBody?: unknown;
}): { usage: Record<string, unknown>; inputReported: boolean } | null {
	const streamedOutputTokens = Math.floor(positive(args.outputChars) / CHARS_PER_TOKEN_LOWER_BOUND);
	const usage = args.usage && typeof args.usage === "object" ? args.usage : null;
	const reportedInput = usage
		? positive(usage.input_tokens) || positive(usage.prompt_tokens) || positive(usage.promptTokenCount)
		: 0;
	if (usage && reportedInput > 0) {
		const outputKey = "prompt_tokens" in usage && !("input_tokens" in usage) ? "completion_tokens" : "output_tokens";
		return {
			usage: { ...usage, [outputKey]: Math.max(positive(usage[outputKey]), streamedOutputTokens) },
			inputReported: true,
		};
	}
	const estimatedInputTokens = estimateRequestInputTokens(args.requestBody);
	if (streamedOutputTokens <= 0 && estimatedInputTokens <= 0) return null;
	return { usage: { input_tokens: estimatedInputTokens, output_tokens: streamedOutputTokens }, inputReported: false };
}
