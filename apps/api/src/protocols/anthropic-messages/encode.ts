// Anthropic Messages Protocol - Encoder
// Transforms IR → Anthropic Messages Response

import type { IRChatResponse, IRChoice } from "@core/ir";
import { isAionProvider } from "@/providers/aion/think";

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
	stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
	stop_sequence?: string | null;
	usage?: {
		input_tokens: number;
		output_tokens: number;
	};
};

export type AnthropicResponseContent =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string }
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
	const isAion = isAionProvider(ir.provider);
	const reasoningChoices = isAion ? ir.choices.filter((c) => c.reasoning) : [];

	// Anthropic Messages API doesn't support multiple choices
	// Take the first non-reasoning choice
	const mainChoice = ir.choices.find((c) => !c.reasoning) || ir.choices[0];

	if (!mainChoice) {
		// Fallback: empty response
		return {
			id: ir.id,
			nativeResponseId: ir.nativeId,
			type: "message",
			role: "assistant",
			content: [{ type: "text", text: "" }],
			model: ir.model,
			stop_reason: "end_turn",
			usage: encodeUsage(ir.usage),
		};
	}

	const hasToolCalls = (mainChoice.message.toolCalls?.length ?? 0) > 0;
	const contentText =
		mainChoice.message.refusal ??
		(typeof mainChoice.message.content === "string"
			? mainChoice.message.content
			: mainChoice.message.content ?? "");

	if (typeof contentText === "string") {
		const shouldIncludeText =
			Boolean(mainChoice.message.refusal) ||
			contentText.length > 0 ||
			(contentText === "" && !hasToolCalls);

		if (shouldIncludeText) {
			content.push({
				type: "text",
				text: contentText,
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

	if (reasoningChoices.length > 0) {
		for (const choice of reasoningChoices) {
			const reasoningText = typeof choice.message.content === "string" ? choice.message.content : "";
			if (reasoningText.length > 0) {
				content.push({ type: "thinking", thinking: reasoningText });
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
		usage: encodeUsage(ir.usage),
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
			return "end_turn";
		case "error":
			return null;
		default:
			return "end_turn";
	}
}

function encodeUsage(usage?: IRChatResponse["usage"]): AnthropicMessagesResponse["usage"] {
	if (!usage) return undefined;
	const anyUsage = usage as any;
	const inputTokens = anyUsage.inputTokens ?? anyUsage.promptTokens;
	const outputTokens = anyUsage.outputTokens ?? anyUsage.completionTokens;
	if (inputTokens == null && outputTokens == null) return undefined;
	return {
		input_tokens: inputTokens ?? 0,
		output_tokens: outputTokens ?? 0,
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
