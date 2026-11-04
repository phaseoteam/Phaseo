// Purpose: Protocol adapter for rerank payloads.
// Why: Normalize OpenAI-compatible rerank requests/responses to IR.
// How: Maps OpenAI-compatible rerank shapes to IR rerank types.

import type { RerankRequest } from "@core/schemas";
import type {
	IRRerankRequest,
	IRRerankResponse,
	IRRerankResult,
} from "@core/ir";

function normalizeDocument(value: unknown): string | Record<string, any> {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, any>;
	}
	return String(value ?? "");
}

function toNumber(value: unknown): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function normalizeResult(entry: any, fallbackIndex: number): IRRerankResult {
	const indexRaw = entry?.index ?? entry?.document_index ?? entry?.documentIndex;
	const relevanceRaw =
		entry?.relevance_score ??
		entry?.relevanceScore ??
		entry?.score;
	const spans = Array.isArray(entry?.relevant_spans)
		? entry.relevant_spans
			.map((span: any) => ({ start: toNumber(span?.start), end: toNumber(span?.end), score: toNumber(span?.score) }))
			.filter((span: { start?: number; end?: number; score?: number }): span is { start: number; end: number; score: number } =>
				span.start !== undefined && span.end !== undefined && span.score !== undefined)
		: undefined;
	return {
		index: Number.isFinite(Number(indexRaw)) ? Number(indexRaw) : fallbackIndex,
		relevanceScore: Number.isFinite(Number(relevanceRaw)) ? Number(relevanceRaw) : 0,
		document: entry?.document ?? entry?.input ?? undefined,
		...(spans ? { relevantSpans: spans } : {}),
	};
}

export function decodeOpenAIRerankRequest(req: RerankRequest): IRRerankRequest {
	return {
		model: req.model,
		query: req.query,
		documents: Array.isArray(req.documents)
			? req.documents.map((doc) => normalizeDocument(doc))
			: [],
		topN: req.top_n,
		returnDocuments: req.return_documents,
		maxChunksPerDoc: req.max_chunks_per_doc,
		maxTokensPerDoc: req.max_tokens_per_doc,
		priority: req.priority,
		rankFields: req.rank_fields,
		userId: req.user,
		serviceTier: req.service_tier,
		metadata: req.metadata,
		vendor: vendorOptions(req),
	};
}

// Cohere-native callers send relevant_spans at the top level; keep it as a Cohere
// provider option so other providers never receive it.
function vendorOptions(req: RerankRequest): IRRerankRequest["vendor"] {
	const topLevelSpans = (req as Record<string, unknown>).relevant_spans;
	const options = req.provider_options as Record<string, any> | undefined;
	if (!topLevelSpans || typeof topLevelSpans !== "object" || Array.isArray(topLevelSpans)) {
		return options ? { provider_options: options } : undefined;
	}
	const cohere = { ...(options?.cohere ?? {}) };
	if (cohere.relevant_spans === undefined) cohere.relevant_spans = topLevelSpans;
	return { provider_options: { ...(options ?? {}), cohere } };
}

export function decodeOpenAIRerankResponse(
	payload: any,
	modelFallback: string,
): IRRerankResponse {
	const resultsRaw = Array.isArray(payload?.results)
		? payload.results
		: (Array.isArray(payload?.data) ? payload.data : []);
	const results = resultsRaw.map((entry: any, index: number) =>
		normalizeResult(entry, index),
	);
	const usageRaw = payload?.usage;
	const searchUnits = toNumber(payload?.meta?.billed_units?.search_units);
	// Cohere Rerank v5 bills input tokens instead of search units
	// (https://docs.cohere.com/v2/reference/rerank: meta.billed_units.input_tokens).
	const billedInputTokens = toNumber(payload?.meta?.billed_units?.input_tokens ?? payload?.meta?.tokens?.input_tokens);
	return {
		id: payload?.id ?? undefined,
		nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
		model: payload?.model ?? modelFallback,
		results,
		usage: usageRaw || searchUnits !== undefined || billedInputTokens !== undefined
			? {
				inputTokens: toNumber(usageRaw?.input_tokens ?? usageRaw?.prompt_tokens ?? usageRaw?.text_tokens) ?? billedInputTokens,
				outputTokens: toNumber(usageRaw?.output_tokens ?? usageRaw?.completion_tokens),
				totalTokens: toNumber(usageRaw?.total_tokens),
				searchUnits,
			}
			: undefined,
	};
}
