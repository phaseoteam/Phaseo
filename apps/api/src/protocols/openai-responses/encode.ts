// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Responses Protocol - Encoder
// Transforms IR -> OpenAI Responses Response

import type { IRChatResponse, IRUsage, IRContentPart } from "@core/ir";
import {
	encodeResponsesReasoningItem,
	encodeResponsesToolSignatureItem,
	sealReasoningPart,
	type ResponsesReasoningItem,
} from "../shared/reasoning";

/**
 * OpenAI Responses response type
 * Based on: https://platform.openai.com/docs/api-reference/responses
 *
 * Extended with gateway fields for consistent ID tracking:
 * - id: Gateway request ID (consistent across all protocols)
 * - nativeResponseId: Provider's original response ID (for debugging)
 */
export type OpenAIResponsesResponse = {
	id: string; // Gateway request ID
	nativeResponseId?: string | null; // Provider's original response ID
	object: "response";
	created_at: number;
	model: string;
	output: OpenAIResponseOutputItem[];
	usage?: {
		input_tokens: number;
		output_tokens: number;
		total_tokens: number;
		citation_tokens?: number;
		num_search_queries?: number;
		search_context_size?: string;
		cost?: Record<string, number>;
		input_tokens_details?: {
			cached_tokens?: number;
			cache_write_tokens?: number;
		};
		output_tokens_details?: {
			reasoning_tokens?: number;
		};
		server_tool_use?: {
			datetime_requests?: number;
			web_search_requests?: number;
			web_search_results?: number;
			web_search_extra_results?: number;
			web_fetch_requests?: number;
			advisor_requests?: number;
			image_generation_requests?: number;
			apply_patch_requests?: number;
		};
	};
	status: "completed" | "failed" | "incomplete";
	status_details?: {
		type: string;
		reason: string;
	};
	citations?: string[];
	search_results?: Array<Record<string, any>>;
	images?: Array<Record<string, any>>;
	related_questions?: string[];
	reasoning_steps?: Array<Record<string, any>>;
};

export type OpenAIResponseOutputItem =
	| {
		type: "message";
		role: "assistant";
		content: any[];
		phase?: "commentary" | "final_answer" | null;
	}
	| { type: "function_call"; call_id: string; name: string; arguments: string }
	| { type: "custom_tool_call"; call_id: string; name: string; input: string }
	| ResponsesReasoningItem;

/**
 * Encode IR response to OpenAI Responses format
 *
 * Key features:
 * - Supports split reasoning (separate reasoning choices)
 * - Emits function_call items for tool calls
 * - Handles both regular and reasoning tokens in usage
 *
 * @param ir - IR chat response
 * @returns OpenAI Responses response
 */
export function encodeOpenAIResponsesResponse(
	ir: IRChatResponse,
	requestId?: string,
): OpenAIResponsesResponse {
	const outputItems: OpenAIResponseOutputItem[] = [];

	const origin = { provider: ir.provider, model: ir.model };
	const responseId = requestId ?? ir.id;
	for (const choice of ir.choices) {
		const hasToolCalls = (choice.message.toolCalls?.length ?? 0) > 0;
		const { textParts, imageParts, audioParts } = splitContentParts(choice.message.content as IRContentPart[]);
		// Reasoning generated between tool calls is placed before the call it
		// preceded, so the item order matches the provider's output order.
		const anchoredReasoning = new Map<string, OpenAIResponseOutputItem[]>();
		let reasoningIndex = 0;
		for (const part of choice.message.content as IRContentPart[] ?? []) {
			let item: OpenAIResponseOutputItem | null = null;
			let anchor: string | undefined;
			if (part.type === "reasoning_text") {
				if (!part.text && !sealReasoningPart(part, origin)) continue;
				item = encodeResponsesReasoningItem(part, `rs_${responseId}_${choice.index}_${reasoningIndex}`, origin);
				anchor = hasToolCalls ? part.beforeToolCallId : undefined;
			} else if (part.type === "provider_block" && part.block?.type === "thinking" && typeof part.block.thinking === "string" && part.block.thinking) {
				item = {
					type: "reasoning",
					id: `rs_${responseId}_${choice.index}_${reasoningIndex}`,
					summary: [],
					content: [{ type: "output_text", text: part.block.thinking, annotations: [] }],
				};
			}
			if (!item) continue;
			reasoningIndex += 1;
			if (anchor && choice.message.toolCalls?.some((call) => call.id === anchor)) {
				anchoredReasoning.set(anchor, [...(anchoredReasoning.get(anchor) ?? []), item]);
			} else {
				outputItems.push(item);
			}
		}

		const hasText = textParts.length > 0;
		const hasImages = imageParts.length > 0;
		const hasAudios = audioParts.length > 0;
		const shouldEmitMessage =
			Boolean(choice.message.refusal) ||
			(!hasToolCalls && (hasText || hasImages || hasAudios)) ||
			(hasToolCalls && (hasText || hasImages || hasAudios));

		if (shouldEmitMessage) {
			const content: any[] = [];
			if (textParts.length > 0) {
				for (const part of textParts) {
					content.push({
						type: "output_text",
						text: part.text,
						annotations: part.annotations ?? [],
					});
				}
			}
			if (choice.message.refusal) {
				content.push({ type: "refusal", refusal: choice.message.refusal });
			}
			if (imageParts.length > 0) {
				for (const part of imageParts) {
					if (part.source === "data") {
						content.push({
							type: "output_image",
							b64_json: part.data,
							mime_type: part.mimeType,
						});
					} else {
						content.push({
							type: "output_image",
							image_url: { url: part.data },
							mime_type: part.mimeType,
						});
					}
				}
			}
			if (audioParts.length > 0) {
				for (const part of audioParts) {
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
					if (part.source === "data") {
						content.push({
							type: "output_audio",
							b64_json: part.data,
							mime_type: mimeType,
							format: part.format,
						});
					} else {
						content.push({
							type: "output_audio",
							audio_url: { url: part.data },
							mime_type: mimeType,
							format: part.format,
						});
					}
				}
			}

			outputItems.push({
				type: "message",
				role: "assistant",
				content,
				phase: choice.message.phase,
			});
		}

		if (hasToolCalls) {
			for (const toolCall of choice.message.toolCalls ?? []) {
				outputItems.push(...(anchoredReasoning.get(toolCall.id) ?? []));
				// A Gemini function-call signature travels in its own reasoning
				// item, just before the call it belongs to.
				const signatureItem = encodeResponsesToolSignatureItem(toolCall, origin);
				if (signatureItem) outputItems.push(signatureItem);
				outputItems.push(toolCall.type === "custom"
					? {
						type: "custom_tool_call",
						call_id: toolCall.id,
						name: toolCall.name,
						input: toolCall.arguments,
					}
					: {
						type: "function_call",
						call_id: toolCall.id,
						name: toolCall.name,
						arguments: toolCall.arguments,
					});
			}
		}
	}

	const mainChoice = ir.choices[0];
	let status: "completed" | "failed" | "incomplete" = "completed";
	if (mainChoice?.finishReason === "error") {
		status = "failed";
	} else if (mainChoice?.finishReason === "length") {
		status = "incomplete";
	}

	return {
		id: requestId ?? ir.id, // Gateway request ID as primary
		nativeResponseId: ir.nativeId, // Provider's original response ID
		object: "response",
		created_at: ir.created ?? Math.floor(Date.now() / 1000),
		model: ir.model,
		output: outputItems,
		usage: encodeUsage(ir.usage),
		...(ir.usage?.serviceTier || ir.serviceTier ? { service_tier: ir.usage?.serviceTier ?? ir.serviceTier } : {}),
		status,
		...(ir.citations ? { citations: ir.citations } : {}),
		...(ir.searchResults ? { search_results: ir.searchResults } : {}),
		...(ir.images ? { images: ir.images } : {}),
		...(ir.relatedQuestions ? { related_questions: ir.relatedQuestions } : {}),
		...(ir.reasoningSteps ? { reasoning_steps: ir.reasoningSteps } : {}),
	};
}

function splitContentParts(parts: IRContentPart[]): {
	textParts: Array<Extract<IRContentPart, { type: "text" }>>;
	reasoningParts: string[];
	imageParts: Array<Extract<IRContentPart, { type: "image" }>>;
	audioParts: Array<Extract<IRContentPart, { type: "audio" }>>;
} {
	if (!Array.isArray(parts)) return { textParts: [], reasoningParts: [], imageParts: [], audioParts: [] };
	const textParts = parts
		.filter((part): part is Extract<IRContentPart, { type: "text" }> => part.type === "text");
	const reasoningParts = parts
		.flatMap((part) => {
			if (part.type === "reasoning_text") return [part.text];
			if (part.type === "provider_block" && part.block?.type === "thinking" && typeof part.block.thinking === "string" && part.block.thinking) return [part.block.thinking];
			return [];
		});
	const imageParts = parts.filter((part) => part.type === "image") as Array<Extract<IRContentPart, { type: "image" }>>;
	const audioParts = parts.filter((part) => part.type === "audio") as Array<Extract<IRContentPart, { type: "audio" }>>;
	return { textParts, reasoningParts, imageParts, audioParts };
}

function encodeUsage(usage?: IRUsage): OpenAIResponsesResponse["usage"] | undefined {
	if (!usage) return undefined;
	const anyUsage = usage as any;
	const promptTokens = anyUsage.promptTokens ?? usage.inputTokens;
	const completionTokens = anyUsage.completionTokens ?? usage.outputTokens;
	const totalTokens = anyUsage.totalTokens ?? usage.totalTokens;

	if (promptTokens == null && completionTokens == null && totalTokens == null) {
		return undefined;
	}

	return {
		input_tokens: promptTokens ?? 0,
		output_tokens: completionTokens ?? 0,
		total_tokens: totalTokens ?? 0,
		...(usage.serviceTier ? { service_tier: usage.serviceTier } : {}),
		...(typeof usage._ext?.citationTokens === "number" ? { citation_tokens: usage._ext.citationTokens } : {}),
		...(typeof usage._ext?.numSearchQueries === "number" ? { num_search_queries: usage._ext.numSearchQueries } : {}),
		...(typeof usage._ext?.searchContextSize === "string" ? { search_context_size: usage._ext.searchContextSize } : {}),
		...(usage._ext?.providerCost ? { cost: usage._ext.providerCost } : {}),
		input_tokens_details:
			typeof usage.cachedInputTokens === "number" ||
			typeof usage._ext?.cachedWriteTokens === "number"
				? {
					...(typeof usage.cachedInputTokens === "number"
						? { cached_tokens: usage.cachedInputTokens }
						: {}),
					...(typeof usage._ext?.cachedWriteTokens === "number"
						? { cache_write_tokens: usage._ext.cachedWriteTokens }
						: {}),
				}
				: undefined,
		output_tokens_details:
			typeof usage.reasoningTokens === "number"
				? { reasoning_tokens: usage.reasoningTokens }
				: undefined,
		server_tool_use:
			typeof usage._ext?.serverToolUse?.datetime_requests === "number" ||
			typeof usage._ext?.serverToolUse?.web_search_requests === "number" ||
			typeof usage._ext?.serverToolUse?.web_search_results === "number" ||
			typeof usage._ext?.serverToolUse?.web_search_extra_results === "number" ||
			typeof usage._ext?.serverToolUse?.web_fetch_requests === "number" ||
			typeof usage._ext?.serverToolUse?.advisor_requests === "number" ||
			typeof usage._ext?.serverToolUse?.image_generation_requests === "number" ||
			typeof usage._ext?.serverToolUse?.apply_patch_requests === "number" ||
			typeof usage._ext?.serverToolUse?.subagent_requests === "number" || typeof usage._ext?.serverToolUse?.fusion_requests === "number" || typeof usage._ext?.serverToolUse?.search_models_requests === "number"
			? {
					...(typeof usage._ext?.serverToolUse?.datetime_requests === "number"
						? { datetime_requests: usage._ext?.serverToolUse?.datetime_requests }
						: {}),
					...(typeof usage._ext?.serverToolUse?.web_search_requests === "number"
						? { web_search_requests: usage._ext?.serverToolUse?.web_search_requests }
						: {}),
					...(typeof usage._ext?.serverToolUse?.web_search_results === "number"
						? { web_search_results: usage._ext?.serverToolUse?.web_search_results }
						: {}),
					...(typeof usage._ext?.serverToolUse?.web_search_extra_results === "number"
						? { web_search_extra_results: usage._ext?.serverToolUse?.web_search_extra_results }
						: {}),
					...(typeof usage._ext?.serverToolUse?.web_fetch_requests === "number"
						? { web_fetch_requests: usage._ext?.serverToolUse?.web_fetch_requests }
						: {}),
					...(typeof usage._ext?.serverToolUse?.advisor_requests === "number"
						? { advisor_requests: usage._ext?.serverToolUse?.advisor_requests }
						: {}),
					...(typeof usage._ext?.serverToolUse?.image_generation_requests === "number"
						? { image_generation_requests: usage._ext?.serverToolUse?.image_generation_requests }
						: {}),
					...(typeof usage._ext?.serverToolUse?.apply_patch_requests === "number"
						? { apply_patch_requests: usage._ext?.serverToolUse?.apply_patch_requests }
						: {}),
					...(typeof usage._ext?.serverToolUse?.subagent_requests === "number" ? { subagent_requests: usage._ext.serverToolUse.subagent_requests } : {}),
					...(typeof usage._ext?.serverToolUse?.fusion_requests === "number" ? { fusion_requests: usage._ext.serverToolUse.fusion_requests } : {}),
					...(typeof usage._ext?.serverToolUse?.search_models_requests === "number" ? { search_models_requests: usage._ext.serverToolUse.search_models_requests } : {}),
				}
			: undefined,
	};
}
