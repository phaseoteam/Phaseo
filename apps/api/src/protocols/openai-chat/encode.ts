// OpenAI Chat Completions Protocol - Encoder
// Transforms IR → OpenAI Chat Completions Response (Gateway format)

import type { IRChatResponse, IRChoice, IRUsage } from "@core/ir";
import type { GatewayCompletionsResponse, GatewayReasoningDetail, GatewayUsage } from "@core/types";
import { isAionProvider } from "@/providers/aion/think";

/**
 * Encode IR response to OpenAI Chat Completions format (Gateway response)
 *
 * Note: We're encoding to GatewayCompletionsResponse (not raw OpenAI format)
 * because the gateway already has a normalized response shape that clients expect.
 * This maintains backward compatibility while using IR internally.
 *
 * @param ir - IR chat response
 * @param requestId - Gateway request ID
 * @returns Gateway-formatted chat completions response
 */
export function encodeOpenAIChatResponse(
	ir: IRChatResponse,
	requestId: string,
): GatewayCompletionsResponse {
	const isAion = isAionProvider(ir.provider);
	const isMiniMax = ir.provider === "minimax";

	// Extract reasoning choices and merge them into main choice message
	const { choices, reasoningContent, reasoningDetails } = (isAion || isMiniMax)
		? splitReasoningChoices(ir.choices, requestId)
		: { choices: ir.choices, reasoningContent: undefined, reasoningDetails: undefined };

	return {
		id: requestId,
		object: "chat.completion",
		nativeResponseId: ir.nativeId,
		created: ir.created ?? Math.floor(Date.now() / 1000),
		model: ir.model,
		provider: ir.provider,
		choices: choices.map((choice, idx) => encodeChoice(choice, reasoningContent?.[idx], reasoningDetails?.[idx])),
		usage: encodeUsage(ir.usage),
	} as GatewayCompletionsResponse;
}

/**
 * Encode IR choice to gateway choice format
 * @param reasoningContent - Optional reasoning content string (simple format)
 * @param reasoningDetails - Optional reasoning details array (structured format)
 */
function encodeChoice(
	choice: IRChoice,
	reasoningContent?: string,
	reasoningDetails?: GatewayReasoningDetail[]
): GatewayCompletionsResponse["choices"][0] {
	return {
		index: choice.index,
		message: {
			role: "assistant",
			content: choice.message.content as any,
			tool_calls: choice.message.toolCalls?.map((tc) => ({
				id: tc.id,
				type: "function" as const,
				function: {
					name: tc.name,
					arguments: tc.arguments,
				},
			})),
			refusal: choice.message.refusal,
			// Per-message reasoning fields (MiniMax/Aion format)
			...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
			...(reasoningDetails && reasoningDetails.length > 0 ? { reasoning_details: reasoningDetails } : {}),
		},
		finish_reason: choice.finishReason,
		reasoning: choice.reasoning,
		logprobs: choice.logprobs as any, // Type compatibility
	};
}

/**
 * Split reasoning choices from main choices and format for per-message output
 * Returns:
 * - choices: Main (non-reasoning) choices
 * - reasoningContent: Per-choice reasoning_content strings (simple format)
 * - reasoningDetails: Per-choice reasoning_details arrays (structured format)
 */
function splitReasoningChoices(
	choices: IRChoice[],
	requestId: string,
): {
	choices: IRChoice[];
	reasoningContent?: string[];
	reasoningDetails?: GatewayReasoningDetail[][];
} {
	const reasoningChoices = choices.filter(
		(choice) => choice.reasoning && typeof choice.message.content === "string" && choice.message.content.length > 0,
	);
	const mainChoices = choices.filter((choice) => !choice.reasoning);

	// No reasoning? Return as-is
	if (reasoningChoices.length === 0) {
		return { choices: mainChoices.length > 0 ? mainChoices : choices };
	}

	// Create reasoning_content string (simple format: all reasoning joined)
	const reasoningText = reasoningChoices
		.map((c) => c.message.content)
		.filter((text): text is string => typeof text === "string")
		.join("\n\n");

	// Create reasoning_details array (structured format: array of reasoning blocks)
	const reasoningDetailsArray = reasoningChoices.map((choice, idx) => ({
		id: `${requestId}-reasoning-${idx + 1}`,
		index: idx,
		type: "reasoning.text" as const,
		reasoning_content: choice.message.content as string,
	}));

	// Return same reasoning for all main choices (MiniMax behavior)
	const reasoningContent = mainChoices.length > 0 && reasoningText.length > 0
		? mainChoices.map(() => reasoningText)
		: undefined;

	const reasoningDetails = mainChoices.length > 0 && reasoningDetailsArray.length > 0
		? mainChoices.map(() => reasoningDetailsArray)
		: undefined;

	return {
		choices: mainChoices.length > 0 ? mainChoices : choices,
		reasoningContent,
		reasoningDetails,
	};
}

/**
 * Encode IR usage to gateway usage format
 *
 * Maps to both new OpenAI-aligned meters and legacy meters for pricing
 */
function encodeUsage(usage?: IRUsage): GatewayUsage | undefined {
	if (!usage) return undefined;
	const anyUsage = usage as any;
	const promptTokens = anyUsage.promptTokens ?? usage.inputTokens;
	const completionTokens = anyUsage.completionTokens ?? usage.outputTokens;
	const totalTokens = anyUsage.totalTokens ?? usage.totalTokens;

	const result: GatewayUsage = {
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		total_tokens: totalTokens,
	};

	if (usage.cachedInputTokens || usage._ext?.inputImageTokens || usage._ext?.inputAudioTokens || usage._ext?.inputVideoTokens) {
		result.input_details = {
			cached_tokens: usage.cachedInputTokens,
			input_images: usage._ext?.inputImageTokens,
			input_audio: usage._ext?.inputAudioTokens,
			input_videos: usage._ext?.inputVideoTokens,
		};
	}

	if (usage.reasoningTokens || usage._ext?.outputImageTokens || usage._ext?.outputAudioTokens || usage._ext?.cachedWriteTokens) {
		result.output_tokens_details = {
			reasoning_tokens: usage.reasoningTokens,
			cached_tokens: usage._ext?.cachedWriteTokens,
			output_images: usage._ext?.outputImageTokens,
			output_audio: usage._ext?.outputAudioTokens,
		};
	}

	if (usage.inputTokens != null) {
		result.input_text_tokens = usage.inputTokens;
	}
	if (usage.outputTokens != null) {
		result.output_text_tokens = usage.outputTokens;
	}
	if (usage.cachedInputTokens != null) {
		result.cached_read_text_tokens = usage.cachedInputTokens;
	}
	if (usage.reasoningTokens != null) {
		result.reasoning_tokens = usage.reasoningTokens;
	}
	if (usage._ext?.cachedWriteTokens != null) {
		result.cached_write_text_tokens = usage._ext.cachedWriteTokens;
	}

	return result;
}
