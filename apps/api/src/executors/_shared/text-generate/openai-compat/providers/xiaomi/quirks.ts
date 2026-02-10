// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Xiaomi Provider Quirks
// Handles reasoning_content field in responses (interleaved thinking)
// Documentation: https://github.com/XiaomiMiMo/MiMo-V2-Flash

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

export const xiaomiQuirks: ProviderQuirks = {
	/**
	 * Transform request to use Xiaomi's specific thinking mode parameter format
	 * Xiaomi uses chat_template_kwargs.enable_thinking instead of reasoning.enabled
	 *
	 * @see https://github.com/XiaomiMiMo/MiMo-V2-Flash#api-usage
	 */
	transformRequest: ({ request, ir }) => {
		// Xiaomi rejects OpenAI json_schema envelope on chat-completions compatibility.
		applyJsonSchemaFallback(request);

		// Check if reasoning is enabled in the IR
		const reasoningEnabled = ir.reasoning?.enabled ??
			(ir.reasoning?.effort && ir.reasoning.effort !== "none");

		if (reasoningEnabled) {
			// Xiaomi uses a nested parameter format
			request.chat_template_kwargs = {
				enable_thinking: true,
			};
		}
	},

	/**
	 * Extract reasoning from Xiaomi's reasoning_content field
	 * Xiaomi returns reasoning in choice.message.reasoning_content similar to MiniMax/Z.AI
	 */
	extractReasoning: ({ choice, rawContent }) => {
		const reasoningContent = choice.message?.reasoning_content;

		if (typeof reasoningContent === "string" && reasoningContent.length > 0) {
			return {
				main: rawContent,
				reasoning: [reasoningContent],
			};
		}

		return {
			main: rawContent,
			reasoning: [],
		};
	},

	/**
	 * Transform streaming chunks to accumulate reasoning_content deltas
	 * Xiaomi streams reasoning via delta.reasoning_content in Chat Completions format
	 */
	transformStreamChunk: ({ chunk, accumulated }) => {
		if (!chunk || !Array.isArray(chunk.choices)) return;
		const requestId = accumulated.requestId ?? "req";
		const stateMap = (accumulated.choiceStates ??= new Map<number, { reasoningChunks: string[] }>());

		const isFinal =
			chunk.object === "chat.completion" ||
			(Array.isArray(chunk.choices) && chunk.choices.some((c: any) => c?.finish_reason));

		for (const choice of chunk.choices) {
			const idx = Number(choice.index ?? 0);
			const state = stateMap.get(idx) ?? { reasoningChunks: [] };
			if (!stateMap.has(idx)) stateMap.set(idx, state);

			// Accumulate reasoning deltas from Xiaomi's reasoning_content field
			if (typeof choice.delta?.reasoning_content === "string") {
				state.reasoningChunks.push(choice.delta.reasoning_content);
			}

			// Build final reasoning_details on completion
			if (isFinal) {
				const reasoning = state.reasoningChunks.length
					? state.reasoningChunks.join("")
					: choice.message?.reasoning_content;
				if (!reasoning) continue;

				// Ensure message object exists
				choice.message ??= {};
				choice.message.reasoning_content ??= reasoning;

				// Build reasoning_details array for structured reasoning access
				if (!choice.message.reasoning_details) {
					choice.message.reasoning_details = state.reasoningChunks.length
						? state.reasoningChunks.map((text, index) => ({
							id: `${requestId}-reasoning-${idx}-${index + 1}`,
							index,
							type: "text",
							text,
						}))
						: [{
							id: `${requestId}-reasoning-${idx}-1`,
							index: 0,
							type: "text",
							text: reasoning,
						}];
				}
			}
		}
	},
};


