import { Hono } from "hono";
import type { Env } from "@/env";
import { encryptGithubToken } from "@/work/github";
import { newWorkToken } from "@/work/tokens";
import { isAllowedWebhookUrl, MAX_WEBHOOKS_PER_WORKSPACE, newWebhookSecret, parseWebhookEvents } from "@/work/webhooks";
import { accessFromQuery, badRequest, isWorkspaceOwnerOrAdmin, json, notFound, pathUuid, readBody, unavailable, workAccess } from "./work-shared";

// Work API keys and webhooks (/api/account/work/api-keys, /webhooks). Members can see them;
// workspace owners and admins make, change and remove them. A key or webhook secret is shown once.

export const accountWorkIntegrationsRouter = new Hono<{ Bindings: Env }>();

const MAX_KEYS = 25;
const KEY_COLUMNS = "id,name,key_prefix,access,created_by,created_at,last_used_at,revoked_at";
const WEBHOOK_COLUMNS = "id,url,events,enabled,failure_count,last_status,last_delivery_at,created_by,created_at";

function formatKey(row: any) {
	return { id: row.id, name: row.name, keyPrefix: row.key_prefix, access: row.access, createdBy: row.created_by, createdAt: row.created_at, lastUsedAt: row.last_used_at, revokedAt: row.revoked_at };
}

function formatWebhook(row: any) {
	return { id: row.id, url: row.url, events: row.events ?? [], enabled: row.enabled, failureCount: row.failure_count, lastStatus: row.last_status, lastDeliveryAt: row.last_delivery_at, createdBy: row.created_by, createdAt: row.created_at };
}

function adminOnly(c: any, context: Parameters<typeof isWorkspaceOwnerOrAdmin>[0]) {
	return isWorkspaceOwnerOrAdmin(context) ? null : json(c, { error: "forbidden", message: "Only workspace owners and admins can change this" }, 403);
}

accountWorkIntegrationsRouter.get("/api-keys", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_api_keys").select(KEY_COLUMNS).eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }).limit(MAX_KEYS * 2);
	if (error) return unavailable(c);
	return json(c, { keys: (data ?? []).map(formatKey), canManage: isWorkspaceOwnerOrAdmin(context) });
});

accountWorkIntegrationsRouter.post("/api-keys", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const denied = adminOnly(c, context);
	if (denied) return denied;
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name || name.length > 80) return badRequest(c, "name must be 1 to 80 characters");
	if (body.access !== "read" && body.access !== "write") return badRequest(c, "access must be read or write");
	const live = await context.client.from("work_api_keys").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).is("revoked_at", null);
	if (live.error) return unavailable(c);
	if ((live.count ?? 0) >= MAX_KEYS) return badRequest(c, `A workspace can have at most ${MAX_KEYS} live API keys`);
	const key = await newWorkToken("api");
	const { data, error } = await context.client.from("work_api_keys").insert({
		workspace_id: context.workspaceId, name, access: body.access, key_hash: key.hash, key_prefix: key.prefix, created_by: context.user.id,
	}).select(KEY_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_api_key_write_failed");
	return json(c, { key: formatKey(data), token: key.token }, 201);
});

/** Revokes a key. Kept (revoked) so its prefix still explains old activity. */
accountWorkIntegrationsRouter.post("/api-keys/:id/revoke", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const denied = adminOnly(c, context);
	if (denied) return denied;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A key id is required");
	const { data, error } = await context.client.from("work_api_keys").update({ revoked_at: new Date().toISOString() })
		.eq("workspace_id", context.workspaceId).eq("id", id).is("revoked_at", null).select(KEY_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_api_key_write_failed");
	if (!data) return notFound(c, "Live key not found");
	return json(c, { key: formatKey(data) });
});

accountWorkIntegrationsRouter.get("/webhooks", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_webhooks").select(WEBHOOK_COLUMNS).eq("workspace_id", context.workspaceId).order("created_at", { ascending: true }).limit(MAX_WEBHOOKS_PER_WORKSPACE);
	if (error) return unavailable(c);
	return json(c, { webhooks: (data ?? []).map(formatWebhook), canManage: isWorkspaceOwnerOrAdmin(context) });
});

/** POST /webhooks {url, events?}: new events from now on are sent. The signing secret is returned once. */
accountWorkIntegrationsRouter.post("/webhooks", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const denied = adminOnly(c, context);
	if (denied) return denied;
	if (!isAllowedWebhookUrl(body.url)) return badRequest(c, "url must be an https address on a public host name");
	const events = body.events === undefined ? null : parseWebhookEvents(body.events);
	if (body.events !== undefined && !events) return badRequest(c, "events must be a list of event kinds");
	const count = await context.client.from("work_webhooks").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId);
	if (count.error) return unavailable(c);
	if ((count.count ?? 0) >= MAX_WEBHOOKS_PER_WORKSPACE) return badRequest(c, `A workspace can have at most ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks`);
	const secret = newWebhookSecret();
	let ciphertext: string;
	try {
		ciphertext = await encryptGithubToken(c.env, secret);
	} catch {
		return unavailable(c, "work_webhook_secret_unavailable");
	}
	const { data, error } = await context.client.from("work_webhooks").insert({
		workspace_id: context.workspaceId,
		url: body.url,
		secret_ciphertext: ciphertext,
		...(events ? { events } : {}),
		cursor_at: new Date().toISOString(),
		created_by: context.user.id,
	}).select(WEBHOOK_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_webhook_write_failed");
	return json(c, { webhook: formatWebhook(data), secret }, 201);
});

/** PATCH /webhooks/:id {enabled?, events?}: turning one back on clears its failure count. */
accountWorkIntegrationsRouter.patch("/webhooks/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const denied = adminOnly(c, context);
	if (denied) return denied;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A webhook id is required");
	const patch: Record<string, unknown> = {};
	if (body.enabled !== undefined) {
		if (typeof body.enabled !== "boolean") return badRequest(c, "enabled must be true or false");
		patch.enabled = body.enabled;
		if (body.enabled) patch.failure_count = 0;
	}
	if (body.events !== undefined) {
		const events = parseWebhookEvents(body.events);
		if (!events) return badRequest(c, "events must be a list of event kinds");
		patch.events = events;
	}
	if (!Object.keys(patch).length) return badRequest(c, "Send enabled or events");
	const { data, error } = await context.client.from("work_webhooks").update(patch).eq("workspace_id", context.workspaceId).eq("id", id).select(WEBHOOK_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_webhook_write_failed");
	if (!data) return notFound(c, "Webhook not found");
	return json(c, { webhook: formatWebhook(data) });
});

accountWorkIntegrationsRouter.delete("/webhooks/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const denied = adminOnly(c, context);
	if (denied) return denied;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A webhook id is required");
	const { data, error } = await context.client.from("work_webhooks").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_webhook_write_failed");
	if (!data) return notFound(c, "Webhook not found");
	return json(c, { id, deleted: true });
});
