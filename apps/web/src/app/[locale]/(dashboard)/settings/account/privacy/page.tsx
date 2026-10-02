import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("accountPrivacy") };
}

export default function AccountPrivacyPage() {
	redirect("/settings/privacy");
}
