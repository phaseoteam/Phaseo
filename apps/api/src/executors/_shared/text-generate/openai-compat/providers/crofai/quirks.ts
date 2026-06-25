// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: CrofAI reasoning models emit reasoning_content similarly to Xiaomi/MiniMax style responses.
// How: Preserves reasoning_content and synthesizes reasoning_details during buffered and streaming normalization.

import type { ProviderQuirks } from "../../quirks/types";
import { normalizeK27CodeRequest } from "../moonshot-ai/quirks";

export const crofAIQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		normalizeK27CodeRequest(request);
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

	normalizeResponse: ({ response }) => {
		if (!Array.isArray(response?.choices)) return;

		for (const [idx, choice] of response.choices.entries()) {
			const message = choice?.message;
			if (!message || typeof message !== "object") continue;
			const reasoningContent = message.reasoning_content;
			if (typeof reasoningContent !== "string" || reasoningContent.length === 0) continue;

			if (!Array.isArray(message.reasoning_details) || message.reasoning_details.length === 0) {
				message.reasoning_details = [{
					id: `crofai-reasoning-${idx + 1}`,
					index: 0,
					type: "text",
					text: reasoningContent,
				}];
			}
		}
	},
};
