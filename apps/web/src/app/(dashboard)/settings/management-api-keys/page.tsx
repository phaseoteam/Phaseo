import { Suspense } from "react";
import CreateManagementKeyDialog from "@/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog";
import ManagementKeysPanel from "@/components/(gateway)/settings/management-api-keys/ManagementKeysPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsManagementApiKeysInitialData } from "@/lib/fetchers/internal/fetchSettingsManagementApiKeysInitialData";

export const metadata = {
	title: "Management API Keys - Settings",
};

export default function ManagementApiKeysPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div>
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
	await searchParams;
	const initialData = await fetchSettingsManagementApiKeysInitialData();

	if (!initialData.workspace) {
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

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Management API Keys"
				meta={<Badge variant="outline">Beta</Badge>}
				description="Manage elevated keys for automated workspace and key management."
				actions={
					<CreateManagementKeyDialog
						currentUserId={initialData.currentUserId}
						currentWorkspaceId={initialData.workspace.id}
						workspaces={[initialData.workspace]}
					/>
				}
			/>
			<ManagementKeysPanel
				teamsWithKeys={initialData.teamsWithKeys}
				currentUserId={initialData.currentUserId}
			/>
		</div>
	);
}

