import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

const AUDIT_COLUMNS = "id,workspace_id,actor_user_id,action,target_type,target_id,target_name,metadata,request_id,created_at";

function parseCursor(value: string | undefined): { createdAt: string; id: string } | null {
	if (!value) return null;
	const separator = value.lastIndexOf("|");
	if (separator <= 0) return null;
	const createdAt = value.slice(0, separator);
	const id = value.slice(separator + 1);
	return Number.isFinite(Date.parse(createdAt)) && /^[0-9a-f-]{36}$/i.test(id) ? { createdAt, id } : null;
}

export const accountSettingsAuditRouter = new Hono<{ Bindings: Env }>();

accountSettingsAuditRouter.get("/audit-events", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) {
		return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}

	const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
	const cursor = parseCursor(c.req.query("cursor")?.trim());
	const action = c.req.query("action")?.trim();
	const targetType = c.req.query("targetType")?.trim();
	let query = context.client
		.from("workspace_audit_events")
		.select(AUDIT_COLUMNS)
		.eq("workspace_id", context.workspaceId)
		.order("created_at", { ascending: false })
		.order("id", { ascending: false })
		.limit(limit + 1);
	if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
	if (action) query = query.eq("action", action.slice(0, 100));
	if (targetType) query = query.eq("target_type", targetType.slice(0, 60));

	const result = await query;
	if (result.error) return c.json({ error: "audit_log_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const rows = result.data ?? [];
	const page = rows.slice(0, limit);
	const actorIds = Array.from(new Set(page.map((row) => row.actor_user_id).filter(Boolean)));
	const actorsResult = actorIds.length
		? await context.client.from("users").select("user_id,display_name").in("user_id", actorIds)
		: { data: [], error: null };
	if (actorsResult.error) return c.json({ error: "audit_log_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const actors = new Map((actorsResult.data ?? []).map((actor) => [actor.user_id, {
		displayName: actor.display_name ?? null,
		email: null,
	}]));

	return c.json({
		events: page.map((row) => ({
			...row,
			actor: row.actor_user_id ? actors.get(row.actor_user_id) ?? null : null,
		})),
		nextCursor: rows.length > limit && page.at(-1)
			? `${page.at(-1)!.created_at}|${page.at(-1)!.id}`
			: null,
		workspaceId: context.workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});
