import type { IRChatResponse, IRContentPart } from "@core/ir";

function estimateTokensFromTextChars(chars: number): number {
	if (!Number.isFinite(chars) || chars <= 0) return 0;
	// Lightweight approximation used only as a fallback when provider output usage is missing.
	return Math.max(1, Math.ceil(chars / 4));
}

function sumMessageChars(parts: IRContentPart[] | undefined): number {
	if (!Array.isArray(parts) || parts.length === 0) return 0;
	let chars = 0;
	for (const part of parts) {
		if (!part || typeof part !== "object") continue;
		if ((part.type === "text" || part.type === "reasoning_text") && typeof (part as any).text === "string") {
			chars += ((part as any).text as string).length;
		}
	}
	return chars;
}

function totalOutputChars(ir: IRChatResponse): number {
	let chars = 0;
	for (const choice of ir.choices ?? []) {
		const message = choice?.message as any;
		if (!message) continue;
		if (typeof message.content === "string") {
			chars += message.content.length;
			continue;
		}
		chars += sumMessageChars(message.content);
	}
	return chars;
}

/**
 * Google family models occasionally omit output token usage in stream metadata.
 * When content exists but output tokens are zero, apply a conservative text-based estimate.
 */
export function applyGoogleOutputTokenFallback(ir: IRChatResponse | undefined): {
	applied: boolean;
	estimatedOutputTokens: number;
} {
	if (!ir) return { applied: false, estimatedOutputTokens: 0 };
	const outputChars = totalOutputChars(ir);
	if (outputChars <= 0) return { applied: false, estimatedOutputTokens: 0 };

	const existingOutput = Number(ir.usage?.outputTokens ?? 0);
	if (Number.isFinite(existingOutput) && existingOutput > 0) {
		return { applied: false, estimatedOutputTokens: 0 };
	}

	const estimate = estimateTokensFromTextChars(outputChars);
	const inputTokens = Number(ir.usage?.inputTokens ?? 0);
	const safeInput = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
	const existingTotal = Number(ir.usage?.totalTokens ?? 0);
	const safeTotal = Number.isFinite(existingTotal) && existingTotal > 0 ? existingTotal : 0;

	ir.usage = {
		...(ir.usage ?? { inputTokens: safeInput, outputTokens: 0, totalTokens: safeTotal }),
		inputTokens: safeInput,
		outputTokens: estimate,
		totalTokens: Math.max(safeTotal, safeInput + estimate),
	};

	return { applied: true, estimatedOutputTokens: estimate };
}

export function applyOpenAIUsageFallback(
	usage: any,
	inputTokens: number,
	outputTokens: number,
	totalTokens: number,
): void {
	if (!usage || typeof usage !== "object") return;
	usage.prompt_tokens = inputTokens;
	usage.completion_tokens = outputTokens;
	usage.total_tokens = totalTokens;
}
