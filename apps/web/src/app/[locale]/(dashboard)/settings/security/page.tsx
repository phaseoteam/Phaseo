import { getTranslations } from "next-intl/server";
import SecurityContent from "./SecurityContent";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.security")} - ${t("headers.settings")}` };
}

export default function SecurityPage() { return <SecurityContent />; }
