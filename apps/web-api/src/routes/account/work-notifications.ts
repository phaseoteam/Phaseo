import { Hono } from "hono";
import type { Env } from "@/env";
import { formatWorkNotification } from "@/work/notifications";
import type { WorkNotificationRow } from "@/work/types";
import {
	accessFromQuery,
	badRequest,
	clampLimit,
	json,
	readBody,
	unavailable,
	UUID_PATTERN,
	workAccess,
} from "./work-shared";

// A person's work notifications (/api/account/work/notifications): their own, in this workspace.

export const accountWorkNotificationsRouter = new Hono<{ Bindings: Env }>();

const MAX_READ_IDS = 200;
const NOTIFICATION_SELECT = "id,workspace_id,user_id,work_item_id,kind,actor_name,body,read_at,created_at,item:work_items(number,title)";

export function encodeNotificationCursor(row: Pick<WorkNotificationRow, "created_at" | "id">): string {
	return btoa(`${row.created_at}|${row.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeNotificationCursor(cursor: string): { createdAt: string; id: string } | null {
	try {
		const [createdAt, id] = atob(cursor.replace(/-/g, "+").replace(/_/g, "/")).split("|");
		if (!createdAt || !id || !UUID_PATTERN.test(id) || Number.isNaN(Date.parse(createdAt))) return null;
		return { createdAt, id };
	} catch {
		return null;
	}
}

accountWorkNotificationsRouter.get("/notifications", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const limit = clampLimit(c.req.query("limit"), 50, 100);
	const unreadOnly = c.req.query("unread") === "1" || c.req.query("unread") === "true";
	let query = context.client.from("work_notifications").select(NOTIFICATION_SELECT)
		.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id);
	if (unreadOnly) query = query.is("read_at", null);
	const cursorText = c.req.query("cursor")?.trim();
	if (cursorText) {
		const cursor = decodeNotificationCursor(cursorText);
		if (!cursor) return badRequest(c, "cursor is not valid");
		query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
	}
	const [list, unread] = await Promise.all([
		query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1),
		context.client.from("work_notifications").select("id", { count: "exact", head: true })
			.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id).is("read_at", null),
	]);
	if (list.error || unread.error) return unavailable(c);
	const rows = (list.data ?? []) as unknown as Array<WorkNotificationRow & { item: { number: number; title: string } | null }>;
	const page = rows.slice(0, limit);
	return json(c, {
		notifications: page.map(formatWorkNotification),
		unreadCount: unread.count ?? 0,
		nextCursor: rows.length > limit && page.length ? encodeNotificationCursor(page[page.length - 1]!) : null,
	});
});

accountWorkNotificationsRouter.post("/notifications/read", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const all = body.all === true;
	let ids: string[] = [];
	if (!all) {
		if (!Array.isArray(body.ids) || !body.ids.length) return badRequest(c, "Send ids or all: true");
		if (body.ids.length > MAX_READ_IDS) return badRequest(c, `At most ${MAX_READ_IDS} ids at once`);
		if (!body.ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id))) return badRequest(c, "ids must be notification ids");
		ids = (body.ids as string[]).map((id) => id.toLowerCase());
	}
	let query = context.client.from("work_notifications").update({ read_at: new Date().toISOString() })
		.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id).is("read_at", null);
	if (!all) query = query.in("id", ids);
	const { error } = await query;
	if (error) return unavailable(c);
	const unread = await context.client.from("work_notifications").select("id", { count: "exact", head: true })
		.eq("workspace_id", context.workspaceId).eq("user_id", context.user.id).is("read_at", null);
	return json(c, { ok: true, unreadCount: unread.error ? null : unread.count ?? 0 });
});
