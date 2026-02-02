// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import { extractAionThinkBlocks, isAionProvider } from "@/providers/aion/think";
import type { ChatQuirk } from "./types";

const AION_REASONING_SPLIT_BLOCKLIST = new Set([
	"aion-labs/aion-rp-llama-3.1-8b",
	"aion-rp-llama-3.1-8b",
]);

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

export const aionChatQuirk: ChatQuirk = {
	id: "aion",
	matches: (providerId) => isAionProvider(providerId ?? ""),
	onRequest: ({ request, model }) => {
		const resolvedModel = model ?? request?.model;
		const normalized = normalizeModelName(resolvedModel);
		if (AION_REASONING_SPLIT_BLOCKLIST.has(resolvedModel ?? "") || AION_REASONING_SPLIT_BLOCKLIST.has(normalized)) {
			if ("reasoning_split" in request) {
				delete request.reasoning_split;
			}
			return;
		}
		request.reasoning_split = true;
	},
	onResponse: ({ rawContent, choice }) => {
		const parsed = extractAionThinkBlocks(rawContent);
		const splitReasoning = typeof choice?.message?.reasoning === "string"
			? choice.message.reasoning
			: null;
		const reasoning = splitReasoning ? [splitReasoning] : parsed.reasoning ?? [];
		return {
			main: parsed.main ?? "",
			reasoning,
		};
	},
};

