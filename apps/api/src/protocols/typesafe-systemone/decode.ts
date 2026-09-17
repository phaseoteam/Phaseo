// Purpose: Decode TypeSafe's System One wire format into the gateway IR.
// Why: Keeps the native structured-evaluation contract out of routing and billing.

import type { SystemOneRequest } from "@core/schemas";
import type { IRSystemOneRequest, IRSystemOneResponse, IRUsage } from "@core/ir";

function finiteNumber(value: unknown): number | undefined {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function decodeTypeSafeSystemOneRequest(req: SystemOneRequest): IRSystemOneRequest {
	return {
		model: req.model,
		state: req.state,
		// Zod's discriminated-union inference marks the shared instruction field
		// optional here even though the runtime schema requires it. The parser has
		// already enforced the contract, so preserve the validated map as-is.
		questions: req.questions as IRSystemOneRequest["questions"],
	};
}

export function decodeTypeSafeSystemOneResponse(
	payload: any,
	modelFallback: string,
): IRSystemOneResponse {
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
