// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Z.AI (GLM) Provider Quirks
// Handles thinking mode activation and reasoning_content extraction

import type { ProviderQuirks } from "../../quirks/types";

export const zaiQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		// Z.AI 4.7 supports boolean thinking toggle via reasoning.enabled.
		// Keep effort-based fallback for older calls, but treat enabled=false as authoritative.
		const reasoningEnabled =
			ir.reasoning?.enabled ??
			(typeof ir.reasoning?.effort === "string" ? ir.reasoning.effort !== "none" : undefined);

		if (reasoningEnabled) {
			request.thinking = {
				type: "enabled",
				clear_thinking: false, // Preserve reasoning from previous turns (recommended)
			};
		} else if (reasoningEnabled === false) {
			request.thinking = {
				type: "disabled",
				clear_thinking: false,
			};
		}
	},

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

	normalizeResponse: ({ response }) => {
		// For Responses API: Z.AI returns multiple message items instead of reasoning + message
		// The first message is reasoning, the second is the actual answer
		const outputItems = response.output_items || response.output;

		if (!Array.isArray(outputItems) || outputItems.length < 2) {
			return; // Not a multi-message response
		}

		// Check if we have multiple consecutive message items (Z.AI pattern)
		const messageItems = outputItems.filter((item: any) => item.type === "message");

		if (messageItems.length >= 2) {
			// Convert the first message to a reasoning item
			const firstMessageIndex = outputItems.findIndex((item: any) => item.type === "message");

			if (firstMessageIndex !== -1) {
				// Transform to reasoning type - keep all other fields
				outputItems[firstMessageIndex].type = "reasoning";
			}
		}
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


