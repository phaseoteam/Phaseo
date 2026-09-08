import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { requireAccountWorkspace } from "./context";

const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CONTROL_SCOPES = ["me:read","models:read","providers:read","pricing:read","credits:read","activity:read","analytics:read","generations:read","feedback:read","feedback:write","workspaces:read","workspaces:write","workspaces:delete","keys:read","keys:write","keys:delete","presets:read","presets:write","presets:delete","settings:read","settings:write","provider_credentials:read","provider_credentials:write","provider_credentials:delete","private_models:read","private_models:write","private_models:delete","guardrails:read","guardrails:write","guardrails:delete","management_keys:read","management_keys:write","management_keys:delete","oauth_clients:read","oauth_clients:write","oauth_clients:delete"] as const;

function randomBase62(length: number) {
	const upperBound = 256 - (256 % BASE62.length);
	let value = "";
	while (value.length < length) {
		const bytes = crypto.getRandomValues(new Uint8Array(length - value.length));
		for (const byte of bytes) if (byte < upperBound) value += BASE62[byte % BASE62.length];
	}
	return value;
}

function generateKey(kind: "sk" | "mk") {
	const kid = randomBase62(12); const secret = randomBase62(40);
	return { kid, secret, plaintext: `phaseo_v1_${kind}_${kid}_${secret}`, prefix: kid.slice(0, 6) };
}
function buffer(value: Uint8Array) { return new Uint8Array(value).buffer; }
async function hmac(env: Env, secret: string) {
	const pepper = String(env.KEY_PEPPER_ACTIVE ?? "").trim(); if (!pepper) throw new Error("key_pepper_unavailable");
	const key = await crypto.subtle.importKey("raw", buffer(new TextEncoder().encode(pepper)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(secret)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function nonNegative(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0; }
function optionalExpiry(value: unknown): string | null | undefined {
	if (value === undefined) return undefined; if (value === null || String(value).trim() === "") return null;
	const date = new Date(String(value)); if (!Number.isFinite(date.getTime())) throw new Error("invalid_expiry"); return date.toISOString();
}
function missingExpiry(error: unknown) { return /expires_at.*schema cache/i.test(String((error as any)?.message ?? "")); }
function requestId(c: { req: { header(name: string): string | undefined } }) { return c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? null; }
function limitMetadata(values: Record<string, unknown>) {
	return {
		dailyRequests: nonNegative(values.dailyRequests), weeklyRequests: nonNegative(values.weeklyRequests), monthlyRequests: nonNegative(values.monthlyRequests),
		dailyCostNanos: nonNegative(values.dailyCostNanos), weeklyCostNanos: nonNegative(values.weeklyCostNanos), monthlyCostNanos: nonNegative(values.monthlyCostNanos),
		...(typeof values.softBlocked === "boolean" ? { softBlocked: values.softBlocked } : {}),
	};
}

async function enforceKeyLimit(context: NonNullable<Awaited<ReturnType<typeof requireAccountWorkspace>>>, env: Env) {
	const workspace = await context.client.from("workspaces").select("tier").eq("id", context.workspaceId).maybeSingle(); if (workspace.error) throw workspace.error;
	if (String(workspace.data?.tier ?? "basic").toLowerCase() === "enterprise") return;
	const limit = Math.max(1, Number.parseInt(env.NON_ENTERPRISE_KEY_LIMIT ?? "100", 10) || 100);
	const [api, management] = await Promise.all([
		context.client.from("keys").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).neq("status", "deleted").neq("name", "__chat_route_managed_key__"),
		context.client.from("management_keys").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId),
	]);
	if (api.error || management.error) throw api.error ?? management.error;
	if ((api.count ?? 0) + (management.count ?? 0) >= limit) throw new Error("key_limit_reached");
}

async function invalidateGatewayKey(env: Env, keyId: string) {
	const key = env.PHASEO_MANAGEMENT_KEY ?? env.PHASEO_CONTROL_KEY; if (!key || !env.PHASEO_CONTROL_SECRET) return;
	await fetch(`${(env.GATEWAY_API_ORIGIN ?? "http://localhost:8787").replace(/\/$/, "")}/v1/keys/${encodeURIComponent(keyId)}/invalidate`, { method: "POST", headers: { authorization: `Bearer ${key}`, "x-control-secret": env.PHASEO_CONTROL_SECRET } });
}

export const accountSettingsKeysRouter = new Hono<{ Bindings: Env }>();

accountSettingsKeysRouter.post("/keys", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const workspaceId = String(body.workspaceId ?? "").trim(); const name = String(body.name ?? "").trim();
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId }); if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (!name) return c.json({ error: "invalid_name" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		await enforceKeyLimit(context, c.env); const key = generateKey("sk"); const limits = limitMetadata(body.limits ?? {});
		const result = await context.client.from("keys").insert({ workspace_id: workspaceId, name, kid: key.kid, hash: await hmac(c.env, key.secret), prefix: key.prefix, status: "active", scopes: typeof body.scopes === "string" ? body.scopes : "[]", created_by: user.id, daily_limit_requests: limits.dailyRequests, weekly_limit_requests: limits.weeklyRequests, monthly_limit_requests: limits.monthlyRequests, daily_limit_cost_nanos: limits.dailyCostNanos, weekly_limit_cost_nanos: limits.weeklyCostNanos, monthly_limit_cost_nanos: limits.monthlyCostNanos }).select("id").maybeSingle();
		if (result.error || !result.data?.id) throw result.error ?? new Error("key_write_failed");
		await recordWorkspaceAuditEvent(context.client, { workspaceId, actorUserId: user.id, action: "api_key.created", targetType: "api_key", targetId: result.data.id, targetName: name, metadata: { prefix: key.prefix, status: "active", limits }, requestId: requestId(c) });
		return c.json({ id: result.data.id, plaintext: key.plaintext, prefix: key.prefix }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "key_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

async function apiKeyContext(c: any) {
	const user = await requireUser(c.req.raw, c.env); if (!user) return null; const client = getDataClient(c.env);
	const key = await client.from("keys").select("*").eq("id", c.req.param("keyId")).maybeSingle(); if (key.error || !key.data?.workspace_id) return null;
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: key.data.workspace_id }); if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return null;
	return { user, context, key: key.data };
}

accountSettingsKeysRouter.put("/keys/:keyId", async (c) => {
	const loaded = await apiKeyContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (String(loaded.key.status).toLowerCase() === "deleted") return c.json({ error: "key_deleted" }, 409, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({})); const update: Record<string, unknown> = {};
	if (typeof body.name === "string") update.name = body.name; if (typeof body.paused === "boolean") update.status = body.paused ? "paused" : "active";
	const result = await loaded.context.client.from("keys").update(update).eq("id", loaded.key.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); if ("status" in update) c.executionCtx.waitUntil(invalidateGatewayKey(c.env, loaded.key.id));
	const action = typeof body.paused === "boolean" ? (body.paused ? "api_key.paused" : "api_key.resumed") : "api_key.updated";
	await recordWorkspaceAuditEvent(loaded.context.client, { workspaceId: loaded.context.workspaceId, actorUserId: loaded.user.id, action, targetType: "api_key", targetId: loaded.key.id, targetName: String(update.name ?? loaded.key.name ?? ""), metadata: { changedFields: Object.keys(update), ...(update.status ? { status: update.status } : {}) }, requestId: requestId(c) });
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsKeysRouter.put("/keys/:keyId/limits", async (c) => {
	const loaded = await apiKeyContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const limits = limitMetadata(body);
	const update: Record<string, unknown> = { daily_limit_requests: limits.dailyRequests, weekly_limit_requests: limits.weeklyRequests, monthly_limit_requests: limits.monthlyRequests, daily_limit_cost_nanos: limits.dailyCostNanos, weekly_limit_cost_nanos: limits.weeklyCostNanos, monthly_limit_cost_nanos: limits.monthlyCostNanos }; if (typeof body.softBlocked === "boolean") update.soft_blocked = body.softBlocked;
	const result = await loaded.context.client.from("keys").update(update).eq("id", loaded.key.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(invalidateGatewayKey(c.env, loaded.key.id));
	await recordWorkspaceAuditEvent(loaded.context.client, { workspaceId: loaded.context.workspaceId, actorUserId: loaded.user.id, action: "api_key.limits_updated", targetType: "api_key", targetId: loaded.key.id, targetName: loaded.key.name, metadata: { limits }, requestId: requestId(c) });
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsKeysRouter.post("/keys/:keyId/rotate", async (c) => {
	const loaded = await apiKeyContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (String(loaded.key.status).toLowerCase() === "deleted") return c.json({ error: "key_deleted" }, 409, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({})); let expires: string | null | undefined; try { expires = optionalExpiry(body.previousKeyExpiresAt); } catch { return c.json({ error: "invalid_expiry" }, 400, PRIVATE_NO_STORE_HEADERS); }
	const key = generateKey("sk"); const newName = typeof body.newName === "string" && body.newName.trim() ? body.newName.trim() : `${loaded.key.name} (rotated)`;
	const inserted = await loaded.context.client.from("keys").insert({ workspace_id: loaded.context.workspaceId, name: newName, kid: key.kid, hash: await hmac(c.env, key.secret), prefix: key.prefix, status: "active", scopes: loaded.key.scopes ?? "[]", created_by: loaded.user.id, daily_limit_requests: nonNegative(loaded.key.daily_limit_requests), weekly_limit_requests: nonNegative(loaded.key.weekly_limit_requests), monthly_limit_requests: nonNegative(loaded.key.monthly_limit_requests), daily_limit_cost_nanos: nonNegative(loaded.key.daily_limit_cost_nanos), weekly_limit_cost_nanos: nonNegative(loaded.key.weekly_limit_cost_nanos), monthly_limit_cost_nanos: nonNegative(loaded.key.monthly_limit_cost_nanos), soft_blocked: Boolean(loaded.key.soft_blocked) }).select("id").maybeSingle();
	if (inserted.error || !inserted.data?.id) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (expires !== undefined) { let updated = await loaded.context.client.from("keys").update({ expires_at: expires }).eq("id", loaded.key.id); if (updated.error && missingExpiry(updated.error)) updated = { error: null } as any; if (updated.error) { await loaded.context.client.from("keys").delete().eq("id", inserted.data.id); return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } c.executionCtx.waitUntil(invalidateGatewayKey(c.env, loaded.key.id)); }
	await recordWorkspaceAuditEvent(loaded.context.client, { workspaceId: loaded.context.workspaceId, actorUserId: loaded.user.id, action: "api_key.rotated", targetType: "api_key", targetId: loaded.key.id, targetName: loaded.key.name, metadata: { replacementKeyId: inserted.data.id, replacementKeyName: newName, previousKeyExpiresAt: expires ?? null }, requestId: requestId(c) });
	return c.json({ id: inserted.data.id, plaintext: key.plaintext, prefix: key.prefix, previousKeyExpiresAt: expires ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsKeysRouter.delete("/keys/:keyId", async (c) => {
	const loaded = await apiKeyContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const confirm = c.req.query("confirmName"); if (confirm && confirm !== loaded.key.name) return c.json({ error: "confirmation_mismatch" }, 409, PRIVATE_NO_STORE_HEADERS); if (String(loaded.key.status).toLowerCase() === "deleted") return c.json({ success: true, alreadyDeleted: true }, 200, PRIVATE_NO_STORE_HEADERS);
	await invalidateGatewayKey(c.env, loaded.key.id); let result = await loaded.context.client.from("keys").update({ status: "deleted", expires_at: new Date().toISOString(), soft_blocked: true, hash: `deleted:${loaded.key.id}` }).eq("id", loaded.key.id); if (result.error && missingExpiry(result.error)) result = await loaded.context.client.from("keys").update({ status: "deleted", soft_blocked: true, hash: `deleted:${loaded.key.id}` }).eq("id", loaded.key.id); if (result.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	for (const table of ["key_guardrails", "broadcast_destination_keys"] as const) { const links = await loaded.context.client.from(table).delete().eq("key_id", loaded.key.id); if (links.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); }
	await recordWorkspaceAuditEvent(loaded.context.client, { workspaceId: loaded.context.workspaceId, actorUserId: loaded.user.id, action: "api_key.deleted", targetType: "api_key", targetId: loaded.key.id, targetName: loaded.key.name, metadata: { prefix: loaded.key.prefix ?? null }, requestId: requestId(c) });
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

function templateScopes(template: string) { if (template === "read-only") return CONTROL_SCOPES.filter((scope) => scope.endsWith(":read")); if (template === "read-write") return CONTROL_SCOPES.filter((scope) => /:(read|write)$/.test(scope)); if (template === "full-control") return [...CONTROL_SCOPES]; return null; }
async function managementContext(c: any) {
	const user = await requireUser(c.req.raw, c.env); if (!user) return null; const client = getDataClient(c.env); const key = await client.from("management_keys").select("*").eq("id", c.req.param("keyId")).maybeSingle(); if (key.error || !key.data?.workspace_id) return null;
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: key.data.workspace_id }); if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return null; return { user, context, key: key.data };
}

accountSettingsKeysRouter.post("/management-keys", async (c) => {
	const user = await requireUser(c.req.raw, c.env); if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(body.workspaceId ?? "") }); if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const scopes = body.template ? templateScopes(String(body.template)) : Array.isArray(body.scopes) ? body.scopes.filter((scope: unknown) => CONTROL_SCOPES.includes(scope as any)) : null; if (!scopes?.length) return c.json({ error: "invalid_scopes" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		await enforceKeyLimit(context, c.env); const key = generateKey("mk"); const name = String(body.name ?? "").trim(); const expiresAt = optionalExpiry(body.expiresAt) ?? null;
		const result = await context.client.from("management_keys").insert({ workspace_id: context.workspaceId, name, kid: key.kid, hash: await hmac(c.env, key.secret), prefix: key.prefix, status: "active", scopes: JSON.stringify(scopes), expires_at: expiresAt, created_by: user.id, created_at: new Date().toISOString() }).select("id,created_at").maybeSingle(); if (result.error || !result.data?.id) throw result.error ?? new Error("key_write_failed");
		await recordWorkspaceAuditEvent(context.client, { workspaceId: context.workspaceId, actorUserId: user.id, action: "management_key.created", targetType: "management_key", targetId: result.data.id, targetName: name, metadata: { prefix: key.prefix, status: "active", accessTemplate: body.template ?? "custom", expiresAt }, requestId: requestId(c) });
		return c.json({ id: result.data.id, plaintext: key.plaintext, prefix: key.prefix, createdAt: result.data.created_at }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "key_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsKeysRouter.get("/management-keys", async (c) => { const workspaceId = c.req.query("workspaceId")?.trim(); const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId }); if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await context.client.from("management_keys").select("*").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }); if (result.error) return c.json({ error: "key_read_failed" }, 503, PRIVATE_NO_STORE_HEADERS); return c.json({ keys: result.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS); });
accountSettingsKeysRouter.get("/management-keys/:keyId", async (c) => { const loaded = await managementContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); return c.json({ key: loaded.key }, 200, PRIVATE_NO_STORE_HEADERS); });

accountSettingsKeysRouter.put("/management-keys/:keyId", async (c) => {
	const loaded = await managementContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const update: Record<string, unknown> = {};
	if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim(); if (typeof body.paused === "boolean") update.status = body.paused ? "paused" : "active";
	try { const expiry = optionalExpiry(body.expiresAt); if (expiry !== undefined) update.expires_at = expiry; } catch { return c.json({ error: "invalid_expiry" }, 400, PRIVATE_NO_STORE_HEADERS); }
	if (body.template) { const scopes = templateScopes(String(body.template)); if (!scopes) return c.json({ error: "invalid_scopes" }, 400, PRIVATE_NO_STORE_HEADERS); update.scopes = JSON.stringify(scopes); }
	if (body.limits) { const limits = limitMetadata(body.limits); Object.assign(update, { daily_limit_requests: limits.dailyRequests, weekly_limit_requests: limits.weeklyRequests, monthly_limit_requests: limits.monthlyRequests, daily_limit_cost_nanos: limits.dailyCostNanos, weekly_limit_cost_nanos: limits.weeklyCostNanos, monthly_limit_cost_nanos: limits.monthlyCostNanos, soft_blocked: typeof body.limits.softBlocked === "boolean" ? body.limits.softBlocked : null }); }
	const result = await loaded.context.client.from("management_keys").update(update).eq("id", loaded.key.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const action = body.limits ? "management_key.limits_updated" : body.template ? "management_key.access_updated" : typeof body.paused === "boolean" ? (body.paused ? "management_key.paused" : "management_key.resumed") : "management_key.updated";
	await recordWorkspaceAuditEvent(loaded.context.client, { workspaceId: loaded.context.workspaceId, actorUserId: loaded.user.id, action, targetType: "management_key", targetId: loaded.key.id, targetName: String(update.name ?? loaded.key.name ?? ""), metadata: { changedFields: Object.keys(update).filter((field) => field !== "scopes"), ...(body.template ? { accessTemplate: body.template } : {}), ...(body.limits ? { limits: limitMetadata(body.limits) } : {}), ...(update.status ? { status: update.status } : {}), ...("expires_at" in update ? { expiresAt: update.expires_at } : {}) }, requestId: requestId(c) });
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsKeysRouter.delete("/management-keys/:keyId", async (c) => {
	const loaded = await managementContext(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const confirm = c.req.query("confirmName"); if (confirm && confirm !== loaded.key.name) return c.json({ error: "confirmation_mismatch" }, 409, PRIVATE_NO_STORE_HEADERS);
	const result = await loaded.context.client.from("management_keys").delete().eq("id", loaded.key.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	await recordWorkspaceAuditEvent(loaded.context.client, { workspaceId: loaded.context.workspaceId, actorUserId: loaded.user.id, action: "management_key.deleted", targetType: "management_key", targetId: loaded.key.id, targetName: loaded.key.name, metadata: { prefix: loaded.key.prefix ?? null }, requestId: requestId(c) });
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
