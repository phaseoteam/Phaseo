// Purpose: Keep verbatim Responses input items on the routes that understand them.
// Why: Items such as shell_call, computer_call_output, mcp_call, compaction and
//      item_reference exist only in OpenAI's Responses API. OpenAI needs them
//      back to continue a hosted or local tool loop; any other provider's API
//      has no such item, so they are removed there. The removal is reported like
//      any other dropped parameter (X-Phaseo-Dropped-Params,
//      meta.routing.dropped_params) instead of happening silently.
// How: Runs per provider attempt in the execute stage, next to
//      dropUnsupportedParams (./unsupportedParams.ts).

import type { IRChatRequest, IRMessage } from "@core/ir";
import type { DroppedParam } from "./unsupportedParams";

// Providers whose executor sends `responses_item` parts upstream unchanged.
const VERBATIM_ITEM_PROVIDERS = new Set(["openai", "openai-eu"]);

export function keepsVerbatimResponsesItems(providerId: string): boolean {
	return VERBATIM_ITEM_PROVIDERS.has(providerId);
}

/**
 * Removes the verbatim Responses input items from a request for a provider that
 * cannot take them. Each item type removed is reported once, as `input.<type>`.
 * Returns the request unchanged (same object) when there is nothing to remove.
 */
export function dropVerbatimResponsesItems(
	ir: IRChatRequest,
	providerId: string,
): { ir: IRChatRequest; dropped: DroppedParam[] } {
	if (keepsVerbatimResponsesItems(providerId)) return { ir, dropped: [] };
	const removedTypes = new Set<string>();
	let changed = false;
	const messages: IRMessage[] = [];
	for (const message of ir.messages) {
		if (message.role === "tool" || !message.content.some((part) => part.type === "responses_item")) {
			messages.push(message);
			continue;
		}
		changed = true;
		const content = message.content.filter((part) => {
			if (part.type !== "responses_item") return true;
			removedTypes.add(String(part.item?.type ?? "unknown"));
			return false;
		});
		if (content.length > 0) messages.push({ ...message, content } as IRMessage);
	}
	if (!changed) return { ir, dropped: [] };
	return {
		ir: { ...ir, messages },
		dropped: Array.from(removedTypes, (type) => ({
			param: `input.${type}`,
			reason: "unsupported_by_provider" as const,
			source: "provider_api" as const,
			clientSent: true,
		})),
	};
}
