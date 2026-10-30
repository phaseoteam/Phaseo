import type { SupabaseClient } from "@supabase/supabase-js";
import { isWorkspaceAddonActive } from "@/lib/billing/identityAddon";

export type ScimDirectoryLinkResult = { workspaceId: string; scimUserId: string } | null;

export async function linkScimDirectoryUser(args: {
	admin: SupabaseClient;
	authUserId: string;
	email: string | null | undefined;
	ssoProviderId: string | null;
}): Promise<ScimDirectoryLinkResult> {
	const email = String(args.email ?? "").trim().toLowerCase();
	const providerId = String(args.ssoProviderId ?? "").trim();
	if (!email || !providerId) return null;

	const users = await args.admin.from("scim_users").select("id,workspace_id,auth_user_id").eq("user_name_normalized", email).eq("active", true);
	if (users.error || !users.data?.length) return null;
	const workspaceIds = [...new Set(users.data.map((row) => String(row.workspace_id)))];
	const [settings, endpoints, subscriptions] = await Promise.all([
		args.admin.from("workspace_settings").select("workspace_id,sso_enabled,sso_provider_identifier").in("workspace_id", workspaceIds).eq("sso_enabled", true),
		args.admin.from("scim_endpoints").select("workspace_id").in("workspace_id", workspaceIds).eq("enabled", true),
		args.admin.from("workspace_addon_subscriptions").select("workspace_id,status,grace_until").in("workspace_id", workspaceIds).eq("addon_key", "identity"),
	]);
	if (settings.error || endpoints.error || subscriptions.error) throw new Error("scim_sso_configuration_lookup_failed");
	const enabledEndpoints = new Set((endpoints.data ?? []).map((row) => String(row.workspace_id)));
	const activeAddons = new Set((subscriptions.data ?? []).filter(isWorkspaceAddonActive).map((row) => String(row.workspace_id)));
	const matchingWorkspaces = new Set((settings.data ?? []).filter((row) => String(row.sso_provider_identifier ?? "") === providerId && enabledEndpoints.has(String(row.workspace_id)) && activeAddons.has(String(row.workspace_id))).map((row) => String(row.workspace_id)));
	const matches = users.data.filter((row) => matchingWorkspaces.has(String(row.workspace_id)) && (!row.auth_user_id || row.auth_user_id === args.authUserId));
	if (matches.length !== 1) return null;
	const match = matches[0];
	if (!match.auth_user_id) {
		const linked = await args.admin.from("scim_users").update({ auth_user_id: args.authUserId }).eq("id", match.id).eq("workspace_id", match.workspace_id).is("auth_user_id", null).select("id").maybeSingle();
		if (linked.error || !linked.data) throw new Error("scim_directory_link_conflict");
	}
	await args.admin.from("users").upsert({ user_id: args.authUserId, default_workspace_id: match.workspace_id }, { onConflict: "user_id" });
	return { workspaceId: String(match.workspace_id), scimUserId: String(match.id) };
}
