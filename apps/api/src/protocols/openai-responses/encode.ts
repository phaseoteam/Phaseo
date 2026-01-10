// OpenAI Responses Protocol - Encoder
// Transforms IR → OpenAI Responses Response

import type { IRChatResponse, IRChoice, IRUsage } from "@core/ir";

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
	| { type: "reasoning_details"; reasoning: Array<{ type: "text"; text: string }> };

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

	const reasoningChoices = ir.choices.filter((c) => c.reasoning);
	if (reasoningChoices.length > 0) {
		outputItems.push({
			type: "reasoning_details",
			reasoning: reasoningChoices.map((choice) => ({
				type: "text",
				text: choice.message.content ?? "",
			})),
		});
	}

	const mainChoices = ir.choices.filter((c) => !c.reasoning);
	const choicesToRender = mainChoices.length > 0 ? mainChoices : [];

	for (const choice of choicesToRender) {
		const hasToolCalls = (choice.message.toolCalls?.length ?? 0) > 0;
		const contentValue = choice.message.content as any;
		const hasText =
			typeof contentValue === "string"
				? contentValue.length > 0 || contentValue === ""
				: false;

		const shouldEmitMessage =
			Boolean(choice.message.refusal) ||
			(!hasToolCalls && (contentValue === "" || hasText)) ||
			(hasToolCalls && typeof contentValue === "string" && contentValue.length > 0);

		if (shouldEmitMessage) {
			const content: any[] = [];
			if (typeof contentValue === "string") {
				content.push({ type: "text", text: contentValue });
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

	if (reasoningChoices.length > 0 && choicesToRender.length === 0) {
		// Only reasoning output, already added above.
	}

	const mainChoice = ir.choices.find((c) => !c.reasoning) || ir.choices[0];
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
