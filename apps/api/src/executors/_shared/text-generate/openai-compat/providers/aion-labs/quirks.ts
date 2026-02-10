// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Aion Labs Provider Quirks
// Handles <think>...</think> tags in responses

import type { ProviderQuirks } from "../../quirks/types";
import { extractAionThinkBlocks } from "@/providers/aion/think";
import { createAionThinkStreamState, processAionThinkStreamDelta } from "@/providers/aion/think";

export const aionQuirks: ProviderQuirks = {
	extractReasoning: ({ rawContent }) => {
		const parsed = extractAionThinkBlocks(rawContent);
		return {
			main: parsed.main ?? "",
			reasoning: parsed.reasoning,
		};
	},

	transformStreamChunk: ({ chunk, accumulated }) => {
		if (!chunk || !Array.isArray(chunk.choices)) return;
		const stateMap = (accumulated.aionStates ??= new Map<number, ReturnType<typeof createAionThinkStreamState>>());
		const requestId = accumulated.requestId ?? "req";

		const isFinal =
			chunk.object === "chat.completion" ||
			(Array.isArray(chunk.choices) && chunk.choices.some((c: any) => c?.finish_reason));

		for (const choice of chunk.choices) {
			const idx = Number(choice.index ?? 0);
			const state = stateMap.get(idx) ?? createAionThinkStreamState();
			if (!stateMap.has(idx)) stateMap.set(idx, state);

			if (typeof choice.delta?.content === "string") {
				const { mainDelta, reasoningDelta } = processAionThinkStreamDelta(state, choice.delta.content);
				choice.delta.content = mainDelta;
				if (reasoningDelta.length > 0) {
					choice.delta.reasoning_content = reasoningDelta;
				}
			}

			if (isFinal && typeof choice.message?.content === "string") {
				const parsed = extractAionThinkBlocks(choice.message.content);
				choice.message.content = parsed.main ?? "";
				if (parsed.reasoning.length > 0) {
					choice.message.reasoning_content = parsed.reasoning.join("");
				}
				if (!choice.message.reasoning_details && parsed.reasoning.length > 0) {
					choice.message.reasoning_details = parsed.reasoning.map((text, index) => ({
						id: `${requestId}-reasoning-${idx}-${index + 1}`,
						index,
						type: "text",
						text,
					}));
				}
			}

			if (isFinal && !choice.message?.reasoning_details && state.reasoningChunks.length > 0) {
				choice.message ??= {};
				choice.message.reasoning_content ??= state.reasoningChunks.join("");
				choice.message.reasoning_details = state.reasoningChunks.map((text, index) => ({
					id: `${requestId}-reasoning-${idx}-${index + 1}`,
					index,
					type: "text",
					text,
				}));
			}
		}
	},
};


