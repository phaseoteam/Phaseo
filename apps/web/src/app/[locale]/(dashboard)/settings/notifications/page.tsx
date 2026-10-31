import NotificationsContent from "./NotificationsContent";
import { getTranslations } from "@/i18n/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.notifications")} - ${t("headers.settings")}` };
}
export default function Page() { return <NotificationsContent />; }
