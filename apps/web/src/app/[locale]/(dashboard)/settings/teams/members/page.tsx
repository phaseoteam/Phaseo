import { getTranslations } from "@/i18n/server";
import { redirect } from "@/lib/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teamMembers") };
}

export default function TeamMembersPage() {
	redirect("/settings/workspaces/members");
}

