import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import { publishSpendBlockEntry, spendRuleBlocksEnabled } from "@core/spend-blocks";
import { isSpendRuleUuid } from "@/core/spend-rules";
import { authorized } from "./notification-tests";

export const internalSpendBlockRoutes = new Hono<Env>();

// Republishes a workspace's spend block entry (KV spend-blocks:v1:{workspace}) after web-api
// lifted a block or changed or deleted a block rule, so the gateway stops refusing requests
// within about a minute instead of at the next sweep. web-api has already checked the caller is
// an owner or admin and made the change. Does nothing while SPEND_RULE_BLOCKS_ENABLED is off.
internalSpendBlockRoutes.post("/publish", async (c) => {
	if (!authorized(c)) return c.json({ error: "unauthorized" }, 401);
	const parsedBody: unknown = await c.req.json().catch(() => ({}));
	const body = (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {}) as { workspaceId?: unknown };
	const workspaceId = String(body.workspaceId ?? "").trim().toLowerCase();
	if (!isSpendRuleUuid(workspaceId)) return c.json({ error: "invalid_body" }, 400);
	configureRuntime(c.env);
	try {
		if (!spendRuleBlocksEnabled()) return c.json({ ok: true, published: false, enabled: false }, 200);
		const published = await publishSpendBlockEntry(workspaceId);
		return c.json({ ok: published, published, enabled: true }, published ? 200 : 502);
	} finally {
		clearRuntime();
	}
});
