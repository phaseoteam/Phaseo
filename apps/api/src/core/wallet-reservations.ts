// Purpose: Wallet reservation RPC helpers for async billing workflows.
// Why: Long-running generation jobs require hold/capture/release semantics.
// How: Wraps Supabase RPCs and normalizes idempotent status responses.

import { getSupabaseAdmin } from "@/runtime/env";
import { invalidateGatewayCreditCache } from "@core/gateway-credit-cache";
import { setKeyVersion } from "@core/kv";

export type WalletReservationStatus =
	| "held"
	| "captured"
	| "released"
	| "insufficient_funds"
	| "insufficient_balance"
	| "daily_request_limit_reached"
	| "weekly_request_limit_reached"
	| "monthly_request_limit_reached"
	| "daily_cost_limit_reached"
	| "weekly_cost_limit_reached"
	| "monthly_cost_limit_reached"
	| "workspace_daily_cost_budget_reached"
	| "workspace_weekly_cost_budget_reached"
	| "workspace_monthly_cost_budget_reached"
	| "workspace_lifetime_cost_budget_reached"
	| "key_limit_soft_blocked"
	| "key_not_found"
	| "key_not_active"
	| "key_wrong_workspace"
	| "reserved_balance_mismatch"
	| "reservation_exceeded"
	| "reservation_not_active"
	| "wallet_not_found"
	| "not_found"
	| "unknown";

export type WalletReservationResult = {
	applied: boolean;
	alreadyApplied: boolean;
	status: WalletReservationStatus;
	amountNanos: number;
	beforeBalanceNanos: number | null;
	afterBalanceNanos: number | null;
	beforeReservedNanos: number | null;
	afterReservedNanos: number | null;
};

type WalletReservationRpcRow = {
	ok?: boolean | null;
	reason?: string | null;
	applied?: boolean | null;
	already_applied?: boolean | null;
	status?: string | null;
	amount_nanos?: number | null;
	before_balance_nanos?: number | null;
	after_balance_nanos?: number | null;
	before_reserved_nanos?: number | null;
	after_reserved_nanos?: number | null;
};

type ReservationRpcPayload = {
	p_workspace_id?: string;
	p_team_id?: string;
	p_reservation_id: string;
	p_amount_nanos?: number;
	p_hold_ref_id?: string | null;
	p_capture_ref_id?: string | null;
	p_release_ref_id?: string | null;
	p_key_id?: string | null;
	p_request_count?: number | null;
};

async function invalidateReservationCaches(workspaceId: string, keyId?: string | null): Promise<void> {
	await invalidateGatewayCreditCache(workspaceId);
	if (!keyId) return;
	try {
		await setKeyVersion("id", keyId, Date.now());
	} catch (error) {
		console.error("wallet_reservation_key_context_invalidation_failed", { workspaceId, error });
	}
}

function normalizeStatus(value: unknown): WalletReservationStatus {
	const status = String(value ?? "").trim().toLowerCase();
	if (status === "reservation_not_found") return "not_found";
	if (
		status === "held" ||
		status === "captured" ||
		status === "released" ||
		status === "insufficient_funds" ||
		status === "insufficient_balance" ||
		status === "daily_request_limit_reached" ||
		status === "weekly_request_limit_reached" ||
		status === "monthly_request_limit_reached" ||
		status === "daily_cost_limit_reached" ||
		status === "weekly_cost_limit_reached" ||
		status === "monthly_cost_limit_reached" ||
		status === "workspace_daily_cost_budget_reached" ||
		status === "workspace_weekly_cost_budget_reached" ||
		status === "workspace_monthly_cost_budget_reached" ||
		status === "workspace_lifetime_cost_budget_reached" ||
		status === "key_limit_soft_blocked" ||
		status === "key_not_found" ||
		status === "key_not_active" ||
		status === "key_wrong_workspace" ||
		status === "reserved_balance_mismatch" ||
		status === "reservation_exceeded" ||
		status === "reservation_not_active" ||
		status === "wallet_not_found" ||
		status === "not_found"
	) {
		return status;
	}
	return "unknown";
}

function toFinite(value: unknown): number | null {
	if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function normalizeResult(data: unknown, successStatus: "held" | "captured" | "released"): WalletReservationResult {
	const invalid = () => new Error("wallet_reservation_confirmation_invalid");
	if (Array.isArray(data) && data.length !== 1) throw invalid();
	const row = (Array.isArray(data) ? data[0] : data) as WalletReservationRpcRow | null | undefined;
	if (!row || typeof row !== "object" || Array.isArray(row)) throw invalid();
	for (const flag of [row.ok, row.applied, row.already_applied]) {
		if (flag != null && typeof flag !== "boolean") throw invalid();
	}
	const explicitStatus = normalizeStatus(row.status);
	if (row.status != null && explicitStatus === "unknown") throw invalid();
	const reason = String(row.reason ?? "").trim().toLowerCase();
	const replayStatus = reason === "already_reserved" ? "held" : reason === "already_captured" ? "captured"
		: reason === "already_released" ? "released" : null;
	const inferredStatus = explicitStatus !== "unknown"
		? explicitStatus
		: replayStatus ?? (row.ok === true && !reason ? successStatus : normalizeStatus(reason));
	const confirmed = inferredStatus === "held" || inferredStatus === "captured" || inferredStatus === "released";
	const applied = row.applied === true;
	const alreadyApplied = row.already_applied === true || replayStatus !== null;
	const amountNanos = toFinite(row.amount_nanos);
	// An unknown/contradictory response is not proof that no hold or debit occurred.
	// Throw so callers cannot switch to a different billing identity after a commit.
	if (inferredStatus === "unknown" ||
		(confirmed && reason !== "" && replayStatus === null && normalizeStatus(reason) !== inferredStatus) ||
		(confirmed && (row.ok === false || (!applied && !alreadyApplied) ||
			amountNanos == null || !Number.isSafeInteger(amountNanos) || amountNanos < 0)) ||
		(!confirmed && (row.ok === true || applied || alreadyApplied)) ||
		(replayStatus !== null && explicitStatus !== "unknown" && replayStatus !== explicitStatus)) throw invalid();
	return {
		applied,
		alreadyApplied,
		status: inferredStatus,
		amountNanos: amountNanos ?? 0,
		beforeBalanceNanos: toFinite(row.before_balance_nanos),
		afterBalanceNanos: toFinite(row.after_balance_nanos),
		beforeReservedNanos: toFinite(row.before_reserved_nanos),
		afterReservedNanos: toFinite(row.after_reserved_nanos),
	};
}

function shouldRetryWithLegacyTeamId(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const source = error as Record<string, unknown>;
	if (String(source.code ?? "") !== "PGRST202") return false;
	const haystack = `${String(source.message ?? "")} ${String(source.details ?? "")} ${String(source.hint ?? "")}`
		.trim()
		.toLowerCase();
	return haystack.includes("p_team_id") || haystack.includes("p_workspace_id");
}

async function callReservationRpc(
	fn: "gateway_wallet_reserve_once" | "gateway_wallet_capture_once" | "gateway_wallet_release_once",
	params: ReservationRpcPayload,
	signal?: AbortSignal,
): Promise<unknown> {
	const supabase = getSupabaseAdmin();
	const primaryRequest = supabase.rpc(fn, params);
	const primary = await (signal ? primaryRequest.abortSignal(signal) : primaryRequest);
	if (!primary.error) return primary.data;
	if (!shouldRetryWithLegacyTeamId(primary.error) || !params.p_workspace_id) {
		throw primary.error;
	}

	const legacyParams: ReservationRpcPayload = {
		...params,
		p_team_id: params.p_workspace_id,
	};
	delete legacyParams.p_workspace_id;

	const fallbackRequest = supabase.rpc(fn, legacyParams);
	const fallback = await (signal ? fallbackRequest.abortSignal(signal) : fallbackRequest);
	if (fallback.error) throw fallback.error;
	return fallback.data;
}

export async function reserveWalletCredits(args: {
	signal?: AbortSignal;
	workspaceId: string;
	reservationId: string;
	amountNanos: number;
	holdRefId?: string | null;
	keyId?: string | null;
	requestCount?: number | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_reserve_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_amount_nanos: Math.max(0, Math.trunc(args.amountNanos)),
		p_hold_ref_id: args.holdRefId ?? null,
		...(args.keyId ? { p_key_id: args.keyId } : {}),
		...(args.requestCount != null ? { p_request_count: Math.max(0, Math.trunc(args.requestCount)) } : {}),
	}, args.signal);
	const normalized = normalizeResult(data, "held");
	if (normalized.applied || normalized.alreadyApplied) await invalidateReservationCaches(args.workspaceId, args.keyId);
	return normalized;
}

export async function captureWalletReservation(args: {
	signal?: AbortSignal;
	workspaceId: string;
	reservationId: string;
	captureRefId?: string | null;
	keyId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_capture_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_capture_ref_id: args.captureRefId ?? null,
	}, args.signal);
	const normalized = normalizeResult(data, "captured");
	if (normalized.applied || normalized.alreadyApplied) await invalidateReservationCaches(args.workspaceId, args.keyId);
	return normalized;
}

export async function releaseWalletReservation(args: {
	signal?: AbortSignal;
	workspaceId: string;
	reservationId: string;
	releaseRefId?: string | null;
	keyId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_release_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_release_ref_id: args.releaseRefId ?? null,
	}, args.signal);
	const normalized = normalizeResult(data, "released");
	if (normalized.applied || normalized.alreadyApplied) await invalidateReservationCaches(args.workspaceId, args.keyId);
	return normalized;
}

export async function settleWalletReservation(args: {
	workspaceId: string;
	reservationId: string;
	actualNanos: number;
	settleRefId?: string | null;
	keyId?: string | null;
}): Promise<WalletReservationResult> {
	const supabase = getSupabaseAdmin();
	const result = await supabase.rpc("gateway_wallet_settle_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_actual_nanos: Math.max(0, Math.trunc(args.actualNanos)),
		p_settle_ref_id: args.settleRefId ?? null,
	});
	if (result.error) throw result.error;
	const normalized = normalizeResult(result.data, "captured");
	if (normalized.applied || normalized.alreadyApplied) await invalidateReservationCaches(args.workspaceId, args.keyId);
	return normalized;
}

export async function releaseStaleOrphanBatchReservations(args?: {
	olderThanSeconds?: number;
	limit?: number;
}): Promise<number> {
	const result = await getSupabaseAdmin().rpc("gateway_wallet_release_stale_orphan_batch_reservations", {
		p_older_than_seconds: Math.max(300, Math.trunc(args?.olderThanSeconds ?? 1_800)),
		p_limit: Math.max(1, Math.min(1_000, Math.trunc(args?.limit ?? 100))),
	});
	if (result.error) throw result.error;
	const released = Number(result.data ?? 0);
	if (!Number.isFinite(released) || released < 0) throw new Error("invalid_stale_batch_reservation_release_result");
	return Math.trunc(released);
}
