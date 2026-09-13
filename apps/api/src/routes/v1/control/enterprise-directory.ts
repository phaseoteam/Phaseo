import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { isResponse, requireCapability, requireJsonBody, requireOAuthWorkspaceRole } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const ICONS = new Set(["users", "briefcase", "megaphone", "code", "palette", "headphones", "landmark", "scale", "heart-pulse", "globe", "flask", "graduation-cap", "shield-check", "shopping-bag", "wrench", "truck", "handshake", "chart"]);
const COLORS = new Set(["blue", "emerald", "amber", "rose", "violet", "slate", "cyan", "teal", "lime", "yellow", "orange", "red", "pink", "fuchsia", "indigo", "sky", "green", "purple"]);

async function authorize(req: Request, write: boolean, roleAuthority = false) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response };
	const capability = requireCapability(auth.value, write ? CAPABILITIES.SETTINGS_WRITE : CAPABILITIES.SETTINGS_READ);
	if (capability) return { response: capability };
	if (roleAuthority) {
		const workspaceCapability = requireCapability(auth.value, CAPABILITIES.WORKSPACES_WRITE, {
			requireExplicitNonOAuthScope: true,
		});
		if (workspaceCapability) return { response: workspaceCapability };
	}
	const role = await requireOAuthWorkspaceRole(
		auth.value,
		auth.value.workspaceId,
		roleAuthority ? ["owner"] : ["owner", "admin"],
	);
	if (role) return { response: role };
	const { data, error } = await getSupabaseAdmin().from("workspace_addon_subscriptions")
		.select("status,grace_until").eq("workspace_id", auth.value.workspaceId).eq("addon_key", "identity").maybeSingle();
	const status = String(data?.status ?? "").toLowerCase();
	const active = !error && (status === "active" || status === "trialing" || (status === "past_due" && Boolean(data?.grace_until) && Date.parse(String(data.grace_until)) > Date.now()));
	if (!active) return { response: json({ error: "identity_addon_required" }, 402, NO_STORE) };
	return { auth: auth.value };
}

async function audit(auth: any, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), { workspaceId: auth.workspaceId, actorUserId: auth.userId, action, targetType, targetId, metadata, requestId: auth.requestId });
}

function pathParam(req: Request, marker: string) {
	const parts = new URL(req.url).pathname.split("/").filter(Boolean);
	const index = parts.lastIndexOf(marker);
	return index >= 0 ? decodeURIComponent(parts[index + 1] ?? "").trim() : "";
}

export function normalizeDepartment(body: Record<string, unknown>, partial = false) {
	const name = body.name === undefined ? undefined : String(body.name).trim();
	const description = body.description === undefined ? undefined : String(body.description ?? "").trim() || null;
	const icon = body.icon === undefined ? undefined : String(body.icon);
	const color = body.color === undefined ? undefined : String(body.color);
	if ((!partial || name !== undefined) && (!name || name.length > 100)) return { error: "department_name_invalid" };
	if (description && description.length > 500) return { error: "department_description_invalid" };
	if (icon !== undefined && !ICONS.has(icon)) return { error: "department_icon_invalid" };
	if (color !== undefined && !COLORS.has(color)) return { error: "department_color_invalid" };
	return { value: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(icon !== undefined && { icon }), ...(color !== undefined && { color }) } };
}

async function getDirectory(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const client = getSupabaseAdmin();
	const [departments, members, effective, overrides, scimUsers] = await Promise.all([
		client.from("workspace_departments").select("id,name,description,icon,color,source_type,source_id,directory_name,name_overridden,created_at,updated_at").eq("workspace_id", access.auth.workspaceId).order("name"),
		client.from("workspace_members").select("user_id,role,joined_at").eq("workspace_id", access.auth.workspaceId),
		client.from("workspace_member_effective_entitlements").select("*").eq("workspace_id", access.auth.workspaceId),
		client.from("workspace_member_overrides").select("*").eq("workspace_id", access.auth.workspaceId),
		client.from("scim_users").select("auth_user_id,user_name,display_name,active,department").eq("workspace_id", access.auth.workspaceId),
	]);
	if ([departments, members, effective, overrides, scimUsers].some((result) => result.error)) return json({ error: "directory_unavailable" }, 503, NO_STORE);
	const userIds = (members.data ?? []).map((row: any) => row.user_id);
	const profiles = userIds.length ? await client.from("users").select("user_id,display_name,email").in("user_id", userIds) : { data: [], error: null };
	if (profiles.error) return json({ error: "directory_unavailable" }, 503, NO_STORE);
	const profileById = new Map((profiles.data ?? []).map((row: any) => [row.user_id, row]));
	const effectiveById = new Map((effective.data ?? []).map((row: any) => [row.user_id, row]));
	const overrideById = new Map((overrides.data ?? []).map((row: any) => [row.user_id, row]));
	const scimById = new Map((scimUsers.data ?? []).filter((row: any) => row.auth_user_id).map((row: any) => [row.auth_user_id, row]));
	const departmentById = new Map((departments.data ?? []).map((row: any) => [row.id, row]));
	const publicMembers = (members.data ?? []).map((member: any) => {
		const entitlement: any = effectiveById.get(member.user_id); const override: any = overrideById.get(member.user_id);
		const scim: any = scimById.get(member.user_id); const profile: any = profileById.get(member.user_id);
		return { user_id: member.user_id, display_name: profile?.display_name ?? scim?.display_name ?? scim?.user_name ?? member.user_id, email: profile?.email ?? scim?.user_name ?? null, workspace_role: member.role, effective_role: entitlement?.access_role ?? member.role, access_source: entitlement?.access_source ?? "workspace", department: entitlement?.department_id ? departmentById.get(entitlement.department_id) ?? null : null, department_source: entitlement?.department_source ?? "none", directory_department: scim?.department ?? null, role_override: override?.access_role ?? null, department_override_enabled: Boolean(override?.department_override_enabled), department_override_id: override?.department_id ?? null, status: scim && !scim.active ? "suspended" : "active", joined_at: member.joined_at };
	});
	return json({ data: { departments: departments.data ?? [], members: publicMembers } }, 200, NO_STORE);
}

async function updateMemberOverride(req: Request) {
	const access = await authorize(req, true, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const userId = pathParam(req, "members"); const role = body.access_role == null || body.access_role === "directory" ? null : String(body.access_role);
	const mode = String(body.department_mode ?? "directory"); const departmentId = mode === "department" ? String(body.department_id ?? "").trim() : null;
	if (!userId || (role !== null && !["member", "admin"].includes(role)) || !["directory", "department", "none"].includes(mode) || (mode === "department" && !departmentId)) return json({ error: "bad_request", message: "Invalid member override" }, 400, NO_STORE);
	const { error } = await getSupabaseAdmin().rpc("apply_workspace_member_override", { p_workspace_id: access.auth.workspaceId, p_user_id: userId, p_access_role: role, p_department_override_enabled: mode !== "directory", p_department_id: departmentId, p_department_position: String(body.department_position ?? "member"), p_actor_user_id: access.auth.userId, p_request_id: access.auth.requestId });
	if (error) return json({ error: "directory_update_failed" }, 503, NO_STORE);
	await audit(access.auth, "identity.directory_member.updated", "workspace_member", userId, { access_role: role, department_mode: mode, department_id: departmentId });
	return json({ data: { updated: true } }, 200, NO_STORE);
}

async function listDepartments(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const { data, error } = await getSupabaseAdmin().from("workspace_departments").select("id,name,description,icon,color,source_type,source_id,directory_name,name_overridden,created_at,updated_at").eq("workspace_id", access.auth.workspaceId).order("name");
	return error ? json({ error: "directory_unavailable" }, 503, NO_STORE) : json({ data: data ?? [] }, 200, NO_STORE);
}

async function createDepartment(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const normalized = normalizeDepartment(body); if ("error" in normalized) return json({ error: "bad_request", message: normalized.error }, 400, NO_STORE);
	const value: any = normalized.value;
	const { data, error } = await getSupabaseAdmin().rpc("management_create_workspace_department", { p_workspace_id: access.auth.workspaceId, p_name: value.name, p_description: value.description ?? null, p_icon: value.icon ?? "users", p_color: value.color ?? "blue", p_actor_user_id: access.auth.userId, p_request_id: access.auth.requestId });
	if (error) return json({ error: error.code === "23505" ? "department_exists" : "directory_update_failed" }, error.code === "23505" ? 409 : 503, NO_STORE);
	await audit(access.auth, "identity.department.created", "workspace_department", String(data.id), { name: value.name });
	return json({ data }, 201, NO_STORE);
}

async function updateDepartment(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const normalized = normalizeDepartment(body, true); if ("error" in normalized) return json({ error: "bad_request", message: normalized.error }, 400, NO_STORE);
	const id = pathParam(req, "departments"); const client = getSupabaseAdmin();
	const current = await client.from("workspace_departments").select("id,name,description,icon,color").eq("workspace_id", access.auth.workspaceId).eq("id", id).maybeSingle();
	if (current.error) return json({ error: "directory_unavailable" }, 503, NO_STORE); if (!current.data) return json({ error: "not_found" }, 404, NO_STORE);
	const value: any = normalized.value; const next = { ...current.data, ...value };
	const result = await client.rpc("management_update_workspace_department", { p_workspace_id: access.auth.workspaceId, p_department_id: id, p_name: next.name, p_description: next.description ?? null, p_icon: next.icon, p_color: next.color, p_actor_user_id: access.auth.userId, p_request_id: access.auth.requestId });
	if (result.error) return json({ error: result.error.code === "23505" ? "department_exists" : "directory_update_failed" }, result.error.code === "23505" ? 409 : 503, NO_STORE);
	await audit(access.auth, "identity.department.updated", "workspace_department", id, { fields: Object.keys(value) });
	return json({ data: result.data }, 200, NO_STORE);
}

async function deleteDepartment(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const id = pathParam(req, "departments");
	const { data, error } = await getSupabaseAdmin().rpc("management_delete_workspace_department", { p_workspace_id: access.auth.workspaceId, p_department_id: id, p_actor_user_id: access.auth.userId, p_request_id: access.auth.requestId });
	if (error) return json({ error: String(error.message ?? "").includes("not found") ? "not_found" : "directory_update_failed" }, String(error.message ?? "").includes("not found") ? 404 : 503, NO_STORE);
	await audit(access.auth, "identity.department.deleted", "workspace_department", id, { name: data.name }); return json({ deleted: true }, 200, NO_STORE);
}

async function setDepartmentMember(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const departmentId = pathParam(req, "departments"); const userId = pathParam(req, "members"); const position = String(body.position ?? "member");
	if (!departmentId || !userId || !["member", "lead"].includes(position)) return json({ error: "bad_request" }, 400, NO_STORE);
	const client = getSupabaseAdmin();
	const { data, error } = await client.rpc("management_set_workspace_department_member", { p_workspace_id: access.auth.workspaceId, p_department_id: departmentId, p_user_id: userId, p_position: position, p_primary: body.primary === true, p_actor_user_id: access.auth.userId, p_request_id: access.auth.requestId });
	if (error) return json({ error: "invalid_membership" }, 400, NO_STORE); await audit(access.auth, "identity.department_member.updated", "workspace_member", userId, { department_id: departmentId, position, primary: body.primary === true }); return json({ data }, 200, NO_STORE);
}

async function deleteDepartmentMember(req: Request) {
	const access = await authorize(req, true); if ("response" in access) return access.response;
	const departmentId = pathParam(req, "departments"); const userId = pathParam(req, "members");
	const { data, error } = await getSupabaseAdmin().rpc("management_delete_workspace_department_member", { p_workspace_id: access.auth.workspaceId, p_department_id: departmentId, p_user_id: userId, p_actor_user_id: access.auth.userId });
	if (error) return json({ error: "directory_update_failed" }, 503, NO_STORE); if (data !== true) return json({ error: "not_found" }, 404, NO_STORE);
	await audit(access.auth, "identity.department_member.deleted", "workspace_member", userId, { department_id: departmentId }); return json({ deleted: true }, 200, NO_STORE);
}

async function listMappings(req: Request) {
	const access = await authorize(req, false); if ("response" in access) return access.response;
	const { data, error } = await getSupabaseAdmin().from("scim_group_mappings").select("id,scim_group_id,department_id,access_role,department_position,created_at,updated_at").eq("workspace_id", access.auth.workspaceId).order("created_at");
	return error ? json({ error: "directory_unavailable" }, 503, NO_STORE) : json({ data: data ?? [] }, 200, NO_STORE);
}

async function createMapping(req: Request) {
	const access = await authorize(req, true, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const groupId = String(body.scim_group_id ?? "").trim(); const departmentId = String(body.department_id ?? "").trim(); const role = String(body.access_role ?? "member"); const position = String(body.department_position ?? "member");
	if (!groupId || !departmentId || !["member", "admin"].includes(role) || !["member", "lead"].includes(position)) return json({ error: "bad_request", message: "Invalid group mapping" }, 400, NO_STORE);
	const { data, error } = await getSupabaseAdmin().from("scim_group_mappings").insert({ workspace_id: access.auth.workspaceId, scim_group_id: groupId, department_id: departmentId, access_role: role, department_position: position, created_by: access.auth.userId }).select("id,scim_group_id,department_id,access_role,department_position,created_at,updated_at").single();
	if (error) return json({ error: error.code === "23505" ? "mapping_exists" : "invalid_mapping" }, error.code === "23505" ? 409 : 400, NO_STORE);
	await audit(access.auth, "identity.group_mapping.created", "scim_group_mapping", String(data.id), { scim_group_id: groupId, department_id: departmentId }); return json({ data }, 201, NO_STORE);
}

async function updateMapping(req: Request) {
	const access = await authorize(req, true, true); if ("response" in access) return access.response;
	const body = await requireJsonBody(req); if (isResponse(body)) return body;
	const id = pathParam(req, "group-mappings"); const role = body.access_role === undefined ? undefined : String(body.access_role); const position = body.department_position === undefined ? undefined : String(body.department_position);
	if ((role && !["member", "admin"].includes(role)) || (position && !["member", "lead"].includes(position)) || (!role && !position)) return json({ error: "bad_request", message: "Invalid group mapping" }, 400, NO_STORE);
	const { data, error } = await getSupabaseAdmin().from("scim_group_mappings").update({ ...(role && { access_role: role }), ...(position && { department_position: position }), updated_at: new Date().toISOString() }).eq("workspace_id", access.auth.workspaceId).eq("id", id).select("id,scim_group_id,department_id,access_role,department_position,created_at,updated_at").maybeSingle();
	if (error) return json({ error: "directory_update_failed" }, 503, NO_STORE); if (!data) return json({ error: "not_found" }, 404, NO_STORE);
	await audit(access.auth, "identity.group_mapping.updated", "scim_group_mapping", id, { access_role: role, department_position: position }); return json({ data }, 200, NO_STORE);
}

async function deleteMapping(req: Request) {
	const access = await authorize(req, true, true); if ("response" in access) return access.response;
	const id = pathParam(req, "group-mappings"); const { data, error } = await getSupabaseAdmin().from("scim_group_mappings").delete().eq("workspace_id", access.auth.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return json({ error: "directory_update_failed" }, 503, NO_STORE); if (!data) return json({ error: "not_found" }, 404, NO_STORE);
	await audit(access.auth, "identity.group_mapping.deleted", "scim_group_mapping", id); return json({ deleted: true }, 200, NO_STORE);
}

export const enterpriseDirectoryRoutes = new Hono<Env>();
enterpriseDirectoryRoutes.get("/directory", withRuntime(getDirectory));
enterpriseDirectoryRoutes.put("/directory/members/:id", withRuntime(updateMemberOverride));
enterpriseDirectoryRoutes.get("/departments", withRuntime(listDepartments));
enterpriseDirectoryRoutes.post("/departments", withRuntime(createDepartment));
enterpriseDirectoryRoutes.patch("/departments/:id", withRuntime(updateDepartment));
enterpriseDirectoryRoutes.delete("/departments/:id", withRuntime(deleteDepartment));
enterpriseDirectoryRoutes.put("/departments/:departmentId/members/:userId", withRuntime(setDepartmentMember));
enterpriseDirectoryRoutes.delete("/departments/:departmentId/members/:userId", withRuntime(deleteDepartmentMember));
enterpriseDirectoryRoutes.get("/group-mappings", withRuntime(listMappings));
enterpriseDirectoryRoutes.post("/group-mappings", withRuntime(createMapping));
enterpriseDirectoryRoutes.patch("/group-mappings/:id", withRuntime(updateMapping));
enterpriseDirectoryRoutes.delete("/group-mappings/:id", withRuntime(deleteMapping));
