import { getTranslations } from "@/i18n/server";
import TrustedWorkloadsContent from "./TrustedWorkloadsContent";

export async function getTrustedWorkloadsMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.trustedWorkloads")} - ${t("headers.settings")}` };
}

export default function TrustedWorkloadsPage() { return <TrustedWorkloadsContent />; }
