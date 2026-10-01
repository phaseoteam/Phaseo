export type Review = {
	session_id: string; workspace_id: string; status: "open" | "resolved"; access_blocked: boolean; version: number;
	opened_at: string; review_due_at: string; attempts: number; last_attempt_at: string | null;
	recovery_error: string | null; confirmed_cost_nanos: number | null; evidence_complete: boolean;
	session: { provider: string; model_id: string; user_id: string | null; provider_session_id: string | null;
		reserved_nanos: number; captured_nanos: number; released_nanos: number; disconnect_reason: string | null };
};
export type ReviewDetails = {
	evidence: { live_seconds: number | null; live_final: boolean; live_pending_responses: string[];
		live_responses: { id: string; model: string; service_tier: string; usage: Record<string, number> }[];
		live_tool_calls: { id: string; done: boolean }[] };
	decisions: { operation_id: string; actor_user_id: string | null; action: string; reason: string; cost_nanos: number | null; created_at: string }[];
};
export type Decision = "retry" | "retain" | "capture_confirmed" | "write_off" | "restore_access";
