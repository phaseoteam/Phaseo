// OpenAI Chat Completions Protocol - Encoder
// Transforms IR → OpenAI Chat Completions Response (Gateway format)

import type { IRChatResponse, IRChoice, IRUsage } from "@core/ir";
import type { GatewayCompletionsResponse, GatewayUsage } from "@core/types";

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
	return {
		id: requestId,
		object: "chat.completion",
		nativeResponseId: ir.nativeId,
		created: ir.created ?? Math.floor(Date.now() / 1000),
		model: ir.model,
		provider: ir.provider,
		choices: ir.choices.map(encodeChoice),
		usage: encodeUsage(ir.usage),
	} as GatewayCompletionsResponse;
}

/**
 * Encode IR choice to gateway choice format
 */
function encodeChoice(choice: IRChoice): GatewayCompletionsResponse["choices"][0] {
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
		},
		finish_reason: choice.finishReason,
		reasoning: choice.reasoning,
		logprobs: choice.logprobs as any, // Type compatibility
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
