// Purpose: Idempotent usage charging helpers for after-stage flows.
// Why: Prevents duplicate wallet charges when finalize paths are re-entered.
// How: Tracks per-request charge attempts on pipeline context metadata.

import type { PipelineContext } from "../before/types";
import { keyIdIsOAuthClientId } from "@core/request-key";
import { recordCheckpointSpend } from "@core/spend-limits";

const CHARGE_RETRY_DELAYS_MS = [0, 100, 500] as const;

async function waitBeforeRetry(delayMs: number): Promise<void> {
	if (delayMs <= 0) return;
	await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function chargesSkipped(ctx: PipelineContext): boolean {
	return Boolean(ctx.testingMode && (!ctx.billableInternalTesting || ctx.internalPricingAvailable !== true));
}

type ChargeCall =
	| { kind: "one_off"; costNanos: number }
	| { kind: "total"; totalNanos: number; final: boolean };

const KEY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The request's API key id for the charge row; null for an OAuth access token or a non-key id. */
function chargeKeyId(ctx: PipelineContext): string | null {
	if (keyIdIsOAuthClientId(ctx.meta.apiKeyRef)) return null;
	const keyId = ctx.meta.apiKeyId ?? ctx.keyId ?? null;
	return typeof keyId === "string" && KEY_UUID.test(keyId) ? keyId : null;
}

async function chargeWithRetries(ctx: PipelineContext, call: ChargeCall): Promise<unknown> {
	// Preserve fill -> debit -> invalidation order without delaying first token.
	// Fills swallow cache failures, just as synchronous persistence did.
	await Promise.all(ctx.creditCacheWrites ?? []);
	const persist = await import("../pricing/persist");
	const base = {
		requestId: ctx.billingRequestId,
		workspaceId: ctx.workspaceId,
		creditSnapshotBalanceNanos: ctx.gating?.credit?.balanceNanos ?? null,
	};
	let lastError: unknown = null;
	for (const delayMs of CHARGE_RETRY_DELAYS_MS) {
		try {
			await waitBeforeRetry(delayMs);
			if (call.kind === "one_off") {
				const keyId = chargeKeyId(ctx);
				await persist.recordUsageAndCharge({ ...base, cost_nanos: call.costNanos, ...(keyId ? { keyId } : {}) });
			} else {
				await persist.recordRequestChargeTotal({ ...base, total_nanos: call.totalNanos, final: call.final, keyId: chargeKeyId(ctx) });
			}
			return null;
		} catch (chargeErr) {
			lastError = chargeErr;
		}
	}
	return lastError ?? new Error("usage_charge_failed");
}

// Checkpoint charges for a stream whose client has gone: the runtime may stop the upstream
// drain before the final usage arrives. Each checkpoint sends the running estimated total to
// gateway_charge_request_total, which keeps the charged total in the database and charges
// only the increase. Once a checkpoint has been sent (even if its response was lost), the
// final bill is sent the same way with final=true, so the database charges the rest or
// refunds an estimate above the final bill. Requests with no checkpoint are charged once,
// exactly as before.
type CheckpointState = {
	sent: boolean;
	closed: boolean;
	chain: Promise<void>;
};
const checkpoints = new WeakMap<PipelineContext, CheckpointState>();

/** Whether this request's charge goes through the stored total (a checkpoint was sent). */
export function requestChargedInSteps(ctx: PipelineContext): boolean {
	return (ctx.meta as Record<string, unknown>).__chargedInSteps === true;
}

/**
 * Charge a stream's estimated total so far, before its final bill. Registered synchronously,
 * so a final charge that starts afterwards waits for it; one not yet started by then is dropped.
 */
export function recordProvisionalStreamCharge(args: {
	ctx: PipelineContext;
	costNanos: number;
	endpoint: string;
}): Promise<void> {
	const { ctx, endpoint } = args;
	const totalNanos = Math.floor(Number(args.costNanos));
	if (chargesSkipped(ctx) || !Number.isFinite(totalNanos) || totalNanos <= 0 || !ctx.billingRequestId) {
		return Promise.resolve();
	}
	if ((ctx.meta as Record<string, unknown>).__usageChargeRecorded === true) return Promise.resolve();
	let state = checkpoints.get(ctx);
	if (!state) {
		state = { sent: false, closed: false, chain: Promise.resolve() };
		checkpoints.set(ctx, state);
	}
	if (state.closed) return state.chain;
	const current = state;
	current.chain = current.chain.then(async () => {
		if (current.closed) return;
		// From here the database may hold a charge for this request, whatever the response.
		current.sent = true;
		const meta = ctx.meta as Record<string, unknown>;
		meta.__chargedInSteps = true;
		// The highest estimate sent: a final bill with no provider usage is capped at it.
		meta.__checkpointTotalNanos = Math.max(Number(meta.__checkpointTotalNanos) || 0, totalNanos);
		const error = await chargeWithRetries(ctx, { kind: "total", totalNanos, final: false });
		if (error) {
			console.error("provisional stream charge failed", { error, requestId: ctx.requestId, workspaceId: ctx.workspaceId, endpoint, total_nanos: totalNanos });
		}
		// Spend limits count the charge now: if the runtime stops the drain, the request never
		// settles. Reported even after an error, as the debit may have committed; the final
		// settlement replaces this amount.
		if (!keyIdIsOAuthClientId(ctx.meta.apiKeyRef)) {
			recordCheckpointSpend({
				admission: ctx.spendAdmission,
				workspaceId: ctx.workspaceId,
				keyId: ctx.meta.apiKeyId ?? ctx.keyId ?? null,
				billingRequestId: ctx.billingRequestId,
				requestId: ctx.requestId,
				costNanos: Number(meta.__checkpointTotalNanos) || totalNanos,
				// Records can be delivered out of order; the coordinator keeps the latest.
				revision: (meta.__checkpointRevision = (Number(meta.__checkpointRevision) || 0) + 1) as number,
				internal: ctx.internal,
			});
		}
	});
	return current.chain;
}

/**
 * After a stepped request's final settlement could not be recorded: what the database holds as
 * charged for it (checkpoints, or a final that committed without its response arriving), or the
 * highest checkpoint total sent when even that cannot be read. Never 0 for a request that sent a
 * checkpoint unless the database says so.
 */
export async function chargedTotalForUnsettledRequest(ctx: PipelineContext): Promise<{ costNanos: number; stored: boolean }> {
	const lastKnown = Number((ctx.meta as Record<string, unknown>).__checkpointTotalNanos) || 0;
	try {
		const { readRequestChargeTotal } = await import("../pricing/persist");
		return { costNanos: await readRequestChargeTotal({ requestId: ctx.billingRequestId, workspaceId: ctx.workspaceId }), stored: true };
	} catch (error) {
		console.error("stepped charge total unreadable", { error, requestId: ctx.requestId, workspaceId: ctx.workspaceId });
		return { costNanos: lastKnown, stored: false };
	}
}

/** Waits for a checkpoint in flight (none starts after this); true when any checkpoint was sent. */
async function closeCheckpoints(ctx: PipelineContext): Promise<boolean> {
	const state = checkpoints.get(ctx);
	if (state) {
		state.closed = true;
		await state.chain;
	}
	return state?.sent === true;
}

/**
 * Policy for a stream charged at drain checkpoints whose final bill could not be priced: the total
 * already charged is its final, so nothing is refunded and nothing more is charged. Settles that
 * total as the final and leaves it on ctx as both the intended bill and the confirmed charge, for
 * the failure row (cost_nanos, expected_cost_nanos) and spend limits.
 */
export async function keepChargedTotalAsFinal(ctx: PipelineContext, endpoint: string): Promise<void> {
	const meta = ctx.meta as Record<string, unknown>;
	if (meta.__usageChargeRecorded === true || typeof meta.__steppedFinalTotalNanos === "number") return;
	if (!(await closeCheckpoints(ctx))) return;
	const charged = await chargedTotalForUnsettledRequest(ctx);
	await recordUsageAndChargeOnce({ ctx, costNanos: charged.costNanos, endpoint });
	ctx.uncollectedChargeNanos = charged.costNanos;
	// A failed final read the stored total back again; otherwise the final committed at this total.
	if (typeof ctx.confirmedChargeNanos !== "number") {
		ctx.confirmedChargeNanos = charged.costNanos;
		ctx.confirmedChargeSource = charged.stored ? "database" : "last_checkpoint";
	}
}

export async function recordUsageAndChargeOnce(args: {
	ctx: PipelineContext;
	costNanos: number;
	endpoint: string;
	throwOnFailure?: boolean;
}): Promise<void> {
	const { ctx, costNanos, endpoint } = args;
	if (chargesSkipped(ctx)) return;

	const meta = ctx.meta as Record<string, unknown>;
	if (meta.__usageChargeRecorded === true) return;

	const inSteps = await closeCheckpoints(ctx);
	// A stepped request's final bill is always sent, 0 included: it refunds the estimates.
	if (inSteps ? !Number.isFinite(costNanos) || costNanos < 0 : !Number.isFinite(costNanos) || costNanos <= 0) return;
	// Kept for the finalization error audit if this settlement cannot be recorded.
	if (inSteps) meta.__steppedFinalTotalNanos = Math.round(costNanos);

	const lastError = await chargeWithRetries(ctx, inSteps
		? { kind: "total", totalNanos: Math.round(costNanos), final: true }
		: { kind: "one_off", costNanos });
	if (!lastError) {
		meta.__usageChargeRecorded = true;
		return;
	}

	// The response was delivered: its failure row must carry the bill it meant to charge, and what
	// the database holds (a debit may have committed while every response was lost).
	ctx.uncollectedChargeNanos = Math.round(costNanos);
	// Unreadable: a stepped request falls back to its last checkpoint total (a known minimum); a
	// one-off charge's amount is unknown, not 0.
	const stored = await chargedTotalForUnsettledRequest(ctx);
	ctx.confirmedChargeNanos = stored.stored || inSteps ? stored.costNanos : null;
	ctx.confirmedChargeSource = stored.stored ? "database" : "last_checkpoint";
	console.error("recordUsageAndCharge failed after retries", {
		error: lastError,
		requestId: ctx.requestId,
		workspaceId: ctx.workspaceId,
		endpoint,
		cost_nanos: costNanos,
		attempts: CHARGE_RETRY_DELAYS_MS.length,
		charged_in_steps: inSteps,
		confirmed_charge_nanos: stored.costNanos,
	});
	if (args.throwOnFailure) {
		throw new Error("usage_charge_persistence_failed", { cause: lastError });
	}
}
