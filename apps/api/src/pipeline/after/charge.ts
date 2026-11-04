// Purpose: Idempotent usage charging helpers for after-stage flows.
// Why: Prevents duplicate wallet charges when finalize paths are re-entered.
// How: Tracks per-request charge attempts on pipeline context metadata.

import type { PipelineContext } from "../before/types";

const CHARGE_RETRY_DELAYS_MS = [0, 100, 500] as const;

async function waitBeforeRetry(delayMs: number): Promise<void> {
	if (delayMs <= 0) return;
	await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function chargesSkipped(ctx: PipelineContext): boolean {
	return Boolean(ctx.testingMode && (!ctx.billableInternalTesting || ctx.internalPricingAvailable !== true));
}

async function chargeWithRetries(ctx: PipelineContext, requestId: string, costNanos: number): Promise<unknown> {
	// Preserve fill -> debit -> invalidation order without delaying first token.
	// Fills swallow cache failures, just as synchronous persistence did.
	await Promise.all(ctx.creditCacheWrites ?? []);
	const { recordUsageAndCharge } = await import("../pricing/persist");
	let lastError: unknown = null;
	for (const delayMs of CHARGE_RETRY_DELAYS_MS) {
		try {
			await waitBeforeRetry(delayMs);
			await recordUsageAndCharge({
				requestId,
				workspaceId: ctx.workspaceId,
				cost_nanos: costNanos,
				creditSnapshotBalanceNanos: ctx.gating?.credit?.balanceNanos ?? null,
			});
			return null;
		} catch (chargeErr) {
			lastError = chargeErr;
		}
	}
	return lastError ?? new Error("usage_charge_failed");
}

// Provisional charges for a stream whose client has gone: the runtime may stop the
// upstream drain before the final usage arrives. Each charge takes only the increase
// over what was already charged, under its own idempotency key
// (`<billingRequestId>:partial:<n>`), and the final charge takes the rest.
type ProvisionalChargeState = {
	chargedNanos: number;
	attempts: number;
	closed: boolean;
	chain: Promise<void>;
};
const provisionalCharges = new WeakMap<PipelineContext, ProvisionalChargeState>();

export function provisionalChargeRequestId(billingRequestId: string, attempt: number): string {
	return `${billingRequestId}:partial:${attempt}`;
}

/** What the provisional charges for this request have taken so far. */
export function provisionalChargedNanos(ctx: PipelineContext): number {
	return provisionalCharges.get(ctx)?.chargedNanos ?? 0;
}

/**
 * Charge a stream's cost so far, before the final charge. A cost not above what is
 * already charged charges nothing. Registered synchronously, so a final charge that
 * starts afterwards waits for it.
 */
export function recordProvisionalStreamCharge(args: {
	ctx: PipelineContext;
	costNanos: number;
	endpoint: string;
}): Promise<void> {
	const { ctx, endpoint } = args;
	const costNanos = Math.floor(Number(args.costNanos));
	if (chargesSkipped(ctx) || !Number.isFinite(costNanos) || costNanos <= 0 || !ctx.billingRequestId) {
		return Promise.resolve();
	}
	if ((ctx.meta as Record<string, unknown>).__usageChargeRecorded === true) return Promise.resolve();
	let state = provisionalCharges.get(ctx);
	if (!state) {
		state = { chargedNanos: 0, attempts: 0, closed: false, chain: Promise.resolve() };
		provisionalCharges.set(ctx, state);
	}
	if (state.closed) return state.chain;
	const current = state;
	current.chain = current.chain.then(async () => {
		if (current.closed) return;
		const increment = costNanos - current.chargedNanos;
		if (increment <= 0) return;
		// A failed attempt is not retried under the same key with a different amount.
		current.attempts += 1;
		const requestId = provisionalChargeRequestId(ctx.billingRequestId, current.attempts);
		const error = await chargeWithRetries(ctx, requestId, increment);
		if (error) {
			console.error("provisional stream charge failed", { error, requestId: ctx.requestId, workspaceId: ctx.workspaceId, endpoint, cost_nanos: increment });
			return;
		}
		current.chargedNanos += increment;
	});
	return current.chain;
}

export async function recordUsageAndChargeOnce(args: {
	ctx: PipelineContext;
	costNanos: number;
	endpoint: string;
	throwOnFailure?: boolean;
}): Promise<void> {
	const { ctx, endpoint } = args;
	if (chargesSkipped(ctx)) return;

	const meta = ctx.meta as Record<string, unknown>;
	if (meta.__usageChargeRecorded === true) return;

	// Provisional charges already took part of this cost; wait for any in flight.
	const provisional = provisionalCharges.get(ctx);
	if (provisional) {
		provisional.closed = true;
		await provisional.chain;
	}
	const alreadyChargedNanos = provisional?.chargedNanos ?? 0;
	const costNanos = args.costNanos - alreadyChargedNanos;
	if (alreadyChargedNanos > 0 && costNanos <= 0) {
		meta.__usageChargeRecorded = true;
		if (costNanos < 0) {
			console.warn("provisional stream charges exceeded the final cost", {
				requestId: ctx.requestId, workspaceId: ctx.workspaceId, endpoint,
				final_cost_nanos: args.costNanos, provisional_nanos: alreadyChargedNanos,
			});
		}
		return;
	}
	if (!Number.isFinite(costNanos) || costNanos <= 0) return;

	const lastError = await chargeWithRetries(ctx, ctx.billingRequestId, costNanos);
	if (!lastError) {
		meta.__usageChargeRecorded = true;
		return;
	}

	console.error("recordUsageAndCharge failed after retries", {
		error: lastError,
		requestId: ctx.requestId,
		workspaceId: ctx.workspaceId,
		endpoint,
		cost_nanos: costNanos,
		attempts: CHARGE_RETRY_DELAYS_MS.length,
	});
	if (args.throwOnFailure) {
		throw new Error("usage_charge_persistence_failed", { cause: lastError });
	}
}
