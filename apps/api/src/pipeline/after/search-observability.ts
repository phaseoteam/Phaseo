import { countRequestedNativeWebSearchTools } from "./tool-usage";
import type {
	ManagedSearchObservabilityEntry,
	NativeSearchObservabilityEntry,
	SearchObservability,
	SearchObservabilityCitation,
	SearchObservabilityResultItem,
} from "../before/types";

export type SearchObservabilityResult = SearchObservability;

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function firstString(values: unknown[]): string | null {
	for (const value of values) {
		const normalized = asString(value);
		if (normalized) return normalized;
	}
	return null;
}

function normalizeSearchResult(node: Record<string, unknown>): SearchObservabilityResultItem | null {
	const type = asString(node.type);
	const url = firstString([
		node.url,
		asRecord(node.source)?.url,
		asRecord(node.link)?.url,
	]);
	const title = firstString([
		node.title,
		node.name,
		asRecord(node.source)?.title,
	]);
	const snippet = firstString([
		node.snippet,
		node.summary,
		node.text,
		Array.isArray(node.highlights) ? node.highlights[0] : null,
	]);
	if (!url && !title && !snippet) return null;
	return {
		type,
		title,
		url,
		snippet,
	};
}

function normalizeCitation(node: Record<string, unknown>): SearchObservabilityCitation | null {
	const type = asString(node.type);
	const url = firstString([
		node.url,
		asRecord(node.source)?.url,
		asRecord(node.url_citation)?.url,
	]);
	const title = firstString([
		node.title,
		asRecord(node.source)?.title,
		asRecord(node.url_citation)?.title,
	]);
	const text = firstString([
		node.text,
		node.quote,
		node.quoted_text,
		node.snippet,
	]);
	if (!url && !title && !text) return null;
	return {
		type,
		title,
		url,
		text,
	};
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "string" || value.trim().length === 0) return null;
	try {
		const parsed = JSON.parse(value);
		return asRecord(parsed);
	} catch {
		return null;
	}
}

function normalizeNativeSearch(node: Record<string, unknown>): NativeSearchObservabilityEntry | null {
	const type = asString(node.type);
	const args = parseJsonObject(node.arguments);
	const query = firstString([
		node.query,
		node.search_query,
		node.input,
		args?.query,
		args?.search_query,
		args?.input,
	]);
	const status = firstString([node.status, node.state]);
	if (!type && !query && !status) return null;
	return {
		type,
		query,
		status,
	};
}

function normalizeGroundingChunk(node: Record<string, unknown>): SearchObservabilityResultItem | null {
	const web = asRecord(node.web);
	const retrievedContext = asRecord(node.retrievedContext ?? node.retrieved_context);
	const maps = asRecord(node.maps);
	const url = firstString([
		web?.uri,
		web?.url,
		retrievedContext?.uri,
		retrievedContext?.url,
		maps?.uri,
		maps?.url,
		node.url,
	]);
	const title = firstString([
		web?.title,
		retrievedContext?.title,
		maps?.title,
		node.title,
		node.name,
	]);
	const snippet = firstString([
		web?.text,
		retrievedContext?.text,
		maps?.text,
		node.snippet,
		node.summary,
	]);
	if (!url && !title && !snippet) return null;
	return {
		type: "grounding_chunk",
		title,
		url,
		snippet,
	};
}

function extractGroundingMetadata(
	node: Record<string, unknown>,
	target: {
		results: SearchObservabilityResultItem[];
		citations: SearchObservabilityCitation[];
		nativeSearches: NativeSearchObservabilityEntry[];
	},
) {
	const queries = Array.isArray(node.webSearchQueries)
		? node.webSearchQueries
		: (Array.isArray(node.web_search_queries) ? node.web_search_queries : []);
	for (const queryValue of queries) {
		const query = asString(queryValue);
		if (!query) continue;
		target.nativeSearches.push({
			type: "google_search_query",
			query,
			status: null,
		});
	}

	const groundingChunksRaw = Array.isArray(node.groundingChunks)
		? node.groundingChunks
		: (Array.isArray(node.grounding_chunks) ? node.grounding_chunks : []);
	const normalizedChunks = groundingChunksRaw.map((chunk) =>
		normalizeGroundingChunk(asRecord(chunk) ?? {}),
	);
	for (const chunk of normalizedChunks) {
		if (chunk) target.results.push(chunk);
	}

	const groundingSupportsRaw = Array.isArray(node.groundingSupports)
		? node.groundingSupports
		: (Array.isArray(node.grounding_supports) ? node.grounding_supports : []);
	for (const supportValue of groundingSupportsRaw) {
		const support = asRecord(supportValue);
		if (!support) continue;
		const segment = asRecord(support.segment);
		const text = firstString([
			segment?.text,
			support.text,
			support.segment_text,
		]);
		const indices = Array.isArray(support.groundingChunkIndices)
			? support.groundingChunkIndices
			: (Array.isArray(support.grounding_chunk_indices)
				? support.grounding_chunk_indices
				: []);
		if (indices.length === 0) {
			const fallback = text
				? {
					type: "grounding_support",
					title: null,
					url: null,
					text,
				}
				: null;
			if (fallback) target.citations.push(fallback);
			continue;
		}

		for (const indexValue of indices) {
			const index =
				typeof indexValue === "number" && Number.isFinite(indexValue)
					? Math.floor(indexValue)
					: -1;
			if (index < 0 || index >= normalizedChunks.length) continue;
			const chunk = normalizedChunks[index];
			if (!chunk && !text) continue;
			target.citations.push({
				type: "grounding_support",
				title: chunk?.title ?? null,
				url: chunk?.url ?? null,
				text,
			});
		}
	}
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		const key = keyFn(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

export function extractSearchObservability(args: {
	body?: any;
	gatewayResponse?: any;
	providerResponse?: any;
	managedSearch?: SearchObservability | null;
}): SearchObservabilityResult | null {
	const usedNativeWebSearch =
		countRequestedNativeWebSearchTools(args.body) > 0 ||
		Boolean(
			args.body &&
				typeof args.body === "object" &&
				args.body.web_search_options &&
				typeof args.body.web_search_options === "object",
		);

	const results: SearchObservabilityResult["results"] = [];
	const citations: SearchObservabilityResult["citations"] = [];
	const nativeSearches: SearchObservabilityResult["nativeSearches"] = [];
	const seen = new WeakSet<object>();

	const visit = (value: unknown) => {
		if (value == null) return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}

		const node = asRecord(value);
		if (!node) return;
		if (seen.has(node)) return;
		seen.add(node);

		const type = asString(node.type)?.toLowerCase() ?? null;
		if (type === "web_search_result" || type === "web_search_tool_result") {
			const result = normalizeSearchResult(node);
			if (result) results.push(result);
		}
		if (
			type === "web_search_call" ||
			type === "web_search_tool_call" ||
			(type === "web_search" && (node.query != null || node.input != null))
		) {
			const nativeSearch = normalizeNativeSearch(node);
			if (nativeSearch) nativeSearches.push(nativeSearch);
		}
		if (type === "url_citation" || type === "file_citation") {
			const citation = normalizeCitation(node);
			if (citation) citations.push(citation);
		}

		if (Array.isArray(node.citations)) {
			for (const citationNode of node.citations) {
				const citation = normalizeCitation(asRecord(citationNode) ?? {});
				if (citation) citations.push(citation);
			}
		}
		if (Array.isArray(node.annotations)) {
			for (const annotationNode of node.annotations) {
				const annotation = asRecord(annotationNode);
				if (!annotation) continue;
				const normalizedCitation = normalizeCitation(annotation);
				if (normalizedCitation) citations.push(normalizedCitation);
				const normalizedResult =
					(type === "web_search_result" || type === "web_search_tool_result")
						? null
						: normalizeSearchResult(annotation);
				if (
					normalizedResult &&
					normalizedResult.url &&
					normalizedResult.type &&
					normalizedResult.type.toLowerCase().includes("search")
				) {
					results.push(normalizedResult);
				}
			}
		}
		if (
			Array.isArray(node.webSearchQueries) ||
			Array.isArray(node.web_search_queries) ||
			Array.isArray(node.groundingChunks) ||
			Array.isArray(node.grounding_chunks) ||
			Array.isArray(node.groundingSupports) ||
			Array.isArray(node.grounding_supports)
		) {
			extractGroundingMetadata(node, {
				results,
				citations,
				nativeSearches,
			});
		}

		for (const child of Object.values(node)) {
			visit(child);
		}
	};

	visit(args.providerResponse);
	visit(args.gatewayResponse);

	const dedupedResults = dedupeByKey(
		results,
		(item) => `${item.type ?? ""}|${item.url ?? ""}|${item.title ?? ""}|${item.snippet ?? ""}`,
	).slice(0, 10);
	const dedupedCitations = dedupeByKey(
		citations,
		(item) => `${item.type ?? ""}|${item.url ?? ""}|${item.title ?? ""}|${item.text ?? ""}`,
	).slice(0, 20);
	const dedupedNativeSearches = dedupeByKey(
		nativeSearches.map((entry) => ({
			type: asString(entry.type),
			query: asString(entry.query),
			status: asString(entry.status),
		})),
		(item) => `${item.type ?? ""}|${item.query ?? ""}|${item.status ?? ""}`,
	).slice(0, 10);

	const nativeSearchUsed =
		usedNativeWebSearch ||
		dedupedNativeSearches.length > 0 ||
		dedupedResults.some((item) => item.type === "grounding_chunk") ||
		dedupedCitations.some((item) => item.type === "grounding_support");

	const nativeSearchObservability =
		!nativeSearchUsed &&
		dedupedResults.length === 0 &&
		dedupedCitations.length === 0 &&
		dedupedNativeSearches.length === 0
			? null
			: {
				usedNativeWebSearch: nativeSearchUsed,
				usedManagedWebSearch: false,
				resultCount: dedupedResults.length,
				citationCount: dedupedCitations.length,
				results: dedupedResults,
				citations: dedupedCitations,
				nativeSearches: dedupedNativeSearches,
				managedSearches: [],
			};

	return mergeSearchObservability(nativeSearchObservability, args.managedSearch ?? null);
}

function normalizeManagedSearchEntry(
	entry: ManagedSearchObservabilityEntry,
): ManagedSearchObservabilityEntry {
	return {
		provider: asString(entry.provider),
		query: asString(entry.query),
		requestId: asString(entry.requestId),
		searchType: asString(entry.searchType),
		resultCount:
			typeof entry.resultCount === "number" && Number.isFinite(entry.resultCount)
				? Math.max(0, Math.floor(entry.resultCount))
				: 0,
	};
}

function dedupeManagedSearches(
	items: ManagedSearchObservabilityEntry[],
): ManagedSearchObservabilityEntry[] {
	return dedupeByKey(
		items.map(normalizeManagedSearchEntry),
		(item) =>
			`${item.provider ?? ""}|${item.query ?? ""}|${item.requestId ?? ""}|${item.searchType ?? ""}|${item.resultCount}`,
	).slice(0, 10);
}

function dedupeNativeSearches(
	items: NativeSearchObservabilityEntry[],
): NativeSearchObservabilityEntry[] {
	return dedupeByKey(
		items.map((entry) => ({
			type: asString(entry.type),
			query: asString(entry.query),
			status: asString(entry.status),
		})),
		(item) => `${item.type ?? ""}|${item.query ?? ""}|${item.status ?? ""}`,
	).slice(0, 10);
}

export function mergeSearchObservability(
	...entries: Array<SearchObservability | null | undefined>
): SearchObservability | null {
	const usable = entries.filter(
		(entry): entry is SearchObservability =>
			Boolean(entry) &&
			(Array.isArray(entry?.results) ||
				Array.isArray(entry?.citations) ||
				Array.isArray(entry?.managedSearches) ||
				entry?.usedManagedWebSearch === true ||
				entry?.usedNativeWebSearch === true),
	);
	if (usable.length === 0) return null;

	const mergedResults = dedupeByKey(
		usable.flatMap((entry) => entry.results ?? []),
		(item) => `${item.type ?? ""}|${item.url ?? ""}|${item.title ?? ""}|${item.snippet ?? ""}`,
	).slice(0, 10);
	const mergedCitations = dedupeByKey(
		usable.flatMap((entry) => entry.citations ?? []),
		(item) => `${item.type ?? ""}|${item.url ?? ""}|${item.title ?? ""}|${item.text ?? ""}`,
	).slice(0, 20);
	const managedSearches = dedupeManagedSearches(
		usable.flatMap((entry) => entry.managedSearches ?? []),
	);
	const nativeSearches = dedupeNativeSearches(
		usable.flatMap((entry) => entry.nativeSearches ?? []),
	);

	return {
		usedNativeWebSearch: usable.some((entry) => entry.usedNativeWebSearch === true),
		usedManagedWebSearch: usable.some((entry) => entry.usedManagedWebSearch === true),
		resultCount: mergedResults.length,
		citationCount: mergedCitations.length,
		results: mergedResults,
		citations: mergedCitations,
		nativeSearches,
		managedSearches,
	};
}

export function buildManagedSearchObservabilityFromToolResults(
	toolResults: Array<{ content: string; isError?: boolean }>,
): SearchObservability | null {
	const perToolResults: SearchObservability[] = [];

	for (const toolResult of toolResults) {
		if (toolResult?.isError) continue;
		if (typeof toolResult?.content !== "string" || toolResult.content.trim().length === 0) {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(toolResult.content);
		} catch {
			continue;
		}

		const record = asRecord(parsed);
		if (!record) continue;
		const provider = asString(record.provider);
		const query = asString(record.query);
		const requestId = firstString([record.request_id, record.requestId]);
		const searchType = firstString([record.search_type, record.searchType]);
		const rawResults = Array.isArray(record.results) ? record.results : [];
		const results = rawResults
			.map((entry) => normalizeSearchResult(asRecord(entry) ?? {}))
			.filter((entry): entry is SearchObservabilityResultItem => entry !== null)
			.slice(0, 10);
		const citations = rawResults
			.map((entry) => {
				const node = asRecord(entry);
				if (!node) return null;
				const text = firstString([
					Array.isArray(node.highlights) ? node.highlights[0] : null,
					node.summary,
					node.text,
				]);
				const title = firstString([node.title, node.name]);
				const url = firstString([node.url, asRecord(node.source)?.url]);
				if (!text && !title && !url) return null;
				return {
					type: "managed_web_search_result",
					title,
					url,
					text,
				} satisfies SearchObservabilityCitation;
			})
			.filter((entry): entry is SearchObservabilityCitation => entry !== null)
			.slice(0, 20);

		if (!provider && !query && results.length === 0 && citations.length === 0) continue;

		perToolResults.push({
			usedNativeWebSearch: false,
			usedManagedWebSearch: true,
			resultCount: results.length,
			citationCount: citations.length,
			results,
			citations,
			nativeSearches: [],
			managedSearches: [
				{
					provider,
					query,
					requestId,
					searchType,
					resultCount: results.length,
				},
			],
		});
	}

	return mergeSearchObservability(...perToolResults);
}
