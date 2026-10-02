import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";
import { connection } from "next/server";
import WorkspaceSettingsContent from "./WorkspaceSettingsContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teamSettings") };
}

export default async function Page() {
	await connection();
	return <WorkspaceSettingsContent canConfigureEnterprise={await enterpriseSelfServePreviewEnabled()} />;
}
