import { NextResponse } from "next/server";
import { isWorkspaceAddonActive } from "@/lib/billing/identityAddon";
import { requireActiveWorkspaceBillingAdmin } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

const ICONS = new Set(["users","briefcase","megaphone","code","palette","headphones","landmark","scale","heart-pulse","globe","flask","graduation-cap","shield-check","shopping-bag","wrench","truck","handshake","chart"]);
const COLORS = new Set(["blue","emerald","amber","rose","violet","slate","cyan","teal","lime","yellow","orange","red","pink","fuchsia","indigo","sky","green","purple"]);

async function requireEnterpriseAdmin(request: Request) {
	const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
	const actor = await requireActiveWorkspaceBillingAdmin(["owner", "admin"], requestedWorkspaceId);
	const admin = createAdminClient();
	const { data: subscription, error } = await admin.from("workspace_addon_subscriptions")
		.select("status,grace_until").eq("workspace_id", actor.workspaceId).eq("addon_key", "identity").maybeSingle();
	if (error) throw error;
	if (!isWorkspaceAddonActive(subscription)) throw new Error("enterprise_required");
	return { ...actor, admin };
}
export async function GET(request: Request) {
	try {
		const { workspaceId, admin } = await requireEnterpriseAdmin(request);
		const [departmentsResult, membersResult, effectiveResult, overridesResult, scimUsersResult] = await Promise.all([
			admin.from("workspace_departments").select("id,name,description,icon,color,source_type,source_id,directory_name,name_overridden,created_at,updated_at").eq("workspace_id", workspaceId).order("name"),
			admin.from("workspace_members").select("user_id,role,joined_at").eq("workspace_id", workspaceId),
			admin.from("workspace_member_effective_entitlements").select("*").eq("workspace_id", workspaceId),
			admin.from("workspace_member_overrides").select("*").eq("workspace_id", workspaceId),
			admin.from("scim_users").select("auth_user_id,user_name,display_name,active,department").eq("workspace_id", workspaceId),
		]);
		for (const result of [departmentsResult,membersResult,effectiveResult,overridesResult,scimUsersResult]) if (result.error) throw result.error;
		const userIds = (membersResult.data ?? []).map((row) => row.user_id);
		const profilesResult = userIds.length
			? await admin.from("users").select("user_id,display_name,email").in("user_id", userIds)
			: { data: [], error: null };
		if (profilesResult.error) throw profilesResult.error;
		const profiles = new Map((profilesResult.data ?? []).map((row) => [row.user_id, row]));
		const effective = new Map((effectiveResult.data ?? []).map((row) => [row.user_id, row]));
		const overrides = new Map((overridesResult.data ?? []).map((row) => [row.user_id, row]));
		const scimUsers = new Map((scimUsersResult.data ?? []).filter((row) => row.auth_user_id).map((row) => [row.auth_user_id, row]));
		const departments = departmentsResult.data ?? [];
		const departmentById = new Map(departments.map((row) => [row.id, row]));
		return NextResponse.json({
			departments,
			members: (membersResult.data ?? []).map((member) => {
				const entitlement = effective.get(member.user_id);
				const override = overrides.get(member.user_id);
				const scim = scimUsers.get(member.user_id);
				const profile = profiles.get(member.user_id);
				return {
					userId: member.user_id,
					displayName: profile?.display_name ?? scim?.display_name ?? scim?.user_name ?? member.user_id,
					email: profile?.email ?? scim?.user_name ?? null,
					workspaceRole: member.role,
					effectiveRole: entitlement?.access_role ?? member.role,
					accessSource: entitlement?.access_source ?? "workspace",
					department: entitlement?.department_id ? departmentById.get(entitlement.department_id) ?? null : null,
					departmentSource: entitlement?.department_source ?? "none",
					directoryDepartment: scim?.department ?? null,
					roleOverride: override?.access_role ?? null,
					departmentOverrideEnabled: Boolean(override?.department_override_enabled),
					departmentOverrideId: override?.department_id ?? null,
					status: scim && !scim.active ? "suspended" : "active",
				};
			}),
		}, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Directory unavailable";
		const status = message === "Unauthorized" || message === "unauthorized" ? 403 : message === "enterprise_required" ? 402 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}

export async function POST(request: Request) {
	try {
		const { workspaceId, userId, admin } = await requireEnterpriseAdmin(request);
		const body = await request.json();
		const action = String(body.action ?? "");
		const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
		if (action === "create_department" || action === "update_department") {
			const name = String(body.name ?? "").trim();
			const icon = String(body.icon ?? "");
			const color = String(body.color ?? "");
			if (name.length < 1 || name.length > 100 || !ICONS.has(icon) || !COLORS.has(color)) {
				return NextResponse.json({ error: "Invalid department" }, { status: 400 });
			}
			const rpc = action === "create_department"
				? admin.rpc("create_workspace_department", { p_workspace_id: workspaceId, p_name: name, p_icon: icon, p_color: color, p_actor_user_id: userId, p_request_id: requestId })
				: admin.rpc("update_workspace_department", { p_workspace_id: workspaceId, p_department_id: String(body.departmentId ?? ""), p_name: name, p_icon: icon, p_color: color, p_actor_user_id: userId, p_request_id: requestId });
			const result = await rpc;
			if (result.error) throw result.error;
			return NextResponse.json({ department: result.data });
		}
		if (action === "update_member") {
			const targetUserId = String(body.userId ?? "");
			const accessRole = body.accessRole == null || body.accessRole === "directory" ? null : String(body.accessRole);
			const departmentMode = String(body.departmentMode ?? "directory");
			const departmentId = departmentMode === "department" ? String(body.departmentId ?? "") : null;
			if (!targetUserId || (accessRole !== null && !["member","admin"].includes(accessRole)) || !["directory","department","none"].includes(departmentMode)) {
				return NextResponse.json({ error: "Invalid member override" }, { status: 400 });
			}
			const { error } = await admin.rpc("apply_workspace_member_override", {
				p_workspace_id: workspaceId,p_user_id: targetUserId,p_access_role: accessRole,
				p_department_override_enabled: departmentMode !== "directory",
				p_department_id: departmentId,p_department_position: "member",
				p_actor_user_id: userId,p_request_id: requestId,
			});
			if (error) throw error;
			return NextResponse.json({ ok: true });
		}
		return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Directory update failed";
		const status = message === "Unauthorized" || message === "unauthorized" ? 403 : message === "enterprise_required" ? 402 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
