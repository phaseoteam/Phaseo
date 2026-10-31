import PrivacyPageClient from "./PrivacyPageClient";
import { getTranslations } from "@/i18n/server";
export async function getPrivacyMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.privacy")} - ${t("headers.settings")}` };
}
export default function PrivacyPage() { return <PrivacyPageClient />; }
