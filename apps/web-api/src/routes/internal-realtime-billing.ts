import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

const decisionSchema = z.object({
	operation_id: z.uuid(), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	action: z.enum(["retry", "retain", "capture_confirmed", "write_off", "restore_access"]),
	reason: z.string().trim().min(10).max(1000),
}).strict();
const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
export const internalRealtimeBillingRouter = new Hono<{ Bindings: Env; Variables: { adminId: string } }>();

internalRealtimeBillingRouter.use("/realtime-billing/*", async (c, next) => {
	if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	const user = await requireUser(c.req.raw, c.env);
	const role = user ? await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle() : null;
	if (!user || role?.error || String(role?.data?.role).toLowerCase() !== "admin") {
		console.warn("realtime_billing_review_access_denied", { actorId: user?.id ?? null });
		return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	c.set("adminId", user.id);
	for (const [key, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) c.header(key, value);
	await next();
});

internalRealtimeBillingRouter.get("/realtime-billing/reviews", async (c) => {
	const state = c.req.query("state") === "resolved" ? "resolved" : "open";
	const offset = Math.min(10000, Math.max(0, Number(c.req.query("offset")) || 0));
	const { data, error, count } = await getDataClient(c.env).from("gateway_realtime_billing_reviews")
		.select("session_id,workspace_id,status,access_blocked,version,opened_at,review_due_at,last_attempt_at,attempts,recovery_error,confirmed_cost_nanos,evidence_complete,resolved_at,session:gateway_realtime_sessions!inner(provider,model_id,user_id,provider_session_id,started_at,reserved_nanos,captured_nanos,released_nanos,disconnect_reason)", { count: "exact" })
		.eq("status", state).order("review_due_at").order("session_id").range(Math.floor(offset), Math.floor(offset) + 49);
	if (error) return c.json({ error: "realtime_review_unavailable" }, 503);
	return c.json({ reviews: data ?? [], total: count ?? 0 });
});

internalRealtimeBillingRouter.get("/realtime-billing/reviews/:id", async (c) => {
	const id = sessionIdSchema.safeParse(c.req.param("id"));
	if (!id.success) return c.json({ error: "invalid_session_id" }, 400);
	const db = getDataClient(c.env);
	const [review, decisions] = await Promise.all([
		db.from("gateway_realtime_billing_reviews")
			.select("session_id,evidence_usage,pricing_lines").eq("session_id", id.data).maybeSingle(),
		db.from("gateway_realtime_billing_decisions")
			.select("operation_id,actor_user_id,action,reason,review_version,cost_nanos,created_at")
			.eq("session_id", id.data).order("created_at", { ascending: false }).limit(100),
	]);
	if (review.error || decisions.error) return c.json({ error: "realtime_review_unavailable" }, 503);
	if (!review.data) return c.json({ error: "not_found" }, 404);
	// Return only billing counters/IDs, not session metadata, prompts, or arbitrary usage fields.
	const usage = review.data.evidence_usage ?? {};
	return c.json({ evidence: { live_seconds: usage.live_seconds ?? null, live_final: usage.live_final === true,
		live_pending_responses: usage.live_pending_responses ?? [],
		live_responses: (usage.live_responses ?? []).map((response: Record<string, unknown>) => ({ id: response.id,
			model: response.model, service_tier: response.service_tier, usage: response.usage })),
		live_tool_calls: usage.live_tool_calls ?? [],
	}, pricing_lines: review.data.pricing_lines, decisions: decisions.data ?? [] });
});

internalRealtimeBillingRouter.post("/realtime-billing/reviews/:id/decisions", async (c) => {
	const id = sessionIdSchema.safeParse(c.req.param("id"));
	const body = decisionSchema.safeParse(await c.req.json().catch(() => null));
	if (!id.success || !body.success) return c.json({ error: "invalid_review_decision" }, 400);
	const result = await getDataClient(c.env).rpc("gateway_realtime_review_decide", {
		p_session_id: id.data, p_actor_user_id: c.get("adminId"), p_operation_id: body.data.operation_id,
		p_expected_version: body.data.version, p_action: body.data.action, p_reason: body.data.reason,
	});
	if (result.error) {
		console.warn("realtime_billing_review_decision_failed", { actorId: c.get("adminId"), sessionId: id.data,
			operationId: body.data.operation_id, action: body.data.action, code: result.error.code });
		const known = /^realtime_review_[a-z_]+$/.test(result.error.message);
		return c.json({ error: known ? result.error.message : "realtime_review_decision_failed" }, known ? 409 : 503);
	}
	return c.json(result.data);
});
