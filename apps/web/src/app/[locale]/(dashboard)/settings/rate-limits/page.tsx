import { getTranslations } from "@/i18n/server";
import RateLimitsContent from "./RateLimitsContent";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.rateLimits")} - ${t("headers.settings")}` };
}

export default function RateLimitsPage() { return <RateLimitsContent />; }
