// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Chat Completions Quirks Helpers
// Wrapper functions for applying provider quirks to chat completions

import type { IRChatRequest } from "@core/ir";
import { getProviderQuirks } from "./quirks";

/**
 * Apply provider-specific quirks to chat request
 */
export function applyChatRequestQuirks(args: {
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
 * Apply provider-specific quirks to chat response
 * Returns { main: content, reasoning: [...reasoningBlocks] }
 */
export function applyChatResponseQuirks(args: {
	providerId?: string;
	choice: any;
	rawContent: string;
}): { main: string; reasoning: string[] } {
	const quirks = getProviderQuirks(args.providerId);

	if (quirks.extractReasoning) {
		return quirks.extractReasoning({
			choice: args.choice,
			rawContent: args.rawContent,
		});
	}

	// Default: no reasoning extraction
	return {
		main: args.rawContent,
		reasoning: [],
	};
}

