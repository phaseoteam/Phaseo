// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Anthropic Messages Protocol - Encoder
// Transforms IR -> Anthropic Messages Response

import type { IRChatResponse, IRChoice, IRContentPart } from "@core/ir";

/**
 * Anthropic Messages response type
 *
 * Extended with gateway fields for consistent ID tracking:
 * - id: Gateway request ID (consistent across all protocols)
 * - nativeResponseId: Provider's original response ID (for debugging)
 */
export type AnthropicMessagesResponse = {
	id: string; // Gateway request ID
	nativeResponseId?: string | null; // Provider's original response ID
	type: "message";
	role: "assistant";
	content: AnthropicResponseContent[];
	model: string;
	stop_reason:
		| "end_turn"
		| "max_tokens"
		| "stop_sequence"
		| "tool_use"
		| "refusal"
		| null;
	stop_sequence: string | null;
	usage: {
		cache_creation: any | null;
		cache_creation_input_tokens: number | null;
		cache_read_input_tokens: number | null;
		input_tokens: number;
		output_tokens: number;
		server_tool_use: any | null;
		service_tier: "standard" | "priority" | "batch" | null;
	};
};

export type AnthropicResponseContent =
	| { type: "text"; text: string; citations: any[] | null }
	| {
		type: "image";
		source: {
			type: "base64" | "url";
			media_type?: string;
			data?: string;
			url?: string;
		};
	}
	| { type: "thinking"; thinking: string; signature: string }
	| { type: "tool_use"; id: string; name: string; input: Record<string, any> };

/**
 * Encode IR response to Anthropic Messages format
 *
 * Key fix: This properly emits tool_use blocks in the content array!
 *
 * @param ir - IR chat response
 * @returns Anthropic Messages response
 */
export function encodeAnthropicMessagesResponse(ir: IRChatResponse): AnthropicMessagesResponse {
	const content: AnthropicResponseContent[] = [];

	// Anthropic Messages API doesn't support multiple choices
	// Take the first choice
	const mainChoice = ir.choices[0];

	if (!mainChoice) {
		// Fallback: empty response
		return {
			id: ir.id,
			nativeResponseId: ir.nativeId,
			type: "message",
			role: "assistant",
			content: [{ type: "text", text: "", citations: null }],
			model: ir.model,
			stop_reason: "end_turn",
			stop_sequence: null,
			usage: encodeUsage(ir.usage, ir.serviceTier),
		};
	}

	const hasToolCalls = (mainChoice.message.toolCalls?.length ?? 0) > 0;
	const { text, reasoningParts, imageParts } = splitContentParts(mainChoice.message.content as IRContentPart[]);
	const contentText = mainChoice.message.refusal ?? text;

	if (typeof contentText === "string") {
		const shouldIncludeText =
			Boolean(mainChoice.message.refusal) ||
			contentText.length > 0 ||
			(contentText === "" && !hasToolCalls && reasoningParts.length === 0);

		if (shouldIncludeText) {
			content.push({
				type: "text",
				text: contentText,
				citations: null,
			});
		}
	}

	if (imageParts.length > 0) {
		for (const imagePart of imageParts) {
			if (imagePart.source === "data") {
				content.push({
					type: "image",
					source: {
						type: "base64",
						media_type: imagePart.mimeType,
						data: imagePart.data,
					},
				});
				continue;
			}

			content.push({
				type: "image",
				source: {
					type: "url",
					media_type: imagePart.mimeType,
					url: imagePart.data,
				},
			});
		}
	}

	// CRITICAL FIX: Add tool_use blocks from tool calls
	if (mainChoice.message.toolCalls && mainChoice.message.toolCalls.length > 0) {
		for (const toolCall of mainChoice.message.toolCalls) {
			content.push({
				type: "tool_use",
				id: toolCall.id,
				name: toolCall.name,
				input: safeParseToolArguments(toolCall.arguments),
			});
		}
	}

	if (reasoningParts.length > 0) {
		for (const reasoning of reasoningParts) {
			if (reasoning.text.length > 0) {
				content.push({
					type: "thinking",
					thinking: reasoning.text,
					signature: reasoning.signature ?? "",
				});
			}
		}
	}

	// Map finish reason
	const stopReason = mapFinishReasonToAnthropic(mainChoice.finishReason);

	return {
		id: ir.id,
		nativeResponseId: ir.nativeId,
		type: "message",
		role: "assistant",
		content,
		model: ir.model,
		stop_reason: stopReason,
		stop_sequence: mainChoice.stopSequence ?? null,
		usage: encodeUsage(ir.usage, ir.serviceTier),
	};
}

/**
 * Map IR finish reason to Anthropic stop reason
 */
function mapFinishReasonToAnthropic(
	reason: IRChoice["finishReason"],
): AnthropicMessagesResponse["stop_reason"] {
	switch (reason) {
		case "stop":
			return "end_turn";
		case "length":
			return "max_tokens";
		case "tool_calls":
			return "tool_use";
		case "content_filter":
			return "refusal";
		case "error":
			return null;
		default:
			return "end_turn";
	}
}

function encodeUsage(
	usage: IRChatResponse["usage"] | undefined,
	serviceTier: IRChatResponse["serviceTier"] | undefined,
): AnthropicMessagesResponse["usage"] {
	const anyUsage = (usage ?? {}) as any;
	const inputTokens = anyUsage.inputTokens ?? anyUsage.promptTokens;
	const outputTokens = anyUsage.outputTokens ?? anyUsage.completionTokens;
	const tier =
		serviceTier === "standard" || serviceTier === "priority" || serviceTier === "batch"
			? serviceTier
			: null;
	return {
		cache_creation: null,
		cache_creation_input_tokens: null,
		cache_read_input_tokens: anyUsage?.cachedInputTokens ?? null,
		input_tokens: inputTokens ?? 0,
		output_tokens: outputTokens ?? 0,
		server_tool_use: null,
		service_tier: tier,
	};
}

function safeParseToolArguments(raw: string): Record<string, any> {
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function splitContentParts(
	parts: IRContentPart[],
): {
	text: string;
	reasoningParts: Array<{ text: string; signature?: string }>;
	imageParts: Array<Extract<IRContentPart, { type: "image" }>>;
} {
	if (!Array.isArray(parts)) return { text: "", reasoningParts: [], imageParts: [] };
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const reasoningParts = parts
		.filter((part) => part.type === "reasoning_text")
		.map((part) => ({
			text: part.text,
			signature: part.thoughtSignature,
		}));
	const imageParts = parts.filter((part) => part.type === "image") as Array<
		Extract<IRContentPart, { type: "image" }>
	>;
	return { text, reasoningParts, imageParts };
}

