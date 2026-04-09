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
	return {
		index: Number.isFinite(Number(indexRaw)) ? Number(indexRaw) : fallbackIndex,
		relevanceScore: Number.isFinite(Number(relevanceRaw)) ? Number(relevanceRaw) : 0,
		document: entry?.document ?? entry?.input ?? undefined,
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
		rankFields: req.rank_fields,
		userId: req.user,
		metadata: req.metadata,
		vendor: req.provider_options
			? { provider_options: req.provider_options }
			: undefined,
	};
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
	return {
		id: payload?.id ?? undefined,
		nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
		model: payload?.model ?? modelFallback,
		results,
		usage: usageRaw
			? {
				inputTokens: toNumber(usageRaw?.input_tokens ?? usageRaw?.prompt_tokens ?? usageRaw?.text_tokens),
				outputTokens: toNumber(usageRaw?.output_tokens ?? usageRaw?.completion_tokens),
				totalTokens: toNumber(usageRaw?.total_tokens),
			}
			: undefined,
	};
}
