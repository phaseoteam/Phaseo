// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type {
	ChatQuirk,
	ChatRequestQuirkContext,
	ChatResponseQuirkContext,
	ChatResponseQuirkResult,
} from "./types";
import { aionChatQuirk } from "./aion";
import { minimaxChatQuirk } from "./minimax";
import { zaiChatQuirk } from "./zai";

const QUIRKS: ChatQuirk[] = [aionChatQuirk, minimaxChatQuirk, zaiChatQuirk];

function matchingQuirks(providerId?: string): ChatQuirk[] {
	return QUIRKS.filter((quirk) => quirk.matches(providerId));
}

export function applyChatRequestQuirks(ctx: ChatRequestQuirkContext): void {
	for (const quirk of matchingQuirks(ctx.providerId)) {
		quirk.onRequest?.(ctx);
	}
}

export function applyChatResponseQuirks(
	ctx: ChatResponseQuirkContext,
): ChatResponseQuirkResult & { reasoning: string[]; main: string } {
	let main = ctx.rawContent;
	const reasoning: string[] = [];

	for (const quirk of matchingQuirks(ctx.providerId)) {
		const result = quirk.onResponse?.(ctx);
		if (!result) continue;
		if (typeof result.main === "string") {
			main = result.main;
		}
		if (Array.isArray(result.reasoning) && result.reasoning.length > 0) {
			reasoning.push(...result.reasoning);
		}
	}

	return { main, reasoning };
}

