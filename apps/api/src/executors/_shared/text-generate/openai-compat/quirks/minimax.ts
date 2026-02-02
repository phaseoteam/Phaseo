// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// MiniMax Provider Quirks
// Handles reasoning_content field in responses

import type { ProviderQuirks } from "./types";

export const minimaxQuirks: ProviderQuirks = {
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

			if (typeof choice.delta?.reasoning_content === "string") {
				state.reasoningChunks.push(choice.delta.reasoning_content);
			}

			if (isFinal) {
				const reasoning = state.reasoningChunks.length
					? state.reasoningChunks.join("")
					: choice.message?.reasoning_content;
				if (!reasoning) continue;
				choice.message ??= {};
				choice.message.reasoning_content ??= reasoning;
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

