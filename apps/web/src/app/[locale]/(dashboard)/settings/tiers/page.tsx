import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("tiers") };
}

export default function TiersPage() {
	redirect("/settings/credits");
}
