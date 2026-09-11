import { getSupabaseAdmin } from "@/runtime/env";
import { syncWorkspaceUsageRollupForRequest } from "@core/workspace-usage-rollups";
import { assertLiveFinalUsage, ingestLiveUsage, isLiveModel, liveConfig, liveUsageMeters, priceLiveUsage, type LiveUsage } from "./live-sessions";

// Re-price only provider evidence, never elapsed wall time or a client's estimate.
export function quoteRealtimeRecovery(model: string, usage: LiveUsage, metadata: Record<string, unknown>) {
	if (!isLiveModel(model)) throw new Error("recovery_provider_not_supported");
	if (usage.live_billing_error) throw new Error("recovery_conflicting_evidence");
	if (typeof usage.live_started !== "boolean") throw new Error("recovery_start_evidence_missing");
	if (usage.live_seconds != null && (!Number.isFinite(usage.live_seconds) || usage.live_seconds < 0)) {
		throw new Error("recovery_seconds_invalid");
	}
	const ids = new Set<string>();
	for (const response of usage.live_responses ?? []) {
		if (ids.has(response.id) || !response.provider_usage) throw new Error("recovery_response_evidence_invalid");
		ids.add(response.id);
		const verified = ingestLiveUsage({}, { type: "response.event", delegation_id: response.delegation_id,
			event: { type: response.status, response: { id: response.id, model: response.model,
				service_tier: response.service_tier, usage: response.provider_usage } } });
		const rebuilt = verified.live_responses?.[0];
		if (!rebuilt || Object.keys(rebuilt.usage).some((key) => rebuilt.usage[key] !== response.usage[key])) {
			throw new Error("recovery_response_evidence_invalid");
		}
	}
	const tools = new Set<string>();
	for (const tool of usage.live_tool_calls ?? []) {
		if (!tool.id || tools.has(tool.id) || !tool.response_id || !tool.delegation_id) throw new Error("recovery_tool_evidence_invalid");
		tools.add(tool.id);
	}
	if (!usage.live_started && ((usage.live_seconds ?? 0) > 0 || ids.size || tools.size || usage.live_pending_responses?.length)) {
		throw new Error("recovery_start_evidence_conflict");
	}
	let complete = false;
	try { assertLiveFinalUsage(usage); complete = true; } catch { /* A lower bound is not a final bill. */ }
	const confirmed = { ...usage, live_tool_calls: usage.live_tool_calls?.filter((tool) => tool.done) };
	const priced = priceLiveUsage(confirmed, liveConfig(metadata));
	const pricing = priced.pricing as { total_nanos: number; lines: Record<string, unknown>[] };
	if (!Number.isSafeInteger(pricing.total_nanos) || pricing.total_nanos < 0) throw new Error("recovery_cost_invalid");
	return { costNanos: pricing.total_nanos, lines: pricing.lines, complete, billableUsage: { ...confirmed, ...liveUsageMeters(confirmed) } };
}

// Runs independently of the browser/relay. Failed recovery remains in the admin queue.
export async function refreshRealtimeBillingReviews(limit = 25) {
	const db = getSupabaseAdmin();
	const { data, error } = await db.from("gateway_realtime_billing_reviews")
		.select("session_id").eq("status", "open").lte("retry_after", new Date().toISOString())
		.order("retry_after").limit(Math.max(1, Math.min(100, limit)));
	if (error) throw error;
	for (const review of data ?? []) {
		const { data: session, error: readError } = await db.from("gateway_realtime_sessions")
			.select("session_id,model_id,status,usage,metadata").eq("session_id", review.session_id).single();
		if (readError) throw readError;
		if (!session || session.status !== "billing_unresolved") continue;
		let quote: ReturnType<typeof quoteRealtimeRecovery> | null = null;
		let recoveryError: string | null = null;
		try { quote = quoteRealtimeRecovery(session.model_id, session.usage, session.metadata); }
		catch (cause) { recoveryError = cause instanceof Error ? cause.message : "recovery_evidence_invalid"; }
		const result = await db.rpc("gateway_realtime_review_evidence", {
			p_session_id: session.session_id, p_expected_usage: session.usage, p_expected_metadata: session.metadata,
			p_cost_nanos: quote?.costNanos ?? null, p_pricing_lines: quote?.lines ?? [],
			p_complete: quote?.complete ?? false, p_error: recoveryError,
			p_billable_usage: quote?.billableUsage ?? null,
		});
		if (result.error) throw result.error;
	}
	return data?.length ?? 0;
}

// The wallet and request row commit atomically; derived reports are retried until synced.
export async function syncRealtimeBillingReviewSummaries() {
	const db = getSupabaseAdmin();
	const { data, error } = await db.from("gateway_realtime_billing_reviews")
		.select("session_id,workspace_id,session:gateway_realtime_sessions!inner(started_at)")
		.eq("status", "resolved").is("summary_synced_at", null).order("resolved_at").limit(25);
	if (error) throw error;
	for (const review of data ?? []) {
		const session = Array.isArray(review.session) ? review.session[0] : review.session;
		const { data: request, error: readError } = await db.from("gateway_requests").select("id,created_at")
			.eq("realtime_session_id", review.session_id).eq("created_at", session.started_at).single();
		if (readError || !request) throw readError ?? new Error("realtime_review_summary_missing");
		await syncWorkspaceUsageRollupForRequest({ requestRowId: request.id, requestCreatedAt: request.created_at,
			workspaceId: review.workspace_id, context: "realtime_billing_review" });
		const synced = await db.rpc("gateway_realtime_review_summary_synced", { p_session_id: review.session_id });
		if (synced.error) throw synced.error;
	}
}
