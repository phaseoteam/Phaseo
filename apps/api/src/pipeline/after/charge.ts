// Purpose: Idempotent usage charging helpers for after-stage flows.
// Why: Prevents duplicate wallet charges when finalize paths are re-entered.
// How: Tracks per-request charge attempts on pipeline context metadata.

import type { PipelineContext } from "../before/types";
import { recordUsageAndCharge } from "../pricing/persist";

const CHARGE_RETRY_DELAYS_MS = [0, 100, 500] as const;

async function waitBeforeRetry(delayMs: number): Promise<void> {
	if (delayMs <= 0) return;
	await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function recordUsageAndChargeOnce(args: {
	ctx: PipelineContext;
	costNanos: number;
	endpoint: string;
}): Promise<void> {
	const { ctx, costNanos, endpoint } = args;
	if (ctx.testingMode) return;
	if (!Number.isFinite(costNanos) || costNanos <= 0) return;

	const meta = ctx.meta as Record<string, unknown>;
	if (meta.__usageChargeRecorded === true) return;

	let lastError: unknown = null;
	for (const delayMs of CHARGE_RETRY_DELAYS_MS) {
		try {
			await waitBeforeRetry(delayMs);
			await recordUsageAndCharge({
				requestId: ctx.requestId,
				workspaceId: ctx.workspaceId,
				cost_nanos: costNanos,
			});
			meta.__usageChargeRecorded = true;
			return;
		} catch (chargeErr) {
			lastError = chargeErr;
		}
	}

	console.error("recordUsageAndCharge failed after retries", {
		error: lastError,
		requestId: ctx.requestId,
		workspaceId: ctx.workspaceId,
		endpoint,
		cost_nanos: costNanos,
		attempts: CHARGE_RETRY_DELAYS_MS.length,
	});
}

