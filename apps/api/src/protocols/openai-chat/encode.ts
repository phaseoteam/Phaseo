// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Chat Completions Protocol - Encoder
// Transforms IR → OpenAI Chat Completions Response (Gateway format)

import type { IRChatResponse, IRChoice, IRUsage, IRContentPart } from "@core/ir";
import type { GatewayCompletionsResponse, GatewayReasoningDetail, GatewayUsage } from "@core/types";

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
	requestId?: string,
): GatewayCompletionsResponse {
	const resolvedRequestId = requestId ?? ir.id;
	return {
		id: resolvedRequestId,
		object: "chat.completion",
		nativeResponseId: ir.nativeId,
		created: ir.created ?? Math.floor(Date.now() / 1000),
		model: ir.model,
		provider: ir.provider,
		choices: ir.choices.map((choice) => encodeChoice(choice, resolvedRequestId)),
		usage: encodeUsage(ir.usage),
		...(ir.citations ? { citations: ir.citations } : {}),
		...(ir.searchResults ? { search_results: ir.searchResults } : {}),
		...(ir.images ? { images: ir.images } : {}),
		...(ir.relatedQuestions ? { related_questions: ir.relatedQuestions } : {}),
		...(ir.reasoningSteps ? { reasoning_steps: ir.reasoningSteps } : {}),
	} as GatewayCompletionsResponse;
}

/**
 * Encode IR choice to gateway choice format
 * @param reasoningContent - Optional reasoning content string (simple format)
 * @param reasoningDetails - Optional reasoning details array (structured format)
 */
function encodeChoice(
	choice: IRChoice,
	requestId: string,
): GatewayCompletionsResponse["choices"][0] {
	const { text, reasoningParts, imageParts, audioParts } = splitContentParts(choice.message.content as IRContentPart[]);
	const reasoningContent = reasoningParts.join("");
	const reasoningDetails: GatewayReasoningDetail[] = reasoningParts.map((textPart, index) => ({
		id: `${requestId}-reasoning-${choice.index}-${index + 1}`,
		index,
		type: "text",
		text: textPart,
	}));
	const images = imageParts.map((part) => ({
		type: "image_url" as const,
		image_url: {
			url:
				part.source === "data"
					? `data:${part.mimeType || "image/png"};base64,${part.data}`
					: part.data,
		},
		...(part.mimeType ? { mime_type: part.mimeType } : {}),
	}));
	const audios = audioParts.map((part) => {
		const mimeType = (() => {
			if (part.format === "wav") return "audio/wav";
			if (part.format === "mp3") return "audio/mpeg";
			if (part.format === "flac") return "audio/flac";
			if (part.format === "m4a") return "audio/m4a";
			if (part.format === "ogg") return "audio/ogg";
			if (part.format === "pcm16") return "audio/l16";
			if (part.format === "pcm24") return "audio/l24";
			return "audio/wav";
		})();
		return {
			type: "audio_url" as const,
			audio_url: {
				url:
					part.source === "data"
						? `data:${mimeType};base64,${part.data}`
						: part.data,
			},
			mime_type: mimeType,
			...(part.format ? { format: part.format } : {}),
		};
	});

	return {
		index: choice.index,
		message: {
			role: "assistant",
			content: text,
			...(images.length > 0 ? { images } : {}),
			...(audios.length > 0 ? { audios } : {}),
			...(choice.message.refusal ? { refusal: choice.message.refusal } : {}),
			tool_calls: choice.message.toolCalls?.map((tc) => ({
				id: tc.id,
				...(tc.type === "custom"
					? {
						type: "custom" as const,
						custom: { name: tc.name, input: tc.arguments },
					}
					: {
						type: "function" as const,
						function: {
							name: tc.name,
							arguments: tc.arguments,
						},
					}),
			})) as any,
			// Per-message reasoning fields (MiniMax/Aion format)
			...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
			...(reasoningDetails.length > 0 ? { reasoning_details: reasoningDetails } : {}),
		},
		finish_reason: choice.finishReason,
		logprobs: choice.logprobs as any, // Type compatibility
	};
}

function splitContentParts(parts: IRContentPart[]): {
	text: string;
	reasoningParts: string[];
	imageParts: Array<Extract<IRContentPart, { type: "image" }>>;
	audioParts: Array<Extract<IRContentPart, { type: "audio" }>>;
} {
	if (!Array.isArray(parts)) return { text: "", reasoningParts: [], imageParts: [], audioParts: [] };
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const reasoningParts = parts
		.flatMap((part) => {
			if (part.type === "reasoning_text") return [part.text];
			if (part.type === "provider_block" && part.block?.type === "thinking" && typeof part.block.thinking === "string" && part.block.thinking) return [part.block.thinking];
			return [];
		});
	const imageParts = parts.filter((part) => part.type === "image") as Array<
		Extract<IRContentPart, { type: "image" }>
	>;
	const audioParts = parts.filter((part) => part.type === "audio") as Array<
		Extract<IRContentPart, { type: "audio" }>
	>;
	return { text, reasoningParts, imageParts, audioParts };
}

/**
 * Encode IR usage to gateway usage format
 *
 * Emits only canonical usage meters.
 */
function encodeUsage(usage?: IRUsage): GatewayUsage | undefined {
	if (!usage) return undefined;
	const usageAny = usage as IRUsage & {
		promptTokens?: number;
		completionTokens?: number;
	};
	const inputTokens = usage.inputTokens ?? usageAny.promptTokens;
	const outputTokens = usage.outputTokens ?? usageAny.completionTokens;
	const totalTokens = usage.totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0));

	const result: GatewayUsage = {
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		total_tokens: totalTokens,
	};
	(result as any).prompt_tokens = inputTokens;
	(result as any).completion_tokens = outputTokens;
	if (typeof usage._ext?.spentCredits === "number") {
		(result as any)["x-spent-credits"] = usage._ext.spentCredits;
	}
	if (typeof usage.reasoningTokens === "number") {
		result.reasoning_tokens = usage.reasoningTokens;
	}
	if (typeof usage._ext?.citationTokens === "number") {
		(result as any).citation_tokens = usage._ext.citationTokens;
	}
	if (typeof usage._ext?.numSearchQueries === "number") {
		(result as any).num_search_queries = usage._ext.numSearchQueries;
	}
	if (typeof usage._ext?.searchContextSize === "string") {
		(result as any).search_context_size = usage._ext.searchContextSize;
	}
	if (usage._ext?.providerCost) {
		(result as any).cost = usage._ext.providerCost;
	}

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

	const serverToolUse = usage._ext?.serverToolUse;
	if (
		typeof serverToolUse?.datetime_requests === "number" ||
		typeof serverToolUse?.web_search_requests === "number" ||
		typeof serverToolUse?.web_search_results === "number" ||
		typeof serverToolUse?.web_search_extra_results === "number" ||
		typeof serverToolUse?.web_fetch_requests === "number" ||
		typeof serverToolUse?.advisor_requests === "number" ||
		typeof serverToolUse?.image_generation_requests === "number" ||
		typeof serverToolUse?.apply_patch_requests === "number" ||
		typeof serverToolUse?.subagent_requests === "number" || typeof serverToolUse?.fusion_requests === "number" || typeof serverToolUse?.search_models_requests === "number"
	) {
		(result as any).server_tool_use = {
			...(typeof serverToolUse?.datetime_requests === "number"
				? { datetime_requests: serverToolUse.datetime_requests }
				: {}),
			...(typeof serverToolUse?.web_search_requests === "number"
				? { web_search_requests: serverToolUse.web_search_requests }
				: {}),
			...(typeof serverToolUse?.web_search_results === "number"
				? { web_search_results: serverToolUse.web_search_results }
				: {}),
			...(typeof serverToolUse?.web_search_extra_results === "number"
				? { web_search_extra_results: serverToolUse.web_search_extra_results }
				: {}),
			...(typeof serverToolUse?.web_fetch_requests === "number"
				? { web_fetch_requests: serverToolUse.web_fetch_requests }
				: {}),
			...(typeof serverToolUse?.advisor_requests === "number"
				? { advisor_requests: serverToolUse.advisor_requests }
				: {}),
			...(typeof serverToolUse?.image_generation_requests === "number"
				? { image_generation_requests: serverToolUse.image_generation_requests }
				: {}),
			...(typeof serverToolUse?.apply_patch_requests === "number"
				? { apply_patch_requests: serverToolUse.apply_patch_requests }
				: {}),
			...(typeof serverToolUse?.subagent_requests === "number" ? { subagent_requests: serverToolUse.subagent_requests } : {}),
			...(typeof serverToolUse?.fusion_requests === "number" ? { fusion_requests: serverToolUse.fusion_requests } : {}),
			...(typeof serverToolUse?.search_models_requests === "number" ? { search_models_requests: serverToolUse.search_models_requests } : {}),
		};
	}

	return result;
}
