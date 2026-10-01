// Purpose: Idempotent usage charging helpers for after-stage flows.
// Why: Prevents duplicate wallet charges when finalize paths are re-entered.
// How: Tracks per-request charge attempts on pipeline context metadata.

import type { PipelineContext } from "../before/types";
import { recordSettlement, recordSettlementAttempt } from "@/runtime/request-operations";

const CHARGE_RETRY_DELAYS_MS = [0, 100, 500] as const;
const DEBIT_TIMEOUT_MS = 5_000;
type ChargeAttempt = { workspaceId: string; requestId: string; costNanos: number; promise?: Promise<void> };
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
		if (existing.promise) return existing.promise;
	}
	if (meta.__usageChargeRecorded === true) return;
	const input = {
		requestId: ctx.billingRequestId, workspaceId: ctx.workspaceId, cost_nanos: costNanos,
		creditSnapshotBalanceNanos: ctx.gating?.credit?.balanceNanos ?? null,
	};
	const promise = (async () => {
		recordSettlement("pending");
		// Preserve fill -> debit -> invalidation order without delaying first token.
		// Fills swallow cache failures, just as synchronous persistence did.
		await Promise.all(ctx.creditCacheWrites ?? []);
		const { recordUsageAndCharge } = await import("../pricing/persist");

		let lastError: unknown = null;
		for (const delayMs of CHARGE_RETRY_DELAYS_MS) {
			try {
				await waitBeforeRetry(delayMs);
				// A stalled debit must not prevent exhausted attempts reaching recovery.
				// Abort is ambiguous: every retry keeps the same DB identity and amount.
				const debit = new AbortController();
				const deadline = setTimeout(() => debit.abort(), DEBIT_TIMEOUT_MS);
				recordSettlementAttempt();
				try { await recordUsageAndCharge({ ...input, debitSignal: debit.signal }); }
				finally { clearTimeout(deadline); }
				meta.__usageChargeRecorded = true;
				recordSettlement("confirmed");
				return;
			} catch (chargeErr) {
				lastError = chargeErr;
			}
		}

		let recoveryQueued = false;
		try {
			const { enqueueSettlementRecovery } = await import("@/core/settlement-recovery");
			recoveryQueued = await enqueueSettlementRecovery(input);
			if (recoveryQueued) meta.__usageChargeRecoveryEnqueued = true;
		} catch {
			console.error("settlement_recovery_enqueue_failed", { requestId: input.requestId, workspaceId: input.workspaceId });
		}
		recordSettlement(recoveryQueued ? "recovery_queued" : "unresolved");
		console.error("recordUsageAndCharge failed after retries", {
			recoveryQueued,
			error: lastError,
			requestId: ctx.requestId,
			workspaceId: input.workspaceId,
			endpoint,
			cost_nanos: input.cost_nanos,
			attempts: CHARGE_RETRY_DELAYS_MS.length,
		});
	})();
	const attempt: ChargeAttempt = { workspaceId: input.workspaceId, requestId: input.requestId, costNanos, promise };
	// Install before any caller can cross the credit barrier or dynamic import.
	chargeAttempts.set(meta, attempt);
	try { await promise; }
	finally {
		// An unconfirmed debit/handoff may have committed. Release only the
		// attempt promise so a later retry can run; never forget its identity.
		// Weak ownership bounds this memory-only fence to the request lifetime.
		if (meta.__usageChargeRecorded !== true && meta.__usageChargeRecoveryEnqueued !== true && chargeAttempts.get(meta) === attempt) attempt.promise = undefined;
	}
}
