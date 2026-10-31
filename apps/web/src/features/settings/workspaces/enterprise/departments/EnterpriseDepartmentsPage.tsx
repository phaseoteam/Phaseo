import { getTranslations } from "@/i18n/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function getEnterpriseDepartmentsMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("enterpriseDepartments") };
}

export default function WorkspaceEnterpriseDepartmentsPage() {
	return <WorkspaceEnterpriseRoute mode="departments" />;
}
