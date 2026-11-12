// Purpose: Keep assistant audio references on the Chat routes that understand them.
// Why: An assistant message's `audio: { id }` points at an earlier audio
//      response held by OpenAI (or Azure OpenAI) so a multi-turn audio
//      conversation can continue. No other provider's API has such a field, so
//      the reference is removed there and reported like any other dropped
//      parameter (X-Phaseo-Dropped-Params, meta.routing.dropped_params)
//      instead of disappearing silently.
// How: Runs per provider attempt in the execute stage, next to
//      dropVerbatimResponsesItems (./responsesItems.ts).

import type { IRChatRequest, IRMessage } from "@core/ir";
import { sendsAssistantAudioReference } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import type { DroppedParam } from "./unsupportedParams";

/**
 * Removes assistant `audio` references from a request for a provider that
 * cannot take them, reported once as `messages.audio`. The messages themselves
 * are kept. Returns the request unchanged (same object) when there is nothing
 * to remove.
 */
export function dropAssistantAudioReferences(
	ir: IRChatRequest,
	providerId: string,
): { ir: IRChatRequest; dropped: DroppedParam[] } {
	if (sendsAssistantAudioReference(providerId)) return { ir, dropped: [] };
	if (!ir.messages.some((message) => message.role === "assistant" && message.audio)) return { ir, dropped: [] };
	const messages: IRMessage[] = ir.messages.map((message) => {
		if (message.role !== "assistant" || !message.audio) return message;
		const { audio: _audio, ...rest } = message;
		return rest;
	});
	return {
		ir: { ...ir, messages },
		dropped: [{
			param: "messages.audio",
			reason: "unsupported_by_provider",
			source: "provider_api",
			clientSent: true,
		}],
	};
}
