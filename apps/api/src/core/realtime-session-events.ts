// Purpose: Phaseo's own realtime relay events (session.end, session.ended, session.warning).
// Why: Clients need one way to end a call cleanly and one final event with the bill, whichever side ended it.
// How: Maps the relay's internal end reasons to stable public codes and builds the event payloads.

/**
 * Stable `reason` codes on session.ended. Internal disconnect reasons stay in
 * the database; clients only ever see these.
 */
export const REALTIME_END_REASONS = [
	"client_requested",
	"client_disconnected",
	"provider_closed",
	"provider_error",
	"max_duration_reached",
	"insufficient_funds",
	"key_revoked",
	"key_expired",
	"key_blocked",
	"workspace_disabled",
	"policy_blocked",
	"spend_limit_reached",
	"idle_timeout",
	"input_rejected",
	"session_reconciled",
	"gateway_error",
] as const;
export type RealtimeEndReason = typeof REALTIME_END_REASONS[number];
export type RealtimeEndInitiator = "client" | "gateway" | "provider";
export type RealtimeBillingStatus = "settled" | "pending" | "unresolved";

export const REALTIME_WARNING_CODES = [
	"max_duration_approaching",
	"provider_closing",
	"funds_low",
	"overdraft_in_use",
	"spend_limit_exceeded",
] as const;
export type RealtimeWarningCode = typeof REALTIME_WARNING_CODES[number];

export type RealtimeEnd = { reason: RealtimeEndReason; initiatedBy: RealtimeEndInitiator };

const END_RULES: Array<[RegExp, RealtimeEndReason, RealtimeEndInitiator]> = [
	[/^client_requested/, "client_requested", "client"],
	[/^client_|client_disconnected|client_gone/, "client_disconnected", "client"],
	[/max_duration/, "max_duration_reached", "gateway"],
	[/idle_timeout/, "idle_timeout", "gateway"],
	[/key_revoked|key_invalid/, "key_revoked", "gateway"],
	[/key_expired/, "key_expired", "gateway"],
	[/key_blocked/, "key_blocked", "gateway"],
	[/workspace_disabled/, "workspace_disabled", "gateway"],
	[/workspace_policy_blocked|provider_not_available|policy_limit_reached/, "policy_blocked", "gateway"],
	[/key_limit_exceeded|key_cost_limit_reached|cost_budget_reached/, "spend_limit_reached", "gateway"],
	[/insufficient_funds|budget_threshold|credit_hold_extension_failed|overdraft_cap_reached/, "insufficient_funds", "gateway"],
	[/^realtime_audio_|upstream_backpressure/, "input_rejected", "gateway"],
	[/event_processing_failed|checkpoint_failed|settlement_retry_exhausted/, "gateway_error", "gateway"],
	[/provider_socket_closed|live_session_closed|budget_closed_provider_socket/, "provider_closed", "provider"],
	[/provider_|live_provider_error/, "provider_error", "provider"],
	[/reconciliation/, "session_reconciled", "gateway"],
];

/** Classifies an internal relay end reason into a public reason and who ended the call. */
export function classifyRealtimeEnd(internalReason: string): RealtimeEnd {
	const reason = internalReason.replace(/_authoritative_usage_timeout$/, "");
	for (const [pattern, code, initiatedBy] of END_RULES) {
		if (pattern.test(reason)) return { reason: code, initiatedBy };
	}
	return { reason: "gateway_error", initiatedBy: "gateway" };
}

const USAGE_METERS = [
	"input_text_tokens",
	"input_audio_tokens",
	"output_text_tokens",
	"output_audio_tokens",
	"cached_read_text_tokens",
	"cached_read_audio_tokens",
	"input_image_tokens",
	"cached_read_image_tokens",
	"input_video_tokens",
	"audio_seconds",
] as const;

/** The billed meters from normalized realtime usage, without relay bookkeeping fields. */
export function realtimeUsageMeters(usage: Record<string, unknown>): Record<string, number> {
	const meters: Record<string, number> = {};
	for (const meter of USAGE_METERS) {
		const value = usage[meter];
		if (typeof value === "number" && Number.isFinite(value) && value > 0) meters[meter] = value;
	}
	return meters;
}

/** Where to read the final bill once a pending settlement completes. */
export function realtimeFinalBillPath(sessionId: string): string {
	return `/v1/generations?id=${encodeURIComponent(`realtime:${sessionId}`)}`;
}

export function buildSessionEndedEvent(args: {
	sessionId: string;
	end: RealtimeEnd;
	durationSeconds: number;
	usage: Record<string, unknown>;
	costNanos: number;
	estimated: boolean;
	estimateBasis?: string | null;
	debtNanos?: number | null;
	uncollectedNanos?: number | null;
	billingStatus: RealtimeBillingStatus;
	clientReason?: string | null;
	providerCloseCode?: number | null;
}) {
	const totalNanos = Math.max(0, Math.round(args.costNanos));
	return {
		type: "session.ended" as const,
		session_id: args.sessionId,
		reason: args.end.reason,
		initiated_by: args.end.initiatedBy,
		...(args.clientReason ? { client_reason: args.clientReason } : {}),
		...(args.providerCloseCode != null ? { provider_close_code: args.providerCloseCode } : {}),
		duration_seconds: Math.max(0, Math.round(args.durationSeconds * 1000) / 1000),
		usage: realtimeUsageMeters(args.usage),
		cost: {
			total_usd: totalNanos / 1_000_000_000,
			total_nanos: totalNanos,
			estimated: args.estimated,
			estimate_basis: args.estimated ? args.estimateBasis ?? null : null,
			debt_nanos: Math.max(0, Math.round(args.debtNanos ?? 0)),
			uncollected_nanos: Math.max(0, Math.round(args.uncollectedNanos ?? 0)),
			currency: "USD" as const,
		},
		billing_status: args.billingStatus,
		...(args.billingStatus === "settled" ? {} : { final_bill: { method: "GET" as const, path: realtimeFinalBillPath(args.sessionId) } }),
	};
}

export function buildSessionWarningEvent(code: RealtimeWarningCode, message: string, extra?: Record<string, unknown>) {
	return { type: "session.warning" as const, code, message, ...(extra ?? {}) };
}

/** Client-supplied end reason, kept short and printable. */
export function sanitizeClientEndReason(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim().slice(0, 120);
	return cleaned || null;
}
