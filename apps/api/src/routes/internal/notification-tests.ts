import { Hono } from "hono";
import { deliverNotificationTest } from "@/pipeline/notifications/notification-delivery";
import type { Env } from "@/runtime/types";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import { SpendRuleTestError, sendSpendRuleTest } from "@/pipeline/notifications/spend-rule-test";
import { isSpendRuleUuid } from "@/core/spend-rules";

export const internalNotificationTestRoutes = new Hono<Env>();

function timingSafeEqual(a: string, b: string): boolean {
	const length = Math.max(a.length, b.length);
	let difference = a.length === b.length ? 0 : 1;
	for (let index = 0; index < length; index += 1) {
		difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
	}
	return difference === 0;
}

/** Bearer GATEWAY_INTERNAL_TEST_TOKEN (at least 32 characters), compared in constant time. */
export function authorized(c: { env: Env["Bindings"]; req: { header: (name: string) => string | undefined } }): boolean {
	const expected = String(c.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();
	const provided = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
	return expected.length >= 32 && timingSafeEqual(provided, expected);
}

// A spend rule test send for the settings page. web-api has already checked that the caller is
// an owner or admin of the workspace; the per-workspace limit is applied here, in
// sendSpendRuleTest, so it is shared with the control API.
internalNotificationTestRoutes.post("/spend-rule", async (c) => {
	if (!authorized(c)) return c.json({ error: "unauthorized" }, 401);
	const parsedBody: unknown = await c.req.json().catch(() => ({}));
	const body = (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {}) as { workspaceId?: unknown; ruleId?: unknown };
	const workspaceId = String(body.workspaceId ?? "").trim();
	const ruleId = String(body.ruleId ?? "").trim().toLowerCase();
	if (!isSpendRuleUuid(workspaceId) || !isSpendRuleUuid(ruleId)) return c.json({ error: "invalid_body" }, 400);
	configureRuntime(c.env);
	try {
		return c.json({ ok: true, result: await sendSpendRuleTest({ workspaceId, ruleId }) }, 200);
	} catch (error) {
		if (error instanceof SpendRuleTestError) {
			if (error.retryAfterSeconds) c.header("Retry-After", String(error.retryAfterSeconds));
			return c.json({ error: error.code, message: error.message }, error.status);
		}
		console.error("spend_rule_test_failed", { workspaceId, ruleId, error: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "spend_rule_test_failed" }, 502);
	} finally {
		clearRuntime();
	}
});

internalNotificationTestRoutes.post("/", async (c) => {
	if (!authorized(c)) return c.json({ error: "unauthorized" }, 401);

	const parsedBody: unknown = await c.req.json().catch(() => ({}));
	if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return c.json({ error: "invalid_body" }, 400);
	const body = parsedBody as { type?: string; target?: string; destinationId?: string; workspaceId?: string; kind?: unknown };
	if (body.kind !== undefined && body.kind !== "notification_test" && body.kind !== "model_deprecation") return c.json({ error: "invalid_notification_test_kind" }, 400);
	const workspaceId = String(body.workspaceId ?? "").trim();
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400);
	console.log("notification_test_kind", { kind: body.kind ?? "notification_test" });

	configureRuntime(c.env);
	try {
		const status = await deliverNotificationTest({
			type: body.type,
			target: body.target,
			destinationId: body.destinationId,
			workspaceId,
			kind: body.kind as "notification_test" | "model_deprecation" | undefined,
		});
		return c.json({ ok: true, status }, 200);
	} catch (error) {
		const message = error instanceof Error ? error.message : "notification_test_failed";
		const status = message === "notification_destination_not_found" ? 404 : 502;
		return c.json({ error: message }, status);
	} finally {
		clearRuntime();
	}
});
