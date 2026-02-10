// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Bridges chat request/response quirk application to provider quirk registry.

import type { IRChatRequest } from "@core/ir";
import { getProviderQuirks } from "./quirks";

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

	return {
		main: args.rawContent,
		reasoning: [],
	};
}

