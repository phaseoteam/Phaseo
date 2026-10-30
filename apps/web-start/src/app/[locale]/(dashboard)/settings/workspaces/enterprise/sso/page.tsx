import { getTranslations } from "next-intl/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("singleSignOn") };
}

export default function WorkspaceEnterpriseSsoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <WorkspaceEnterpriseRoute mode="sso" searchParams={searchParams} />;
}
