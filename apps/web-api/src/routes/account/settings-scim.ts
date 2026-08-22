import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { generateScimToken, hashScimToken } from "@/scim/auth";
import { requireAccountWorkspace } from "./context";
import { workspaceHasAddon } from "@/billing/workspaceAddons";

export const accountSettingsScimRouter = new Hono<{ Bindings: Env }>();

async function requireScimAdmin(request: Request, env: Env, workspaceId: string) {
	const context = await requireAccountWorkspace({ request, env, workspaceId });
	return context && ["owner", "admin"].includes(context.role.toLowerCase()) ? context : null;
}

async function hasIdentityAddon(context: NonNullable<Awaited<ReturnType<typeof requireScimAdmin>>>) {
	return workspaceHasAddon(context.client, context.workspaceId, "identity");
}

async function requireIdentityAddon(context: NonNullable<Awaited<ReturnType<typeof requireScimAdmin>>>) {
	return (await hasIdentityAddon(context)) ? null : { error: "identity_addon_required" as const };
}

accountSettingsScimRouter.get("/teams/:workspaceId/scim", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const endpoint = await context.client.from("scim_endpoints").select("id,enabled,created_at,updated_at").eq("workspace_id", context.workspaceId).maybeSingle();
	if (endpoint.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!endpoint.data) return c.json({ endpoint: null, tokens: [], userCount: 0, groupCount: 0, lastEvent: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const [tokens, users, groups, lastEvent] = await Promise.all([
		context.client.from("scim_tokens").select("id,token_prefix,label,created_at,expires_at,last_used_at,revoked_at").eq("endpoint_id", endpoint.data.id).order("created_at", { ascending: false }),
		context.client.from("scim_users").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId),
		context.client.from("scim_groups").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId),
		context.client.from("scim_audit_events").select("action,outcome,http_status,created_at").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
	]);
	if ([tokens, users, groups, lastEvent].some((result) => result.error)) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ endpoint: endpoint.data, tokens: tokens.data ?? [], userCount: users.count ?? 0, groupCount: groups.count ?? 0, lastEvent: lastEvent.data ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.put("/teams/:workspaceId/scim", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ enabled?: boolean }>().catch((): { enabled?: boolean } => ({}));
	if (body.enabled && (await requireIdentityAddon(context))) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("scim_endpoints").upsert({ workspace_id: context.workspaceId, enabled: Boolean(body.enabled), updated_at: new Date().toISOString() }, { onConflict: "workspace_id" }).select("id,enabled,created_at,updated_at").single();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ endpoint: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.post("/teams/:workspaceId/scim/tokens", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ label?: string; expiresAt?: string | null }>().catch((): { label?: string; expiresAt?: string | null } => ({})); const label = String(body.label ?? "Provisioning token").trim().slice(0, 100);
	if (!label) return c.json({ error: "invalid_label" }, 400, PRIVATE_NO_STORE_HEADERS);
	const endpoint = await context.client.from("scim_endpoints").upsert({ workspace_id: context.workspaceId }, { onConflict: "workspace_id" }).select("id").single();
	if (endpoint.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const generated = generateScimToken(); const tokenHash = await hashScimToken(c.env, generated.token).catch(() => null);
	if (!tokenHash) return c.json({ error: "scim_token_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
	if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return c.json({ error: "invalid_expiry" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("scim_tokens").insert({ endpoint_id: endpoint.data.id, token_prefix: generated.prefix, token_hash: tokenHash, label, created_by: context.user.id, expires_at: expiresAt?.toISOString() ?? null }).select("id,token_prefix,label,created_at,expires_at").single();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ...result.data, token: generated.token }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.delete("/teams/:workspaceId/scim/tokens/:tokenId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const endpoint = await context.client.from("scim_endpoints").select("id").eq("workspace_id", context.workspaceId).maybeSingle();
	if (endpoint.error || !endpoint.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("scim_tokens").update({ revoked_at: new Date().toISOString() }).eq("endpoint_id", endpoint.data.id).eq("id", c.req.param("tokenId")).is("revoked_at", null).select("id").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.get("/teams/:workspaceId/scim/audit", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
	const before = c.req.query("before");
	let query = context.client.from("scim_audit_events").select("id,request_id,correlation_id,action,resource_type,resource_id,outcome,http_status,scim_type,detail,created_at").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }).limit(limit);
	if (before) query = query.lt("created_at", before);
	const result = await query;
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ events: result.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.get("/teams/:workspaceId/scim/departments", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [departments, mappings, grants] = await Promise.all([
		context.client.from("workspace_departments").select("id,name,description,created_at,updated_at").eq("workspace_id", context.workspaceId).order("name"),
		context.client.from("scim_group_mappings").select("id,scim_group_id,department_id,access_role,department_position,created_at,updated_at").eq("workspace_id", context.workspaceId),
		context.client.from("workspace_department_grants").select("user_id,department_id,position,is_primary,source_type,source_id").eq("workspace_id", context.workspaceId),
	]);
	if (departments.error || mappings.error || grants.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ departments: departments.data ?? [], mappings: mappings.data ?? [], memberships: grants.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.post("/teams/:workspaceId/scim/departments", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ name?: string; description?: string | null }>().catch((): { name?: string; description?: string | null } => ({}));
	const name = String(body.name ?? "").trim(); if (!name || name.length > 100) return c.json({ error: "invalid_name" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_departments").insert({ workspace_id: context.workspaceId, name, description: body.description?.trim() || null }).select("id,name,description,created_at,updated_at").single();
	if (result.error) return c.json({ error: result.error.code === "23505" ? "department_exists" : "settings_unavailable" }, result.error.code === "23505" ? 409 : 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ department: result.data }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.patch("/teams/:workspaceId/scim/departments/:departmentId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId")); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ name?: string; description?: string | null }>().catch((): { name?: string; description?: string | null } => ({}));
	const name = body.name?.trim(); if (body.name !== undefined && (!name || name.length > 100)) return c.json({ error: "invalid_name" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_departments").update({ ...(name && { name }), ...(body.description !== undefined && { description: body.description?.trim() || null }), updated_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", c.req.param("departmentId")).select("id,name,description,updated_at").maybeSingle();
	if (result.error) return c.json({ error: result.error.code === "23505" ? "department_exists" : "settings_unavailable" }, result.error.code === "23505" ? 409 : 503, PRIVATE_NO_STORE_HEADERS); if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS); return c.json({ department: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.delete("/teams/:workspaceId/scim/departments/:departmentId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId")); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_departments").delete().eq("workspace_id", context.workspaceId).eq("id", c.req.param("departmentId")).select("id").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.post("/teams/:workspaceId/scim/mappings", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId"));
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ groupId?: string; departmentId?: string; accessRole?: string; departmentPosition?: string }>().catch((): { groupId?: string; departmentId?: string; accessRole?: string; departmentPosition?: string } => ({}));
	if (!["member", "admin"].includes(String(body.accessRole ?? "member")) || !["member", "lead"].includes(String(body.departmentPosition ?? "member"))) return c.json({ error: "invalid_mapping" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("scim_group_mappings").insert({ workspace_id: context.workspaceId, scim_group_id: body.groupId, department_id: body.departmentId, access_role: body.accessRole ?? "member", department_position: body.departmentPosition ?? "member", created_by: context.user.id }).select("id,scim_group_id,department_id,access_role,department_position,created_at,updated_at").single();
	if (result.error) return c.json({ error: result.error.code === "23505" ? "mapping_exists" : "invalid_mapping" }, result.error.code === "23505" ? 409 : 400, PRIVATE_NO_STORE_HEADERS);
	return c.json({ mapping: result.data }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.put("/teams/:workspaceId/scim/departments/:departmentId/members/:userId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId")); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ position?: string; primary?: boolean }>().catch((): { position?: string; primary?: boolean } => ({})); const position = String(body.position ?? "member");
	if (!["member", "lead"].includes(position)) return c.json({ error: "invalid_position" }, 400, PRIVATE_NO_STORE_HEADERS);
	if (body.primary) await context.client.from("workspace_department_grants").update({ is_primary: false }).eq("workspace_id", context.workspaceId).eq("user_id", c.req.param("userId")).eq("source_type", "manual");
	const result = await context.client.from("workspace_department_grants").upsert({ workspace_id: context.workspaceId, user_id: c.req.param("userId"), department_id: c.req.param("departmentId"), source_type: "manual", source_id: c.req.param("userId"), position, is_primary: Boolean(body.primary), updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id,department_id,source_type,source_id" }).select("user_id,department_id,position,is_primary").single();
	if (result.error) return c.json({ error: "invalid_membership" }, 400, PRIVATE_NO_STORE_HEADERS); return c.json({ membership: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.delete("/teams/:workspaceId/scim/departments/:departmentId/members/:userId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId")); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_department_grants").delete().eq("workspace_id", context.workspaceId).eq("department_id", c.req.param("departmentId")).eq("user_id", c.req.param("userId")).eq("source_type", "manual").select("user_id").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.patch("/teams/:workspaceId/scim/mappings/:mappingId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId")); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ accessRole?: string; departmentPosition?: string }>().catch((): { accessRole?: string; departmentPosition?: string } => ({}));
	if ((body.accessRole && !["member", "admin"].includes(body.accessRole)) || (body.departmentPosition && !["member", "lead"].includes(body.departmentPosition))) return c.json({ error: "invalid_mapping" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("scim_group_mappings").update({ ...(body.accessRole && { access_role: body.accessRole }), ...(body.departmentPosition && { department_position: body.departmentPosition }), updated_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", c.req.param("mappingId")).select("id,access_role,department_position,updated_at").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS); return c.json({ mapping: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsScimRouter.delete("/teams/:workspaceId/scim/mappings/:mappingId", async (c) => {
	const context = await requireScimAdmin(c.req.raw, c.env, c.req.param("workspaceId")); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (await requireIdentityAddon(context)) return c.json({ error: "identity_addon_required" }, 402, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("scim_group_mappings").delete().eq("workspace_id", context.workspaceId).eq("id", c.req.param("mappingId")).select("id").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
