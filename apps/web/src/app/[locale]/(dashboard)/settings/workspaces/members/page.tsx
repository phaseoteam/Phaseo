import MembersContent from "./MembersContent";
import { getTranslations } from "@/i18n/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("teamMembers") };
}
export default function Page() { return <MembersContent />; }
