import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export type SettingsAuthorizedAppsInitialData = {
	authorizedApps: any[];
	signedIn: boolean;
	userId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return NextResponse.json({
			authorizedApps: [],
			signedIn: false,
			userId: null,
		} satisfies SettingsAuthorizedAppsInitialData);
	}

	const { data: authorizations, error: appsError } = await supabase
		.from("oauth_authorizations")
		.select("id, client_id, workspace_id, scopes, created_at, last_used_at")
		.eq("user_id", user.id)
		.is("revoked_at", null)
		.order("last_used_at", { ascending: false, nullsFirst: false });

	if (appsError) throw new Error(appsError.message);
	const clientIds = Array.from(new Set((authorizations ?? []).map((row: any) => String(row.client_id ?? "")).filter(Boolean)));
	const workspaceIds = Array.from(new Set((authorizations ?? []).map((row: any) => String(row.workspace_id ?? "")).filter(Boolean)));
	const [appsResult, workspacesResult] = await Promise.all([
		clientIds.length
			? supabase
				.from("oauth_app_metadata")
				.select("client_id, name, description, logo_url, homepage_url, allowed_scopes")
				.in("client_id", clientIds)
			: Promise.resolve({ data: [], error: null }),
		workspaceIds.length
			? supabase.from("workspaces").select("id, name").in("id", workspaceIds)
			: Promise.resolve({ data: [], error: null }),
	]);
	if (appsResult.error) throw new Error(appsResult.error.message);
	if (workspacesResult.error) throw new Error(workspacesResult.error.message);
	const appsByClientId = new Map((appsResult.data ?? []).map((app: any) => [app.client_id, app]));
	const workspacesById = new Map((workspacesResult.data ?? []).map((workspace: any) => [workspace.id, workspace]));
	const authorizedApps = (authorizations ?? []).map((authorization: any) => {
		const app = appsByClientId.get(authorization.client_id);
		const grantedScopes = Array.isArray(authorization.scopes) ? authorization.scopes.map(String) : [];
		const allowedScopes = Array.isArray(app?.allowed_scopes) ? app.allowed_scopes.map(String) : [];
		return {
			authorization_id: authorization.id,
			app_name: app?.name ?? "OAuth application",
			app_description: app?.description ?? null,
			app_logo_url: app?.logo_url ?? null,
			app_homepage_url: app?.homepage_url ?? null,
			scopes: grantedScopes,
			additional_scopes: allowedScopes.filter((scope: string) => !grantedScopes.includes(scope)),
			team_name: workspacesById.get(authorization.workspace_id)?.name ?? "Unknown workspace",
			authorized_at: authorization.created_at,
			last_used_at: authorization.last_used_at,
		};
	});

	return NextResponse.json({
		authorizedApps,
		signedIn: true,
		userId: user.id,
	} satisfies SettingsAuthorizedAppsInitialData);
}
