import { getTranslations } from "@/i18n/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function getEnterpriseScimMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("scimProvisioning") };
}

export default function WorkspaceEnterpriseScimPage() {
	return <WorkspaceEnterpriseRoute mode="scim" />;
}
