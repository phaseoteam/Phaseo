import type { LanguageModelV3Usage } from "@ai-sdk/provider";

function asNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || Number.isNaN(value)) return undefined;
	return value;
}

function firstNumber(...values: unknown[]): number | undefined {
	for (const value of values) {
		const num = asNumber(value);
		if (num !== undefined) return num;
	}
	return undefined;
}

export function mapGatewayUsage(rawUsage: any): LanguageModelV3Usage {
	const inputTotal = firstNumber(
		rawUsage?.input_tokens,
		rawUsage?.prompt_tokens,
		rawUsage?.inputTokens,
		rawUsage?.promptTokens
	);
	const outputTotal = firstNumber(
		rawUsage?.output_tokens,
		rawUsage?.completion_tokens,
		rawUsage?.outputTokens,
		rawUsage?.completionTokens
	);
	const cacheRead = firstNumber(
		rawUsage?.input_tokens_details?.cached_tokens,
		rawUsage?.prompt_tokens_details?.cached_tokens,
		rawUsage?.cachedInputTokens,
		rawUsage?.cached_read_text_tokens
	);
	const cacheWrite = firstNumber(
		rawUsage?.input_tokens_details?.cache_write_tokens,
		rawUsage?.prompt_tokens_details?.cache_write_tokens,
		rawUsage?.cached_write_text_tokens
	);
	const outputText = firstNumber(
		rawUsage?.output_text_tokens,
		rawUsage?.completion_tokens_details?.text_tokens,
		rawUsage?.output_tokens_details?.text_tokens
	);
	const reasoning = firstNumber(
		rawUsage?.output_tokens_details?.reasoning_tokens,
		rawUsage?.completion_tokens_details?.reasoning_tokens,
		rawUsage?.reasoning_tokens
	);
	const inputTotalSafe = inputTotal ?? 0;
	const outputTotalSafe = outputTotal ?? 0;

	return {
		inputTokens: {
			total: inputTotalSafe,
			noCache:
				inputTotal !== undefined
					? Math.max(inputTotalSafe - (cacheRead ?? 0), 0)
					: undefined,
			cacheRead,
			cacheWrite,
		},
		outputTokens: {
			total: outputTotalSafe,
			text: outputText ?? outputTotal,
			reasoning,
		},
		raw: rawUsage ?? {},
	};
}
