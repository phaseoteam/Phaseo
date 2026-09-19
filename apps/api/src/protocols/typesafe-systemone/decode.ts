// Purpose: Decode TypeSafe's System One wire format into the gateway IR.
// Why: Keeps the native structured-evaluation contract out of routing and billing.

import type { IRDecisionsResponse, IRUsage } from "@core/ir";

function finiteNumber(value: unknown): number | undefined {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function decodeTypeSafeSystemOneResponse(
	payload: any,
	modelFallback: string,
): IRDecisionsResponse {
	const rawUsage = payload?.usage;
	const usage: IRUsage | undefined = rawUsage && typeof rawUsage === "object"
		? {
			inputTokens: finiteNumber(rawUsage.input_tokens ?? rawUsage.inputTokens) ?? 0,
			outputTokens: finiteNumber(rawUsage.output_tokens ?? rawUsage.outputTokens) ?? 0,
			totalTokens: finiteNumber(rawUsage.total_tokens ?? rawUsage.totalTokens)
				?? (finiteNumber(rawUsage.input_tokens ?? rawUsage.inputTokens) ?? 0)
				+ (finiteNumber(rawUsage.output_tokens ?? rawUsage.outputTokens) ?? 0),
		}
		: undefined;

	return {
		model: typeof payload?.model === "string" && payload.model.trim()
			? payload.model
			: modelFallback,
		answers: payload?.answers && typeof payload.answers === "object" && !Array.isArray(payload.answers)
				? payload.answers
				: {},
		usage,
		rawResponse: payload,
	};
}
