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
	applied?: boolean | null;
	already_applied?: boolean | null;
	status?: string | null;
	amount_nanos?: number | null;
	before_balance_nanos?: number | null;
	after_balance_nanos?: number | null;
	before_reserved_nanos?: number | null;
	after_reserved_nanos?: number | null;
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

function normalizeResult(data: unknown): WalletReservationResult | null {
	const row = (Array.isArray(data) ? data[0] : data) as WalletReservationRpcRow | null | undefined;
	if (!row || typeof row !== "object") return null;
	return {
		applied: row.applied === true,
		alreadyApplied: row.already_applied === true,
		status: normalizeStatus(row.status),
		amountNanos: Math.max(0, Number(row.amount_nanos ?? 0) || 0),
		beforeBalanceNanos: toFinite(row.before_balance_nanos),
		afterBalanceNanos: toFinite(row.after_balance_nanos),
		beforeReservedNanos: toFinite(row.before_reserved_nanos),
		afterReservedNanos: toFinite(row.after_reserved_nanos),
	};
}

export async function reserveWalletCredits(args: {
	teamId: string;
	reservationId: string;
	amountNanos: number;
	holdRefId?: string | null;
}): Promise<WalletReservationResult> {
	const { data, error } = await getSupabaseAdmin().rpc("gateway_wallet_reserve_once", {
		p_team_id: args.teamId,
		p_reservation_id: args.reservationId,
		p_amount_nanos: Math.max(0, Math.trunc(args.amountNanos)),
		p_hold_ref_id: args.holdRefId ?? null,
	});
	if (error) throw error;
	return normalizeResult(data) ?? {
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
	teamId: string;
	reservationId: string;
	captureRefId?: string | null;
}): Promise<WalletReservationResult> {
	const { data, error } = await getSupabaseAdmin().rpc("gateway_wallet_capture_once", {
		p_team_id: args.teamId,
		p_reservation_id: args.reservationId,
		p_capture_ref_id: args.captureRefId ?? null,
	});
	if (error) throw error;
	return normalizeResult(data) ?? {
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
	teamId: string;
	reservationId: string;
	releaseRefId?: string | null;
}): Promise<WalletReservationResult> {
	const { data, error } = await getSupabaseAdmin().rpc("gateway_wallet_release_once", {
		p_team_id: args.teamId,
		p_reservation_id: args.reservationId,
		p_release_ref_id: args.releaseRefId ?? null,
	});
	if (error) throw error;
	return normalizeResult(data) ?? {
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
