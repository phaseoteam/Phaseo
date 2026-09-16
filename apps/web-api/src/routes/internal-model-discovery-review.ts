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
		.order("status", { ascending: true })
		.order("last_detected_at", { ascending: false })
		.limit(200);
	if (status) query = query.eq("status", status);

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
	const existing = await client
		.from("model_discovery_review_items")
		.select("id")
		.eq("id", itemId)
		.maybeSingle();
	if (existing.error) return c.json({ error: "review_data_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!existing.data) return c.json({ error: "review_item_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);

	const now = new Date().toISOString();
	const updated = await client
		.from("model_discovery_review_items")
		.update({
			status: parsed.data.decision,
			reviewed_by: user.id,
			reviewed_at: now,
			review_note: parsed.data.decision === "approved" || parsed.data.decision === "in_progress"
				? null
				: parsed.data.reason,
		})
		.eq("id", itemId)
		.select("id,dedupe_key,run_id,source,provider_id,provider_name,model_id,change_type,details,status,first_detected_at,last_detected_at,reviewed_by,reviewed_at,review_note,created_at")
		.single();
	if (updated.error) return c.json({ error: "review_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);

	const event = await client.from("model_discovery_review_events").insert({
		item_id: itemId,
		decision: parsed.data.decision,
		reason: parsed.data.reason ?? null,
		actor_user_id: user.id,
	});
	if (event.error) return c.json({ error: "review_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);

	return c.json({ ok: true, item: updated.data }, 200, PRIVATE_NO_STORE_HEADERS);
});
