// Purpose: Encode a provider-neutral Decisions response for Phaseo clients.

import type { IRDecisionsResponse } from "@core/ir";

export function encodeDecisionsResponse(ir: IRDecisionsResponse): any {
	return {
		model: ir.model,
		answers: ir.answers,
		...(ir.usage
			? {
				usage: {
					input_tokens: ir.usage.inputTokens,
					output_tokens: ir.usage.outputTokens,
					total_tokens: ir.usage.totalTokens,
				},
			}
			: {}),
	};
}
