import { getTranslations } from "@/i18n/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function getEnterpriseSsoMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("singleSignOn") };
}

export default function WorkspaceEnterpriseSsoPage() {
	return <WorkspaceEnterpriseRoute mode="sso" />;
}
