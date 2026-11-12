import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { isKeyStorageLocationId } from "@/routes/account/key-storage-locations";
import { invalidateGatewayKey } from "@/routes/account/settings-keys";

// Gateway invalidation calls run a few at a time; the gateway's 60-second key
// cache bounds how long any missed invalidation can last.
const INVALIDATION_CONCURRENCY = 8;

const scopeSchema = z.object({
	locationId: z.string().refine(isKeyStorageLocationId, "Unknown storage location"),
	action: z.enum(["revoke", "pause"]),
	keysCreatedBefore: z.iso.datetime({ offset: true }),
}).strict();

const incidentSchema = scopeSchema.extend({
	title: z.string().trim().min(1).max(200),
	customerMessage: z.string().trim().min(1).max(2000),
	sourceUrl: z.url({ protocol: /^https$/ }).max(500).nullable().optional(),
	// Staff retype the location id to confirm a change that reaches every workspace.
	confirmLocationId: z.string(),
	// Makes retries safe: one request id declares at most one incident.
	requestId: z.uuid(),
}).strict();

export const internalKeyIncidentsRouter = new Hono<{ Bindings: Env; Variables: { adminId: string } }>();

internalKeyIncidentsRouter.use("/key-incidents/*", async (c, next) => {
	if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	const user = await requireUser(c.req.raw, c.env);
	const role = user ? await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle() : null;
	if (!user || role?.error || String(role?.data?.role).toLowerCase() !== "admin") {
		console.warn("key_incident_access_denied", { actorId: user?.id ?? null });
		return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	c.set("adminId", user.id);
	for (const [key, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) c.header(key, value);
	await next();
});

internalKeyIncidentsRouter.get("/key-incidents/list", async (c) => {
	const { data, error } = await getDataClient(c.env).from("key_storage_incidents")
		.select("id,location_id,action,keys_created_before,title,customer_message,source_url,declared_by,created_at,applied_at,affected_keys,affected_workspaces")
		.order("created_at", { ascending: false }).limit(50);
	if (error) return c.json({ error: "key_incidents_unavailable" }, 503);
	return c.json({ incidents: data ?? [] });
});

internalKeyIncidentsRouter.post("/key-incidents/preview", async (c) => {
	const parsed = scopeSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
	const { data, error } = await getDataClient(c.env).rpc("preview_key_storage_incident", {
		p_location_id: parsed.data.locationId, p_keys_created_before: parsed.data.keysCreatedBefore, p_action: parsed.data.action,
	});
	if (error) return c.json({ error: "preview_failed" }, 503);
	const row = (Array.isArray(data) ? data[0] : data) ?? {};
	return c.json({ keys: Number(row.keys ?? 0), workspaces: Number(row.workspaces ?? 0) });
});

async function invalidateAll(env: Env, keyIds: string[]) {
	const queue = [...keyIds];
	let failed = 0;
	await Promise.all(Array.from({ length: Math.min(INVALIDATION_CONCURRENCY, queue.length) }, async () => {
		for (let keyId = queue.shift(); keyId; keyId = queue.shift()) {
			if (!await invalidateGatewayKey(env, keyId)) failed += 1;
		}
	}));
	if (failed) console.error("[key-incidents] gateway invalidation failed for some keys", { failed, total: keyIds.length });
}

/**
 * Declares an incident and applies it in one database transaction, then emails
 * the affected workspaces. Retrying with the same requestId is safe: the
 * database returns the first result and duplicate emails are skipped, so a
 * failed email step can be retried without changing more keys.
 */
internalKeyIncidentsRouter.post("/key-incidents/apply", async (c) => {
	const parsed = incidentSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
	const input = parsed.data;
	if (input.confirmLocationId !== input.locationId) return c.json({ error: "confirmation_mismatch", message: "Type the location id to confirm." }, 409);
	if (Date.parse(input.keysCreatedBefore) > Date.now() + 60_000) return c.json({ error: "invalid_request", message: "The cut-off can't be in the future." }, 400);
	const client = getDataClient(c.env);
	const declared = await client.rpc("declare_key_storage_incident", {
		p_client_request_id: input.requestId, p_location_id: input.locationId, p_action: input.action, p_keys_created_before: input.keysCreatedBefore,
		p_title: input.title, p_customer_message: input.customerMessage, p_source_url: input.sourceUrl ?? null, p_declared_by: c.get("adminId"),
	});
	if (declared.error || !declared.data) {
		console.error("[key-incidents] declare failed", { requestId: input.requestId, message: declared.error?.message });
		return c.json({ error: "incident_apply_failed", message: "Nothing was changed. Try again." }, 503);
	}
	const result = declared.data as { incident_id: string; created: boolean; keys: Array<{ key_id: string; workspace_id: string }> };
	const incidentId = result.incident_id;
	const keys = result.keys ?? [];
	if (result.created) console.warn("key_incident_applied", { incidentId, actorId: c.get("adminId"), locationId: input.locationId, action: input.action, keys: keys.length });
	// Clear the gateway's cache even if the emails below fail.
	c.executionCtx.waitUntil(invalidateAll(c.env, keys.map((key) => key.key_id)));
	const summary = { incidentId, keys: keys.length, workspaces: new Set(keys.map((key) => key.workspace_id)).size };

	// Email each affected workspace's owners and admins once per incident.
	const recipients = await client.rpc("key_storage_incident_recipients", { p_incident_id: incidentId });
	const rows = (recipients.data ?? []) as Array<{ workspace_id: string; workspace_name: string | null; user_id: string; email: string; keys: number }>;
	const outbox = recipients.error || rows.length === 0 ? null : await client.from("email_outbox").upsert(rows.map((row) => ({
		kind: "security_storage_incident",
		template: "security_storage_incident",
		to_email: row.email,
		// The gateway's outbox renders the subject, naming the platform.
		subject: null,
		workspace_id: row.workspace_id,
		user_id: row.user_id,
		dedupe_key: `storage_incident:${incidentId}:${row.workspace_id}:${row.user_id}`,
		payload: {
			incident_id: incidentId, location_id: input.locationId, action: input.action, title: input.title,
			message: input.customerMessage, source_url: input.sourceUrl ?? null, workspace_name: row.workspace_name, keys: Number(row.keys),
		},
	})), { onConflict: "dedupe_key", ignoreDuplicates: true });
	if (recipients.error || outbox?.error) {
		console.error("[key-incidents] email enqueue failed", { incidentId });
		return c.json({ ...summary, error: "notification_enqueue_failed", message: "The keys were changed, but the emails weren't queued. Retry to send them; no more keys will change." }, 503);
	}
	return c.json({ ...summary, emails: rows.length });
});
