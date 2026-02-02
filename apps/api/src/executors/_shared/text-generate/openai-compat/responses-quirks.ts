// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Responses API Quirks Helpers
// Wrapper functions for applying provider quirks to Responses API format

import type { IRChatRequest } from "@core/ir";
import { getProviderQuirks } from "./quirks";

/**
 * Apply provider-specific quirks to Responses API request
 */
export function applyResponsesRequestQuirks(args: {
	ir: IRChatRequest;
	providerId?: string;
	model?: string | null;
	request: any;
}): void {
	const quirks = getProviderQuirks(args.providerId);

	if (quirks.transformRequest) {
		quirks.transformRequest({
			request: args.request,
			ir: args.ir,
			model: args.model,
		});
	}
}

/**
 * Apply provider-specific quirks to Responses API message item
 * Returns { main: content, reasoning: [...reasoningBlocks] }
 */
export function applyResponsesResponseQuirks(args: {
	providerId?: string;
	item: any;
	rawContent: string;
}): { main: string; reasoning: string[] } {
	const quirks = getProviderQuirks(args.providerId);

	if (quirks.extractReasoning) {
		// For Responses API, we pass the item as the choice
		// The reasoning_content field is in the same place (item.reasoning_content)
		return quirks.extractReasoning({
			choice: args.item,
			rawContent: args.rawContent,
		});
	}

	// Default: no reasoning extraction
	return {
		main: args.rawContent,
		reasoning: [],
	};
}

