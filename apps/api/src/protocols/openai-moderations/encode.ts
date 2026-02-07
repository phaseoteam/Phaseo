// Purpose: Protocol adapter for moderations payloads.
// Why: Encode IR moderations responses to OpenAI-compatible shape.
// How: Maps IRModerationsResponse to OpenAI moderations response format.

import type { IRModerationsResponse } from "@core/ir";

export function encodeOpenAIModerationsResponse(ir: IRModerationsResponse): any {
	const results = (ir.results ?? []).map((entry) => ({
		flagged: Boolean(entry.flagged),
		categories: entry.categories ?? undefined,
		category_scores: entry.categoryScores ?? undefined,
		category_applied_input_types: entry.categoryAppliedInputTypes ?? undefined,
	}));

	return {
		object: "list",
		id: ir.id ?? undefined,
		nativeResponseId: ir.nativeId ?? undefined,
		model: ir.model,
		results,
		...(ir.usage
			? {
				usage: {
					input_tokens: ir.usage.inputTokens ?? undefined,
					output_tokens: ir.usage.outputTokens ?? undefined,
					total_tokens: ir.usage.totalTokens ?? undefined,
				},
			}
			: {}),
	};
}
