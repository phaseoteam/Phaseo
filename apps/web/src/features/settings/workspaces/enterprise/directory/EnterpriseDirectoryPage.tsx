import { getTranslations } from "@/i18n/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function getEnterpriseDirectoryMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("enterpriseDirectory") };
}

export default function WorkspaceEnterpriseDirectoryPage() {
	return <WorkspaceEnterpriseRoute mode="directory" />;
}
