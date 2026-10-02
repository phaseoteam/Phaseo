import PrivacyPageClient from "./PrivacyPageClient";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.privacy")} - ${t("headers.settings")}` };
}
export default function PrivacyPage() { return <PrivacyPageClient />; }
