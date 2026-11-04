// Purpose: Protocol adapter for rerank payloads.
// Why: Encode IR rerank request/response to OpenAI-compatible shape.
// How: Maps IR rerank objects into /rerank request/response payloads.

import type { IRRerankRequest, IRRerankResponse } from "@core/ir";

export function encodeOpenAIRerankRequest(ir: IRRerankRequest): any {
	return {
		model: ir.model,
		query: ir.query,
		documents: ir.documents,
		top_n: ir.topN,
		return_documents: ir.returnDocuments,
		max_chunks_per_doc: ir.maxChunksPerDoc,
		max_tokens_per_doc: ir.maxTokensPerDoc,
		priority: ir.priority,
		rank_fields: ir.rankFields,
		user: ir.userId,
		service_tier: ir.serviceTier,
		metadata: ir.metadata,
		...(ir.vendor?.provider_options
			? { provider_options: ir.vendor.provider_options }
			: {}),
	};
}

export function encodeOpenAIRerankResponse(ir: IRRerankResponse): any {
	return {
		object: "list",
		id: ir.id ?? undefined,
		nativeResponseId: ir.nativeId ?? undefined,
		model: ir.model,
		results: (ir.results ?? []).map((entry) => ({
			index: entry.index,
			relevance_score: entry.relevanceScore,
			...(entry.document !== undefined ? { document: entry.document } : {}),
			...(entry.relevantSpans !== undefined ? { relevant_spans: entry.relevantSpans } : {}),
		})),
		...(ir.usage
			? {
				usage: {
					input_tokens: ir.usage.inputTokens ?? undefined,
					output_tokens: ir.usage.outputTokens ?? undefined,
					total_tokens: ir.usage.totalTokens ?? undefined,
					search_units: ir.usage.searchUnits ?? undefined,
				},
			}
			: {}),
	};
}
