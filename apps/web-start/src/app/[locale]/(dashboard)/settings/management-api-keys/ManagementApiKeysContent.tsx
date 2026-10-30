"use client";
import { useTranslations } from "next-intl";
import CreateManagementKeyDialog from "@/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog";
import ManagementKeysPanel from "@/components/(gateway)/settings/management-api-keys/ManagementKeysPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsManagementApiKeysInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("management-api-keys", function ManagementApiKeysContent({ initialData }: { initialData: SettingsManagementApiKeysInitialData }) {
	const t = useTranslations("SettingsUI");

	if (!initialData.workspace) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title={t("headers.managementApiKeys")}
					meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
					description={t("headers.managementApiKeysDescription")}
				/>
				<Alert>
					<AlertTitle>{t("settingsPageCopy.managementKeysTitle")}</AlertTitle>
					<AlertDescription>
						{t("settingsPageCopy.managementKeysBody")}
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("headers.managementApiKeys")}
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
				description={t("headers.managementApiKeysDescription")}
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
});
