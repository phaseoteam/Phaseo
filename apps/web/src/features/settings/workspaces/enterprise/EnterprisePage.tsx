import { getTranslations } from "@/i18n/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function getEnterpriseMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("enterprise") };
}

export default function WorkspaceEnterprisePage() {
	return <WorkspaceEnterpriseRoute mode="overview" />;
}
