import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { CHAT_PRIVACY_REVIEW_VERSION, hasReviewedChatPrivacy } from "@/chat/privacyReview";
import { requireAccountWorkspace } from "./context";

export const accountChatPrivacyReviewRouter = new Hono<{ Bindings: Env }>();

accountChatPrivacyReviewRouter.get("/privacy/review", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId") });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_settings")
		.select("privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_free_may_publish_prompts,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,model_restriction_mode,model_restriction_model_ids,io_logging_enabled,io_logging_retention_days")
		.eq("workspace_id", context.workspaceId).maybeSingle();
	if (result.error) return c.json({ error: "privacy_settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ version: CHAT_PRIVACY_REVIEW_VERSION, workspaceName: context.workspaceName,
		reviewed: hasReviewedChatPrivacy(context.user.appMetadata, context.workspaceId), policy: result.data ?? {} }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountChatPrivacyReviewRouter.post("/privacy/review", bodyLimit({ maxSize: 2048 }), async (c) => {
	const body = await c.req.json<{ workspaceId?: string; version?: string; accepted?: boolean }>().catch(() => null);
	if (!body || body.accepted !== true || body.version !== CHAT_PRIVACY_REVIEW_VERSION) {
		return c.json({ error: "privacy_review_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: body.workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const existing = context.user.appMetadata.chat_privacy_reviews;
	const reviews = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
	const result = await context.client.auth.admin.updateUserById(context.user.id, { app_metadata: {
		...context.user.appMetadata, chat_privacy_reviews: { ...reviews, [context.workspaceId]: CHAT_PRIVACY_REVIEW_VERSION },
	} });
	if (result.error) return c.json({ error: "privacy_review_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
