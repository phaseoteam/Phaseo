import type { ProviderQuirks } from "../../quirks/types";

/**
 * Searches Meta ran for a Responses result. Meta bills "$2.50 per 1,000 search queries"
 * (https://dev.meta.ai/docs/pricing-rate-limits) but has no usage counter; each search comes
 * back as a `web_search_call` output item, "An output item confirming a search was performed",
 * with only id, type and status (https://dev.meta.ai/docs/search-grounding).
 */
export function metaWebSearchCount(response: any): number {
	if (!Array.isArray(response?.output)) return 0;
	return response.output.filter((item: any) =>
		item?.type === "web_search_call" && (item.status == null || item.status === "completed"),
	).length;
}

/** Record the response's searches on its usage as server_tool_use, unless usage already counts them. */
function addMetaWebSearches(response: any): void {
	const usage = response?.usage;
	if (!usage || typeof usage !== "object") return;
	const searches = metaWebSearchCount(response);
	if (searches === 0) return;
	const serverToolUse = usage.server_tool_use && typeof usage.server_tool_use === "object" ? usage.server_tool_use : {};
	if (typeof serverToolUse.web_search_requests === "number") return;
	usage.server_tool_use = { ...serverToolUse, web_search_requests: searches };
}

export const metaQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		if (request.service_tier === "standard") {
			request.service_tier = "default";
		}
	},
	normalizeResponse: ({ response }) => addMetaWebSearches(response),
	// Streamed /v1/responses and /v1/messages clients get the upstream terminal event as is.
	normalizeStreamedResponse: ({ response }) => addMetaWebSearches(response),
};
