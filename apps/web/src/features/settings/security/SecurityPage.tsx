import { getTranslations } from "@/i18n/server";
import SecurityContent from "./SecurityContent";

export async function getSecurityMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.security")} - ${t("headers.settings")}` };
}

export default function SecurityPage() { return <SecurityContent />; }
