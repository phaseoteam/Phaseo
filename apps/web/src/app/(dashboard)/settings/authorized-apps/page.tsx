import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import AuthorizedAppsPanel from "@/components/(gateway)/settings/authorized-apps/AuthorizedAppsPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

type OAuthAppMeta = {
	client_id: string;
	name: string | null;
	description: string | null;
	logo_url: string | null;
	homepage_url: string | null;
	status: string | null;
};

export const metadata = {
	title: "OAuth Integrations - Settings",
	description:
		"Manage third-party applications you have authorized to access your AI Stats account, review granted scopes, and revoke access when it is no longer needed.",
};

export default function AuthorizedAppsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="OAuth Integrations"
				meta={
					<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
						ALPHA
					</span>
				}
				description="Manage third-party applications that have access to your AI Stats account. You can revoke access at any time."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AuthorizedAppsContent />
			</Suspense>
		</div>
	);
}

async function AuthorizedAppsContent() {
	const supabase = await createClient();

	// Get current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	// If not authenticated, redirect to sign in
	if (userError || !user) {
		redirect("/sign-in");
	}

	// Fetch user authorizations directly from base tables (view removed)
	const { data: authorizations, error: authError } = await supabase
		.from("oauth_authorizations")
		.select("id, user_id, client_id, workspace_id, scopes, created_at, last_used_at")
		.eq("user_id", user.id)
		.is("revoked_at", null)
		.order("last_used_at", { ascending: false, nullsFirst: false });

	if (authError) {
		console.error("Error fetching authorized apps:", authError);
		return <AuthorizedAppsPanel authorizedApps={[]} userId={user.id} />;
	}

	const clientIds = Array.from(
		new Set((authorizations ?? []).map((row) => String(row.client_id ?? "").trim()).filter(Boolean)),
	);
	const workspaceIds = Array.from(
		new Set((authorizations ?? []).map((row) => String(row.workspace_id ?? "").trim()).filter(Boolean)),
	);

	const [appMetaResult, workspacesResult] = await Promise.all([
		clientIds.length
			? supabase
					.from("oauth_app_metadata")
					.select("client_id, name, description, logo_url, homepage_url, status")
					.in("client_id", clientIds)
			: Promise.resolve({ data: [], error: null } as any),
		workspaceIds.length
			? supabase
					.from("workspaces")
					.select("id, name")
					.in("id", workspaceIds)
			: Promise.resolve({ data: [], error: null } as any),
	]);

	if (appMetaResult.error) {
		console.error("Error fetching OAuth app metadata:", appMetaResult.error);
	}
	if (workspacesResult.error) {
		console.error("Error fetching workspaces for authorized apps:", workspacesResult.error);
	}

	const appMetaByClientId = new Map<string, OAuthAppMeta>(
		(appMetaResult.data ?? [])
			.filter((row: any) => row?.status === "active")
			.map((row: any) => [String(row.client_id ?? ""), row as OAuthAppMeta] as const),
	);
	const workspaceNameById = new Map(
		(workspacesResult.data ?? []).map((row: any) => [String(row.id ?? ""), String(row.name ?? "")] as const),
	);

	const authorizedApps = (authorizations ?? [])
		.map((row: any) => {
			const clientId = String(row.client_id ?? "");
			const appMeta = appMetaByClientId.get(clientId);
			if (!appMeta) return null;

			return {
				authorization_id: row.id,
				user_id: row.user_id,
				client_id: row.client_id,
				workspace_id: row.workspace_id,
				scopes: row.scopes ?? [],
				authorized_at: row.created_at,
				last_used_at: row.last_used_at,
				app_name: appMeta.name,
				app_description: appMeta.description,
				app_logo_url: appMeta.logo_url,
				app_homepage_url: appMeta.homepage_url,
				team_name: workspaceNameById.get(String(row.workspace_id ?? "")) ?? "Unknown workspace",
			};
		})
		.filter(Boolean);

	return (
		<AuthorizedAppsPanel authorizedApps={authorizedApps ?? []} userId={user.id} />
	);
}
