// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Responses Protocol - Encoder
// Transforms IR -> OpenAI Responses Response

import type { IRChatResponse, IRUsage, IRContentPart } from "@core/ir";

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
	created: number;
	model: string;
	output: OpenAIResponseOutputItem[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		reasoning_tokens?: number;
	};
	status: "completed" | "failed" | "incomplete";
	status_details?: {
		type: string;
		reason: string;
	};
};

export type OpenAIResponseOutputItem =
	| { type: "message"; role: "assistant"; content: any[]; refusal?: string }
	| { type: "function_call"; call_id: string; name: string; arguments: string }
	| { type: "reasoning"; content: Array<{ type: "output_text"; text: string; annotations?: any[] }> };

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

	for (const choice of ir.choices) {
		const hasToolCalls = (choice.message.toolCalls?.length ?? 0) > 0;
		const { textParts, reasoningParts, imageParts } = splitContentParts(choice.message.content as IRContentPart[]);

		for (const reasoningText of reasoningParts) {
			outputItems.push({
				type: "reasoning",
				content: [{ type: "output_text", text: reasoningText, annotations: [] }],
			});
		}

		const hasText = textParts.length > 0;
		const hasImages = imageParts.length > 0;
		const shouldEmitMessage =
			Boolean(choice.message.refusal) ||
			(!hasToolCalls && (hasText || hasImages)) ||
			(hasToolCalls && (hasText || hasImages));

		if (shouldEmitMessage) {
			const content: any[] = [];
			if (textParts.length > 0) {
				for (const text of textParts) {
					content.push({ type: "output_text", text, annotations: [] });
				}
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

			outputItems.push({
				type: "message",
				role: "assistant",
				content,
				refusal: choice.message.refusal,
			});
		}

		if (hasToolCalls) {
			for (const toolCall of choice.message.toolCalls ?? []) {
				outputItems.push({
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
		created: ir.created ?? Math.floor(Date.now() / 1000),
		model: ir.model,
		output: outputItems,
		usage: encodeUsage(ir.usage),
		status,
	};
}

function splitContentParts(parts: IRContentPart[]): { textParts: string[]; reasoningParts: string[]; imageParts: Array<Extract<IRContentPart, { type: "image" }>> } {
	if (!Array.isArray(parts)) return { textParts: [], reasoningParts: [], imageParts: [] };
	const textParts = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text);
	const reasoningParts = parts
		.filter((part) => part.type === "reasoning_text")
		.map((part) => part.text);
	const imageParts = parts.filter((part) => part.type === "image") as Array<Extract<IRContentPart, { type: "image" }>>;
	return { textParts, reasoningParts, imageParts };
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
		prompt_tokens: promptTokens ?? 0,
		completion_tokens: completionTokens ?? 0,
		total_tokens: totalTokens ?? 0,
		reasoning_tokens: usage.reasoningTokens,
	};
}

