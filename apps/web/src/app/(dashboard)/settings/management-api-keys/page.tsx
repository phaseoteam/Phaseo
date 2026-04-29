import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import CreateManagementKeyDialog from "@/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog";
import ManagementKeysPanel from "@/components/(gateway)/settings/management-api-keys/ManagementKeysPanel";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata = {
	title: "Management API Keys - Settings",
};

export default function ManagementApiKeysPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-6">
			<Alert
				variant="destructive"
				className="border-amber-500 bg-amber-50 dark:bg-amber-950/30"
			>
				<ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
				<AlertTitle className="text-amber-800 dark:text-amber-300">
					Keep these keys extra secure
				</AlertTitle>
				<AlertDescription className="text-amber-700 dark:text-amber-400">
					Management API keys grant higher privileges to your account. They can
					create resources, manage workspaces, and access sensitive data. Never share
					these keys and rotate them immediately if compromised.
				</AlertDescription>
			</Alert>

			<Suspense fallback={<SettingsSectionFallback />}>
				<ManagementApiKeysContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function ManagementApiKeysContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;

	const {
		data: { user },
	} = await supabase.auth.getUser();
	const resolvedWorkspaceId = await getWorkspaceIdFromCookie();
	await searchParams;

	const activeWorkspaceId = String(resolvedWorkspaceId ?? "").trim();

	if (!activeWorkspaceId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Management API Keys"
					meta={<Badge variant="outline">Beta</Badge>}
					description="Manage elevated keys for automated workspace and key management."
				/>
				<Alert>
					<AlertTitle>No workspace selected</AlertTitle>
					<AlertDescription>
						Select a workspace in the header to view and manage its management API keys.
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	const [{ data: activeWorkspace }, { data: managementKeys }] = await Promise.all([
		readClient
			.from("workspaces")
			.select("id, name")
			.eq("id", activeWorkspaceId)
			.maybeSingle(),
		readClient
			.from("management_keys")
			.select("*")
			.eq("workspace_id", activeWorkspaceId)
			.order("created_at", { ascending: false }),
	]);

	const workspaceName = String((activeWorkspace as any)?.name ?? "").trim() || "Current Workspace";
	const teamsWithKeys = [
		{
			id: activeWorkspaceId,
			name: workspaceName,
			keys: (managementKeys ?? []).map((key: any) => ({ ...key })),
		},
	];

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Management API Keys"
				meta={<Badge variant="outline">Beta</Badge>}
				description="Manage elevated keys for automated workspace and key management."
				actions={
					<CreateManagementKeyDialog
						currentUserId={user?.id}
						currentWorkspaceId={activeWorkspaceId}
						workspaces={[{ id: activeWorkspaceId, name: workspaceName }]}
					/>
				}
			/>
			<ManagementKeysPanel
				teamsWithKeys={teamsWithKeys}
				currentUserId={user?.id}
			/>
		</div>
	);
}

