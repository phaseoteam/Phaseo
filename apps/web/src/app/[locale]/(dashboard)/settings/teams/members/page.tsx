import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teamMembers") };
}

export default function TeamMembersPage() {
	redirect("/settings/workspaces/members");
}

