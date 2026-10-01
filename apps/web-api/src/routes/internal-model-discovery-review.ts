import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

const reviewDecisionSchema = z.object({
	decision: z.enum(["in_progress", "approved", "rejected", "snoozed"]),
	reason: z.string().trim().max(1_000).optional(),
});

const REVIEW_STATUSES = ["pending", "in_progress", "approved", "rejected", "snoozed"] as const;

async function adminUser(c: any) {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return null;
	const role = await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle();
	return !role.error && String(role.data?.role ?? "").toLowerCase() === "admin" ? user : null;
}

function isCrossSiteBrowserRequest(request: Request): boolean {
	return request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site";
}

export const internalModelDiscoveryReviewRouter = new Hono<{ Bindings: Env }>();

internalModelDiscoveryReviewRouter.get("/model-discovery/reviews", async (c) => {
	if (isCrossSiteBrowserRequest(c.req.raw)) {
		return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const user = await adminUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);

	const status = c.req.query("status");
	if (status && !REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number])) {
		return c.json({ error: "invalid_status" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	let query = getDataClient(c.env)
		.from("model_discovery_review_items")
		.select("id,dedupe_key,run_id,source,provider_id,provider_name,model_id,change_type,details,status,first_detected_at,last_detected_at,reviewed_by,reviewed_at,review_note,created_at")
		.order("last_detected_at", { ascending: false })
		.limit(200);
	query = status
		? query.eq("status", status)
		: query.in("status", ["pending", "in_progress"]);

	const result = await query;
	if (result.error) {
		return c.json({ error: "review_data_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ items: result.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

internalModelDiscoveryReviewRouter.patch("/model-discovery/reviews/:itemId", async (c) => {
	if (isCrossSiteBrowserRequest(c.req.raw)) {
		return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const user = await adminUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);

	const parsed = reviewDecisionSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ error: "invalid_review", message: parsed.error.issues[0]?.message ?? "Invalid review decision." }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (["rejected", "snoozed"].includes(parsed.data.decision) && !parsed.data.reason) {
		return c.json({ error: "review_reason_required", message: "A reason is required when rejecting or snoozing a detection." }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const client = getDataClient(c.env);
	const itemId = c.req.param("itemId");
	const now = new Date().toISOString();
	const result = await client.rpc("record_model_discovery_review_decision", {
		p_item_id: itemId,
		p_decision: parsed.data.decision,
		p_reason: parsed.data.reason ?? null,
		p_actor_user_id: user.id,
		p_reviewed_at: now,
	});
	if (result.error) return c.json({ error: "review_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const item = Array.isArray(result.data) ? result.data[0] : result.data;
	if (!item) return c.json({ error: "review_item_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);

	return c.json({ ok: true, item }, 200, PRIVATE_NO_STORE_HEADERS);
});
