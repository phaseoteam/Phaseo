import { getTranslations } from "@/i18n/server";
import { redirect } from "@/lib/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teams") };
}

export default function TeamsPage() {
	redirect("/settings/workspaces/members");
}
