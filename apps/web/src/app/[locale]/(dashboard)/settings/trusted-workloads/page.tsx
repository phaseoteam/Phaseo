import { getTranslations } from "next-intl/server";
import TrustedWorkloadsContent from "./TrustedWorkloadsContent";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.trustedWorkloads")} - ${t("headers.settings")}` };
}

export default function TrustedWorkloadsPage() { return <TrustedWorkloadsContent />; }
