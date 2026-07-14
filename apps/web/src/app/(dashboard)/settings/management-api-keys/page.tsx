import { Suspense } from "react";
import CreateManagementKeyDialog from "@/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog";
import ManagementKeysPanel from "@/components/(gateway)/settings/management-api-keys/ManagementKeysPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
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

