import { getTranslations } from "next-intl/server";
import WorkspaceEnterpriseRoute from "@/components/(gateway)/settings/teams/WorkspaceEnterpriseRoute";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("enterpriseDirectory") };
}

export default function WorkspaceEnterpriseDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <WorkspaceEnterpriseRoute mode="directory" searchParams={searchParams} />;
}
