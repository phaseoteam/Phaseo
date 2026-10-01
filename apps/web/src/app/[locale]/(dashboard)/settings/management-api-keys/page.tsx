import { Suspense } from "react";
import CreateManagementKeyDialog from "@/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog";
import ManagementKeysPanel from "@/components/(gateway)/settings/management-api-keys/ManagementKeysPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsManagementApiKeysInitialData } from "@/lib/fetchers/internal/fetchSettingsManagementApiKeysInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: t("headers.managementApiKeys") + " - " + t("headers.settings") };
}

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
	const t = await getTranslations("SettingsUI");
	const initialData = await fetchSettingsManagementApiKeysInitialData();

	if (!initialData.workspace) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Management API Keys"
					titleKey="headers.managementApiKeys"
					meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
					description="Manage elevated keys for automated workspace and key management."
					descriptionKey="headers.managementApiKeysDescription"
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
				title="Management API Keys"
				titleKey="headers.managementApiKeys"
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
				description="Manage elevated keys for automated workspace and key management."
				descriptionKey="headers.managementApiKeysDescription"
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
