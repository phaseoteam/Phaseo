// Purpose: Idempotent usage charging helpers for after-stage flows.
// Why: Prevents duplicate wallet charges when finalize paths are re-entered.
// How: Tracks per-request charge attempts on pipeline context metadata.

import type { PipelineContext } from "../before/types";

const CHARGE_RETRY_DELAYS_MS = [0, 100, 500] as const;
type ChargeAttempt = { workspaceId: string; requestId: string; costNanos: number; promise: Promise<void> };
// Request-owned coordination only. Weak ownership cannot retain completed
// request contexts for the isolate lifetime; Supabase still owns idempotency.
const chargeAttempts = new WeakMap<object, ChargeAttempt>();

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
	const existing = chargeAttempts.get(meta);
	if (existing) {
		if (existing.workspaceId !== ctx.workspaceId || existing.requestId !== ctx.billingRequestId || existing.costNanos !== costNanos) {
			throw new Error("settlement_identity_conflict");
		}
		return existing.promise;
	}
	if (meta.__usageChargeRecorded === true) return;
	const input = {
		requestId: ctx.billingRequestId, workspaceId: ctx.workspaceId, cost_nanos: costNanos,
		creditSnapshotBalanceNanos: ctx.gating?.credit?.balanceNanos ?? null,
	};
	const promise = (async () => {
		// Preserve fill -> debit -> invalidation order without delaying first token.
		// Fills swallow cache failures, just as synchronous persistence did.
		await Promise.all(ctx.creditCacheWrites ?? []);
		const { recordUsageAndCharge } = await import("../pricing/persist");

		let lastError: unknown = null;
		for (const delayMs of CHARGE_RETRY_DELAYS_MS) {
			try {
				await waitBeforeRetry(delayMs);
				await recordUsageAndCharge(input);
				meta.__usageChargeRecorded = true;
				return;
			} catch (chargeErr) {
				lastError = chargeErr;
			}
		}

		console.error("recordUsageAndCharge failed after retries", {
			error: lastError,
			requestId: ctx.requestId,
			workspaceId: input.workspaceId,
			endpoint,
			cost_nanos: input.cost_nanos,
			attempts: CHARGE_RETRY_DELAYS_MS.length,
		});
	})();
	const attempt = { workspaceId: input.workspaceId, requestId: input.requestId, costNanos, promise };
	// Install before any caller can cross the credit barrier or dynamic import.
	chargeAttempts.set(meta, attempt);
	try { await promise; }
	finally {
		// Failure is not success: permit a later authoritative retry with the same
		// DB idempotency key. This memory-only guard is not a durable retry queue.
		if (meta.__usageChargeRecorded !== true && chargeAttempts.get(meta) === attempt) chargeAttempts.delete(meta);
	}
}
