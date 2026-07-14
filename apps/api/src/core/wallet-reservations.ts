// Purpose: Wallet reservation RPC helpers for async billing workflows.
// Why: Long-running generation jobs require hold/capture/release semantics.
// How: Wraps Supabase RPCs and normalizes idempotent status responses.

import { getSupabaseAdmin } from "@/runtime/env";

export type WalletReservationStatus =
	| "held"
	| "captured"
	| "released"
	| "insufficient_funds"
	| "insufficient_balance"
	| "reserved_balance_mismatch"
	| "reservation_exceeded"
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
};

function normalizeStatus(value: unknown): WalletReservationStatus {
	const status = String(value ?? "").trim().toLowerCase();
	if (
		status === "held" ||
		status === "captured" ||
		status === "released" ||
		status === "insufficient_funds" ||
		status === "insufficient_balance" ||
		status === "reserved_balance_mismatch" ||
		status === "not_found"
	) {
		return status;
	}
	return "unknown";
}

function toFinite(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function normalizeResult(data: unknown, successStatus?: "held" | "captured" | "released"): WalletReservationResult | null {
	const row = (Array.isArray(data) ? data[0] : data) as WalletReservationRpcRow | null | undefined;
	if (!row || typeof row !== "object") return null;
	const explicitStatus = normalizeStatus(row.status);
	const reason = String(row.reason ?? "").trim().toLowerCase();
	const inferredStatus = explicitStatus !== "unknown"
		? explicitStatus
		: reason === "already_reserved" || (successStatus === "held" && row.ok === true)
			? "held"
			: reason === "already_captured" || (successStatus === "captured" && row.ok === true)
				? "captured"
				: reason === "already_released" || (successStatus === "released" && row.ok === true)
					? "released"
					: reason === "reservation_exceeded"
						? "reservation_exceeded"
						: normalizeStatus(reason);
	return {
		applied: row.applied === true,
		alreadyApplied: row.already_applied === true,
		status: inferredStatus,
		amountNanos: Math.max(0, Number(row.amount_nanos ?? 0) || 0),
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
): Promise<unknown> {
	const supabase = getSupabaseAdmin();
	const primary = await supabase.rpc(fn, params);
	if (!primary.error) return primary.data;
	if (!shouldRetryWithLegacyTeamId(primary.error) || !params.p_workspace_id) {
		throw primary.error;
	}

	const legacyParams: ReservationRpcPayload = {
		...params,
		p_team_id: params.p_workspace_id,
	};
	delete legacyParams.p_workspace_id;

	const fallback = await supabase.rpc(fn, legacyParams);
	if (fallback.error) throw fallback.error;
	return fallback.data;
}

export async function reserveWalletCredits(args: {
	workspaceId: string;
	reservationId: string;
	amountNanos: number;
	holdRefId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_reserve_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_amount_nanos: Math.max(0, Math.trunc(args.amountNanos)),
		p_hold_ref_id: args.holdRefId ?? null,
	});
	return normalizeResult(data, "held") ?? {
		applied: false,
		alreadyApplied: false,
		status: "unknown",
		amountNanos: Math.max(0, Math.trunc(args.amountNanos)),
		beforeBalanceNanos: null,
		afterBalanceNanos: null,
		beforeReservedNanos: null,
		afterReservedNanos: null,
	};
}

export async function captureWalletReservation(args: {
	workspaceId: string;
	reservationId: string;
	captureRefId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_capture_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_capture_ref_id: args.captureRefId ?? null,
	});
	return normalizeResult(data, "captured") ?? {
		applied: false,
		alreadyApplied: false,
		status: "unknown",
		amountNanos: 0,
		beforeBalanceNanos: null,
		afterBalanceNanos: null,
		beforeReservedNanos: null,
		afterReservedNanos: null,
	};
}

export async function releaseWalletReservation(args: {
	workspaceId: string;
	reservationId: string;
	releaseRefId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_release_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_release_ref_id: args.releaseRefId ?? null,
	});
	return normalizeResult(data, "released") ?? {
		applied: false,
		alreadyApplied: false,
		status: "unknown",
		amountNanos: 0,
		beforeBalanceNanos: null,
		afterBalanceNanos: null,
		beforeReservedNanos: null,
		afterReservedNanos: null,
	};
}

export async function settleWalletReservation(args: {
	workspaceId: string;
	reservationId: string;
	actualNanos: number;
	settleRefId?: string | null;
}): Promise<WalletReservationResult> {
	const supabase = getSupabaseAdmin();
	const result = await supabase.rpc("gateway_wallet_settle_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_actual_nanos: Math.max(0, Math.trunc(args.actualNanos)),
		p_settle_ref_id: args.settleRefId ?? null,
	});
	if (result.error) throw result.error;
	return normalizeResult(result.data, "captured") ?? {
		applied: false,
		alreadyApplied: false,
		status: "unknown",
		amountNanos: Math.max(0, Math.trunc(args.actualNanos)),
		beforeBalanceNanos: null,
		afterBalanceNanos: null,
		beforeReservedNanos: null,
		afterReservedNanos: null,
	};
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
