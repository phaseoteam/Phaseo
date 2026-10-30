import { useSuspenseQuery } from "@tanstack/react-query";
import { settingsFlagQuery } from "../../settings.functions";
import WorkspaceSettingsContent from "./WorkspaceSettingsContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teamSettings") };
}

export default function Page() {
	const { data: canConfigureEnterprise } = useSuspenseQuery(settingsFlagQuery("enterpriseSelfServe"));
	return <WorkspaceSettingsContent canConfigureEnterprise={canConfigureEnterprise} />;
}
