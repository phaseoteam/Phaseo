// Purpose: Alert when a synchronous media call is priced at $0 after the provider succeeded.
// Why: Batch and video finalisation already flag a paid result that settles at zero; image,
//      speech, transcription, music, OCR and parse calls settle inline and had no such check.
// How: After pricing, the same conditions raise a gateway operational failure (Axiom) and log.

import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import type { PriceCard } from "../pricing/types";
import { isUnexpectedZeroCostMedia } from "@core/synchronous-media";
import { emitGatewayOperationalFailure } from "@observability/axiom";
import { dispatchBackground } from "@/runtime/env";

export function alertUnexpectedZeroCostMedia(args: {
	ctx: PipelineContext;
	result: RequestResult;
	card: PriceCard | null | undefined;
	totalNanos: number;
}): boolean {
	const { ctx, result, card, totalNanos } = args;
	if (ctx.testingMode && !ctx.billableInternalTesting) return false;
	const flagged = isUnexpectedZeroCostMedia({
		capability: ctx.capability,
		card,
		totalNanos,
		upstreamOk: result.upstream?.ok === true,
		keySource: result.keySource ?? ctx.meta?.keySource,
	});
	if (!flagged) return false;
	const detail = {
		requestId: ctx.requestId,
		workspaceId: ctx.workspaceId,
		capability: ctx.capability,
		provider: result.provider,
		model: result.apiModelId ?? ctx.model,
		meters: Object.keys(result.bill?.usage ?? {}).filter((key) => key !== "pricing"),
	};
	console.error("[gateway] media_unexpected_zero_cost", detail);
	try {
		dispatchBackground(emitGatewayOperationalFailure({
			workflow: "media_finalization",
			workspaceId: ctx.workspaceId,
			resourceId: ctx.requestId,
			reason: "unexpected_zero_cost",
			error: new Error(`Successful ${ctx.capability} call on ${result.provider} priced at zero against a paid price card`),
		}));
	} catch (error) {
		// Alerting must never fail the delivered response.
		console.error("[gateway] media zero-cost alert dispatch failed", error);
	}
	return true;
}
