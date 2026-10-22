// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Preserves Venice extensions and reasoning across Chat/Responses formats.

import type { ProviderQuirks } from "../../quirks/types";

/**
 * Whether Venice ran its web search for this response. Venice bills web search at "$10.00
 * per 1K requests" (https://docs.venice.ai/overview/pricing) but reports no search counter in
 * usage. The response's `venice_parameters` echo the request setting and carry
 * `web_search_citations` ("Citations will be returned either in the first chunk of a streaming
 * result, or in the non streaming response";
 * https://docs.venice.ai/api-reference/endpoint/chat/completions). A search ran when citations
 * came back, or when the request forced it with enable_web_search "on" ("On will force web
 * search on the request").
 */
export function veniceRanWebSearch(veniceParameters: unknown): boolean {
	if (!veniceParameters || typeof veniceParameters !== "object") return false;
	const params = veniceParameters as Record<string, unknown>;
	if (Array.isArray(params.web_search_citations) && params.web_search_citations.length > 0) return true;
	return params.enable_web_search === "on" || params.enable_web_search === true;
}

/** Record one web search request on Venice usage, unless usage already counts searches. */
function addVeniceWebSearch(usage: any): void {
	if (!usage || typeof usage !== "object") return;
	const serverToolUse = usage.server_tool_use && typeof usage.server_tool_use === "object" ? usage.server_tool_use : {};
	if (typeof serverToolUse.web_search_requests === "number") return;
	usage.server_tool_use = { ...serverToolUse, web_search_requests: 1 };
}

export const veniceQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		const veniceParameters = (ir.vendor as any)?.venice;
		if (veniceParameters && typeof veniceParameters === "object" && !Array.isArray(veniceParameters)) {
			request.venice_parameters = { ...veniceParameters };
		}

		const isResponsesRequest = request.input_items != null || request.input != null;
		if (!isResponsesRequest) return;

		if (request.input == null && request.input_items != null) {
			request.input = request.input_items;
			delete request.input_items;
		}
	},
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice.message?.reasoning_content || choice.message?.reasoning;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
	normalizeResponse: ({ response }) => {
		if (veniceRanWebSearch(response?.venice_parameters)) addVeniceWebSearch(response?.usage);
	},
	transformStreamChunk: ({ chunk, accumulated }) => {
		// Citations arrive on the first chunk, usage on the last one.
		if (veniceRanWebSearch(chunk?.venice_parameters) && accumulated) accumulated.veniceWebSearch = true;
		if (chunk?.usage && accumulated?.veniceWebSearch) addVeniceWebSearch(chunk.usage);
		if (!Array.isArray(chunk?.choices)) return;
		for (const choice of chunk.choices) {
			const reasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning;
			if (typeof reasoning !== "string" || reasoning.length === 0) continue;
			choice.delta.reasoning_content ||= reasoning;
			choice.delta.reasoning_details ??= [{ type: "text", text: reasoning }];
		}
	},
};
