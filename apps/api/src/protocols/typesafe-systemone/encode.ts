// Purpose: Encode the normalized System One response for Phaseo clients.

import type { IRSystemOneResponse } from "@core/ir";

export function encodeTypeSafeSystemOneResponse(ir: IRSystemOneResponse): any {
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
