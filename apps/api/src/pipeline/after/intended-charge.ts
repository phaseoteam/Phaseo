import type { PipelineContext } from "../before/types";

/** Testing-mode requests are not charged unless internal billing with internal pricing is on. */
export function chargesSkipped(ctx: PipelineContext): boolean {
	return Boolean(ctx.testingMode && (!ctx.billableInternalTesting || ctx.internalPricingAvailable !== true));
}

/**
 * The bill a request means to charge, once priced. A failure row pending reconciliation records it
 * as expected_cost_nanos even when the error came before the charge was attempted.
 */
export function noteIntendedCharge(ctx: PipelineContext, costNanos: number): void {
	if (chargesSkipped(ctx) || !Number.isFinite(costNanos) || costNanos < 0) return;
	(ctx.meta as Record<string, unknown>).__intendedChargeNanos = Math.round(costNanos);
}
