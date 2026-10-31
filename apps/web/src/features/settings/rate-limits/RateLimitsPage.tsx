import { getTranslations } from "@/i18n/server";
import RateLimitsContent from "./RateLimitsContent";

export async function getRateLimitsMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.rateLimits")} - ${t("headers.settings")}` };
}

export default function RateLimitsPage() { return <RateLimitsContent />; }
