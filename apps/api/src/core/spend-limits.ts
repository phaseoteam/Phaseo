// Purpose: Isolate-side client for API-key spend/request caps and workspace budgets.
// Why: Capped keys bypass the cached gateway context and recount usage in Postgres per request.
// How: The per-workspace SpendLimit Durable Object grants this isolate leases (slices of the
//      remaining allowance). Requests are admitted from a held slice without awaiting; only a
//      missing or exhausted slice awaits the object. Spend is recorded idempotently in the
//      background after the charge. Behind GATEWAY_SPEND_LIMIT_DO_MODE (off | shadow | enforce).
//
// Wiring (not done here):
//   before:  const decision = await checkSpendLimit({ workspaceId, keyId, admissionId: ctx.billingRequestId })
//            enforce: "denied" -> respond like `!context.keyLimit.ok` with decision.keyLimit;
//                     "unavailable" -> fall back to the request-context RPC path.
//            shadow:  shadowSpendLimit({ ... }, context.keyLimit) after the legacy check.
//   after:   recordSpend({ admission, workspaceId, keyId, billingRequestId, requestId, costNanos })
//            once the request is charged and its gateway_requests row (success = true) is queued;
//            releaseSpend(admission) when the request ends without a successful charge.

import type { GateCheck } from "@pipeline/before/types";
import { LeasePool, type LeaseTransport } from "@core/lease-pool";
import type { LeaseAcquireResult, LeaseReturn, LeaseVector } from "@core/lease-pool";
import { dispatchBackground, getBindingsIfConfigured } from "@/runtime/env";
import type { GatewayBindings } from "@/runtime/env.types";
import type { SpendDenial, SpendLeaseMeta, SpendRecordEntry, SpendRecordResult } from "@core/spend-limits.shared";

export type SpendLimitMode = "off" | "shadow" | "enforce";

export function getSpendLimitMode(bindings: Partial<GatewayBindings> | null = getBindingsIfConfigured()): SpendLimitMode {
	const value = String(bindings?.GATEWAY_SPEND_LIMIT_DO_MODE ?? "off").trim().toLowerCase();
	return value === "shadow" || value === "enforce" ? value : "off";
}

/** Handle for one admitted request; pass it to recordSpend or releaseSpend exactly once. */
export type SpendAdmission = {
	workspaceId: string;
	keyId: string;
	admissionId: string;
	leaseId: string;
	/** Admitted from a held slice without awaiting the coordinator. */
	fromSlice: boolean;
	/** Neither the key nor the workspace has a limit. */
	unlimited: boolean;
};

export type SpendLimitDecision =
	| { outcome: "allowed"; keyLimit: GateCheck; admission: SpendAdmission; source: "lease" | "coordinator" }
	| {
		outcome: "denied";
		/** Same reasons, windows and shape as the request-context key-limit / budget check. */
		keyLimit: GateCheck;
		admission: null;
		source: "coordinator";
		/** Usage is below the limit but its remainder is held by in-flight requests or other isolates. */
		contended: boolean;
	}
	/** The coordinator could not decide (binding missing, seed or RPC failure): use the RPC path. */
	| { outcome: "unavailable"; keyLimit: null; admission: null; error: string };

type SpendLimitStub = {
	acquire(workspaceId: string, keyId: string, need: LeaseVector, want: LeaseVector, returns: LeaseReturn[], admissionId: string):
		Promise<LeaseAcquireResult<SpendLeaseMeta, SpendDenial>>;
	returnLeases(workspaceId: string, returns: LeaseReturn[]): Promise<void>;
	release(workspaceId: string, leaseId: string, admissionId: string): Promise<void>;
	record(workspaceId: string, entries: SpendRecordEntry | SpendRecordEntry[]): Promise<SpendRecordResult>;
};

const MAX_POOLS = 2_000;
const RECORD_BATCH_MAX = 25;
const RECORD_BATCH_DELAY_MS = 20;

const pools = new Map<string, LeasePool<SpendLeaseMeta, SpendDenial>>();
const recordQueues = new Map<string, SpendRecordEntry[]>();

function background(promise: Promise<unknown>): void {
	const guarded = promise.catch((error) => {
		console.warn("spend_limit_background_failed", { error: error instanceof Error ? error.message : String(error) });
	});
	try {
		dispatchBackground(guarded);
	} catch {
		// Outside a request scope the promise still runs; nothing else to do.
	}
}

function stubFor(workspaceId: string): SpendLimitStub | null {
	const namespace = getBindingsIfConfigured()?.SPEND_LIMITS;
	if (!namespace) return null;
	return namespace.getByName(`spend:${workspaceId}`) as unknown as SpendLimitStub;
}

function poolKey(workspaceId: string, keyId: string): string {
	return `${workspaceId}:${keyId}`;
}

function transportFor(stub: SpendLimitStub, workspaceId: string, keyId: string, admissionId: string): LeaseTransport<SpendLeaseMeta, SpendDenial> {
	return {
		acquire: (need, want, returns) => stub.acquire(workspaceId, keyId, need, want, returns,
			need.requests > 0 ? admissionId : crypto.randomUUID()),
		returnLeases: (returns) => stub.returnLeases(workspaceId, returns),
	};
}

function poolFor(workspaceId: string, keyId: string, stub: SpendLimitStub): LeasePool<SpendLeaseMeta, SpendDenial> {
	const key = poolKey(workspaceId, keyId);
	const existing = pools.get(key);
	if (existing) return existing;
	if (pools.size >= MAX_POOLS) {
		const [oldestKey, oldest] = pools.entries().next().value as [string, LeasePool<SpendLeaseMeta, SpendDenial>];
		pools.delete(oldestKey);
		const returns = oldest.drain();
		const oldestWorkspace = oldestKey.slice(0, oldestKey.indexOf(":"));
		const oldestStub = stubFor(oldestWorkspace);
		if (returns.length && oldestStub) background(oldestStub.returnLeases(oldestWorkspace, returns));
	}
	const pool = new LeasePool<SpendLeaseMeta, SpendDenial>({ background, unitsMode: "precheck" });
	pools.set(key, pool);
	return pool;
}

function allowedGate(meta: SpendLeaseMeta): GateCheck {
	return { ok: true, reason: null, resetAt: null, now: new Date().toISOString(), buckets: meta.buckets ?? null };
}

/**
 * Decides whether one request of `keyId` may run under the key's caps and the workspace budgets.
 * Usually answered from this isolate's slice with no I/O. Never throws.
 */
export async function checkSpendLimit(args: { workspaceId: string; keyId: string; admissionId: string }): Promise<SpendLimitDecision> {
	try {
		if (!args.workspaceId || !args.keyId || !args.admissionId) throw new Error("spend_limit_scope_required");
		const stub = stubFor(args.workspaceId);
		if (!stub) return { outcome: "unavailable", keyLimit: null, admission: null, error: "spend_limit_binding_missing" };
		const pool = poolFor(args.workspaceId, args.keyId, stub);
		const result = await pool.admit(args.admissionId, { requests: 1, units: 0 },
			transportFor(stub, args.workspaceId, args.keyId, args.admissionId));
		if ("denial" in result) {
			return { outcome: "denied", keyLimit: result.denial.gate, admission: null, source: "coordinator", contended: result.denial.contended };
		}
		const { ticket } = result;
		return {
			outcome: "allowed",
			keyLimit: allowedGate(ticket.meta),
			admission: {
				workspaceId: args.workspaceId,
				keyId: args.keyId,
				admissionId: ticket.id,
				leaseId: ticket.leaseId,
				fromSlice: ticket.fromSlice,
				unlimited: ticket.meta.unlimited,
			},
			source: ticket.fromSlice ? "lease" : "coordinator",
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[gateway] spend limit check unavailable", { workspaceId: args.workspaceId, keyId: args.keyId, error: message });
		return { outcome: "unavailable", keyLimit: null, admission: null, error: message };
	}
}

async function flushRecords(workspaceId: string): Promise<void> {
	const entries = recordQueues.get(workspaceId);
	recordQueues.delete(workspaceId);
	if (!entries?.length) return;
	const stub = stubFor(workspaceId);
	if (!stub) return;
	// A lost batch is not lost spend: its gateway_requests rows are counted at the next reseed.
	const result = await stub.record(workspaceId, entries);
	for (const keyId of result?.drainKeyIds ?? []) {
		// The coordinator saw contention near a cap: hand unused slices back now.
		const pool = pools.get(poolKey(workspaceId, keyId));
		const returns = pool?.drain() ?? [];
		if (returns.length) await stub.returnLeases(workspaceId, returns);
	}
}

/**
 * Records the cost of one successful (charged) request, in the background. Idempotent on
 * `billingRequestId`. `requestId` must be the gateway_requests.request_id written for it, so the
 * coordinator's reseed does not count it twice. Pass the admission from checkSpendLimit when there
 * was one; spend from other paths (batch, realtime, video) may be recorded without one.
 */
export function recordSpend(args: {
	admission?: SpendAdmission | null;
	workspaceId: string;
	keyId: string;
	billingRequestId: string;
	requestId: string;
	costNanos: number;
	requests?: number;
	occurredAtMs?: number;
}): void {
	try {
		const costNanos = Number.isFinite(args.costNanos) && args.costNanos > 0 ? Math.round(args.costNanos) : 0;
		const admission = args.admission ?? null;
		const pool = admission ? pools.get(poolKey(admission.workspaceId, admission.keyId)) : undefined;
		if (admission && pool && !pool.settle(
			{ id: admission.admissionId, leaseId: admission.leaseId, requests: 1 },
			{ requests: 0, units: costNanos },
		)) {
			pool.markSettled(admission.admissionId);
			pool.learnUnits(costNanos);
		}
		const stub = stubFor(args.workspaceId);
		if (!stub) return;
		if (pool && admission) pool.flushReturns(transportFor(stub, admission.workspaceId, admission.keyId, admission.admissionId));
		// Nothing is limited for this key or workspace; a limit added later is seeded from Postgres.
		if (admission?.unlimited) return;
		const queue = recordQueues.get(args.workspaceId) ?? [];
		queue.push({
			keyId: args.keyId,
			billingRequestId: args.billingRequestId,
			requestId: args.requestId,
			costNanos,
			requests: args.requests ?? 1,
			occurredAtMs: args.occurredAtMs,
			leaseId: admission && admission.keyId === args.keyId ? admission.leaseId : null,
		});
		if (queue.length === 1) {
			recordQueues.set(args.workspaceId, queue);
			background(new Promise((resolve) => setTimeout(resolve, RECORD_BATCH_DELAY_MS)).then(() => flushRecords(args.workspaceId)));
		} else if (queue.length >= RECORD_BATCH_MAX) {
			background(flushRecords(args.workspaceId));
		}
	} catch (error) {
		console.error("[gateway] spend record failed", {
			workspaceId: args.workspaceId,
			billingRequestId: args.billingRequestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** Returns an admission's request slot when the request ends without a successful charge. */
export function releaseSpend(admission: SpendAdmission | null | undefined): void {
	if (!admission) return;
	try {
		const pool = pools.get(poolKey(admission.workspaceId, admission.keyId));
		const ticket = { id: admission.admissionId, leaseId: admission.leaseId, requests: 1 };
		if (pool?.settle(ticket, { requests: -1, units: 0 })) return;
		pool?.markSettled(admission.admissionId);
		if (admission.unlimited) return;
		const stub = stubFor(admission.workspaceId);
		if (stub) background(stub.release(admission.workspaceId, admission.leaseId, admission.admissionId));
	} catch (error) {
		console.error("[gateway] spend release failed", {
			workspaceId: admission.workspaceId,
			admissionId: admission.admissionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export type SpendShadowResult = {
	diverged: boolean;
	legacy: { ok: boolean; reason: string | null };
	coordinator: { outcome: SpendLimitDecision["outcome"]; reason: string | null; source: string | null; contended: boolean };
};

/**
 * Shadow mode: computes the coordinator decision in the background without enforcing it, and logs
 * `spend_limit_shadow_divergence` when it differs from the legacy check. The shadow admission is
 * released immediately, so in shadow mode call recordSpend without an admission.
 */
export function shadowSpendLimit(
	args: { workspaceId: string; keyId: string; admissionId: string },
	legacy: Pick<GateCheck, "ok" | "reason"> & Partial<GateCheck>,
): Promise<SpendShadowResult> {
	const run = (async (): Promise<SpendShadowResult> => {
		const decision = await checkSpendLimit({ ...args, admissionId: `shadow:${args.admissionId}` });
		if (decision.outcome === "allowed") releaseSpend(decision.admission);
		const legacyState = { ok: legacy?.ok !== false, reason: legacy?.reason ?? null };
		const coordinator = {
			outcome: decision.outcome,
			reason: decision.keyLimit?.reason ?? (decision.outcome === "unavailable" ? decision.error : null),
			source: decision.outcome === "unavailable" ? null : decision.source,
			contended: decision.outcome === "denied" ? decision.contended : false,
		};
		const diverged = decision.outcome !== "unavailable" &&
			((decision.outcome === "allowed") !== legacyState.ok ||
				(decision.outcome === "denied" && !legacyState.ok && coordinator.reason !== legacyState.reason));
		if (diverged || decision.outcome === "unavailable") {
			console.warn(diverged ? "spend_limit_shadow_divergence" : "spend_limit_shadow_unavailable", {
				workspaceId: args.workspaceId,
				keyId: args.keyId,
				legacy: { ...legacyState, currentValue: legacy?.currentValue ?? null, limitValue: legacy?.limitValue ?? null },
				coordinator: {
					...coordinator,
					currentValue: decision.keyLimit?.currentValue ?? null,
					limitValue: decision.keyLimit?.limitValue ?? null,
				},
			});
		}
		return { diverged, legacy: legacyState, coordinator };
	})();
	background(run);
	return run;
}

/** Clears isolate lease state (tests only). */
export function __resetSpendLimitsForTests(): void {
	pools.clear();
	recordQueues.clear();
}

/** Flushes queued spend records now (tests and shutdown paths). */
export async function flushSpendRecordsForTests(): Promise<void> {
	await Promise.all([...recordQueues.keys()].map((workspaceId) => flushRecords(workspaceId)));
}
