// Purpose: Idempotent usage charging helpers for after-stage flows.
// Why: Prevents duplicate wallet charges when finalize paths are re-entered.
// How: Tracks per-request charge attempts on pipeline context metadata.

import type { PipelineContext } from "../before/types";
import { recordUsageAndCharge } from "../pricing/persist";

export async function recordUsageAndChargeOnce(args: {
	ctx: PipelineContext;
	costNanos: number;
	endpoint: string;
}): Promise<void> {
	const { ctx, costNanos, endpoint } = args;
	if (!Number.isFinite(costNanos) || costNanos <= 0) return;

	const meta = ctx.meta as Record<string, unknown>;
	if (meta.__usageChargeRecorded === true) return;
	meta.__usageChargeRecorded = true;

	try {
		await recordUsageAndCharge({
			requestId: ctx.requestId,
			teamId: ctx.teamId,
			cost_nanos: costNanos,
		});
	} catch (chargeErr) {
		console.error("recordUsageAndCharge failed", {
			error: chargeErr,
			requestId: ctx.requestId,
			teamId: ctx.teamId,
			endpoint,
			cost_nanos: costNanos,
		});
	}
}

