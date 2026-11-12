// Purpose: Strip the parts of a request's search and web-fetch details that come from what was asked.
// Why: Search queries, results, citations, titles and fetched URLs are request content. Keys that
// never store content keep none of them, and callers who may not read a workspace's stored contents
// (contents limited to owners and admins) must not get them from the request detail either.
// How: Keep counts and statuses; empty every content field. Shared by the audit writer and readers.

/** Search details without queries, results or citations. Leaves other values alone. */
export function searchObservabilityWithoutContent(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	return { ...(value as Record<string, unknown>), results: [], citations: [], nativeSearches: [], managedSearches: [] };
}

/** Web-fetch details without URLs or page titles. Leaves other values alone. */
export function webFetchObservabilityWithoutContent(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const fetches = (value as { fetches?: unknown }).fetches;
	return {
		...(value as Record<string, unknown>),
		fetches: Array.isArray(fetches)
			? fetches.map((entry) => {
				const record = { ...(entry as Record<string, unknown>), url: null, finalUrl: null, title: null } as Record<string, unknown>;
				if ("final_url" in record) record.final_url = null;
				return record;
			})
			: fetches,
	};
}

/** A gateway_requests.detail_metadata value with its search and fetch content removed. */
export function detailMetadataWithoutContent<T>(detail: T): T {
	if (!detail || typeof detail !== "object" || Array.isArray(detail)) return detail;
	const record = detail as Record<string, unknown>;
	const next: Record<string, unknown> = { ...record };
	if ("search_observability" in record) next.search_observability = searchObservabilityWithoutContent(record.search_observability);
	if ("web_fetch_observability" in record) next.web_fetch_observability = webFetchObservabilityWithoutContent(record.web_fetch_observability);
	return next as T;
}
