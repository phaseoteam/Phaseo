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
	workspaceId: string;
	reservationId: string;
	captureRefId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_capture_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_capture_ref_id: args.captureRefId ?? null,
	});
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
	workspaceId: string;
	reservationId: string;
	releaseRefId?: string | null;
}): Promise<WalletReservationResult> {
	const data = await callReservationRpc("gateway_wallet_release_once", {
		p_workspace_id: args.workspaceId,
		p_reservation_id: args.reservationId,
		p_release_ref_id: args.releaseRefId ?? null,
	});
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
