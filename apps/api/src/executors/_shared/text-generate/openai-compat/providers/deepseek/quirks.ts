// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// DeepSeek Provider Quirks
// Handles reasoning_content field in thinking mode responses
// Documentation: https://api-docs.deepseek.com/guides/thinking_mode

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

export const deepseekQuirks: ProviderQuirks = {
	/**
	 * DeepSeek JSON mode supports json_object and rejects OpenAI json_schema payload shapes.
	 * Convert structured-output requests to json_object + instruction fallback.
	 */
	transformRequest: ({ request }) => {
		applyJsonSchemaFallback(request);

		// DeepSeek documents system/user/assistant/tool message roles.
		// Normalize gateway "developer" role to "system" for compatibility.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}
	},

	/**
	 * Extract reasoning from DeepSeek's reasoning_content field
	 * DeepSeek returns reasoning in choice.message.reasoning_content when thinking mode is enabled
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
	 * DeepSeek streams reasoning via delta.reasoning_content
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

			// Accumulate reasoning deltas
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

				// Build reasoning_details array
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


